import type { MetricId } from "./models";

export interface MetricInfo {
  id: MetricId;
  label: string;
  category: "AGGREGATE" | "KNOWLEDGE & REASONING" | "CODE" | "AGENTIC";
  /** Maximum theoretical value, used for axis domain hints. */
  maxValue: number;
}

// docs/ui.md §3. Metric roster audited 2026-07-23 against live AA coverage
// (see docs/data-sources.md §1 "Tracked evaluations"): MMLU-Pro, LiveCodeBench,
// AIME, Math-500 and AA Math Index were dropped after AA stopped scoring new
// releases on them (0-4% coverage among 2026 open models); AA-LCR, IFBench,
// τ²-Bench and Terminal-Bench Hard were added in their place.
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
  {
    id: "ifbench",
    label: "IFBench",
    category: "KNOWLEDGE & REASONING",
    maxValue: 1,
  },
  { id: "scicode", label: "SciCode", category: "CODE", maxValue: 1 },
  { id: "tau2", label: "τ²-Bench", category: "AGENTIC", maxValue: 1 },
  {
    id: "terminalbench_hard",
    label: "Terminal-Bench Hard",
    category: "AGENTIC",
    maxValue: 1,
  },
];

export const DEFAULT_METRIC: MetricId =
  "artificial_analysis_intelligence_index";

export const METRICS_BY_ID = new Map(METRICS.map((m) => [m.id, m]));
