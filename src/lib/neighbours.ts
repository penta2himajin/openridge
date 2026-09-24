/**
 * Compute the closest closed-model neighbours (one above, one below) for a
 * selected open model. Used by the tooltip to show "you're between X and Y".
 *
 * Candidates are collapsed first via {@link lineageModelKey}: effort tiers and
 * date pins of the same product line become one entry — the highest score on
 * the current metric. That keeps "Closest closed" reading as a
 * flagship-to-flagship gap rather than landing on a medium tier that happens
 * to sit nearer in score space, or on an older dated snapshot of the same
 * model (Claude 3.5 Sonnet June vs Oct).
 *
 * Chart anchors still keep date pins separate (docs/ui.md §4.4); only this
 * tooltip comparison collapses them.
 *
 * Note: "best scoring" is not always the highest *effort* name. AA sometimes
 * scores a mid tier above a high tier on a given metric (e.g. Gemini 3.7
 * Flash medium > high on Intelligence Index), and that mid tier correctly
 * represents the model's ceiling for that Index.
 *
 * Tie handling: when a closed model's (best) score is within TIE_EPS of the
 * open model's score, return a single `tie` entry instead of above/below.
 *
 * Vendor filter restricts candidates to the configured vendors (see
 * state.closedVendors).
 */
import type { MetricId, ModelRecord } from "./models";
import { lineageModelKey } from "./model-names";

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

/**
 * Keep one closed entry per product lineage: the highest score on `metric`.
 * Preview / Fallback / ChatGPT qualifiers stay separate via lineageModelKey.
 */
function bestTierClosed(
  candidates: readonly ModelRecord[],
  metric: MetricId,
  vendors: ReadonlySet<string>,
): NeighbourEntry[] {
  const best = new Map<string, NeighbourEntry>();
  for (const c of candidates) {
    if (!c.isClosed) continue;
    if (!vendors.has(c.creatorSlug)) continue;
    const s = c.scores[metric];
    if (typeof s !== "number") continue;
    const key = lineageModelKey(c);
    const prev = best.get(key);
    if (!prev || s > prev.score) {
      // delta filled in once we know the open score
      best.set(key, { model: c, score: s, delta: 0 });
    }
  }
  return [...best.values()];
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

  const pool = bestTierClosed(candidates, metric, vendors).map((e) => ({
    ...e,
    delta: e.score - openScore,
  }));
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
