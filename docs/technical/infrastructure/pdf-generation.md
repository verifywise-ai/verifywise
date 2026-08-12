# PDF Generation

## Overview

VerifyWise uses Playwright (headless Chromium) and EJS templates to generate PDF reports. The system also supports DOCX generation using the `docx` library. Reports are generated dynamically based on framework type, project data, and selected sections.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          REPORT GENERATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                       │
│  │   API Request    │  POST /v2/generate-report                             │
│  │   - projectId    │                                                       │
│  │   - reportType   │                                                       │
│  │   - frameworkId  │                                                       │
│  │   - format       │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────┐                                                       │
│  │  Report Service  │                                                       │
│  │  (index.ts)      │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────┐     ┌──────────────────┐                             │
│  │  Data Collector  │────►│  Database        │                             │
│  │  - Metadata      │     │  (Tenant Schema) │                             │
│  │  - Branding      │     └──────────────────┘                             │
│  │  - Section Data  │                                                       │
│  │  - Charts        │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────┐     ┌──────────────────┐                             │
│  │  EJS Template    │────►│  HTML Output     │                             │
│  │  (report-pdf.ejs)│     │  (with CSS)      │                             │
│  └──────────────────┘     └────────┬─────────┘                             │
│                                    │                                        │
│           ┌────────────────────────┴────────────────────────┐              │
│           │                                                  │              │
│           ▼                                                  ▼              │
│  ┌──────────────────┐                              ┌──────────────────┐    │
│  │  PDF Generator   │                              │  DOCX Generator  │    │
│  │  (Playwright)    │                              │  (docx library)  │    │
│  └────────┬─────────┘                              └────────┬─────────┘    │
│           │                                                  │              │
│           ▼                                                  ▼              │
│  ┌──────────────────┐                              ┌──────────────────┐    │
│  │  PDF Buffer      │                              │  DOCX Buffer     │    │
│  └──────────────────┘                              └──────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Report Types

### Available Report Sections

| Section Key | Description | Framework |
|-------------|-------------|-----------|
| `projectRisks` | Use case/project risks | All |
| `vendorRisks` | Vendor risk analysis | All |
| `modelRisks` | AI model risks | All |
| `compliance` | EU AI Act controls | EU AI Act |
| `assessment` | EU AI Act assessment tracker | EU AI Act |
| `clausesAndAnnexes` | ISO clauses and annexes | ISO 42001/27001 |
| `nistSubcategories` | NIST AI RMF subcategories | NIST AI RMF |
| `vendors` | Vendor inventory | All |
| `models` | AI model inventory | All |
| `trainingRegistry` | Training records | All |
| `policyManager` | Policy documents | All |
| `incidentManagement` | Incident tracking | All |
| `all` | Complete report | All |

### Framework-Specific Sections

```typescript
// Sections by framework
const frameworkSections = {
  1: ["compliance", "assessment"],        // EU AI Act
  2: ["clausesAndAnnexes"],               // ISO 42001
  3: ["clausesAndAnnexes"],               // ISO 27001
  4: ["nistSubcategories"],               // NIST AI RMF
};
```

## PDF Generator

### Playwright Configuration

```typescript
// File: Servers/services/reporting/pdfGenerator.ts

import { chromium, Browser, Page } from "playwright";

let browser: Browser | null = null;

const getBrowser = async (): Promise<Browser> => {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
  }
  return browser;
};
```

### PDF Generation

```typescript
export const generatePDF = async (
  reportData: ReportData
): Promise<{ filename: string; content: Buffer }> => {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Render EJS template to HTML
    const html = await ejs.renderFile(
      path.join(__dirname, "../../templates/reports/report-pdf.ejs"),
      reportData
    );

    // Load HTML into page
    await page.setContent(html, { waitUntil: "networkidle" });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "0.75in",
        right: "0.75in",
        bottom: "0.75in",
        left: "0.75in",
      },
    });

    // Generate filename
    const filename = generateFilename(reportData.metadata, "pdf");

    return { filename, content: pdfBuffer };
  } finally {
    await page.close();
  }
};

export const generatePDFWithOptions = async (
  reportData: ReportData,
  options: {
    format?: "A4" | "Letter";
    landscape?: boolean;
    scale?: number;
  }
): Promise<{ filename: string; content: Buffer }> => {
  // Same as above with custom options
};
```

### Filename Generation

```typescript
const generateFilename = (
  metadata: ReportMetadata,
  extension: string
): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const projectTitle = metadata.projectTitle.replace(/[^a-zA-Z0-9]/g, "_");
  const frameworkName = metadata.frameworkName.replace(/[^a-zA-Z0-9]/g, "_");

  return `${projectTitle}_${frameworkName}_${timestamp}.${extension}`;
};
```

## EJS Templates

### Template Location

Templates are in `Servers/templates/reports/`:

| File | Purpose |
|------|---------|
| `report-pdf.ejs` | Main PDF template |
| `report-docx.ejs` | **Dead file.** No generator loads it — `docxGenerator.ts` imports no EJS and builds the document programmatically with the `docx` library. |
| `pmm-report.ejs` | Post-Market Monitoring reports |
| `styles/pdf.css` | PDF styling |
| `styles/docx.css` | DOCX styling |

> Because PDF and DOCX use two unrelated rendering paths, **a new report section must be added in both `report-pdf.ejs` and `docxGenerator.ts`** — editing only the EJS template silently omits the section from every DOCX report.

### Template Structure

```ejs
<!-- report-pdf.ejs -->
<!DOCTYPE html>
<html>
<head>
  <style>
    <%- include('./styles/pdf.css') %>

    :root {
      --color-primary: <%= branding.primaryColor || '#13715B' %>;
    }
  </style>
</head>
<body>
  <!-- Cover Page -->
  <div class="cover-page">
    <% if (branding.logo) { %>
      <img src="<%= branding.logo %>" alt="Organization Logo" />
    <% } else { %>
      <h1 class="org-name"><%= branding.organizationName %></h1>
    <% } %>

    <h1 class="framework-title"><%= metadata.frameworkName %></h1>
    <h2 class="project-title"><%= metadata.projectTitle %></h2>

    <div class="metadata">
      <p><strong>Project:</strong> <%= metadata.projectTitle %></p>
      <p><strong>Owner:</strong> <%= metadata.ownerName %></p>
      <p><strong>Generated:</strong> <%= metadata.generatedDate %></p>
      <p><strong>Prepared by:</strong> <%= metadata.preparedBy %></p>
    </div>
  </div>

  <!-- Table of Contents -->
  <div class="toc page-break">
    <h2>Table of Contents</h2>
    <ol>
      <% if (sections.projectRisks) { %>
        <li>Use Case Risks</li>
      <% } %>
      <% if (sections.vendorRisks) { %>
        <li>Vendor Risks</li>
      <% } %>
      <!-- ... more sections -->
    </ol>
  </div>

  <!-- Risk Analysis Group -->
  <% if (sections.projectRisks) { %>
    <div class="section page-break">
      <h2>Use Case Risks</h2>
      <p>Total Risks: <%= projectRisksData.totalRisks %></p>

      <!-- Risk Distribution Chart -->
      <%- charts.riskDistribution %>

      <!-- Risks Table -->
      <table class="data-table">
        <thead>
          <tr>
            <th>Risk Name</th>
            <th>Owner</th>
            <th>Severity</th>
            <th>Likelihood</th>
            <th>Mitigation Status</th>
            <th>Risk Level</th>
          </tr>
        </thead>
        <tbody>
          <% projectRisksData.risks.forEach(risk => { %>
            <tr>
              <td><%= risk.risk_name %></td>
              <td><%= risk.owner_name %></td>
              <td><span class="chip chip-<%= risk.severityClass %>"><%= risk.severity %></span></td>
              <td><%= risk.likelihood %></td>
              <td><span class="chip chip-<%= risk.statusClass %>"><%= risk.mitigation_status %></span></td>
              <td><span class="chip chip-<%= risk.levelClass %>"><%= risk.risk_level %></span></td>
            </tr>
          <% }) %>
        </tbody>
      </table>
    </div>
  <% } %>

  <!-- More sections... -->

</body>
</html>
```

### CSS Styling

```css
/* Servers/templates/reports/styles/pdf.css */

:root {
  --color-primary: #13715B;
  --color-secondary: #1C2130;
  --color-success: #027A48;
  --color-warning: #B54708;
  --color-error: #B42318;
  --color-info: #026AA2;
}

body {
  font-family: "Inter", -apple-system, sans-serif;
  font-size: 10pt;
  line-height: 1.5;
  color: #1C2130;
}

.cover-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.page-break {
  page-break-before: always;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  margin: 20px 0;
}

.data-table th,
.data-table td {
  border: 1px solid #E4E7EC;
  padding: 8px 12px;
  text-align: left;
}

.data-table th {
  background: #F9FAFB;
  font-weight: 600;
}

.chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 9pt;
  font-weight: 500;
}

.chip-success { background: #ECFDF3; color: #027A48; }
.chip-warning { background: #FFFAEB; color: #B54708; }
.chip-error { background: #FEF3F2; color: #B42318; }
.chip-info { background: #EFF8FF; color: #026AA2; }
```

## Data Collector

### Class Structure

```typescript
// File: Servers/services/reporting/dataCollector.ts

export class ReportDataCollector {
  private projectId: number;
  private frameworkId: number;
  private tenantId: string;
  private userId: number;

  constructor(
    projectId: number,
    frameworkId: number,
    tenantId: string,
    userId: number
  ) {
    this.projectId = projectId;
    this.frameworkId = frameworkId;
    this.tenantId = tenantId;
    this.userId = userId;
  }

  async collectAllData(sections: ReportSections): Promise<ReportData> {
    const metadata = await this.collectMetadata();
    const branding = await this.collectBranding();
    const charts = await this.generateCharts(sections);

    const data: ReportData = {
      metadata,
      branding,
      charts,
      sections,
    };

    // Collect section-specific data
    if (sections.projectRisks) {
      data.projectRisksData = await this.collectProjectRisks();
    }
    if (sections.vendorRisks) {
      data.vendorRisksData = await this.collectVendorRisks();
    }
    if (sections.modelRisks) {
      data.modelRisksData = await this.collectModelRisks();
    }
    // ... more sections

    return data;
  }
}
```

### Data Collection Methods

```typescript
// Metadata collection
async collectMetadata(): Promise<ReportMetadata> {
  const project = await getProjectById(this.projectId, this.tenantId);
  const framework = await getFrameworkById(this.frameworkId);
  const user = await getUserById(this.userId);

  return {
    projectTitle: project.project_title,
    frameworkName: framework.name,
    ownerName: `${project.owner_name} ${project.owner_surname}`,
    generatedDate: new Date().toLocaleDateString(),
    preparedBy: `${user.name} ${user.surname}`,
  };
}

// Branding collection
async collectBranding(): Promise<ReportBranding> {
  const org = await getOrganizationById(this.organizationId);

  return {
    organizationName: org.name,
    logo: org.logo || null,
    primaryColor: "#13715B",  // VerifyWise green
  };
}

// Project risks collection
async collectProjectRisks(): Promise<ProjectRisksData> {
  const risks = await getProjectRisks(this.projectId, this.tenantId);

  return {
    totalRisks: risks.length,
    riskDistribution: this.calculateRiskDistribution(risks),
    risks: risks.map(risk => ({
      ...risk,
      severityClass: this.getSeverityClass(risk.severity),
      statusClass: this.getStatusClass(risk.mitigation_status),
      levelClass: this.getLevelClass(risk.risk_level),
    })),
  };
}
```

## Chart Generation

### SVG Charts

```typescript
// File: Servers/services/reporting/chartUtils.ts

export const generateRiskDistributionChart = (
  distribution: RiskDistribution
): string => {
  const colors = {
    "Very High": "#B42318",
    "High": "#C4320A",
    "Medium": "#B54708",
    "Low": "#027A48",
    "Very Low": "#026AA2",
  };

  const maxCount = Math.max(...Object.values(distribution));
  const barHeight = 24;
  const chartWidth = 400;

  let svg = `<svg width="${chartWidth}" height="${Object.keys(distribution).length * (barHeight + 8)}" xmlns="http://www.w3.org/2000/svg">`;

  let y = 0;
  for (const [level, count] of Object.entries(distribution)) {
    const barWidth = (count / maxCount) * (chartWidth - 100);

    svg += `
      <g transform="translate(0, ${y})">
        <text x="0" y="${barHeight / 2 + 4}" font-size="10">${level}</text>
        <rect x="80" y="0" width="${barWidth}" height="${barHeight}" fill="${colors[level]}" rx="2" />
        <text x="${85 + barWidth}" y="${barHeight / 2 + 4}" font-size="10">${count}</text>
      </g>
    `;
    y += barHeight + 8;
  }

  svg += "</svg>";
  return svg;
};

export const generateComplianceProgressChart = (
  completed: number,
  total: number
): string => {
  const percentage = Math.round((completed / total) * 100);
  const width = 200;
  const height = 20;

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#E4E7EC" rx="4" />
      <rect x="0" y="0" width="${(percentage / 100) * width}" height="${height}" fill="#13715B" rx="4" />
      <text x="${width / 2}" y="${height / 2 + 4}" text-anchor="middle" font-size="10" fill="white">${percentage}%</text>
    </svg>
  `;
};
```

## DOCX Generator

### Using docx Library

```typescript
// File: Servers/services/reporting/docxGenerator.ts

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  PageBreak,
} from "docx";

export const generateDOCX = async (
  reportData: ReportData
): Promise<{ filename: string; content: Buffer }> => {
  const doc = new Document({
    sections: [
      {
        children: [
          // Cover page
          new Paragraph({
            children: [
              new TextRun({
                text: reportData.branding.organizationName,
                size: 48,
                bold: true,
              }),
            ],
            alignment: "center",
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: reportData.metadata.frameworkName,
                size: 36,
              }),
            ],
            alignment: "center",
          }),
          new PageBreak(),

          // Table of Contents
          new Paragraph({
            text: "Table of Contents",
            heading: HeadingLevel.HEADING_1,
          }),
          // ... TOC entries

          // Sections
          ...generateSections(reportData),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = generateFilename(reportData.metadata, "docx");

  return { filename, content: buffer };
};

const generateSections = (reportData: ReportData): Paragraph[] => {
  const sections: Paragraph[] = [];

  if (reportData.sections.projectRisks) {
    sections.push(
      new PageBreak(),
      new Paragraph({
        text: "Use Case Risks",
        heading: HeadingLevel.HEADING_1,
      }),
      // Risk table
      generateRisksTable(reportData.projectRisksData.risks)
    );
  }

  // ... more sections

  return sections;
};
```

## API Endpoints

### Routes

```typescript
// File: Servers/routes/reporting.route.ts

router.post(
  "/v2/generate-report",
  authenticateJWT,
  validateReportRequest,
  generateReportsV2
);

router.get(
  "/generate-report",
  authenticateJWT,
  getAllGeneratedReports
);

router.delete(
  "/:id",
  authenticateJWT,
  deleteGeneratedReportById
);
```

### Controller

```typescript
// File: Servers/controllers/reporting.ctrl.ts

export const generateReportsV2 = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { projectId, reportType, frameworkId, format, reportName } = req.body;
    const { userId, tenantId, organizationId } = req;

    // Get organization for branding
    const org = await getOrganizationById(organizationId);

    // Generate report
    const result = await generateReport(
      {
        projectId,
        reportType,
        frameworkId,
        format: format || "pdf",
        reportName,
        branding: {
          organizationName: org.name,
          logo: org.logo,
        },
      },
      userId,
      tenantId
    );

    if (!result.success) {
      return res.status(500).json({ message: result.error });
    }

    // Upload to file storage
    await uploadFile(result.content, result.filename, tenantId);

    // Send response
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`
    );
    res.send(result.content);
  } catch (error) {
    console.error("Report generation failed:", error);
    res.status(500).json({ message: "Report generation failed" });
  }
};
```

### Request/Response

**Request:**
```typescript
POST /api/v2/generate-report
Content-Type: application/json

{
  "projectId": 1,
  "reportType": ["projectRisks", "vendorRisks"],  // or "all"
  "frameworkId": 1,
  "projectFrameworkId": 1,
  "format": "pdf",  // or "docx"
  "reportName": "Q1 Compliance Report"  // optional
}
```

**Response:**
```
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="MyProject_EU-AI-Act_2024-01-15.pdf"

<binary PDF content>
```

## Risk Level Colors

```typescript
const RISK_COLORS = {
  "Critical": "#B42318",    // Red
  "Very High": "#B42318",   // Red
  "High": "#C4320A",        // Orange
  "Medium": "#B54708",      // Brown
  "Low": "#027A48",         // Green
  "Very Low": "#026AA2",    // Blue
};
```

## Environment Variables

```env
# Optional: Custom Chromium path for Playwright
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

## Cleanup

```typescript
// Call on server shutdown
import { cleanup } from "./services/reporting";

process.on("SIGTERM", async () => {
  await cleanup();  // Closes Playwright browser
  process.exit(0);
});
```

## Key Files

| File | Purpose |
|------|---------|
| `Servers/services/reporting/index.ts` | Main report service |
| `Servers/services/reporting/pdfGenerator.ts` | Playwright PDF generation |
| `Servers/services/reporting/docxGenerator.ts` | DOCX generation |
| `Servers/services/reporting/dataCollector.ts` | Data collection logic |
| `Servers/services/reporting/chartUtils.ts` | SVG chart generation |
| `Servers/templates/reports/report-pdf.ejs` | PDF template |
| `Servers/templates/reports/styles/pdf.css` | PDF styling |
| `Servers/controllers/reporting.ctrl.ts` | API controller |
| `Servers/routes/reporting.route.ts` | API routes |

## Related Documentation

- [Architecture Overview](../architecture/overview.md)
- [File Storage](./file-storage.md)
- [Automations](./automations.md)
