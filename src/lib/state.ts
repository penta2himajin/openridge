import { createSignal, createEffect, onCleanup, onMount } from "solid-js";
import type { MetricId } from "./models";
import { DEFAULT_METRIC } from "./metrics";

export type XView = "active" | "total" | "compare";

export type LicenseFilter = "apache-mit" | "other-open";
export type SizeFilter = "lt10b" | "lt30b" | "lt100b" | "ge100b";

/** Creator slugs eligible as "neighbour" closed models in the tooltip. */
export const CLOSED_VENDORS: { slug: string; label: string }[] = [
  { slug: "openai", label: "OpenAI" },
  { slug: "anthropic", label: "Anthropic" },
  { slug: "google", label: "Google" },
  { slug: "xai", label: "xAI" },
];
const DEFAULT_CLOSED_VENDORS: readonly string[] = ["openai", "anthropic", "google"];
const CLOSED_VENDORS_LS_KEY = "ridge:closed-vendors";

export interface AppState {
  metric: () => MetricId;
  setMetric: (m: MetricId) => void;
  xview: () => XView;
  setXview: (v: XView) => void;
  selectedModelId: () => string | null;
  setSelectedModelId: (id: string | null) => void;
  showAllClosed: () => boolean;
  setShowAllClosed: (v: boolean) => void;
  /** When on, only Pareto-frontier models are drawn; dominated points hidden. */
  frontierOnly: () => boolean;
  setFrontierOnly: (v: boolean) => void;
  sizeFilters: () => Set<SizeFilter>;
  toggleSizeFilter: (f: SizeFilter) => void;
  licenseFilters: () => Set<LicenseFilter>;
  toggleLicenseFilter: (f: LicenseFilter) => void;
  /** Vendor slugs used to pick "closest closed" comparisons in the tooltip. */
  closedVendors: () => Set<string>;
  toggleClosedVendor: (slug: string) => void;
}

function loadClosedVendors(): Set<string> {
  if (typeof window === "undefined") return new Set(DEFAULT_CLOSED_VENDORS);
  try {
    const raw = window.localStorage.getItem(CLOSED_VENDORS_LS_KEY);
    if (!raw) return new Set(DEFAULT_CLOSED_VENDORS);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(DEFAULT_CLOSED_VENDORS);
    const valid = new Set(CLOSED_VENDORS.map((v) => v.slug));
    return new Set(parsed.filter((s): s is string => typeof s === "string" && valid.has(s)));
  } catch {
    return new Set(DEFAULT_CLOSED_VENDORS);
  }
}

const VALID_METRICS: MetricId[] = [
  "artificial_analysis_intelligence_index",
  "artificial_analysis_coding_index",
  "gpqa",
  "hle",
  "lcr",
  "ifbench",
  "scicode",
  "tau2",
  "terminalbench_hard",
];
const VALID_VIEWS: XView[] = ["active", "total", "compare"];

function readUrl(): { metric?: MetricId; xview?: XView; frontierOnly?: boolean } {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const metric = p.get("index") as MetricId | null;
  const xview = p.get("view") as XView | null;
  return {
    metric: metric && VALID_METRICS.includes(metric) ? metric : undefined,
    xview: xview && VALID_VIEWS.includes(xview) ? xview : undefined,
    frontierOnly: p.get("frontier") === "1" ? true : undefined,
  };
}

export function createAppState(): AppState {
  const url = readUrl();
  const [metric, setMetric] = createSignal<MetricId>(url.metric ?? DEFAULT_METRIC);
  const [xview, setXview] = createSignal<XView>(url.xview ?? "active");
  const [selectedModelId, setSelectedModelId] = createSignal<string | null>(null);
  const [showAllClosed, setShowAllClosed] = createSignal(false);
  const [frontierOnly, setFrontierOnly] = createSignal(url.frontierOnly ?? false);
  const [sizeFilters, setSizeFilters] = createSignal<Set<SizeFilter>>(new Set());
  const [licenseFilters, setLicenseFilters] = createSignal<Set<LicenseFilter>>(new Set());
  const [closedVendors, setClosedVendors] = createSignal<Set<string>>(loadClosedVendors());

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
      if (frontierOnly()) p.set("frontier", "1");
      else p.delete("frontier");
      const qs = p.toString();
      const next = `${window.location.pathname}${qs ? "?" + qs : ""}`;
      if (next !== window.location.pathname + window.location.search) {
        window.history.replaceState({}, "", next);
      }
    });

    // Persist vendor selection.
    createEffect(() => {
      const v = [...closedVendors()];
      try {
        window.localStorage.setItem(CLOSED_VENDORS_LS_KEY, JSON.stringify(v));
      } catch {
        /* localStorage unavailable — ignore */
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
    frontierOnly,
    setFrontierOnly,
    sizeFilters,
    toggleSizeFilter: (f) => toggle(sizeFilters, setSizeFilters, f),
    licenseFilters,
    toggleLicenseFilter: (f) => toggle(licenseFilters, setLicenseFilters, f),
    closedVendors,
    toggleClosedVendor: (slug) => toggle(closedVendors, setClosedVendors, slug),
  };
}
