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

const PARAM_UNIT: Record<string, number> = { t: 1e12, b: 1e9, m: 1e6 };

export function parseParamsFromName(name: string): { total: number; active: number } | null {
  // Match the LAST "<X>{T,B,M}" optionally followed by " A<Y>{T,B,M}".
  // Unit suffix: T = 1e12 (trillions), B = 1e9 (billions), M = 1e6 (millions).
  // Both ends of the size range parse to null without their unit branch and so
  // drop off the scatter entirely: the top tier of open weights now reaches
  // ~1T total (e.g. "Ling-1T", "Ring-1T") while the smallest dense models state
  // their size in millions (e.g. "Gemma 3 270M", "Granite 4.0 350M").
  // Examples:
  //   "Llama 3.3 Instruct 70B" → total=70B active=70B (dense)
  //   "Qwen3 235B A22B" → total=235B active=22B (MoE)
  //   "Gemma 4 26B A4B (Non-reasoning)" → total=26B active=4B
  //   "Ling-1T" → total=1T active=1T (name carries no active; MoE active can be
  //               refined via data/manual_params.json, which takes precedence)
  //   "Gemma 3 270M" → total=270M active=270M (dense)
  const re = /(\d+(?:\.\d+)?)\s*([TBM])\b(?:\s*A\s*(\d+(?:\.\d+)?)\s*([TBM])\b)?/gi;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(name)) !== null) last = m;
  if (!last) return null;
  const total = parseFloat(last[1]) * PARAM_UNIT[last[2].toLowerCase()];
  const active = last[3] ? parseFloat(last[3]) * PARAM_UNIT[last[4].toLowerCase()] : total;
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

// ─── GGUF Q4_K_M lookup on HuggingFace ────────────────────────────────────

interface GgufEntry {
  bytes: number | null;
  source: "hf" | "manual" | "not-found";
  repo?: string;
  fetchedAt?: string;
}

const TRUSTED_GGUF_UPLOADERS = [
  "bartowski",
  "unsloth",
  "lmstudio-community",
  "MaziyarPanahi",
  "mradermacher",
];

async function fetchWithTimeout(url: string, ms = 8000): Promise<Response | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Best-effort search HF Hub for a GGUF repo holding a Q4_K_M file.
 *
 * Sanity check: HF search is fuzzy ("DeepSeek R1" surfaces both the real
 * 671B model and 8B distills of it). When the measured size lands outside
 * [0.4×, 2.5×] of the formula estimate from total params, treat the
 * candidate as a mismatch (almost always a smaller distill picked because
 * the original creator didn't upload a Q4_K_M) and try the next candidate.
 *
 * Returns the summed shard size and the matched repo on success, null on miss.
 */
async function findGgufQ4KM(
  modelName: string,
  expectedBytes: number | null,
): Promise<{ bytes: number; repo: string } | null> {
  const cleaned = modelName.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  const searchUrl = `https://huggingface.co/api/models?search=${encodeURIComponent(
    cleaned + " GGUF",
  )}&limit=20`;
  const res = await fetchWithTimeout(searchUrl);
  if (!res || !res.ok) return null;
  const repos = (await res.json()) as { modelId: string; downloads?: number }[];
  if (!Array.isArray(repos) || repos.length === 0) return null;

  // Prefer trusted uploaders, then break ties by repo download count.
  const ranked = [...repos].sort((a, b) => {
    const oa = a.modelId.split("/")[0];
    const ob = b.modelId.split("/")[0];
    const ai = TRUSTED_GGUF_UPLOADERS.indexOf(oa);
    const bi = TRUSTED_GGUF_UPLOADERS.indexOf(ob);
    const ar = ai === -1 ? 999 : ai;
    const br = bi === -1 ? 999 : bi;
    if (ar !== br) return ar - br;
    return (b.downloads ?? 0) - (a.downloads ?? 0);
  });

  for (const r of ranked.slice(0, 6)) {
    const treeRes = await fetchWithTimeout(
      `https://huggingface.co/api/models/${r.modelId}/tree/main`,
    );
    if (!treeRes || !treeRes.ok) continue;
    const files = (await treeRes.json()) as {
      path: string;
      size?: number;
      type?: string;
    }[];
    if (!Array.isArray(files)) continue;
    const q4 = files.filter(
      (f) =>
        f.type !== "directory" &&
        /Q4_K_M/i.test(f.path) &&
        f.path.toLowerCase().endsWith(".gguf"),
    );
    if (q4.length === 0) continue;
    const bytes = q4.reduce((sum, f) => sum + (f.size ?? 0), 0);
    if (bytes <= 0) continue;
    // Reject candidates whose Q4_K_M is far smaller / larger than the
    // formula expects — almost always a distill or unrelated model that
    // happened to share part of the name.
    if (expectedBytes != null && expectedBytes > 0) {
      const ratio = bytes / expectedBytes;
      // [0.3, 3.5] catches distills (typically <0.1) and unrelated repos
      // (often <0.05) while keeping legitimate architectural quirks like
      // Gemma's "E2B" effective-params embedding-bloat case.
      if (ratio < 0.3 || ratio > 3.5) continue;
    }
    return { bytes, repo: r.modelId };
  }
  return null;
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

  // GGUF Q4_K_M lookup — bounded to the Pareto frontier union across all
  // metrics × both axes (~50 unique models). Existing entries are kept as-is
  // per user guidance ("既にあるものは更新しない"); only missing slugs are
  // fetched. `bytes: null` means we looked up and didn't find a community
  // Q4_K_M upload yet; the entry sticks until manually cleared.
  const ggufPath = DATA("gguf_sizes.json");
  const ggufRaw = readJson<Record<string, GgufEntry | string>>(ggufPath);
  const ggufEntries: Record<string, GgufEntry> = {};
  const ggufComment = typeof ggufRaw._comment === "string" ? ggufRaw._comment : undefined;
  for (const [k, v] of Object.entries(ggufRaw)) {
    if (k.startsWith("_")) continue;
    if (typeof v === "object" && v !== null && "bytes" in v && "source" in v) {
      ggufEntries[k] = v as GgufEntry;
    }
  }

  const frontierIds = new Set<string>();
  for (const f of Object.values(paretoByMetric)) {
    if (!f) continue;
    for (const id of f.active) frontierIds.add(id);
    for (const id of f.total) frontierIds.add(id);
  }
  const frontierModels = models.filter((m) => frontierIds.has(m.id));
  console.error(`Pareto frontier union: ${frontierModels.length} unique models`);

  let fetchedCount = 0;
  let foundCount = 0;
  for (const m of frontierModels) {
    if (ggufEntries[m.slug]) continue; // skip cached entries (including not-found)
    console.error(`  → GGUF lookup: ${m.slug} (${m.name})`);
    // 0.6 bytes/param matches the formula estimate in src/lib/quant.ts.
    const expectedBytes =
      m.params.total != null && Number.isFinite(m.params.total)
        ? m.params.total * 0.6
        : null;
    const hit = await findGgufQ4KM(m.name, expectedBytes);
    fetchedCount++;
    if (hit) {
      ggufEntries[m.slug] = {
        bytes: hit.bytes,
        source: "hf",
        repo: hit.repo,
        fetchedAt: new Date().toISOString(),
      };
      foundCount++;
      console.error(`     ${(hit.bytes / 1e9).toFixed(1)} GB · ${hit.repo}`);
    } else {
      ggufEntries[m.slug] = {
        bytes: null,
        source: "not-found",
        fetchedAt: new Date().toISOString(),
      };
      console.error(`     no community Q4_K_M found`);
    }
    // Be polite to HF Hub.
    await new Promise((r) => setTimeout(r, 200));
  }
  if (fetchedCount > 0) {
    console.error(`GGUF: ${fetchedCount} new lookups, ${foundCount} hits`);
  } else {
    console.error("GGUF: all frontier slugs already cached");
  }

  const ggufOut: Record<string, unknown> = {};
  if (ggufComment) ggufOut._comment = ggufComment;
  // Sort keys for stable diffs.
  for (const k of Object.keys(ggufEntries).sort()) ggufOut[k] = ggufEntries[k];
  writeFileSync(ggufPath, JSON.stringify(ggufOut, null, 2) + "\n");

  const ggufSizes: Record<string, number | null> = {};
  for (const [slug, entry] of Object.entries(ggufEntries)) {
    ggufSizes[slug] = entry.bytes;
  }

  const out: ModelsSnapshot = {
    generatedAt: new Date().toISOString(),
    models,
    paretoByMetric,
    ggufSizes,
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

// Only run the full refresh (which requires AA_API_KEY + network) when this
// file is executed directly, not when imported for its pure helpers such as
// parseParamsFromName (e.g. by a deterministic regeneration script).
const invokedDirectly =
  process.argv[1] != null && resolve(process.argv[1]) === import.meta.filename;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
