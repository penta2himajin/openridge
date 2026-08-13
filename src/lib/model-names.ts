/**
 * AA display-name parsing.
 *
 * AA appends a trailing parenthetical to a model name for two quite different
 * reasons, and telling them apart is what these helpers are for:
 *
 *   - an inference *mode* — reasoning on/off and effort tier — which is the
 *     same weights served differently ("GPT-5.6 Sol (max)", "Claude Opus 5
 *     (Adaptive Reasoning, Max Effort)");
 *   - a different model or routing target ("Solar Pro 2 (Preview)", "Grok 2
 *     (Dec '24)", "Claude Fable 5 (…, Opus 4.8 Fallback)").
 *
 * Only the first kind may be collapsed. Pure — no DOM, no I/O.
 */

/** Parenthetical tokens that denote an inference mode rather than a model. */
const MODE_TOKEN =
  /^(adaptive[- ]?reasoning|non[- ]?reasoning|reasoning|thinking|(max|high|medium|low|minimal|xhigh)(\s+effort)?)$/i;

/** The effort tier within a mode parenthetical, e.g. "Max Effort" → "max". */
const TIER_TOKEN = /^(max|high|medium|low|minimal|xhigh)(\s+effort)?$/i;

/** A reasoning designator carries no tier — every flagship has one. */
const REASONING_TOKEN = /^(adaptive[- ]?reasoning|reasoning)$/i;

/**
 * Split a name into its base and mode tokens, but only when *every* token in
 * the parenthetical is a mode. A single non-mode token (a date, "Preview", a
 * fallback target) means the parenthetical names a distinct model, so it stays
 * part of the base.
 */
export function splitMode(name: string): {
  base: string;
  mode: string[] | null;
} {
  const paren = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!paren) return { base: name.trim(), mode: null };
  const tokens = paren[2].split(",").map((t) => t.trim());
  if (!tokens.every((t) => MODE_TOKEN.test(t)))
    return { base: name.trim(), mode: null };
  return { base: paren[1].trim(), mode: tokens };
}

/** Group key that collapses reasoning/effort variants of one model. */
export function baseModelKey(m: { name: string; creatorSlug: string }): string {
  return `${m.creatorSlug} ${splitMode(m.name).base}`;
}

/**
 * Label for a closed-model anchor line.
 *
 * Keeps what tells this anchor apart and drops what does not: a bare reasoning
 * designator goes, an effort tier survives as the bare word, and a non-mode
 * qualifier is kept verbatim because that is what makes it a different model.
 *
 * Regression: the previous rule kept the parenthetical only when it was ≤12
 * characters, which discriminated by how verbose a vendor's mode string is
 * rather than by whether it carried information. Anthropic writes "(Adaptive
 * Reasoning, Max Effort)", so every Claude anchor collapsed to a bare "Claude
 * Opus 5" and four different tiers drew four identical labels, while OpenAI's
 * "(max)" survived.
 *
 * On mobile the tier is dropped for width (docs/ui.md §7.5.4).
 */
export function formatClosedLabel(name: string, mobile: boolean): string {
  const paren = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!paren) return name.trim();
  const base = paren[1].trim();
  const kept = paren[2]
    .split(",")
    .map((t) => t.trim())
    .filter((t) => !REASONING_TOKEN.test(t))
    .filter((t) => !(mobile && TIER_TOKEN.test(t)))
    .map((t) =>
      TIER_TOKEN.test(t) ? t.replace(/\s+effort$/i, "").toLowerCase() : t,
    );
  return kept.length ? `${base} (${kept.join(", ")})` : base;
}
