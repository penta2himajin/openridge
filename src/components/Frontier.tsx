/**
 * Main scatter plot — Pareto frontier of open models with closed-model
 * horizontal anchors.
 *
 * Spec: docs/ui.md §4 (axes, points, Barbell, frontier, closed lines, tooltip),
 *       docs/design.md §4 (visual rules).
 *
 * Stack note: base render via @observablehq/plot, hover and frontier-draw
 * animations overlaid with D3 / hand-written SVG. Plot defaults (axis ticks,
 * colours, legend) are overridden via marks/style/color options.
 *
 * TODO: implement per spec.
 */

export default function Frontier() {
  return (
    <section
      class="flex-1 relative"
      aria-label="Parameters vs intelligence scatter"
    >
      {/* TODO: Observable Plot scatter mount target */}
    </section>
  );
}
