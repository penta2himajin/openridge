import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { resolveParams, HF_ORGS_BY_CREATOR, type AAEntry } from "./build-data";

const B = 1e9;

// ─── resolveParams: name-parsing is gone, HF is the sole gap-fill ─────────
//
// These describe the target design (docs/data-sources.md §2 post name-parse
// removal): an AA display name is never trusted for total/active. Every open
// model with no manual/AA-API entry must resolve through HF_ORGS_BY_CREATOR →
// resolveHfRepo → safetensors.total/config.json, or come back unresolved.
// Regression targets: LFM2.5-8B-A1B (hyphen broke the old MoE-suffix regex),
// Gemma "E<N>B" effective-params notation (glued digit read as a plain dense
// size), Mixtral "NxM" notation (multiplier silently dropped).

function mkEntry(
  overrides: Partial<AAEntry> & {
    name: string;
    slug: string;
    creatorSlug: string;
  },
): AAEntry {
  return {
    id: overrides.slug,
    name: overrides.name,
    slug: overrides.slug,
    release_date: null,
    model_creator: {
      id: overrides.creatorSlug,
      name: overrides.creatorSlug,
      slug: overrides.creatorSlug,
    },
    evaluations: {},
    pricing: {
      price_1m_blended_3_to_1: null,
      price_1m_input_tokens: null,
      price_1m_output_tokens: null,
    },
    median_output_tokens_per_second: null,
    median_time_to_first_token_seconds: null,
  };
}

/** Routes a mocked `fetch` by URL substring → JSON body (or "miss" → 404). */
function mockFetch(routes: Record<string, unknown | "miss">) {
  return mock.method(globalThis, "fetch", async (url: string | URL) => {
    const u = String(url);
    for (const [needle, body] of Object.entries(routes)) {
      if (u.includes(needle)) {
        if (body === "miss") return new Response(null, { status: 404 });
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response(null, { status: 404 });
  });
}

test("HF_ORGS_BY_CREATOR covers every creator currently relying on name-parse", () => {
  // These 12 creators ship open-weight models whose AA names were previously
  // parsed by the now-removed name heuristic. Without a trusted org here,
  // resolveHfRepo() returns null immediately (build-data.ts: `if (!orgs)
  // return null`) and every one of their models silently drops off the
  // scatter (params=null) once name-parsing is gone.
  const expected: Record<string, string> = {
    "tii-uae": "tiiuae",
    liquidai: "LiquidAI",
    ai2: "allenai",
    "nous-research": "NousResearch",
    multiversecomputing: "MultiverseComputingCAI",
    "motif-technologies": "Motif-Technologies",
    naver: "naver-hyperclovax",
    trillionlabs: "trillionlabs",
    nanbeige: "Nanbeige",
    "swiss-ai-initiative": "swiss-ai",
    openbmb: "openbmb",
    servicenow: "ServiceNow-AI",
  };
  for (const [creatorSlug, org] of Object.entries(expected)) {
    assert.ok(
      HF_ORGS_BY_CREATOR[creatorSlug]?.includes(org),
      `expected HF_ORGS_BY_CREATOR["${creatorSlug}"] to include "${org}", got ${JSON.stringify(HF_ORGS_BY_CREATOR[creatorSlug])}`,
    );
  }
});

test("resolveParams: LFM2.5-8B-A1B resolves via real HF data, not the AA name", async (t) => {
  // The old regex misread "LFM2.5-8B-A1B" as total=1B/active=1B (see
  // scripts/build-data.ts history). The real HF repo (LiquidAI/LFM2.5-8B-A1B)
  // reports total=8,467,856,832 with a standard MoE config.
  t.after(() => mock.restoreAll());
  mockFetch({
    "api/models/LiquidAI/LFM2.5-8B-A1B": { safetensors: { total: 8467856832 } },
    "LiquidAI/LFM2.5-8B-A1B/raw/main/config.json": {
      hidden_size: 2048,
      num_hidden_layers: 24,
      num_experts_per_tok: 4,
      moe_intermediate_size: 1792,
      intermediate_size: 7168,
      vocab_size: 128000,
    },
  });

  const m = mkEntry({
    name: "LFM2.5-8B-A1B",
    slug: "lfm2-5-8b-a1b",
    creatorSlug: "liquidai",
  });
  const result = await resolveParams(m, false, {}, new Map(), {}, {});

  assert.equal(result.viaHf, true);
  assert.equal(result.hfRepo, "LiquidAI/LFM2.5-8B-A1B");
  assert.equal(result.resolved?.total, 8467856832);
  // Never 1B (old bug) and never a naive 8B name-parse either — must come
  // from the config-based MoE estimate.
  assert.notEqual(result.resolved?.active, 1 * B);
  assert.notEqual(result.resolved?.active, 8 * B);
  assert.ok(
    result.resolved &&
      result.resolved.active > 0 &&
      result.resolved.active < result.resolved.total,
  );
});

test("resolveParams: search fallback is scoped per-org via author= and finds a repo whose HF slug diverges in case/suffix from AA's name", async (t) => {
  // Regression: canonical guesses for "Gemma 3 1B Instruct" ("google/Gemma-3-1B-Instruct",
  // "google/Gemma31BInstruct") never match the real slug google/gemma-3-1b-it
  // (lowercase, "-it" not "-Instruct"). The old fallback ran one global,
  // unscoped `search=` query and filtered client-side; live HF results (see
  // PR) put zero `google`-org repos in the top 20 for that query, burying the
  // one-off official repo behind hundreds of community forks named similarly.
  // author=<org> scopes the query server-side to the trusted org instead.
  // Live HF search also comes back empty for the *literal* "...1B Instruct"
  // query (no `google` repo spells it that way — only "-it"), which is why
  // the mock below returns nothing for that exact query and only succeeds
  // once the trailing "Instruct" qualifier is stripped.
  t.after(() => mock.restoreAll());
  mockFetch({
    "api/models/google/Gemma-3-1B-Instruct": "miss",
    "api/models/google/Gemma31BInstruct": "miss",
    "search=Gemma%203%201B%20Instruct": [],
    "search=Gemma%203%201B": [
      { modelId: "google/gemma-3-1b-it" },
      { modelId: "google/gemma-3-1b-pt" },
    ],
    "api/models/google/gemma-3-1b-it": { safetensors: { total: 999885952 } },
    "google/gemma-3-1b-it/raw/main/config.json": { model_type: "gemma3" }, // dense
  });

  const m = mkEntry({
    name: "Gemma 3 1B Instruct",
    slug: "gemma-3-1b",
    creatorSlug: "google",
  });
  const result = await resolveParams(m, false, {}, new Map(), {}, {});

  assert.equal(result.viaHf, true);
  assert.equal(result.hfRepo, "google/gemma-3-1b-it");
  assert.equal(result.resolved?.total, 999885952);
});

test("resolveParams: search fallback prefers the plain repo over a requantized re-upload with the same params", async (t) => {
  // Regression: live HF search for "Gemma 3 12B Instruct" ranks
  // google/gemma-3-12b-it-qat-q4_0-unquantized ahead of the canonical
  // google/gemma-3-12b-it (both report an identical safetensors.total, since
  // quantization doesn't change the logical param count) — the tooltip's "HF"
  // link should point at the plain repo, not a QAT re-upload.
  t.after(() => mock.restoreAll());
  mockFetch({
    "api/models/google/Gemma-3-12B-Instruct": "miss",
    "api/models/google/Gemma312BInstruct": "miss",
    "search=Gemma%203%2012B%20Instruct": [],
    "search=Gemma%203%2012B": [
      { modelId: "google/gemma-3-12b-it-qat-q4_0-unquantized" },
      { modelId: "google/gemma-3-12b-it" },
      { modelId: "google/gemma-3-12b-pt" },
    ],
    "api/models/google/gemma-3-12b-it-qat-q4_0-unquantized": {
      safetensors: { total: 12187325040 },
    },
    "api/models/google/gemma-3-12b-it": { safetensors: { total: 12187325040 } },
    "google/gemma-3-12b-it/raw/main/config.json": { model_type: "gemma3" },
  });

  const m = mkEntry({
    name: "Gemma 3 12B Instruct",
    slug: "gemma-3-12b",
    creatorSlug: "google",
  });
  const result = await resolveParams(m, false, {}, new Map(), {}, {});

  assert.equal(result.hfRepo, "google/gemma-3-12b-it");
});

test("resolveParams: Gemma 'E<N>B' models use HF total + moe_overrides active, not the glued digit", async (t) => {
  t.after(() => mock.restoreAll());
  mockFetch({
    "api/models/google/gemma-4-E2B": { safetensors: { total: 5123178051 } },
    "google/gemma-4-E2B/raw/main/config.json": { model_type: "gemma4" }, // no MoE fields — dense-shaped config
  });

  const m = mkEntry({
    name: "Gemma 4 E2B (Reasoning)",
    slug: "gemma-4-e2b",
    creatorSlug: "google",
  });
  const aliases: Record<string, string | null> = {
    "gemma-4-e2b": "google/gemma-4-E2B",
  };
  const moeOverrides = { "google/gemma-4-E2B": { active: 2300000000 } };
  const result = await resolveParams(
    m,
    false,
    {},
    new Map(),
    aliases,
    moeOverrides,
  );

  assert.equal(result.resolved?.total, 5123178051); // not the glued "2B" from the name
  assert.equal(result.resolved?.active, 2300000000); // from moe_overrides, not total-fallback
});

test("resolveParams: Mixtral 'NxM' models use HF total + moe_overrides active, not the per-expert size", async (t) => {
  t.after(() => mock.restoreAll());
  mockFetch({
    "api/models/mistralai/Mixtral-8x7B-Instruct-v0.1": {
      safetensors: { total: 46702792704 },
    },
    "mistralai/Mixtral-8x7B-Instruct-v0.1/raw/main/config.json": {
      model_type: "mixtral",
      num_experts_per_tok: 2,
      // Mixtral's config has no `moe_intermediate_size` key — the generic
      // config-based estimate can't run, so this case genuinely needs
      // moe_overrides.json rather than being derivable automatically.
    },
  });

  const m = mkEntry({
    name: "Mixtral 8x7B Instruct",
    slug: "mixtral-8x7b-instruct",
    creatorSlug: "mistral",
  });
  const aliases: Record<string, string | null> = {
    "mixtral-8x7b-instruct": "mistralai/Mixtral-8x7B-Instruct-v0.1",
  };
  const moeOverrides = {
    "mistralai/Mixtral-8x7B-Instruct-v0.1": { active: 12900000000 },
  };
  const result = await resolveParams(
    m,
    false,
    {},
    new Map(),
    aliases,
    moeOverrides,
  );

  assert.equal(result.resolved?.total, 46702792704); // not the "7B" per-expert size from the name
  assert.equal(result.resolved?.active, 12900000000);
});

test("resolveParams: creator with no trusted HF org never calls fetch and yields no params", async (t) => {
  t.after(() => mock.restoreAll());
  const fetchMock = mockFetch({}); // any call is a bug — no route matches, would 404
  const m = mkEntry({
    name: "Totally New Model 3B",
    slug: "totally-new-model-3b",
    creatorSlug: "some-unlisted-creator",
  });
  const result = await resolveParams(m, false, {}, new Map(), {}, {});

  assert.equal(result.resolved, null);
  assert.equal(result.hfRepo, null);
  assert.equal(
    fetchMock.mock.callCount(),
    0,
    "resolveHfRepo must short-circuit before ever calling fetch",
  );
});

test("resolveParams: manual_params.json still wins over everything, including HF", async (t) => {
  t.after(() => mock.restoreAll());
  const fetchMock = mockFetch({
    "api/models/google/gemma-4-E2B": { safetensors: { total: 999 } },
  });
  const m = mkEntry({
    name: "Gemma 4 E2B (Reasoning)",
    slug: "gemma-4-e2b",
    creatorSlug: "google",
  });
  const manual = { "gemma-4-e2b": { total: 5123178051, active: 2300000000 } };
  const result = await resolveParams(m, false, manual, new Map(), {}, {});

  assert.deepEqual(result.resolved, { total: 5123178051, active: 2300000000 });
  assert.equal(
    fetchMock.mock.callCount(),
    0,
    "a manual override must pre-empt any HF lookup",
  );
});
