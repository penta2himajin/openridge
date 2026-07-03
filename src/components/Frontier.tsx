/**
 * Pareto-frontier scatter plot.
 *
 * Spec: docs/ui.md §4, §7.5; docs/design.md §4.
 *
 * Approach: render axes + dots via Observable Plot (D3 wrapper), then
 * overlay frontier line, closed-anchor lines+labels, and transparent
 * hit-circles using raw SVG into a sibling layer. This keeps Plot's
 * scale/layout calculations as the source of truth while letting us
 * style and interact like raw SVG.
 *
 * The chart is not virtualised — at <600 points it's well within SVG
 * performance budget. Re-renders on every relevant signal change.
 */
import { batch, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import * as Plot from "@observablehq/plot";
import * as d3 from "d3";
import type { ModelRecord, ModelsSnapshot } from "../lib/models";
import type { AppState } from "../lib/state";
import { METRICS_BY_ID } from "../lib/metrics";
import { formatParams } from "../lib/format";
import { useIsMobile } from "../lib/breakpoint";
import Tooltip from "./Tooltip";

interface Props {
  snapshot: ModelsSnapshot;
  state: AppState;
}

const CLOSED_DEFAULT_TOP = 3;
const CLOSED_DEFAULT_TOP_DESKTOP = 5;
const CLOSED_FULL_TOP = 12;

export default function Frontier(props: Props) {
  const isMobile = useIsMobile();
  let containerRef!: HTMLDivElement;
  let plotRef!: HTMLDivElement;
  let overlayRef!: SVGSVGElement;

  // Chart-relative coords of the currently selected/hovered point. Used by
  // Tooltip to position itself near the point (per docs/ui.md §4.5).
  const [selectedPos, setSelectedPos] = createSignal<{ cx: number; cy: number } | null>(null);
  const [chartSize, setChartSize] = createSignal({ w: 0, h: 0 });

  // Which end of a Compare-mode barbell the current selection points at. The
  // tooltip anchors to this end so hovering the total-side ○ shows the card
  // beside that ○ rather than jumping to the far-away active ● (docs/ui.md §4.5).
  const [selectedEnd, setSelectedEnd] = createSignal<"active" | "total">("active");
  const selectPoint = (id: string | null, end: "active" | "total" = "active") => {
    batch(() => {
      setSelectedEnd(end);
      props.state.setSelectedModelId(id);
    });
  };

  const sizeMatchers = (m: ModelRecord) => {
    const a = m.params.active ?? 0;
    return {
      lt10b: a > 0 && a < 10e9,
      lt30b: a > 0 && a < 30e9,
      lt100b: a > 0 && a < 100e9,
      ge100b: a >= 100e9,
    };
  };

  const filteredOpen = createMemo(() => {
    const metric = props.state.metric();
    const sizeF = props.state.sizeFilters();
    const licenseF = props.state.licenseFilters();
    return props.snapshot.models.filter((m) => {
      if (m.isClosed) return false;
      if (m.params.active == null) return false;
      if (m.scores[metric] == null) return false;
      if (sizeF.size > 0) {
        const flags = sizeMatchers(m);
        const ok = [...sizeF].some((f) => flags[f]);
        if (!ok) return false;
      }
      if (licenseF.size > 0) {
        // License is not yet populated in the snapshot; skip filter when null,
        // emit them only when filter is fully off. For now: treat license
        // filter as a soft-no-op (we do not have license data in v1).
      }
      return true;
    });
  });

  const closedAnchors = createMemo(() => {
    const metric = props.state.metric();
    // Group closed entries by name root (strip the "(mode)" suffix) — show one
    // anchor per (root × mode). Filter to those with scores, sort desc, take N.
    const items = props.snapshot.models
      .filter((m) => m.isClosed && m.scores[metric] != null)
      .map((m) => ({ m, score: m.scores[metric] as number }))
      .sort((a, b) => b.score - a.score);

    const cap = props.state.showAllClosed()
      ? CLOSED_FULL_TOP
      : isMobile()
        ? CLOSED_DEFAULT_TOP
        : CLOSED_DEFAULT_TOP_DESKTOP;
    return items.slice(0, cap);
  });

  const paretoIds = createMemo(() => {
    const m = props.state.metric();
    const entry = props.snapshot.paretoByMetric[m];
    if (!entry) return new Set<string>();
    // Active mode + Compare mode use the active-axis frontier as the
    // primary line. Compare additionally overlays the total-axis frontier
    // (see drawOverlay). Total mode uses the total-axis frontier directly.
    const ids = props.state.xview() === "total" ? entry.total : entry.active;
    return new Set(ids);
  });

  /** Ids of points that belong on the total-axis frontier (for Compare overlay). */
  const totalFrontierIds = createMemo(() => {
    const m = props.state.metric();
    return new Set(props.snapshot.paretoByMetric[m]?.total ?? []);
  });

  const xAccessor = (m: ModelRecord): number | null => {
    if (props.state.xview() === "total") return m.params.total;
    return m.params.active;
  };

  const renderPlot = () => {
    if (!containerRef || !plotRef) return;
    const rect = containerRef.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width));
    const height = Math.max(300, Math.floor(rect.height));
    const mobile = isMobile();
    setChartSize({ w: width, h: height });
    // Reset before drawOverlay so that if the selected point is filtered out
    // of `points` (license/size filter), the stale position is dropped.
    setSelectedPos(null);

    const metric = props.state.metric();
    const metricInfo = METRICS_BY_ID.get(metric)!;
    const open = filteredOpen();
    const closed = closedAnchors();
    const pareto = paretoIds();

    const points = open
      .map((m) => ({
        m,
        x: xAccessor(m),
        y: m.scores[metric] as number | null,
        isFrontier: pareto.has(m.id),
      }))
      .filter((p): p is { m: ModelRecord; x: number; y: number; isFrontier: boolean } =>
        p.x != null && p.y != null && Number.isFinite(p.x) && Number.isFinite(p.y),
      );

    // Robust x domain even if filter empties points. In Compare mode the
    // barbells extend the visible range out to each MoE's total params, so
    // include those in the domain — otherwise the barbell line and the
    // open-circle "total" end clip off the right edge.
    const xs = points.map((p) => p.x);
    if (props.state.xview() === "compare") {
      for (const p of points) {
        const t = p.m.params.total;
        if (t != null && Number.isFinite(t)) xs.push(t);
      }
    }
    // Floor kept low (0.5M) so genuinely tiny models aren't clipped off the
    // left; in practice min/2 dominates for any real model.
    const xMin = xs.length ? Math.max(5e5, Math.min(...xs) / 2) : 5e8;
    const xMax = xs.length ? Math.max(...xs) * 1.4 : 2e12;
    const yMax = metricInfo.maxValue <= 1 ? 1 : 100;
    const yMin = 0;

    const fmtX = (n: number) => formatParams(n, 0);
    // Ticks adapt to the domain so both the sub-1B small models and the ~1T
    // top tier get labelled decades. Desktop adds the 3× minor per decade.
    const decades = [1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13];
    const tickMajor = decades
      .flatMap((d) => (mobile ? [d] : [d, 3 * d]))
      .filter((t) => t >= xMin && t <= xMax);

    const plot = Plot.plot({
      width,
      height,
      marginTop: 24,
      marginRight: mobile ? 16 : 32,
      marginBottom: 36,
      marginLeft: 44,
      style: {
        background: "transparent",
        color: "var(--fg-muted)",
        fontFamily: "var(--font-mono, ui-monospace)",
        fontSize: "11px",
        overflow: "visible",
      },
      x: {
        type: "log",
        domain: [xMin, xMax],
        ticks: tickMajor,
        tickFormat: fmtX,
        grid: false,
        label: null,
      },
      y: {
        domain: [yMin, yMax],
        ticks: mobile ? 4 : 6,
        grid: false,
        label: null,
      },
      marks: [
        // Frame
        Plot.frame({ stroke: "var(--fg-subtle)", strokeOpacity: 0.5 }),

        // Non-frontier open points (faint)
        Plot.dot(points.filter((p) => !p.isFrontier), {
          x: "x",
          y: "y",
          r: 4,
          fill: "var(--fg-subtle)",
          fillOpacity: 0.35,
          stroke: null,
        }),

        // Frontier points (bright lime)
        Plot.dot(points.filter((p) => p.isFrontier), {
          x: "x",
          y: "y",
          r: mobile ? 5.5 : 6,
          fill: "var(--frontier)",
          stroke: null,
        }),
      ],
    });
    // Tag axes for CSS theming
    plot.querySelectorAll("g[aria-label='x-axis tick label'], g[aria-label='y-axis tick label']").forEach((g) =>
      g.classList.add("ridge-axis"),
    );
    plot.querySelectorAll("[aria-label^='x-axis'], [aria-label^='y-axis']").forEach((g) =>
      g.classList.add("ridge-axis"),
    );

    plotRef.replaceChildren(plot);

    // Compute scales for the overlay layer. Re-derive from Plot via getBoundingClientRect of frame.
    const xScale = d3
      .scaleLog<number, number>()
      .domain([xMin, xMax])
      .range([44, width - (mobile ? 16 : 32)]);
    const yScale = d3
      .scaleLinear<number, number>()
      .domain([yMin, yMax])
      .nice()
      .range([height - 36, 24]);

    // Total-axis frontier line for Compare overlay. We need each model's
    // total-X coord, not active-X.
    const tfIds = totalFrontierIds();
    const compareTotalFrontier = open
      .filter((m) => tfIds.has(m.id) && m.params.total != null && m.scores[metric] != null)
      .map((m) => ({
        x: m.params.total as number,
        y: m.scores[metric] as number,
      }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

    drawOverlay({
      svg: overlayRef,
      width,
      height,
      points,
      closed,
      xScale,
      yScale,
      mobile,
      xview: props.state.xview(),
      compareTotalFrontier,
      totalFrontierIds: tfIds,
      selectedId: props.state.selectedModelId(),
      selectedEnd: selectedEnd(),
      onSelect: selectPoint,
      onSelectedPos: (cx, cy) => setSelectedPos({ cx, cy }),
    });
  };

  onMount(() => {
    renderPlot();

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(renderPlot);
    });
    ro.observe(containerRef);

    onCleanup(() => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    });
  });

  createEffect(() => {
    // re-render whenever any of these signals fire
    void props.state.metric();
    void props.state.xview();
    void props.state.sizeFilters();
    void props.state.licenseFilters();
    void props.state.showAllClosed();
    void props.state.selectedModelId();
    void selectedEnd();
    void isMobile();
    renderPlot();
  });

  return (
    <section
      ref={containerRef}
      class="flex-1 relative min-h-0 overflow-hidden"
      aria-label="Parameters vs intelligence scatter"
    >
      <div ref={plotRef} class="absolute inset-0" />
      <svg
        ref={overlayRef}
        class="absolute inset-0 w-full h-full pointer-events-none"
        style={{ "pointer-events": "none" }}
      />
      <AxisLegend metric={props.state.metric()} xview={props.state.xview()} />
      <Tooltip
        snapshot={props.snapshot}
        state={props.state}
        pos={selectedPos()}
        chartW={chartSize().w}
        chartH={chartSize().h}
      />
    </section>
  );
}

function AxisLegend(props: { metric: string; xview: string }) {
  // Only label the X axis here; the Y axis is named by the Index dropdown in
  // the header, so a duplicate vertical legend just collides with the Y tick
  // labels at small widths.
  void props.metric;
  const xLabel = () =>
    props.xview === "total" ? "total params (log)" : "active params (log)";
  return (
    <span class="pointer-events-none absolute bottom-1 right-2 sm:right-4 text-[10px] sm:text-[11px] font-mono uppercase tracking-wide text-fg-muted">
      {xLabel()}
    </span>
  );
}

// ─── SVG overlay ───────────────────────────────────────────────────────────

interface OverlayContext {
  svg: SVGSVGElement;
  width: number;
  height: number;
  points: { m: ModelRecord; x: number; y: number; isFrontier: boolean }[];
  closed: { m: ModelRecord; score: number }[];
  xScale: d3.ScaleLogarithmic<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  mobile: boolean;
  xview: "active" | "total" | "compare";
  /** Total-axis frontier points (x=total params) for the dotted overlay in Compare mode. */
  compareTotalFrontier: { x: number; y: number }[];
  /** Ids of models on the total-axis frontier (for Compare total-end markers). */
  totalFrontierIds: Set<string>;
  selectedId: string | null;
  /** Which barbell end the selection anchors to (Compare mode). */
  selectedEnd: "active" | "total";
  onSelect: (id: string | null, end?: "active" | "total") => void;
  onSelectedPos: (cx: number, cy: number) => void;
}

/**
 * Rough pixel width estimate for the closed-anchor label, used to space the
 * callout markers along the X axis without measuring real text.
 */
function estimateLabelWidth(text: string, fontPx: number): number {
  // 0.55em average glyph width for Geist/Inter — close enough for layout.
  return Math.ceil(text.length * fontPx * 0.55);
}

/**
 * Truncate "GPT-5.5 (xhigh)" → keep mode suffix on desktop; "Claude Opus 4.7
 * (Adaptive Reasoning, Max Effort)" → drop long parentheticals. On mobile,
 * strip all parentheticals.
 */
function formatClosedLabel(name: string, mobile: boolean): string {
  const m = name.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!m) return name;
  const base = m[1];
  const paren = m[2];
  if (mobile) return base;
  return paren.length <= 12 ? `${base} (${paren})` : base;
}

function drawOverlay(ctx: OverlayContext) {
  const { svg, width, height, points, closed, xScale, yScale, mobile, xview, compareTotalFrontier, totalFrontierIds, selectedId, selectedEnd, onSelect, onSelectedPos } = ctx;
  const svgSel = d3.select(svg).attr("viewBox", `0 0 ${width} ${height}`);
  svgSel.selectAll("*").remove();

  // Closed anchors — callout layout (docs/ui.md §4.4, §7.5.4).
  //
  // Lines span the full X range; each gets a marker dot at a unique X
  // position so the eye can pair it with its label without having to count
  // dashed lines. Labels are right-anchored above their markers; if labels
  // crowd vertically (typical when closed flagships cluster within a 5-pt
  // score band) they push upward into the empty space above the data.
  const closedLayer = svgSel
    .append("g")
    .attr("class", "closed-anchors")
    .style("pointer-events", "none");
  const lineLeftX = xScale.range()[0];
  const lineRightX = xScale.range()[1];
  const chartTop = yScale.range()[1];
  const labelFontPx = mobile ? 10 : 12;
  const minGap = mobile ? 14 : 18;
  const labelLift = 10;

  // Validate.
  const valid = closed.filter(({ score }) => Number.isFinite(yScale(score)));

  // Sort by score DESC: highest first so we lay out rightmost → leftmost.
  const sortedDesc = [...valid].sort((a, b) => b.score - a.score);
  const labels = sortedDesc.map(({ m }) => formatClosedLabel(m.name, mobile));
  const labelWidths = labels.map((t) => estimateLabelWidth(t, labelFontPx));

  // Choose a stride that fits all labels across the chart width. Leave a
  // small lead-in on the left so the lowest-score callout still sits inside
  // the chart frame.
  const innerWidth = Math.max(0, lineRightX - lineLeftX - 32);
  const naturalStride = Math.max(...labelWidths, 0) + 24;
  const stride = sortedDesc.length > 1
    ? Math.max(60, Math.min(naturalStride, innerWidth / Math.max(1, sortedDesc.length - 1)))
    : 0;

  const placements = sortedDesc.map(({ m, score }, i) => ({
    m,
    score,
    text: labels[i],
    lineY: yScale(score),
    labelY: yScale(score) - labelLift,
    markerX: lineRightX - 8 - i * stride,
    labelRightX: lineRightX - 8 - i * stride,
  }));

  // Vertical stagger — iterate ASC by score (bottom → top of chart) and
  // push labels upward when crowded.
  const byScoreAsc = [...placements].sort((a, b) => a.score - b.score);
  for (let i = 1; i < byScoreAsc.length; i++) {
    const prev = byScoreAsc[i - 1];
    const curr = byScoreAsc[i];
    if (prev.labelY - curr.labelY < minGap) {
      curr.labelY = prev.labelY - minGap;
    }
  }
  for (const p of placements) {
    if (p.labelY < chartTop + 10) p.labelY = chartTop + 10;
  }

  // Render each callout.
  for (const p of placements) {
    closedLayer
      .append("line")
      .attr("class", "ridge-closed-line")
      .attr("x1", lineLeftX)
      .attr("x2", lineRightX)
      .attr("y1", p.lineY)
      .attr("y2", p.lineY);
    closedLayer
      .append("circle")
      .attr("class", "ridge-closed-marker")
      .attr("cx", p.markerX)
      .attr("cy", p.lineY)
      .attr("r", 2.5);
    if (Math.abs(p.lineY - p.labelY) >= 1) {
      closedLayer
        .append("line")
        .attr("class", "ridge-closed-leader")
        .attr("x1", p.markerX)
        .attr("x2", p.markerX)
        .attr("y1", p.lineY)
        .attr("y2", p.labelY);
    }
    closedLayer
      .append("text")
      .attr("class", "ridge-closed-label")
      .attr("x", p.labelRightX - 4)
      .attr("y", p.labelY - 4)
      .attr("text-anchor", "end")
      .text(p.text);
  }

  // Compare-mode overlays (docs/ui.md §4.2): barbells + total-axis frontier.
  //
  // Primary dot already sits at xScale(active) because xAccessor returns
  // params.active for "compare". For MoE models (active != total) we
  // extend a thin connector to xScale(total) and stamp an open circle at
  // the total position. Dense models render as a plain dot (no barbell).
  //
  // The active-axis frontier line (solid, --frontier) is drawn below by the
  // generic frontier-path step. The TOTAL-axis frontier is added here as a
  // dotted line in the same colour at 50% opacity so the two are visually
  // distinct but obviously the same data dimension.
  if (xview === "compare") {
    // Total-axis frontier line first so barbells sit on top.
    if (compareTotalFrontier.length >= 2) {
      const sorted = [...compareTotalFrontier].sort((a, b) => a.x - b.x);
      const totalLine = d3
        .line<{ x: number; y: number }>()
        .x((p) => xScale(p.x))
        .y((p) => yScale(p.y))
        .curve(d3.curveMonotoneX);
      svgSel
        .append("path")
        .attr("class", "ridge-frontier-total")
        .attr("d", totalLine(sorted)!);
    }

    const dotR = mobile ? 5.5 : 6;
    const barbellLayer = svgSel
      .append("g")
      .attr("class", "barbells")
      .style("pointer-events", "none");
    for (const p of points) {
      const totalParam = p.m.params.total;
      if (
        totalParam == null ||
        !Number.isFinite(totalParam) ||
        Math.abs(totalParam - p.x) < 1
      ) {
        continue; // dense or missing — no barbell
      }
      const xa = xScale(p.x);
      const xt = xScale(totalParam);
      const cy = yScale(p.y);
      if (!Number.isFinite(xa) || !Number.isFinite(xt) || !Number.isFinite(cy)) continue;
      // A barbell reads as "on the frontier" when EITHER end sits on its axis's
      // frontier. Colour the whole barbell (connector + both ends) lime in that
      // case so the two directions are symmetric: an active-frontier MoE colours
      // its total-end ○, and a total-only-frontier MoE — whose active ● is
      // dominated and thus drawn grey by Plot — gets its connector and active ●
      // coloured here instead. Only barbells on neither frontier stay grey.
      const onActive = p.isFrontier;
      const onTotal = totalFrontierIds.has(p.m.id);
      const onEither = onActive || onTotal;
      const stroke = onEither ? "var(--frontier)" : "var(--fg-subtle)";
      const opacity = onEither ? 0.9 : 0.45;
      barbellLayer
        .append("line")
        .attr("class", "ridge-barbell-line")
        .attr("x1", xa)
        .attr("x2", xt)
        .attr("y1", cy)
        .attr("y2", cy)
        .attr("stroke", stroke)
        .attr("stroke-opacity", opacity);
      // Active end: Plot already draws a filled lime ● when the model is on the
      // active frontier. When it is on the total frontier only, Plot drew it
      // grey, so stamp the lime ● here to colour the active side.
      if (onTotal && !onActive) {
        barbellLayer
          .append("circle")
          .attr("class", "ridge-frontier-dot")
          .attr("cx", xa)
          .attr("cy", cy)
          .attr("r", dotR);
      }
      // Total end: open ○, lime whenever the barbell is on either frontier.
      barbellLayer
        .append("circle")
        .attr("class", "ridge-barbell-total")
        .attr("cx", xt)
        .attr("cy", cy)
        .attr("r", 4)
        .attr("fill", "none")
        .attr("stroke", stroke)
        .attr("stroke-opacity", opacity);
    }

    // Dense models (active == total, so no barbell) that sit on the total-axis
    // frontier but not the active-axis frontier are drawn faint grey by Plot.
    // Because active == total there is no "total end" to distinguish — the point
    // simply is a frontier point at that location — so render it as a filled
    // lime ●, not an open ○ (docs/ui.md §4.2: dense renders as a single point).
    for (const p of points) {
      if (p.isFrontier) continue; // already a filled lime dot from Plot
      if (!totalFrontierIds.has(p.m.id)) continue;
      const totalParam = p.m.params.total;
      const hasBarbell =
        totalParam != null &&
        Number.isFinite(totalParam) &&
        Math.abs(totalParam - p.x) >= 1;
      if (hasBarbell) continue; // handled in the barbell loop above
      const cx = xScale(p.x);
      const cy = yScale(p.y);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      barbellLayer
        .append("circle")
        .attr("class", "ridge-frontier-dot")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", dotR);
    }
  }

  // Frontier path through frontier points (sorted by x).
  const frontierPoints = points.filter((p) => p.isFrontier).sort((a, b) => a.x - b.x);
  if (frontierPoints.length >= 2) {
    const line = d3
      .line<{ x: number; y: number }>()
      .x((p) => xScale(p.x))
      .y((p) => yScale(p.y))
      .curve(d3.curveMonotoneX);
    svgSel
      .append("path")
      .attr("class", "ridge-frontier-line")
      .attr("d", line(frontierPoints)!);
  }

  // Transparent hit circles (enlarged tap targets per docs §7.2). Every point
  // gets an active-side target; in Compare mode the total-side ○ of a frontier
  // barbell gets its own target too, so hovering that ○ shows the card beside
  // it rather than doing nothing (docs/ui.md §4.5). Non-frontier total ends
  // stay non-interactive — you reach those models via their active-side point.
  interface HitTarget {
    id: string;
    name: string;
    param: number;
    cx: number;
    cy: number;
    end: "active" | "total";
    /** Whether the marker under this target is lime — drives highlight colour. */
    frontier: boolean;
    /** True when the underlying marker is an open ○ (a barbell's total end). The
     * hover/focus highlight preserves this shape — an open ○ enlarges to a
     * bigger ○, a filled ● to a bigger ● (the ○/● shape encodes total vs
     * active per docs/ui.md §4.2, §8). */
    open: boolean;
  }
  const hits: HitTarget[] = [];
  for (const p of points) {
    const cx = xScale(p.x);
    const cy = yScale(p.y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    // In Compare the active ● is also lime when the model is on the total
    // frontier (see the barbell / dense loops above).
    const activeLime = p.isFrontier || (xview === "compare" && totalFrontierIds.has(p.m.id));
    hits.push({ id: p.m.id, name: p.m.name, param: p.x, cx, cy, end: "active", frontier: activeLime, open: false });
  }
  if (xview === "compare") {
    for (const p of points) {
      const t = p.m.params.total;
      if (t == null || !Number.isFinite(t) || Math.abs(t - p.x) < 1) continue; // dense — no ○
      const onEither = p.isFrontier || totalFrontierIds.has(p.m.id);
      if (!onEither) continue; // non-frontier total end stays non-interactive
      const cx = xScale(t);
      const cy = yScale(p.y);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      hits.push({ id: p.m.id, name: p.m.name, param: t, cx, cy, end: "total", frontier: true, open: true });
    }
  }

  const hitLayer = svgSel
    .append("g")
    .attr("class", "hit-layer")
    .style("pointer-events", "auto");

  for (const h of hits) {
    const isSelected = selectedId === h.id && selectedEnd === h.end;
    const g = hitLayer
      .append("g")
      .attr("transform", `translate(${h.cx},${h.cy})`)
      .style("cursor", "pointer");
    // Invisible hit circle
    g.append("circle")
      .attr("r", mobile ? 14 : 10)
      .attr("fill", "transparent")
      .attr("stroke", "transparent");
    // Visible highlight when selected — enlarge the marker while preserving its
    // ○/● shape (open total end vs filled active/dense point).
    if (isSelected) {
      const colour = h.frontier ? "var(--frontier)" : "var(--fg-default)";
      if (h.open) {
        // Open ○ enlarged to a bigger ○, not filled in.
        g.append("circle")
          .attr("r", 8)
          .attr("fill", "none")
          .attr("stroke", colour)
          .attr("stroke-width", 2);
      } else {
        // Filled ● enlarged, with a bg ring so it reads over nearby marks.
        g.append("circle")
          .attr("r", 9)
          .attr("fill", colour)
          .attr("stroke", "var(--bg-base)")
          .attr("stroke-width", 2);
      }
      onSelectedPos(h.cx, h.cy);
    }
    g.attr("role", "button")
      .attr("tabindex", 0)
      .attr("aria-label", `${h.name}, ${formatParams(h.param)} parameters`)
      .on("click", (e) => {
        e.stopPropagation();
        onSelect(isSelected ? null : h.id, h.end);
      })
      .on("mouseenter", () => {
        if (!mobile) onSelect(h.id, h.end);
      })
      .on("mouseleave", () => {
        if (!mobile && selectedId === h.id) {
          // Keep selection on desktop only if user explicitly clicked; mouseleave clears hover.
          onSelect(null);
        }
      })
      .on("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(isSelected ? null : h.id, h.end);
        }
      });
  }

  // Background click clears selection
  svgSel.on("click", () => onSelect(null));
}
