/**
 * Daily Refresh — fetch AA, derive params, write data/models.json.
 *
 * Spec: docs/architecture.md §4, docs/data-sources.md §1–§4.
 *
 * Required env: AA_API_KEY (Insights Platform, free tier 1k req/day).
 *
 * Param-resolution strategy (resolveParams, see docs/data-sources.md §2):
 *   1) Hand-curated overrides in data/manual_params.json (AA slug → params).
 *   2) Real AA parameters from the language/models endpoint.
 *   3) HuggingFace safetensors.total + config.json (data/hf_aliases.json for
 *      the repo, data/moe_overrides.json for active when the config-based
 *      MoE estimate can't be computed).
 *   4) Otherwise: open model with unknown params (logged, scatter-omitted)
 *      or closed model (anchor-only, params not needed).
 *
 * There is deliberately no name-parsing step: an AA display name like
 * "Gemma 4 E2B" or "Mixtral 8x7B" encodes a marketing size, not the true
 * total/active split, and no regex can reliably tell a trustworthy "<N>B"
 * from a misleading one.
 *
 * Closed classification: by creator slug + name pattern.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeParetoFrontier } from "../src/lib/pareto";
import { METRICS } from "../src/lib/metrics";
import type { MetricId, ModelRecord, ModelsSnapshot } from "../src/lib/models";

const ROOT = resolve(import.meta.dirname, "..");
const DATA = (p: string) => resolve(ROOT, "data", p);

export interface AAEntry {
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

export interface ManualParams {
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

function extractMode(name: string): string | null {
  const m = name.match(/\(([^)]+)\)/);
  return m ? m[1] : null;
}

async function fetchAA(apiKey: string): Promise<AAResponse> {
  const res = await fetch(
    "https://artificialanalysis.ai/api/v2/data/llms/models",
    {
      headers: { "x-api-key": apiKey },
    },
  );
  if (!res.ok) {
    throw new Error(`AA fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<AAResponse>;
}

/**
 * Fetch real total/active parameter counts from AA's Data API
 * (`/api/v2/language/models`). This is a *different* endpoint from the
 * benchmark feed above: it carries "model identity" (params, context, license)
 * and, per AA's tier table, that identity data is available on the free tier.
 * The benchmark endpoint we rely on for scores/pricing does not expose params,
 * which is why flagship MoE models whose names omit the size (GLM 5.2,
 * MiniMax-M3, DeepSeek V4 Pro, …) otherwise fall off the scatter entirely.
 *
 * Best-effort: any failure (endpoint gated, renamed, offline) returns an empty
 * map and the caller falls back to name-parse / manual overrides, so the daily
 * refresh never breaks on it. Keyed by AA `slug` to join with the benchmark
 * feed. Values are normalised to absolute counts (AA may report either
 * billions like `22` or absolute like `22000000000`).
 */
async function fetchAAParameters(
  apiKey: string,
): Promise<Map<string, { total: number | null; active: number | null }>> {
  const map = new Map<
    string,
    { total: number | null; active: number | null }
  >();
  const norm = (v: unknown): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
    // Anything under a million can't be an absolute param count — it's the
    // "in billions" notation (e.g. 22, 4.4) — so scale it up.
    return v < 1e6 ? v * 1e9 : v;
  };
  try {
    const res = await fetch(
      "https://artificialanalysis.ai/api/v2/language/models",
      {
        headers: { "x-api-key": apiKey },
      },
    );
    if (!res.ok) {
      console.error(
        `[params] language/models ${res.status} ${res.statusText} — falling back to name/manual`,
      );
      return map;
    }
    const json = (await res.json()) as { data?: unknown };
    const data = Array.isArray(json.data) ? json.data : [];
    for (const raw of data) {
      const m = raw as {
        slug?: string;
        parameters?: { total?: unknown; active?: unknown };
      };
      if (typeof m.slug !== "string" || !m.parameters) continue;
      const total = norm(m.parameters.total);
      const active = norm(m.parameters.active);
      if (total != null || active != null) {
        map.set(m.slug, { total: total ?? active, active: active ?? total });
      }
    }
    console.error(
      `[params] language/models: ${map.size} models carry parameter counts`,
    );
  } catch (err) {
    console.error(
      `[params] language/models fetch failed (${(err as Error).message}) — falling back to name/manual`,
    );
  }
  return map;
}

// ─── HuggingFace parameter lookup ─────────────────────────────────────────
//
// AA supplies no param counts on the free tier, so for open models whose name
// doesn't encode a size we resolve the official HF repo and read the real
// `safetensors.total`. Active (MoE) params come from `moe_overrides.json`, else
// a config-based estimate, else fall back to total (dense). Original design:
// docs/architecture.md §4, docs/data-sources.md §2.

/** AA creator slug → allowed HF org(s). Constrains repo resolution so a search
 *  can't wander onto a same-named model from a different creator. */
export const HF_ORGS_BY_CREATOR: Record<string, string[]> = {
  deepseek: ["deepseek-ai"],
  mistral: ["mistralai"],
  zai: ["zai-org", "THUDM"],
  alibaba: ["Qwen"],
  xiaomi: ["XiaomiMiMo"],
  minimax: ["MiniMaxAI"],
  kimi: ["moonshotai"],
  upstage: ["upstage"],
  inclusionai: ["inclusionAI"],
  stepfun: ["stepfun-ai"],
  ibm: ["ibm-granite"],
  lg: ["LGAI-EXAONE"],
  tencent: ["tencent"],
  meta: ["meta-llama"],
  "prime-intellect": ["PrimeIntellect"],
  arcee: ["arcee-ai"],
  bytedance_seed: ["ByteDance-Seed"],
  databricks: ["databricks"],
  snowflake: ["Snowflake"],
  nvidia: ["nvidia"],
  google: ["google"],
  openai: ["openai"],
  "tii-uae": ["tiiuae"],
  liquidai: ["LiquidAI"],
  ai2: ["allenai"],
  "nous-research": ["NousResearch"],
  multiversecomputing: ["MultiverseComputingCAI"],
  "motif-technologies": ["Motif-Technologies"],
  naver: ["naver-hyperclovax"],
  trillionlabs: ["trillionlabs"],
  nanbeige: ["Nanbeige"],
  "swiss-ai-initiative": ["swiss-ai"],
  openbmb: ["openbmb"],
  servicenow: ["ServiceNow-AI"],
};

/** Proprietary, API-only families whose parameter counts are never published —
 *  we mark these "unknown" rather than hide them or guess. */
function hasUndisclosedParams(m: AAEntry): boolean {
  const n = m.name.toLowerCase();
  // Alibaba's Qwen "Max"/"Turbo" tiers are closed-weight; params undisclosed.
  if (m.model_creator.slug === "alibaba" && /\b(max|turbo)\b/.test(n))
    return true;
  return false;
}

function cleanModelName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/g, "").trim();
}

const HF_HEADERS = (token?: string): Record<string, string> | undefined =>
  token ? { authorization: `Bearer ${token}` } : undefined;

interface HfConfig {
  text_config?: HfConfig;
  hidden_size?: number;
  num_hidden_layers?: number;
  num_experts_per_tok?: number;
  n_shared_experts?: number;
  num_shared_experts?: number;
  moe_intermediate_size?: number;
  shared_intermediate_size?: number;
  intermediate_size?: number;
  first_k_dense_replace?: number;
  vocab_size?: number;
}

/**
 * Estimate MoE active params from an HF config. Multimodal models nest the LLM
 * config under `text_config`. Returns null for dense models (no expert routing)
 * or when key fields are missing — the caller then uses `safetensors.total`.
 *
 * Approximation (good to ~±15%, which is well under a tick on the log X axis):
 *   embeddings + Σ_layers[ 4·H² attention ] + Σ_moe_layers[ (K+shared)·3·H·moe_int ]
 *   + Σ_dense_layers[ 3·H·intermediate ]
 * Attention is taken as a plain 4·H² (GQA/MLA compression is ignored — small on
 * a log axis). `moe_overrides.json` supplies exact values where this is off.
 */
function computeActiveParams(cfg: HfConfig | null): number | null {
  const t = cfg?.text_config ?? cfg;
  if (!t) return null;
  const H = t.hidden_size;
  const L = t.num_hidden_layers;
  const K = t.num_experts_per_tok;
  const moeInt = t.moe_intermediate_size ?? t.shared_intermediate_size;
  if (!H || !L || !K || !moeInt) return null; // dense or insufficient → use total
  const shared = t.n_shared_experts ?? t.num_shared_experts ?? 0;
  const denseInt = t.intermediate_size ?? moeInt;
  const denseLayers = Math.min(L, t.first_k_dense_replace ?? 0);
  const moeLayers = Math.max(0, L - denseLayers);
  const emb = t.vocab_size ? t.vocab_size * H : 0;
  const attn = L * 4 * H * H;
  const moeFFN = moeLayers * (K + shared) * 3 * H * moeInt;
  const denseFFN = denseLayers * 3 * H * denseInt;
  const active = emb + attn + moeFFN + denseFFN;
  return active > 0 ? active : null;
}

async function fetchHfTotal(
  repo: string,
  token?: string,
): Promise<number | null> {
  const res = await fetchWithTimeout(
    `https://huggingface.co/api/models/${repo}`,
    8000,
    HF_HEADERS(token),
  );
  if (!res || !res.ok) return null;
  const j = (await res.json()) as { safetensors?: { total?: unknown } };
  const total = j.safetensors?.total;
  return typeof total === "number" && Number.isFinite(total) && total > 0
    ? total
    : null;
}

async function fetchHfConfig(
  repo: string,
  token?: string,
): Promise<HfConfig | null> {
  const res = await fetchWithTimeout(
    `https://huggingface.co/${repo}/raw/main/config.json`,
    8000,
    HF_HEADERS(token),
  );
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as HfConfig;
  } catch {
    return null;
  }
}

/**
 * Resolve the official HF repo for an AA model: try canonical `<org>/<name>`
 * candidates first (cheap, exact), then a creator-org-constrained search. A
 * repo counts only if it actually carries `safetensors.total`. Returns null
 * when nothing verifiable is found (logged for a manual alias later).
 */
async function resolveHfRepo(
  m: AAEntry,
  token?: string,
): Promise<string | null> {
  const orgs = HF_ORGS_BY_CREATOR[m.model_creator.slug];
  if (!orgs) return null; // no trusted org for this creator — don't guess
  const clean = cleanModelName(m.name);
  const variants = [clean.replace(/\s+/g, "-"), clean.replace(/\s+/g, "")];
  for (const org of orgs) {
    for (const v of variants) {
      if (await fetchHfTotal(`${org}/${v}`, token)) return `${org}/${v}`;
    }
  }
  const res = await fetchWithTimeout(
    `https://huggingface.co/api/models?search=${encodeURIComponent(clean)}&limit=20`,
    8000,
    HF_HEADERS(token),
  );
  if (!res || !res.ok) return null;
  const repos = (await res.json()) as { modelId: string }[];
  if (!Array.isArray(repos)) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(clean);
  const cands = repos
    .filter((r) => orgs.includes(r.modelId.split("/")[0]))
    .sort((a, b) => {
      const am = norm(a.modelId.split("/")[1] ?? "") === target ? 0 : 1;
      const bm = norm(b.modelId.split("/")[1] ?? "") === target ? 0 : 1;
      return am - bm;
    });
  for (const r of cands.slice(0, 5)) {
    if (await fetchHfTotal(r.modelId, token)) return r.modelId;
  }
  return null;
}

export interface ResolveParamsResult {
  resolved: ManualParams | null;
  hfRepo: string | null;
  paramsUnknown: boolean;
  /** True iff `resolved` came from a live HF safetensors/config fetch. */
  viaHf: boolean;
}

/**
 * Resolve total/active params for one AA entry.
 *
 * Precedence: hand-curated override (data/manual_params.json) → real AA
 * parameters (language/models endpoint) → HuggingFace safetensors + config
 * (data/hf_aliases.json, data/moe_overrides.json). There is deliberately no
 * name-parsing step: an AA display name like "Gemma 4 E2B" or "Mixtral 8x7B"
 * encodes a marketing size, not the true total/active split, and a regex can't
 * tell a trustworthy "<N>B" from a misleading one — see docs/data-sources.md §2.
 * `aliases` is mutated in place (hit or miss cached) so repeat runs skip the
 * HF repo search.
 */
export async function resolveParams(
  m: AAEntry,
  closed: boolean,
  manual: Record<string, ManualParams>,
  apiParams: Map<string, { total: number | null; active: number | null }>,
  aliases: Record<string, string | null>,
  moeOverrides: Record<string, { active: number }>,
  hfToken?: string,
): Promise<ResolveParamsResult> {
  const manualP = manual[m.slug];
  const apiP = apiParams.get(m.slug);
  const apiPair =
    apiP && (apiP.total != null || apiP.active != null)
      ? {
          total: apiP.total ?? apiP.active!,
          active: apiP.active ?? apiP.total!,
        }
      : null;
  let resolved: ManualParams | null = manualP ?? apiPair ?? null;
  let paramsUnknown = false;
  let hfRepo: string | null = null;
  let viaHf = false;

  if (!closed && resolved === null) {
    if (hasUndisclosedParams(m)) {
      // Proprietary/API-only family — mark explicitly rather than guess.
      paramsUnknown = true;
    } else {
      // Resolve the official HF repo (cached) and read real params.
      if (m.slug in aliases) {
        hfRepo = aliases[m.slug];
      } else {
        hfRepo = await resolveHfRepo(m, hfToken);
        aliases[m.slug] = hfRepo; // cache hit or miss
      }
      if (hfRepo) {
        const total = await fetchHfTotal(hfRepo, hfToken);
        if (total) {
          const cfg = await fetchHfConfig(hfRepo, hfToken);
          const active =
            moeOverrides[hfRepo]?.active ?? computeActiveParams(cfg) ?? total;
          resolved = { total, active };
          viaHf = true;
        }
      }
    }
  }

  return { resolved, hfRepo, paramsUnknown, viaHf };
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

async function fetchWithTimeout(
  url: string,
  ms = 8000,
  headers?: Record<string, string>,
): Promise<Response | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers });
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

  console.error("Fetching AA parameters (language/models) …");
  const apiParams = await fetchAAParameters(apiKey);

  const manualRaw = readJson<Record<string, ManualParams | string | object>>(
    DATA("manual_params.json"),
  );
  const manual: Record<string, ManualParams> = {};
  for (const [k, v] of Object.entries(manualRaw)) {
    if (k.startsWith("_")) continue;
    if (typeof v === "object" && v !== null && "total" in v && "active" in v) {
      manual[k] = v as ManualParams;
    }
  }
  console.error(`  → ${Object.keys(manual).length} manual param entries`);

  const hfToken = process.env.HF_API_TOKEN;
  console.error(
    hfToken
      ? "  → HF_API_TOKEN present"
      : "  → HF_API_TOKEN missing (unauthenticated HF)",
  );

  // Alias cache (AA slug → HF repo | null). Hand entries + resolved entries are
  // persisted so subsequent runs skip the search. `_comment`/`_examples` kept.
  const aliasRaw = readJson<Record<string, unknown>>(DATA("hf_aliases.json"));
  const aliasComment =
    typeof aliasRaw._comment === "string" ? aliasRaw._comment : undefined;
  const aliasExamples = aliasRaw._examples;
  const aliases: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(aliasRaw)) {
    if (k.startsWith("_")) continue;
    if (typeof v === "string" || v === null) aliases[k] = v;
  }

  // MoE active overrides (HF repo → { active }).
  const moeRaw = readJson<Record<string, unknown>>(DATA("moe_overrides.json"));
  const moeOverrides: Record<string, { active: number }> = {};
  for (const [k, v] of Object.entries(moeRaw)) {
    if (k.startsWith("_")) continue;
    if (
      typeof v === "object" &&
      v !== null &&
      "active" in v &&
      typeof (v as { active: unknown }).active === "number"
    ) {
      moeOverrides[k] = v as { active: number };
    }
  }

  const models: ModelRecord[] = [];
  const missing: string[] = [];
  let hfHits = 0;

  for (const m of aa.data) {
    const closed = isClosed(m);
    const { resolved, hfRepo, paramsUnknown, viaHf } = await resolveParams(
      m,
      closed,
      manual,
      apiParams,
      aliases,
      moeOverrides,
      hfToken,
    );
    if (viaHf && resolved) {
      hfHits++;
      console.error(
        `  → HF ${m.slug}: total=${(resolved.total / 1e9).toFixed(1)}B active=${(resolved.active / 1e9).toFixed(1)}B (${hfRepo})`,
      );
    }

    const params = resolved ?? { total: null, active: null };
    if (!closed && resolved === null && !paramsUnknown) {
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
      paramsUnknown,
      license: null,
      scores,
      pricing: m.pricing,
      speed: {
        tps: m.median_output_tokens_per_second,
        ttft: m.median_time_to_first_token_seconds,
      },
      hfId: hfRepo,
      mode: extractMode(m.name),
      releaseDate: m.release_date,
    });
  }
  console.error(`HF param gap-fill: ${hfHits} models resolved`);

  // Persist the alias cache (stable key order for clean diffs).
  const aliasOut: Record<string, unknown> = {};
  if (aliasComment) aliasOut._comment = aliasComment;
  if (aliasExamples !== undefined) aliasOut._examples = aliasExamples;
  for (const k of Object.keys(aliases).sort()) aliasOut[k] = aliases[k];
  writeFileSync(
    DATA("hf_aliases.json"),
    JSON.stringify(aliasOut, null, 2) + "\n",
  );

  // Pre-compute the Pareto frontier (open models) on BOTH X-axes per metric.
  // The UI exposes "Active", "Total", and "Compare" — Total mode in particular
  // needs its own frontier because a dense small model (e.g. Qwen3.5 4B) sits
  // on the total-axis frontier even when it's dominated by a small-active
  // MoE on the active-axis frontier.
  const openActive = models.filter(
    (x) => !x.isClosed && x.params.active != null,
  );
  const openTotal = models.filter((x) => !x.isClosed && x.params.total != null);
  const paretoByMetric: Partial<
    Record<MetricId, { active: string[]; total: string[] }>
  > = {};
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
  const ggufComment =
    typeof ggufRaw._comment === "string" ? ggufRaw._comment : undefined;
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
  console.error(
    `Pareto frontier union: ${frontierModels.length} unique models`,
  );

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
  console.error(
    `  open w/ active: ${openActive.length}, open w/ total: ${openTotal.length}, closed: ${models.filter((m) => m.isClosed).length}`,
  );
  if (missing.length > 0) {
    console.error(
      `  ${missing.length} open models without extractable params (skipped from scatter):`,
    );
    for (const slug of missing) console.error(`    - ${slug}`);
  }
}

// Only run the full refresh (which requires AA_API_KEY + network) when this
// file is executed directly, not when imported for its pure helpers such as
// resolveParams (e.g. by tests or a deterministic regeneration script).
const invokedDirectly =
  process.argv[1] != null && resolve(process.argv[1]) === import.meta.filename;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
