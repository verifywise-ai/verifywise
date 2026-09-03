#!/usr/bin/env node
/**
 * Regenerates Servers/advisor/roadmap/manifest.ts from the AI tool catalogue
 * in <repo-root>/tool_list_.md (the complete tool inventory referenced by
 * "AI Implementation Plan.md").
 *
 * Usage: node Servers/scripts/generateAdvisorRoadmapManifest.mjs
 *
 * The generated file is a static artifact — commit it. Re-run this script
 * only when tool_list_.md changes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const catalogPath = join(repoRoot, "tool_list_.md");
const outPath = join(here, "..", "advisor", "roadmap", "manifest.ts");

const lines = readFileSync(catalogPath, "utf8").split("\n");

// Subcategory headings whose stripped label should be normalized to a
// canonical domain name shared with sibling categories.
const DOMAIN_ALIASES = {
  PMM: "Post-Market Monitoring (PMM)",
};

const stripCell = (cell) => cell.replace(/\*\*/g, "").replace(/\\_/g, "_").trim();

const entries = [];
let category = null; // "existing" | "A".."F"
let categoryDomain = null; // fallback domain for categories without subheadings (F)
let domain = null;

for (const line of lines) {
  const trimmed = line.trim();

  if (trimmed === "**Existing 47 Tools (Read-Only)**") {
    category = "existing";
    domain = null;
    continue;
  }

  const categoryMatch = trimmed.match(/^\*\*Category ([A-F]): (.+?) \(\d+ tools\)\*\*$/);
  if (categoryMatch) {
    category = categoryMatch[1];
    // e.g. "Admin / Configuration Tools" -> "Admin / Configuration"
    categoryDomain = categoryMatch[2].replace(/\s*Tools$/, "").trim();
    domain = null;
    continue;
  }

  const subMatch = trimmed.match(/^\*\*([A-F])(\d+)\.\s+(.+?)\s*\(\d+\)\*\*$/);
  if (subMatch) {
    // e.g. "A1. Risk Write Tools (7)" -> "Risk"; "B1. Change History Tools (6)" -> "Change History"
    const label = subMatch[3].replace(/\s*(Write )?Tools$/, "").trim();
    domain = DOMAIN_ALIASES[label] ?? label;
    continue;
  }

  if (!trimmed.startsWith("|") || category === null) continue;

  const cells = trimmed.split("|").slice(1, -1).map(stripCell);
  const id = Number(cells[0]);
  if (!Number.isInteger(id) || id <= 0) continue; // header/separator rows

  const name = cells[1];
  if (!name || name === "Tool Name") continue;

  const isExisting = category === "existing";
  entries.push({
    id,
    name,
    description: isExisting ? "" : (cells[2] ?? ""),
    domain: isExisting ? cells[2] : (domain ?? categoryDomain),
    category,
    phase: isExisting ? 0 : 1,
    kind: name.startsWith("agent_") ? "write" : "read",
  });
}

entries.sort((a, b) => a.id - b.id);

const ids = entries.map((e) => e.id);
for (let i = 0; i < ids.length; i++) {
  if (ids[i] !== i + 1) {
    throw new Error(`Catalogue numbering gap: expected id ${i + 1}, got ${ids[i]}`);
  }
}

const counts = entries.reduce((acc, e) => {
  acc[e.category] = (acc[e.category] ?? 0) + 1;
  return acc;
}, {});

console.log(`Parsed ${entries.length} tools:`, counts);

const body = entries
  .map(
    (e) =>
      `  { id: ${e.id}, name: ${JSON.stringify(e.name)}, description: ${JSON.stringify(
        e.description,
      )}, domain: ${JSON.stringify(e.domain)}, category: ${JSON.stringify(
        e.category,
      )}, phase: ${e.phase}, kind: ${JSON.stringify(e.kind)} },`,
  )
  .join("\n");

const output = `/**
 * STATIC ROADMAP MANIFEST — generated, do not hand-edit individual rows.
 *
 * Derived from the AI tool catalogue in <repo-root>/tool_list_.md, which is
 * the complete tool inventory referenced by "AI Implementation Plan.md"
 * (263 tools claimed; the catalogue actually enumerates ${entries.length} rows —
 * the discrepancy is surfaced via the \`sources\` block of the roadmap API
 * response rather than silently resolved).
 *
 * - phase 0: the 47 pre-plan "Existing" read-only tools (baseline)
 * - phase 1: the new tools whose delivery is the plan's Phase 1 objective
 * - kind: "write" iff the name carries the catalogue's \`agent_\` prefix
 *
 * Regenerate with: node Servers/scripts/generateAdvisorRoadmapManifest.mjs
 */

import type { RoadmapManifestEntry } from "./types";

export const ROADMAP_MANIFEST: RoadmapManifestEntry[] = [
${body}
];
`;

writeFileSync(outPath, output);
console.log(`Wrote ${outPath}`);
