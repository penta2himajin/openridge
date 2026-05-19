import { createSignal, createEffect, onCleanup, onMount } from "solid-js";
import type { MetricId } from "./models";
import { DEFAULT_METRIC } from "./metrics";

export type XView = "active" | "total" | "compare";

export type LicenseFilter = "apache-mit" | "other-open";
export type SizeFilter = "lt10b" | "lt30b" | "lt100b" | "ge100b";

export interface AppState {
  metric: () => MetricId;
  setMetric: (m: MetricId) => void;
  xview: () => XView;
  setXview: (v: XView) => void;
  selectedModelId: () => string | null;
  setSelectedModelId: (id: string | null) => void;
  showAllClosed: () => boolean;
  setShowAllClosed: (v: boolean) => void;
  sizeFilters: () => Set<SizeFilter>;
  toggleSizeFilter: (f: SizeFilter) => void;
  licenseFilters: () => Set<LicenseFilter>;
  toggleLicenseFilter: (f: LicenseFilter) => void;
}

const VALID_METRICS: MetricId[] = [
  "artificial_analysis_intelligence_index",
  "artificial_analysis_coding_index",
  "artificial_analysis_math_index",
  "mmlu_pro",
  "gpqa",
  "hle",
  "livecodebench",
  "scicode",
  "math_500",
  "aime",
];
const VALID_VIEWS: XView[] = ["active", "total", "compare"];

function readUrl(): { metric?: MetricId; xview?: XView } {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const metric = p.get("index") as MetricId | null;
  const xview = p.get("view") as XView | null;
  return {
    metric: metric && VALID_METRICS.includes(metric) ? metric : undefined,
    xview: xview && VALID_VIEWS.includes(xview) ? xview : undefined,
  };
}

export function createAppState(): AppState {
  const url = readUrl();
  const [metric, setMetric] = createSignal<MetricId>(url.metric ?? DEFAULT_METRIC);
  const [xview, setXview] = createSignal<XView>(url.xview ?? "active");
  const [selectedModelId, setSelectedModelId] = createSignal<string | null>(null);
  const [showAllClosed, setShowAllClosed] = createSignal(false);
  const [sizeFilters, setSizeFilters] = createSignal<Set<SizeFilter>>(new Set());
  const [licenseFilters, setLicenseFilters] = createSignal<Set<LicenseFilter>>(new Set());

  // URL sync (one-way: state → url).
  onMount(() => {
    createEffect(() => {
      const p = new URLSearchParams(window.location.search);
      const m = metric();
      if (m === DEFAULT_METRIC) p.delete("index");
      else p.set("index", m);
      const v = xview();
      if (v === "active") p.delete("view");
      else p.set("view", v);
      const qs = p.toString();
      const next = `${window.location.pathname}${qs ? "?" + qs : ""}`;
      if (next !== window.location.pathname + window.location.search) {
        window.history.replaceState({}, "", next);
      }
    });

    // Esc clears the selected point.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedModelId(null);
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const toggle = <F,>(current: () => Set<F>, set: (s: Set<F>) => void, f: F) => {
    const next = new Set(current());
    if (next.has(f)) next.delete(f);
    else next.add(f);
    set(next);
  };

  return {
    metric,
    setMetric,
    xview,
    setXview,
    selectedModelId,
    setSelectedModelId,
    showAllClosed,
    setShowAllClosed,
    sizeFilters,
    toggleSizeFilter: (f) => toggle(sizeFilters, setSizeFilters, f),
    licenseFilters,
    toggleLicenseFilter: (f) => toggle(licenseFilters, setLicenseFilters, f),
  };
}
