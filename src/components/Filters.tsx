/**
 * Chip-style filter row anchored to the bottom strip (48px).
 *
 * Spec: docs/ui.md §5.
 * Chip visual spec: docs/framer-prompts.md "Filter chip".
 *
 * TODO: implement per spec.
 */

export default function Filters() {
  return (
    <nav
      class="h-12 border-t border-fg-subtle flex items-center px-4 gap-3"
      aria-label="Model filters"
    >
      {/* TODO: chips — Apache/MIT, <10B, <30B, <100B, reasoning, vision */}
    </nav>
  );
}
