/**
 * Top bar — 56px, four elements: brand · Index dropdown · Active|Total|Compare
 * segmented control · ⓘ info icon.
 *
 * Spec: docs/ui.md §1, §2.
 *
 * TODO: implement per spec.
 */

export default function Header() {
  return (
    <header class="h-14 border-b border-fg-subtle flex items-center px-4 gap-6">
      {/* TODO docs/ui.md §2.1: brand mark "ridge" Geist Mono lowercase 16px */}
      <span class="font-mono text-base tracking-tight text-fg-default">
        ridge
      </span>
      {/* TODO docs/ui.md §2.2: Index dropdown */}
      {/* TODO docs/ui.md §2.3: Active/Total/Compare segmented control */}
      {/* TODO docs/ui.md §2.4: ⓘ info icon */}
    </header>
  );
}
