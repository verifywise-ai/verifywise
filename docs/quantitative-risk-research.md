# Quantitative Risk Assessment — Feature Research Summary

> Research date: 2026-03-17
> Purpose: Documentation reference for user guide authoring

---

## 1. Enabling the Feature

**Path:** Settings > Features

The feature is an organization-level toggle called "Quantitative Risk Assessment." Only users with the Admin role can toggle it. When enabled, the description reads: "Enabled — risks include FAIR-based monetary estimates (ALE, residual risk, ROI)." When disabled: "Disabled — risks use qualitative scoring only (severity, likelihood)."

The setting is stored as `risk_assessment_mode` on the organization record, with two possible values: `qualitative` (default) or `quantitative`. The API endpoints are:
- `GET /api/quantitative-risks/assessment-mode` — read current mode
- `PUT /api/quantitative-risks/assessment-mode` — update mode (body: `{ mode: "quantitative" }`)

Non-admin users see an italic note: "Only admins can change this setting."

---

## 2. What Changes When Enabled

When `isQuantitative` is true, the Add/Edit Risk form gains a third tab called **"Quantitative"** (alongside the existing "Risks" and "Mitigation" tabs). All quantitative FAIR fields are submitted alongside qualitative risk data when saving. The main dashboard also gains a conditional row of three portfolio cards.

---

## 3. The Quantitative Tab — Full Form Structure

The form is rendered by `QuantitativeRiskForm` and contains these sections in order:

### 3a. Risk Exposure Summary (ALESummaryCard)
Positioned at the top for visibility. A live-updating card that recalculates on every keystroke. Shows four metrics:

| Metric | Description |
|--------|-------------|
| **Total Loss (PERT)** | Sum of PERT estimates across all four loss categories |
| **Annualized Loss (ALE)** | PERT(frequency) x Total Loss |
| **Residual ALE** | ALE after controls are applied |
| **ROI** | Return on investment of mitigation spend |

Before any data is entered, shows a dashed-border placeholder: "Enter frequency and loss values to see the ALE calculation."

ROI is color-coded: green when positive, red when negative.

### 3b. Benchmark Selector (BenchmarkSelector)
**Section title:** "Start from industry benchmark"
**Description:** "Optionally select an industry benchmark to pre-fill frequency and loss values. You can adjust them after applying."

An Autocomplete dropdown that:
- Loads all benchmarks from `GET /api/risk-benchmarks`
- Groups options by **industry**
- Each option displays: `{category} ({ai_risk_type})` with the regulation shown below
- Selecting a benchmark auto-fills all 15 frequency and loss fields (5 rows x 3 estimates)
- Values can be freely edited after applying

### 3c. Event Frequency (annualized)
**Section title:** "Event Frequency (annualized)"
**Description:** "How often is this risk event expected to occur per year? Use three-point estimates (min / most likely / max)."

One three-point row:
- **Frequency (times per year)**: Min | Most likely | Max

### 3d. Loss Magnitude ($)
**Section title:** "Loss Magnitude ($)"
**Description:** "Estimate the monetary impact per occurrence across four loss categories."

Four three-point rows:
1. **Regulatory fines**: Min | Most likely | Max
2. **Operational costs**: Min | Most likely | Max
3. **Litigation costs**: Min | Most likely | Max
4. **Reputational damage**: Min | Most likely | Max

### 3e. Mitigation & ROI (MitigationROI)
**Section title:** "Mitigation & ROI"
**Description:** "Estimate how effective your controls are and the annual cost of mitigation to calculate return on investment."

Two controls:
1. **Control effectiveness** — a slider from 0% ("No control") to 100% ("Full control"), with 1% step increments. Current value displayed to the right of the label.
2. **Annual mitigation cost ($)** — a numeric text input (placeholder: "e.g. 50000"). Width: 323px.

---

## 4. FAIR Calculation Formulas

All formulas are in `Clients/src/presentation/tools/fairCalculator.ts` and mirror the backend `computeDerivedFields()`.

### PERT Weighted Average
```
PERT = (min + 4 * likely + max) / 6
```
Applied to event frequency and each of the four loss categories.

### Total Loss
```
Total Loss = PERT(regulatory) + PERT(operational) + PERT(litigation) + PERT(reputational)
```
Only categories with complete min/likely/max values are included.

### Annualized Loss Expectancy (ALE)
```
ALE = PERT(event_frequency) x Total Loss
```
Requires both frequency and at least one loss category to be complete.

### Residual ALE
```
Residual ALE = ALE x (1 - control_effectiveness / 100)
```
If control effectiveness is not set, Residual ALE equals ALE (no reduction).

### Return on Investment (ROI)
```
ROI = ((ALE - Residual ALE) - mitigation_cost_annual) / mitigation_cost_annual x 100
```
Returns null if mitigation cost is zero or not set. Result is a percentage.

---

## 5. Industry Benchmarks — Complete List

20 benchmarks are seeded, organized by category. Source: `Servers/database/migrations/20260309200012-seed-risk-benchmarks.js`

### Categories and Industries

| # | Category | Industry | AI Risk Type | Regulation |
|---|----------|----------|--------------|------------|
| 1 | EU AI Act - Prohibited Practice | Cross-Industry | Non-Compliance | EU AI Act |
| 2 | EU AI Act - High-Risk System | Cross-Industry | Non-Compliance | EU AI Act |
| 3 | AI Hiring Bias | Technology | Bias & Discrimination | EU AI Act / EEOC |
| 4 | AI Lending Bias | Financial Services | Bias & Discrimination | ECOA / EU AI Act |
| 5 | AI Diagnostic Bias | Healthcare | Bias & Discrimination | EU AI Act / FDA |
| 6 | AI Training Data Privacy Breach | Technology | Privacy Violation | GDPR |
| 7 | Healthcare AI Data Breach | Healthcare | Privacy Violation | HIPAA |
| 8 | Financial AI Data Breach | Financial Services | Privacy Violation | GDPR / GLBA |
| 9 | AI Model Failure - Critical Decision | Financial Services | Model Failure | SR 11-7 / EU AI Act |
| 10 | AI Model Failure - Healthcare Diagnosis | Healthcare | Model Failure | FDA / EU MDR |
| 11 | Autonomous System Failure | Automotive & Transport | Model Failure | EU AI Act / NHTSA |
| 12 | AI Model Adversarial Attack | Technology | Security Breach | EU AI Act / NIS2 |
| 13 | AI Supply Chain Compromise | Technology | Security Breach | EU AI Act / NIS2 |
| 14 | AI Transparency Failure | Financial Services | Lack of Transparency | EU AI Act / ECOA |
| 15 | AI Transparency Failure | Government | Lack of Transparency | EU AI Act |
| 16 | AI-Generated IP Infringement | Technology | IP Violation | Copyright law / EU AI Act |
| 17 | Insufficient Human Oversight | Cross-Industry | Governance Failure | EU AI Act |
| 18 | AI Training Data Quality Failure | Cross-Industry | Data Quality | EU AI Act |
| 19 | Deepfake / Synthetic Media Misuse | Cross-Industry | Synthetic Media | EU AI Act |

### Unique Industries (6)
- Cross-Industry
- Technology
- Financial Services
- Healthcare
- Automotive & Transport
- Government

### Unique AI Risk Types (9)
- Non-Compliance
- Bias & Discrimination
- Privacy Violation
- Model Failure
- Security Breach
- Lack of Transparency
- IP Violation
- Governance Failure
- Data Quality
- Synthetic Media

### Benchmark Data Points
Each benchmark provides three-point estimates (min/likely/max) for:
- Event frequency (annualized occurrences)
- Regulatory fines
- Operational costs
- Litigation costs
- Reputational damage

Plus metadata: source citation and explanatory notes.

---

## 6. Standards Mapping

Based on benchmark sources and regulation fields:

### EU AI Act
- **Article 9**: Risk management system (continuous risk assessment)
- **Article 10**: Data governance requirements
- **Article 12**: Record-keeping / audit trails
- **Article 14**: Human oversight
- **Article 15**: Accuracy, robustness, cybersecurity
- **Article 26**: Deployer obligations
- **Article 50**: Transparency for synthetic media
- **Article 99**: Penalties (up to 7% global turnover / EUR 35M for prohibited practices; up to 3% / EUR 15M for high-risk non-compliance)
- **Annex III**: High-risk AI system classification

### ISO 42001
- **Clause 8.2**: AI risk assessment
- **A.2**: AI system impact assessment
- **A.3**: AI system design considerations
- **A.7**: Data management
- **A.8**: AI system operation
- **A.10**: Third-party relationships

### NIST AI RMF
- Referenced through MITRE ATLAS threat framework and NIST AI 100-2 adversarial ML taxonomy

### Other Regulations Referenced
- GDPR (data privacy, up to 4% global turnover)
- HIPAA (healthcare data breach)
- ECOA (fair lending)
- GLBA (financial privacy)
- SR 11-7 (Fed/OCC model risk management)
- FDA SaMD (software as medical device)
- EU MDR (medical device regulation)
- NIS2 (network/information security)
- NHTSA (automotive safety)
- NYC Local Law 144 (automated employment decisions)

---

## 7. Dashboard Integration

When quantitative mode is enabled and the portfolio has at least one quantified risk (`portfolio.risk_count > 0`), the main dashboard shows an additional row of three cards in a 3-column grid:

### Card 1: "AI portfolio exposure" (PortfolioExposureCard)
Links to `/risk-management`. Displays:
- **Total AI portfolio exposure** — large centered figure (the total ALE across all risks)
- **Residual exposure** — total residual ALE after controls
- **Risk reduction** — dollar amount and percentage saved
- **Mitigation cost** — total annual mitigation spend
- **Overall ROI** — aggregate ROI percentage (green if positive)
- Footer: "Based on N quantified risks"

Currency formatting: values >= $1M shown as "$X.XM", >= $1K as "$XK".

### Card 2: "Exposure trend (90 days)" (PortfolioTrendChart)
A line chart (Recharts VWLineChart) with two series:
- **Total ALE** — red/critical color
- **Residual ALE** — medium/amber color
X-axis: date labels (M/D format). Data comes from portfolio snapshots over the last 90 days.

### Card 3: "Loss category breakdown" (LossCategoryBreakdown)
A stacked horizontal bar chart + legend showing the four loss categories:
- **Regulatory** — red (#DC2626)
- **Operational** — amber (#F59E0B)
- **Litigation** — blue (#3B82F6)
- **Reputational** — purple (#8B5CF6)

Each shows dollar value and percentage of total.

---

## 8. Portfolio Data Model

### IPortfolioSummary (org or project level)
- `total_ale` — sum of ALE across all quantified risks
- `total_residual_ale` — sum of residual ALE
- `total_mitigation_cost` — sum of mitigation costs
- `risk_count` — number of risks with quantitative data
- `risk_reduction` — total ALE minus total residual ALE
- `overall_roi` — aggregate ROI percentage
- `loss_regulatory` — total regulatory loss component
- `loss_operational` — total operational loss component
- `loss_litigation` — total litigation loss component
- `loss_reputational` — total reputational loss component

### IPortfolioSnapshot (trend tracking)
- `organization_id`, `project_id` (optional)
- `total_ale`, `total_residual_ale`, `total_mitigation_cost`
- `risk_count`, `snapshot_date`

---

## 9. API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/quantitative-risks/assessment-mode` | Get current mode |
| PUT | `/api/quantitative-risks/assessment-mode` | Toggle mode |
| GET | `/api/risk-benchmarks` | List all benchmarks (optional ?industry, ?ai_risk_type filters) |
| GET | `/api/risk-benchmarks/:id` | Get single benchmark |
| GET | `/api/risk-benchmarks/filters` | Get available filter options |
| POST | `/api/quantitative-risks/:riskId/apply-benchmark/:benchmarkId` | Apply benchmark to existing risk |
| GET | `/api/quantitative-risks/portfolio/org` | Org-level portfolio summary |
| GET | `/api/quantitative-risks/portfolio/project/:projectId` | Project-level portfolio summary |
| GET | `/api/quantitative-risks/portfolio/trend` | Portfolio snapshots (?days, ?projectId) |

---

## 10. Full User Workflow

1. **Admin enables feature:** Settings > Features > toggle "Quantitative Risk Assessment" on
2. **User creates/edits a risk:** Opens Add New Risk form > clicks the "Quantitative" tab
3. **(Optional) Select benchmark:** User picks an industry benchmark from the dropdown to pre-fill values
4. **Enter/adjust frequency:** User provides min/likely/max for how often the risk event occurs per year
5. **Enter/adjust loss estimates:** User fills in min/likely/max for each of four loss categories (regulatory, operational, litigation, reputational)
6. **See live ALE:** The Risk Exposure Summary card at the top updates in real-time showing Total Loss, ALE, Residual ALE, and ROI
7. **Set controls:** User adjusts the control effectiveness slider (0-100%) and enters annual mitigation cost
8. **Save risk:** Quantitative fields are submitted alongside qualitative risk data
9. **View portfolio on dashboard:** The main dashboard shows three portfolio cards (exposure, trend, breakdown) aggregating all quantified risks
10. **Track over time:** Portfolio snapshots accumulate, enabling the 90-day exposure trend chart

---

## 11. Key Source Files

| File | Purpose |
|------|---------|
| `Clients/src/presentation/pages/SettingsPage/Features/index.tsx` | Feature toggle UI |
| `Clients/src/presentation/components/QuantitativeRiskForm/index.tsx` | Main form container |
| `Clients/src/presentation/components/QuantitativeRiskForm/BenchmarkSelector.tsx` | Benchmark dropdown |
| `Clients/src/presentation/components/QuantitativeRiskForm/MitigationROI.tsx` | Slider + cost input |
| `Clients/src/presentation/components/QuantitativeRiskForm/ALESummaryCard.tsx` | Live summary card |
| `Clients/src/presentation/tools/fairCalculator.ts` | FAIR calculation formulas |
| `Clients/src/domain/interfaces/i.quantitativeRisk.ts` | TypeScript interfaces |
| `Clients/src/domain/enums/riskAssessmentMode.enum.ts` | Mode enum |
| `Clients/src/application/hooks/useRiskAssessmentMode.ts` | Mode toggle hook |
| `Clients/src/application/hooks/useQuantitativeRisk.ts` | Benchmark + portfolio hooks |
| `Clients/src/application/repository/quantitativeRisk.repository.ts` | API client calls |
| `Clients/src/presentation/components/AddNewRiskForm/index.tsx` | Tab integration |
| `Clients/src/presentation/pages/DashboardOverview/IntegratedDashboard.tsx` | Dashboard integration |
| `Clients/src/presentation/components/Charts/PortfolioExposureCard.tsx` | Portfolio exposure card |
| `Clients/src/presentation/components/Charts/PortfolioTrendChart.tsx` | Trend line chart |
| `Clients/src/presentation/components/Charts/LossCategoryBreakdown.tsx` | Loss category bar chart |
| `Servers/database/migrations/20260309200012-seed-risk-benchmarks.js` | Benchmark seed data |
| `Servers/database/migrations/20260309195549-add-quantitative-risk-fields.js` | DB migration |
| `Servers/controllers/quantitativeRisk.ctrl.ts` | Backend controller |
