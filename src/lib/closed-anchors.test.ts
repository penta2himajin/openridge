import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collapseClosedByModel,
  selectClosedAnchors,
  capClosedAnchorsForLabels,
  type ClosedAnchor,
} from "./closed-anchors";
import type { MetricId, ModelRecord } from "./models";

const METRIC: MetricId = "artificial_analysis_intelligence_index";

function model(
  partial: Pick<ModelRecord, "id" | "name" | "creatorSlug" | "isClosed"> & {
    score: number;
  },
): ModelRecord {
  return {
    id: partial.id,
    slug: partial.id,
    name: partial.name,
    creator: partial.creatorSlug,
    creatorSlug: partial.creatorSlug,
    isClosed: partial.isClosed,
    params: { total: null, active: null },
    license: null,
    scores: { [METRIC]: partial.score },
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

function anchor(
  id: string,
  name: string,
  score: number,
  creatorSlug = "openai",
): ClosedAnchor {
  return {
    m: model({ id, name, creatorSlug, isClosed: true, score }),
    score,
  };
}

test("collapseClosedByModel: keeps best effort per identity", () => {
  const models = [
    model({
      id: "a-max",
      name: "Claude Opus 5.5 (Adaptive Reasoning, Max Effort, Default Fallback)",
      creatorSlug: "anthropic",
      isClosed: true,
      score: 57,
    }),
    model({
      id: "a-med",
      name: "Claude Opus 5.5 (Adaptive Reasoning, Medium Effort, Default Fallback)",
      creatorSlug: "anthropic",
      isClosed: true,
      score: 51,
    }),
    model({
      id: "b",
      name: "GPT-6 Astra (max)",
      creatorSlug: "openai",
      isClosed: true,
      score: 52,
    }),
  ];
  const items = collapseClosedByModel(models, METRIC);
  assert.equal(items.length, 2);
  assert.equal(items[0].m.id, "a-max");
  assert.equal(items[1].m.id, "b");
});

test("selectClosedAnchors: default is ceiling + nearest to open peak", () => {
  const items = [
    anchor("ceil", "A (max)", 50),
    anchor("mid", "B (max)", 40),
    anchor("near", "C (max)", 30),
    anchor("low", "D (max)", 10),
  ];
  const picked = selectClosedAnchors(items, 29, false);
  assert.deepEqual(
    picked.map((p) => p.m.id),
    ["ceil", "near"],
  );
});

test("selectClosedAnchors: showAll fills the band between ceiling and nearest", () => {
  const items = [
    anchor("ceil", "A (max)", 50),
    anchor("hi", "B (max)", 45),
    anchor("mid", "C (max)", 40),
    anchor("near", "D (max)", 30),
    anchor("below", "E (max)", 10),
  ];
  const picked = selectClosedAnchors(items, 29, true);
  assert.deepEqual(
    picked.map((p) => p.m.id),
    ["ceil", "hi", "mid", "near"],
  );
  // Below the open-touch line stays out — Top-N would have kept chasing down.
  assert.ok(!picked.some((p) => p.m.id === "below"));
});

test("capClosedAnchorsForLabels: always retains ceiling and open-touch", () => {
  const anchors = [
    anchor("ceil", "A", 50),
    anchor("a", "B", 48),
    anchor("b", "C", 46),
    anchor("c", "D", 44),
    anchor("near", "E", 30),
  ];
  const capped = capClosedAnchorsForLabels(anchors, 3);
  assert.equal(capped.length, 3);
  assert.equal(capped[0].m.id, "ceil");
  assert.equal(capped[capped.length - 1].m.id, "near");
  // One middle slot — highest between the endpoints.
  assert.equal(capped[1].m.id, "a");
});
