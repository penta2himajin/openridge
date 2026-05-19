/**
 * Compute the closest closed-model neighbours (one above, one below) for a
 * selected open model. Used by the tooltip to show "you're between X and Y".
 *
 * Tie handling: when a closed model's score is within TIE_EPS of the open
 * model's score, return a single `tie` entry instead of above/below.
 *
 * The "score" axis is the metric currently displayed on Y (passed in as the
 * `metric` arg). Vendor filter restricts candidates to the configured
 * vendors (see state.closedVendors).
 */
import type { MetricId, ModelRecord } from "./models";

const TIE_EPS = 0.5;

export interface NeighbourEntry {
  model: ModelRecord;
  score: number;
  /** signed delta from open model (negative = below, positive = above) */
  delta: number;
}

export interface Neighbours {
  /** Either `tie` is set (an exact-ish match), or `above`/`below` (or both / one). */
  tie?: NeighbourEntry;
  above?: NeighbourEntry;
  below?: NeighbourEntry;
}

export function findClosedNeighbours(
  open: ModelRecord,
  candidates: readonly ModelRecord[],
  metric: MetricId,
  vendors: ReadonlySet<string>,
): Neighbours | null {
  if (open.isClosed) return null;
  const openScore = open.scores[metric];
  if (typeof openScore !== "number") return null;

  const pool: NeighbourEntry[] = [];
  for (const c of candidates) {
    if (!c.isClosed) continue;
    if (!vendors.has(c.creatorSlug)) continue;
    const s = c.scores[metric];
    if (typeof s !== "number") continue;
    pool.push({ model: c, score: s, delta: s - openScore });
  }
  if (pool.length === 0) return null;

  // Tie first — closest absolute delta.
  let tie: NeighbourEntry | undefined;
  for (const e of pool) {
    if (Math.abs(e.delta) < TIE_EPS) {
      if (!tie || Math.abs(e.delta) < Math.abs(tie.delta)) tie = e;
    }
  }
  if (tie) return { tie };

  let above: NeighbourEntry | undefined;
  let below: NeighbourEntry | undefined;
  for (const e of pool) {
    if (e.delta > 0) {
      if (!above || e.delta < above.delta) above = e;
    } else if (e.delta < 0) {
      if (!below || e.delta > below.delta) below = e;
    }
  }
  return { above, below };
}
