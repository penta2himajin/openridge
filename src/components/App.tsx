/**
 * Root Solid component — owns app state and composes the three sections.
 */
import { createSignal, For, Show } from "solid-js";
import Header from "./Header";
import Frontier from "./Frontier";
import Filters from "./Filters";
import { loadModels } from "../lib/models";
import { CLOSED_VENDORS, createAppState, type AppState } from "../lib/state";

const snapshot = loadModels();

export default function App() {
  const state = createAppState();
  const [infoOpen, setInfoOpen] = createSignal(false);

  return (
    <div class="h-viewport flex flex-col bg-bg-base text-fg-default">
      <Header state={state} onInfoClick={() => setInfoOpen(true)} />
      <Frontier snapshot={snapshot} state={state} />
      <Filters state={state} />
      <Show when={infoOpen()}>
        <InfoModal
          snapshot={snapshot}
          state={state}
          onClose={() => setInfoOpen(false)}
        />
      </Show>
    </div>
  );
}

function InfoModal(props: {
  snapshot: ReturnType<typeof loadModels>;
  state: AppState;
  onClose: () => void;
}) {
  const generated = props.snapshot.generatedAt
    ? new Date(props.snapshot.generatedAt).toUTCString()
    : "—";
  const counts = (() => {
    const all = props.snapshot.models;
    const open = all.filter((m) => !m.isClosed);
    const openWithParams = open.filter((m) => m.params.active != null);
    const unknown = open.filter((m) => m.paramsUnknown);
    const closed = all.filter((m) => m.isClosed);
    return {
      all: all.length,
      open: open.length,
      openWithParams: openWithParams.length,
      unknown: unknown.length,
      closed: closed.length,
    };
  })();
  return (
    <div
      class="fixed inset-0 z-40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        class="absolute inset-0 bg-bg-base/70 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={props.onClose}
      />
      <div class="relative max-w-md w-full rounded-lg border border-fg-subtle bg-bg-elevated p-5 text-sm">
        <h2 class="text-base text-fg-default">
          <span class="font-mono">about</span>{" "}
          <span class="font-sans font-normal italic text-fg-muted">Open</span>
          <span class="font-mono font-bold">Ridge</span>
        </h2>
        <p class="mt-2 text-fg-muted">
          Pareto frontier of open-weight LLMs, plotted against an intelligence
          benchmark. Closed flagship models appear as horizontal dashed anchors.
        </p>
        <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
          <dt class="text-fg-muted uppercase tracking-wide">Source</dt>
          <dd class="text-fg-default">
            <a
              class="underline decoration-fg-subtle hover:decoration-fg-default"
              href="https://artificialanalysis.ai"
              target="_blank"
              rel="noopener"
            >
              Artificial Analysis
            </a>
          </dd>
          <dt class="text-fg-muted uppercase tracking-wide">Refreshed</dt>
          <dd class="text-fg-default">{generated}</dd>
          <dt class="text-fg-muted uppercase tracking-wide">Entries</dt>
          <dd class="text-fg-default">
            {counts.all} total · {counts.open} open ({counts.openWithParams}{" "}
            with params
            {counts.unknown > 0 ? `, ${counts.unknown} params undisclosed` : ""}
            ) · {counts.closed} closed
          </dd>
        </dl>
        <p class="mt-4 text-fg-muted text-xs leading-relaxed">
          Params for open models come from the AA name (where encoded) or a
          small manual override map. MoE active params are the AA-named "A
          {"<N>"}B" value or a curated override. Browse the methodology and
          source at{" "}
          <a
            class="underline decoration-fg-subtle hover:decoration-fg-default"
            href="https://github.com/penta2himajin/openridge"
            target="_blank"
            rel="noopener"
          >
            github.com/penta2himajin/openridge
          </a>
          .
        </p>

        <div class="mt-5 pt-4 border-t border-fg-subtle/60">
          <div class="font-mono uppercase tracking-wide text-fg-muted text-[10px] mb-2">
            Closest-closed comparison
          </div>
          <p class="text-fg-muted text-xs leading-relaxed mb-3">
            When a single open model is selected, the tooltip shows the
            score-nearest closed model above and below from the vendors below.
            Stored in your browser only.
          </p>
          <div class="flex gap-2 flex-wrap">
            <For each={CLOSED_VENDORS}>
              {(v) => {
                const on = () => props.state.closedVendors().has(v.slug);
                return (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on()}
                    class="rounded-full border px-3 text-xs font-medium h-8 transition-colors"
                    classList={{
                      "bg-bg-high border-fg-subtle text-fg-default": on(),
                      "border-fg-subtle text-fg-muted hover:text-fg-default":
                        !on(),
                    }}
                    onClick={() => props.state.toggleClosedVendor(v.slug)}
                  >
                    {v.label}
                  </button>
                );
              }}
            </For>
          </div>
        </div>

        <button
          type="button"
          class="mt-5 w-full rounded-md bg-bg-high text-fg-default py-2 text-sm hover:bg-bg-high/80"
          onClick={props.onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
