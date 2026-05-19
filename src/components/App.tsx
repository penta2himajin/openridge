/**
 * Root Solid component — owns app state and composes the three sections.
 */
import { createSignal, Show } from "solid-js";
import Header from "./Header";
import Frontier from "./Frontier";
import Filters from "./Filters";
import { loadModels } from "../lib/models";
import { createAppState } from "../lib/state";

const snapshot = loadModels();

export default function App() {
  const state = createAppState();
  const [infoOpen, setInfoOpen] = createSignal(false);

  return (
    <div class="h-screen flex flex-col bg-bg-base text-fg-default">
      <Header state={state} onInfoClick={() => setInfoOpen(true)} />
      <Frontier snapshot={snapshot} state={state} />
      <Filters state={state} />
      <Show when={infoOpen()}>
        <InfoModal
          snapshot={snapshot}
          onClose={() => setInfoOpen(false)}
        />
      </Show>
    </div>
  );
}

function InfoModal(props: { snapshot: ReturnType<typeof loadModels>; onClose: () => void }) {
  const generated = props.snapshot.generatedAt
    ? new Date(props.snapshot.generatedAt).toUTCString()
    : "—";
  const counts = (() => {
    const all = props.snapshot.models;
    const open = all.filter((m) => !m.isClosed);
    const openWithParams = open.filter((m) => m.params.active != null);
    const closed = all.filter((m) => m.isClosed);
    return { all: all.length, open: open.length, openWithParams: openWithParams.length, closed: closed.length };
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
        <h2 class="font-mono text-base text-fg-default">about ridge</h2>
        <p class="mt-2 text-fg-muted">
          Pareto frontier of open-weight LLMs, plotted against an intelligence
          benchmark. Closed flagship models appear as horizontal dashed anchors.
        </p>
        <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
          <dt class="text-fg-muted uppercase tracking-wide">Source</dt>
          <dd class="text-fg-default">
            <a class="underline decoration-fg-subtle hover:decoration-fg-default" href="https://artificialanalysis.ai" target="_blank" rel="noopener">
              Artificial Analysis
            </a>
          </dd>
          <dt class="text-fg-muted uppercase tracking-wide">Refreshed</dt>
          <dd class="text-fg-default">{generated}</dd>
          <dt class="text-fg-muted uppercase tracking-wide">Entries</dt>
          <dd class="text-fg-default">
            {counts.all} total · {counts.open} open ({counts.openWithParams} with params) · {counts.closed} closed
          </dd>
        </dl>
        <p class="mt-4 text-fg-muted text-xs leading-relaxed">
          Params for open models come from the AA name (where encoded) or a small
          manual override map. MoE active params are the AA-named "A{"<N>"}B" value
          or a curated override. Browse the methodology and source at{" "}
          <a class="underline decoration-fg-subtle hover:decoration-fg-default" href="https://github.com/penta2himajin/openridge" target="_blank" rel="noopener">
            github.com/penta2himajin/openridge
          </a>.
        </p>
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
