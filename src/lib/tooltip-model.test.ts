/**
 * Regression: the tooltip card switched to a newly-tapped model's name and
 * license correctly, but the selected-metric score stayed pinned to the
 * previously-selected model's value. Root cause and fix are documented in
 * tooltip-model.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoot, createSignal } from "solid-js";
import { createSelectedMetricView } from "./tooltip-model";
import type { MetricId, ModelRecord } from "./models";

const METRIC: MetricId = "artificial_analysis_intelligence_index";

function fakeModel(id: string, score: number): ModelRecord {
  return {
    id,
    slug: id,
    name: id,
    creator: "Test",
    creatorSlug: "test",
    isClosed: false,
    params: { total: 1e9, active: 1e9 },
    license: null,
    scores: { [METRIC]: score },
    pricing: {
      price_1m_blended_3_to_1: null,
      price_1m_input_tokens: null,
      price_1m_output_tokens: null,
    },
    speed: { tps: null, ttft: null },
    hfId: null,
    mode: null,
    releaseDate: null,
  };
}

test("selected-metric score follows the selected model, not just its name/license", () => {
  createRoot((dispose) => {
    const [selected, setSelected] = createSignal<ModelRecord | null>(
      fakeModel("model-a", 10),
    );
    const view = createSelectedMetricView(selected, () => METRIC);

    assert.equal(view()?.primary, 10, "shows model A's score first");

    // Tap model B: a real Solid render re-reads `model()` in JSX (updating
    // name/creator) but this derived value must follow the same signal.
    setSelected(fakeModel("model-b", 87));
    assert.equal(
      view()?.primary,
      87,
      "score must switch to model B's after the selection changes",
    );

    dispose();
  });
});

test("selected-metric score follows the chosen benchmark", () => {
  createRoot((dispose) => {
    const model = fakeModel("model-a", 10);
    model.scores.gpqa = 0.5;
    const [selected] = createSignal<ModelRecord | null>(model);
    const [metric, setMetric] = createSignal<MetricId>(METRIC);
    const view = createSelectedMetricView(selected, metric);

    assert.equal(view()?.primary, 10);
    setMetric("gpqa");
    assert.equal(view()?.primary, 0.5);

    dispose();
  });
});
