# OSFI E-23 completeness report (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An "OSFI E-23 completeness" report on the Reporting page: a formal PDF/DOCX for an examiner or board, plus an internal fix-it list from the same run, built on PR 1's `frameworkRequirements` section.

**Architecture:** A template version declares `parameters_config` (`kind: "osfi_e23"` plus wizard fields). Answers flow controller → `sched` → `resolveReportRequest` → `ReportGenerationRequest.reportParameters` → `ReportData.metadata`. One report-only MRM collector feeds three pure builders (fleet status, contradiction rules, fix-it list); both renderers read them. A run with the fix-it list on produces a second "companion" file stored on `report_runs`.

**Tech Stack:** Node 22, Express 4, TypeScript, Sequelize raw SQL (Postgres), EJS + Playwright PDF, `docx`, zod analyzers, React 19 + MUI 7 + React Query.

**Spec:** `docs/superpowers/specs/2026-11-22-osfi-e23-mrm-completeness-report-design.md` §8 (read it; this plan argues from it). Builds on PR 1 (#5469).

## Global Constraints

- Worktree `~/verifywise-e23-pr2`, branch `feature/e23-mrm-completeness-report` (stacked on `feature/report-bundled-frameworks`).
- Unit tests only via `cd Servers && npm run test:unit -- <pattern> --maxWorkers=2`; never `npx jest` (can wipe the dev DB); never the Sequelize CLI. Frontend: `cd Clients && npx vitest run <path>`.
- Integration tests: scratch DB only, `DB_NAME=verifywise_it_e23report npm run test:integration -- --testPathPatterns=<pattern>` (see memory `local-integration-tests-scratch-db.md`); never the dev DB.
- Every query filters `organization_id`; arrays as `= ANY(ARRAY[:ids]::INTEGER[])` or `IN (:ids)`; flat queries, no N+1.
- New endpoints only under `/api/v1` (`routes/v1/index.ts`, two-arg `router.use("/<kebab>", router)` form); legacy `routes/legacy/reporting.routes.ts` is frozen. Run `npm run generate:swagger` and `npm run generate:endpoints` in Servers after route changes.
- Both renderers change together; shared text lives in one TS module (`services/reporting/e23/e23Text.ts`), never copied into EJS/DOCX by hand.
- `ANALYZER_VERSION` → `"report-analyzer-v4"`; `FACTS_SCHEMA_VERSION` → `3`.
- Report content is English only. Screen text: sentence case, house components (`StandardModal`, `Field`, `Select`, `CustomizableButton`, `Checkbox` wrapper if one exists), theme tokens, pixel-string spacing. The Reporting pages have no i18n today: follow the file's pattern, then run `npm run i18n:audit:strict`; if it flags new strings, add de/fr/es.
- Constants: `REVALIDATION_CADENCE_MONTHS` imported from `utils/mrm.utils.ts` (never copied); `METRIC_STALE_DAYS = 90`; `E23_FRAMEWORK_ID = 26`; `E23_KIND = "osfi_e23"`.
- No console.log; logger patterns. Commits `type(scope): description` + body; no AI mention; never stash/reset/rewrite history.
- Gates before PR: Servers `npm run build`, `npm run format-check`, full `NODE_OPTIONS=--max-old-space-size=6144 npm run test:unit -- --maxWorkers=2`; Clients `npm run typecheck && npm run i18n:audit:strict && npm run format-check && npm run build`; Semgrep 1.178.0 CI rulesets, baseline `origin/develop`.

## Decisions made here (spec §11 "left to the builder", and spec-vs-code gaps)

- **Kinds gating** is new code: today `getRequestedSections` silently drops unknown keys. Kind-gated keys in a request whose template kind differs → 400 in `runTemplateNow`, scheduled create/update, and the legacy `generateReportsV2`.
- **Quarterly** needs an anchor: `ScheduleConfig.anchorMonth?: number` (1–12, a month the run happens in). Cron months = anchor, +3, +6, +9 (mod 12). Day of month stays `dayOfMonth ?? 1` (the wizard has no day picker; month-end clamping is moot for day 1; the server rejects `dayOfMonth` > 28 for quarterly).
- **isFinal** is a `boolean` parameter field type (spec lists text/textarea/date/select; the checkbox needs one more).
- **Change since previous run without AI:** the "At a glance" figures are stored on the run (`config_snapshot.e23_glance`, merged at the end of the run) and read back from the previous successful run: same schedule for scheduled runs, same template (any trigger) for manual runs. The AI facts prior uses the same rule for kind `osfi_e23`.
- **Model inventory appendix** stays portrait, split into two tables (identity; validation and monitoring). No landscape (unsupported per section).
- **Watermark / internal footer (PDF):** `position: fixed` elements, which Chromium repeats on every printed page. DOCX: header text (draft) and footer text (internal).
- **Contradiction rules with several E-23 pairings:** a rule is evaluated against every requirement row whose number matches; it fires when any matched row is done and the data condition holds.
- **One MRM collector** (`collectMrmModelFacts`) returns every model incl. retired, flagged; fleet, rules, appendix and fix-it list all derive from it, so their counts agree.

## Review Focus

1. **Org without E-23 on file:** formal report renders with `no_framework_target` notices for completeness and contradictions, MRM status still shows, no rule runs, fix-it list holds only model items. Test in Task 7.
2. **Org with zero models:** MRM status says "No models in the inventory" (never empty tables that read as clean); C1 fires only if 2.1.4 is done. Tests in Tasks 4 and 5.
3. **Departed users:** validator/developer matching (C5) uses user ids, not names; names that no longer resolve print "Unknown user" and owners count as "Unassigned" in the fix-it list. Test in Task 6.
4. **Hostile free text in parameters** (`<script>`, newlines, 1000-char scope note): escaped in EJS (`<%=` only), plain text runs in DOCX, `oneLine` in prompts. Test in Task 8.
5. **Custom or duplicated templates:** a duplicate of the E-23 template keeps `parameters_config` and stays an E-23 report; a template without a kind that requests `mrmFleet` gets 400, not a silent drop. Tests in Tasks 3 and 11.

---

### Task 1: Storage, types, catalog kinds

**Files:**
- Create: `Servers/database/migrations/20261122120000-report-parameters-and-companion-file.js`
- Modify: `Servers/domain.layer/interfaces/i.reportTemplate.ts` (ReportFrequency, ScheduleConfig, new parameter types), `Servers/domain.layer/interfaces/i.reportGeneration.ts` (request, metadata, result, new section data types), `Servers/services/reporting/sectionCatalog.ts`, `Servers/services/reporting/analyzers/prompts.ts` (`SECTION_LABELS`), `Clients/src/domain/interfaces/i.reporting.ts` (mirrors)
- Test: `Servers/services/reporting/__tests__/sectionCatalog.test.ts`, `Servers/controllers/__tests__/reportTemplate.ctrl.test.ts` (catalog count)

**Interfaces — Produces:**
- Migration (pattern `20260729205954-report-framework-selection.js`, `IF NOT EXISTS`, down drops `IF EXISTS`): `report_template_versions.parameters_config JSONB NOT NULL DEFAULT '{}'`; `scheduled_reports.report_parameters JSONB NOT NULL DEFAULT '{}'`; `report_runs.companion_file_id INTEGER REFERENCES verifywise.files(id) ON DELETE SET NULL`, `report_runs.companion_filename VARCHAR(255)`, `report_runs.companion_mime_type VARCHAR(255)`.
- `type ReportFrequency = "daily" | "weekly" | "monthly" | "quarterly"`; `ScheduleConfig.anchorMonth?: number`.
- `type ReportParameterFieldType = "text" | "textarea" | "date" | "select" | "boolean"`; `interface ReportParameterField { key: string; label: string; type: ReportParameterFieldType; required: boolean; maxLength?: number; options?: { value: string; label: string }[] }`; `interface ReportParametersConfig { kind?: string; fields?: ReportParameterField[] }`; `type ReportParameters = Record<string, string | boolean>`.
- `E23_KIND = "osfi_e23"` and `E23_PARAMETER_FIELDS: ReportParameterField[]` exported from `Servers/services/reporting/e23/e23Parameters.ts` (create), keys exactly: `periodStart`, `periodEnd` (date, required), `institutionName` (text 200, req), `accountableExecutiveName`, `accountableExecutiveTitle` (text 200, req), `headOfValidationName`, `headOfValidationTitle` (text 200, optional), `preparedByName`, `preparedByTitle` (text 200, req), `audience` (select, req, options `osfi` "OSFI supervisory review", `board` "Board of directors"), `scopeNote` (textarea 1000, optional), `isFinal` (boolean, optional).
- `ReportGenerationRequest.reportParameters?: ReportParameters`, `.reportKind?: string`, `.templateId?: number`; `ReportMetadata.reportParameters?: ReportParameters`, `.reportKind?: string`; `ReportGenerationResult.companion?: { filename: string; content: Buffer; mimeType: string }`.
- Catalog entry type gains `kinds?: string[]`. Five new entries, group "Compliance and governance" unless noted, all `kinds: ["osfi_e23"]`: `mrmFleet` "Model risk management status", `e23Contradictions` "Where the checklist and the data disagree", `e23FixItList` "Fix-it list (internal document)", `mrmInventoryAppendix` "Model inventory appendix", `signOff` "Sign-off". `export function kindViolations(keys: string[], kind: string | undefined): string[]` in `sectionCatalog.ts` (keys whose entry has `kinds` not containing `kind`).
- Section data types in `i.reportGeneration.ts` (names used by every later task): `MrmModelFacts`, `MrmActivity`, `MrmFleetSectionData`, `E23ContradictionsSectionData`, `E23FixItItem`, `E23FixItListSectionData`, `MrmInventoryAppendixSectionData`, `E23Glance`. Field lists are in Tasks 4–7; declare them here with exactly those fields.

- [ ] **Step 1:** Tests: catalog has 18 entries; the five keys carry `kinds: ["osfi_e23"]`; `frameworkRequirements` has no `kinds`; `kindViolations(["mrmFleet","frameworkRequirements"], undefined)` → `["mrmFleet"]`; `kindViolations(["mrmFleet"], "osfi_e23")` → `[]`; controller test expects 18.
- [ ] **Step 2:** Run `npm run test:unit -- sectionCatalog reportTemplate.ctrl --maxWorkers=2` → FAIL.
- [ ] **Step 3:** Implement migration, types, catalog, `SECTION_LABELS` entries (same labels), client mirrors.
- [ ] **Step 4:** Run tests → PASS; `npm run build` (Servers), `npm run typecheck` (Clients).
- [ ] **Step 5:** Commit `feat(reporting): storage and types for report parameters and companion files`.

### Task 2: Pure rules: parameter validation, quarterly schedule, rolling period

**Files:**
- Create: `Servers/services/reporting/reportParameters.ts`, `Servers/services/reporting/__tests__/reportParameters.test.ts`
- Modify: `Servers/services/reporting/scheduleCalculator.ts`, its test (create `__tests__/scheduleCalculator.test.ts` if none)

**Interfaces — Produces:**
- `validateReportParameters(config: ReportParametersConfig, raw: unknown, opts: { now: Date; requirePeriod: boolean }): { value: ReportParameters; errors: { key: string; message: string; params?: Record<string, string | number> }[] }`. Messages are English `req.t` keys with `{placeholders}` (controllers translate). Rules: raw must be a plain object; unknown keys → error "unknown report parameter: {key}"; required missing/blank (after trim) → "{label} is required"; length > maxLength → "{label} must be at most {max} characters"; date must be `YYYY-MM-DD` and a real date; `periodEnd` ≤ today (`opts.now`, UTC date) and ≥ `periodStart`; select value in options; boolean must be boolean. Strings are trimmed. When `requirePeriod` is false (schedules), `periodStart`/`periodEnd` are rejected if sent ("the reporting period is set at run time for schedules").
- `validateScheduleConfig(cfg: unknown): string[]`: frequency in the four values; quarterly requires `anchorMonth` integer 1–12 and `dayOfMonth` (if present) 1–28.
- `computeNextRun` quarterly cron: `${m} ${h} ${dayOfMonth ?? 1} ${months} *` with months = sorted `[a, a+3, a+6, a+9]` wrapped to 1–12. Unknown frequency throws (no silent monthly fallback).
- `rollingPeriod(frequency: ReportFrequency, runDate: Date): { periodStart: string; periodEnd: string }`: end = day before `runDate` (UTC date); start = end minus one interval plus one day (daily: start = end; weekly: end − 6 days; monthly: end − 1 month + 1 day; quarterly: end − 3 months + 1 day; month math clamps to month end, e.g. run 2026-06-01 quarterly → 2026-03-01…2026-05-31; run 2026-03-31 monthly → 2026-03-01…2026-03-30).

- [ ] **Step 1:** Tests: one per validation rule above (unknown key, each required field blank, 201-char name, 1001-char note, `2026-02-30`, end in the future, end before start, `audience: "regulator"`, `isFinal: "yes"`, period rejected for schedules); quarterly next run from 2026-11-22 with anchor 11 day 1 09:00 UTC → 2027-02-01T09:00Z; anchor 2 → 2027-02-01 too, anchor 12 → 2026-12-01; `validateScheduleConfig({frequency:"quarterly"})` → anchorMonth error; unknown frequency throws; `rollingPeriod` cases above plus daily/weekly.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(reporting): validate report parameters, quarterly schedules and rolling periods`.

### Task 3: Request flow, endpoints, template duplication

**Files:**
- Modify: `Servers/utils/reportTemplate.utils.ts` (`createTemplateVersionQuery`, version selects), `Servers/controllers/reportTemplate.ctrl.ts` (`VERSION_CONFIG_FIELDS`, `runTemplateNow`, create body), `Servers/controllers/scheduledReport.ctrl.ts` + `Servers/utils/scheduledReport.utils.ts` (`UPDATABLE_FIELDS`, create), `Servers/services/reporting/scheduledReportService.ts` (`validateScheduledReportInput` calls `validateScheduleConfig`), `Servers/services/reporting/reportTemplateResolver.ts`, `Servers/services/reporting/reportRunOrchestrator.ts`, `Servers/services/reporting/index.ts` (metadata), `Servers/services/reporting/dataCollector.ts` (metadata fields), `Servers/controllers/reporting.ctrl.ts` (`generateReportsV2` kinds 400), `Servers/utils/reportRun.utils.ts` (last-parameters query), `Servers/routes/v1/index.ts`
- Create: `Servers/routes/v1/reportTemplates.route.ts`, `Servers/routes/v1/scheduledReports.route.ts`, `Servers/controllers/reportParameters.ctrl.ts`, `Servers/tests/integration/tenant-isolation/report-last-parameters.isolation.test.ts`
- Test: controller tests next to the existing ones (`controllers/__tests__/reportTemplate.ctrl.test.ts`, `scheduledReport.ctrl` test), `services/reporting/tests/reportTemplateResolver.spec.ts` (create if absent)

**Interfaces:**
- Consumes: Task 1 types, Task 2 validators.
- Produces: `sched.parameters_config` (loaded from the template version by `template_version_id` in both run-now and scheduler paths) and `sched.report_parameters`; `resolveReportRequest` sets `reportKind = parameters_config.kind`, `reportParameters`, `templateId`; for scheduled runs (`opts.triggeredBy === "scheduler"` or a schedule's run-now) the orchestrator merges `rollingPeriod(schedule_config.frequency, scheduledFor ?? now)` into the parameters. `config_snapshot.report_parameters` = the final parameters. `ReportData.metadata.reportParameters`/`reportKind` set in `collectAllData`.
- `getLastParametersQuery(templateId: number, organizationId: number): Promise<{ parameters: ReportParameters; periodEnd: string | null } | null>` — latest `status = 'success'` run of the template in the org, `config_snapshot->'report_parameters'` minus `periodStart`/`periodEnd`, plus the old `periodEnd`.
- v1 routes (thin, reuse controllers, same middleware as legacy): `POST /api/v1/report-templates/:id/run` → `runTemplateNow`; `GET /api/v1/report-templates/:id/last-parameters` → `getLastParameters` (authenticateJWT + `authorize("reportTemplate.edit")`, 404 if the template is not visible to the org); `POST /api/v1/scheduled-reports` and `PATCH /api/v1/scheduled-reports/:id` → existing create/update.
- 400s (via `req.t` where the controller has it): parameter errors (all of them, `{ errors: string[] }`); `kindViolations` non-empty → "section {key} is only available in an OSFI E-23 report"; a kind template run with no parameters → required-field errors.
- Template create/duplicate: `parameters_config` accepted in the create body, copied by `createTemplateVersionQuery`, listed in `VERSION_CONFIG_FIELDS`; `Clients/.../TemplatesTab.tsx` `handleDuplicate` sends `parameters_config`.

- [ ] **Step 1:** Tests: runTemplateNow with an `osfi_e23` version and valid parameters passes them into `runScheduledReport` sched; missing `institutionName` → 400 listing it; non-kind version + `mrmFleet` section → 400; legacy `generateReportsV2` with `mrmFleet` → 400; scheduled create with `periodStart` → 400; scheduled create quarterly without anchor → 400; resolver maps `parameters_config.kind`; orchestrator snapshot carries `report_parameters` with rolling period for `scheduledFor = 2026-11-01` quarterly → `2026-08-01…2026-10-31`; duplicate body includes `parameters_config` (vitest on TemplatesTab handler or the repository call).
- [ ] **Step 2:** Integration isolation test (scratch DB): org A's last-parameters never returns org B's run of the same system template; a run of another template is ignored.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** Run unit + the isolation test → PASS; `generate:swagger`, `generate:endpoints`; build.
- [ ] **Step 6:** Commit `feat(reporting): carry report parameters from template to renderer`.

### Task 4: MRM model facts collector, fleet status and inventory appendix

**Files:**
- Create: `Servers/services/reporting/collectors/mrmModelFacts.ts`, `Servers/services/reporting/collectors/mrmModelFacts.queries.ts`, `Servers/services/reporting/e23/mrmFleet.ts`, `Servers/services/reporting/e23/__tests__/mrmFleet.test.ts`, `Servers/tests/integration/tenant-isolation/report-mrm-model-facts.isolation.test.ts`

**Interfaces — Produces:**
- `collectMrmModelFacts(organizationId: number, generatedAt: Date, period: { start: string; end: string } | null, resolveUserNames: (ids: unknown[]) => Promise<Map<number,string>>): Promise<{ models: MrmModelFacts[]; activity: MrmActivity }>`. Flat queries, one per table (models; roles; latest signed-off validation per model via `DISTINCT ON`; open validation per model; findings; active threshold counts; latest `mrm_metrics.received_at` per model), all `organization_id`-scoped, joined in memory.
- `MrmModelFacts`: `{ id; name (model_inventories.model); version; provider; type; status: string | null; retired: boolean (status = 'Retired'); tier: "1"|"2"|"3"|null; tieredAt: string|null; revalidationFlagged: boolean; intendedUse; limitations; inventoryApproverId: number|null; inventoryApprover: string|null; roles: { owner: string[]; developerIds: number[]; validator: string[]; approver: string[] } (names; owner/approver lists only resolved members); hasOpenValidation: boolean; openValidationNextDue: string|null; latestSignedOff: { validatorId: number|null; outcome: string|null; signedOffAt: string; emptyReportSections: string[] } | null; nextReviewDue: string|null; activeThresholds: number; lastMetricReceivedAt: string|null; findings: { severity: string; stage: string; dueDate: string|null; remediationPlanEmpty: boolean }[] }`. `emptyReportSections` lists which of `purpose_scope, conceptual_soundness, data_review, outcomes_analysis, findings_limitations, conclusion_signoff` are missing or have empty trimmed `text` in `report` JSONB.
- `MrmActivity` (within period, `null` period → zeros and `period: null`): `{ validationsSignedOff; findingsOpened; findingsClosed; breaches (mrm_metric_evaluations status 'breach' by evaluated_at, joined to mrm_metrics for org/model); revalidationEvents (mrm_revalidation_events.fired_at) }`.
- Pure `buildMrmFleet(models: MrmModelFacts[], activity: MrmActivity, generatedAt: Date): MrmFleetSectionData` over non-retired models only: `{ totals: { models; untiered; byTier: Record<"1"|"2"|"3", number> }; validationCoverage: { validated (latestSignedOff outcome present); inReview (hasOpenValidation, not overdue); notStarted (no signed-off and no open); overdue (open with nextDue < generatedAt) }; openFindingsBySeverity: Record<"critical"|"high"|"medium"|"low", number> ("open" = stage not 'closed'); monitoring: { withActiveThresholds; withRecentMetric (received within METRIC_STALE_DAYS) }; activity; perTier: { tier; models; tieringCurrent; validated; monitoringActive; openFindings; criticalHighFindings }[]; exceptions: { name; tier; issues: string[] }[] (models with any of: untiered, overdue validation, no owner role, critical/high open finding) }`. No per-tier verdict field.
- Pure `buildInventoryAppendix(models): MrmInventoryAppendixSectionData` = `{ active: Row[]; retired: Row[] }`, Row = name, version, provider, type, tier, status, owner, approver, intendedUse, limitations (first 300 chars + "…"), latestOutcome, latestSignedOffAt, nextReviewDue, activeThresholds (boolean), openFindings (count). Sorted by name.
- `METRIC_STALE_DAYS = 90` exported from `e23/mrmFleet.ts`.

- [ ] **Step 1:** Unit tests for `buildMrmFleet`: retired excluded from every count; zero models → all zeros and empty `exceptions`; overdue boundary (nextDue = generatedAt → not overdue; one ms before → overdue); metric at exactly 90 days → recent, 90 days + 1 ms → stale; closed finding not open; resolved finding still open. `buildInventoryAppendix`: retired split, 301-char limitations truncated.
- [ ] **Step 2:** Integration isolation test (scratch DB, follow `report-framework-requirements.isolation.test.ts`): two orgs each with a model, role, validation, finding, threshold, metric, evaluation, revalidation event; org A's facts contain only org A rows; plant org B rows that point at org A model ids and prove each predicate (delete-a-predicate check, as PR 1 did).
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** Run → PASS.
- [ ] **Step 6:** Commit `feat(reporting): collect MRM model facts and fleet status for reports`.

### Task 5: Contradiction rules

**Files:**
- Create: `Servers/services/reporting/e23/contradictionRules.ts`, `Servers/services/reporting/e23/__tests__/contradictionRules.test.ts`, `Servers/services/reporting/e23/__tests__/ruleNumbers.structure.test.ts`

**Interfaces:**
- Consumes: `MrmModelFacts` (Task 4), `FrameworkRequirementsSectionData` (PR 1), `REVALIDATION_CADENCE_MONTHS` and `computeNextReviewDue` from `utils/mrm.utils.ts`.
- Produces: `E23_RULES: readonly { id: "C1"…"C13"; requirement: string /* "2.1.4" */; description: string; dataCondition: string }[]` (descriptions and conditions are the spec §8.4 table text, plain English, used by both renderers and the prompt). `evaluateE23Rules(input: { requirements: FrameworkRequirementsSectionData | undefined; models: MrmModelFacts[]; generatedAt: Date }): E23ContradictionsSectionData` = `{ available: boolean /* false when no E-23 framework 26 in requirements */; fired: { ruleId; requirement; requirementTitle; claimedStatus; finding: string; affectedCount: number; examples: string[] /* ≤5 model names */; moreCount: number }[]; checked: string[] /* rule ids evaluated */; notRun: { ruleId; requirement; reason: string }[]; coverage: Record<string /* group title */, "checked" | "selfAssessmentOnly"> }`.
- Requirement matching: E-23 rows (framework 26, L2 and L3) whose title's text before the first space equals the rule's number. No match → `notRun` with reason `requirement {n} not found in this organization's E-23 checklist`. A rule is checked when matched; it fires when any matched row `isDone` and the condition holds for ≥1 model (C1: zero non-retired models). Coverage: a group is "checked" when it contains a matched row of any rule (from `E23_RULES`, so it cannot drift).
- Conditions over non-retired models exactly as spec §8.4, with: C3 last affirmed = later of `tieredAt` and `latestSignedOff.signedOffAt`; fires when `computeNextReviewDue(tier, lastAffirmed) < generatedAt`, or `revalidationFlagged && !hasOpenValidation`; C5 `latestSignedOff.validatorId` in `roles.developerIds`; C6 open validation with `openValidationNextDue < generatedAt`; C7 `latestSignedOff.emptyReportSections.length > 0`; C8 no approver role names and `inventoryApproverId == null`; C9 status `'Approved'` and a critical/high finding with stage `'open'` and `remediationPlanEmpty`; C10 tier "1"/"2" with `activeThresholds === 0`; C11 `activeThresholds > 0` and (`lastMetricReceivedAt` null or older than `METRIC_STALE_DAYS`); C12 critical/high finding, stage ≠ 'closed', `dueDate < generatedAt`; C13 status 'Approved' and `latestSignedOff.outcome === 'not_validated'`. C2 tier null; C4 `roles.owner` empty.

- [ ] **Step 1:** Tests: for each rule one firing case and one silent case at its boundary (requirement `In progress` → silent with condition true; C3 exactly at cadence → silent, one day past → fires, for tier 1/2/3 using 12/18/24 months; C3 sign-off later than tieredAt resets the clock; C11 exactly 90 days → silent; retired model never counts; C9 with a remediation plan → silent; C12 resolved-but-overdue fires, closed doesn't); examples cap at 5 with `moreCount`; requirement missing → `notRun` and never in `fired`; no framework 26 → `available: false`; coverage labels for "Principle 2.2 – Model risk rating (C.2)" (checked) and "Principle 1.3 – Use of models (B.3)" (self-assessment only); two E-23 pairings, one done → fires.
- [ ] **Step 2:** Structure test: every `E23_RULES[].requirement` exists as a title prefix in `Servers/structures/OSFI-E-23/osfi-e23.structure.ts` (load via `getStructureById(26)`).
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** Run → PASS.
- [ ] **Step 6:** Commit `feat(reporting): fixed E-23 contradiction rules over MRM data`.

### Task 6: Fix-it list builder

**Files:**
- Create: `Servers/services/reporting/e23/fixItList.ts`, `Servers/services/reporting/e23/__tests__/fixItList.test.ts`

**Interfaces:**
- Consumes: Tasks 4–5 outputs, PR 1 rows, `hasNoActiveOwner` (PR 1 `collectors/frameworkRollup.ts`).
- Produces: `buildE23FixItList(input: { requirements: FrameworkRequirementsSectionData | undefined; contradictions: E23ContradictionsSectionData; models: MrmModelFacts[]; generatedAt: Date }): E23FixItListSectionData` = `{ items: E23FixItItem[]; counts: { high; medium; low } }`. `E23FixItItem = { severity: "high"|"medium"|"low"; source: 1|2|3|4|5|6|7; what: string; where: string /* "2.1.4 Enterprise-level …" or model name */; owner: string /* "Unassigned" when hasNoActiveOwner */; dueDate: string|null; overdue: boolean; closesWhen: string; sortKey: number /* requirement orderNo or 0 */ }`.
- Sources and severity exactly as spec §8.6. A requirement row produces at most one item: the first matching source in order 3, 2, 4, 5, 6 (overdue beats unassigned). Status strings come from the same constants PR 1 uses (`DONE_STATUSES`; take the exact "Needs rework" string from the framework impl status list, do not retype it). Source 7: one item per non-retired model with ≥1 gap (untiered, overdue validation, no owner role, no approver role and no inventory approver, tier 1/2 without active threshold, open critical/high finding); `what` lists the gaps; high when tier "1" or it has an open critical/high finding.
- `closesWhen` texts live in `e23/e23Text.ts` (`FIX_IT_CLOSES_WHEN: Record<source, string>`; source 1 uses the rule's data condition negated, e.g. "Every model has an MRM tier").
- Order: severity (high, medium, low), then overdue first, then `sortKey`, then `where` (locale compare).

- [ ] **Step 1:** Tests: each source produces its item with the right severity; an overdue unassigned requirement yields one source-3 item; done row with evidence → no item; done row without evidence → source 5; tier 3 model with only "no owner role" → medium; same model with an open critical finding → high; owner "Unknown user" prints "Unassigned"; ordering across mixed items; counts match items.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(reporting): deterministic E-23 fix-it list`.

### Task 7: Wire E-23 sections into data collection, glance and prior run

**Files:**
- Modify: `Servers/services/reporting/dataCollector.ts`, `Servers/services/reporting/index.ts`, `Servers/services/reporting/reportRunOrchestrator.ts`, `Servers/utils/reportRun.utils.ts`
- Create: `Servers/services/reporting/e23/glance.ts`, `Servers/services/reporting/e23/__tests__/glance.test.ts`
- Test: `Servers/services/reporting/tests/dataCollector.e23.spec.ts`

**Interfaces:**
- Consumes: Tasks 1, 3–6.
- Produces: when `request.reportKind === E23_KIND`, `collectAllData` collects `frameworkRequirements` for framework 26 (always, even if the section is off, because rules and fix-it need it; it is still rendered only when selected), calls `collectMrmModelFacts` once, and sets `sections.mrmFleet`, `sections.e23Contradictions`, `sections.e23FixItList`, `sections.mrmInventoryAppendix`, `sections.signOff = {}` for the selected keys; `sections.e23Glance` always. Without E-23 on file: `e23Contradictions.available = false` and `sectionNotices` gets `{ sectionKey: "e23Contradictions", reason: "no_framework_target" }` (and the same for `frameworkRequirements` if selected).
- `buildE23Glance(input): E23Glance` = `{ requirementsDone; requirementsTotal; groupsChecked; groupsTotal; rulesFired; rulesTotal: 13; modelsInScope; untiered; overdueValidations; openCriticalHigh; fixIt: { high; medium; low }; previous: (same numeric fields + generatedAt) | null }`.
- `getPriorE23GlanceQuery(organizationId, opts: { scheduledReportId?: number; templateId?: number }): Promise<(E23Glance & { generatedAt: string }) | null>`: latest `status IN ('success','partial_success')` run, same schedule when `scheduledReportId`, else same `template_id` (any trigger), `config_snapshot ? 'e23_glance'`.
- Orchestrator: after a successful run, `config_snapshot = config_snapshot || jsonb_build_object('e23_glance', :glance)` (extend `updateRunStatusQuery` with an optional `configSnapshotPatch`). `ReportGenerationResult.e23Glance?: E23Glance` carries it out of `generateReport`.

- [ ] **Step 1:** Tests: kind run without framework 26 → notices and `available: false`, `mrmFleet` still present, fix-it has only model items; kind run selects `mrmFleet` only → no `e23Contradictions` section but glance still computed; non-kind run never calls `collectMrmModelFacts`; glance numbers equal the section numbers; prior lookup prefers schedule id, falls back to template id.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; run `reporting` unit suite.
- [ ] **Step 5:** Commit `feat(reporting): collect E-23 sections and at-a-glance figures`.

### Task 8: Formal report rendering (PDF and DOCX)

**Files:**
- Create: `Servers/services/reporting/e23/e23Text.ts` (if not created in Task 6, extend it), `Servers/templates/reports/partials/e23-formal.ejs` (or inline blocks if the template has no partials; follow PR 1's style)
- Modify: `Servers/templates/reports/report-pdf.ejs`, `Servers/templates/reports/styles/pdf.css`, `Servers/services/reporting/pdfGenerator.ts` (`renderTemplate` data), `Servers/services/reporting/docxGenerator.ts` (cover, TOC, `allChildren`, header, new section builders)
- Test: `Servers/services/reporting/tests/docxGenerator.e23.spec.ts`, `Servers/services/reporting/__tests__/reportPdfTemplate.e23.test.ts` (render EJS to HTML string, as PR 1's template test does)

**Interfaces:**
- Consumes: Task 7 `ReportData`.
- `e23Text.ts` exports: `E23_REPORT_TITLE = "OSFI E-23 model risk management: completeness report"`; `AUDIENCE_LINES = { osfi: "Prepared for OSFI supervisory review", board: "Prepared for the Board of directors" }`; `scopeAndMethod(params, opts: { board: boolean }): { paragraphs: string[]; limitations: string[] }` (self-assessment statement, two data sources, scope note, period rule "Position as at {generated}. Activity counts cover {start} to {end}.", AI labelling, cadence 12/18/24 from `REVALIDATION_CADENCE_MONTHS`, 90-day window, limitations exactly as spec §8.3; board = method shortened to one paragraph, limitations kept); `SIGN_OFF_STATEMENT`; `DRAFT_WATERMARK = "Draft: not for distribution"`; `POSITION_LABELS = { consistent: "Data consistent with self-assessment", "partly consistent": "Data partly consistent with self-assessment", inconsistent: "Data inconsistent with self-assessment", "not assessable": "Not assessable from VerifyWise data" }`; `COVERAGE_LABELS = { checked: "Checked against MRM data", selfAssessmentOnly: "Self-assessment only" }`; `NO_CONTRADICTIONS = "No contradictions found by the rules in this report"`.
- Both renderers, only when `metadata.reportKind === "osfi_e23"`, in spec §8.3 order: cover (institution, title, audience line, period, as-of, prepared by, accountable executive), scope and method, at a glance (with "Change since previous run (date)" lines when `previous`), executive summary (existing), E-23 program completeness (PR 1 section plus coverage label per group; board: one line per group "n of m · coverage", no requirement rows), MRM status (board: no `exceptions` names), contradictions (board: no examples; empty: `NO_CONTRADICTIONS` + checked rule list; "Rules not run" list), e23Gap (Task 10 adds), appendix (examiner only, when selected), notices/abstentions (existing), sign-off (draft: "Draft" in place of signature lines; final: name, title, signature, date lines for accountable executive and, when given, head of validation). Recommended actions are NOT rendered in the formal report for this kind. Non-kind reports render exactly as before.
- Draft (`isFinal !== true`): PDF fixed-position diagonal `DRAFT_WATERMARK` on every page; DOCX default header with `DRAFT_WATERMARK`.

- [ ] **Step 1:** Tests (EJS HTML string and DOCX text, as PR 1 does): examiner run shows requirement rows, model names in exceptions and examples, appendix when selected; board run of the same `ReportData` shows none of those but identical glance numbers; draft shows watermark text and "Draft" sign-off; final shows signature lines and no watermark; `<script>` in `institutionName` and a 1000-char scope note render escaped/intact in both; no-contradictions state lists checked rules; a non-kind report's HTML is unchanged versus a snapshot of PR 1 output for the same data (assert absence of every E-23 heading); recommended actions absent for kind.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; `npm run build`; render a scratch PDF of an examiner and a board run (hand-built ReportData → `dist/services/reporting/pdfGenerator.js`, `pdftoppm -r 70`) and look at every page.
- [ ] **Step 5:** Commit `feat(reporting): render the E-23 formal report in PDF and DOCX`.

### Task 9: Fix-it companion document, storage, download, delete, delivery

**Files:**
- Create: `Servers/templates/reports/e23-fixit-pdf.ejs`, `Servers/services/reporting/docxFixIt.ts`, `Servers/routes/v1/reportRuns.route.ts`
- Modify: `Servers/services/reporting/pdfGenerator.ts` (`generateFixItPDF(reportData)` reusing `renderTemplate` with a template path), `Servers/services/reporting/docxGenerator.ts` (export the helpers `docxFixIt.ts` needs: `createTable`, `createSectionHeader`, `createSubsectionHeader`, `createEmptyState`, `COLORS`), `Servers/services/reporting/index.ts` (produce `companion` when kind + `e23FixItList` selected; any companion error → `success: false` for the whole result), `Servers/services/reporting/reportRunOrchestrator.ts` (upload companion with `uploadFile(..., "All reports", org)` BEFORE `deliverReport`, regardless of `saveToStorage`; upload failure → run `failed`, no delivery; store `companion_file_id/filename/mime_type`), `Servers/utils/reportRun.utils.ts` (`deleteRunQuery` deletes both files; run list/get selects the companion columns and `config_snapshot->'report_parameters'->>'isFinal'`), `Servers/controllers/reportRun.ctrl.ts` (`downloadRunCompanion`, same `denyUnlessVisible` + org checks as `downloadRun`), `Servers/routes/v1/index.ts`, `Clients/src/presentation/pages/Reporting/ReportRunsTable.tsx` + repository/hook (second download action "Download fix-it list"; "Draft"/"Final" chip when the run has `isFinal` set)
- Test: `Servers/services/reporting/tests/reportRunOrchestrator.companion.spec.ts`, `Servers/controllers/__tests__/reportRun.ctrl.test.ts`, `Servers/services/reporting/tests/docxFixIt.spec.ts`, fix-it EJS render test, `Clients/.../__tests__/ReportRunsTable.test.tsx`

**Interfaces:**
- `GET /api/v1/report-runs/:id/download/fix-it-list` → `downloadRunCompanion` (404 when no `companion_file_id` or not visible).
- Fix-it document: cover (institution, "OSFI E-23 fix-it list", "Internal: not for external distribution", as-of, run id), every page footer "Internal: not for external distribution" (PDF fixed footer; DOCX footer), items table grouped by severity (severity, what, where, owner, due date, closes when), then AI recommended actions (existing renderer pieces) or the neutral "not produced" line. Filename: `<formal base name>_fix-it-list.<ext>`.
- `deliverReport` receives only the formal artifact (unchanged); assert nothing in it reads `companion`.

- [ ] **Step 1:** Tests: kind run with fix-it on → two uploads, companion stored even with `saveToStorage: false`; companion render throws → run failed and `deliverReport` not called; companion upload fails → run failed, no delivery; email attachment/link use the formal file only; delete removes both file ids; companion download 404 for another org's run and for a run without companion; DOCX fix-it contains the internal marking in the footer and every item; frontend shows two download actions and the Draft chip.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; `generate:swagger`, `generate:endpoints`; scratch-render the fix-it PDF and look at it.
- [ ] **Step 5:** Commit `feat(reporting): internal E-23 fix-it list as a companion file`.

### Task 10: `e23Gap` analyzer, prompts, facts, gating

**Files:**
- Modify: `Servers/services/reporting/analyzers/registry.ts`, `schemas.ts`, `runAnalyzers.ts` (`VERBATIM_FIELDS`, `PROSE_FIELD`, enforcement hook), `prompts.ts` (`prepareSectionData` for the four data sections, `ANALYZER_VERSION`), `facts.ts` (SPECS for `mrmFleet`, `e23Contradictions`, `e23FixItList`; `FACTS_SCHEMA_VERSION = 3`), `collectAnalyzerInputs.ts` (`LEGACY_BLOCKS`/`NO_BLOCKS` `e23Gap: false`; `collectPriorFacts(scheduledReportId, organizationId, opts?: { templateId?: number; kind?: string })` falls back to the template for kind `osfi_e23`; `collectAllowedOwners` adds fix-it owners), `mapToSummaries.ts` (`ANALYSIS_LABELS.e23Gap = "E-23 gap analysis"`, `out.e23Gap`), `persistAnalyses.ts` (audit `position_corrections`), `reportTemplateResolver.ts` (`!!ai.e23Gap`), `i.reportGeneration.ts`/`i.reportTemplate.ts` (`aiBlocks.e23Gap`, `AISummaries.e23Gap`), `index.ts` (audience into prompts via `header()`; recommendedActions gets the fix-it list), both renderers (formal: e23Gap block after contradictions; fix-it doc: recommended actions), `Clients/.../ConfigureReportWizard.tsx` + `TemplateBuilder.tsx` `AI_BLOCKS`/`DEFAULT_AI_BLOCKS` (`e23Gap` "E-23 gap analysis", default off; shown only for kind templates in the wizard), `Clients/src/presentation/components/ReportAnalysisPanel/index.tsx` (label + render case), `Clients/src/domain/interfaces/i.reporting.ts`
- Test: `Servers/services/reporting/analyzers/__tests__/e23Gap.test.ts`, facts tests, renderer tests for the e23Gap block

**Interfaces:**
- Schema `e23GapSchema` (`.strict()`, every field `.describe()`, reuse `abstainReason`/`basis`/`whatWouldCloseThis` building blocks): `narrative` string 40–2500; `principles` array ≤ 16 of `{ group: string 1–200; position: enum "consistent"|"partly consistent"|"inconsistent"|"not assessable"; explanation: string 10–600; basis; what_would_close_this }`; `abstain_reason`.
- Prompt: `GROUNDING_RULES` + "Never state or imply OSFI's view, a certification or compliance. Explain the contradictions listed; never add new ones. `position` describes how far the MRM data is consistent with the self-assessed statuses." + audience line (board: lead with consequences; osfi: lead with evidence). User prompt: E-23 groups with rollups and coverage label, fired rules, rules not run, MRM status, facts. Returns "" (abstain) when no E-23 requirements.
- `VERBATIM_FIELDS.e23Gap = { list: "principles", field: "group" }`; `PROSE_FIELD.e23Gap = "narrative"`.
- Enforcement after parsing (new optional `AnalyzerDefinition.enforce?(payload, reportData): { payload; corrections: { group; from; to }[] }`, applied in the sanitize step): a group with coverage `selfAssessmentOnly` → `not assessable`; a group with a fired rule and `consistent` → `partly consistent`. Corrections stored in `audit_metadata.position_corrections`.
- Renderers print `POSITION_LABELS`, never the raw enum; block labelled "AI-Generated Analysis" like complianceGap.
- `ANALYZER_VERSION = "report-analyzer-v4"`, `FACTS_SCHEMA_VERSION = 3`.

- [ ] **Step 1:** Tests: schema rejects an unknown key and a 2501-char narrative; provenance drops a principle whose group is not in the prompt; enforcement corrects both cases and records them; abstains with no E-23 rows; prompt contains the audience line and never the word "compliant" as an instruction to the model; facts aggregates for the three sections and their change lines; `collectPriorFacts` uses the template fallback only for kind `osfi_e23`; `LEGACY_BLOCKS.e23Gap === false`; resolver maps the flag; renderer prints `POSITION_LABELS`; fix-it document carries recommended actions and the formal report does not.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; full `reporting` suite; Clients typecheck.
- [ ] **Step 5:** Commit `feat(reporting): E-23 gap analysis and analyzer inputs`.

### Task 11: Wizard report details step, quarterly UI, template builder

**Files:**
- Modify: `Clients/src/presentation/pages/Reporting/ConfigureReportWizard.tsx`, `ScheduledReportsTab.tsx`, `TemplateBuilder.tsx` (hide catalog entries with `kinds`), `TemplatesTab.tsx` (duplicate, done in Task 3 — verify), `Clients/src/application/repository/reporting.repository.ts` + `Clients/src/application/hooks/useReporting*` (v1 run-now, last-parameters, v1 scheduled create/update)
- Create: `Clients/src/presentation/pages/Reporting/ReportDetailsStep.tsx`, `Clients/src/presentation/pages/Reporting/__tests__/ReportDetailsStep.test.tsx`, wizard test additions

**Interfaces:**
- Consumes: `template.latestVersion.parameters_config`, `GET /api/v1/report-templates/:id/last-parameters`.
- Step "Report details" inserted after "Scope" in both step arrays, only when `parameters_config.fields?.length`. Renders each declared field with `Field`/`Select`/date input/checkbox ("Final version", helper text "Unticked, every page is marked as a draft"). Schedule mode hides the period fields and shows "The reporting period is the {interval} ending the day before each run".
- Prefill order: last-parameters answers; `periodStart` = day after the previous `periodEnd`, else end − 3 months + 1 day; `periodEnd` = today; `institutionName` = organization name; `preparedByName` = signed-in user's full name; `audience` = `osfi`; `isFinal` = false.
- Client validation mirrors the server (required, lengths, date order, end ≤ today) with messages under the field; `canNext` blocks until valid. Server 400 messages shown in the existing error alert.
- Frequency lists add "Quarterly"; quarterly shows "Run in month" select (January…December) writing `anchorMonth`; default = current month + 1.
- Requests: run-now and schedule create/update go to the v1 endpoints with `reportParameters`.

- [ ] **Step 1:** Tests (vitest + RTL): step absent for a template without fields; present with prefill from a mocked last-parameters response; blank institution blocks Next and shows the message; end date in the future rejected; schedule mode hides period fields; quarterly shows the month select and sends `anchorMonth`; TemplateBuilder hides kind-gated sections.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; `npm run typecheck && npm run i18n:audit:strict && npm run format-check`.
- [ ] **Step 5:** Commit `feat(reporting): report details step and quarterly schedules in the wizard`.

### Task 12: System template seed, docs, user guide

**Files:**
- Create: `Servers/database/migrations/20261122130000-seed-osfi-e23-report-template.js`
- Modify: `Servers/database/seeders/systemReportTemplates.js` (+ its test) only if the new migration reads from it; `docs/technical/domains/reporting.md`, `docs/technical/domains/mrm.md`, `shared/user-guide-content/content/reporting/` (new article `osfi-e23-report.ts` + index registration following the folder's pattern), website mirror of the new article file only (diff first; never commit website; never touch website `index.ts` blindly — see memory)

**Interfaces:**
- Seed (idempotent per slug, pattern `20260729221814-...`, but writes `supported_scopes = '["organization"]'`): slug `osfi-e23-completeness`, name "OSFI E-23 completeness report", category `compliance`, default scope organization, recommended frequency `quarterly`, version 1 with `framework_config {"frameworkIds":["native:26"]}`, `format_config {"format":"pdf"}`, sections on `frameworkRequirements`, `mrmFleet`, `e23Contradictions`, `e23FixItList`, `signOff`; off `mrmInventoryAppendix` (present with `defaultEnabled: false`); AI on `executiveSummary`, `keyFindings`, `recommendedActions`, `e23Gap`, others false; `parameters_config {"kind":"osfi_e23","fields": E23_PARAMETER_FIELDS}` (inline the JSON in the migration — migrations must not import TS; a unit test asserts it deep-equals `E23_PARAMETER_FIELDS`). Seeds even when no org has E-23. Down deactivates the slug.

- [ ] **Step 1:** Tests: seed JSON equals `E23_PARAMETER_FIELDS`; every seeded section key exists in the catalog; kind-gated keys only in this template.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement migration + docs + guide (humanize the guide copy; truthful claims only, checked against code). **Step 4:** Run → PASS; run the migration against the scratch DB only (`DB_NAME=verifywise_it_e23report`), twice, to prove idempotency.
- [ ] **Step 5:** Commit `feat(reporting): OSFI E-23 completeness system template and docs`.

---

## After the tasks

Whole-branch review (most capable model), fix wave, full gates, Semgrep, `/code-review`, push, PR to `develop` stacked note ("based on #5469"), summary only.
