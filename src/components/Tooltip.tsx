/**
 * Hover/tap detail card. Positioned in chart-local coordinates so it sits
 * near the selected point (docs/ui.md §4.5). On mobile, pinned top-center of
 * the chart area so the thumb doesn't cover it (docs/ui.md §7.6).
 */
import { createMemo, Show } from "solid-js";
import type { AppState } from "../lib/state";
import type { ModelsSnapshot } from "../lib/models";
import { METRICS_BY_ID } from "../lib/metrics";
import { formatParams, formatScore } from "../lib/format";
import { useIsMobile } from "../lib/breakpoint";
import { findClosedNeighbours, type Neighbours, type NeighbourEntry } from "../lib/neighbours";

interface Props {
  snapshot: ModelsSnapshot;
  state: AppState;
  /** Chart-relative coords of the selected point (desktop only). */
  pos: { cx: number; cy: number } | null;
  /** Chart container dimensions for flip logic. */
  chartW: number;
  chartH: number;
}

// Estimated tooltip box; only used for flip thresholds, not measured.
const ESTIMATED_CARD_W = 260;
const ESTIMATED_CARD_H = 200;
const POINT_OFFSET = 12;

export default function Tooltip(props: Props) {
  const isMobile = useIsMobile();
  const model = createMemo(() => {
    const id = props.state.selectedModelId();
    if (!id) return null;
    return props.snapshot.models.find((m) => m.id === id) ?? null;
  });

  const isOnFrontier = createMemo(() => {
    const m = model();
    if (!m) return false;
    const entry = props.snapshot.paretoByMetric[props.state.metric()];
    if (!entry) return false;
    const ids = props.state.xview() === "total" ? entry.total : entry.active;
    return ids.includes(m.id);
  });

  const neighbours = createMemo<Neighbours | null>(() => {
    const m = model();
    if (!m || m.isClosed) return null;
    return findClosedNeighbours(
      m,
      props.snapshot.models,
      props.state.metric(),
      props.state.closedVendors(),
    );
  });

  // Compute placement near the selected point with quadrant flip.
  const cardStyle = (): Record<string, string> => {
    if (isMobile()) {
      return {
        position: "absolute",
        top: "12px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(280px, calc(100% - 24px))",
      };
    }
    const p = props.pos;
    if (!p) {
      // Selected without coords (e.g., a closed-anchor selection in the
      // future): fall back to top-right corner.
      return {
        position: "absolute",
        top: "12px",
        right: "16px",
        width: `${ESTIMATED_CARD_W}px`,
      };
    }
    // Default placement: point's upper-right. Flip horizontally if the card
    // would overflow the right side; flip vertically if it would overflow
    // the top of the chart.
    const placeOnLeft = p.cx + POINT_OFFSET + ESTIMATED_CARD_W > props.chartW - 8;
    const placeBelow = p.cy - POINT_OFFSET - ESTIMATED_CARD_H < 8;

    const style: Record<string, string> = {
      position: "absolute",
      width: `${ESTIMATED_CARD_W}px`,
    };
    if (placeOnLeft) {
      style.right = `${props.chartW - p.cx + POINT_OFFSET}px`;
    } else {
      style.left = `${p.cx + POINT_OFFSET}px`;
    }
    if (placeBelow) {
      style.top = `${p.cy + POINT_OFFSET}px`;
    } else {
      style.bottom = `${props.chartH - p.cy + POINT_OFFSET}px`;
    }
    return style;
  };

  return (
    <Show when={model()}>
      {(m) => {
        const metric = props.state.metric();
        const info = METRICS_BY_ID.get(metric)!;
        const primary = m().scores[metric];
        return (
          <div
            class="z-30 rounded-lg border border-fg-subtle bg-bg-elevated/95 backdrop-blur-md p-3 pointer-events-none shadow-lg"
            style={cardStyle()}
            role="status"
            aria-live="polite"
          >
            <div class="text-sm font-medium text-fg-default leading-snug">{m().name}</div>
            <div class="text-xs text-fg-muted mt-0.5">
              {m().creator}
              {m().license ? ` · ${m().license}` : ""}
            </div>

            <div class="my-2 h-px bg-fg-subtle/60" />

            <div class="grid grid-cols-2 gap-y-1 text-xs">
              <span class="font-mono uppercase tracking-wide text-fg-muted">Active</span>
              <span class="font-mono text-fg-default text-right">
                {formatParams(m().params.active)}
              </span>
              <span class="font-mono uppercase tracking-wide text-fg-muted">Total</span>
              <span class="font-mono text-fg-default text-right">
                {formatParams(m().params.total)}
              </span>
            </div>

            <div class="my-2 h-px bg-fg-subtle/60" />

            <div class="grid grid-cols-2 gap-y-1 text-xs">
              <span class="font-mono uppercase tracking-wide text-fg-muted truncate">
                {info.label}
              </span>
              <span class="font-mono text-fg-default text-right">
                {formatScore(primary, info.maxValue)}
              </span>
            </div>

            <Show when={neighbours()}>
              {(n) => (
                <>
                  <div class="my-2 h-px bg-fg-subtle/60" />
                  <div class="font-mono uppercase tracking-wide text-fg-muted text-[10px] mb-1">
                    Closest closed
                  </div>
                  <Show when={n().tie}>
                    {(t) => (
                      <NeighbourRow label="≈" entry={t()} info={info} />
                    )}
                  </Show>
                  <Show when={!n().tie && n().above}>
                    {(a) => (
                      <NeighbourRow label="↑" entry={a()} info={info} />
                    )}
                  </Show>
                  <Show when={!n().tie && n().below}>
                    {(b) => (
                      <NeighbourRow label="↓" entry={b()} info={info} />
                    )}
                  </Show>
                </>
              )}
            </Show>

            <Show when={isOnFrontier() || m().isClosed}>
              <div class="mt-2 pt-2 border-t border-fg-subtle/60 font-mono text-[11px] text-fg-muted">
                {m().isClosed ? "closed · anchor" : "Pareto · active"}
              </div>
            </Show>
          </div>
        );
      }}
    </Show>
  );
}

function NeighbourRow(props: {
  label: string;
  entry: NeighbourEntry;
  info: { maxValue: number };
}) {
  const display = () => {
    // Strip the parenthetical mode if present to keep the row short.
    return props.entry.model.name.replace(/\s*\([^)]+\)\s*$/, (paren) =>
      paren.length <= 14 ? paren : "",
    );
  };
  const fmt = (d: number) => {
    const v = props.info.maxValue <= 1 ? d * 100 : d;
    const sign = v > 0 ? "+" : v < 0 ? "" : "±";
    return sign + v.toFixed(1);
  };
  return (
    <div class="flex items-baseline gap-2 text-xs leading-tight py-0.5">
      <span class="font-mono text-fg-muted w-3 text-center flex-shrink-0">{props.label}</span>
      <span class="text-fg-default truncate flex-1 min-w-0">{display()}</span>
      <span class="font-mono text-fg-muted tabular-nums flex-shrink-0">
        {fmt(props.entry.delta)}
      </span>
    </div>
  );
}
