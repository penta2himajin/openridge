/**
 * Pareto frontier computation.
 * X minimised, Y maximised. O(n log n) via sort-and-sweep.
 * Pure module — no DOM, no I/O.
 *
 * Used by scripts/build-data.ts to pre-compute frontiers per tracked
 * metric; the client reads pre-computed ids from
 * ModelsSnapshot.paretoByMetric and does not recompute.
 */

export function computeParetoFrontier<T>(
  items: readonly T[],
  xOf: (t: T) => number | null | undefined,
  yOf: (t: T) => number | null | undefined,
): T[] {
  const points = items
    .map((ref) => ({ ref, x: xOf(ref), y: yOf(ref) }))
    .filter(
      (p): p is { ref: T; x: number; y: number } =>
        p.x != null && p.y != null && Number.isFinite(p.x) && Number.isFinite(p.y),
    );

  // Sort by x ascending; tie-break by y descending so the survivor at each x is the best.
  points.sort((a, b) => a.x - b.x || b.y - a.y);

  // Sweep: keep the point only if its y strictly exceeds the running max y.
  const frontier: { ref: T; x: number; y: number }[] = [];
  let bestY = -Infinity;
  for (const p of points) {
    if (p.y > bestY) {
      frontier.push(p);
      bestY = p.y;
    }
  }
  return frontier.map((p) => p.ref);
}
