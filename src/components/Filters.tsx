/**
 * Bottom chip filter row.
 * Spec: docs/ui.md §5, §7.7.
 */
import { For } from "solid-js";
import type { AppState, SizeFilter } from "../lib/state";

interface Chip {
  key: string;
  label: string;
  isOn: () => boolean;
  toggle: () => void;
}

export default function Filters(props: { state: AppState }) {
  // License and capability filters are gated on data we do not yet have
  // populated (HF tags / cardData). They will return when scripts/build-data.ts
  // gains the HF lookup pass. See docs/data-sources.md §2.
  const sizeChips: { key: SizeFilter; label: string }[] = [
    { key: "lt10b", label: "<10B" },
    { key: "lt30b", label: "<30B" },
    { key: "lt100b", label: "<100B" },
    { key: "ge100b", label: "≥100B" },
  ];

  const chips: Chip[] = [
    ...sizeChips.map<Chip>((c) => ({
      key: c.key,
      label: c.label,
      isOn: () => props.state.sizeFilters().has(c.key),
      toggle: () => props.state.toggleSizeFilter(c.key),
    })),
    {
      key: "show-all-closed",
      label: "Show all closed",
      isOn: props.state.showAllClosed,
      toggle: () => props.state.setShowAllClosed(!props.state.showAllClosed()),
    },
  ];

  const chipClass = (on: boolean) =>
    on
      ? "bg-bg-elevated border-fg-subtle text-fg-default"
      : "border-fg-subtle text-fg-muted hover:text-fg-default";

  return (
    <nav
      class="flex-shrink-0 border-t border-fg-subtle bg-bg-base"
      style={{ "padding-bottom": "env(safe-area-inset-bottom)" }}
      aria-label="Model filters"
    >
      <div class="h-12 flex items-center px-3 sm:px-4 gap-2 sm:gap-3">
        <div class="flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar flex-1 min-w-0">
          <For each={chips}>
            {(c) => (
              <button
                type="button"
                role="switch"
                aria-checked={c.isOn()}
                class={`flex-shrink-0 rounded-full border px-3 text-sm font-medium transition-colors h-9 sm:h-7 ${chipClass(c.isOn())}`}
                onClick={c.toggle}
              >
                {c.label}
              </button>
            )}
          </For>
        </div>
        {/* Frontier-only toggle, pinned bottom-right (docs/ui.md §5). */}
        <button
          type="button"
          role="switch"
          aria-checked={props.state.frontierOnly()}
          title="Show only Pareto-frontier models"
          class={`flex-shrink-0 rounded-full border px-3 text-sm font-medium transition-colors h-9 sm:h-7 ${chipClass(props.state.frontierOnly())}`}
          onClick={() =>
            props.state.setFrontierOnly(!props.state.frontierOnly())
          }
        >
          Frontier only
        </button>
      </div>
    </nav>
  );
}
