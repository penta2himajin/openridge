import type { MetricId } from "./models";

export interface MetricInfo {
  id: MetricId;
  label: string;
  category: "AGGREGATE" | "KNOWLEDGE & REASONING" | "CODE" | "AGENTIC";
  /** Maximum theoretical value, used for axis domain hints. */
  maxValue: number;
}

// docs/ui.md §3. Metric roster re-audited 2026-09-11 (initial audit
// 2026-07-23; see docs/data-sources.md §1 "Tracked evaluations"): IFBench,
// τ²-Bench and Terminal-Bench Hard collapsed from ~95% to ~2% coverage among
// open models released in the last 90 days. τ²-Bench and Terminal-Bench Hard
// are replaced by their successors τ³-Banking and Terminal-Bench v4.0 (API
// key `terminalbench_v2_1` unchanged — AA bumped the benchmark version
// without renaming the field), both now at ~95%+ recent coverage. IFBench
// has no successor field and is dropped outright. MMLU-Pro, LiveCodeBench,
// AIME, Math-500 and AA Math Index remain dropped from the prior audit.
export const METRICS: MetricInfo[] = [
  {
    id: "artificial_analysis_intelligence_index",
    label: "AA Intelligence Index",
    category: "AGGREGATE",
    maxValue: 100,
  },
  {
    id: "artificial_analysis_coding_index",
    label: "AA Coding Index",
    category: "AGGREGATE",
    maxValue: 100,
  },
  {
    id: "gpqa",
    label: "GPQA Diamond",
    category: "KNOWLEDGE & REASONING",
    maxValue: 1,
  },
  { id: "hle", label: "HLE", category: "KNOWLEDGE & REASONING", maxValue: 1 },
  {
    id: "lcr",
    label: "AA-LCR",
    category: "KNOWLEDGE & REASONING",
    maxValue: 1,
  },
  { id: "scicode", label: "SciCode", category: "CODE", maxValue: 1 },
  {
    id: "tau_banking",
    label: "τ³-Banking",
    category: "AGENTIC",
    maxValue: 1,
  },
  {
    id: "terminalbench_v2_1",
    label: "Terminal-Bench v4.0",
    category: "AGENTIC",
    maxValue: 1,
  },
];

export const DEFAULT_METRIC: MetricId =
  "artificial_analysis_intelligence_index";

export const METRICS_BY_ID = new Map(METRICS.map((m) => [m.id, m]));
