# Saudi NAII adoption level per domain: design

Date: 2026-11-27. Branch `fix/naii-official-questions` (PR #5572).

## Intent

SDAIA scores each NAII domain on an adoption level from 0 to 5. VerifyWise
tracked only a workflow status per domain, so an entity could not record
"Budget: level 3" next to that status. This adds a self-assessed level per
domain, shown in the drawer, on the framework page and in reports.

## Goals, non-goals

- Goal: record, change and clear a 0-5 level on each of the 23 domains.
- Goal: show it on the domain row and in the framework requirements report.
- Non-goal: an overall NAII score. SDAIA publishes no domain weights.
- Non-goal: a target level, history of levels, or levels on other frameworks.
- Anti-goal: implying the level is SDAIA's official result. It is the
  entity's own assessment.

## Approaches

- **A. One level per domain (chosen by the user).** One nullable smallint on
  the impl table, the same control on every domain. Development and
  deployment shows its four AP.1.x level lines as guidance for one choice.
- B. Four levels on Development and deployment, as SDAIA scores AP.1.1-1.4.
  Needs an array column or a child table and a special case in the drawer,
  list and report. Rejected: more surface for one domain.

## Design

- `FrameworkStructure.adoption_levels?: boolean`, true only for NAII.
- Migration: `saudi_naii_domains.adoption_level SMALLINT NULL CHECK 0-5`,
  `ADD COLUMN IF NOT EXISTS`, so fresh databases (created by the 20260805
  registry migrations) and existing ones end the same.
- Reads: tree and impl queries return `adoption_level` for flagged
  frameworks (a NULL literal otherwise). The tree response's `framework`
  carries `adoption_levels`.
- Write: PATCH `/api/frameworks/:id/impl/:level/:id` accepts
  `adoption_level` ("" or null clears, 0-5 sets). Any other value, or the
  field on a framework without levels, is a 400. Write access treats it as an
  edit field.
- Drawer: an "Adoption level" select above Status with "Not assessed" and
  "0: Absence of capabilities" to "5: Pioneer" (the index document's names,
  as the domain titles are). Sent only when the framework has levels.
- Page: a "Level N" label before the status dropdown when a level is set.
- Reports: the requirements table gets an "Adoption level" column for a
  framework with levels (PDF and DOCX).
- Docs: user guide (mirrored to the website), compliance-frameworks.md,
  swagger; de/fr/es strings.

## Left to the builder

Exact label styling, test placement, swagger wording.
