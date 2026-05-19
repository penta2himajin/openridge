import type { MetricId } from "./models";

export interface MetricInfo {
  id: MetricId;
  label: string;
  category: "AGGREGATE" | "KNOWLEDGE & REASONING" | "CODE" | "MATH";
  /** Maximum theoretical value, used for axis domain hints. */
  maxValue: number;
}

// docs/ui.md §3.
export const METRICS: MetricInfo[] = [
  { id: "artificial_analysis_intelligence_index", label: "AA Intelligence Index", category: "AGGREGATE", maxValue: 100 },
  { id: "artificial_analysis_coding_index", label: "AA Coding Index", category: "AGGREGATE", maxValue: 100 },
  { id: "artificial_analysis_math_index", label: "AA Math Index", category: "AGGREGATE", maxValue: 100 },
  { id: "mmlu_pro", label: "MMLU-Pro", category: "KNOWLEDGE & REASONING", maxValue: 1 },
  { id: "gpqa", label: "GPQA Diamond", category: "KNOWLEDGE & REASONING", maxValue: 1 },
  { id: "hle", label: "HLE", category: "KNOWLEDGE & REASONING", maxValue: 1 },
  { id: "livecodebench", label: "LiveCodeBench", category: "CODE", maxValue: 1 },
  { id: "scicode", label: "SciCode", category: "CODE", maxValue: 1 },
  { id: "aime", label: "AIME", category: "MATH", maxValue: 1 },
  { id: "math_500", label: "Math-500", category: "MATH", maxValue: 1 },
];

export const DEFAULT_METRIC: MetricId = "artificial_analysis_intelligence_index";

export const METRICS_BY_ID = new Map(METRICS.map((m) => [m.id, m]));
