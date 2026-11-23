# PR 1: bundled frameworks in reports, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `frameworkRequirements` report section so generated reports cover the bundled frameworks (ids 5–28), not only ids 1–4.

**Architecture:** A new focused collector module reads, per resolved `projects_frameworks` target of a bundled framework, the struct and impl tables named by that framework's `FrameworkStructure`, plus evidence and linked-risk aggregates, in flat queries. `ReportDataCollector.collectAllData` dispatches to it like the ISO and NIST sections and merges pairings. Both renderers, the section catalog, the analyzer inputs and facts learn the section.

**Tech Stack:** Node 22, TypeScript, Express, Sequelize raw SQL (Postgres), EJS + Playwright (PDF), `docx` (DOCX), Jest.

**Spec:** `docs/superpowers/specs/2026-11-22-osfi-e23-mrm-completeness-report-design.md` §7 (this PR). PR 2 (§8) gets its own plan after this merges.

**Worktree / branch:** `~/verifywise-e23-report`, branch `feature/report-bundled-frameworks` cut from `feature/e23-mrm-completeness-report` (carries the spec and this plan). PR base: `develop`.

## Global Constraints

- All SQL uses unqualified table names, `:replacements`, and `organization_id = :organizationId` on every tenant table.
- Array predicates: `= ANY(ARRAY[:ids]::INTEGER[])` or `IN (:ids)`; never bare `ANY(:ids)`.
- Table names come only from a `FrameworkStructure` found by `getStructureById` (`Servers/structures/index.ts:73`); never from request input. Interpolating them is safe only because of that.
- "Done" = status `Implemented` or `Audited` (matches `addStatusCounts`, `utils/frameworkImpl.utils.ts:570-580`).
- Overdue = `due_date` before the report's `generatedAt` date (compare with `isoDate`, `dataCollector.ts:104`) and not done.
- No N+1: per target, one struct⋈impl query per level, one evidence aggregate, one risk aggregate, one user-name lookup.
- Both renderers change together; section label `"Framework requirements"`, sentence case. Group `"Compliance and governance"`.
- Bump `ANALYZER_VERSION` (`analyzers/prompts.ts:9`) to `report-analyzer-v3` and `FACTS_SCHEMA_VERSION` (`analyzers/facts.ts:31`) to `2`.
- Unit tests: `cd Servers && npm run test:unit -- <pattern> --maxWorkers=2` (never `npx jest`: it can wipe the dev DB). Integration: `npm run test:integration -- <pattern>` against a scratch `DB_NAME`.
- Commit format `type(scope): description`, detailed body.

## Review Focus

1. **Three-level bundled frameworks** (e.g. those with `l3_impl`): L3 rows must appear under their L2 parent and count in rollups, matching the Framework page's completion. Test in Task 2.
2. **A pairing with zero evidence and zero risks** must still render every requirement with `0` counts, not drop rows (LEFT JOINs). Test in Task 2.
3. **Requirement owner points at a user who no longer exists** (user row gone): the name renders as `"Unknown user"` and the report does not crash. Test in Task 2.
4. **Mixed selection** `["native:2","native:26"]`: ISO section and the bundled section both appear; a selection of only core frameworks emits `no_framework_target` for `frameworkRequirements` when requested. Test in Task 3.
5. **Two organizations with the same bundled framework**: evidence and risk aggregates never count the other org's rows. Test in Task 6.

---

### Task 1: Section types and catalog entry

**Files:**
- Modify: `Servers/domain.layer/interfaces/i.reportGeneration.ts` (add type near `NistSubcategoriesSectionData`, add key to `ReportData.sections`)
- Modify: `Servers/services/reporting/sectionCatalog.ts`
- Test: `Servers/services/reporting/__tests__/sectionCatalog.test.ts`

**Interfaces:**
- Produces:
```ts
export interface FrameworkRequirementRow {
  implId: number;
  level: 2 | 3;
  title: string;
  orderNo: number;
  status: string;            // raw IMPL_STATUSES value
  owner: string | null;      // display name
  reviewer: string | null;
  approver: string | null;
  dueDate: string | null;    // ISO date via isoDate
  isDone: boolean;
  isOverdue: boolean;
  evidenceCount: number;
  evidenceFiles: string[];   // file names, max 10, sorted
  riskCount: number;
  children?: FrameworkRequirementRow[]; // L3 under L2
}
export interface FrameworkRequirementGroup {
  title: string;
  orderNo: number;
  useCase?: string;          // set only when >1 pairing contributed (see compliance)
  requirements: FrameworkRequirementRow[];
  rollup: FrameworkRequirementRollup;
}
export interface FrameworkRequirementRollup {
  total: number; done: number; unassigned: number; noEvidence: number; overdue: number;
  statusBreakdown: Record<string, number>; // keyed by raw status
}
export interface FrameworkRequirementsSectionData {
  frameworks: Array<{
    frameworkId: number;
    frameworkName: string;
    groups: FrameworkRequirementGroup[];
    rollup: FrameworkRequirementRollup;
  }>;
}
```
  and `ReportData.sections.frameworkRequirements?: FrameworkRequirementsSectionData`.
- Rollups count every L2 and L3 impl row (same as `getDashboardCountsQuery`).

- [ ] **Step 1: Failing test** in `sectionCatalog.test.ts`: `it("lists frameworkRequirements under Compliance and governance")` asserting the catalog contains `{ key: "frameworkRequirements", label: "Framework requirements", group: "Compliance and governance" }` and that `SECTION_KEYS` includes it.
- [ ] **Step 2:** Run `npm run test:unit -- sectionCatalog --maxWorkers=2`; expect FAIL.
- [ ] **Step 3:** Add the types above and the catalog entry after `nistSubcategories`.
- [ ] **Step 4:** Run the test; expect PASS. Run `npm run build`; expect success.
- [ ] **Step 5:** Commit `feat(reporting): add framework requirements section type and catalog entry`.

### Task 2: Collector for one bundled-framework pairing

**Files:**
- Create: `Servers/services/reporting/collectors/frameworkRequirements.ts`
- Create: `Servers/services/reporting/collectors/frameworkRequirements.queries.ts` (SQL only)
- Test: `Servers/services/reporting/tests/frameworkRequirements.spec.ts` (mocks `sequelize.query` like `dataCollector.notices.spec.ts`)

**Interfaces:**
- Consumes: `FrameworkTarget` (`reportScope.ts`), `getStructureById`, `isoDate`, types from Task 1.
- Produces:
```ts
export const isBundledFrameworkId = (id: number): boolean; // getStructureById(id) !== null
export async function collectFrameworkRequirements(
  target: FrameworkTarget,
  organizationId: number,
  generatedAt: Date,
  resolveUserNames: (ids: unknown[]) => Promise<Map<number, string>>,
): Promise<FrameworkRequirementsSectionData>; // exactly one entry in `frameworks`
```
- Queries (each org-scoped, `projects_frameworks_id = :pfId`):
  - L2: `l1_struct s1 JOIN l2_struct s2 ON s2.<cols.l2_struct_parent> = s1.id JOIN l2_impl i ON i.<cols.l2_impl_meta> = s2.id`, ordered by `s1.order_no, s2.order_no`.
  - L3 (only when `tables.l3_impl`): same shape via `l3_struct`/`l3_impl` with `cols.l3_impl_parent` linking to the L2 impl.
  - Evidence: `SELECT fel.entity_type, fel.entity_id, f.filename FROM file_entity_links fel JOIN files f ON f.id = fel.file_id AND f.organization_id = fel.organization_id WHERE fel.organization_id = :organizationId AND fel.framework_type = :frameworkType AND fel.link_type = 'evidence' AND fel.entity_id IN (:implIds)`; group in JS by `(entity_type, entity_id)` using `entity_types.l2_impl` / `l3_impl`. Skip the query when `implIds` is empty.
  - Risks: `SELECT r.<cols.l2_risks_impl> AS impl_id, COUNT(*)::int FROM <l2_risks> r JOIN risks pr ON pr.id = r.projects_risks_id AND pr.is_deleted = false WHERE r.organization_id = :organizationId AND r.<l2_risks_impl> IN (:implIds) GROUP BY 1`; same for L3 when present.
- Missing user name → `"Unknown user"`; null id → `null`.
- Unknown framework id → throws `Error("Not a bundled framework: <id>")` (callers filter with `isBundledFrameworkId` first).

- [ ] **Step 1: Failing tests:**
  - `builds groups in order with rollups` — mock L2 rows for 2 groups / 3 requirements (one `Implemented`, one `Audited`, one `In progress` with past due date and no owner); expect `rollup = { total: 3, done: 2, unassigned: 1, noEvidence: <n>, overdue: 1 }` and groups ordered by `order_no`.
  - `attaches evidence names and risk counts` — evidence rows for one impl (12 files) → `evidenceCount: 12`, `evidenceFiles.length: 10`, sorted.
  - `keeps requirements with no evidence or risks` (Review Focus 2) — empty evidence/risk results → every row present with `0`.
  - `nests L3 rows and counts them` (Review Focus 1) — a structure with `l3_impl` (use a real three-level structure from `FRAMEWORK_STRUCTURES`, find it with `.find(s => s.tables.l3_impl)`) → children populated, rollup total includes L3.
  - `falls back to Unknown user` (Review Focus 3) — owner id 99 absent from the name map.
  - `skips evidence and risk queries when there are no impl rows` — `sequelize.query` called once.
- [ ] **Step 2:** Run `npm run test:unit -- frameworkRequirements --maxWorkers=2`; expect FAIL.
- [ ] **Step 3:** Implement the two files.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `feat(reporting): collect bundled framework requirements per pairing`.

### Task 3: Wire into `collectAllData` with merge and notices

**Files:**
- Modify: `Servers/services/reporting/dataCollector.ts` (framework dispatch ~398-453; expose `resolveUserNames` to the collector by passing `this.resolveUserNames.bind(this)`)
- Modify: `Servers/services/reporting/mergeSections.ts` (add `mergeFrameworkRequirements`)
- Test: `Servers/services/reporting/tests/mergeSections.spec.ts`, `Servers/services/reporting/tests/dataCollector.notices.spec.ts`

**Interfaces:**
- Produces: `mergeFrameworkRequirements(parts: Array<{ target: FrameworkTarget; data: FrameworkRequirementsSectionData }> | <same shape perTarget returns today>): FrameworkRequirementsSectionData`. Follow the existing merge signature in `mergeSections.ts` exactly. Same framework from several pairings → one framework entry; groups get `useCase = projectTitle` only when that framework had more than one pairing; framework rollup re-derived from pooled rows (never averaged).
- `bundledTargets = targets.filter(t => isBundledFrameworkId(t.frameworkId))`; when empty and `requested("frameworkRequirements")`, push `{ sectionKey: "frameworkRequirements", reason: noticeReason }`. Section is included for `sections.includes("frameworkRequirements") || sections.includes("all")`.
- Frameworks in output ordered by `frameworkId`.

- [ ] **Step 1: Failing tests:**
  - mergeSections: `merges two pairings of one framework with useCase labels and pooled rollup`; `keeps single-pairing output unlabelled`.
  - notices (Review Focus 4): `includes frameworkRequirements for native:26 alongside ISO`; `emits no_framework_target when only core frameworks are in scope and the section is requested`; `does not emit a notice for sections:["all"]`.
- [ ] **Step 2:** Run both specs; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both specs plus `dataCollector` specs; expect PASS.
- [ ] **Step 5:** Commit `feat(reporting): include bundled frameworks in report data collection`.

### Task 4: PDF and DOCX rendering

**Files:**
- Modify: `Servers/templates/reports/report-pdf.ejs` (TOC group guard line ~177, group guard ~598, new block after NIST ~873, `NOTICE_LABELS` ~1116)
- Modify: `Servers/services/reporting/docxGenerator.ts` (`SECTION_LABELS` ~64, TOC ~307, compliance guard ~1046, new block after NIST ~1272)
- Modify: `Servers/services/reporting/chartUtils.ts` only if `generateComplianceProgressChart` needs an adapter; prefer adapting data in the renderer prep (`pdfGenerator.ts` render data) over changing the chart.
- Test: `Servers/services/reporting/tests/docxGenerator.spec.ts`, `Servers/services/reporting/__tests__/reportPdfTemplate.test.ts`

**Render contract (both formats):** per framework: H3 `frameworkName`; line `"<done> of <total> requirements implemented or audited"`; completeness-by-group chart (PDF only if the chart helper is SVG-only, matching how other charts are handled in DOCX today); per group: heading (prefixed `"<useCase> · "` when set), table columns `Requirement | Status | Owner | Due date | Evidence`, L3 rows indented under their parent; when `evidenceFiles` non-empty, a small line `"Evidence: a.pdf, b.docx"` (+ `", and N more"` when `evidenceCount > evidenceFiles.length`). AI section summary box when `aiSummaries.sectionSummaries.frameworkRequirements` exists, as NIST does.

- [ ] **Step 1: Failing tests:** DOCX `renders framework requirements with progress line, group headings and evidence line` (assert text via `docxText`); PDF template `renders framework requirements block and TOC entry`; both `include frameworkRequirements in the compliance group guard` (a report whose only section is `frameworkRequirements` still renders the group heading).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement both renderers.
- [ ] **Step 4:** Run both specs; expect PASS. Generate one real PDF locally if Playwright headless shell is installed (memory: `npx playwright install chromium-headless-shell`) via the pdfGenerator spec path; eyeball for overflow.
- [ ] **Step 5:** Commit `feat(reporting): render framework requirements in PDF and DOCX`.

### Task 5: Analyzer inputs and facts

**Files:**
- Modify: `Servers/services/reporting/analyzers/prompts.ts` (`SECTION_LABELS` 19-33, `prepareSectionData` case, `ANALYZER_VERSION`)
- Modify: `Servers/services/reporting/analyzers/facts.ts` (per-section aggregates near 265, `FACTS_SCHEMA_VERSION`)
- Test: existing analyzer specs beside these files (find with `ls Servers/services/reporting/analyzers/__tests__`)

**Interfaces:**
- `prepareSectionData("frameworkRequirements", data)` returns compact text: per framework `name: done/total, overdue n, unassigned n, no evidence n`, then per group one line, then up to 25 not-done requirements ranked overdue first then unassigned, each `title [status] owner due`, with an explicit `… and N more` marker when truncated.
- Facts aggregates (names derived from fields): `frameworkRequirements_total`, `_done`, `_overdue`, `_unassigned`, `_no_evidence`, and `status_<value>` buckets capped at 8, per the facts naming rules in `docs/technical/domains/reporting.md` "Facts substrate".

- [ ] **Step 1: Failing tests:** `prepareSectionData renders frameworkRequirements with truncation marker`; `collectFacts emits frameworkRequirements aggregates`; `FACTS_SCHEMA_VERSION is 2` (guards the bump).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement; bump both versions.
- [ ] **Step 4:** Run the analyzer specs and `index.priorFacts.spec.ts`; expect PASS.
- [ ] **Step 5:** Commit `feat(reporting): feed framework requirements to report analyzers`.

### Task 6: Tenant isolation integration test

**Files:**
- Create: `Servers/tests/integration/tenant-isolation/report-framework-requirements.isolation.test.ts` (copy setup helpers from a sibling, e.g. the newest `*.isolation.test.ts` that seeds two orgs)

- [ ] **Step 1: Test** (Review Focus 5): two orgs, each with an organizational project carrying framework 26; org B attaches evidence and links a risk to the same requirement struct; `collectFrameworkRequirements` for org A's target returns `evidenceCount 0`, `riskCount 0`, and only org A's impl rows. Also assert org A cannot collect using org B's `projectFrameworkId` (returns zero groups).
- [ ] **Step 2:** Run `npm run test:integration -- report-framework-requirements` with a scratch `DB_NAME` (memory `local-integration-tests-scratch-db.md`); expect PASS (implementation already exists; if it fails, fix the query, not the test).
- [ ] **Step 3:** Register nothing new in `tenantIsolation.registry.ts` (no new tables); confirm the registry test still passes.
- [ ] **Step 4:** Commit `test(reporting): tenant isolation for framework requirements collector`.

### Task 7: Docs, guide and gates

**Files:**
- Modify: `docs/technical/domains/reporting.md` (catalog list, Data Sources table row, Framework Section Mapping, remove the "collector still builds framework sections only for ids 1–4" note)
- Modify: `docs/technical/domains/compliance-frameworks.md` (replace "Reporting limitation" with a short "Reporting" note pointing at `frameworkRequirements`)
- Modify: the reporting page of the in-app guide under `shared/user-guide-content/` (find with `grep -ril "generate report" shared/user-guide-content/content`), one paragraph on the new section; mirror the changed file to `~/website/verifywise/content/user-guide/` (copy the file only, never the index; do not commit the website repo)

- [ ] **Step 1:** Update the three docs and mirror the guide file.
- [ ] **Step 2:** Gates, all must pass unfiltered:
  - `cd Servers && npm run build && npm run format-check && npm run test:unit -- reporting --maxWorkers=2`
  - `cd Clients && npm run typecheck && npm run i18n:audit:strict && npm run format-check` (no client changes expected; run anyway)
  - Semgrep PR gate locally with `--baseline-commit origin/develop` (memory `feedback_semgrep_before_push.md`)
- [ ] **Step 3:** Commit `docs(reporting): document bundled framework coverage in reports`.
- [ ] **Step 4:** `/code-review` the branch, fix findings, push, open PR to `develop` (body: summary only, no test plan, no AI mention).
