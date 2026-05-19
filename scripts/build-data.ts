/**
 * Daily Refresh — fetch AA + HF, write data/models.json.
 *
 * Spec: docs/architecture.md §4 (full skeleton),
 *       docs/data-sources.md §1–§3 (endpoints, fields, MoE handling).
 *
 * Required env: AA_API_KEY (Insights Platform, free tier 1k req/day).
 *
 * Inputs:
 *   data/hf_aliases.json     — AA slug → HF repo id (or null for closed)
 *   data/moe_overrides.json  — HF repo id → { active: number }
 *   data/closed_anchors.json — closed-model display rules
 *
 * Output:
 *   data/models.json         — committed snapshot consumed at build time
 *
 * TODO: implement per architecture.md §4.
 */

import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DATA = (p: string) => resolve(ROOT, "data", p);

void DATA;
void readFileSync;
void writeFileSync;

async function main(): Promise<void> {
  throw new Error("not implemented: see docs/architecture.md §4");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
