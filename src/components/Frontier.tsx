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
import { createEffect, createMemo, onCleanup, onMount } from "solid-js";
import * as Plot from "@observablehq/plot";
import * as d3 from "d3";
import type { ModelRecord, ModelsSnapshot } from "../lib/models";
import type { AppState } from "../lib/state";
import { METRICS_BY_ID } from "../lib/metrics";
import { formatParams } from "../lib/format";
import { useIsMobile } from "../lib/breakpoint";

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
    return new Set(props.snapshot.paretoByMetric[m] ?? []);
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

    // Robust x domain even if filter empties points.
    const xs = points.map((p) => p.x);
    const xMin = xs.length ? Math.max(1e8, Math.min(...xs) / 2) : 5e8;
    const xMax = xs.length ? Math.max(...xs) * 1.4 : 2e12;
    const yMax = metricInfo.maxValue <= 1 ? 1 : 100;
    const yMin = 0;

    const fmtX = (n: number) => formatParams(n, 0);
    const tickMajor = mobile
      ? [1e9, 1e10, 1e11, 1e12]
      : [1e9, 3e9, 1e10, 3e10, 1e11, 3e11, 1e12];

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
        nice: true,
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

    drawOverlay({
      svg: overlayRef,
      width,
      height,
      points,
      closed,
      xScale,
      yScale,
      mobile,
      selectedId: props.state.selectedModelId(),
      onSelect: (id) => props.state.setSelectedModelId(id),
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
    </section>
  );
}

function AxisLegend(props: { metric: string; xview: string }) {
  const xLabel = () =>
    props.xview === "total" ? "total params (log)" : "active params (log)";
  const yLabel = () => METRICS_BY_ID.get(props.metric as never)?.label ?? "";
  return (
    <>
      <span class="pointer-events-none absolute bottom-1 right-2 sm:right-4 text-[10px] sm:text-[11px] font-mono uppercase tracking-wide text-fg-muted">
        {xLabel()}
      </span>
      <span
        class="pointer-events-none absolute top-1 left-2 sm:left-4 text-[10px] sm:text-[11px] font-mono uppercase tracking-wide text-fg-muted"
        style={{ "writing-mode": "vertical-rl", transform: "rotate(180deg)" }}
      >
        {yLabel()}
      </span>
    </>
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
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function drawOverlay(ctx: OverlayContext) {
  const { svg, width, height, points, closed, xScale, yScale, mobile, selectedId, onSelect } = ctx;
  const svgSel = d3.select(svg).attr("viewBox", `0 0 ${width} ${height}`);
  svgSel.selectAll("*").remove();

  // Closed anchor lines (drawn first → behind dots).
  const closedLayer = svgSel.append("g").attr("class", "closed-anchors").style("pointer-events", "none");
  const labelPaddingRight = mobile ? 8 : 12;
  for (const { m, score } of closed) {
    const y = yScale(score);
    if (!Number.isFinite(y)) continue;
    closedLayer
      .append("line")
      .attr("class", "ridge-closed-line")
      .attr("x1", xScale.range()[0])
      .attr("x2", xScale.range()[1])
      .attr("y1", y)
      .attr("y2", y);
    // Truncate "(mode)" on mobile per docs/ui.md §7.5.4
    const displayName = mobile
      ? m.name.replace(/\s*\([^)]*\)\s*$/, "")
      : m.name;
    closedLayer
      .append("text")
      .attr("class", "ridge-closed-label")
      .attr("x", xScale.range()[1] - labelPaddingRight)
      .attr("y", y - 4)
      .attr("text-anchor", "end")
      .text(displayName);
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

  // Transparent hit circles for all points (enlarged tap targets per docs §7.2).
  const hitLayer = svgSel
    .append("g")
    .attr("class", "hit-layer")
    .style("pointer-events", "auto");

  for (const p of points) {
    const cx = xScale(p.x);
    const cy = yScale(p.y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    const isSelected = selectedId === p.m.id;
    const g = hitLayer
      .append("g")
      .attr("transform", `translate(${cx},${cy})`)
      .style("cursor", "pointer");
    // Invisible hit circle
    g.append("circle")
      .attr("r", mobile ? 14 : 10)
      .attr("fill", "transparent")
      .attr("stroke", "transparent");
    // Visible highlight when selected (overdraw the Plot dot)
    if (isSelected) {
      g.append("circle")
        .attr("r", 9)
        .attr("fill", p.isFrontier ? "var(--frontier)" : "var(--fg-default)")
        .attr("stroke", "var(--bg-base)")
        .attr("stroke-width", 2);
    }
    g.attr("role", "button")
      .attr("tabindex", 0)
      .attr("aria-label", `${p.m.name}, ${formatParams(p.x)} parameters`)
      .on("click", (e) => {
        e.stopPropagation();
        onSelect(isSelected ? null : p.m.id);
      })
      .on("mouseenter", () => {
        if (!mobile) onSelect(p.m.id);
      })
      .on("mouseleave", () => {
        if (!mobile && selectedId === p.m.id) {
          // Keep selection on desktop only if user explicitly clicked; mouseleave clears hover.
          onSelect(null);
        }
      })
      .on("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(isSelected ? null : p.m.id);
        }
      });
  }

  // Background click clears selection
  svgSel.on("click", () => onSelect(null));
}
