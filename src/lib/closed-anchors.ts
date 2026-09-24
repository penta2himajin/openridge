/**
 * Closed-model horizontal anchor selection for the scatter (docs/ui.md §4.4).
 *
 * Default: ceiling (top closed) + the closed model nearest the open frontier
 * peak. "Show all closed": those two plus every collapsed model whose score
 * sits between them — fill the ladder the eye is already looking at, rather
 * than an arbitrary Top-N that can spill below the open-touch line.
 *
 * Pure — no DOM, no I/O.
 */
import { baseModelKey } from "./model-names";
import type { MetricId, ModelRecord } from "./models";

export interface ClosedAnchor {
  m: ModelRecord;
  score: number;
}

/** One entry per model identity, highest score on `metric`, score-desc. */
export function collapseClosedByModel(
  models: readonly ModelRecord[],
  metric: MetricId,
): ClosedAnchor[] {
  const scored: ClosedAnchor[] = [];
  for (const m of models) {
    if (!m.isClosed) continue;
    const score = m.scores[metric];
    if (typeof score !== "number") continue;
    scored.push({ m, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const out: ClosedAnchor[] = [];
  const claimed = new Set<string>();
  for (const it of scored) {
    const id = baseModelKey(it.m);
    if (claimed.has(id)) continue;
    claimed.add(id);
    out.push(it);
  }
  return out;
}

/**
 * Among collapsed closed models (score-desc), pick the one closest in score
 * to `topOpen`, skipping the ceiling entry.
 */
export function nearestToOpen(
  items: readonly ClosedAnchor[],
  topOpen: number,
): ClosedAnchor | null {
  if (items.length === 0) return null;
  const top = items[0];
  let nearest: ClosedAnchor | null = null;
  let bestDelta = Infinity;
  for (const it of items) {
    if (it === top) continue;
    const d = Math.abs(it.score - topOpen);
    if (d < bestDelta) {
      bestDelta = d;
      nearest = it;
    }
  }
  return nearest;
}

/**
 * Select which closed anchors to draw.
 *
 * - `showAll === false`: ceiling + nearest-to-open (or ceiling alone).
 * - `showAll === true`: ceiling, nearest, and every model between them in
 *   score (inclusive). Falls back to ceiling-only when there is no open peak.
 */
export function selectClosedAnchors(
  items: readonly ClosedAnchor[],
  topOpen: number | null,
  showAll: boolean,
): ClosedAnchor[] {
  if (items.length === 0) return [];
  const top = items[0];
  if (topOpen == null) return [top];
  const nearest = nearestToOpen(items, topOpen);
  if (!nearest) return [top];
  if (!showAll) return [top, nearest];

  const hi = top.score;
  const lo = nearest.score;
  return items.filter((it) => it.score <= hi && it.score >= lo);
}

/**
 * When vertical room cannot label every selected anchor, keep the ceiling and
 * the open-touch line first, then fill remaining slots with the highest scores
 * between them. Dropping by score alone would cut the open-touch line — the
 * bottom of the band — which is the opposite of what the expansion is for.
 */
export function capClosedAnchorsForLabels(
  anchors: readonly ClosedAnchor[],
  maxLabels: number,
): ClosedAnchor[] {
  if (anchors.length <= maxLabels || maxLabels <= 0) {
    return [...anchors].sort((a, b) => b.score - a.score);
  }
  const sorted = [...anchors].sort((a, b) => b.score - a.score);
  if (maxLabels === 1) return [sorted[0]];

  const ceiling = sorted[0];
  const openTouch = sorted[sorted.length - 1];
  if (ceiling === openTouch) return sorted.slice(0, maxLabels);

  const middle = sorted.filter((it) => it !== ceiling && it !== openTouch);
  const keepMiddle = middle.slice(0, Math.max(0, maxLabels - 2));
  return [ceiling, ...keepMiddle, openTouch].sort((a, b) => b.score - a.score);
}
