# Agent analysis sections, custom templates, and a unified report pipeline

**Date:** 2026-07-17
**Status:** Approved by user, ready for implementation plan

## Problem

The Reporting section already has four tabs, four tables, and a working BullMQ
scheduler. What it does not have is the thing that makes them worth using: the
reports contain no agent-generated analysis that is persisted, versioned, or
auditable, and the templates users can pick from cannot be created by users.

Concretely, five things are wrong or missing today:

1. **AI analysis exists but is throwaway and off-pattern.**
   `Servers/services/reporting/aiSummarizer.ts:388-460` already generates an
   executive summary, `keyFindings`, `recommendations`, `riskHighlights`, and
   per-section prose. But it uses `generateText` + `JSON.parse(jsonMatch[0])`
   (`:298-301`) rather than a zod schema, sniffs the provider from the free-text
   key `name` rather than a typed field (`:43-44`,
   `keyName.includes("anthropic") || keyName.includes("claude")`), has no
   `ANALYZER_VERSION`, performs zero DB writes, and never calls
   `trackAIContent`. The analysis exists only inside the emitted artifact —
   rendered today by **both** `report-pdf.ejs` and `docxGenerator.ts`
   (`:250, 549-583, 624-1095`). It cannot be queried, shown in the UI,
   re-rendered, or audited — and in a governance product the analysis *is* the
   audit evidence.

2. **There is no report entity to attach analysis to.**
   There is no `reports` table. One-off generations are rows in
   `verifywise.files` (`content BYTEA`, tagged via `files.source`); scheduled
   ones are rows in `report_runs` pointing at a `files` row through an
   unconstrained `file_id`. The two paths never meet.

3. **Generation is synchronous and already too slow to be honest about it.**
   `Servers/controllers/reporting.ctrl.ts:generateReportsV2` spawns headless
   Chromium inside the request thread. The frontend covers the latency with a
   **fake** progress bar
   (`Clients/src/presentation/components/Reporting/GenerateReport/DownloadReportFrom/index.tsx`
   — 10s standard / 30s AI, easing to 95% regardless of actual progress).
   Adding analyzer LLM calls to a synchronous request makes this untenable.

4. **Custom templates have no write path at all.**
   `Servers/controllers/reportTemplate.ctrl.ts` is 38 lines: `listTemplates` and
   `getTemplate`. No POST, PATCH, or DELETE; no version-bump helper; no
   `is_system_template` write guard.

5. **Two shipped correctness bugs sit directly under this feature.**
   `Servers/services/reporting/reportDeliveryService.ts:40-55` writes
   `status: "success"` for `sendEmailLink`/`attachFile` — TODO at `:42-44`,
   `status: "success"` at `:46`/`:49`, and zero send calls anywhere in the path.
   The `catch` at `:51-53` is **unreachable**, because the try block is pure
   object assignment, so the existing `status: "failed"` branch is already dead
   code. The lie is consumed as fact at `reportRunOrchestrator.ts:29-31` and
   rendered at `ArchiveTab.tsx:91`.

   Separately, `deliverReport` uploads with `project_id = null`
   (`reportDeliveryService.ts:29`) while `getGeneratedReportsQuery`
   (`Servers/utils/reporting.utils.ts:93-94`) does a bare `JOIN projects`, so
   **every scheduled report is invisible** in the Generate tab. The control case
   proves the mechanism: `reporting.ctrl.ts:313-319` passes a real `projectId`,
   and manual reports do appear.

## Scope

In scope: agent analysis sections (six), the custom-template write path and
builder UI, unification of one-off and scheduled generation onto a single async
pipeline, and the two correctness bugs above.

Out of scope: any inbound API for external agents to POST analysis (explicitly
rejected — see Design §1); the AI Gateway / `sk-mcp-*` Agent Control system,
which governs external coding agents and is unrelated; rewriting the readiness
scoring formula (see §4 caveat); the AI Advisor chat surface.

### Rejected alternatives

- **`report.agent.ts` + the agent registry.** The `*.agent.ts` layer is
  orphaned. `bootstrapAgentNetwork()` (`Servers/index.ts:85`) registers nine
  agents across **two parallel registries** — seven (risk, compliance, vendor,
  policy, incident, model via `createDomainAgent`, plus coordinator) into
  `Servers/advisor/network/agentRegistry.ts` as `RegisteredAgent`, and two
  (evidence, control-assessment) into `Servers/advisor/agents/agentRegistry.ts`
  as `AgentDefinition` (the split is documented in
  `Servers/advisor/network/__tests__/bootstrap.test.ts:6-10`) — but nothing reads
  `AgentDefinition.systemPrompt` or `.tools`, and `getAgentToolFilter` has zero
  callers. All three advisor call sites pass `getAdvisorPrompt()`
  (`Servers/advisor/aiSdkAgent.ts:379, 492, 579`). A report agent defined this
  way would do nothing at runtime.

  Note `Servers/advisor/agents/agentToolMap.ts:4-10` carries a stale in-repo
  comment claiming both registries "expect runtime registration that never
  happens" — that is false since `index.ts:85` calls the bootstrap. It
  corroborates the orphan finding while itself being wrong; do not cite it.
- **Inbound agent API** (external agents POST sections). Requires a public write
  endpoint, agent-key auth, and a trust model for agent-authored content landing
  in a compliance artifact. Rejected in favour of in-process analyzers using the
  tenant's own LLM key.
- **Keeping generation synchronous.** Risks proxy timeouts, holds a Node request
  thread through Chromium plus several LLM calls, and has no retry story.
- **Rebuilding the reporting domain.** The schema (template/version split,
  org-scoped, JSONB config) is sound. Finish it instead.

## Design

### 1. Analysis is produced in-process, by the backend, using the tenant's LLM key

"Agents append analyses via API call" resolves to: during report generation, the
backend calls the tenant's configured LLM provider. The API call is **outbound**.
There is no inbound surface, no agent key, no external write path into audit
artifacts.

This mirrors the shipped evidence-analyzer pattern
(`Servers/advisor/evidenceAnalyzer/`), which is the only proven
structured-LLM-output path in the codebase:

- `schema.ts` — zod, `.strict()`, `.describe()` on every field (the descriptions
  *are* the prompt), nullable `abstain_reason` escape hatch.
- `prompts.ts` — `export const ANALYZER_VERSION = "report-analyzer-v1"` plus
  `buildSystemPrompt()` / `buildUserPrompt()`. The version const is bumped on any
  prompt or schema change.
- `analyzer.service.ts` — **pure**: takes section data + `llmKey`, returns a
  result object, performs zero DB writes, never touches `req`/`res`. Uses
  `createModel()` and `generateObjectWithSelfCorrection`
  (`Servers/advisor/llmSelfCorrect.ts:167-227`, defaults at `:172, :173, :189` —
  `temperature: 0, innerMaxRetries: 2, maxSelfCorrectionAttempts: 2`).

  `createModel()` must be **widened to a real exhaustive switch** on the provider
  union (`Servers/advisor/evidenceAnalyzer/analyzer.service.ts:37`). Today it is
  a single `if (key.provider === "Anthropic")` guard (`:130`) with an
  unconditional `createOpenAI` fallthrough (`:137-141`) — OpenAI, OpenRouter, and
  Custom all collapse into one branch. That collapse is precisely why the
  `openai.chat(modelId)` bug below exists.
- Auth is `getLLMKeysWithKeyQuery(organizationId)`
  (`Servers/utils/llmKey.utils.ts:26-33`). Zero keys is a hard `400`, never a
  fabricated result.
- `trackAIContent(...).catch(() => {})` on every AI write. Call it only for
  genuine LLM output: the readiness batch path already tags its **non-LLM
  arithmetic** as AI-generated content (`readiness.ctrl.ts:149-161`,
  `{badgeType: "generated", modelUsed: "readiness-calculator-v1", modelProvider:
  "verifywise"}`). Do not copy that.

`aiSummarizer.ts` is **ported to this pattern and then deleted**, not left
running alongside. One AI system in reporting, not two. Note one thing worth
carrying over from `aiSummarizer` that the evidence analyzer's `createModel`
gets wrong: use `openai.chat(modelId)` when a custom `baseURL` is set, or
OpenRouter/vLLM keys break.

### 2. One pipeline: both generation paths converge on `report_runs`

```
POST /reporting/v2/generate-report      POST /reporting/scheduled-reports/:id/run      tick */15
            |                                        |                                     |
            +------------- creates report_runs row --+-------------------------------------+
                                    |
                          enqueue BullMQ job (worker process)
                                    |
              1. reportTemplateResolver -> sections_config + ai_blocks_config
              2. dataCollector.collectAllData()
              3. runAnalyzers (Promise.all, only template-enabled blocks)
              4. upsert report_run_analyses (one row per section_key)
              5. render pdfGenerator | docxGenerator (reads analyses)
              6. uploadFile -> files
              7. update report_runs (file_id, status)
              8. reportDeliveryService -> real MJML send
                                    |
                     GET /reporting/runs/:id  <- UI polls
```

`POST /reporting/v2/generate-report` stops returning a binary blob. It creates a
`report_runs` row with `trigger_type = 'manual'`, enqueues the job, and returns
the run id. The client polls run status and downloads from
`/api/reporting/runs/:id/download`.

Three things fall out of this for free:

- The fake progress bar becomes a real one, driven by run status.
- The `INNER JOIN projects` invisibility bug (Problem §5) dies, because every
  artifact is a run and the Generate tab reads runs.
- Scheduled reports and manual reports have one code path to test, not two.

The legacy `scheduled_report` automation trigger
(`Servers/services/automations/automationWorker.ts:250-492` —
`generateAndUploadReport` 250-300, `sendReportNotification` 302-426,
`sendReportNotificationEmail` 428-492), which generates and emails directly while
bypassing `scheduled_reports`/`report_runs` entirely (verified: zero references
to either table across all 822 lines), is retired as part of this work. Two live
scheduling paths is one too many, and it is the path that does not record runs.

Note this path **does** send real email — it is the working reference for §7.

### 3. Six analyzers, template-gated, run in parallel

`ai_blocks_config` is an unconstrained `JSONB NOT NULL DEFAULT '{}'` column
(`20260619190359-create-reporting-domain.js:32, 54`); its three-boolean shape
(`{executiveSummary, keyFindings, recommendedActions}`) is imposed only by the
`AiBlocksConfig` interface (`Servers/domain.layer/interfaces/i.reportTemplate.ts:14-18`)
and the seed (`20260619191640-seed-reporting-system-templates.js:23`).
`Servers/services/reporting/reportTemplateResolver.ts` then ORs those three into a
single `aiEnhanced` flag — so they cannot be toggled independently.

This cuts in our favour: **widening to six needs no column migration** — only the
interface, the seed, and the resolver. The resolver stops OR-ing:

| Block | Source | Note |
|---|---|---|
| `executiveSummary` | port from `aiSummarizer` | |
| `keyFindings` | port from `aiSummarizer` | |
| `recommendedActions` | port from `aiSummarizer` | |
| `riskAnalysis` | `dataCollector` risk sections | collector input already exists |
| `complianceGap` | `control_readiness_scores` + `/api/evidence-ai/gaps` | consumes, does not recompute — see §4 |
| `vendorRisk` | `dataCollector` vendor sections | collector input already exists |

Analyzers run under `Promise.all` — they are independent, and six sequential LLM
calls would put a report at 1-3 minutes. A report only runs the analyzers its
template declares, so no one pays 6x LLM cost for a report that needs one
section.

Every analyzer abstains rather than fabricates. An empty risk register must
produce an `abstain_reason` of "insufficient data", never invented findings.
This is not a quality preference; a fabricated finding in a compliance artifact
is a defect of the most expensive kind.

### 4. Compliance gap consumes readiness scores; it does not recompute them

Three systems already claim this ground:

- `control_readiness_scores` stores per-control `overall_score`,
  `readiness_level`, and `recommendations` — computed by **pure arithmetic, zero
  LLM** (`Servers/controllers/readiness.ctrl.ts:40-66`;
  `Math.round(((statusStep + evidenceStep) / 2) * 100)` where
  `statusStep ∈ {0, 0.5, 1}` (`:42`) and `evidenceStep ∈ {0, 1}` (`:43`), so the
  score is always one of 0/25/50/75/100; threshold-based
  `classifyReadinessLevel()`; hardcoded template recommendation strings).
- `GET /api/evidence-ai/gaps` (`Servers/utils/evidenceAi.utils.ts:156`,
  `Servers/controllers/evidenceAi.ctrl.ts:398`) already performs per-control
  `no_evidence` / `low_quality` / `adequate` classification and is *already
  named* gap analysis.
- `Servers/services/reporting/dataCollector.ts:582-616` `collectCompliance()`
  computes its own `overallProgress` from raw `status === "Done"` — a third,
  status-only duplicate. It reads `control_readiness_scores` zero times. A
  **fourth** duplicate exists at `dataCollector.ts:351-408`
  (`collectComplianceProgress()`).

The `complianceGap` analyzer therefore reads from `getControlScoresQuery` /
`getWeakestControlsQuery` / `getFrameworkScoreByTypeQuery`
(`Servers/utils/readiness.utils.ts:185-299`) and writes the narrative *over*
those stored scores. The LLM explains and prioritises; it does not re-score.
"Which controls are weak" keeps exactly one source of truth.

Implementation constraints, each of which will silently produce a wrong report if
missed:

- **The analyzer MUST pass a non-null `projectId`.** All three query functions
  default to `AND project_id IS NULL` when `projectId` is null
  (`readiness.utils.ts:194, 231, 269`) — but **no stored row can ever have a null
  `project_id`**, because `readiness.ctrl.ts:83-88` writes nothing when
  `projectId == null`. A project-less call therefore returns `[]`/`null`
  unconditionally, which renders as "no scores" — *exactly* the "absence of
  scores read as absence of gaps" failure this section forbids. This is not
  hypothetical: `frameworkGap.workflow.ts:99-101` already ships a
  `WHERE ... project_id IS NULL` query that can never return a row.
- **Signatures differ; do not assume a shared arg order.**
  `getWeakestControlsQuery` takes
  `(organizationId, limit, projectId?, userId?, visibility?, frameworkType?)` —
  a different order from the other two. `getFrameworkScoreByTypeQuery` reads
  `framework_readiness_scores`, not `control_readiness_scores` (`:197`).
- **Consume readiness and `/evidence-ai/gaps` as two independent inputs — do not
  join them.** Three blockers: (a) gaps covers only `eu_ai_act` and `iso_42001`
  (`evidenceAi.utils.ts:161`), and `?framework_type=iso_27001` silently returns
  **EU rows mislabeled** with the requested type (`:170-172`); (b) gaps is not
  project-scoped (org + framework only); (c) different key space — gaps emit
  struct ids (`cs.id`), readiness stores per-item ids discriminated by
  `item_type` (`readiness.ctrl.ts:104`).

Two caveats, both handled by degrading rather than lying:

- Readiness rows only exist after someone triggers `POST /readiness/calculate` or
  `POST /readiness/calculate/:frameworkType` (`readiness.route.ts:20`); nothing
  refreshes them at report time. When scores are missing or stale the section says
  so explicitly. It must never render an absence of scores as an absence of gaps.
  Note that `POST /readiness/calculate` **with an empty body is a silent no-op** —
  it writes zero rows for all four frameworks and returns HTTP 200 with `[]`
  (`readiness.ctrl.ts:83-88, 191-195`), which looks like success.
- A pre-existing inconsistency means stored rows always carry
  `evidence_quality_score = 0`, `evidence_recency_score = 0`, **and**
  `risk_mitigation_score = 0` (`readiness.ctrl.ts:109, 111, 113`) — only
  `evidence_count_score` and `task_completion_score` carry real values. The richer
  weighted formula in `Servers/advisor/scoring/readinessCalculator.ts`
  (`calculateReadinessScore`, evidence quality 30%, count 20%, recency 15%, task
  completion 20%, risk mitigation 15%) is **dead code — zero callers repo-wide**,
  wired into neither the batch path nor the AI Advisor. The advisor chat tools
  (`readinessFunctions.ts:3`) import only the `normalizeEvidenceCount` /
  `normalizeRecency` helpers and never apply the weights; the batch path imports
  `aggregateFrameworkScores` / `classifyReadinessLevel` from that file
  (`readiness.ctrl.ts:4-7`) but not the weighted formula. **Out of scope to fix
  here** — but the analyzer must not present those zeroed dimensions as
  meaningful signal.

  The harm is already visible in the product, which raises the stakes on that
  last sentence: three shipped recommendation generators branch on the
  permanently-zero columns and therefore fire unconditionally for every control —
  `readiness.ctrl.ts:396-399` and `readinessFunctions.ts:227-238` ("Improve
  evidence quality" / "Update outdated evidence" / "Address unmitigated risks"),
  and `getWeakestDimension()` (`readinessFunctions.ts:267-285`) always returns
  `evidence_quality`. The analyzer must not launder those into narrative prose.

### 5. Analysis persistence: a sidecar table

New table `report_run_analyses`, unique on
`(report_run_id, section_key, organization_id)`, following the column set both
existing sidecars use (`evidence_ai_analysis`, `control_readiness_scores`):

```
id SERIAL PK
report_run_id INTEGER NOT NULL REFERENCES report_runs(id) ON DELETE CASCADE
section_key VARCHAR NOT NULL
organization_id INTEGER NOT NULL
payload JSONB NOT NULL
analysis_model VARCHAR(100)
analysis_version INTEGER DEFAULT 1
analyzed_at TIMESTAMPTZ DEFAULT NOW()
analyzed_by INTEGER
audit_metadata JSONB
```

Sidecar rather than a JSONB column on `report_runs`: this preserves per-section
versioning, per-section `analyzed_by`, and queryability, and it matches the
convention the codebase already applies twice. Persisting rather than passing
straight to the renderer: the analysis must be auditable, surfaceable in the UI
without opening a PDF, and re-renderable without re-paying for six LLM calls.

Upsert bumps version in place
(`analysis_version = analysis_version + 1, analyzed_at = NOW()`) via
`ON CONFLICT ... DO UPDATE`, following `Servers/utils/readiness.utils.ts:31-120`
— explicitly **not** the check-then-write in
`Servers/utils/evidenceAi.utils.ts:12-107`, which races.

The controller/orchestrator owns persistence; the analyzer services stay pure.
`organization_id` appears in every WHERE clause.

### 6. Custom templates

Write path is net-new. `POST` / `PATCH` / `DELETE` on
`Servers/controllers/reportTemplate.ctrl.ts`, `authorize(["Admin", "Editor"])` —
matching the existing `scheduled_reports` write RBAC rather than the stricter
`Admin`-only generate route. Custom templates are org-shared. System templates
(`organization_id IS NULL`) are read-only for everyone; the write guard on
`is_system_template` enforces that. Versions stay append-only via the unique
`(template_id, version)` constraint.

Two existing holes must close in the same change, because this feature is
precisely what makes them exploitable:

- Template versions are not org-scoped
  (`Servers/utils/reportTemplate.utils.ts:24-39`). Harmless only while every
  template is a system template.
- `createScheduledReportQuery` accepts `templateVersionId` from the request body
  **without validating** that it belongs to `templateId` or to the caller's org.

Both get tests, not comments.

**Section taxonomy gets one owner.** Today `REPORT_SECTION_GROUPS`
(`Clients/src/presentation/components/Reporting/GenerateReport/constants.ts:22-53`)
hardcodes the section catalog in the frontend, duplicating `VALID_SECTION_KEYS`
(`Servers/services/reporting/index.ts:21-35`). The two currently **agree** on all
12 keys — the only set difference is the `all` wildcard sentinel (`index.ts:34`),
which is not a section — but nothing enforces that agreement, and a
frontend-hardcoded list cannot describe org-authored templates. The backend
becomes the source of truth via a new `GET /api/reporting/sections` catalog
endpoint derived from `VALID_SECTION_KEYS` (excluding `all`); the frontend
consumes it.

For the avoidance of a wrong fix: seeded `sections_config.sections[].key` (e.g.
`current_high_risks`) is a **different field** that maps many-to-one onto
`reportSectionKey` (`i.reportTemplate.ts:7`, de-duped at
`reportTemplateResolver.ts:8`). That is a hierarchy, not a conflict. The seed's 8
distinct `reportSectionKey` values are a strict subset of the 12 — the 4 unused
(`modelRisks`, `nistSubcategories`, `trainingRegistry`, `vendorRisks`) are simply
sections no shipped template selects, which is what a template is for.

### 7. Delivery becomes truthful

`reportDeliveryService.ts` wires `sendEmailLink` / `attachFile` to the existing
MJML email service (`Servers/templates/*.mjml`), linking to
`/api/reporting/runs/:id/download`. Recipients are validated — they are
unvalidated free text today. A failed send records `status: "failed"` with the
real error. This directly replaces a code path that currently records success
for work it never did.

Adjacent fixes in the same change, all cheap and all load-bearing:

- Add the missing `report_runs.file_id` FK to `files` (today a file delete
  leaves an archive row whose download 404s).
- Add the `scheduled_reports.llm_key_id` column that
  `Servers/services/reporting/reportRunOrchestrator.ts:22` already reads —
  it is always `undefined` today, silently falling back to `keys[0]`.
- Add polling/`refetchInterval` to `useReportRuns`; running and pending runs
  currently stay stale forever.
- Paginate `listRunsQuery` (hard `LIMIT 200` today).
- Gate the wizard's AI blocks on `useLLMKeyStatus().hasKeys` — a keyless user can
  schedule an AI report today. Consume `hasKeys` directly rather than
  hand-deriving it: `5f8401b16` / `38bbc06da` / `74677b0aa` fixed the resulting
  flicker, `482286a0a` baked the fix into the hook
  (`Clients/src/application/hooks/useLLMKeyStatus.ts:38`), and `517b65635` /
  `877816c93` migrated call sites onto it.
- Unhardcode `format: "pdf"` in
  `Clients/src/presentation/pages/Reporting/ConfigureReportWizard.tsx:103` — the
  file's only `format` occurrence, with no state, prop, or picker behind it. The
  one-off flow already supports docx.
- Add an **update** endpoint for `scheduled_reports` — there is no PUT/PATCH
  (`Servers/routes/scheduledReport.route.ts`) and no `updateScheduledReport`
  anywhere in `Servers/` or `Clients/`, so a schedule cannot be edited. The
  soft-delete endpoint **already exists and must not be rebuilt**
  (`scheduledReport.route.ts:20` → `deleteScheduledReport`,
  `scheduledReport.ctrl.ts:80-87` → `softDeleteQuery`,
  `scheduledReport.utils.ts:44-48`, org-scoped
  `UPDATE ... SET deleted_at = NOW(), is_active = false`) — but it has **no
  frontend caller**. `Clients/src/application/repository/reporting.repository.ts`
  exposes only getTemplates/getTemplate/getScheduledReports/createScheduledReport/
  runScheduledReportNow/setScheduledReportActive/getRuns/downloadReportRun, and
  `ScheduledReportsTab.tsx:20,27` imports only `useSetActive`. So today a
  scheduled report can be created and paused but never edited or removed from the
  UI. Wire the existing DELETE into the repository; add only the UPDATE.
- Note `deliverReport` only uploads at all when `delivery.saveToStorage` is true
  (`reportDeliveryService.ts:16`). With it false, nothing is stored. Doesn't
  change the invisibility conclusion, but the fix must account for it.

### 8. Error handling

- Zero LLM keys → hard `400`, never a fabricated result.
- One analyzer fails → that section abstains with a reason; **the report still
  generates**. Six analyzers must not become six ways to lose a report.
- Insufficient input data → `abstain_reason`, never invented findings.
- Render fails → `report_runs.status = 'failed'` plus the error.
- Delivery fails → `status: 'failed'` plus the real error.
- Tick overlap → per-org Redis lock, `SET key ts PX <ttl> NX`, TTL strictly less
  than the tick interval, released in `finally`. Copy
  `Servers/services/aiDetection/scheduledScanProcessor.ts:36-52`.
- Never call `queue.obliterate({ force: true })` in the new scheduler — three
  legacy schedulers do, and they wipe every job added before them (see the
  ordering comment at `Servers/jobs/producer.ts:46-49`). Repeatable `add` is
  already idempotent by repeat key.
- Pass `tz` explicitly on the repeatable. 24 of 25 existing repeatables omit it
  and fire in the worker's local time.

### 9. Frontend

`Clients/src/domain/interfaces/i.reporting.ts` is new and types the templates/runs
stack, which is untyped today: every payload-returning function in
`reporting.repository.ts` returns `any`/`any[]` except `downloadReportRun`
(`:44`, typed `Promise<Blob>`), and `useReporting.ts` inherits `any` by inference
(it contains no literal `any` tokens). `i.reports.ts` holds only
`GeneratedReports` (`:3-13`) and `UseGeneratedReportsParams` (`:15-19`) — nothing
from the templates/runs stack. New interfaces: `ReportTemplate`,
`ReportTemplateVersion`, `ScheduledReport`, `ReportRun`, `ReportRunAnalysis`,
`SectionsConfig`, `AiBlocksConfig`, `ScheduleConfig`, `DeliveryConfig`.

Types are copied from the analyzer's own output types, not hand-written at the
panel. `EvidenceAnalysisPanel` is the cautionary case, and the drift there is
worse than a typing nit — it is a **live rendering bug**: `rationales` and
`document_signals` (`index.tsx:52-83`) have **zero producers** anywhere in
`Servers/`, so `:293` is permanently `{}` (every DimensionCard renders
`rationale={null}` at `:405`) and `:294` is permanently undefined, making the
~85-line chip block gated at `:480` **unreachable dead UI**. Hand-written panel
types let that ship unnoticed.

New: `ReportAnalysisPanel/` (presentational,
`{analysis, isLoading, isAnalyzing, hasLLMKey, onTrigger}`, caller owns the
hooks — the shape `EvidenceAnalysisPanel` uses), `TemplateBuilder/`, and a
`useReportRunStatus` polling hook.

Modified: the GenerateReport modal (async + real progress), `TemplatesTab`
(CRUD), `ArchiveTab` (polling + pagination), `ConfigureReportWizard` (AI gating,
format).

`TemplateBuilder` mirrors the existing `ConfigureReportWizard` Stepper rather
than inventing a second shape for the same job.

All UI follows `VerifyWise-Design-Rules.pdf`: Geist; sentence case; `theme.palette.*`
tokens only, no hardcoded hex; `theme.spacing()` (2px base); 4px border radius;
lucide-react icons only at 12/14/16/18/20/24; 13px body, 16px card title, 24px
page title; border-only cards with `boxShadow: "none"`; `CustomizableButton`
(h34); `StandardModal` + `useStandardModal`; `TabBar` inside `TabContext`;
`EmptyState`; skeleton loaders over spinners where the shape is known; status
colors exclusively from `statusColors.ts`.

### 10. Testing

TDD per the mandatory chain: a failing test precedes implementation code.

- Analyzers are pure → unit-testable with a mocked `llmKey`, no DB, no HTTP.
- Zod schema validation tests, including the abstain path.
- Upsert version-bump tests (assert `analysis_version` increments in place).
- Template-write RBAC tests: Admin/Editor allowed; Reviewer/Auditor denied;
  system templates rejected on write.
- Org-scope isolation tests for template versions and for `templateVersionId`
  cross-org rejection.
- Partial-failure test: one analyzer throws, report still generates with that
  section abstained.
- Delivery failure records `failed`, not `success`.

Backend Jest, frontend Vitest, 80% minimum coverage per the root `CLAUDE.md`.

## Sequencing

One issue, phased checklist. The phases are ordered by dependency, not by size:

1. **Pipeline** — migrations (`report_run_analyses`, `file_id` FK,
   `llm_key_id`, `trigger_type`), async generate, BullMQ job, run polling,
   retire the legacy automation path. Everything else depends on a run id
   existing.
2. **Analyzers** — port `aiSummarizer` to the six-analyzer pattern, persist,
   render in both PDF and DOCX, delete `aiSummarizer`.
3. **Templates** — section catalog endpoint, template CRUD + RBAC + org-scope
   fixes, `TemplateBuilder` UI.
4. **Truthfulness** — MJML delivery, recipient validation, archive polling,
   pagination, wizard gating.

## Risks

- **The async cutover is the risky part.** It changes the contract of an
  existing endpoint and rewrites the Generate modal. Phase 1 must land green
  before anything else starts.
- **Rendering must be done in both `report-pdf.ejs` and `docxGenerator.ts`.**
  Miss the DOCX side and analysis silently vanishes from docx exports.
  (`report-docx.ejs` is dead code — `docxGenerator.ts` builds programmatically.)
- **Six analyzers is real LLM spend per report.** Template gating is the control;
  system template defaults should not enable all six.
- **Worker process required.** `Servers/index.ts` only calls `addAllJobs()`; it
  never constructs a Worker. Without `npm run worker` running, generation jobs
  queue and never execute — which after this change means reports never
  generate at all, where today manual ones still work. This must be called out
  in the PR and in the docs.

## Documentation

`docs/technical/domains/reporting.md` must be updated and its **Last Updated**
bumped (mandated by the root `CLAUDE.md`). Route changes require
`npm run generate:swagger && npm run generate:endpoints`, or CI's
`api-docs-drift` job fails. Add the new recurring job to the schedule table in
`docs/technical/infrastructure/automations.md` (~L103).

Two docs are already wrong about `report-docx.ejs` and must be corrected in the
same pass, since this work touches DOCX rendering:
`docs/technical/domains/reporting.md:185` and
`docs/technical/infrastructure/pdf-generation.md:195` both still describe it as a
live DOCX template. It is dead — `docxGenerator.ts` builds programmatically.
