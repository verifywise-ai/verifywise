# Reporting Domain

> **Last Updated:** 2026-07-20

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
| GET | `/reporting/generate-report` | List generated reports |
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

| Section | Tables | Key Fields |
|---------|--------|-----------|
| projectRisks | risks, projects_risks | risk_name, severity, likelihood |
| vendorRisks | vendor_risks, vendors | risk_level, action_plan |
| modelRisks | model_risks, model_inventory | risk_name, mitigation_status |
| compliance | controls, control_categories | status, title |
| assessment | assessments, topics, questions | answer, progress |
| clausesAndAnnexes | clauses, annexes | status |
| nistSubcategories | nist_ai_rmf_subcategories | function, category, status |
| vendors | vendors, vendors_projects | vendor_name, review_status |
| models | model_inventory | name, version, status |
| trainingRegistry | training_registrar | training_name, status |
| policyManager | policies | title, version, status |
| incidentManagement | ai_incident_managements | type, severity, status |

## AI Analysis

Report AI output is produced by schema-validated analyzers in `services/reporting/analyzers/`. Each analyzer returns a zod-validated object (`schemas.ts`), never free text, so the renderers can lay it out as a formal compliance artifact instead of a prose blob.

### Analyzers

| Section key | Output | Input |
|-------------|--------|-------|
| `executiveSummary` | Multi-paragraph posture summary | Section summaries |
| `keyFindings` | 5–8 findings, each attributed to a section key | Section summaries |
| `recommendedActions` | 3–5 prioritised actions | Section summaries |
| `riskAnalysis` | Risk narrative + up to 6 named risks | `projectRisks`, `vendorRisks`, `modelRisks` |
| `complianceGap` | Explanation of STORED readiness scores + evidence gaps | Readiness scores, evidence gaps, compliance sections |
| `vendorRisk` | Third-party risk narrative + named vendor concerns | `vendors`, `vendorRisks` |

`sectionSummaries` (ported from the removed `aiSummarizer.ts`) is a seventh gateable block, but it is **not** a registry entry in `ANALYZERS`: its output is `Record<string, string>` prose rather than a schema-validated object, so it does not fit `AnalyzerDefinition`. It runs as a separate stage whose output the first three analyzers consume — feeding them raw section JSON instead measured ~38k tokens per prompt against ~6k, three times per report.

Two stages, ordering is load-bearing: Stage 1 runs `sectionSummaries` plus the raw-section analyzers (`riskAnalysis`, `complianceGap`, `vendorRisk`); Stage 2 runs the three summary consumers. Summaries are produced whenever a Stage 2 consumer is enabled, regardless of the `sectionSummaries` block flag — that flag governs whether summaries are *recorded and rendered* as their own blocks.

`complianceGap` receives readiness scores and evidence gaps as two independent inputs that are never joined: they disagree on framework coverage, project scoping and key space, so a join silently mislabels rows.

### Gating

`ai_blocks_config` on the template/schedule row selects which blocks run (`AiBlocksConfig` in `domain.layer/interfaces/i.reportTemplate.ts`, resolved by `reportTemplateResolver.ts`). Manual runs carry no template, so `resolveBlocks` (`analyzers/collectAnalyzerInputs.ts`) maps `aiEnhanced: true` to five blocks — `sectionSummaries`, `executiveSummary`, `keyFindings`, `recommendedActions`, `riskAnalysis` — reproducing the previous `aiSummarizer` output. `complianceGap` and `vendorRisk` stay off for manual runs to avoid unbudgeted spend. `ConfigureReportWizard` now offers all seven blocks, with `complianceGap` and `vendorRisk` defaulting **off** for the same reason — each enabled block is one LLM call per run.

### Persistence

Each analyzed section is written to `report_run_analyses`, a per-run sidecar keyed by `(report_run_id, section_key, organization_id)`. `upsertRunAnalysisQuery` (`utils/reportRunAnalysis.utils.ts`) upserts with `ON CONFLICT` and bumps `analysis_version` in place, so re-analysis never inserts a duplicate. A `WHERE EXISTS` guard refuses writes when the run does not belong to the given organization; the caller must treat an `undefined` return as a failed write. `persistAnalyses` never throws — a report that generated successfully is not marked failed because its audit sidecar could not be written — and reports per-section status (`ok` / `abstained` / `write_failed`) into `report_runs.ai_status`.

### Abstention

An analyzer that cannot produce grounded output **abstains** rather than inventing one. The report still generates; the section renders its abstention reason. Abstention causes:

- No LLM key configured for the organization
- Insufficient data for the section (raw-section analyzers)
- No section summaries available (summary consumers)
- The AI service call failed — the persisted reason is generic; provider detail (custom base URLs, request paths) stays in the log, out of the regulator-facing field
- The model itself set `abstain_reason` in its schema-validated payload

Absence of scores is never presented as absence of gaps.

### Versioning

`ANALYZER_VERSION` (`analyzers/prompts.ts`) is stamped into `report_run_analyses.audit_metadata`. **Bump it on any prompt or schema change** — it is how a stored analysis is traced back to the prompt and schema that produced it.

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

### Domain Tables

| Table | Purpose |
|-------|---------|
| `report_templates` | Reusable report definitions (system or org-defined). |
| `report_template_versions` | Versioned snapshots of a template's section/config payload. |
| `scheduled_reports` | A template + schedule (cron) + delivery config for an org. |
| `report_runs` | Execution records of a scheduled (or run-now) report. |

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
| GET | `/api/reporting/scheduled-reports` | List scheduled reports |
| POST | `/api/reporting/scheduled-reports` | Create a scheduled report (recipients are format-validated here) |
| PATCH | `/api/reporting/scheduled-reports/:id` | Update a scheduled report (see [Updating a Schedule](#updating-a-schedule)) |
| POST | `/api/reporting/scheduled-reports/:id/run-now` | Trigger an immediate run |
| POST | `/api/reporting/scheduled-reports/:id/pause` | Pause schedule |
| POST | `/api/reporting/scheduled-reports/:id/resume` | Resume schedule |
| DELETE | `/api/reporting/scheduled-reports/:id` | Soft-delete a scheduled report |
| GET | `/api/reporting/runs` | List report runs — **paginated**, returns `{rows, total, limit, offset}` (see [Run Listing is Paginated](#run-listing-is-paginated)) |
| GET | `/api/reporting/runs/:id` | Get a run |
| GET | `/api/reporting/runs/:id/download` | Download a run's output (org-scoped) |
| GET | `/api/reporting/runs/:id/analyses` | Stored `report_run_analyses` rows for a run (doubly org-scoped: the run and the analyses are both filtered by `organization_id`) |

### Template Write Path

**System templates are read-only for every org.** `organization_id IS NULL` marks a seeded template. The guard lives in the query WHERE clause — `organization_id = :org AND is_system_template = false` — not in a controller branch, so a write against a system template matches zero rows and the controller returns **404**. There is no code path that can be reordered into a bypass.

**DELETE is a soft delete.** It sets `is_active = false`. `scheduled_reports.template_id` is a NOT NULL FK with no `ON DELETE` clause, so hard-deleting a referenced template fails at the database; archiving is the only safe removal.

**Template versions are append-only.** A `PATCH` carrying any of `sections_config`, `ai_blocks_config`, `format_config`, `branding_config`, `schedule_defaults` or `delivery_defaults` inserts a **new** `report_template_versions` row at `MAX(version) + 1`. Metadata fields (name, description, and the like) update the `report_templates` row in place. Existing scheduled reports keep pointing at the version they were created against.

**Slugs are derived server-side** from the template name. Uniqueness is enforced by `uq_report_templates_org_slug` on `(COALESCE(organization_id, 0), slug)`, which makes system templates share the org-0 namespace. A collision returns **409**.

**Cross-org protection.** `getLatestVersionQuery` / `getVersionByIdQuery` are org-scoped via a JOIN to `report_templates`, so a version id from another org resolves to nothing. Scheduled-report creation additionally validates that the supplied `templateVersionId` belongs both to `templateId` and to the caller's org. Report templates are covered by the tenant-isolation suite (`Servers/tests/integration/tenant-isolation/report-templates.isolation.test.ts`), and the three reporting tables are registered in the isolation registry.

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
| Run download, run analyses | Authenticated + org-scoped |

The existing **Admin-only** manual generate endpoints are preserved.

### The `scheduled_report` Automation Trigger is Retained Deliberately

> **The `scheduled_report` automation trigger is retained deliberately.** The original design called for retiring it as a vestigial third caller of `generateReport()`. It is not vestigial: the trigger type is seeded in `20260226234301-public-schema-tables.js:901`, handled by `sendReportNotification()` in `Servers/services/automations/automationWorker.ts:304-428`, and — decisively — created at runtime by the Automations UI (`ConfigurationPanel/index.tsx:665`). Any organization that built a "Scheduled Report" automation has a live row this path serves, and removing it would break them silently with no migration. It duplicates the newer `scheduled_reports` pipeline conceptually, so consolidating them is worthwhile, but that is a migration project with a data-movement story — not a deletion.

### Known MVP Limitations

- Structured `recommendedActions` emission is **scaffolding only** — runs currently render the existing recommendations rather than emitting structured actions.
- A `PATCH` carrying **both** metadata and config performs two un-transacted writes. If the version insert fails, the metadata update is already committed.
- `ScheduledReportUpdateBody` (frontend) omits `frameworkId` and `projectFrameworkId`, which the backend `UPDATABLE_FIELDS` allowlist does accept. The frontend type is a strict subset of the API — harmless today, but it means those two fields cannot be edited from the UI.

### Frontend surface (complete)

The UI half of the templates/schedules/runs stack is wired:

- **`TemplatesTab`** — edit (name, description, category) and archive, over `useUpdateTemplate` / `useArchiveTemplate`. **System templates get neither**: writes match on `organization_id = :org AND is_system_template = false`, so the backend returns 404 for them and the UI omits the buttons rather than offering an action that cannot succeed. They carry a `System` chip so the absence reads as intentional. A 409 surfaces as a duplicate-name message.
- **`ScheduledReportsTab`** — edit (name, format, schedule) and delete, over `useUpdateScheduledReport` / `useDeleteScheduledReport`. Both destructive paths require a confirmation naming the schedule. Edits always send `scheduleConfig`, because `updateScheduledReportQuery` only recomputes `next_run_at` when that key is present.
- **`ArchiveTab`** — server-side pagination over the paginated runs endpoint via `useReportRunsPage`, reusing `StandardTablePagination`. It deliberately does **not** use the `useStandardTable` companion, which slices client-side and would report the current page's length as the total. The empty state keys on `total`, not page length, so paging past the end does not claim there are no runs. Each row opens `ReportAnalysisPanel` in a drawer.
- **`ReportAnalysisPanel`** — presentational (`{analyses, isLoading}`), caller owns `useRunAnalyses`. Renders all seven section keys including `sectionSummaries`, handles a `null` payload (a real runtime case — `runAnalyzers` writes `payload: null` when a section produced nothing) and surfaces `abstain_reason`.

> Every field the panel renders has a verified backend producer. `EvidenceAnalysisPanel` is the cautionary case: it declares `rationales` and `document_signals`, neither of which any code in `Servers/` has ever emitted, so one renders permanently empty and ~85 lines of chip UI gated on the other are unreachable. Do not add a field to this panel without confirming something writes it.

## Related Documentation

- [PDF Generation](../infrastructure/pdf-generation.md)
- [Risk Management](./risk-management.md)
- [Compliance Frameworks](./compliance-frameworks.md)
- [Use Cases](./use-cases.md)
- [Automations & Job Scheduling](../infrastructure/automations.md)
