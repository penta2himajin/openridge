/**
 * Top bar — 56px desktop / 56px mobile with `Index:` prefix dropped.
 * Spec: docs/ui.md §1, §2, §7.3, §7.4.
 */
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { AppState, XView } from "../lib/state";
import { METRICS, METRICS_BY_ID } from "../lib/metrics";
import type { MetricInfo } from "../lib/metrics";
import { useIsMobile } from "../lib/breakpoint";

interface HeaderProps {
  state: AppState;
  onInfoClick: () => void;
}

export default function Header(props: HeaderProps) {
  const isMobile = useIsMobile();
  return (
    <header
      class="flex-shrink-0 border-b border-fg-subtle bg-bg-base"
      style={{ "padding-top": "env(safe-area-inset-top)" }}
    >
      {/* Desktop: single row, brand left, settings right. */}
      <div class="hidden sm:flex h-14 items-center px-4 gap-3">
        <a
          href={import.meta.env.BASE_URL}
          class="flex items-baseline select-none flex-shrink-0 text-2xl leading-none"
          style={{ "letter-spacing": "-0.02em" }}
          aria-label="OpenRidge home"
        >
          <span class="font-sans font-normal italic text-fg-muted">Open</span>
          <span
            class="font-mono font-bold text-fg-default"
            style={{ "margin-left": "0.08em" }}
          >
            Ridge
          </span>
        </a>

        <div class="flex-1" />

        <IndexDropdown state={props.state} compact={false} />
        <SegmentedControl state={props.state} compact={false} />
        <InfoButton onClick={props.onInfoClick} compact={false} />
      </div>

      {/* Mobile: 2 rows. Row 1 = brand + ⓘ; Row 2 = Index dropdown + segmented. */}
      <div class="sm:hidden">
        <div class="h-12 flex items-center justify-between px-3">
          <a
            href={import.meta.env.BASE_URL}
            class="flex items-baseline select-none flex-shrink-0 text-2xl leading-none"
            style={{ "letter-spacing": "-0.02em" }}
            aria-label="OpenRidge home"
          >
            <span class="font-sans font-normal italic text-fg-muted">Open</span>
            <span
              class="font-mono font-bold text-fg-default"
              style={{ "margin-left": "0.08em" }}
            >
              Ridge
            </span>
          </a>
          <InfoButton onClick={props.onInfoClick} compact={true} />
        </div>
        <div class="h-12 flex items-center px-3 gap-2 pb-1">
          <div class="flex-1 min-w-0">
            <IndexDropdown state={props.state} compact={true} />
          </div>
          <SegmentedControl state={props.state} compact={true} />
        </div>
      </div>
    </header>
  );
}

function InfoButton(props: { onClick: () => void; compact: boolean }) {
  return (
    <button
      type="button"
      class="flex-shrink-0 grid place-items-center text-fg-muted hover:text-fg-default transition-colors"
      classList={{
        "w-11 h-11": props.compact,
        "w-8 h-8": !props.compact,
      }}
      aria-label="About this dataset"
      onClick={props.onClick}
    >
      <span aria-hidden="true" class="text-base">
        ⓘ
      </span>
    </button>
  );
}

// ─── Segmented control ─────────────────────────────────────────────────────

const VIEWS: { id: XView; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "total", label: "Total" },
  { id: "compare", label: "Compare" },
];

function SegmentedControl(props: { state: AppState; compact: boolean }) {
  let containerRef!: HTMLDivElement;
  const [pillStyle, setPillStyle] = createSignal({ left: 4, width: 60 });

  const measure = () => {
    if (!containerRef) return;
    const idx = VIEWS.findIndex((v) => v.id === props.state.xview());
    const cell = containerRef.querySelectorAll<HTMLButtonElement>("[data-cell]")[idx];
    if (cell) {
      setPillStyle({ left: cell.offsetLeft, width: cell.offsetWidth });
    }
  };

  onMount(() => {
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(containerRef);
    onCleanup(() => ro.disconnect());
  });

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="X axis"
      class="relative flex-shrink-0 border border-fg-subtle rounded-lg p-1 flex"
      classList={{ "h-8": !props.compact, "h-10": props.compact }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          const idx = VIEWS.findIndex((v) => v.id === props.state.xview());
          const next = e.key === "ArrowLeft"
            ? (idx - 1 + VIEWS.length) % VIEWS.length
            : (idx + 1) % VIEWS.length;
          props.state.setXview(VIEWS[next].id);
          // Refocus the active cell after state change
          queueMicrotask(() => {
            containerRef.querySelectorAll<HTMLButtonElement>("[data-cell]")[next]?.focus();
          });
          e.preventDefault();
        }
      }}
    >
      <span
        aria-hidden="true"
        class="absolute top-1 bottom-1 bg-bg-elevated rounded-md transition-transform"
        style={{
          width: `${pillStyle().width}px`,
          transform: `translateX(${pillStyle().left - 4}px)`,
          "transition-timing-function": "cubic-bezier(0.4, 0, 0.2, 1)",
          "transition-duration": "200ms",
        }}
      />
      <For each={VIEWS}>
        {(v) => (
          <button
            data-cell={v.id}
            type="button"
            role="tab"
            aria-selected={props.state.xview() === v.id}
            tabIndex={props.state.xview() === v.id ? 0 : -1}
            class="relative z-[1] px-3 text-sm font-medium transition-colors"
            classList={{
              "text-fg-default": props.state.xview() === v.id,
              "text-fg-muted hover:text-fg-default": props.state.xview() !== v.id,
            }}
            onClick={() => props.state.setXview(v.id)}
            onTransitionEnd={measure}
          >
            {v.label}
          </button>
        )}
      </For>
    </div>
  );
}

// ─── Index dropdown ────────────────────────────────────────────────────────

function IndexDropdown(props: { state: AppState; compact: boolean }) {
  const [open, setOpen] = createSignal(false);
  const [search, setSearch] = createSignal("");
  let triggerRef!: HTMLButtonElement;
  let panelRef!: HTMLDivElement;

  const selectedLabel = () => METRICS_BY_ID.get(props.state.metric())?.label ?? "—";

  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open()) return;
      const t = e.target as Node;
      if (!triggerRef?.contains(t) && !panelRef?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open()) {
        setOpen(false);
        triggerRef.focus();
      }
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    });
  });

  const groups = () => {
    const q = search().trim().toLowerCase();
    const flat = !!q;
    const filtered = METRICS.filter(
      (m) =>
        !q ||
        m.label.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q),
    );
    if (flat) return [{ name: "", items: filtered }];
    const map = new Map<string, MetricInfo[]>();
    for (const m of filtered) {
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  };

  const select = (id: MetricInfo["id"]) => {
    props.state.setMetric(id);
    setOpen(false);
    setSearch("");
    triggerRef.focus();
  };

  return (
    // `relative` gives the desktop panel a positioned ancestor to anchor to —
    // without it the `absolute` panel resolves against the viewport and jumps
    // to the top-left, clipped. min-w-0 lets the trigger label truncate on
    // mobile where this sits inside a flex-1 column.
    <div class="relative flex max-w-full min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open()}
        class="inline-flex items-center gap-1 max-w-full min-w-0 px-2 py-1 rounded-md hover:bg-bg-elevated transition-colors min-h-[36px] sm:min-h-[28px]"
        onClick={() => setOpen((v) => !v)}
      >
        <Show when={!props.compact}>
          <span class="font-mono text-[11px] uppercase tracking-wide text-fg-muted">
            Index:
          </span>
        </Show>
        <span class="text-sm font-medium text-fg-default truncate">{selectedLabel()}</span>
        <span aria-hidden="true" class="text-fg-muted text-xs">
          ▾
        </span>
      </button>

      <Show when={open()}>
        {props.compact ? (
          <BottomSheet onClose={() => setOpen(false)}>
            <DropdownBody
              ref={(el) => (panelRef = el)}
              groups={groups()}
              search={search()}
              setSearch={setSearch}
              selectedId={props.state.metric()}
              onSelect={select}
            />
          </BottomSheet>
        ) : (
          <div
            ref={panelRef}
            class="absolute z-50 top-full right-0 mt-1 w-[320px] max-w-[calc(100vw-1rem)] max-h-[480px] overflow-auto rounded-lg border border-fg-subtle bg-bg-elevated shadow-2xl"
            role="listbox"
          >
            <DropdownBody
              ref={() => {}}
              groups={groups()}
              search={search()}
              setSearch={setSearch}
              selectedId={props.state.metric()}
              onSelect={select}
            />
          </div>
        )}
      </Show>
    </div>
  );
}

function DropdownBody(props: {
  ref: (el: HTMLDivElement) => void;
  groups: { name: string; items: MetricInfo[] }[];
  search: string;
  setSearch: (v: string) => void;
  selectedId: MetricInfo["id"];
  onSelect: (id: MetricInfo["id"]) => void;
}) {
  let inputRef!: HTMLInputElement;
  onMount(() => {
    inputRef.focus();
  });
  return (
    <div ref={props.ref} class="flex flex-col">
      <div class="sticky top-0 bg-bg-elevated border-b border-fg-subtle focus-within:border-accent transition-colors px-3 py-2">
        <input
          ref={inputRef}
          type="search"
          placeholder="Search benchmarks…"
          class="w-full bg-transparent outline-none text-sm text-fg-default placeholder:text-fg-muted py-1.5"
          value={props.search}
          onInput={(e) => props.setSearch(e.currentTarget.value)}
        />
      </div>
      <ul class="py-2">
        <For each={props.groups}>
          {(group) => (
            <>
              <Show when={group.name}>
                <li class="px-3 pt-3 pb-1 font-mono text-[11px] uppercase tracking-wide text-fg-muted">
                  {group.name}
                </li>
              </Show>
              <For each={group.items}>
                {(item) => {
                  const isSel = () => props.selectedId === item.id;
                  return (
                    <li class="px-1.5">
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSel()}
                        class="w-full text-left rounded-md px-2.5 py-1.5 min-h-[44px] sm:min-h-[32px] text-sm font-medium transition-colors flex items-center"
                        classList={{
                          "bg-bg-high text-fg-default": isSel(),
                          "text-fg-muted hover:bg-bg-high/50 hover:text-fg-default": !isSel(),
                        }}
                        onClick={() => props.onSelect(item.id)}
                      >
                        {item.label}
                      </button>
                    </li>
                  );
                }}
              </For>
            </>
          )}
        </For>
      </ul>
    </div>
  );
}

// ─── Bottom sheet (mobile dropdown variant) ────────────────────────────────

function BottomSheet(props: { onClose: () => void; children: any }) {
  return (
    <div
      class="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        class="absolute inset-0 bg-bg-base/60 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={props.onClose}
      />
      <div
        class="relative bg-bg-elevated rounded-t-2xl border-t border-fg-subtle max-h-[80vh] flex flex-col animate-slide-up"
        style={{
          "padding-bottom": "env(safe-area-inset-bottom)",
          animation: "ridge-slide-up 240ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div class="flex justify-center pt-2 pb-1">
          <span class="w-9 h-1 rounded-full bg-fg-subtle" />
        </div>
        <div class="flex-1 overflow-y-auto">{props.children}</div>
      </div>
      <style>{`
        @keyframes ridge-slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
