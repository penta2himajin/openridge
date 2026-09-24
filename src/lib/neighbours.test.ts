import { test } from "node:test";
import assert from "node:assert/strict";
import { findClosedNeighbours } from "./neighbours";
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

const VENDORS = new Set(["openai", "anthropic"]);

test("findClosedNeighbours: collapses effort tiers to the best-scoring one", () => {
  // Open sits at 40 — nearer Claude medium (40.1) than Claude max (50),
  // and nearer GPT medium (39.5) than GPT max (47). Pre-collapse behaviour
  // would pick those mediums; best-tier collapse must pick the maxes.
  const open = model({
    id: "open-1",
    name: "Open Mid",
    creatorSlug: "qwen",
    isClosed: false,
    score: 40,
  });
  const closed = [
    model({
      id: "claude-max",
      name: "Claude Opus 5 (Adaptive Reasoning, Max Effort)",
      creatorSlug: "anthropic",
      isClosed: true,
      score: 50,
    }),
    model({
      id: "claude-med",
      name: "Claude Opus 5 (Adaptive Reasoning, Medium Effort)",
      creatorSlug: "anthropic",
      isClosed: true,
      score: 40.1,
    }),
    model({
      id: "gpt-max",
      name: "GPT-6 Sol (max)",
      creatorSlug: "openai",
      isClosed: true,
      score: 47,
    }),
    model({
      id: "gpt-med",
      name: "GPT-6 Sol (medium)",
      creatorSlug: "openai",
      isClosed: true,
      score: 39.5,
    }),
  ];

  const n = findClosedNeighbours(open, closed, METRIC, VENDORS);
  assert.ok(n);
  assert.equal(n!.tie, undefined);
  assert.equal(n!.above?.model.id, "gpt-max"); // 47 is the nearest best-tier above
  assert.equal(n!.below, undefined); // both best tiers sit above 40
});

test("findClosedNeighbours: below neighbour is also a best tier", () => {
  const open = model({
    id: "open-2",
    name: "Open High",
    creatorSlug: "qwen",
    isClosed: false,
    score: 48,
  });
  const closed = [
    model({
      id: "claude-max",
      name: "Claude Opus 5 (Adaptive Reasoning, Max Effort)",
      creatorSlug: "anthropic",
      isClosed: true,
      score: 50.8,
    }),
    model({
      id: "claude-med",
      name: "Claude Opus 5 (Adaptive Reasoning, Medium Effort)",
      creatorSlug: "anthropic",
      isClosed: true,
      score: 44.8,
    }),
    model({
      id: "gpt-max",
      name: "GPT-6 Sol (max)",
      creatorSlug: "openai",
      isClosed: true,
      score: 47.5,
    }),
    model({
      id: "gpt-low",
      name: "GPT-6 Sol (low)",
      creatorSlug: "openai",
      isClosed: true,
      score: 33.9,
    }),
  ];

  const n = findClosedNeighbours(open, closed, METRIC, VENDORS);
  assert.ok(n);
  assert.equal(n!.above?.model.id, "claude-max");
  // GPT-6 Sol's best tier (47.5) is below 48 — not its low tier.
  assert.equal(n!.below?.model.id, "gpt-max");
});

test("findClosedNeighbours: distinct models (Fallback) are not collapsed together", () => {
  const open = model({
    id: "open-3",
    name: "Open",
    creatorSlug: "qwen",
    isClosed: false,
    score: 45,
  });
  const closed = [
    model({
      id: "opus-max",
      name: "Claude Opus 5 (Adaptive Reasoning, Max Effort)",
      creatorSlug: "anthropic",
      isClosed: true,
      score: 50,
    }),
    model({
      id: "fable-fb",
      name: "Claude Fable 5.1 (Adaptive Reasoning, Low Effort, Default Fallback)",
      creatorSlug: "anthropic",
      isClosed: true,
      score: 46,
    }),
  ];

  const n = findClosedNeighbours(open, closed, METRIC, VENDORS);
  assert.ok(n);
  // Fallback parenthetical keeps this a distinct model, so it remains the
  // nearest above even though its effort token says "Low".
  assert.equal(n!.above?.model.id, "fable-fb");
});

test("findClosedNeighbours: respects vendor filter", () => {
  const open = model({
    id: "open-4",
    name: "Open",
    creatorSlug: "qwen",
    isClosed: false,
    score: 40,
  });
  const closed = [
    model({
      id: "gpt",
      name: "GPT-6 Sol (max)",
      creatorSlug: "openai",
      isClosed: true,
      score: 47,
    }),
    model({
      id: "claude",
      name: "Claude Opus 5 (Adaptive Reasoning, Max Effort)",
      creatorSlug: "anthropic",
      isClosed: true,
      score: 41,
    }),
  ];

  const n = findClosedNeighbours(open, closed, METRIC, new Set(["openai"]));
  assert.ok(n);
  assert.equal(n!.above?.model.id, "gpt");
  assert.equal(n!.below, undefined);
});

test("findClosedNeighbours: returns null for closed selection or missing score", () => {
  const closed = model({
    id: "c",
    name: "GPT-6 Sol (max)",
    creatorSlug: "openai",
    isClosed: true,
    score: 47,
  });
  assert.equal(findClosedNeighbours(closed, [closed], METRIC, VENDORS), null);

  const openNoScore: ModelRecord = {
    ...model({
      id: "o",
      name: "Open",
      creatorSlug: "qwen",
      isClosed: false,
      score: 1,
    }),
    scores: {},
  };
  assert.equal(
    findClosedNeighbours(openNoScore, [closed], METRIC, VENDORS),
    null,
  );
});
