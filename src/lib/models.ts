/**
 * Model data types and loader.
 * Output shape spec: docs/architecture.md §4.
 * Field provenance: docs/data-sources.md §1–§3.
 */

import snapshot from "../../data/models.json";

export type MetricId =
  | "artificial_analysis_intelligence_index"
  | "artificial_analysis_coding_index"
  | "artificial_analysis_math_index"
  | "mmlu_pro"
  | "gpqa"
  | "hle"
  | "livecodebench"
  | "scicode"
  | "math_500"
  | "aime";

export interface ModelParams {
  total: number | null;
  active: number | null;
}

export interface ModelPricing {
  price_1m_blended_3_to_1: number | null;
  price_1m_input_tokens: number | null;
  price_1m_output_tokens: number | null;
}

export interface ModelSpeed {
  tps: number | null;
  ttft: number | null;
}

export interface ModelRecord {
  id: string;
  slug: string;
  name: string;
  creator: string;
  creatorSlug: string;
  isClosed: boolean;
  params: ModelParams;
  /** True for open models whose parameter counts are undisclosed (e.g. Qwen Max
   *  tiers): shown as "unknown" rather than hidden as a data gap or guessed. */
  paramsUnknown?: boolean;
  license: string | null;
  scores: Partial<Record<MetricId, number | null>>;
  pricing: ModelPricing;
  speed: ModelSpeed;
  hfId: string | null;
  /** For closed models the AA "mode" suffix, e.g. "(xhigh)", "(high)". null when no mode. */
  mode: string | null;
  releaseDate: string | null;
}

/** Frontier model ids for the two X-axis bases the UI exposes. */
export interface MetricFrontiers {
  /** Pareto frontier on (active params, score). */
  active: string[];
  /** Pareto frontier on (total params, score). */
  total: string[];
}

export interface ModelsSnapshot {
  generatedAt: string | null;
  models: ModelRecord[];
  /** Pre-computed frontier ids per metric per X-axis. */
  paretoByMetric: Partial<Record<MetricId, MetricFrontiers>>;
  /**
   * Map: model slug → measured GGUF Q4_K_M size in bytes. `null` means the
   * lookup happened but no community Q4_K_M file was found. Only Pareto
   * frontier models are looked up; everything else falls back to the
   * formula estimate in lib/quant.ts at render time.
   */
  ggufSizes?: Record<string, number | null>;
}

export function loadModels(): ModelsSnapshot {
  return snapshot as ModelsSnapshot;
}
