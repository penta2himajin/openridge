import { test } from "node:test";
import assert from "node:assert/strict";
import { parseParamsFromName } from "./build-data";

const B = 1e9;
const T = 1e12;
const M = 1e6;

test("dense model: total equals active", () => {
  assert.deepEqual(parseParamsFromName("Llama 3.3 Instruct 70B"), {
    total: 70 * B,
    active: 70 * B,
  });
});

test("MoE model: 'A<M>B' suffix yields active < total", () => {
  assert.deepEqual(parseParamsFromName("Qwen3 235B A22B"), {
    total: 235 * B,
    active: 22 * B,
  });
  assert.deepEqual(parseParamsFromName("Gemma 4 26B A4B (Non-reasoning)"), {
    total: 26 * B,
    active: 4 * B,
  });
});

test("trillion and million unit suffixes parse", () => {
  assert.deepEqual(parseParamsFromName("Ling-1T"), { total: T, active: T });
  assert.deepEqual(parseParamsFromName("Gemma 3 270M"), {
    total: 270 * M,
    active: 270 * M,
  });
});

test("names that encode no unit-suffixed size return null", () => {
  // Regression guard for the MoE-stored-as-dense class of bug: these names
  // carry no parseable size, so the pipeline must fall back to manual_params /
  // HF for params. When that fallback misses an override, a MoE silently
  // becomes dense (active = total) — see data/manual_params.json minimax-m2*.
  assert.equal(parseParamsFromName("MiniMax-M2.7"), null);
  assert.equal(parseParamsFromName("MiniMax M1 40k"), null);
  assert.equal(parseParamsFromName("GPT-5"), null);
});
