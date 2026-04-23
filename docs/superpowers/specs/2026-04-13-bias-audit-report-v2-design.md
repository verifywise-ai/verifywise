# Bias Audit PDF Report v2 — Design Spec

> Date: 2026-04-13

## Problem

The current bias audit PDF report is data-heavy but lacks interpretation. A reader can't tell at a glance whether the results are good or bad, what to do next, or what the law actually requires. The report reads like a raw data dump rather than an actionable compliance artifact.

## User feedback

1. No overall verdict — "where am I on the spectrum of passed vs. horrible?"
2. No call to actions — "what should I do next?"
3. No VerifyWise branding (logo)
4. Flagged rows lack explanation — "flagged because it's high or low?"
5. No regulatory context — what does LL144 actually require?
6. No charts or visual data representation
7. Conclusion is generic caveats, not actual findings

## Solution

Enhance `report_generator.py` to produce a professional, self-explanatory report that tells the reader: what was tested, whether it passed, what the numbers mean, and what to do next.

## Report structure (in order)

### 1. Cover page (enhanced)

- VerifyWise logo top-left (use `EvalServer/src/utils/verifywise_logo.png`)
- Title, system name, compliance framework, metric, audit date, auditor info
- Self-declared audit warning (existing, keep as-is)

### 2. Overall assessment (NEW)

A colored verdict table immediately after the cover metadata:

| Dimension | Verdict | Condition |
|---|---|---|
| Disparate impact | Green: "No adverse impact detected" | All impact ratios >= 0.80 |
| Disparate impact | Amber: "Adverse impact detected — review recommended" | 1+ flags, all ratios >= 0.50 |
| Disparate impact | Red: "Significant adverse impact detected — action required" | Any ratio < 0.50 |
| Data completeness | Green: "Complete" | excluded_count == 0 and unknown_count == 0 |
| Data completeness | Amber: "Gaps noted" | excluded_count > 0 or unknown_count > 0 |

Logic:
- Scan all result table rows to find the minimum impact ratio (excluding excluded groups)
- If min ratio >= 0.80 → green
- If min ratio >= 0.50 but < 0.80 → amber
- If min ratio < 0.50 → red

One-paragraph narrative summary: "This audit of [system name] analyzed [total] records across [N] demographic categories. [X] groups were flagged with impact ratios below the 0.80 threshold. The lowest observed impact ratio was [Y] for [group name], indicating [interpretation]."

### 3. Scope of this audit (NEW)

Auto-generated from config:

**In scope:**
- Categories tested (e.g., sex, race/ethnicity, intersectional)
- Metric used (selection rate / scoring rate / fairness metrics)
- Threshold applied (e.g., 0.80)
- Data period (if provided)

**Out of scope:**
- This audit does not certify the system as "bias-free"
- This audit does not test demographic categories beyond those provided in the dataset
- This audit does not determine whether the system is an AEDT under NYC Local Law 144
- This audit is not intended for compliance with legislation other than the configured framework

### 4. Compliance checklist (NEW, LL144-specific)

Auto-evaluated checklist based on what the user actually provided:

| Requirement | Status | Notes |
|---|---|---|
| System description provided | Check/Warning | Based on whether systemName, systemDescription are filled |
| Sex category tested | Check/Warning | Based on whether a "sex" or "gender" table exists in results |
| Race/ethnicity category tested | Check/Warning | Based on whether a "race" table exists |
| Intersectional analysis included | Check/Warning | Based on config.intersectional.required |
| Required demographic groups present | Check/Warning | LL144 requires Male, Female + 7 race/ethnicity groups |
| Auditor independence declared | Check/Warning | Based on config.auditorIndependence |
| Audit conducted within required timeframe | Info | "Ensure this audit is no more than 1 year old at time of use" |

### 5. Executive summary (enhanced)

- Same key metrics table (total records, selected, rate, flagged, excluded, missing)
- **NEW: Horizontal bar chart** of impact ratios per non-intersectional category
  - One chart per demographic dimension (sex, race/ethnicity)
  - Red dashed vertical line at 0.80 threshold
  - Bars colored green (>= 0.80) or red (< 0.80)
  - Uses `reportlab.graphics.charts.barcharts.HorizontalBarChart`
- Summary text paragraph

### 6. System description (unchanged)

Same as current.

### 7. Data description (unchanged)

Same as current, including records-per-category tables.

### 8. Methodology (unchanged)

Same as current.

### 9. Results (enhanced)

- Tables **sorted by impact ratio ascending** (worst first) so problem groups are immediately visible
- Each flagged row gets an **inline explanation** below the table:
  - "[Group]: impact ratio [X] — this group is selected at [X*100]% the rate of the highest group ([highest group], [highest rate]%), which is [below / substantially below] the 0.80 threshold."
  - "Substantially below" when ratio < 0.50
- Excluded groups still shown but explained: "Excluded from impact ratio calculation due to small sample size (< [threshold]% of total records). Rate shown for transparency."
- **Per-category bar chart** before each results table (same style as executive summary charts)

### 10. Recommended actions (NEW, LL144-specific)

Template for LL144:

**If flags were found:**
1. Investigate root causes for each flagged group — determine whether the disparity is caused by the tool's features, training data, or external factors
2. Document business necessity defense if the tool's criteria are job-related and consistent with business necessity (42 U.S.C. section 2000e-2(k))
3. Consider alternative selection procedures that may reduce adverse impact while serving the same business purpose
4. Ensure the summary of audit results is publicly available on your website as required by NYC Admin Code section 20-871(b)(3)
5. Provide notice to candidates at least 10 business days before use of the AEDT, including the job qualifications and characteristics the tool will assess

**If no flags were found:**
1. Document this audit as evidence of compliance
2. Schedule the next annual audit (required within 1 year)
3. Continue monitoring — passing one audit does not guarantee future compliance if the applicant pool or tool changes

### 11. Regulatory context (NEW, LL144-specific)

Plain-English explanation:

- What NYC Local Law 144 requires: annual bias audit of AEDTs used in hiring/promotion, conducted by an independent auditor, with summary publicly posted
- What "independent auditor" means: not employed by or financially dependent on the AEDT vendor (NYC Admin Code section 20-870)
- What the 4/5ths rule means: from EEOC Uniform Guidelines (1978), an impact ratio below 0.80 is evidence of adverse impact, not an automatic legal violation
- What a flag means: the disparity is large enough to warrant investigation, not proof of discrimination
- Key citations: NYC Admin Code sections 20-870 through 20-874, 6 RCNY section 5-300 through 5-303

### 12. Glossary (NEW)

| Term | Definition |
|---|---|
| AEDT | Automated employment decision tool — any computational process using ML, statistical modeling, data analytics, or AI that issues simplified output to substantially assist or replace discretionary employment decisions |
| Adverse impact | A substantially different rate of selection in hiring that works to the disadvantage of a demographic group |
| Impact ratio | The selection/scoring rate of a group divided by the rate of the highest-performing group |
| Selection rate | The proportion of applicants in a demographic group who are selected (hired, advanced, etc.) |
| Scoring rate | The proportion of applicants in a group who score at or above the overall median score |
| 4/5ths rule | EEOC guideline: if a group's selection rate is less than 80% (4/5ths) of the highest group's rate, it is evidence of adverse impact |
| Intersectional analysis | Analysis of compound demographic groups (e.g., Female + Hispanic) to detect disparities not visible in single-category analysis |

### 13. Conclusion (rewritten)

**Findings summary** (auto-generated from results):
- "This audit of [system] analyzed [total] records across [N] demographic categories ([list categories]). [X] of [Y] evaluated groups were flagged with impact ratios below the 0.80 threshold. The most significant disparity was observed for [worst group] (impact ratio: [value]), while [best group] showed the highest selection rate at [rate]%."
- If no flags: "No demographic group was found to have an impact ratio below the 0.80 threshold. This indicates no evidence of adverse impact under the 4/5ths rule for the dataset analyzed."

**Limitations** (keep existing 5 items as a subsection, not the main conclusion).

## Technical approach — template architecture

### File structure

```
EvalServer/src/engines/bias_audit/
  report_generator.py          # Layout engine — renders sections, calls template methods
  report_templates/
    __init__.py                # Registry: get_template(preset_name) → template instance
    base.py                    # Abstract base class
    ll144.py                   # NYC Local Law 144 template
    generic.py                 # Fallback for custom/unknown frameworks
```

### Base template interface (`base.py`)

```python
class BiasAuditReportTemplate:
    framework_name: str                    # Display name, e.g. "NYC Local Law 144"

    def verdict(self, results) -> dict
        # Returns {color: "green"|"amber"|"red", label: str, narrative: str}

    def scope_in(self, config, results) -> list[str]
        # Items describing what was tested

    def scope_out(self) -> list[str]
        # Items describing what was NOT tested

    def checklist(self, config, results) -> list[dict]
        # [{requirement: str, status: "pass"|"warning"|"info", note: str}, ...]

    def required_categories(self) -> dict
        # {"sex": ["Male", "Female"], "race_ethnicity": ["White", "Black or African American", ...]}

    def threshold_explanation(self, threshold) -> str
        # Framework-specific explanation of the threshold (e.g. 4/5ths rule for LL144)

    def flag_explanation(self, group, ratio, highest_group, highest_rate, threshold) -> str
        # Per-flagged-group prose explanation

    def recommended_actions(self, has_flags, results) -> list[str]
        # Ordered list of action items

    def regulatory_context(self) -> list[str]
        # Paragraphs of plain-English legal context

    def glossary(self) -> list[tuple[str, str]]
        # [(term, definition), ...]

    def conclusion_summary(self, config, results) -> str
        # Prose summarizing this specific audit's findings

    def additional_limitations(self) -> list[str]
        # Framework-specific limitations appended to universal ones
```

### Template registry (`__init__.py`)

```python
def get_template(preset_name: str) -> BiasAuditReportTemplate:
    if "local law 144" in preset_name.lower() or "ll144" in preset_name.lower():
        return LL144Template()
    # Future: elif "eu ai act" in preset_name.lower(): return EUAIActTemplate()
    return GenericTemplate()
```

### Report generator changes

`report_generator.py` becomes the layout engine:
- Receives the template via `get_template(audit["presetName"])`
- Each section function calls template methods for content
- Framework-agnostic sections (cover layout, charts, data tables, system description) stay in the generator
- Charts via `reportlab.graphics.charts.barcharts.HorizontalBarChart` and `reportlab.graphics.shapes.Drawing`
- Logo via `reportlab.platypus.Image` (use `EvalServer/src/utils/verifywise_logo.png`)
- No new dependencies (ReportLab includes charting)
- No LLM calls — all content is deterministic templates

### Methodology section — split

The methodology section has both universal and framework-specific content:
- Universal: metric description (selection rate / scoring rate / fairness metrics)
- Framework-specific: threshold explanation (4/5ths rule for LL144) via `template.threshold_explanation()`
- Universal: small-sample exclusion, intersectional analysis descriptions

### Conclusion section — split

- Findings summary: `template.conclusion_summary(config, results)` — framework-aware prose
- Universal limitations (5 existing items)
- Framework-specific limitations: `template.additional_limitations()`

## Files modified

- `EvalServer/src/engines/bias_audit/report_generator.py` — refactored into layout engine
- `EvalServer/src/engines/bias_audit/report_templates/__init__.py` — NEW, template registry
- `EvalServer/src/engines/bias_audit/report_templates/base.py` — NEW, abstract base class
- `EvalServer/src/engines/bias_audit/report_templates/ll144.py` — NEW, LL144 template
- `EvalServer/src/engines/bias_audit/report_templates/generic.py` — NEW, fallback template

## Out of scope

- EU AI Act compliance template (future work — same pattern, new file)
- Colorado AI Act template (future work)
- Custom framework templates
- LLM-generated explanations
- Interactive/HTML report format
