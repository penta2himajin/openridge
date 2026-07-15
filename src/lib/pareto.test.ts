import { test } from "node:test";
import assert from "node:assert/strict";
import { computeParetoFrontier } from "./pareto";

interface P {
  id: string;
  x: number | null;
  y: number | null;
}
const xOf = (p: P) => p.x;
const yOf = (p: P) => p.y;
const ids = (items: P[]) =>
  computeParetoFrontier(items, xOf, yOf).map((p) => p.id);

test("minimises X, maximises Y and drops dominated points", () => {
  const pts: P[] = [
    { id: "a", x: 1, y: 10 }, // frontier
    { id: "b", x: 2, y: 5 }, // dominated by a (bigger x, smaller y)
    { id: "c", x: 3, y: 20 }, // frontier
    { id: "d", x: 2, y: 15 }, // frontier (between a and c)
  ];
  assert.deepEqual(ids(pts), ["a", "d", "c"]);
});

test("at equal X only the highest Y survives", () => {
  const pts: P[] = [
    { id: "lo", x: 10, y: 32.3 },
    { id: "hi", x: 10, y: 38.1 },
  ];
  // This is the MiniMax-M2.7 vs Qwen3.5-122B-A10B case at a shared active-param
  // class: the higher-scoring model wins the tie and the other is dropped.
  assert.deepEqual(ids(pts), ["hi"]);
});

test("skips points with null / non-finite coordinates", () => {
  const pts: P[] = [
    { id: "ok", x: 1, y: 5 },
    { id: "nullx", x: null, y: 9 },
    { id: "nully", x: 2, y: null },
    { id: "nan", x: NaN, y: 3 },
  ];
  assert.deepEqual(ids(pts), ["ok"]);
});

test("empty input yields an empty frontier", () => {
  assert.deepEqual(ids([]), []);
});

test("a strictly improving chain keeps every point", () => {
  const pts: P[] = [
    { id: "a", x: 1, y: 1 },
    { id: "b", x: 2, y: 2 },
    { id: "c", x: 3, y: 3 },
  ];
  assert.deepEqual(ids(pts), ["a", "b", "c"]);
});
