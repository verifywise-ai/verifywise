# Bias Audit — Enterprise Credibility Upgrade Plan

**Date:** 2026-04-10
**Owner:** Backend (EvalServer) + Frontend (Clients)
**Estimated effort:** ~3 weeks of focused work
**Status:** Approved approach, implementation pending

---

## Goal

Move the bias audit feature from "a 4/5ths rule calculator" to "a tool an enterprise procurement team will accept as their NYC Local Law 144 compliance evidence and a credible bias audit for scoring models."

This plan is **not** about matching BABL AI's professional-services engagement model. It's about giving the tool enough mathematical breadth, output quality, and LL144 workflow coverage that the output is defensible on its own.

---

## Scope

### In scope
1. **Math breadth** — scoring rate, confusion-matrix fairness metrics, score distributions
2. **Formal PDF report** — self-contained audit artifact a reader can understand without the app
3. **LL144 workflow layer** — audit package with public summary snippet, candidate notice template, annual renewal reminder, independence declaration

### Out of scope (explicitly)
- ❌ ISAE 3000 framing / formal assurance language
- ❌ Attestation vs direct engagement distinction
- ❌ Governance pillar tracking (lives in ISO 42001 module)
- ❌ Bias mitigation recommendation engine (high legal liability)
- ❌ Third-party auditor workflow (they can use the tool, we don't market to them specifically)

---

## Workstream 1 — Math breadth

### 1.1 Scoring rate metric

**Why:** LL144 explicitly permits impact ratio derived from "scoring rate" (rate at which a group scores above the overall median) as an alternative to selection rate. Tools that output continuous scores rather than binary hire/reject can't use the current audit.

**Changes:**

- `EvalServer/src/engines/bias_audit/dataset_parser.py`
  - Add a new optional column: `score` (numeric, continuous)
  - Accept either `outcome` column (binary) OR `score` column (numeric) OR both
  - New function: `parse_csv_dataset_with_score()` or refactor existing one to return both `selected: bool` and `score: Optional[float]`

- `EvalServer/src/engines/bias_audit/engine.py`
  - New function `_compute_scoring_rate_table(records, category_key, median_score, threshold, small_sample_exclusion)` modeled on `_compute_category_table()`
  - `compute_bias_audit()` dispatches based on `config.metric` field: `selection_rate` (default) or `scoring_rate`
  - Compute the overall median once, then per-group rate is `count(score > median) / count(group)`

- `EvalServer/src/engines/bias_audit/models.py`
  - Add `metric: Literal["selection_rate", "scoring_rate"] = "selection_rate"` to `BiasAuditConfig`
  - Add `score: Optional[float]` to parsed record type

- Presets: add `"metric": "selection_rate"` explicitly to all 10 preset JSON files in `EvalServer/src/presets/bias_audits/`. No behavioral change; makes the field explicit.

- Frontend (`Clients/src/infrastructure/api/biasAuditService.ts` + the config UI): add a metric toggle (Selection rate / Scoring rate). When scoring rate is picked, the column mapping step asks for a "score column" instead of an "outcome column."

**Effort:** 1–2 days

---

### 1.2 Confusion-matrix fairness metrics

**Why:** For any model that outputs predictions, buyers increasingly want TPR/FPR/equalized odds/equal opportunity — these are what actually indicate harm for a classifier, not selection rate alone.

**Changes:**

- `EvalServer/src/engines/bias_audit/dataset_parser.py`
  - New parsing mode that accepts **both** a `prediction` column and a `ground_truth` column (separate from `outcome` which is the "what the tool did")
  - Support binary predictions and ground truth with the same VALID_TRUE/VALID_FALSE recognition

- `EvalServer/src/engines/bias_audit/engine.py`
  - New functions:
    - `_compute_confusion_matrix(records, group)` → returns (tp, fp, tn, fn)
    - `_compute_fairness_metrics(records, category_key, threshold)` → per group: TPR, FPR, FNR, TNR, precision, accuracy
    - Cross-group metrics: **equal opportunity difference** (max TPR - min TPR), **equalized odds difference** (max across TPR and FPR gaps), **predictive parity difference** (max precision gap)
  - Add new result models:
    - `ConfusionMatrixGroupResult` — per-group TPR/FPR/FNR/precision/accuracy
    - `FairnessMetricsSummary` — cross-group differences + which groups set the min/max
  - `compute_bias_audit()` dispatches a third mode: `metric="fairness_metrics"` when predictions + ground_truth are supplied

- `EvalServer/src/engines/bias_audit/models.py`
  - Extend `BiasAuditConfig`:
    - `metric: Literal["selection_rate", "scoring_rate", "fairness_metrics"] = "selection_rate"`
    - `prediction_column: Optional[str]`
    - `ground_truth_column: Optional[str]`

- Database: the existing `llm_evals_bias_audit_results` flat table is built for `GroupResult` (applicant_count, selected_count, etc.). Add nullable columns for the new metrics, or (cleaner) rely on the `results` JSONB in `llm_evals_bias_audits` for confusion-matrix output and only populate the flat table for the selection/scoring rate case. **Recommendation:** keep the flat table as-is, put new metrics in JSONB only. New migration not needed.

- Frontend: metric toggle adds a third option "Fairness metrics (predictions + ground truth)". Column mapping UI asks for prediction column + ground truth column in that mode. New result view renders the confusion-matrix-per-group table and the cross-group difference summary.

**Effort:** ~1 week

---

### 1.3 Score distribution view

**Why:** BABL lists score distributions across demographic groups as a valid bias signal. Even without computing a metric, showing the histograms is diagnostic.

**Changes:**

- `EvalServer/src/engines/bias_audit/engine.py`
  - New function `_compute_score_distribution(records, category_key, bins=20)` → per-group histogram bins + count
  - Also compute **Kolmogorov-Smirnov test** between each group and the overall distribution (SciPy is likely already a dep in EvalServer; verify). Report the D statistic and p-value per group.
  - Only runs when `score` column is present

- Result model: `ScoreDistributionTable` with per-group `bins[]`, `counts[]`, `ks_statistic`, `ks_pvalue`

- Frontend: new result tab "Score distributions" that renders histograms per group (Recharts, already in use) with the K-S p-value annotated

**Effort:** 1–2 days

---

## Workstream 2 — Formal PDF report

### 2.1 Report generator

**Why:** The single biggest credibility move. A buyer who receives a self-contained PDF doesn't need to log into the app to verify the numbers. It's also what LL144 "summary of results" posting can link to.

**Decision: server-side generation.** `jsPDF` is already in Clients' `package.json` but client-side PDF generation has poor typography, struggles with charts, and means the report can only be produced when a user is viewing the page. The audit is already async server-side; the report should be too.

**Python options:**
- **WeasyPrint** — HTML+CSS to PDF, best typography. Adds a system dependency (cairo, pango). Medium weight.
- **ReportLab** — pure Python, lower-level API. Verbose but no system deps.
- **Recommendation:** WeasyPrint. The report is a formal document; typography matters. Use a Jinja2 HTML template + CSS.

**Changes:**

- Add `weasyprint` and `jinja2` to `EvalServer/requirements.txt`
- New module: `EvalServer/src/engines/bias_audit/report_generator.py`
  - Function `generate_pdf_report(audit_id: str, result: BiasAuditResult, metadata: AuditMetadata) -> bytes`
  - Loads HTML template, renders with Jinja2, pipes through WeasyPrint
- New Jinja2 template: `EvalServer/src/templates/bias_audit_report.html`
- New CSS: `EvalServer/src/templates/bias_audit_report.css`

**Report sections (fixed structure):**

1. **Cover page**
   - Tool name (captured from new field — see 2.2), version, audit date
   - Auditor name + role + independence declaration
   - Scope: "Audit performed for compliance with [preset name]"
   - VerifyWise logo (optional — treat as internal compliance evidence, not a marketing piece)

2. **Executive summary**
   - Total applicants, total selected (or scored), overall rate
   - Number of categories audited, number of flags raised
   - One-paragraph plain-English summary

3. **System description** (captured from new fields — see 2.2)
   - What does the tool do
   - What decision does it inform
   - Deployment context

4. **Data description**
   - Source, size, date range
   - Demographic category breakdown with counts
   - Missing data handling (unknown_count, excluded groups and why)

5. **Methodology**
   - Metric chosen (selection rate / scoring rate / fairness metrics) and one-sentence rationale
   - 4/5ths rule explained in plain English with EEOC citation
   - Small-sample exclusion rule and threshold
   - Intersectional analysis explanation if applicable

6. **Results**
   - All category tables (sex, race/ethnicity, intersectional)
   - Each row: group, count, rate, impact ratio, flag status
   - Flags explained individually: "Group X has impact ratio 0.72 (below 0.80 threshold). This indicates selection rate is 72% of the highest-selected group." — plain English, not jargon

7. **Conclusion & limitations**
   - What the audit does NOT show (causation, compliance with other jurisdictions, etc.)
   - Recommendations: **none** — just "consult qualified counsel for interpretation"

8. **Appendix**
   - Raw per-group numbers
   - Preset config JSON
   - CSV column mapping used

- New API endpoint: `GET /bias-audits/{id}/report.pdf` — streams the generated PDF. Generation is synchronous (the audit compute is already done; PDF generation is ~2s). Caches on disk by audit_id.

- Frontend: "Download PDF report" button on the audit results view.

**Effort:** 3–5 days

---

### 2.2 Audit metadata capture

**Why:** The PDF needs fields that don't exist in the current schema: system description, auditor identity, independence declaration, version.

**Changes:**

- New Alembic migration: add columns to `llm_evals_bias_audits`:
  - `system_name` TEXT
  - `system_version` TEXT
  - `system_description` TEXT
  - `auditor_name` TEXT
  - `auditor_role` TEXT
  - `auditor_independence` TEXT — enum: `self`, `internal`, `third_party`
  - `deployment_context` TEXT
  - `data_source` TEXT
  - `data_date_range_start` DATE
  - `data_date_range_end` DATE

- `EvalServer/src/engines/bias_audit/models.py` — extend `BiasAuditConfig` with these fields (all optional, captured in the run request)

- Frontend: new step in the audit creation flow BEFORE column mapping — "About this audit." Form fields for all of the above. Can be skipped; fields render as "(not provided)" in the PDF.

**Effort:** 1 day

---

## Workstream 3 — LL144 workflow layer

### 3.1 LL144 audit package mode

**Why:** LL144 requires deployers to post a public summary of results in a specific format. Today a user running the audit gets the numbers but then has to manually assemble what to paste on their careers page. We should generate the HTML snippet.

**Changes:**

- `EvalServer/src/engines/bias_audit/report_generator.py`
  - New function `generate_ll144_summary_html(audit_id, result, metadata) -> str`
  - Returns a standalone HTML snippet meeting LL144 posting requirements:
    - Date of most recent bias audit
    - Date of distribution of AEDT (captured as new optional field)
    - Selection/scoring rate per EEO category
    - Impact ratio per category
    - Notice that candidates can request alternative process
  - Template: `EvalServer/src/templates/ll144_summary.html`

- New endpoint: `GET /bias-audits/{id}/ll144-summary.html`

- Frontend: when preset is `nyc_ll144`, show a "Download LL144 public summary" button on the results view alongside the PDF download. Also generate the candidate notice template text (static template, just renders the tool name and the 10-business-day notice language).

**Effort:** 1–2 days

---

### 3.2 Annual renewal tracking

**Why:** LL144 requires the audit to be within one year of use. A deployer running the tool annually needs a reminder.

**Changes:**

- Extend the existing bias audit list view to show "Last audit: X days ago" per preset. When > 335 days (30-day warning window), highlight in amber. When > 365, highlight in red.
- Use existing notification system (backend already has scheduled notifications via BullMQ per project memory) to send an in-app notification at 30 days before expiry and on the expiry date. Check `Servers/services/automations/` for where to wire this in.
- No new database columns needed — compute from existing `created_at`.

**Effort:** 2–3 days (most of it is wiring into the existing notification system)

---

### 3.3 Independence declaration capture

Already covered in 2.2 (`auditor_independence` field). No additional work here beyond making sure the PDF renders it prominently on the cover page.

---

## Workstream 4 — Tests & documentation

### 4.1 Unit tests

- `EvalServer/tests/test_bias_audit_engine.py` (or wherever existing tests live; verify):
  - Test scoring rate with fixture CSVs
  - Test fairness metrics with known confusion matrices
  - Test score distribution with a synthetic distribution and a known K-S result
  - Regression tests for existing selection rate to make sure the dispatch logic doesn't break it

### 4.2 Integration test

- One end-to-end test: upload a known CSV, run the audit, fetch the PDF, assert the PDF is a valid PDF with expected text content (use `pypdf` for text extraction).

### 4.3 Documentation

- Update `docs/technical/domains/` with a new `bias-audit.md` documenting the three metric modes and the LL144 flow.
- Update user guide content under `shared/user-guide-content/` per the documentation workflow in project memory.

**Effort:** 2 days

---

## Timeline

| Week | Workstream | Items |
|---|---|---|
| Week 1 | Math breadth | 1.1 (scoring rate), 1.2 (fairness metrics), 1.3 (score distributions) |
| Week 2 | Report + metadata | 2.1 (PDF generator), 2.2 (metadata capture) |
| Week 3 | LL144 workflow + tests | 3.1, 3.2, 4.1, 4.2, 4.3 |

---

## Success criteria

- [ ] A user can upload a CSV with a `score` column and get a scoring rate audit
- [ ] A user can upload a CSV with `prediction` + `ground_truth` columns and get fairness metrics with equalized odds and equal opportunity differences
- [ ] A user can download a PDF report that is self-contained and readable without access to the app
- [ ] The PDF includes system description, auditor identity, methodology rationale, and all result tables
- [ ] For NYC LL144 preset, the user can also download a public summary HTML snippet that matches LL144 posting requirements
- [ ] Audits older than 335 days surface a renewal warning in the list view
- [ ] All new code has unit tests; integration test covers CSV-to-PDF end-to-end

---

## Non-goals for this plan

- Marketing positioning (how we talk about credibility publicly — separate discussion)
- Expanding preset coverage to new jurisdictions (separate effort)
- Integrating with a professional auditor network (out of scope)
- Mitigation recommendations (out of scope, legal liability)

---

## Open questions

1. **Score distribution K-S test vs Mann-Whitney U** — K-S is distribution-shape-sensitive; MWU is rank-based. For the initial ship, K-S is fine; flag as future work if reviewers disagree.
2. **PDF generation: WeasyPrint or ReportLab?** — Plan defaults to WeasyPrint for typography. If the cairo/pango system dependency is a problem in the EvalServer Docker image, fall back to ReportLab.
3. **Who captures the "data date range"?** — Proposed as optional metadata. If users consistently skip it, the PDF will say "not provided." Acceptable for v1.
4. **Independence declaration enforcement** — Should we block audits marked `self` from being exported as a "formal" PDF? Proposed: no, but the PDF cover page says "Self-declared audit; no third-party independence" prominently when that's the mode. Buyer can decide how to weight it.
