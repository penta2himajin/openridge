/**
 * Hover/tap detail card.
 * Spec: docs/ui.md §4.5, §7.6.
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
}

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

  return (
    <Show when={model()}>
      {(m) => {
        const metric = props.state.metric();
        const info = METRICS_BY_ID.get(metric)!;
        const primary = m().scores[metric];
        return (
          <div
            class="absolute z-30 rounded-lg border border-fg-subtle bg-bg-elevated/95 backdrop-blur-md p-3 pointer-events-none"
            style={
              isMobile()
                ? {
                    top: "calc(env(safe-area-inset-top) + 64px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "min(280px, calc(100vw - 32px))",
                  }
                : {
                    top: "72px",
                    right: "20px",
                    width: "260px",
                  }
            }
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
