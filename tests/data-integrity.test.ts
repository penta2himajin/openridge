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
const moeOverrides = JSON.parse(
  readFileSync(DATA("moe_overrides.json"), "utf8"),
) as Record<string, { active: number } | unknown>;

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

test("every moe_overrides entry is honored in models.json", () => {
  // Symmetric to the manual_params guard above, and it exists because the
  // whole Qwen3.5/3.6/3.8 hybrid family needed overrides at once: those
  // interleave linear and full attention, which the config-based estimator
  // reads 18-33% low. An override that silently stops applying puts those
  // points back where they were, and two of them sit on a frontier.
  const mismatches: string[] = [];
  for (const [repo, v] of Object.entries(moeOverrides)) {
    if (repo.startsWith("_")) continue;
    if (!v || typeof v !== "object" || !("active" in v)) continue;
    const want = (v as { active: number }).active;
    for (const m of models) {
      if (m.hfId !== repo) continue;
      // manual_params wins over the HF path entirely, so a slug carrying one
      // is legitimately free to disagree.
      if (Object.prototype.hasOwnProperty.call(manual, m.slug)) continue;
      // An estimate above total is clamped back to total by design.
      if (want > (m.params.total ?? 0)) continue;
      if (m.params.active !== want) {
        mismatches.push(
          `${m.slug} (${repo}): override ${want} vs stored ${m.params.active}`,
        );
      }
    }
  }
  assert.deepEqual(
    mismatches,
    [],
    `moe_overrides not reflected in models.json:\n  ${mismatches.join("\n  ")}`,
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
  // NOTE: gemma-3n-e4b-preview-0520 is also a known "effective params" model
  // but resolves to null params (the litert-preview repo ships no safetensors
  // metadata), so it can't be asserted here.
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
    "lfm2-5-8b-a1b",
    "mixtral-8x7b-instruct",
    "mistral-8x22b-instruct",
    "gemma-3n-e2b",
    "gemma-3n-e4b",
    "gemma-4-e2b",
    "gemma-4-e2b-non-reasoning",
    "gemma-4-e4b",
    "gemma-4-e4b-non-reasoning",
    // Gemma 4's routed-MoE pair: the estimator read `top_k_experts` as absent
    // and stored these dense at 26.5B active until the key-alias fix.
    "gemma-4-26b-a4b",
    "gemma-4-26b-a4b-non-reasoning",
    "diffusiongemma-26b-a4b",
    // Mamba-2/MoE hybrids — the config estimator can't model them, so these
    // ride entirely on data/moe_overrides.json.
    "nemotron-3-nano-omni-30b-a3b",
    "nvidia-nemotron-3-nano-30b-a3b",
    "nvidia-nemotron-3-nano-30b-a3b-reasoning",
    "nvidia-nemotron-3-super-120b-a12b",
    "nvidia-nemotron-3-ultra-550b-a55b",
    "nemotron-cascade-2-30b-a3b",
    // 2.8T total / 104B active — was stored fully dense, the single largest
    // misplacement on the chart.
    "kimi-k3-low",
    // Multimodal wrappers: the LLM config is nested a level or two down
    // (`thinker_config.text_config`), which the estimator now walks.
    "qwen3-omni-30b-a3b-instruct",
    "qwen3-omni-30b-a3b-reasoning",
    "kimi-linear-48b-a3b-instruct",
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

test("no model activates more parameters than it contains", () => {
  // A token cannot route through more weights than the checkpoint holds, so
  // active > total is always a bug — a bad MoE estimate, or an alias pointing
  // at a quantized/partial repo whose `safetensors.total` understates the
  // model. Regression: nvidia-nemotron-3-super-120b-a12b was aliased to the
  // NVFP4 upload and stored 73.3B active against 67.2B total.
  const offenders = models
    .filter(
      (m) =>
        m.params.active != null &&
        m.params.total != null &&
        m.params.active > m.params.total,
    )
    .map(
      (m) =>
        `${m.slug}: active ${(m.params.active! / 1e9).toFixed(1)}B > total ${(m.params.total! / 1e9).toFixed(1)}B`,
    );
  assert.deepEqual(
    offenders,
    [],
    `active exceeds total:\n  ${offenders.join("\n  ")}`,
  );
});
