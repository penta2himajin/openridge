# openridge

[日本語](./README.ja.md)

> Status: scaffolded — pre-MVP

Pareto-frontier visualisation for self-hostable open-weight LLMs. Single-screen, minimal-chrome scatter of model parameters vs an intelligence benchmark, with closed-model horizontal anchors for "roughly that good" reference. In-product brand mark: **OpenRidge**.

Public site: [openridge.dev](https://openridge.dev).

## What it is

One scatter plot. X axis = parameters (active / total / compare), log scale. Y axis = a switchable benchmark (AA Intelligence Index by default). Open models are points; the Pareto frontier among them is drawn as a line. Closed frontier models (GPT, Claude, Gemini) appear as horizontal dashed anchors so you can read "this open point is roughly as smart as that closed model" at a glance.

Why this exists, what's already in the field, and how it intends to differ — see `docs/prior-art.md`.

## Status

The repo currently contains specification documents, conventions, and project scaffolding. No working code yet. The full MVP is described across `docs/`:

| Doc | Scope |
|---|---|
| `docs/architecture.md` | Stack, data pipeline, deploy story |
| `docs/data-sources.md` | AA API / HuggingFace API survey, alias map design |
| `docs/design.md` | Visual language, tokens, motion |
| `docs/ui.md` | UI specification (header, dropdown, segmented control, scatter, filters) |
| `docs/framer-prompts.md` | Framer Wireframer / Workshop prompts used to mock the UI |
| `docs/prior-art.md` | Differentiation against AA, Paraplouis, WhatLLM, llm-stats, Vellum, HF, etc. |

Genealogy: this repo graduated from `ideabook/ideas/local-lm-frontier/` (codename retained for the seed phase).

## Repository layout

```
.github/                workflows + PR/issue templates
data/                   committed JSON: models snapshot, alias maps, overrides
docs/                   spec carried over from ideabook
git-hooks/              shareable pre-push hook (templates-style)
public/                 static assets served verbatim
scripts/                build-data.ts (daily refresh, planned)
src/
  pages/                Astro page(s)
  components/           Solid components
  lib/                  pareto / model helpers
  styles/               Tailwind base + tokens
astro.config.mjs
tailwind.config.ts
tsconfig.json
package.json
```

## Build & test

Toolchain is committed but not implemented. Once the MVP is in:

```bash
npm install
npm run dev        # local Astro dev server
npm run refresh    # scripts/build-data.ts: AA + HF → data/models.json
npm run build      # static build to dist/
# Deploys happen via GitHub Actions (.github/workflows/deploy.yml).
```

Pre-push hook (format / lint where applicable):

```bash
git config core.hooksPath git-hooks
```

## Conventions

Inherits the patterns documented in [`penta2himajin/templates`](https://github.com/penta2himajin/templates):

- Conventional Commits (`feat:` / `fix:` / `docs:` / `chore:` / `refactor:`).
- Branch naming: `claude/<topic>` for Claude-driven edits.
- `Co-Authored-By: Claude <noreply@anthropic.com>` trailer on Claude-authored commits.
- Long-running workstreams handed off through GitHub issues with the `session-handoff` label; protocol in [templates/docs/handoff-protocol.md](https://github.com/penta2himajin/templates/blob/main/docs/handoff-protocol.md).

## License

MIT. See `LICENSE`.
