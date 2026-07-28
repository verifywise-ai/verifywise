# Reporting Domain

> **Last Updated:** 2026-07-29

## Overview

The Reporting domain in VerifyWise provides comprehensive report generation capabilities for compliance documentation, risk analysis, and organizational oversight. It supports multiple output formats (PDF, DOCX), framework-specific sections, custom branding, and integration with all major domains.

## Key Features

- Multi-format report generation (PDF, DOCX)
- Framework-specific section selection
- Custom branding (logo, colors)
- Organization and project-scoped reports
- Real-time data collection from all domains
- SVG chart generation
- Role-based access control

## Report Types

| Type | Description |
|------|-------------|
| `risk-report` | Project risks report |
| `vendor-report` | Vendors and risks report |
| `assessment-tracker-report` | EU AI Act assessment tracker |
| `compliance-tracker-report` | Compliance controls report |
| `clauses-annexes-report` | ISO clauses and annexes |
| `clause-report` | Clauses only |
| `annexes-report` | Annexes only |
| `report` | All reports combined |
| `multi-report` | Multiple sections |

## Report Sections

### Section Groups

Reports are organized into three groups:

**Risk Analysis:**
- Use Case Risks
- Vendor Risks
- Model Risks

**Compliance & Governance:**
- Compliance Controls (EU AI Act)
- Assessment Tracker (EU AI Act)
- Clauses & Annexes (ISO 42001, ISO 27001)
- NIST Subcategories (NIST AI RMF)

**Organization:**
- AI Models
- Vendors
- Training Registry
- Policy Manager
- Incident Management

### Framework Section Mapping

| Framework | Available Sections |
|-----------|-------------------|
| EU AI Act | Compliance, Assessment, Project Risks, Organization |
| ISO 42001 | Clauses & Annexes, Project Risks, Organization |
| ISO 27001 | Clauses & Annexes, Project Risks, Organization |
| NIST AI RMF | NIST Subcategories, Project Risks, Organization |

## API Endpoints

Manual generation is **asynchronous**: `POST` queues the job and returns a `runId` immediately; the caller polls the run and downloads the file once it's done. `/reporting/generate-report` (POST) is a legacy alias that delegates straight to the v2 controller and returns the same `202 { runId }` shape — neither endpoint generates the file synchronously anymore.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/reporting/v2/generate-report` | Queue report generation. Returns `202 { runId }` |
| POST | `/reporting/generate-report` | Legacy alias for the above (same async behavior) |
| GET | `/reporting/generate-report` | List generated reports. **Not read by the Reporting page** — see [the note below](#the-legacy-files-based-list-is-dead-code-for-the-ui) |
| GET | `/reporting/runs/:id` | Poll a run's status (see [Template-First Reporting Layer](#template-first-reporting-layer)) |
| GET | `/reporting/runs/:id/download` | Download the finished file once the run reaches a terminal status |
| DELETE | `/reporting/:id` | Delete report |

### Generate Report Request

```typescript
POST /reporting/v2/generate-report
{
  projectId: 1,
  frameworkId: 1,
  projectFrameworkId: 5,
  reportType: ["projectRisks", "compliance"],
  format: "pdf",
  reportName: "Q1 2025 Compliance Report",
  branding: {
    organizationName: "Acme Corp",
    organizationLogo: "data:image/png;base64,...",
    primaryColor: "#13715B",
    secondaryColor: "#1C2130"
  }
}
```

### Response

`202 Accepted`:

```json
{ "runId": 123 }
```

Poll `GET /reporting/runs/:id` until `status` is terminal — `success` or `failed` for a manual run (`partial_success` is only produced by scheduled runs with multiple delivery targets) — then fetch the file from `GET /reporting/runs/:id/download`. The download response carries a binary attachment with the appropriate Content-Type header:
- `application/pdf` for PDF
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` for DOCX

A **BullMQ worker process must be running** (`npm run worker`) for the job to ever execute — without it the run stays `status: "running"` forever. See [Automations & Job Scheduling](../infrastructure/automations.md) for queue/worker setup.

## Architecture

### Service Components

```
/services/reporting/
├── index.ts          - Main entry point
├── dataCollector.ts  - Data aggregation
├── pdfGenerator.ts   - PDF rendering
├── docxGenerator.ts  - DOCX generation
└── chartUtils.ts     - SVG chart generation
```

### Data Flow

```
User Request
    ↓
Controller (generateReportsV2 / generateReports)
    ├── Create `report_runs` row (status: "running")
    └── Enqueue `generate_report_manual` job on the automation-actions queue
    ↓
202 { runId }               (client polls GET /reporting/runs/:id)
    ↓
BullMQ Worker → handleManualReportGeneration → executeManualRun
    ↓
Service (generateReport)
    ├── DataCollector.collectAllData()
    ├── ChartUtils (generate SVG charts)
    ├── EJS Template Rendering
    └── pdfGenerator or docxGenerator
    ↓
File Storage (upload) + report_runs updated to a terminal status
    ↓
Client downloads via GET /reporting/runs/:id/download
```

Manual and scheduled reports now share this same `report_runs` execution pipeline — see [Template-First Reporting Layer](#template-first-reporting-layer) below.

## Data Collection

### ReportDataCollector Class

```typescript
class ReportDataCollector {
  // Metadata
  collectMetadata(): ReportMetadata
  collectBranding(): ReportBranding
  collectChartData(): ChartData

  // Domain Data
  collectProjectRisks(): ProjectRisksSectionData
  collectVendorsList(): VendorsListSectionData
  collectVendorRisks(): VendorRisksSectionData
  collectCompliance(): ComplianceSectionData
  collectAssessment(): AssessmentSectionData
  collectClausesAndAnnexes(): ClausesAndAnnexesSectionData
  collectModelsList(): ModelsListSectionData
  collectModelRisks(): ModelRisksSectionData
  collectTrainingRegistry(): TrainingRegistrySectionData
  collectPolicyManager(): PolicyManagerSectionData
  collectNistSubcategories(): NistSubcategoriesSectionData
  collectIncidentManagement(): IncidentManagementSectionData
}
```

### Data Sources

Table and column names below are the real ones. A projection that names a
column the table does not have is not a cosmetic error here: the collector's
output becomes the facts substrate, and an aggregate over a field that does not
exist turns into a confident sentence about the tenant's estate. Two shipped
examples, both fixed — `model_inventories` was joined on a non-existent `owner`
and printed as ownership, and `trainingregistar` had `assignee` selected as a
literal `NULL` and counted as "unowned".

| Section            | Tables                                 | Key Fields                                                                                                                    |
| ------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| projectRisks       | risks, projects_risks                  | risk_name, risk_level_autocalculated, **mitigation_status** (not `approval_status` — the two are orthogonal axes), risk_owner |
| vendorRisks        | vendorrisks, vendors                   | risk_level, action_plan, action_owner                                                                                         |
| modelRisks         | model_risks, model_inventories         | risk_name, risk_level, **status** (there is no `mitigation_status` column), mitigation_plan, target_date                      |
| compliance         | controls_eu, controlcategories_eu      | status, title, owner, due_date, categoryName                                                                                  |
| assessment         | assessments, topics, questions         | answer, progress                                                                                                              |
| clausesAndAnnexes  | subclauses_iso, annexcategories_iso    | status (the `*_struct` parent tables carry none)                                                                              |
| nistSubcategories  | nist_ai_rmf_subcategories + `*_struct` | function, category, status                                                                                                    |
| vendors            | vendors, vendors_projects              | vendor_name, review_status, assignee                                                                                          |
| models             | model_inventories                      | **model** (not `name`), version, status, **approver** (there is no `owner` column)                                            |
| trainingRegistry   | trainingregistar                       | training_name, status (no assignee, no completion date)                                                                       |
| policyManager      | policy_manager                         | title, status, next_review_date, policy_owner_id (no version)                                                                 |
| incidentManagement | ai_incident_managements                | type, severity, status, **reporter** (there is no `assignee` and no `title`)                                                  |

## AI Analysis

Report AI output is produced by schema-validated analyzers in `services/reporting/analyzers/`. Each analyzer returns a zod-validated object (`schemas.ts`), never free text, so the renderers can lay it out as a formal compliance artifact instead of a prose blob.

Every row-level claim carries a `basis` label — `observed` (stated directly by the supplied data), `inferred` (follows from it by reasoning the data does not state) or `absent` (the claim is that something required is missing). Findings and gaps additionally carry `what_would_close_this`, the counterfactual that says what would have to be true for the item to stop being a finding. Both fields are **nullable**: a model that omits one must not turn a produced analysis into a lost one. Nothing defaults `basis` — an unstated basis renders no label, because a defaulted `observed` is a fabricated provenance claim. The label describes the *claim*; it does not relax `sanitizeProvenance`, which still drops any `gaps[].control`, `concerns[].vendor` or `top_risks[].name` that is not a verbatim substring of that analyzer's own prompt.

### Facts substrate

`analyzers/facts.ts` computes a compact block from `ReportData` — **no LLM, no
database** — and every analyzer receives it. It exists because the three summary
consumers previously saw only Stage-1 prose: with no number, identifier, date or
owner left in their input, the only operation available to them was re-wording,
and a measured 86.8% of one shipped executive summary's characters came straight
from the section summary it was given.

`collectFacts` returns a storable `FactsSnapshot`; `renderFacts` turns it (plus
an optional prior) into the prompt text. It carries:

- the **reference date**, from `metadata.generatedAt` — the field that makes
  "overdue", "imminent" and "stale" expressible at all,
- per-section totals and the `charts` rollups the collector already computes,
- value buckets per section (`status_Approved=7`), capped at the eight heaviest,
- a materiality-ranked top-N per section, ranked *before* truncation,
- explicit truncation markers on every one of those cuts.

Two naming rules hold the whole thing honest. Every aggregate name is derived
from the field it counts (`approver_missing`, not a hardcoded `ownerless`), and
every truncation is marked — a top-N label cut without a trailing `…` stays a
verbatim substring of the prompt, so `sanitizeProvenance` would pass a mangled
identifier exactly as it passes a complete one.

`isoDate` is imported from `dataCollector` rather than reimplemented: it builds
from local components, and a second normalisation via `toISOString()` would put
the reference date and the due dates it is compared against a day apart west of
Greenwich.

### Analyzers

Every analyzer receives the facts block. Because it is whole-estate, a single
prompt now holds all sections at once, which is what makes a cross-section
finding expressible — `keyFindings` carries `related_sections` for exactly that.

| Section key          | Output                                                 | Input                                                        |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| `executiveSummary`   | Multi-paragraph posture summary                        | Facts + section summaries                                    |
| `keyFindings`        | 5–8 findings, each attributed to a section key         | Facts + section summaries                                    |
| `recommendedActions` | 3–5 prioritised actions                                | Facts + section summaries                                    |
| `riskAnalysis`       | Risk narrative + up to 6 named risks                   | Facts + `projectRisks`, `vendorRisks`, `modelRisks`          |
| `complianceGap`      | Explanation of STORED readiness scores + evidence gaps | Facts + readiness scores, evidence gaps, compliance sections |
| `vendorRisk`         | Third-party risk narrative + named vendor concerns     | Facts + `vendors`, `vendorRisks`                             |

`sectionSummaries` (ported from the removed `aiSummarizer.ts`) is a seventh gateable block, but it is **not** a registry entry in `ANALYZERS`: its output is `Record<string, string>` prose rather than a schema-validated object, so it does not fit `AnalyzerDefinition`. It runs as a separate stage whose output the first three analyzers consume — feeding them raw section JSON instead measured ~38k tokens per prompt against ~6k, three times per report.

Two stages, ordering is load-bearing: Stage 1 runs `sectionSummaries` plus the raw-section analyzers (`riskAnalysis`, `complianceGap`, `vendorRisk`); Stage 2 runs the three summary consumers. Summaries are produced whenever a Stage 2 consumer is enabled, regardless of the `sectionSummaries` block flag — that flag governs whether summaries are *recorded and rendered* as their own blocks.

`complianceGap` receives readiness scores and evidence gaps as two independent inputs that are never joined: they disagree on framework coverage, project scoping and key space, so a join silently mislabels rows.

### Gating

`ai_blocks_config` on the template/schedule row selects which blocks run (`AiBlocksConfig` in `domain.layer/interfaces/i.reportTemplate.ts`, resolved by `reportTemplateResolver.ts`). Manual runs carry no template, so `resolveBlocks` (`analyzers/collectAnalyzerInputs.ts`) maps `aiEnhanced: true` to five blocks — `sectionSummaries`, `executiveSummary`, `keyFindings`, `recommendedActions`, `riskAnalysis` — reproducing the previous `aiSummarizer` output. `complianceGap` and `vendorRisk` stay off for manual runs to avoid unbudgeted spend. `ConfigureReportWizard` now offers all seven blocks, with `complianceGap` and `vendorRisk` defaulting **off** for the same reason — each enabled block is one LLM call per run.

### Shallowness gate

`analyzers/novelty.ts` measures whether an analyzer restated its input instead of
analysing it: character-trigram Jaccard of the output's prose against the prompt,
above `NOVELTY_THRESHOLD` (0.5). On a hit the call is re-issued **once** with a
directive naming the failure. This is the only mechanical definition of "deeper"
in the feature, so it doubles as the regression test for the prompt work.

Two properties are load-bearing:

- **Strictly non-destructive.** Every exit from the re-issue — the retry restates
  again, abstains, or throws — keeps the _first_ payload. A produced analysis is
  never lost to the gate. The retry is accepted only when it is both non-restating
  and non-abstaining.
- **Skipped on an abstention.** A first payload that already abstained is left
  alone; re-issuing would turn a cheap honest abstention into a paid one.

Scoring is per _labelled entry_, not per blank line. A section summary is itself
multi-paragraph prose, so splitting on blank lines measures a whole-summary copy
against a quarter of itself — a 100% verbatim copy of a real 2,039-character
summary scored 0.460 at four paragraphs and evaded the detector entirely. Both
candidate sets are scored and the higher wins, which can only raise sensitivity.

`restatementRetried` rides on the result and is persisted, so the gate's firing
is observable after the run rather than only in the log.

### Prior-run comparison

A scheduled run diffs itself against the previous run **of the same schedule**.
`getPriorFactsSnapshotQuery` (`utils/reportRunAnalysis.utils.ts`) reads the last
stored `FactsSnapshot` for `scheduledReportId`, scoped to the organization;
`collectPriorFacts` degrades to `null` on any failure. `renderFacts` then emits a
change block — one line per aggregate that moved. One extra query, zero extra LLM
calls, and it is the only thing that stops two monthly reports on a stable estate
from being obliged to say the same thing.

Manual runs carry no `scheduledReportId`, so they silently render no change block.

`FACTS_SCHEMA_VERSION` (`analyzers/facts.ts`) stamps the snapshot and
`collectPriorFacts` refuses a prior carrying any other version. **Bump it whenever
an aggregate is renamed, removed, or changes meaning.** The delta subtracts by
name and reads a name missing from the current side as a bucket that emptied to
zero, so an un-versioned rename makes every orphaned key read as a measured
improvement — "AI Models ownerless: 0 (was 7, -7)" for an estate where nothing
changed, which is worse than a static wrong label because a delta reads as
evidence of remediation. Refusing the prior costs one comparison and says nothing
false.

### Persistence

Each analyzed section is written to `report_run_analyses`, a per-run sidecar keyed by `(report_run_id, section_key, organization_id)`. Beyond the payload, `audit_metadata` carries `analyzer_version`, `attempts`, `restatement_retried` (did the shallowness gate fire) and `facts` (this run's `FactsSnapshot`, which is what the next run of the schedule diffs against). It is unconstrained JSONB — no migration was needed for any of them — so anything that prunes it to a documented key set must account for `facts`, or every scheduled report silently loses its change block. `upsertRunAnalysisQuery` (`utils/reportRunAnalysis.utils.ts`) upserts with `ON CONFLICT` and bumps `analysis_version` in place, so re-analysis never inserts a duplicate. A `WHERE EXISTS` guard refuses writes when the run does not belong to the given organization; the caller must treat an `undefined` return as a failed write. `persistAnalyses` never throws — a report that generated successfully is not marked failed because its audit sidecar could not be written — and reports per-section status (`ok` / `abstained` / `write_failed`) into `report_runs.ai_status`.

### Abstention

An analyzer that cannot produce grounded output **abstains** rather than inventing one. The report still generates. `mapAnalysesToSummaries` collects every stated reason onto `aiSummaries.abstentions`, keyed by analyzer key, and both renderers print them in an *Analyses not produced* list — an abstention with no stated reason contributes nothing rather than an empty line.

The reasons split by **what they tell the reader**, and the split is enforced in
one place: `analyzers/abstainReasons.ts` holds the vocabulary and both
`runAnalyzers` (which emits) and `mapToSummaries` (which classifies) import it.
It is its own module rather than a `runAnalyzers` export because several suites
`jest.mock` that file, and an auto-mock handed back `undefined` at module load.

An **operational** reason describes this pipeline. `isOperationalAbstention`
replaces it with the neutral sentence "This analysis was not produced." before
either renderer sees it, because our infrastructure is not a governance finding —
and because printing it verbatim tells a regulator the tenant's estate was
deficient when it may have been plentiful:

- No LLM key configured for the organization
- The AI service call failed — provider detail (custom base URLs, request paths) stays in the log, out of the regulator-facing field
- No section summaries were available to summarise *(summary consumers; the Stage-1 step failed, not the data)*
- No section produced a summary

An **analytical** reason is a genuine statement about the data and prints verbatim:

- Insufficient data for the section (raw-section analyzers)
- The model itself set `abstain_reason` in its schema-validated payload

`mapToSummaries.test.ts` walks the whole vocabulary and asserts each reason is classified, so a new one cannot leak into a report by being added on one side only.

Absence of scores is never presented as absence of gaps.

### Render

`mapAnalysesToSummaries` (`analyzers/mapToSummaries.ts`) flattens analyzer payloads onto `AISummaries`, which both renderers consume. Everything below renders identically in `templates/reports/report-pdf.ejs` and `services/reporting/docxGenerator.ts` — **change the two together or the formats diverge**:

| Payload | Rendered as |
|---------|-------------|
| `keyFindingsDetailed[]` | Severity chip, section, `basis`, the finding text, `Closes when:` and related section keys. Falls back to the flat `keyFindings` string list when absent. |
| `recommendedActions[]` | Action, `Why:` (the analyzer's `rationale`), priority, `basis`, suggested owner. |
| `riskAnalysis.top_risks[]` | *Most material risks* table: name, verbatim level, why it ranks there. |
| `complianceGap.gaps[]` | Control, gap, `basis`, priority, `Closes when:`. |
| `vendorRisk.concerns[]` | Vendor, concern, severity and `basis`. |
| `abstentions` | *Analyses not produced* list, one line per abstained analyzer. |

Three standing rendering constraints:

- **One analyzer-label map.** `ANALYSIS_LABELS` is exported from `analyzers/mapToSummaries.ts`. `docxGenerator.ts` imports it; `pdfGenerator.ts` passes it into the EJS render data as `analysisLabels`. Neither renderer declares its own copy — a second copy drifts the first time a block is added, and the mismatch only shows up when someone diffs a PDF against a DOCX of the same run.
- **No markdown renderer exists on any surface.** Asterisks and backticks print literally in both formats. Prompts must keep prose plain.
- **Page-break avoidance is per finding and per table row, never per block.** `page-break-inside: avoid` on an AI block taller than a page cannot be honoured and only pushes a blank page ahead of it, which is what longer prose produces.

### Versioning

`ANALYZER_VERSION` (`analyzers/prompts.ts`) is stamped into `report_run_analyses.audit_metadata`; it currently reads `report-analyzer-v2`. **Bump it on any prompt or schema change** — it is how a stored analysis is traced back to the prompt and schema that produced it.

## PDF Generation

### Technology

- **Playwright** (headless Chromium)
- **EJS** templates for HTML rendering

### Template Structure

```
templates/reports/
├── report-pdf.ejs    - Main PDF template
├── report-docx.ejs   - DEAD FILE. Not a live template: no generator loads it,
│                      docxGenerator.ts imports no EJS at all, and DOCX is built
│                      programmatically with the `docx` library (see below).
├── pmm-report.ejs    - PMM-specific template
└── styles/
    ├── pdf.css       - PDF styling
    └── docx.css      - DOCX styling
```

### PDF Options

```typescript
{
  format: 'A4',
  margin: { top: '0.75in', bottom: '0.75in', left: '0.75in', right: '0.75in' },
  printBackground: true
}
```

### Template Variables

```ejs
<%- metadata.projectTitle %>
<%- metadata.frameworkName %>
<%- branding.organizationName %>
<%- renderedCharts.riskDistribution %>
<% for (const risk of sections.projectRisks.risks) { %>
  <%= risk.risk_name %>
<% } %>
```

## DOCX Generation

### Technology

- **docx** npm library for native Word documents
- No templating: `docxGenerator.ts` builds the document programmatically and imports no EJS. `templates/reports/report-docx.ejs` is dead (501 lines, referenced by nothing under `Servers/`).

### Document Structure

```typescript
new Document({
  sections: [{
    children: [
      // Cover page
      new Paragraph({ children: [/* title, logo */] }),
      // Table of contents
      new TableOfContents(),
      // Sections with tables and charts
      ...sections
    ]
  }]
})
```

### Supported Elements

- Paragraphs with text runs
- Tables with styled cells
- Multiple heading levels
- Page breaks
- Text colors and sizing
- Shading and borders

## Chart Generation

### Chart Types

| Chart | Function | Usage |
|-------|----------|-------|
| Risk Distribution | `generateRiskDistributionChart()` | Horizontal bar chart |
| Risk Donut | `generateRiskDonutChart()` | Donut chart |
| Compliance Progress | `generateComplianceProgressChart()` | Progress bar |
| Assessment Status | `generateAssessmentStatusChart()` | Status chart |

### Chart Colors

```typescript
const RISK_COLORS = {
  critical: '#B42318',  // Red
  high: '#C4320A',      // Orange
  medium: '#B54708',    // Brown
  low: '#027A48',       // Green
  info: '#026AA2'       // Blue
}
```

## Report Data Interfaces

### ReportData

```typescript
interface ReportData {
  metadata: ReportMetadata;
  branding: ReportBranding;
  charts: ChartData;
  renderedCharts: RenderedCharts;
  sections: {
    projectRisks?: ProjectRisksSectionData;
    vendorRisks?: VendorRisksSectionData;
    modelRisks?: ModelRisksSectionData;
    compliance?: ComplianceSectionData;
    assessment?: AssessmentSectionData;
    clausesAndAnnexes?: ClausesAndAnnexesSectionData;
    nistSubcategories?: NistSubcategoriesSectionData;
    vendors?: VendorsListSectionData;
    models?: ModelsListSectionData;
    trainingRegistry?: TrainingRegistrySectionData;
    policyManager?: PolicyManagerSectionData;
    incidentManagement?: IncidentManagementSectionData;
  }
}
```

### ReportBranding

```typescript
interface ReportBranding {
  organizationName: string;
  organizationLogo?: string;
  primaryColor: string;    // Default: #13715B
  secondaryColor: string;  // Default: #1C2130
}
```

## Frontend Structure

### Components

| Component | Purpose |
|-----------|---------|
| `GenerateReport` | Main generation interface |
| `GenerateReportFrom` | Project/format selection |
| `SectionSelector` | Section selection UI |
| `DownloadReportFrom` | Download interface |
| `ReportOverviewHeader` | Page header |
| `ReportingSteps` | UI tour |

### Section Selection

```typescript
// LocalStorage persistence
const SECTION_STORAGE_KEY = 'reportSectionPreferences';

// Framework-aware filtering
getAvailableSections(frameworkId: number): SectionGroup[]

// Convert UI to API format
selectionToBackendFormat(selection: Selection): string[]
```

### Custom Hook

```typescript
function useGeneratedReports() {
  // Fetches generated reports
  // Manages loading/error states
  return { reports, loading, error, refetch };
}
```

## File Storage Integration

Generated reports stored in files table:

| Source Enum Value | Report Type |
|-------------------|-------------|
| `"Project risks report"` | risk-report |
| `"Compliance tracker report"` | compliance-tracker-report |
| `"Assessment tracker report"` | assessment-tracker-report |
| `"Vendors and risks report"` | vendor-report |
| `"Clauses and annexes report"` | clauses-annexes-report |
| `"Models and risks report"` | model-risks |
| `"Training registry report"` | trainingRegistry |
| `"Policy manager report"` | policyManager |
| `"All reports"` | report |

## Access Control

### Role-Based Access

| Role | Access |
|------|--------|
| Admin | All organization reports |
| Editor | Project reports where member |
| Reviewer | Project reports where member |
| Auditor | Project reports where member |

### Report Listing

```typescript
// Admin sees all reports
if (user.role === 'Admin') {
  return getAllOrgReports(orgId);
}

// Others see only project reports where they're members
return getMemberProjectReports(userId);
```

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `services/reporting/index.ts` | Entry point |
| `services/reporting/dataCollector.ts` | Data aggregation |
| `services/reporting/pdfGenerator.ts` | PDF rendering |
| `services/reporting/docxGenerator.ts` | DOCX generation |
| `services/reporting/chartUtils.ts` | Chart generation |
| `controllers/reporting.ctrl.ts` | Controller |
| `routes/reporting.route.ts` | Routes |
| `utils/reporting.utils.ts` | Database queries |
| `templates/reports/report-pdf.ejs` | PDF template |

### Frontend

| File | Purpose |
|------|---------|
| `components/Reporting/GenerateReport/index.tsx` | Main component |
| `components/Reporting/GenerateReport/SectionSelector/` | Section selector |
| `components/Reporting/GenerateReport/constants.ts` | Configuration |
| `hooks/useGeneratedReports.tsx` | Data hook |
| `repository/entity.repository.ts` | API calls |

## Template-First Reporting Layer

The template-first reporting layer sits **on top of** the existing report engine (`generateReport`) described above — it does not replace it. It adds reusable system templates, scheduled deliveries, and run tracking.

Manual generation (`/generate-report`, `/v2/generate-report`) now runs through this same `report_runs` pipeline instead of generating synchronously: the controller creates a `report_runs` row and enqueues a `generate_report_manual` job (worker-side `executeManualRun`), same as a scheduled run does. See [Data Flow](#data-flow) above.

### Reporting Tables

| Table | Purpose |
|-------|---------|
| `report_templates` | Reusable report definitions (system or org-defined). |
| `report_template_versions` | Versioned snapshots of a template's section/config payload. |
| `scheduled_reports` | A template + schedule (cron) + delivery config for an org. |
| `report_runs` | **The single list of produced reports** — execution records of every scheduled or run-now report. The Reporting UI's Generate and Archive tabs are both views over this one table (see [Run Archiving](#run-archiving)); nothing reads the legacy `files`-based list ([below](#the-legacy-files-based-list-is-dead-code-for-the-ui)). |

`report_runs.archived_at` / `archived_by` carry a manual, reversible archive — set by `PATCH /runs/:id/archive`, cleared by `PATCH /runs/:id/restore`. Archiving is **orthogonal to `status`**: a `failed` run can be archived, a `success` run can sit unarchived indefinitely, and archiving never touches `status`, `file_id` or any other column. It is a UI-side filing action, not a statement about whether the run worked.

### Seeded System Templates

Three system templates are seeded. MVP sections are **SNAPSHOT-based** (current-state); delta and time-window sections are future work.

| Template | Focus |
|----------|-------|
| Daily Governance Pulse | Daily snapshot of governance posture. |
| Weekly Executive Brief | Weekly executive-level summary. |
| Compliance Evidence Gap | Snapshot of missing/incomplete compliance evidence. |

### API Endpoints

All endpoints are auth-protected and org-scoped.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reporting/sections` | Section catalog (the 12-section taxonomy) |
| GET | `/api/reporting/templates` | List available templates |
| GET | `/api/reporting/templates/:id` | Get a template |
| POST | `/api/reporting/templates` | Create a template |
| PATCH | `/api/reporting/templates/:id` | Update a template (see [Template Write Path](#template-write-path)) |
| DELETE | `/api/reporting/templates/:id` | Archive a template (`is_active = false`) |
| POST | `/api/reporting/templates/:id/run` | Run a template once, ad hoc, with no schedule row (see [Run Now](#run-now-ad-hoc-template-runs)) |
| GET | `/api/reporting/scheduled-reports` | List scheduled reports |
| POST | `/api/reporting/scheduled-reports` | Create a scheduled report (recipients are format-validated here) |
| PATCH | `/api/reporting/scheduled-reports/:id` | Update a scheduled report (see [Updating a Schedule](#updating-a-schedule)) |
| POST | `/api/reporting/scheduled-reports/:id/run-now` | Trigger an immediate run of an existing schedule |
| POST | `/api/reporting/scheduled-reports/:id/pause` | Pause schedule |
| POST | `/api/reporting/scheduled-reports/:id/resume` | Resume schedule |
| DELETE | `/api/reporting/scheduled-reports/:id` | Soft-delete a scheduled report |
| GET | `/api/reporting/runs` | List report runs — **paginated**, returns `{rows, total, limit, offset}`, and filterable by `?archived=true\|false` (see [Run Listing is Paginated](#run-listing-is-paginated) and [Run Archiving](#run-archiving)) |
| GET | `/api/reporting/runs/:id` | Get a run (org-scoped **and** membership-scoped — see [One Rule, Applied to Every Per-Run Endpoint](#one-rule-applied-to-every-per-run-endpoint)) |
| GET | `/api/reporting/runs/:id/download` | Download a run's output (same gate, then org-scoped run and org-scoped file) |
| GET | `/api/reporting/runs/:id/analyses` | Stored `report_run_analyses` rows for a run (same gate, then doubly org-scoped: the run and the analyses are both filtered by `organization_id`) |
| PATCH | `/api/reporting/runs/:id/archive` | Move a run into the Archive tab (see [Run Archiving](#run-archiving)) |
| PATCH | `/api/reporting/runs/:id/restore` | Move a run back into the Generate tab |
| DELETE | `/api/reporting/runs/:id` | Permanently delete a run |

### Template Write Path

**System templates are read-only for every org.** `organization_id IS NULL` marks a seeded template. The guard lives in the query WHERE clause — `organization_id = :org AND is_system_template = false` — not in a controller branch, so a write against a system template matches zero rows and the controller returns **404**. There is no code path that can be reordered into a bypass.

**DELETE is a soft delete.** It sets `is_active = false`. `scheduled_reports.template_id` is a NOT NULL FK with no `ON DELETE` clause, so hard-deleting a referenced template fails at the database; archiving is the only safe removal.

**Template versions are append-only.** A `PATCH` carrying any of `sections_config`, `ai_blocks_config`, `format_config`, `branding_config`, `schedule_defaults` or `delivery_defaults` inserts a **new** `report_template_versions` row at `MAX(version) + 1`. Metadata fields (name, description, and the like) update the `report_templates` row in place. Existing scheduled reports keep pointing at the version they were created against.

**Slugs are derived server-side** from the template name. Uniqueness is enforced by `uq_report_templates_org_slug` on `(COALESCE(organization_id, 0), slug)`, which makes system templates share the org-0 namespace. A collision returns **409**.

**Cross-org protection.** `getLatestVersionQuery` / `getVersionByIdQuery` are org-scoped via a JOIN to `report_templates`, so a version id from another org resolves to nothing. Scheduled-report creation additionally validates that the supplied `templateVersionId` belongs both to `templateId` and to the caller's org. Report templates are covered by the tenant-isolation suite (`Servers/tests/integration/tenant-isolation/report-templates.isolation.test.ts`), and the three reporting tables are registered in the isolation registry.

### Run Now (Ad Hoc Template Runs)

`POST /reporting/templates/:id/run` (`runTemplateNow` in `controllers/reportTemplate.ctrl.ts`) produces **one** report from a template with no `scheduled_reports` row behind it. It builds an in-memory schedule object (`id: null`) from the requested scope/sections/format and the template's latest version, forces `delivery_config: { saveToStorage: true }` — a run-now report exists to be downloaded from the Generate tab, not delivered by email — and calls the same `runScheduledReport()` that scheduled runs use. **Scheduled runs and run-now share one execution path**; the only difference is which caller assembles the schedule object and that run-now's schedule id is always `null`.

The response reflects the run's outcome rather than always claiming success: `success` / `partial_success` return `200 { started: true, runId, status }`; `failed` returns `500 { runId, status: "failed", error }` so the caller still has the run id to look up what happened. `partial_success` is still a downloadable report — only `failed` means no file was produced.

The frontend wizard (`ConfigureReportWizard.tsx`, `mode="run-now"`) skips the Schedule and Delivery review steps that a scheduled run shows, and on success routes the user to the Generate tab rather than the Scheduled tab. Everything the two modes share lives on the steps they both keep — the output **Format** select sits on the Scope step for that reason; on the Schedule step it was unreachable in run-now mode, which silently forced every ad-hoc report to PDF.

### Section Catalog

`Servers/services/reporting/sectionCatalog.ts` is the single owner of the 12-section taxonomy; it backs `GET /api/reporting/sections` and `VALID_SECTION_KEYS` derives from it (catalog keys plus the `all` wildcard). A test pins the catalog against the frontend's `REPORT_SECTION_GROUPS` backend-key set, so drift between the two fails CI rather than silently rejecting a section the wizard can still offer.

### Services

| Service | Responsibility |
|---------|---------------|
| `ReportTemplateResolver` | Resolves a template config into a `ReportGenerationRequest`, then reuses the existing `generateReport`. |
| `reportDeliveryService` | Persists output to storage via `uploadFile` **and sends the delivery email** (see [Email Delivery](#email-delivery)). |
| `reportRunOrchestrator` | Drives a run end to end and records terminal status (`success` / `partial_success` / `failed`). |
| `scheduleCalculator` | Computes `next_run` from the cron expression via `cron-parser` (`computeNextRun`). |

### Email Delivery

Delivery genuinely sends email. Earlier revisions recorded `status: "success"` for the email channels without calling any email function — the service carried its own TODO admitting it, so a misconfigured schedule looked healthy indefinitely.

`reportDeliveryService` now reads `Servers/templates/report-ready.mjml`, compiles it with `compileMjmlToHtml` (which takes MJML **source**, not a template name), and sends via `sendAutomationEmail`.

- **Both email channels share one send.** `sendEmailLink` contributes a download button, `attachFile` contributes the attachment. Two enabled channels must not mean two emails to the same people.
- **A throw records `failed` with the provider's real error**, not a generic string, and does not lose the report — storage has already succeeded and the run stays downloadable.
- **Empty recipients is `failed`, not `success`.** This is the case that previously made a broken schedule look fine.
- `reportRunOrchestrator.ts:32` already mapped any failed channel to `partial_success`. That mapping was dead for email until this fix and is now live: an email failure downgrades an otherwise-successful run to `partial_success` rather than reporting `success`.

**Recipients are format-validated at schedule creation** via `isValidEmail` (exported from `Servers/services/email/types.ts` for this). The validator names *every* bad address, not just the first, because the person who typed them is present at creation time and long gone by the time a worker log records the failure. Send-time validation inside `sendAutomationEmail` remains the backstop.

### Run Listing is Paginated

**Breaking response-shape change.** `GET /api/reporting/runs` previously returned a bare array under a hard `LIMIT 200`. It now returns an envelope:

```json
{ "rows": [], "total": 0, "limit": 200, "offset": 0 }
```

`limit` is clamped to a maximum of 200. The defaults (`limit=200`, `offset=0`) reproduce the old result set exactly, so a caller that passes nothing sees what it saw before — but the **shape** changed, and any consumer that indexed the response directly must be updated. `total` lets a UI page without a second endpoint.

Frontend consumers are insulated: `useReportRuns` unwraps the envelope with a React Query `select: (page) => page.rows`, so it still yields a plain array and its contract is unchanged. `useReportRunsPage` exposes the full envelope for callers that need `total`.

`GET /api/reporting/runs` also takes an `?archived=true|false` query param, tri-state on purpose: `true` returns only archived runs, `false` returns only live ones, and omitting it returns both (`listRunsQuery` in `Servers/utils/reportRun.utils.ts`). This is what the Generate and Archive tabs each pass to get their half of the list — see [Run Archiving](#run-archiving).

The list rows carry two joined columns the table needs and `report_runs` does not store: `template_name` (from `report_templates`, so an archived template still names its runs) and `scope_project_id` / `scope_project_title`.

### Who Sees Which Runs

The runs list is **not** scoped by `organization_id` alone. The legacy Generate list it replaced (`getGeneratedReportsQuery`) restricted a non-Admin to reports for projects they own or are a member of — `(p.owner = :userId OR pm.user_id = :userId)` — and `listRunsQuery` reproduces that rule. Without it an Auditor would be listed, and could download, every report in the organization.

`report_runs` has no project column, so a run's project scope is derived:

```sql
COALESCE(rr.config_snapshot->>'project_id', sr.project_id::text)
```

- `runScheduledReport` writes `project_id` into `config_snapshot` for **every** run it creates. This is the only record of the project for a run-now report, whose `scheduled_report_id` is `NULL`.
- The join to `scheduled_reports` covers runs created before the snapshot carried one.
- The archive migration's legacy backfill already wrote `project_id` into `config_snapshot`.
- `NULL` means the report covers the whole organization, and those stay visible to everyone — the legacy inner join to `projects` hid them, which the design calls a bug, not a rule to preserve.

Admin and SuperAdmin are unrestricted. The viewer is a **required** argument to `listRunsQuery`, not an optional filter, so a new caller cannot silently get an organization-wide list; the controller passes `{ userId: req.userId, role: req.role }` from the JWT, never from the body. A viewer with no user id matches no project owner and no membership row, so it sees organization-scoped runs only.

Because the value feeds an authorization predicate, `POST /reporting/templates/:id/run` rejects a project-scoped request whose `projectId` is not a positive integer with a **400** rather than coercing it — a garbage value would snapshot as "no project" and publish the report org-wide.

#### One Rule, Applied to Every Per-Run Endpoint

The list rule is not the list's rule — it is the run's. `canViewRunQuery(id, organization_id, viewer)` in `Servers/utils/reportRun.utils.ts` applies the identical predicate to a single id, built from the same `viewerVisibilitySql` and project-derivation SQL as `listRunsQuery` so the two cannot drift. Every per-run endpoint passes through it first: `GET /reporting/runs/:id`, `/download` and `/analyses`, plus the mutating `PATCH /:id/archive`, `PATCH /:id/restore` and `DELETE /:id`. **If a run does not appear in your list, you cannot fetch, download, read the analyses of, archive, restore or delete it either.**

Organization scope alone was not enough, and the exposure was concrete rather than theoretical: run ids are sequential integers, so any authenticated member of the organization — an Auditor included — could enumerate ids and pull every project's report. `GET /reporting/runs/:id` returns `SELECT *`, which carries `config_snapshot` (including `project_id`) and `delivery_config` (including email recipients).

Nor was membership gating a new restriction invented for `report_runs`: the legacy per-file download it replaced already enforced one. `getFileContentById` (`Servers/controllers/file.ctrl.ts`) calls `canUserAccessFile` (`Servers/utils/fileUpload.utils.ts`), which gates a non-Admin on `f.uploaded_by = :userId OR p.owner = :userId OR pm.user_id = :userId OR (f.project_id IS NULL AND f.org_id = :userOrgId)`. The reporting endpoints were the ones that had dropped it.

`canUserAccessFile` is nonetheless **not** what the run endpoints reuse. It reads the *file's* `project_id` / `org_id`, whereas a run's scope is derived from `config_snapshot->>'project_id'` — values the delivery service does not necessarily populate the same way, so gating a run on its file's columns risks denying a user their own organization-scoped report. One rule per resource: files answer to `canUserAccessFile`, runs answer to `canViewRunQuery`.

**Denial is 404, not 403.** It matches how the rest of this controller hides rows belonging to another organization, and over a sequential id space a 403 would be an id-existence oracle — it would confirm that run 812 exists and merely isn't yours. The gate also runs *before* the row is read, so a denied request never touches the run, its file or its analyses. This diverges from `file.ctrl.ts`, which returns 403 and logs the denial; that is deliberate, not an oversight.

For the three mutating endpoints the practical change affects **Editors only** — Admin and SuperAdmin are unrestricted by the predicate, so what is new is that an Editor cannot archive or delete a run for a project they are not on. Organization-scoped runs (no `project_id`) stay open to every Editor, as before. The gate is a separate statement from the `UPDATE` / `DELETE`, but each of those keeps its own `organization_id` in the `WHERE` clause, so the window between them cannot widen the blast radius.

### Run Archiving

`report_runs.archived_at` is a manual, reversible archive, independent of `status` (see [Reporting Tables](#reporting-tables)). Three endpoints move a run between the two tabs or remove it permanently, all Admin/Editor (`authorize(["Admin", "Editor"])`) and org-scoped:

| Endpoint | Effect |
|----------|--------|
| `PATCH /reporting/runs/:id/archive` | Sets `archived_at = NOW(), archived_by = :userId`. |
| `PATCH /reporting/runs/:id/restore` | Clears both back to `NULL`. |
| `DELETE /reporting/runs/:id` | Permanently deletes the run row and the `files` row it produced, in **one transaction** — `report_runs.file_id` is `ON DELETE SET NULL`, so a half-applied delete would strand a run pointing at nothing. File removal goes through `deleteFileById`, which also clears the file's `file_folder_mappings`. A run with no `file_id` deletes the row alone. |

Every one of the three is scoped by `organization_id` in its `WHERE` clause, and all three additionally pass the `canViewRunQuery` membership gate first ([above](#one-rule-applied-to-every-per-run-endpoint)) — Admin/Editor says *may mutate runs*, not *may mutate this run*. A run id that exists but belongs to another organization, or to a project the Editor is not on, matches zero rows, and the query layer treats that the same as a nonexistent id: **404**, never a silent `200` on someone else's data. `Servers/tests/integration/tenant-isolation/report-runs.isolation.test.ts` asserts this for all three endpoints, plus that a cross-tenant attempt leaves the row untouched.

**The Generate tab lists `archived_at IS NULL`, the Archive tab lists `archived_at IS NOT NULL`. Both render the same `ReportRunsTable` component**, parameterized by `variant="live"` / `variant="archived"` (`Clients/src/presentation/pages/Reporting/ReportRunsTable.tsx`), which is what stops the two lists drifting apart the way the old files-based list and the runs list did. A run-now report therefore always lands in Generate first (`archived_at` starts `NULL`) and only reaches Archive once a user archives it — it is never placed there directly.

### Updating a Schedule

`PATCH /api/reporting/scheduled-reports/:id` is restricted to Admin / Editor via `authorize(["Admin", "Editor"])`.

**The field allowlist is enforced twice** — in the controller and again in the query builder (`UPDATABLE_FIELDS` in `Servers/utils/scheduledReport.utils.ts`). `organization_id`, `template_id`, `template_version_id` and `created_by` are deliberately absent from it. A PATCH therefore cannot move a schedule between tenants or re-point it at another org's template, and neither layer alone is load-bearing.

**A `schedule_config` change recomputes `next_run_at`.** Without this the stored value would still reflect the old cron expression, and the schedule would keep firing on its previous cadence until the next run rewrote it.

### Frontend Schedule Management

The Reporting UI can now edit and delete schedules. Note that the soft-delete endpoint had existed since the reporting MVP **with no caller at all** — it was reachable only by hand-crafting a request.

The wizard (`ConfigureReportWizard.tsx`) now:

- **Offers PDF and DOCX.** The format was previously hardcoded with no state behind it, so the DOCX generator was unreachable from the UI.
- **Disables AI blocks when the org has no LLM key**, gated on the *settled* value of `useLLMKeyStatus`. `hasKeys` is optimistically `true` while loading, so the gate checks `!loading && !hasKeys`; reading `hasKeys` alone would flash the controls enabled and then disable them.

### RBAC

| Operation | Access |
|-----------|--------|
| Writes (create/update/run-now/pause/resume/delete scheduled reports) | Admin / Editor (via `authorize` middleware) |
| Template writes (create / update / archive) | Admin / Editor (via `authorize` middleware) |
| Reads (section catalog, templates, scheduled reports, runs) | Any authenticated user (JWT) |
| Any single run — fetch, download, analyses, archive, restore, delete | Authenticated + org-scoped + project-membership-scoped via `canViewRunQuery` (Admin/SuperAdmin unrestricted); denial is 404 — see [One Rule, Applied to Every Per-Run Endpoint](#one-rule-applied-to-every-per-run-endpoint) |

The existing **Admin-only** manual generate endpoints are preserved.

### The `scheduled_report` Automation Trigger is Retained Deliberately

> **The `scheduled_report` automation trigger is retained deliberately.** The original design called for retiring it as a vestigial third caller of `generateReport()`. It is not vestigial: the trigger type is seeded in `20260226234301-public-schema-tables.js:901`, handled by `sendReportNotification()` in `Servers/services/automations/automationWorker.ts:304-428`, and — decisively — created at runtime by the Automations UI (`ConfigurationPanel/index.tsx:665`). Any organization that built a "Scheduled Report" automation has a live row this path serves, and removing it would break them silently with no migration. It duplicates the newer `scheduled_reports` pipeline conceptually, so consolidating them is worthwhile, but that is a migration project with a data-movement story — not a deletion.

### Known MVP Limitations

- Structured `recommendedActions` emission is **scaffolding only** — runs currently render the existing recommendations rather than emitting structured actions.
- A `PATCH` carrying **both** metadata and config performs two un-transacted writes. If the version insert fails, the metadata update is already committed.
- `ScheduledReportUpdateBody` (frontend) omits `frameworkId` and `projectFrameworkId`, which the backend `UPDATABLE_FIELDS` allowlist does accept. The frontend type is a strict subset of the API — harmless today, but it means those two fields cannot be edited from the UI.

### Frontend surface (complete)

The UI half of the templates/schedules/runs stack is wired. The Reporting page (`Clients/src/presentation/pages/Reporting/index.tsx`) has four tabs — Generate, Templates, Scheduled, Archive:

- **`TemplatesTab`** — splits templates into two sections, **My templates** and **System templates**, on `is_system_template` (`Clients/src/presentation/pages/Reporting/TemplatesTab.tsx`). Every card offers **Use Template** (opens the wizard in schedule mode, `onUse(id, "schedule")`) and **Run now** (opens it in run-now mode, `onUse(id, "run-now")`, see [Run Now](#run-now-ad-hoc-template-runs)). My-templates cards additionally get **Edit** (name, description, category, over `useUpdateTemplate`) and **Archive** (over `useArchiveTemplate`, behind a confirmation). **System-template cards get neither Edit nor Archive** — writes match on `organization_id = :org AND is_system_template = false`, so the backend 404s for them and the UI omits buttons that cannot succeed. In their place, System-template cards offer **Duplicate**, which `POST`s a new org-owned `report_templates` row seeded from the source template's name (`"<name> (copy)"`), description, category, scope and section/AI-block config (`handleDuplicate`, `useCreateTemplate`) — this is how an org turns a read-only system template into something it can edit. **Duplicate fetches the full template first** (`getTemplate(id)`): `useTemplates` is backed by `SELECT * FROM report_templates`, which carries no version, and only `GET /templates/:id` attaches `latestVersion`. Reading the section config off the list row produced copies with an empty `sections_config`, which the wizard will not accept (its Sections step requires one enabled section) and the Edit modal cannot repair. If that fetch fails, nothing is created. A 409 from any of these surfaces as a duplicate-name message.
- **`ScheduledReportsTab`** — edit (name, format, schedule) and delete, over `useUpdateScheduledReport` / `useDeleteScheduledReport`. Both destructive paths require a confirmation naming the schedule. Edits always send `scheduleConfig`, because `updateScheduledReportQuery` only recomputes `next_run_at` when that key is present.
- **`ReportRunsTable`** (`Clients/src/presentation/pages/Reporting/ReportRunsTable.tsx`) — the one table backing both the Generate and Archive tabs (see [Run Archiving](#run-archiving)). It takes a `variant: "live" | "archived"` prop and passes `archived: variant === "archived"` to `useReportRunsPage`, so the two tabs differ only in which half of `report_runs` they query — same columns (Report / Template / Status / Scope / Created / Triggered by / Actions), same empty-state component, same drawer. `output_filename` is `NULL` until a run succeeds, so a queued, running or failed row is named `Run #<id>` and identified by the adjacent Template and Scope columns rather than a bare dash. Pagination is server-side via `StandardTablePagination`, gated on the server-reported `total` rather than the current page's row count, so paging past the end reads as "you paged past the end", not "there is nothing here"; `page` is pulled back in range when archiving the last row shrinks the total below it. Status renders through a fixed label/variant map on the shared `Chip` — `partial_success` is styled `warning`, never `error`, because a partial-success run is still downloadable (see the run-status vocabulary note below) — and its tooltip falls back from `error_message`, which is `NULL` on that path, to the failed channels in `delivery_status`. Download re-materializes the returned Blob through a throwaway `<a>` element; Delete is gated behind a `ConfirmationModal` since, unlike Archive, it cannot be undone. Each row also opens `ReportAnalysisPanel` in a drawer, independent of variant.
- **`ReportAnalysisPanel`** — presentational (`{analyses, isLoading}`), caller owns `useRunAnalyses`. Renders all seven section keys including `sectionSummaries`, handles a `null` payload (a real runtime case — `runAnalyzers` writes `payload: null` when a section produced nothing) and surfaces `abstain_reason`.

> Every field the panel renders has a verified backend producer. `EvidenceAnalysisPanel` is the cautionary case: it declares `rationales` and `document_signals`, neither of which any code in `Servers/` has ever emitted, so one renders permanently empty and ~85 lines of chip UI gated on the other are unreachable. Do not add a field to this panel without confirming something writes it.

Run status is a fixed vocabulary: `queued`, `running`, `success`, `partial_success`, `failed`. `partial_success` means the report itself generated but a delivery channel (e.g. email) failed — the file exists, `file_id` is set, and it is downloadable from either tab. Only `failed` means no file was produced.

### The Legacy `files`-Based List is Dead Code for the UI

`GET /reporting/generate-report` (`getGeneratedReportsQuery`) still exists and still works, but nothing under `Clients/src/presentation/pages/Reporting/` calls it — the only caller, `useGeneratedReports`, is used solely by `Clients/src/presentation/pages/Reporting/Reports/index.tsx`, which nothing imports. The Reporting page reads exclusively from `report_runs` via `ReportRunsTable` (see [Run Archiving](#run-archiving)).

This is more than an unused code path: `getGeneratedReportsQuery` builds its result with `JOIN projects p ON report.project_id = p.id` — an **inner** join. Any `files` row with a `NULL` `project_id` (an organization-scoped report, as opposed to a project-scoped one) is filtered out before it ever reaches the response. That inner join is why organization-scoped reports were invisible in the legacy list, and it is one more reason the `report_runs` pipeline — which has no such join — is the one the UI reads from now.

## Related Documentation

- [PDF Generation](../infrastructure/pdf-generation.md)
- [Risk Management](./risk-management.md)
- [Compliance Frameworks](./compliance-frameworks.md)
- [Use Cases](./use-cases.md)
- [Automations & Job Scheduling](../infrastructure/automations.md)
