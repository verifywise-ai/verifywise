# OSFI E-23 Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship OSFI Guideline E-23 – Model Risk Management (2027) as bundled, organization-level framework id 26 (16 groups, 83 items).

**Architecture:** A structure-registry framework (`Servers/structures/`), served by the existing generic framework endpoints and UI. A new idempotent migration creates its tables on existing databases; the shared `20260805*` migrations create them on fresh ones. One guard is added to the unreleased `20261117140851` migration so upgrades from v2.6.8 don't fail.

**Tech Stack:** TypeScript, Express, Sequelize migrations (JS), PostgreSQL, Jest (Servers), React/Vite (Clients).

**Spec:** `docs/superpowers/specs/2026-11-18-osfi-e23-framework-design.md`

## Global Constraints

- Worktree `/Users/gorkemcetin/verifywise-e23`, branch `feature/osfi-e23-framework`. Never edit, build, restart or run Vite in `/Users/gorkemcetin/verifywise` (user's live checkout).
- **No customer- or prospect-specific wording** in any committed file, comment, commit message or PR. Before every commit: `git diff --cached | grep -inE "bank|customer|prospect|evaluat"` must show nothing customer-specific (generic "every customer" is fine).
- No competitor names in committed files (the check list lives in local memory, not in the repo).
- Framework id **26**, key `osfi-e23`, `framework_type` `osfi_e23`, seed name **"OSFI E-23 Model Risk Management"**, version **"2027"**, `is_organizational: true`, `hierarchy.type: "two_level"`, `level1_name: "Principle"`, `level2_name: "Requirement"`.
- Tables: `osfi_e23_principles_struct`, `osfi_e23_requirements_struct`, `osfi_e23_requirements`, `osfi_e23_requirements__risks`. Cols: `l2_struct_parent: "principle_id"`, `l2_impl_meta: "requirement_meta_id"`, `l2_risks_impl: "requirement_id"`. Entity type `requirement`; source label **"OSFI E-23 requirements"**; notes enum `OSFI_E23_REQUIREMENT`.
- Content: paraphrase only, never copy OSFI sentences (OSFI terms bar verbatim commercial reuse). Short headings and numbers ("Principle 3.6", "Model monitoring", "B-10") are fine. No VerifyWise feature names or product claims in content. English only.
- Every group and item sets `order_no` explicitly (1..n within its parent). Item keys for phase 2 = (group `order_no`, item `order_no`); never renumber.
- Group titles and item lists exactly as in the spec's *Structure* section (16 groups, 83 items, item numbers like `3.6.1` prefix each item title, e.g. `"3.6.1 Monitoring standards by risk rating and model type"`).
- Each item: `description` 1–3 sentences, `summary` one line, `questions` 2–6, `evidence_examples` 2–5.
- Seed description: one sentence on scope, then exactly: `Based on OSFI Guideline E-23 – Model Risk Management (2027), published September 11, 2025, effective May 1, 2027. Requirements are paraphrased; see https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/guideline-e-23-model-risk-management-2027 for the official text.`
- Source text for paraphrasing: `/private/tmp/claude-501/-Users-gorkemcetin-verifywise/aab8cf63-9813-49e3-8c5a-048cba71b722/scratchpad/e23-guideline.md` (if missing, re-download from the URL above; never commit it).
- Never run `npx sequelize` or `npx jest` against the dev DB. Migration checks use a scratch DB named `verifywise_e23_*` with env exported in the shell (the worktree has no `Servers/.env`). Unit tests: `npm run test -- <pattern> --maxWorkers=2`.
- One build/test process at a time (16 GB machine).
- Spacing/tokens/house components rules from `Clients/CLAUDE.md` apply to any client change (only a badge + map entry here).

## Review Focus

1. **Upgrade from v2.6.8** (no E-23 tables, `20261117140851` not yet run): `db:migrate` must finish and leave framework 26 with 16/83 struct rows. Pinned in Task 4, Step 4.
2. **Re-running the new migration** on a database that already has framework 26 (fresh install path): must be a no-op, not a duplicate-key error. Pinned in Task 4, Step 3.
3. **Adding E-23 to the organizational project** creates exactly 83 "Not started" rows and is refused on a use case. Pinned in Task 3, Step 1.
4. **Removing E-23** deletes its impl rows and evidence links. Pinned in Task 3, Step 1.
5. **Seed data with quotes, commas or backslashes** in questions/evidence (Postgres text-array escaping) round-trips intact. Pinned in Task 4, Step 4 (struct rows read back and compared with the structure file).

---

### Task 0: Worktree setup

**Files:** none.

- [ ] **Step 1:** `cd /Users/gorkemcetin/verifywise-e23/Servers && npm ci` and `cd ../Clients && npm ci` (own installs; never symlink node_modules).
- [ ] **Step 2:** `cd ../Servers && npm run build` → exits 0. No commit.

### Task 1: Structure file, groups 1–7 (sections B, C, D.1)

**Files:**
- Create: `Servers/structures/OSFI-E-23/osfi-e23.structure.ts`
- Modify: `Servers/structures/index.ts` (import + append to `FRAMEWORK_STRUCTURES`; update the "21 migrated frameworks" comment to 22)
- Test: `Servers/structures/__tests__/osfiE23.structure.test.ts`

**Interfaces:**
- Produces: `export const osfiE23Structure: FrameworkStructure` (default export too), reachable via `getStructureById(26)` / `requireStructureByKey("osfi-e23")`.

- [ ] **Step 1: Write the failing test** — `describe("OSFI E-23 structure")`:
  - `getStructureById(26)?.key === "osfi-e23"`, `seed.name === "OSFI E-23 Model Risk Management"`, `seed.version === "2027"`, `seed.is_organizational === true`, `seed.hierarchy.type === "two_level"`, `tables.l3_struct` undefined.
  - Ids and table names unique across `FRAMEWORK_STRUCTURES`.
  - Group count and per-group item counts equal `EXPECTED = [5,7,3,6,8,3,7]` (Task 2 extends to `[5,7,3,6,8,3,7,3,6,6,6,3,6,7,5,2]`, total 83).
  - Every group/item has explicit `order_no` equal to its 1-based index.
  - Every item: title matches `/^(\d+\.\d+\.\d+|A\.\d) /`, description non-empty, summary non-empty, `questions.length` 2–6, `evidence_examples.length` 2–5.
  - `seed.description` ends with the exact attribution sentence from Global Constraints.
  - No content string matches `/verifywise/i`.
- [ ] **Step 2:** `cd Servers && npm run test -- osfiE23 --maxWorkers=2` → FAIL (structure not found).
- [ ] **Step 3:** Write the structure file (model on `SOC2/soc2.structure.ts`) with groups 1–7 per the spec, paraphrasing the guideline. Register it.
- [ ] **Step 4:** Same test command → PASS. `npm run build` → 0.
- [ ] **Step 5:** Commit `feat(frameworks): add OSFI E-23 structure, enterprise-wide and risk-based principles`.

### Task 2: Structure content, groups 8–16 (lifecycle, Appendix 1)

**Files:** Modify `Servers/structures/OSFI-E-23/osfi-e23.structure.ts`, `Servers/structures/__tests__/osfiE23.structure.test.ts`.

- [ ] **Step 1:** Change `EXPECTED` to the full 16-group list; add `total items === 83`. Run → FAIL.
- [ ] **Step 2:** Add groups 8–16 per the spec (approval items 3.4.7–3.4.9, decommission 3.6.8–3.6.12, appendix A.1–A.2).
- [ ] **Step 3:** Test → PASS; `npm run build` → 0.
- [ ] **Step 4:** Commit `feat(frameworks): add OSFI E-23 lifecycle principles and model information appendix`.

### Task 3: Backend registration

**Files:**
- Modify: `Servers/utils/frameworkRegistry.utils.ts` (after the NIST CSF pair: `// OSFI E-23 (id=26)` `createOSFIE23FrameworkQuery = makeCreate("osfi-e23")`, `deleteProjectFrameworkOSFIE23Query = makeDelete("osfi-e23")`)
- Modify: `Servers/types/framework.type.ts` (`26:` in `frameworkAdditionMap`, `frameworkDeletionMap`, `frameworkFilesDeletionSourceMap` = `[]`)
- Modify: `Servers/domain.layer/models/file/file.model.ts` (`"OSFI E-23 requirements"` in `FileSource` union and the `source` column ENUM list)
- Modify: `Servers/domain.layer/models/notes/notes.model.ts` (`OSFI_E23_REQUIREMENT = "OSFI_E23_REQUIREMENT"`)
- Modify: `Servers/scripts/auditTenantIsolationCoverage.ts` (entries for `osfi_e23_requirements` and `osfi_e23_requirements__risks`, same justification text as `soc2_controls`, alphabetical position)
- Test: `Servers/tests/integration/useCaseBundledFrameworks.test.ts`

**Interfaces:** Consumes `osfiE23Structure` (Task 1).

- [ ] **Step 1: Write failing integration tests** in the existing `describe("bundled frameworks picked at creation are built")`, following the SOC 2 organizational test:
  - `"POST /api/v1/projects builds an organization-wide OSFI E-23"` → 83 rows in `osfi_e23_requirements` for the new `projects_frameworks` row, all `status = 'Not started'`, all with the project's `organization_id`.
  - `"refuses OSFI E-23 on a use case"` → adding framework 26 to a non-organizational project through the add-framework path that enforces the `is_organizational` match (`compliance-frameworks.md`, "Adding Framework to Project", step 3) → 4xx, zero `osfi_e23_requirements` rows written.
  - `"removing OSFI E-23 deletes its requirement rows"` → after removal via the framework removal endpoint used elsewhere in this file/suite, 0 rows for that `projects_frameworks_id`.
- [ ] **Step 2:** Run with scratch env (see Task 4 env block, `DB_NAME=verifywise_it_e23`): `npm run test:integration -- --testPathPatterns=useCaseBundledFrameworks` → new tests FAIL (no builder for 26).
- [ ] **Step 3:** Make the registration edits listed above.
- [ ] **Step 4:** Integration run → PASS. `npx ts-node scripts/auditTenantIsolationCoverage.ts` (same env) → `"status": "ok"`. `npm run build` → 0.
- [ ] **Step 5:** Commit `feat(frameworks): register OSFI E-23 for add, remove, evidence and notes`.

### Task 4: Migration and upgrade-path guard

**Files:**
- Create: `Servers/database/migrations/<date +%Y%m%d%H%M%S>-add-osfi-e23-framework.js`
- Modify: `Servers/database/migrations/20261117140851-build-empty-bundled-frameworks.js` (inside the loop, before the `emptyLinks` query: skip the entry when `SELECT to_regclass('verifywise.<l2_impl>')` is NULL, with a comment explaining a framework registered after this migration has no tables yet on an upgrading database)

**Interfaces:** Consumes `requireStructureByKey("osfi-e23")` from `../../dist/structures`.

- [ ] **Step 1: Write the migration.** In one transaction: return early if `SELECT 1 FROM verifywise.frameworks WHERE id = 26` finds a row; else insert the frameworks row, create struct tables and seed them, create the status enum, impl table, indexes and `__risks` table — **same DDL and seeding as `20260805125946` / `20260805130326`** for a two-level entry (copy the per-framework body; do not import those files). `down`: drop `__risks`, impl, enum, struct tables, delete frameworks row 26 (guard each with IF EXISTS).
- [ ] **Step 2: Scratch env** (export in the shell; never write a `.env` into the worktree): DB_HOST/PORT/USER/PASSWORD from `/Users/gorkemcetin/verifywise/Servers/.env`, `DB_NAME=verifywise_e23_mig`, plus the test env vars from `.github/workflows/backend-checks.yml`. Before any CLI call assert `[[ "$DB_NAME" == verifywise_e23_* ]]`. `createdb`, `npm run build`, `npx sequelize db:migrate` → exits 0; framework 26 has 16 L1 / 83 L2 struct rows.
- [ ] **Step 3: Idempotency (fresh path).** On that DB (where `20260805*` already created E-23), the new migration logged a skip. Delete its `SequelizeMeta` row and re-run `db:migrate` → exits 0, still 16/83, one frameworks row 26.
- [ ] **Step 4: Upgrade path.** Simulate v2.6.8: drop the four E-23 tables + enum, delete frameworks row 26, delete `SequelizeMeta` rows for `20261117140851-build-empty-bundled-frameworks.js` and the new migration. Run `db:migrate` → exits 0 (fails without the guard: verify by temporarily reverting the guard once and seeing "relation ... does not exist", then restore). Framework 26 has 16/83; every struct row's title, description, summary, questions and evidence_examples equal the structure file's values (small node script in the scratchpad, never in the Servers tree).
- [ ] **Step 5:** Drop the scratch DB. Commit `feat(frameworks): migrate OSFI E-23 into existing databases` (both migration files).

### Task 5: Client badge

**Files:**
- Create: `Clients/public/assets/badges/osfi_e23.svg` (64×64 viewBox, same structure as `quebec_law25.svg`: filled circle + simple white mark, e.g. a stylized model/graph glyph with "E-23"; no maple leaf or government symbols — Canadian Government symbols are restricted)
- Modify: `Clients/src/presentation/tools/frameworkBadge.ts` (`"OSFI E-23 Model Risk Management": "osfi_e23"`)

- [ ] **Step 1:** Add both. `cd Clients && npm run typecheck && npm run format-check && npm run build` → all 0.
- [ ] **Step 2:** Commit `feat(frameworks): add OSFI E-23 badge`.

### Task 6: Docs and user guide

**Files:**
- Modify: `CLAUDE.md` (21→22 bundled, ids 5–26; Last Updated 2026-11-18), `Servers/CLAUDE.md` (Frameworks 5–26; Last Updated), `docs/technical/README.md`, `docs/technical/domains/compliance-frameworks.md` (counts, org-level catalog row for id 26, total 26 frameworks; anchor text `ids-526` and every link to the old `#bundled-frameworks-ids-525` anchor across docs), `docs/technical/domains/use-cases.md`, `docs/technical/domains/risk-management.md`, `docs/technical/infrastructure/file-storage.md`, `docs/technical/guides/adding-new-framework.md` (counts; next id **27**), `docs/technical/domains/mrm.md` (one line pointing to framework 26 for the programme-level checklist)
- Modify: code comments saying "21 bundled" in `Servers/mcp/tools/compliance.ts:149`, `Servers/utils/frameworkWriteAccess.utils.ts:6`; the route doc text that generates swagger's `bundled frameworks use ids 5-25` → `5-26`, then `npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift`
- Modify: `shared/user-guide-content/content/compliance/adding-frameworks.ts` (25→26 frameworks, 21→22 bundled, add the row to the organization-level table), `shared/user-guide-content/userGuideConfig.ts` (keywords `osfi`, `e-23`, `model risk`), `shared/user-guide-content/content/ai-governance/mrm.ts` (a short paragraph: for a principle-by-principle E-23 readiness checklist, add the OSFI E-23 framework on the Frameworks page)

- [ ] **Step 1:** Make the edits. Run the humanizer skill on the new guide paragraphs before saving.
- [ ] **Step 2:** `git grep -nE "5[-–]25|21 bundled|25 (compliance )?frameworks|ids-525"` → only historical migration comments remain.
- [ ] **Step 3:** Mirror the three changed `shared/user-guide-content` files to `/Users/gorkemcetin/website/verifywise/content/user-guide/` per `memory/documentation.md` (diff first; never copy website-only lines away). Do not commit the website repo.
- [ ] **Step 4:** `cd Servers && npm run format-check`; `cd Clients && npm run i18n:audit:strict && npm run format-check` → 0.
- [ ] **Step 5:** Commit `docs(frameworks): document OSFI E-23 and update framework counts`.

### Task 7: Final gates and review

- [ ] **Step 1:** `cd Servers && npm run build && npm run test -- --maxWorkers=2` → 0. `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check && npm run build` → 0.
- [ ] **Step 2:** Semgrep PR gate locally (pinned version, rulesets, `--baseline-commit origin/develop`, per `memory/feedback_semgrep_before_push.md`) → no new findings.
- [ ] **Step 3:** Browser check on a backend + frontend started from the worktree against a scratch DB (never the user's :3000/:5173): Frameworks → Manage frameworks → add OSFI E-23; badge shows; open 3 items; save status, owner, an evidence file, a linked risk and a note; remove the framework. Screenshot each.
- [ ] **Step 4:** Customer/competitor grep over `git diff origin/develop...HEAD` → clean.
- [ ] **Step 5:** `/code-review` on the branch, fix findings, push, open the PR (summary only, no test plan, unassigned).
