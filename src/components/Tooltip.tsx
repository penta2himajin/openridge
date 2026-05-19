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
    const ids = props.snapshot.paretoByMetric[props.state.metric()] ?? [];
    return ids.includes(m.id);
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
