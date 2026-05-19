/**
 * Model data types and loader.
 * Spec: docs/architecture.md §4 (build-data.ts output shape),
 *       docs/data-sources.md §1–§3 (field provenance).
 */

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
  name: string;
  creator: string;
  isClosed: boolean;
  params: ModelParams;
  license: string | null;
  scores: Partial<Record<MetricId, number | null>>;
  pricing: ModelPricing;
  speed: ModelSpeed;
  hfId: string | null;
}

export interface ModelsSnapshot {
  generatedAt: string;
  models: ModelRecord[];
  /** Pre-computed: model ids on the Pareto frontier per tracked metric. */
  paretoByMetric: Partial<Record<MetricId, string[]>>;
}

// TODO: implement. Import the committed JSON at build time so the bundle
// embeds the snapshot — the browser must never fetch AA/HF at runtime.
export async function loadModels(): Promise<ModelsSnapshot> {
  throw new Error("not implemented: see docs/architecture.md §4");
}
