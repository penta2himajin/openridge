# openridge

## Overview

Pareto-frontier visualisation site for self-hostable open-weight LLMs. One scatter plot, X = parameters (active/total/compare), Y = a switchable benchmark, with the Pareto frontier drawn as a line and closed-model anchors as horizontal dashes. In-product brand mark: **OpenRidge** (rendered as Geist Sans "Open" + Geist Mono "Ridge"). Public domain (planned): `openridge.dev`.

Full specification: see `docs/`. The repo is currently scaffolded, **not implemented**.

- @docs/architecture.md — stack, data pipeline, deploy
- @docs/data-sources.md — AA + HF survey, alias-map operating model
- @docs/design.md — visual language, tokens, motion
- @docs/ui.md — header / dropdown / segmented control / scatter / filters / a11y
- @docs/framer-prompts.md — Framer Wireframer / Workshop prompts
- @docs/prior-art.md — differentiation vs AA / Paraplouis / WhatLLM / llm-stats / Vellum / HF

Genealogy: graduated from `ideabook/ideas/local-lm-frontier/`.

## Project Structure

```
.github/workflows/      refresh.yml (cron) + deploy.yml
data/                   committed JSON (models snapshot, hf_aliases, moe_overrides, closed_anchors)
docs/                   spec — authoritative; ideabook side is now a stub
git-hooks/pre-push      install with `git config core.hooksPath git-hooks`
public/                 static assets served verbatim
scripts/build-data.ts   Daily Refresh (AA + HF → data/models.json)
src/
  pages/index.astro     the only page
  components/           Solid: Header, Frontier, Tooltip, Filters
  lib/                  pareto.ts (frontier computation), models.ts (types + load)
  styles/global.css     Tailwind base + OKLCH design tokens
astro.config.mjs
tailwind.config.ts
tsconfig.json
public/CNAME            `openridge.dev` — GH Pages custom domain
package.json
```

## Development Setup

Node 20 (matches the `actions/setup-node` pin in `.github/workflows/`).

```bash
npm install

# pre-push hook (format / lint)
git config core.hooksPath git-hooks
```

Secrets (set in GH Actions; locally in `.env`):

- `AA_API_KEY` — Artificial Analysis Insights Platform key (free tier 1,000 req/day). Required by `scripts/build-data.ts` only.

Deploy needs no secrets — GitHub Pages publishes via the workflow's built-in `GITHUB_TOKEN` and OIDC.

## Build & Test

```bash
npm run dev        # Astro dev server
npm run refresh    # scripts/build-data.ts — fetch AA + HF, write data/models.json
npm run build      # static build to dist/
# Deploys are workflow-driven (.github/workflows/deploy.yml); no local deploy command.
```

CI verification commands live in `.github/workflows/`. Tests are not yet wired; the spec docs are the closest thing to a verification surface today.

## Development Principles

- **One screen, one chart.** Resist adding tabs, side panels, parallel charts, or marketing surface. If a feature needs a second screen, it does not belong here — file it for a sibling project (e.g. canirun-style hardware fit is explicitly out of scope per `docs/prior-art.md`).
- **The browser never calls AA.** AA's free API key lives in GH Actions secrets. The site reads pre-baked JSON; that file is committed so git history doubles as the time series.
- **Data and site are decoupled.** Daily refresh is one cron job that updates `data/models.json` and pushes a commit; the deploy workflow runs on every push, including the bot commits. Don't merge them into one workflow.
- **Aesthetic discipline > library defaults.** Observable Plot is the chart base, but Plot's defaults (axes, colours, legend) get overridden via `marks`/`style`/`color` options. Tailwind is the styling layer, but `shadcn/ui` and `Tailwind UI` are **not** used (template look).
- **OKLCH tokens are the colour SSOT.** Defined in `src/styles/global.css` and re-exposed to Tailwind via `theme.extend.colors`. Don't sprinkle raw hex into components.

## Architectural Boundaries

- `scripts/build-data.ts` is the only place that touches external APIs. Components never fetch at runtime.
- `data/*.json` is generated and committed; treat it as build output even though it lives in git. Do not hand-edit `data/models.json`. Hand edits belong in `data/hf_aliases.json` / `data/moe_overrides.json` / `data/closed_anchors.json`.
- `src/lib/pareto.ts` is pure — no DOM, no I/O. Frontier results for tracked metrics are pre-computed in `build-data.ts` and stored in `models.json`; the client should not recompute them.
- Closed-model anchors are derived from the same AA fetch; they live as horizontal lines in the chart and are not points.

## Prohibitions

1. Do not call AA or HuggingFace from the browser. The key lives in GH Actions secrets.
2. Do not introduce a creator-based colour palette into the scatter. Two semantic accent colours only: `--frontier` for Pareto points/line, `--closed` for closed anchors. `--accent` is reserved for keyboard focus.
3. Do not adopt `shadcn/ui`, Tailwind UI, or any other component library with a recognisable visual signature. Components are hand-written (≤ ~30 lines each per `docs/design.md`).
4. Do not hand-edit `data/models.json`. Run `npm run refresh` or edit upstream JSON (`hf_aliases.json` / `moe_overrides.json`).
5. Do not commit secrets. `.env` and `.dev.vars` are gitignored; verify before staging.
6. Do not add features outside the "1 chart, params vs intelligence" core without updating `docs/ui.md` first and confirming with the user.
7. Do not plot a model whose weights are not publicly downloadable, even when AA classifies it as open. No guessed params, no published-spec figures typed into `manual_params.json`, no aliasing a different checkpoint's repo. API-only tiers (Qwen Plus, GLM Turbo, Solar Pro, Mistral Medium/Large), unreleased flagships (Meta's Muse Spark line) and AA entries whose checkpoint was never uploaded (`Step 3.5 Flash 2603`) stay at `params=null` and off the scatter — that is the correct outcome, not a bug. See `docs/data-sources.md` §2 "掲載方針". A model that _does_ have a public repo but fails to resolve (missing org, name mismatch, expired retry window) is a bug and should be fixed.

## Git Conventions

- Conventional Commits with project-specific scopes: `feat(ui):`, `feat(data):`, `feat(scripts):`, `fix(plot):`, `docs:`, `chore(data):` (used by the bot for daily refresh commits).
- The daily refresh workflow commits as `github-actions[bot]` with message `chore(data): refresh YYYY-MM-DD`.
- PRs link a `Closes #N` to the relevant handoff or feature issue per `templates/.github/PULL_REQUEST_TEMPLATE.md`.

## Session Handoff

Long-running workstreams use GitHub issues labelled `session-handoff`. Protocol: [`templates/docs/handoff-protocol.md`](https://github.com/penta2himajin/templates/blob/main/docs/handoff-protocol.md).

- One issue per workstream (e.g. "MVP scatter plot", "Daily Refresh pipeline", "Framer mock → Astro translation"), not per session.
- On session start, read the relevant handoff issue and confirm the **Next action** with the user before executing.

## Internationalisation

`README.ja.md` lives alongside `README.md` per [`templates/docs/i18n-policy.md`](https://github.com/penta2himajin/templates/blob/main/docs/i18n-policy.md). `docs/` is engineering-internal and stays English-Japanese mixed (matching the ideabook origin). PRs are never blocked on translation parity.
