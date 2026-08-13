import { test } from "node:test";
import assert from "node:assert/strict";
import { splitMode, baseModelKey, formatClosedLabel } from "./model-names";

// Regression: the closed-anchor roster rendered four lines labelled exactly
// "Claude Opus 5". AA scores each reasoning-effort tier as its own entry, and
// the old label rule kept the parenthetical only when it was ≤12 characters —
// so OpenAI's "(max)" survived while Anthropic's "(Adaptive Reasoning, Max
// Effort)" was dropped whole, taking the only distinguishing information with
// it. Anchors are now one per model, and the tier survives on the label.

test("formatClosedLabel: a verbose vendor mode still yields its tier", () => {
  const tiers = [
    ["Claude Opus 5 (Adaptive Reasoning, Max Effort)", "Claude Opus 5 (max)"],
    [
      "Claude Opus 5 (Adaptive Reasoning, Xhigh Effort)",
      "Claude Opus 5 (xhigh)",
    ],
    ["Claude Opus 5 (Adaptive Reasoning, High Effort)", "Claude Opus 5 (high)"],
    [
      "Claude Opus 5 (Adaptive Reasoning, Medium Effort)",
      "Claude Opus 5 (medium)",
    ],
  ] as const;
  const seen = new Set<string>();
  for (const [name, expected] of tiers) {
    const label = formatClosedLabel(name, false);
    assert.equal(label, expected);
    assert.ok(!seen.has(label), `label "${label}" is not unique across tiers`);
    seen.add(label);
  }
});

test("formatClosedLabel: terse vendor modes are unchanged", () => {
  assert.equal(
    formatClosedLabel("GPT-5.6 Sol (max)", false),
    "GPT-5.6 Sol (max)",
  );
  assert.equal(formatClosedLabel("Grok 4.6 (high)", false), "Grok 4.6 (high)");
  assert.equal(formatClosedLabel("Kimi K3", false), "Kimi K3");
});

test("formatClosedLabel: a non-mode qualifier is kept, mode noise around it is not", () => {
  // "Opus 4.8 Fallback" names a different routing target, so it has to stay —
  // but the label must not carry the whole 65-character parenthetical either.
  assert.equal(
    formatClosedLabel(
      "Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)",
      false,
    ),
    "Claude Fable 5 (max, Opus 4.8 Fallback)",
  );
  assert.equal(
    formatClosedLabel("Solar Pro 2 (Preview)", false),
    "Solar Pro 2 (Preview)",
  );
  assert.equal(
    formatClosedLabel("Grok 2 (Dec '24)", false),
    "Grok 2 (Dec '24)",
  );
});

test("formatClosedLabel: mobile drops the tier but keeps a real qualifier", () => {
  assert.equal(formatClosedLabel("GPT-5.6 Sol (max)", true), "GPT-5.6 Sol");
  assert.equal(
    formatClosedLabel("Claude Opus 5 (Adaptive Reasoning, Max Effort)", true),
    "Claude Opus 5",
  );
  assert.equal(
    formatClosedLabel("Solar Pro 2 (Preview)", true),
    "Solar Pro 2 (Preview)",
  );
});

test("baseModelKey: effort tiers collapse, distinct models do not", () => {
  const key = (name: string, creatorSlug = "anthropic") =>
    baseModelKey({ name, creatorSlug });

  // Every Claude Opus 5 tier is one model.
  const opus5 = [
    "Claude Opus 5 (Adaptive Reasoning, Max Effort)",
    "Claude Opus 5 (Adaptive Reasoning, Xhigh Effort)",
    "Claude Opus 5 (Adaptive Reasoning, High Effort)",
    "Claude Opus 5 (Adaptive Reasoning, Medium Effort)",
  ].map((n) => key(n));
  assert.equal(new Set(opus5).size, 1);

  // Versions, dates, previews and fallback targets stay apart.
  assert.notEqual(key("Claude Opus 5 (max)"), key("Claude Opus 4.8 (max)"));
  assert.notEqual(
    key("Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 5 Fallback)"),
    key("Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)"),
  );
  assert.notEqual(key("Grok 2 (Dec '24)", "xai"), key("Grok 2", "xai"));
  assert.notEqual(
    key("Solar Pro 2 (Preview)", "upstage"),
    key("Solar Pro 2", "upstage"),
  );

  // Same name from different creators is never merged.
  assert.notEqual(
    key("Muse Spark (max)", "meta"),
    key("Muse Spark (max)", "x"),
  );
});

test("splitMode: reports the tokens only when all of them are modes", () => {
  assert.deepEqual(splitMode("GPT-5.6 Sol (max)"), {
    base: "GPT-5.6 Sol",
    mode: ["max"],
  });
  assert.deepEqual(splitMode("Solar Pro 2 (Preview)"), {
    base: "Solar Pro 2 (Preview)",
    mode: null,
  });
  assert.deepEqual(splitMode("Kimi K3"), { base: "Kimi K3", mode: null });
});
