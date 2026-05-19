/**
 * Daily Refresh — fetch AA, derive params, write data/models.json.
 *
 * Spec: docs/architecture.md §4, docs/data-sources.md §1–§4.
 *
 * Required env: AA_API_KEY (Insights Platform, free tier 1k req/day).
 *
 * Param-extraction strategy (incremental, no HF dependency at first):
 *   1) Hand-curated overrides in data/manual_params.json (AA slug → params).
 *   2) Parse "<N>B" / "<N>B A<M>B" from the AA name.
 *   3) Otherwise: open model with unknown params (logged, scatter-omitted)
 *      or closed model (anchor-only, params not needed).
 *
 * Closed classification: by creator slug + name pattern. We do not yet
 * call the HF API; that's an MVP+ task once alias maintenance is needed.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeParetoFrontier } from "../src/lib/pareto";
import { METRICS } from "../src/lib/metrics";
import type { MetricId, ModelRecord, ModelsSnapshot } from "../src/lib/models";

const ROOT = resolve(import.meta.dirname, "..");
const DATA = (p: string) => resolve(ROOT, "data", p);

interface AAEntry {
  id: string;
  name: string;
  slug: string;
  release_date: string | null;
  model_creator: { id: string; name: string; slug: string };
  evaluations: Record<string, number | null>;
  pricing: {
    price_1m_blended_3_to_1: number | null;
    price_1m_input_tokens: number | null;
    price_1m_output_tokens: number | null;
  };
  median_output_tokens_per_second: number | null;
  median_time_to_first_token_seconds: number | null;
}

interface AAResponse {
  status: number;
  data: AAEntry[];
}

interface ManualParams {
  total: number;
  active: number;
}

const CLOSED_CREATORS = new Set([
  "anthropic",
  "xai",
  "ai21-labs",
  "cohere",
  "perplexity",
  "mbzuai",
  "inception",
  "baidu",
  "sarvam",
  "reka-ai",
  "kwaikat",
  "korea-telecom",
  "china-mobile",
  "longcat",
  "aws",
  "azure",
  "openchat",
]);

function isClosed(m: AAEntry): boolean {
  const cs = m.model_creator.slug;
  const lname = m.name.toLowerCase();
  if (CLOSED_CREATORS.has(cs)) return true;
  if (cs === "openai" && !lname.includes("gpt-oss")) return true;
  if (cs === "google" && !lname.includes("gemma")) return true;
  return false;
}

function parseParamsFromName(name: string): { total: number; active: number } | null {
  // Match the LAST "<X>B" optionally followed by " A<Y>B" in the name.
  // Examples:
  //   "Llama 3.3 Instruct 70B" → total=70B active=70B (dense)
  //   "Qwen3 235B A22B" → total=235B active=22B (MoE)
  //   "Gemma 4 26B A4B (Non-reasoning)" → total=26B active=4B
  const re = /(\d+(?:\.\d+)?)\s*B\b(?:\s*A\s*(\d+(?:\.\d+)?)\s*B\b)?/gi;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(name)) !== null) last = m;
  if (!last) return null;
  const total = parseFloat(last[1]) * 1e9;
  const active = last[2] ? parseFloat(last[2]) * 1e9 : total;
  return { total, active };
}

function extractMode(name: string): string | null {
  const m = name.match(/\(([^)]+)\)/);
  return m ? m[1] : null;
}

async function fetchAA(apiKey: string): Promise<AAResponse> {
  const res = await fetch("https://artificialanalysis.ai/api/v2/data/llms/models", {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`AA fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<AAResponse>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

async function main(): Promise<void> {
  const apiKey = process.env.AA_API_KEY;
  if (!apiKey) {
    console.error("AA_API_KEY env var is required.");
    process.exit(1);
  }

  console.error("Fetching AA …");
  const aa = await fetchAA(apiKey);
  console.error(`  → ${aa.data.length} entries`);

  const manualRaw = readJson<Record<string, ManualParams | string | object>>(DATA("manual_params.json"));
  const manual: Record<string, ManualParams> = {};
  for (const [k, v] of Object.entries(manualRaw)) {
    if (k.startsWith("_")) continue;
    if (typeof v === "object" && v !== null && "total" in v && "active" in v) {
      manual[k] = v as ManualParams;
    }
  }
  console.error(`  → ${Object.keys(manual).length} manual param entries`);

  const models: ModelRecord[] = [];
  const missing: string[] = [];

  for (const m of aa.data) {
    const closed = isClosed(m);
    const manualP = manual[m.slug];
    const parsedP = manualP ?? parseParamsFromName(m.name);
    const params = parsedP ?? { total: null, active: null };

    if (!closed && parsedP === null) {
      missing.push(m.slug);
    }

    const scores: Partial<Record<MetricId, number | null>> = {};
    for (const metric of METRICS) {
      const v = m.evaluations[metric.id];
      scores[metric.id] = typeof v === "number" ? v : null;
    }

    models.push({
      id: m.id,
      slug: m.slug,
      name: m.name,
      creator: m.model_creator.name,
      creatorSlug: m.model_creator.slug,
      isClosed: closed,
      params: {
        total: params.total ?? null,
        active: params.active ?? null,
      },
      license: null,
      scores,
      pricing: m.pricing,
      speed: {
        tps: m.median_output_tokens_per_second,
        ttft: m.median_time_to_first_token_seconds,
      },
      hfId: null,
      mode: extractMode(m.name),
      releaseDate: m.release_date,
    });
  }

  // Pre-compute the Pareto frontier (open models) on BOTH X-axes per metric.
  // The UI exposes "Active", "Total", and "Compare" — Total mode in particular
  // needs its own frontier because a dense small model (e.g. Qwen3.5 4B) sits
  // on the total-axis frontier even when it's dominated by a small-active
  // MoE on the active-axis frontier.
  const openActive = models.filter((x) => !x.isClosed && x.params.active != null);
  const openTotal = models.filter((x) => !x.isClosed && x.params.total != null);
  const paretoByMetric: Partial<Record<MetricId, { active: string[]; total: string[] }>> = {};
  for (const metric of METRICS) {
    const fActive = computeParetoFrontier(
      openActive,
      (m) => m.params.active,
      (m) => m.scores[metric.id] ?? null,
    );
    const fTotal = computeParetoFrontier(
      openTotal,
      (m) => m.params.total,
      (m) => m.scores[metric.id] ?? null,
    );
    paretoByMetric[metric.id] = {
      active: fActive.map((m) => m.id),
      total: fTotal.map((m) => m.id),
    };
  }

  const out: ModelsSnapshot = {
    generatedAt: new Date().toISOString(),
    models,
    paretoByMetric,
  };

  writeFileSync(DATA("models.json"), JSON.stringify(out, null, 2) + "\n");
  console.error(`Wrote ${models.length} models to data/models.json`);
  console.error(`  open w/ active: ${openActive.length}, open w/ total: ${openTotal.length}, closed: ${models.filter((m) => m.isClosed).length}`);
  if (missing.length > 0) {
    console.error(
      `  ${missing.length} open models without extractable params (skipped from scatter):`,
    );
    for (const slug of missing) console.error(`    - ${slug}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
