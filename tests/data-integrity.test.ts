/**
 * Data-integrity guards over data/models.json.
 *
 * These do not re-fetch anything — they assert internal consistency of the
 * committed snapshot, so they run offline in CI. Their job is to catch the
 * class of bug where a MoE model is silently stored as dense (active = total)
 * or an override fails to reach the frontier. See PR: MiniMax-M2.7 fix.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeParetoFrontier } from "../src/lib/pareto";
import { METRICS } from "../src/lib/metrics";
import type { ModelsSnapshot } from "../src/lib/models";

const DATA = (p: string) => resolve(import.meta.dirname, "..", "data", p);
const snapshot = JSON.parse(
  readFileSync(DATA("models.json"), "utf8"),
) as ModelsSnapshot;
const manual = JSON.parse(
  readFileSync(DATA("manual_params.json"), "utf8"),
) as Record<string, { total: number; active: number } | unknown>;

const models = snapshot.models;
const bySlug = new Map(models.map((m) => [m.slug, m]));
const MOE_RATIO = 0.999; // active < total*MOE_RATIO ⇒ genuinely MoE (not rounding noise)

test("stored paretoByMetric matches a fresh recomputation (frontier ↔ params consistency)", () => {
  // The single strongest guard: if any model's params change without the
  // frontier being regenerated, the committed frontier goes stale and this
  // fails. It is exactly what keeps the MiniMax-M2.7 correction from silently
  // not reaching the chart.
  const openActive = models.filter(
    (x) => !x.isClosed && x.params.active != null,
  );
  const openTotal = models.filter((x) => !x.isClosed && x.params.total != null);
  for (const metric of METRICS) {
    const active = computeParetoFrontier(
      openActive,
      (m) => m.params.active,
      (m) => m.scores[metric.id] ?? null,
    ).map((m) => m.id);
    const total = computeParetoFrontier(
      openTotal,
      (m) => m.params.total,
      (m) => m.scores[metric.id] ?? null,
    ).map((m) => m.id);
    const stored = snapshot.paretoByMetric[metric.id];
    assert.ok(stored, `paretoByMetric missing entry for ${metric.id}`);
    assert.deepEqual(
      active,
      stored!.active,
      `active frontier stale for ${metric.id}`,
    );
    assert.deepEqual(
      total,
      stored!.total,
      `total frontier stale for ${metric.id}`,
    );
  }
});

test("every manual_params override is honored in models.json", () => {
  // Guards that a hand-curated correction actually reaches the snapshot. A
  // MoE override that silently fails to apply is how MiniMax-M2.7 ended up on
  // the wrong side of the frontier.
  const mismatches: string[] = [];
  for (const [slug, v] of Object.entries(manual)) {
    if (slug.startsWith("_")) continue;
    if (!v || typeof v !== "object" || !("total" in v) || !("active" in v))
      continue;
    const ov = v as { total: number; active: number };
    const m = bySlug.get(slug);
    if (!m) continue; // slug may predate / postdate the current AA feed
    if (m.params.total !== ov.total || m.params.active !== ov.active) {
      mismatches.push(
        `${slug}: manual ${ov.total}/${ov.active} vs stored ${m.params.total}/${m.params.active}`,
      );
    }
  }
  assert.deepEqual(
    mismatches,
    [],
    `manual_params not reflected in models.json:\n  ${mismatches.join("\n  ")}`,
  );
});

test("known-MoE-shaped families are stored with active < total", () => {
  // Curated registry of families confirmed to have active < total — whether
  // true MoE routing or a Gemma-style "effective params" architecture. Any
  // member stored as dense (active===total) is a missing override. Grow this
  // list as new families are added (and add the matching data/manual_params.json
  // or data/hf_aliases.json + data/moe_overrides.json entries) — the two move
  // together. There is no reliable is_moe flag on the AA feed, and — per the
  // removal of scripts/build-data.ts's name-parsing heuristic — the AA display
  // name is never trusted for this either, so this list stays hand-kept.
  //
  // NOTE: lfm2-5-8b-a1b, mixtral-8x7b-instruct, mistral-8x22b-instruct,
  // gemma-4-e2b(-non-reasoning), gemma-4-e4b(-non-reasoning), gemma-3n-e2b,
  // gemma-3n-e4b(-preview-0520) are also confirmed active<total (see PR) but
  // are deliberately omitted here until the next `npm run refresh` regenerates
  // data/models.json from the newly-added hf_aliases.json/moe_overrides.json
  // entries — adding them now would fail against the still-stale snapshot.
  const KNOWN_MOE_SLUGS = [
    "minimax-m1-40k",
    "minimax-m1-80k",
    "minimax-m2",
    "minimax-m2-1",
    "minimax-m2-5",
    "minimax-m2-7",
    "arctic-instruct",
    "gpt-oss-120b",
    "gpt-oss-120b-low",
    "ling-1t",
    "ring-1t",
  ];
  const offenders: string[] = [];
  for (const slug of KNOWN_MOE_SLUGS) {
    const m = bySlug.get(slug);
    if (!m) continue;
    if (m.params.active == null || m.params.total == null) {
      offenders.push(`${slug} has null params`);
    } else if (m.params.active >= m.params.total * MOE_RATIO) {
      offenders.push(
        `${slug} stored dense (active=total=${(m.params.total / 1e9).toFixed(1)}B)`,
      );
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `known-MoE families stored as dense:\n  ${offenders.join("\n  ")}`,
  );
});

test("every open model with params is either on a frontier or dominated (no orphan bug)", () => {
  // Sanity: the frontier union is a subset of open models with params. Guards
  // against paretoByMetric referencing ids that don't exist / aren't eligible.
  const eligible = new Set(models.filter((m) => !m.isClosed).map((m) => m.id));
  for (const [metricId, fr] of Object.entries(snapshot.paretoByMetric)) {
    if (!fr) continue;
    for (const id of [...fr.active, ...fr.total]) {
      assert.ok(
        eligible.has(id),
        `${metricId} frontier references non-open/unknown id ${id}`,
      );
    }
  }
});
