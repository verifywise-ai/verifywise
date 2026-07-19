# Reporting Domain

> **Last Updated:** 2026-07-19

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

## PDF Generation

### Technology

- **Playwright** (headless Chromium)
- **EJS** templates for HTML rendering

### Template Structure

```
templates/reports/
├── report-pdf.ejs    - Main PDF template
├── report-docx.ejs   - Dead file, not used by any generator (see DOCX Generation below)
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
| GET | `/api/reporting/templates` | List available templates |
| GET | `/api/reporting/templates/:id` | Get a template |
| GET | `/api/reporting/scheduled-reports` | List scheduled reports |
| POST | `/api/reporting/scheduled-reports` | Create a scheduled report |
| POST | `/api/reporting/scheduled-reports/:id/run-now` | Trigger an immediate run |
| POST | `/api/reporting/scheduled-reports/:id/pause` | Pause schedule |
| POST | `/api/reporting/scheduled-reports/:id/resume` | Resume schedule |
| DELETE | `/api/reporting/scheduled-reports/:id` | Delete a scheduled report |
| GET | `/api/reporting/runs` | List report runs |
| GET | `/api/reporting/runs/:id` | Get a run |
| GET | `/api/reporting/runs/:id/download` | Download a run's output (org-scoped) |

### Services

| Service | Responsibility |
|---------|---------------|
| `ReportTemplateResolver` | Resolves a template config into a `ReportGenerationRequest`, then reuses the existing `generateReport`. |
| `reportDeliveryService` | Persists output to storage via `uploadFile`. Email link/attachment delivery is a guarded no-op TODO for MVP. |
| `reportRunOrchestrator` | Drives a run end to end and records terminal status (`success` / `partial_success` / `failed`). |
| `scheduleCalculator` | Computes `next_run` from the cron expression via `cron-parser` (`computeNextRun`). |

### RBAC

| Operation | Access |
|-----------|--------|
| Writes (create/run-now/pause/resume/delete scheduled reports) | Admin / Editor (via `authorize` middleware) |
| Reads (templates, scheduled reports, runs) | Any authenticated user (JWT) |
| Run download | Authenticated + org-scoped |

The existing **Admin-only** manual generate endpoints are preserved.

### Known MVP Limitations

- Email/attachment delivery is **not yet wired** — storage persistence works, but email link/attachment send is a guarded no-op TODO.
- Structured `recommendedActions` emission is **scaffolding only** — runs currently render the existing recommendations rather than emitting structured actions.

## Related Documentation

- [PDF Generation](../infrastructure/pdf-generation.md)
- [Risk Management](./risk-management.md)
- [Compliance Frameworks](./compliance-frameworks.md)
- [Use Cases](./use-cases.md)
- [Automations & Job Scheduling](../infrastructure/automations.md)
