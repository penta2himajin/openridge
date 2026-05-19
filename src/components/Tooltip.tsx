/**
 * Hover detail card pinned to the upper-right of a hovered scatter point.
 *
 * Spec: docs/ui.md §4.5 (content + position),
 *       docs/design.md §5 (glass-feel, motion),
 *       docs/framer-prompts.md "Tooltip card" (visual details).
 *
 * Position is fixed relative to the point — not cursor-following — to avoid
 * jitter. Entry: opacity 0→1 + translateY 4px→0 over 80ms ease-out.
 *
 * TODO: implement per spec.
 */

export interface TooltipProps {
  name: string;
  creator: string;
  license: string | null;
  active: number | null;
  total: number | null;
  indexLabel: string;
  indexValue: number | null;
  paretoFooter: "Pareto (active)" | "Pareto (total)" | "Pareto (both)" | "";
}

export default function Tooltip(_props: TooltipProps) {
  // TODO: implement
  return null;
}
