/**
 * Pareto frontier computation.
 * Spec: docs/architecture.md §4 ("Pareto 計算"):
 *   X minimised, Y maximised. O(n log n) via Y-descending sort + single sweep.
 *
 * This module is pure — no DOM, no I/O. Used by scripts/build-data.ts to
 * pre-compute frontiers per tracked metric; the client should consume the
 * pre-computed ids from ModelsSnapshot.paretoByMetric and not recompute.
 */

export interface ParetoPoint<T> {
  ref: T;
  x: number;
  y: number;
}

/**
 * Returns the subset of `points` that lie on the Pareto frontier with X
 * minimised and Y maximised. Ties on X keep the highest Y.
 */
export function computeParetoFrontier<T>(
  items: readonly T[],
  xOf: (t: T) => number | null | undefined,
  yOf: (t: T) => number | null | undefined,
): T[] {
  // TODO: implement. See docs/architecture.md §4.
  void items;
  void xOf;
  void yOf;
  throw new Error("not implemented");
}
