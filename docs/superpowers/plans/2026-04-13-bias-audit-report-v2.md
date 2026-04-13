# Bias Audit PDF Report v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the bias audit PDF report from a raw data dump into a professional, self-explanatory compliance artifact with overall verdict, compliance checklist, charts, flag explanations, recommended actions, and regulatory context — using a template architecture that supports multiple compliance frameworks.

**Architecture:** Split the monolithic `report_generator.py` into a layout engine + framework-specific templates. The layout engine renders sections (cover, verdict, scope, checklist, charts, tables, actions, conclusion). Each framework template (LL144, generic) provides the content for framework-specific sections via a base class interface. Charts use ReportLab's built-in `reportlab.graphics` module.

**Tech Stack:** Python 3.12, ReportLab (Platypus + Graphics), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-13-bias-audit-report-v2-design.md`

---

## File structure

```
EvalServer/src/engines/bias_audit/
  report_generator.py                    # MODIFY — refactor into layout engine
  report_templates/                      # NEW directory
    __init__.py                          # NEW — template registry
    base.py                              # NEW — abstract base class
    ll144.py                             # NEW — NYC Local Law 144 template
    generic.py                           # NEW — fallback for custom frameworks
```

**Integration point:** `EvalServer/src/controllers/bias_audits.py:457` calls `generate_pdf_report(audit)`. The function signature does NOT change — the refactoring is internal only.

**Logo:** `EvalServer/src/utils/verifywise_logo.png` (9.7KB, already exists).

---

### Task 1: Create template base class and registry

**Files:**
- Create: `EvalServer/src/engines/bias_audit/report_templates/__init__.py`
- Create: `EvalServer/src/engines/bias_audit/report_templates/base.py`

- [ ] **Step 1: Create the report_templates directory**

```bash
mkdir -p /Users/gorkemcetin/verifywise/EvalServer/src/engines/bias_audit/report_templates
```

- [ ] **Step 2: Create the abstract base class**

Create `EvalServer/src/engines/bias_audit/report_templates/base.py`:

```python
"""Abstract base class for bias audit report templates.

Each compliance framework (LL144, EU AI Act, etc.) provides a concrete
implementation. The report generator calls these methods to fill in
framework-specific content while keeping layout logic universal.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple


class BiasAuditReportTemplate(ABC):
    """Interface that every framework template must implement."""

    @property
    @abstractmethod
    def framework_name(self) -> str:
        """Display name, e.g. 'NYC Local Law 144'."""
        ...

    # ------------------------------------------------------------------ verdict

    @abstractmethod
    def verdict(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """Compute overall assessment.

        Returns:
            {
                "color": "green" | "amber" | "red",
                "label": str,          # e.g. "No adverse impact detected"
                "narrative": str,      # one-paragraph summary
                "data_completeness": {
                    "color": "green" | "amber",
                    "label": str,
                },
            }
        """
        ...

    # ------------------------------------------------------------------ scope

    @abstractmethod
    def scope_in(self, config: Dict[str, Any], results: Dict[str, Any]) -> List[str]:
        """Items describing what was tested."""
        ...

    @abstractmethod
    def scope_out(self) -> List[str]:
        """Items describing what was NOT tested/certified."""
        ...

    # ------------------------------------------------------------------ checklist

    @abstractmethod
    def checklist(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        """Auto-evaluated compliance checklist.

        Returns list of:
            {"requirement": str, "status": "pass"|"warning"|"info", "note": str}
        """
        ...

    @abstractmethod
    def required_categories(self) -> Dict[str, List[str]]:
        """Demographic categories required by this framework.

        Returns e.g.:
            {"sex": ["Male", "Female"],
             "race_ethnicity": ["White", "Black or African American", ...]}
        """
        ...

    # ------------------------------------------------------------------ methodology

    @abstractmethod
    def threshold_explanation(self, threshold: float) -> str:
        """Framework-specific explanation of the adverse impact threshold."""
        ...

    # ------------------------------------------------------------------ results

    @abstractmethod
    def flag_explanation(
        self,
        group: str,
        ratio: float,
        highest_group: str,
        highest_rate: float,
        threshold: float,
    ) -> str:
        """One-line prose explanation for a flagged group."""
        ...

    # ------------------------------------------------------------------ actions

    @abstractmethod
    def recommended_actions(
        self, has_flags: bool, results: Dict[str, Any]
    ) -> List[str]:
        """Ordered list of recommended next steps."""
        ...

    # ------------------------------------------------------------------ context

    @abstractmethod
    def regulatory_context(self) -> List[str]:
        """Paragraphs of plain-English legal/regulatory context."""
        ...

    @abstractmethod
    def glossary(self) -> List[Tuple[str, str]]:
        """List of (term, definition) pairs."""
        ...

    # ------------------------------------------------------------------ conclusion

    @abstractmethod
    def conclusion_summary(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> str:
        """Prose summarizing this specific audit's findings."""
        ...

    @abstractmethod
    def additional_limitations(self) -> List[str]:
        """Framework-specific limitations appended to universal ones."""
        ...
```

- [ ] **Step 3: Create the template registry**

Create `EvalServer/src/engines/bias_audit/report_templates/__init__.py`:

```python
"""Template registry — resolves a preset name to a template instance."""

from .base import BiasAuditReportTemplate


def get_template(preset_name: str) -> BiasAuditReportTemplate:
    """Return the appropriate template for a compliance framework.

    Falls back to GenericTemplate for unknown/custom frameworks.
    """
    normalized = (preset_name or "").lower()

    if "local law 144" in normalized or "ll144" in normalized or "ll 144" in normalized:
        from .ll144 import LL144Template
        return LL144Template()

    from .generic import GenericTemplate
    return GenericTemplate()
```

- [ ] **Step 4: Commit**

```bash
git add EvalServer/src/engines/bias_audit/report_templates/
git commit -m "feat(bias-audit): add template base class and registry for report generation"
```

---

### Task 2: Create LL144 template

**Files:**
- Create: `EvalServer/src/engines/bias_audit/report_templates/ll144.py`

- [ ] **Step 1: Create the LL144 template**

Create `EvalServer/src/engines/bias_audit/report_templates/ll144.py`:

```python
"""NYC Local Law 144 bias audit report template."""

from typing import Any, Dict, List, Tuple

from .base import BiasAuditReportTemplate


def _min_impact_ratio(results: Dict[str, Any]) -> Tuple[float, str]:
    """Find the minimum impact ratio across all non-excluded result rows.

    Returns (min_ratio, group_name). If no valid ratios, returns (1.0, "").
    """
    min_ratio = 1.0
    min_group = ""
    for tbl in results.get("tables", []):
        for row in tbl.get("rows", []):
            if row.get("excluded"):
                continue
            ratio = row.get("impact_ratio")
            if ratio is not None and ratio < min_ratio:
                min_ratio = ratio
                min_group = row.get("category_name", "")
    return min_ratio, min_group


def _category_names_from_tables(results: Dict[str, Any]) -> List[str]:
    """Extract the non-intersectional category keys present in results."""
    names = []
    for tbl in results.get("tables", []):
        key = tbl.get("category_key", "")
        if key != "intersectional":
            names.append(tbl.get("title", key))
    return names


def _has_category(results: Dict[str, Any], keyword: str) -> bool:
    """Check whether results contain a table whose category_key matches keyword."""
    for tbl in results.get("tables", []):
        key = (tbl.get("category_key") or "").lower()
        if keyword in key:
            return True
    return False


def _count_evaluated_groups(results: Dict[str, Any]) -> Tuple[int, int]:
    """Return (total evaluated groups, flagged groups) across all tables."""
    total = 0
    flagged = 0
    for tbl in results.get("tables", []):
        for row in tbl.get("rows", []):
            if not row.get("excluded"):
                total += 1
                if row.get("flagged"):
                    flagged += 1
    return total, flagged


class LL144Template(BiasAuditReportTemplate):
    """NYC Local Law 144 (Int. No. 1894-A) compliance template."""

    @property
    def framework_name(self) -> str:
        return "NYC Local Law 144"

    # ------------------------------------------------------------------ verdict

    def verdict(self, results: Dict[str, Any]) -> Dict[str, Any]:
        min_ratio, min_group = _min_impact_ratio(results)
        flags_count = results.get("flags_count", 0)
        total_applicants = results.get("total_applicants", 0)
        excluded_count = results.get("excluded_count", 0)
        unknown_count = results.get("unknown_count", 0)
        categories = _category_names_from_tables(results)
        system_name = "the system"

        # Disparate impact verdict
        if min_ratio >= 0.80:
            color = "green"
            label = "No adverse impact detected"
        elif min_ratio >= 0.50:
            color = "amber"
            label = "Adverse impact detected \u2014 review recommended"
        else:
            color = "red"
            label = "Significant adverse impact detected \u2014 action required"

        # Data completeness
        if excluded_count == 0 and unknown_count == 0:
            data_color = "green"
            data_label = "Complete"
        else:
            data_color = "amber"
            data_label = "Gaps noted"

        # Narrative
        cat_str = ", ".join(categories) if categories else "the configured categories"
        if flags_count == 0:
            narrative = (
                f"This audit analyzed {total_applicants:,} records across {cat_str}. "
                f"No demographic group was found to have an impact ratio below the "
                f"0.80 threshold. This indicates no evidence of adverse impact under "
                f"the EEOC four-fifths rule for the dataset analyzed."
            )
        else:
            severity = "substantially " if min_ratio < 0.50 else ""
            narrative = (
                f"This audit analyzed {total_applicants:,} records across {cat_str}. "
                f"{flags_count} group(s) were flagged with impact ratios below the "
                f"0.80 threshold. The lowest observed impact ratio was {min_ratio:.3f} "
                f"for {min_group}, which is {severity}below the four-fifths threshold "
                f"and warrants closer examination."
            )

        return {
            "color": color,
            "label": label,
            "narrative": narrative,
            "data_completeness": {"color": data_color, "label": data_label},
        }

    # ------------------------------------------------------------------ scope

    def scope_in(self, config: Dict[str, Any], results: Dict[str, Any]) -> List[str]:
        items = []
        categories = _category_names_from_tables(results)
        if categories:
            items.append(f"Demographic categories tested: {', '.join(categories)}")
        intersectional = config.get("intersectional") or {}
        if intersectional.get("required"):
            cross = " \u00d7 ".join(intersectional.get("cross", []))
            items.append(f"Intersectional analysis included ({cross})")

        metric = results.get("metric") or config.get("metric") or "selection_rate"
        metric_labels = {
            "selection_rate": "Selection rate (4/5ths rule)",
            "scoring_rate": "Scoring rate (LL144 alternative)",
            "fairness_metrics": "Fairness metrics (TPR / FPR / equalized odds)",
        }
        items.append(f"Metric: {metric_labels.get(metric, metric)}")

        threshold = config.get("threshold", 0.80)
        items.append(f"Adverse impact threshold: {threshold:.2f}")

        start = config.get("dataDateRangeStart")
        end = config.get("dataDateRangeEnd")
        if start and end:
            items.append(f"Data period: {start} to {end}")
        elif start:
            items.append(f"Data period: from {start}")
        elif end:
            items.append(f"Data period: up to {end}")

        return items

    def scope_out(self) -> List[str]:
        return [
            "This audit does not certify the system as \u201cbias-free.\u201d",
            "This audit does not test demographic categories beyond those provided in the dataset.",
            "This audit does not determine whether the system is, in fact, an automated employment "
            "decision tool (AEDT) as defined under NYC Local Law 144.",
            "This audit is not intended for compliance with legislation other than NYC Local Law 144.",
        ]

    # ------------------------------------------------------------------ checklist

    def checklist(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        items = []

        # System description
        has_name = bool(config.get("systemName"))
        has_desc = bool(config.get("systemDescription"))
        if has_name and has_desc:
            items.append({"requirement": "System description provided", "status": "pass", "note": ""})
        elif has_name:
            items.append({
                "requirement": "System description provided",
                "status": "warning",
                "note": "System name provided but description is missing",
            })
        else:
            items.append({
                "requirement": "System description provided",
                "status": "warning",
                "note": "No system name or description provided",
            })

        # Sex category
        if _has_category(results, "sex") or _has_category(results, "gender"):
            items.append({"requirement": "Sex/gender category tested", "status": "pass", "note": ""})
        else:
            items.append({
                "requirement": "Sex/gender category tested",
                "status": "warning",
                "note": "LL144 requires testing by sex category (Male, Female)",
            })

        # Race/ethnicity category
        if _has_category(results, "race") or _has_category(results, "ethnicity"):
            items.append({"requirement": "Race/ethnicity category tested", "status": "pass", "note": ""})
        else:
            items.append({
                "requirement": "Race/ethnicity category tested",
                "status": "warning",
                "note": "LL144 requires testing by race/ethnicity",
            })

        # Intersectional
        intersectional = config.get("intersectional") or {}
        if intersectional.get("required"):
            items.append({"requirement": "Intersectional analysis included", "status": "pass", "note": ""})
        else:
            items.append({
                "requirement": "Intersectional analysis included",
                "status": "warning",
                "note": "LL144 requires intersectional analysis (sex \u00d7 race/ethnicity)",
            })

        # Auditor independence
        independence = config.get("auditorIndependence")
        if independence == "third_party":
            items.append({"requirement": "Auditor independence declared", "status": "pass", "note": "Third-party auditor"})
        elif independence == "internal":
            items.append({
                "requirement": "Auditor independence declared",
                "status": "pass",
                "note": "Internal auditor (not the AEDT vendor)",
            })
        elif independence == "self":
            items.append({
                "requirement": "Auditor independence declared",
                "status": "warning",
                "note": "Self-declared \u2014 LL144 requires an independent auditor",
            })
        else:
            items.append({
                "requirement": "Auditor independence declared",
                "status": "warning",
                "note": "Not declared \u2014 LL144 requires an independent auditor",
            })

        # Timeliness reminder
        items.append({
            "requirement": "Audit conducted within required timeframe",
            "status": "info",
            "note": "Ensure this audit is no more than 1 year old at time of AEDT use",
        })

        return items

    def required_categories(self) -> Dict[str, List[str]]:
        return {
            "sex": ["Male", "Female"],
            "race_ethnicity": [
                "White",
                "Black or African American",
                "Hispanic or Latino",
                "Asian",
                "American Indian or Alaska Native",
                "Native Hawaiian or Other Pacific Islander",
                "Two or more races",
            ],
        }

    # ------------------------------------------------------------------ methodology

    def threshold_explanation(self, threshold: float) -> str:
        return (
            f"The <b>4/5ths rule</b> (EEOC adverse impact standard) is applied: "
            f"a group with an impact ratio below <b>{threshold:.2f}</b> is "
            f"flagged for potential adverse impact. A flag does not automatically "
            f"indicate a violation \u2014 it indicates the disparity is large enough "
            f"to warrant closer examination under the Uniform Guidelines on Employee "
            f"Selection Procedures (1978)."
        )

    # ------------------------------------------------------------------ results

    def flag_explanation(
        self,
        group: str,
        ratio: float,
        highest_group: str,
        highest_rate: float,
        threshold: float,
    ) -> str:
        pct_of_highest = ratio * 100
        severity = "substantially below" if ratio < 0.50 else "below"
        return (
            f"<b>{group}</b>: impact ratio {ratio:.3f} \u2014 this group is selected at "
            f"{pct_of_highest:.1f}% the rate of the highest group ({highest_group}, "
            f"{highest_rate * 100:.1f}%), which is {severity} the {threshold:.2f} threshold."
        )

    # ------------------------------------------------------------------ actions

    def recommended_actions(
        self, has_flags: bool, results: Dict[str, Any]
    ) -> List[str]:
        if has_flags:
            return [
                "Investigate root causes for each flagged group \u2014 determine whether the "
                "disparity is caused by the tool\u2019s features, training data, or external factors.",
                "Document business necessity defense if the tool\u2019s criteria are job-related "
                "and consistent with business necessity (42 U.S.C. \u00a7 2000e-2(k)).",
                "Consider alternative selection procedures that may reduce adverse impact "
                "while serving the same business purpose.",
                "Ensure the summary of audit results is publicly available on your website "
                "as required by NYC Admin Code \u00a7 20-871(b)(3).",
                "Provide notice to candidates at least 10 business days before use of the "
                "AEDT, including the job qualifications and characteristics the tool will "
                "assess (6 RCNY \u00a7 5-303).",
            ]
        return [
            "Document this audit as evidence of compliance with NYC Local Law 144.",
            "Schedule the next annual audit \u2014 the law requires a bias audit no more "
            "than one year prior to the use of the AEDT (NYC Admin Code \u00a7 20-871(b)(2)).",
            "Continue monitoring \u2014 passing one audit does not guarantee future compliance "
            "if the applicant pool or tool changes.",
            "Ensure the summary of audit results is publicly available on your website "
            "as required by NYC Admin Code \u00a7 20-871(b)(3).",
            "Provide notice to candidates at least 10 business days before use of the "
            "AEDT (6 RCNY \u00a7 5-303).",
        ]

    # ------------------------------------------------------------------ context

    def regulatory_context(self) -> List[str]:
        return [
            "<b>What NYC Local Law 144 requires.</b> Employers and employment agencies "
            "in New York City that use an automated employment decision tool (AEDT) to "
            "screen candidates for employment or promotion must: (1) ensure the tool has "
            "been subject to a bias audit conducted no more than one year prior to its use, "
            "(2) make a summary of the most recent bias audit results publicly available on "
            "their website, and (3) provide notice to candidates at least 10 business days "
            "before the AEDT is used (NYC Admin Code \u00a7\u00a7 20-870 through 20-874).",

            "<b>What \u201cindependent auditor\u201d means.</b> The bias audit must be conducted "
            "by an independent auditor. Under the law, \u201cindependent\u201d means the auditor "
            "is not involved in using or developing the AEDT that is the subject of the audit "
            "(6 RCNY \u00a7 5-300). An employer\u2019s internal team may qualify if they are not the "
            "AEDT vendor.",

            "<b>What the 4/5ths rule means.</b> The four-fifths (or 80%) rule originates from "
            "the EEOC Uniform Guidelines on Employee Selection Procedures (1978). It states "
            "that a selection rate for any group which is less than four-fifths of the rate "
            "for the group with the highest rate will generally be regarded as evidence of "
            "adverse impact (\u00a7 60-3.4.D). An impact ratio below 0.80 is a statistical "
            "indicator, not an automatic legal violation.",

            "<b>What a flag means.</b> A flagged group indicates the disparity between that "
            "group\u2019s selection rate and the highest-rate group exceeds the 4/5ths threshold. "
            "This does not prove discrimination \u2014 it signals that the difference is large "
            "enough to warrant investigation into potential causes and justifications.",
        ]

    def glossary(self) -> List[Tuple[str, str]]:
        return [
            (
                "AEDT",
                "Automated employment decision tool \u2014 any computational process, derived "
                "from machine learning, statistical modeling, data analytics, or artificial "
                "intelligence, that issues simplified output used to substantially assist or "
                "replace discretionary decision making for employment decisions "
                "(NYC Admin Code \u00a7 20-870).",
            ),
            (
                "Adverse impact",
                "A substantially different rate of selection in hiring, promotion, or other "
                "employment decision that works to the disadvantage of members of a "
                "demographic group.",
            ),
            (
                "Impact ratio",
                "The selection rate (or scoring rate) of a demographic group divided by the "
                "rate of the group with the highest rate. A ratio of 1.00 means equal rates; "
                "lower values indicate greater disparity.",
            ),
            (
                "Selection rate",
                "The proportion of applicants in a demographic group who receive a positive "
                "outcome (selected, hired, advanced to the next stage).",
            ),
            (
                "Scoring rate",
                "The proportion of applicants in a demographic group who score at or above "
                "the overall median score of the entire applicant pool.",
            ),
            (
                "4/5ths rule",
                "EEOC guideline stating that if a group\u2019s selection rate is less than 80% "
                "(four-fifths) of the highest group\u2019s rate, it is generally regarded as "
                "evidence of adverse impact (\u00a7 60-3.4.D, Uniform Guidelines 1978).",
            ),
            (
                "Intersectional analysis",
                "Analysis of compound demographic groups formed by combining two or more "
                "categories (e.g., Female + Hispanic) to detect disparities not visible "
                "when analyzing categories independently.",
            ),
        ]

    # ------------------------------------------------------------------ conclusion

    def conclusion_summary(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> str:
        system_name = config.get("systemName") or "the audited system"
        total = results.get("total_applicants", 0)
        flags = results.get("flags_count", 0)
        categories = _category_names_from_tables(results)
        cat_str = ", ".join(categories) if categories else "the configured categories"
        total_eval, total_flagged = _count_evaluated_groups(results)
        min_ratio, min_group = _min_impact_ratio(results)

        if flags == 0:
            return (
                f"This audit of {system_name} analyzed {total:,} records across "
                f"{cat_str}. No demographic group was found to have an impact ratio "
                f"below the 0.80 threshold. This indicates no evidence of adverse "
                f"impact under the EEOC four-fifths rule for the dataset analyzed."
            )

        return (
            f"This audit of {system_name} analyzed {total:,} records across "
            f"{cat_str}. {total_flagged} of {total_eval} evaluated groups were "
            f"flagged with impact ratios below the 0.80 threshold. The most "
            f"significant disparity was observed for {min_group} (impact ratio: "
            f"{min_ratio:.3f}), indicating that this group is selected at "
            f"{min_ratio * 100:.1f}% the rate of the highest-performing group."
        )

    def additional_limitations(self) -> List[str]:
        return [
            "This audit was conducted under the framework of NYC Local Law 144 "
            "and the EEOC four-fifths rule. Compliance with other federal, state, "
            "or local anti-discrimination laws is not assessed.",
        ]
```

- [ ] **Step 2: Verify the module imports cleanly**

```bash
cd /Users/gorkemcetin/verifywise/EvalServer/src && python -c "from engines.bias_audit.report_templates import get_template; t = get_template('NYC Local Law 144'); print(t.framework_name)"
```

Expected: `NYC Local Law 144`

- [ ] **Step 3: Commit**

```bash
git add EvalServer/src/engines/bias_audit/report_templates/ll144.py
git commit -m "feat(bias-audit): add NYC Local Law 144 report template"
```

---

### Task 3: Create generic fallback template

**Files:**
- Create: `EvalServer/src/engines/bias_audit/report_templates/generic.py`

- [ ] **Step 1: Create the generic template**

Create `EvalServer/src/engines/bias_audit/report_templates/generic.py`:

```python
"""Generic fallback template for custom or unknown compliance frameworks.

Provides reasonable defaults without framework-specific legal references.
"""

from typing import Any, Dict, List, Tuple

from .base import BiasAuditReportTemplate


def _min_impact_ratio(results: Dict[str, Any]) -> Tuple[float, str]:
    """Find the minimum impact ratio across all non-excluded result rows."""
    min_ratio = 1.0
    min_group = ""
    for tbl in results.get("tables", []):
        for row in tbl.get("rows", []):
            if row.get("excluded"):
                continue
            ratio = row.get("impact_ratio")
            if ratio is not None and ratio < min_ratio:
                min_ratio = ratio
                min_group = row.get("category_name", "")
    return min_ratio, min_group


def _category_names_from_tables(results: Dict[str, Any]) -> List[str]:
    names = []
    for tbl in results.get("tables", []):
        key = tbl.get("category_key", "")
        if key != "intersectional":
            names.append(tbl.get("title", key))
    return names


def _count_evaluated_groups(results: Dict[str, Any]) -> Tuple[int, int]:
    total = 0
    flagged = 0
    for tbl in results.get("tables", []):
        for row in tbl.get("rows", []):
            if not row.get("excluded"):
                total += 1
                if row.get("flagged"):
                    flagged += 1
    return total, flagged


class GenericTemplate(BiasAuditReportTemplate):
    """Fallback template for custom or unknown compliance frameworks."""

    @property
    def framework_name(self) -> str:
        return "Custom framework"

    def verdict(self, results: Dict[str, Any]) -> Dict[str, Any]:
        min_ratio, min_group = _min_impact_ratio(results)
        flags_count = results.get("flags_count", 0)
        total = results.get("total_applicants", 0)
        excluded_count = results.get("excluded_count", 0)
        unknown_count = results.get("unknown_count", 0)
        categories = _category_names_from_tables(results)

        if min_ratio >= 0.80:
            color, label = "green", "No adverse impact detected"
        elif min_ratio >= 0.50:
            color, label = "amber", "Adverse impact detected \u2014 review recommended"
        else:
            color, label = "red", "Significant adverse impact detected \u2014 action required"

        if excluded_count == 0 and unknown_count == 0:
            data_color, data_label = "green", "Complete"
        else:
            data_color, data_label = "amber", "Gaps noted"

        cat_str = ", ".join(categories) if categories else "the configured categories"
        if flags_count == 0:
            narrative = (
                f"This audit analyzed {total:,} records across {cat_str}. "
                f"No group was found to have an impact ratio below the configured threshold."
            )
        else:
            narrative = (
                f"This audit analyzed {total:,} records across {cat_str}. "
                f"{flags_count} group(s) were flagged. The lowest impact ratio was "
                f"{min_ratio:.3f} for {min_group}."
            )

        return {
            "color": color,
            "label": label,
            "narrative": narrative,
            "data_completeness": {"color": data_color, "label": data_label},
        }

    def scope_in(self, config: Dict[str, Any], results: Dict[str, Any]) -> List[str]:
        items = []
        categories = _category_names_from_tables(results)
        if categories:
            items.append(f"Demographic categories tested: {', '.join(categories)}")
        metric = results.get("metric") or config.get("metric") or "selection_rate"
        items.append(f"Metric: {metric.replace('_', ' ')}")
        threshold = config.get("threshold", 0.80)
        items.append(f"Adverse impact threshold: {threshold:.2f}")
        return items

    def scope_out(self) -> List[str]:
        return [
            "This audit does not certify the system as \u201cbias-free.\u201d",
            "This audit does not test demographic categories beyond those provided in the dataset.",
        ]

    def checklist(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        # Generic template has no framework-specific checklist
        return []

    def required_categories(self) -> Dict[str, List[str]]:
        return {}

    def threshold_explanation(self, threshold: float) -> str:
        return (
            f"Groups with an impact ratio below <b>{threshold:.2f}</b> are flagged "
            f"for potential adverse impact. A flag indicates the disparity is large "
            f"enough to warrant closer examination."
        )

    def flag_explanation(
        self,
        group: str,
        ratio: float,
        highest_group: str,
        highest_rate: float,
        threshold: float,
    ) -> str:
        pct = ratio * 100
        return (
            f"<b>{group}</b>: impact ratio {ratio:.3f} \u2014 selected at {pct:.1f}% "
            f"the rate of the highest group ({highest_group}, {highest_rate * 100:.1f}%), "
            f"below the {threshold:.2f} threshold."
        )

    def recommended_actions(
        self, has_flags: bool, results: Dict[str, Any]
    ) -> List[str]:
        if has_flags:
            return [
                "Investigate root causes for each flagged group.",
                "Determine whether the disparities are caused by the tool\u2019s features, "
                "training data, or external factors.",
                "Consider alternative procedures that may reduce adverse impact.",
                "Document findings and any corrective actions taken.",
            ]
        return [
            "Document this audit as evidence of bias testing.",
            "Schedule regular re-audits as the applicant pool or tool evolves.",
        ]

    def regulatory_context(self) -> List[str]:
        return []

    def glossary(self) -> List[Tuple[str, str]]:
        return [
            (
                "Impact ratio",
                "The selection rate (or scoring rate) of a demographic group divided by "
                "the rate of the group with the highest rate.",
            ),
            (
                "Adverse impact",
                "A substantially different rate of selection that works to the disadvantage "
                "of members of a demographic group.",
            ),
        ]

    def conclusion_summary(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> str:
        system_name = config.get("systemName") or "the audited system"
        total = results.get("total_applicants", 0)
        flags = results.get("flags_count", 0)
        categories = _category_names_from_tables(results)
        cat_str = ", ".join(categories) if categories else "the configured categories"
        total_eval, total_flagged = _count_evaluated_groups(results)
        min_ratio, min_group = _min_impact_ratio(results)

        if flags == 0:
            return (
                f"This audit of {system_name} analyzed {total:,} records across "
                f"{cat_str}. No group fell below the configured threshold."
            )
        return (
            f"This audit of {system_name} analyzed {total:,} records across "
            f"{cat_str}. {total_flagged} of {total_eval} evaluated groups were "
            f"flagged. The largest disparity was for {min_group} "
            f"(impact ratio: {min_ratio:.3f})."
        )

    def additional_limitations(self) -> List[str]:
        return []
```

- [ ] **Step 2: Verify both templates load**

```bash
cd /Users/gorkemcetin/verifywise/EvalServer/src && python -c "
from engines.bias_audit.report_templates import get_template
print(get_template('NYC Local Law 144').framework_name)
print(get_template('My Custom Framework').framework_name)
"
```

Expected:
```
NYC Local Law 144
Custom framework
```

- [ ] **Step 3: Commit**

```bash
git add EvalServer/src/engines/bias_audit/report_templates/generic.py
git commit -m "feat(bias-audit): add generic fallback report template"
```

---

### Task 4: Refactor report_generator.py into template-aware layout engine

This is the largest task — refactoring the existing `report_generator.py` to use the template system and adding all new sections (verdict, scope, checklist, charts, flag explanations, actions, regulatory context, glossary, rewritten conclusion).

**Files:**
- Modify: `EvalServer/src/engines/bias_audit/report_generator.py`

**Important context for the implementer:**
- Read the FULL current file at `EvalServer/src/engines/bias_audit/report_generator.py` (559 lines)
- Read the spec at `docs/superpowers/specs/2026-04-13-bias-audit-report-v2-design.md`
- Read the LL144 template at `EvalServer/src/engines/bias_audit/report_templates/ll144.py`
- The function signature `generate_pdf_report(audit: Dict[str, Any]) -> bytes` must NOT change
- The logo file is at `EvalServer/src/utils/verifywise_logo.png`

- [ ] **Step 1: Add new imports and color constants**

At the top of `report_generator.py`, add these imports after the existing ones:

```python
import os
from reportlab.platypus import Image
from reportlab.graphics.shapes import Drawing, Line, String
from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics import renderPDF

from .report_templates import get_template
from .report_templates.base import BiasAuditReportTemplate
```

Add new color constants after the existing ones:

```python
VERDICT_GREEN = colors.HexColor("#E6F4EA")
VERDICT_GREEN_TEXT = colors.HexColor("#138A5E")
VERDICT_AMBER = colors.HexColor("#FFF3E0")
VERDICT_AMBER_TEXT = colors.HexColor("#E65100")
VERDICT_RED = colors.HexColor("#fee2e2")
VERDICT_RED_TEXT = colors.HexColor("#b91c1c")
CHECK_PASS = colors.HexColor("#138A5E")
CHECK_WARN = colors.HexColor("#E65100")
CHECK_INFO = colors.HexColor("#1565C0")
```

- [ ] **Step 2: Add new style definitions**

In the `_styles()` function, add these styles to the returned dict:

```python
        "verdict_label": ParagraphStyle(
            "verdict_label",
            parent=base["Normal"],
            fontSize=12,
            leading=16,
            fontName="Helvetica-Bold",
        ),
        "verdict_narrative": ParagraphStyle(
            "verdict_narrative",
            parent=base["Normal"],
            fontSize=10,
            leading=15,
            textColor=TEXT,
            spaceAfter=12,
            spaceBefore=8,
        ),
        "checklist_pass": ParagraphStyle(
            "checklist_pass",
            parent=base["Normal"],
            fontSize=9,
            leading=13,
            textColor=CHECK_PASS,
            fontName="Helvetica-Bold",
        ),
        "checklist_warn": ParagraphStyle(
            "checklist_warn",
            parent=base["Normal"],
            fontSize=9,
            leading=13,
            textColor=CHECK_WARN,
            fontName="Helvetica-Bold",
        ),
        "checklist_info": ParagraphStyle(
            "checklist_info",
            parent=base["Normal"],
            fontSize=9,
            leading=13,
            textColor=CHECK_INFO,
            fontName="Helvetica-Bold",
        ),
        "action_item": ParagraphStyle(
            "action_item",
            parent=base["Normal"],
            fontSize=10,
            leading=15,
            textColor=TEXT,
            spaceAfter=6,
            leftIndent=18,
        ),
        "glossary_term": ParagraphStyle(
            "glossary_term",
            parent=base["Normal"],
            fontSize=10,
            leading=14,
            textColor=TEXT,
            fontName="Helvetica-Bold",
        ),
        "glossary_def": ParagraphStyle(
            "glossary_def",
            parent=base["Normal"],
            fontSize=9,
            leading=13,
            textColor=TEXT_MUTED,
            spaceAfter=8,
        ),
```

- [ ] **Step 3: Add the logo to the cover page**

In `_cover_page()`, replace the opening spacer with the logo:

```python
    # Logo
    logo_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "utils",
        "verifywise_logo.png",
    )
    if os.path.exists(logo_path):
        story.append(Image(logo_path, width=1.4 * inch, height=1.4 * inch * 0.3))
        story.append(Spacer(1, 0.8 * inch))
    else:
        story.append(Spacer(1, 1.2 * inch))
```

The exact aspect ratio of the logo may need adjustment after visual testing. Start with width=1.4 inch and preserve aspect ratio.

- [ ] **Step 4: Add the overall assessment section**

Add a new function `_overall_assessment()` after `_cover_page()`:

```python
def _overall_assessment(
    story: list,
    styles: Dict[str, ParagraphStyle],
    audit: Dict[str, Any],
    template: BiasAuditReportTemplate,
) -> None:
    results = audit.get("results", {}) or {}
    verdict = template.verdict(results)

    story.append(Paragraph("Overall assessment", styles["h1"]))

    # Verdict colors
    color_map = {
        "green": (VERDICT_GREEN, VERDICT_GREEN_TEXT),
        "amber": (VERDICT_AMBER, VERDICT_AMBER_TEXT),
        "red": (VERDICT_RED, VERDICT_RED_TEXT),
    }
    bg, fg = color_map.get(verdict["color"], (VERDICT_AMBER, VERDICT_AMBER_TEXT))
    data_bg, data_fg = color_map.get(
        verdict["data_completeness"]["color"], (VERDICT_GREEN, VERDICT_GREEN_TEXT)
    )

    # Verdict table
    rows = [
        [
            Paragraph("Disparate impact", styles["label"]),
            Paragraph(verdict["label"], ParagraphStyle("v", parent=styles["verdict_label"], textColor=fg)),
        ],
        [
            Paragraph("Data completeness", styles["label"]),
            Paragraph(
                verdict["data_completeness"]["label"],
                ParagraphStyle("d", parent=styles["verdict_label"], textColor=data_fg),
            ),
        ],
    ]
    t = Table(rows, colWidths=[1.8 * inch, 4.7 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (1, 0), (1, 0), bg),
        ("BACKGROUND", (1, 1), (1, 1), data_bg),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, BORDER),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.15 * inch))

    # Narrative
    story.append(Paragraph(verdict["narrative"], styles["verdict_narrative"]))
```

- [ ] **Step 5: Add the scope section**

Add a new function `_scope()`:

```python
def _scope(
    story: list,
    styles: Dict[str, ParagraphStyle],
    audit: Dict[str, Any],
    template: BiasAuditReportTemplate,
) -> None:
    config = audit.get("config", {}) or {}
    results = audit.get("results", {}) or {}

    story.append(Paragraph("Scope of this audit", styles["h1"]))

    # In scope
    story.append(Paragraph("<b>In scope</b>", styles["body"]))
    for item in template.scope_in(config, results):
        story.append(Paragraph(f"\u2022 {item}", styles["body"]))

    story.append(Spacer(1, 0.1 * inch))

    # Out of scope
    story.append(Paragraph("<b>Out of scope</b>", styles["body"]))
    for item in template.scope_out():
        story.append(Paragraph(f"\u2022 {item}", styles["body"]))
```

- [ ] **Step 6: Add the compliance checklist section**

Add a new function `_compliance_checklist()`:

```python
def _compliance_checklist(
    story: list,
    styles: Dict[str, ParagraphStyle],
    audit: Dict[str, Any],
    template: BiasAuditReportTemplate,
) -> None:
    config = audit.get("config", {}) or {}
    results = audit.get("results", {}) or {}
    items = template.checklist(config, results)

    if not items:
        return  # Generic template may have no checklist

    story.append(Paragraph("Compliance checklist", styles["h1"]))
    story.append(Paragraph(
        f"Auto-evaluated against <b>{template.framework_name}</b> requirements:",
        styles["muted"],
    ))
    story.append(Spacer(1, 0.1 * inch))

    status_symbols = {"pass": "\u2713", "warning": "\u26a0", "info": "\u2139"}
    status_styles = {"pass": "checklist_pass", "warning": "checklist_warn", "info": "checklist_info"}

    header = [
        Paragraph("Requirement", styles["label"]),
        Paragraph("Status", styles["label"]),
        Paragraph("Notes", styles["label"]),
    ]
    rows = [header]
    status_row_colors: list = []
    for idx, item in enumerate(items, start=1):
        status = item["status"]
        symbol = status_symbols.get(status, "")
        style_name = status_styles.get(status, "body")
        rows.append([
            Paragraph(item["requirement"], styles["body"]),
            Paragraph(f"{symbol} {status.upper()}", styles[style_name]),
            Paragraph(item.get("note", ""), styles["muted"]),
        ])
        if status == "warning":
            status_row_colors.append(idx)

    t = Table(rows, colWidths=[2.5 * inch, 0.9 * inch, 3.1 * inch])
    style = _data_table_style()
    for row_idx in status_row_colors:
        style.add("BACKGROUND", (0, row_idx), (-1, row_idx), VERDICT_AMBER)
    t.setStyle(style)
    story.append(t)
```

- [ ] **Step 7: Add the impact ratio bar chart helper**

Add a new function `_impact_ratio_chart()`:

```python
def _impact_ratio_chart(
    rows: list, threshold: float, title: str
) -> Optional[Drawing]:
    """Create a horizontal bar chart of impact ratios for a result table.

    Only includes non-excluded groups. Returns None if fewer than 2 groups.
    """
    groups = []
    ratios = []
    for row in rows:
        if row.get("excluded"):
            continue
        ratio = row.get("impact_ratio")
        if ratio is None:
            continue
        groups.append(row.get("category_name", ""))
        ratios.append(ratio)

    if len(groups) < 2:
        return None

    # Reverse so first group is at top of horizontal chart
    groups = groups[::-1]
    ratios = ratios[::-1]

    drawing = Drawing(460, max(80, len(groups) * 28 + 40))
    chart = HorizontalBarChart()
    chart.x = 140
    chart.y = 20
    chart.width = 280
    chart.height = max(40, len(groups) * 28)
    chart.data = [ratios]
    chart.categoryAxis.categoryNames = groups
    chart.categoryAxis.labels.fontSize = 8
    chart.categoryAxis.labels.dx = -6
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = max(1.05, max(ratios) + 0.05)
    chart.valueAxis.labels.fontSize = 8
    chart.bars[0].fillColor = BRAND
    chart.bars.strokeWidth = 0

    # Color bars: red if below threshold, green if at or above
    for i, ratio in enumerate(ratios):
        if ratio < threshold:
            chart.bars[0].fillColor = None  # reset default
            # Per-bar coloring via direct attribute
    # Use simpler approach: color all bars, then overlay threshold line
    bar_colors = []
    for ratio in ratios:
        bar_colors.append(FLAG_TEXT if ratio < threshold else BRAND)
    for i, c in enumerate(bar_colors):
        chart.bars[(0, i)].fillColor = c

    drawing.add(chart)

    # Threshold line
    line_x = chart.x + (threshold / chart.valueAxis.valueMax) * chart.width
    threshold_line = Line(line_x, chart.y, line_x, chart.y + chart.height)
    threshold_line.strokeColor = FLAG_TEXT
    threshold_line.strokeWidth = 1.5
    threshold_line.strokeDashArray = [4, 3]
    drawing.add(threshold_line)

    # Threshold label
    label = String(line_x + 3, chart.y + chart.height + 4, f"{threshold:.2f}")
    label.fontSize = 7
    label.fillColor = FLAG_TEXT
    drawing.add(label)

    return drawing
```

- [ ] **Step 8: Update the executive summary to include charts**

Replace the `_executive_summary()` function body to add charts after the metrics table:

```python
def _executive_summary(
    story: list, styles: Dict[str, ParagraphStyle], audit: Dict[str, Any]
) -> None:
    results = audit.get("results", {}) or {}
    config = audit.get("config", {}) or {}

    story.append(Paragraph("Executive summary", styles["h1"]))

    story.append(_key_value_table([
        ("Total records", _count(results.get("total_applicants"))),
        ("Total selected", _count(results.get("total_selected"))),
        ("Overall rate", _pct(results.get("overall_selection_rate"))),
        ("Flagged groups", str(results.get("flags_count", 0))),
        ("Excluded groups", str(results.get("excluded_count", 0))),
        ("Records with missing data", _count(results.get("unknown_count"))),
    ]))
    story.append(Spacer(1, 0.15 * inch))

    summary_text = results.get("summary") or "No summary available."
    story.append(Paragraph(summary_text, styles["body"]))

    # Impact ratio charts (one per non-intersectional category)
    threshold = config.get("threshold", 0.80) or 0.80
    tables = results.get("tables") or []
    for tbl in tables:
        if tbl.get("category_key") == "intersectional":
            continue
        chart = _impact_ratio_chart(tbl.get("rows", []), threshold, tbl.get("title", ""))
        if chart:
            story.append(Spacer(1, 0.1 * inch))
            story.append(Paragraph(tbl.get("title", ""), styles["muted"]))
            story.append(chart)
```

- [ ] **Step 9: Update the methodology section to use template**

In the `_methodology()` function, replace the hardcoded 4/5ths rule paragraph with the template call. Change the function signature to accept the template:

```python
def _methodology(
    story: list,
    styles: Dict[str, ParagraphStyle],
    audit: Dict[str, Any],
    template: BiasAuditReportTemplate,
) -> None:
    config = audit.get("config", {}) or {}
    results = audit.get("results", {}) or {}
    metric = results.get("metric") or config.get("metric") or "selection_rate"
    threshold = config.get("threshold", 0.80) or 0.80
    small_sample = config.get("smallSampleExclusion") or config.get("small_sample_exclusion")

    story.append(Paragraph("Methodology", styles["h1"]))

    # Metric description (universal)
    method_text = {
        "selection_rate": (
            f"The audit uses the <b>selection rate</b> metric. For each demographic "
            f"group, the selection rate is computed as the number of selected "
            f"records divided by the total number of records in that group. "
            f"Each group's rate is then compared to the group with the highest "
            f"selection rate to produce an <b>impact ratio</b>."
        ),
        "scoring_rate": (
            f"The audit uses the <b>scoring rate</b> metric, the LL144-compliant "
            f"alternative for tools that output a continuous score. The rate for "
            f"each group is the proportion of records whose score is above the "
            f"overall median. Impact ratios are then computed relative to the "
            f"highest-rate group."
        ),
        "fairness_metrics": (
            f"The audit uses <b>confusion-matrix fairness metrics</b>. For each "
            f"group, the report computes true positive rate (TPR), false positive "
            f"rate (FPR), precision, and accuracy from the model's predictions "
            f"compared against ground truth. Cross-group differences are "
            f"summarized as equal opportunity difference (TPR gap), equalized "
            f"odds difference (max of TPR and FPR gaps), and predictive parity "
            f"difference (precision gap)."
        ),
    }.get(metric, "")

    story.append(Paragraph(method_text, styles["body"]))

    # Threshold explanation (framework-specific)
    if metric in ("selection_rate", "scoring_rate"):
        story.append(Paragraph(template.threshold_explanation(threshold), styles["body"]))

    # Small-sample exclusion (universal)
    if small_sample:
        story.append(Paragraph(
            f"<b>Small-sample exclusion.</b> Groups representing fewer than "
            f"{small_sample * 100:.1f}% of the total records are excluded from "
            f"impact ratio calculations to avoid statistically unreliable results.",
            styles["body"],
        ))

    # Intersectional analysis (universal)
    intersectional = config.get("intersectional") or {}
    if intersectional.get("required") and len(intersectional.get("cross", [])) >= 2:
        cross = " \u00d7 ".join(intersectional.get("cross", []))
        story.append(Paragraph(
            f"<b>Intersectional analysis</b> is included: compound groups formed "
            f"by combining {cross} are also evaluated against the same threshold.",
            styles["body"],
        ))
```

- [ ] **Step 10: Update the results section to sort and add flag explanations**

Modify `_results()` to accept the template and add sorting + explanations. Change the function signature and update the impact ratio table section:

```python
def _results(
    story: list,
    styles: Dict[str, ParagraphStyle],
    audit: Dict[str, Any],
    template: BiasAuditReportTemplate,
) -> None:
    results = audit.get("results", {}) or {}
    config = audit.get("config", {}) or {}
    tables = results.get("tables") or []
    fairness = results.get("fairness_metrics_tables") or []
    distributions = results.get("score_distribution_tables") or []
    threshold = config.get("threshold", 0.80) or 0.80

    if not (tables or fairness or distributions):
        return

    story.append(Paragraph("Results", styles["h1"]))

    for tbl in tables:
        story.append(Paragraph(tbl.get("title", ""), styles["h2"]))
        highest_group = tbl.get("highest_group", "")
        highest_rate = tbl.get("highest_rate")
        if highest_group and highest_rate is not None:
            story.append(Paragraph(
                f"Highest-rate group: <b>{highest_group}</b> ({highest_rate * 100:.1f}%)",
                styles["muted"],
            ))

        # Sort rows by impact ratio ascending (worst first), excluded at end
        sorted_rows = sorted(
            tbl.get("rows", []),
            key=lambda r: (
                1 if r.get("excluded") else 0,
                r.get("impact_ratio") if r.get("impact_ratio") is not None else 999,
            ),
        )

        header = ["Group", "Records", "Selected", "Rate", "Impact ratio", "Status"]
        body_rows: List[List[Any]] = [header]
        flagged_rows: List[int] = []
        flagged_explanations: List[str] = []
        for idx, row in enumerate(sorted_rows, start=1):
            excluded = row.get("excluded")
            flagged = row.get("flagged")
            if flagged:
                flagged_rows.append(idx)
            status = "Excluded (<threshold)" if excluded else ("Flagged" if flagged else "Pass")
            body_rows.append([
                row.get("category_name", ""),
                f"{row.get('applicant_count', 0):,}",
                f"{row.get('selected_count', 0):,}",
                _pct(row.get("selection_rate")),
                "\u2014" if excluded else _num(row.get("impact_ratio")),
                status,
            ])
            # Collect flag explanations
            if flagged and row.get("impact_ratio") is not None and highest_rate:
                flagged_explanations.append(template.flag_explanation(
                    group=row.get("category_name", ""),
                    ratio=row["impact_ratio"],
                    highest_group=highest_group,
                    highest_rate=highest_rate,
                    threshold=threshold,
                ))

        t = Table(body_rows, colWidths=[2.0 * inch, 0.85 * inch, 0.85 * inch, 0.75 * inch, 1.0 * inch, 1.05 * inch])
        style = _data_table_style()
        for fr in flagged_rows:
            style.add("BACKGROUND", (0, fr), (-1, fr), FLAG_BG)
            style.add("TEXTCOLOR", (0, fr), (-1, fr), FLAG_TEXT)
        t.setStyle(style)
        story.append(t)

        # Flag explanations below the table
        if flagged_explanations:
            story.append(Spacer(1, 0.08 * inch))
            for explanation in flagged_explanations:
                story.append(Paragraph(explanation, styles["body"]))

        story.append(Spacer(1, 0.15 * inch))

    # Fairness metrics tables (unchanged from current implementation)
    for tbl in fairness:
        story.append(Paragraph(tbl.get("title", ""), styles["h2"]))
        diffs = []
        if tbl.get("equal_opportunity_difference") is not None:
            diffs.append(
                f"Equal opportunity difference: <b>{tbl['equal_opportunity_difference']:.3f}</b>"
            )
        if tbl.get("equalized_odds_difference") is not None:
            diffs.append(
                f"Equalized odds difference: <b>{tbl['equalized_odds_difference']:.3f}</b>"
            )
        if tbl.get("predictive_parity_difference") is not None:
            diffs.append(
                f"Predictive parity difference: <b>{tbl['predictive_parity_difference']:.3f}</b>"
            )
        if diffs:
            story.append(Paragraph(" &nbsp;\u00b7&nbsp; ".join(diffs), styles["muted"]))

        header = ["Group", "Count", "TPR", "FPR", "Precision", "Accuracy", "TP/FP/TN/FN"]
        body_rows = [header]
        for g in tbl.get("groups", []):
            body_rows.append([
                g.get("category_name", ""),
                f"{g.get('count', 0):,}",
                _pct(g.get("true_positive_rate")),
                _pct(g.get("false_positive_rate")),
                _pct(g.get("precision")),
                _pct(g.get("accuracy")),
                f"{g.get('true_positive', 0)}/{g.get('false_positive', 0)}/{g.get('true_negative', 0)}/{g.get('false_negative', 0)}",
            ])
        t = Table(body_rows, colWidths=[1.5 * inch, 0.7 * inch, 0.7 * inch, 0.7 * inch, 0.9 * inch, 0.9 * inch, 1.1 * inch])
        t.setStyle(_data_table_style())
        story.append(t)
        story.append(Spacer(1, 0.15 * inch))

    # Score distribution tables (unchanged from current implementation)
    for tbl in distributions:
        story.append(Paragraph(tbl.get("title", ""), styles["h2"]))
        story.append(Paragraph(
            f"Overall mean: {tbl.get('overall_mean', 0):.3f} &nbsp;\u00b7&nbsp; "
            f"Overall median: {tbl.get('overall_median', 0):.3f}",
            styles["muted"],
        ))
        header = ["Group", "n", "Mean", "Median", "Std", "K-S stat", "K-S p-value"]
        body_rows = [header]
        for g in tbl.get("groups", []):
            body_rows.append([
                g.get("category_name", ""),
                f"{g.get('count', 0):,}",
                _num(g.get("mean")),
                _num(g.get("median")),
                _num(g.get("std")),
                _num(g.get("ks_statistic")),
                _num(g.get("ks_pvalue")),
            ])
        t = Table(body_rows, colWidths=[1.8 * inch, 0.6 * inch, 0.85 * inch, 0.85 * inch, 0.85 * inch, 0.85 * inch, 0.95 * inch])
        t.setStyle(_data_table_style())
        story.append(t)
        story.append(Spacer(1, 0.15 * inch))
```

- [ ] **Step 11: Add recommended actions section**

Add a new function `_recommended_actions()`:

```python
def _recommended_actions(
    story: list,
    styles: Dict[str, ParagraphStyle],
    audit: Dict[str, Any],
    template: BiasAuditReportTemplate,
) -> None:
    results = audit.get("results", {}) or {}
    has_flags = (results.get("flags_count", 0) > 0)
    actions = template.recommended_actions(has_flags, results)

    if not actions:
        return

    story.append(Paragraph("Recommended actions", styles["h1"]))
    for i, action in enumerate(actions, start=1):
        story.append(Paragraph(f"{i}. {action}", styles["action_item"]))
```

- [ ] **Step 12: Add regulatory context section**

Add a new function `_regulatory_context()`:

```python
def _regulatory_context(
    story: list,
    styles: Dict[str, ParagraphStyle],
    template: BiasAuditReportTemplate,
) -> None:
    paragraphs = template.regulatory_context()
    if not paragraphs:
        return

    story.append(Paragraph("Regulatory context", styles["h1"]))
    for para in paragraphs:
        story.append(Paragraph(para, styles["body"]))
```

- [ ] **Step 13: Add glossary section**

Add a new function `_glossary()`:

```python
def _glossary(
    story: list,
    styles: Dict[str, ParagraphStyle],
    template: BiasAuditReportTemplate,
) -> None:
    terms = template.glossary()
    if not terms:
        return

    story.append(Paragraph("Glossary", styles["h1"]))
    for term, definition in terms:
        story.append(Paragraph(term, styles["glossary_term"]))
        story.append(Paragraph(definition, styles["glossary_def"]))
```

- [ ] **Step 14: Rewrite the conclusion section**

Replace `_limitations()` with a new `_conclusion()` function:

```python
def _conclusion(
    story: list,
    styles: Dict[str, ParagraphStyle],
    audit: Dict[str, Any],
    template: BiasAuditReportTemplate,
) -> None:
    config = audit.get("config", {}) or {}
    results = audit.get("results", {}) or {}

    story.append(PageBreak())
    story.append(Paragraph("Conclusion", styles["h1"]))

    # Findings summary (framework-specific)
    summary = template.conclusion_summary(config, results)
    story.append(Paragraph(summary, styles["body"]))
    story.append(Spacer(1, 0.15 * inch))

    # Limitations (universal + framework-specific)
    story.append(Paragraph("Limitations", styles["h2"]))
    story.append(Paragraph(
        "The following limitations apply to this audit:",
        styles["body"],
    ))

    universal_limitations = [
        "The audit measures statistical disparity, not causation. A flagged "
        "group does not imply the tool is the cause of that disparity.",
        "Results are specific to the dataset provided. They do not automatically "
        "generalize to different deployment contexts, time periods, or populations.",
        "Compliance obligations vary by jurisdiction. A passing audit under one "
        "framework does not imply compliance with all applicable laws.",
        "The audit does not evaluate the quality, relevance, or job-relatedness "
        "of the underlying features used by the tool.",
        "Readers should consult qualified legal counsel for interpretation of "
        "these results in their specific regulatory context.",
    ]

    for item in universal_limitations:
        story.append(Paragraph(f"\u2022 {item}", styles["body"]))

    for item in template.additional_limitations():
        story.append(Paragraph(f"\u2022 {item}", styles["body"]))
```

- [ ] **Step 15: Update the `generate_pdf_report()` entry point**

Replace the story-building section in `generate_pdf_report()`:

```python
def generate_pdf_report(audit: Dict[str, Any]) -> bytes:
    """Generate a PDF report for a completed bias audit.

    Args:
        audit: The full audit record as returned by get_bias_audit_results
            (must include status="completed", results, config).

    Returns:
        PDF bytes ready to serve as application/pdf.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=LETTER,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title="Bias audit report",
        author="VerifyWise",
    )

    # Resolve framework template
    preset_name = audit.get("presetName") or audit.get("preset_name") or ""
    template = get_template(preset_name)

    styles = _styles()
    story: list = []

    _cover_page(story, styles, audit)
    _overall_assessment(story, styles, audit, template)
    _scope(story, styles, audit, template)
    _compliance_checklist(story, styles, audit, template)
    _executive_summary(story, styles, audit)
    _system_description(story, styles, audit)
    _data_description(story, styles, audit)
    _methodology(story, styles, audit, template)
    _results(story, styles, audit, template)
    _recommended_actions(story, styles, audit, template)
    _regulatory_context(story, styles, template)
    _glossary(story, styles, template)
    _conclusion(story, styles, audit, template)

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()
```

- [ ] **Step 16: Remove the old `_limitations()` function**

Delete the `_limitations()` function entirely — it's replaced by `_conclusion()`.

- [ ] **Step 17: Verify the module compiles**

```bash
cd /Users/gorkemcetin/verifywise/EvalServer/src && python -c "from engines.bias_audit.report_generator import generate_pdf_report; print('OK')"
```

Expected: `OK`

- [ ] **Step 18: Commit**

```bash
git add EvalServer/src/engines/bias_audit/report_generator.py
git commit -m "feat(bias-audit): refactor report generator into template-aware layout engine

- Add overall assessment verdict (green/amber/red)
- Add scope of audit section (in scope / out of scope)
- Add compliance checklist (auto-evaluated against framework)
- Add horizontal bar charts for impact ratios
- Sort result tables by impact ratio (worst first)
- Add per-flag prose explanations
- Add recommended actions section
- Add regulatory context section
- Add glossary of key terms
- Rewrite conclusion with actual findings summary
- Add VerifyWise logo to cover page
- Use template architecture for multi-framework support"
```

---

### Task 5: Visual testing and polish

**Files:**
- Possibly modify: `EvalServer/src/engines/bias_audit/report_generator.py` (minor layout tweaks)

- [ ] **Step 1: Generate a test PDF**

Run the bias audit against the sample data to produce a PDF. Use the app or write a quick test script:

```bash
cd /Users/gorkemcetin/verifywise/EvalServer/src && python -c "
import json
from engines.bias_audit.report_generator import generate_pdf_report

# Use a sample audit dict that matches the structure from the existing sample report
audit = {
    'presetName': 'NYC Local Law 144',
    'config': {
        'systemName': 'Resume Screening Tool',
        'systemVersion': '',
        'systemDescription': 'AI-powered resume screening tool for initial candidate filtering',
        'deploymentContext': 'Pre-interview candidate screening',
        'auditorName': 'Jane Smith',
        'auditorRole': 'Compliance Officer',
        'auditorIndependence': 'internal',
        'metric': 'selection_rate',
        'threshold': 0.80,
        'smallSampleExclusion': 0.02,
        'intersectional': {'required': True, 'cross': ['sex', 'race_ethnicity']},
        'dataSource': 'HRIS Export',
        'dataDateRangeStart': '2025-01-01',
        'dataDateRangeEnd': '2025-12-31',
    },
    'results': {
        'total_applicants': 984,
        'total_selected': 441,
        'overall_selection_rate': 0.448,
        'flags_count': 12,
        'excluded_count': 6,
        'unknown_count': 16,
        'metric': 'selection_rate',
        'summary': 'Audit analyzed 984 applicants (overall rate: 44.8%). 16 rows excluded due to missing data. 12 group(s) flagged with impact ratio below 0.80 threshold.',
        'tables': [
            {
                'title': 'Impact ratios by sex',
                'category_key': 'sex',
                'highest_group': 'Male',
                'highest_rate': 0.504,
                'rows': [
                    {'category_name': 'Female', 'applicant_count': 510, 'selected_count': 202, 'selection_rate': 0.396, 'impact_ratio': 0.786, 'flagged': True, 'excluded': False},
                    {'category_name': 'Male', 'applicant_count': 474, 'selected_count': 239, 'selection_rate': 0.504, 'impact_ratio': 1.0, 'flagged': False, 'excluded': False},
                ],
            },
            {
                'title': 'Impact ratios by race/ethnicity',
                'category_key': 'race_ethnicity',
                'highest_group': 'White',
                'highest_rate': 0.564,
                'rows': [
                    {'category_name': 'American Indian or Alaska Native', 'applicant_count': 16, 'selected_count': 8, 'selection_rate': 0.5, 'impact_ratio': None, 'flagged': False, 'excluded': True},
                    {'category_name': 'Asian', 'applicant_count': 115, 'selected_count': 58, 'selection_rate': 0.504, 'impact_ratio': 0.895, 'flagged': False, 'excluded': False},
                    {'category_name': 'Black or African American', 'applicant_count': 166, 'selected_count': 53, 'selection_rate': 0.319, 'impact_ratio': 0.566, 'flagged': True, 'excluded': False},
                    {'category_name': 'Hispanic or Latino', 'applicant_count': 192, 'selected_count': 56, 'selection_rate': 0.292, 'impact_ratio': 0.517, 'flagged': True, 'excluded': False},
                    {'category_name': 'Native Hawaiian or Other Pacific Islander', 'applicant_count': 11, 'selected_count': 5, 'selection_rate': 0.455, 'impact_ratio': None, 'flagged': False, 'excluded': True},
                    {'category_name': 'Two or more races', 'applicant_count': 53, 'selected_count': 18, 'selection_rate': 0.34, 'impact_ratio': 0.602, 'flagged': True, 'excluded': False},
                    {'category_name': 'White', 'applicant_count': 431, 'selected_count': 243, 'selection_rate': 0.564, 'impact_ratio': 1.0, 'flagged': False, 'excluded': False},
                ],
            },
        ],
        'fairness_metrics_tables': [],
        'score_distribution_tables': [],
    },
}

pdf_bytes = generate_pdf_report(audit)
with open('/tmp/test_bias_audit_v2.pdf', 'wb') as f:
    f.write(pdf_bytes)
print(f'PDF generated: {len(pdf_bytes)} bytes -> /tmp/test_bias_audit_v2.pdf')
"
```

- [ ] **Step 2: Open and review the PDF visually**

```bash
open /tmp/test_bias_audit_v2.pdf
```

Check each section:
- Logo appears top-left on cover
- Overall assessment shows red verdict (because Hispanic or Latino has 0.517 < 0.50)
- Scope lists categories, metric, threshold
- Compliance checklist shows pass/warning statuses correctly
- Bar charts render with red/green bars and dashed threshold line
- Results tables sorted worst-first
- Flag explanations appear below each table
- Recommended actions list appears
- Regulatory context has 4 paragraphs
- Glossary has 7 terms
- Conclusion has findings summary + limitations subsection

- [ ] **Step 3: Fix any layout issues**

Common things to adjust:
- Logo aspect ratio / positioning
- Chart height for different numbers of groups
- Page break placement if sections split awkwardly
- Table column widths if text overflows

- [ ] **Step 4: Commit any polish fixes**

```bash
git add EvalServer/src/engines/bias_audit/report_generator.py
git commit -m "fix(bias-audit): polish report layout after visual review"
```

---

## Self-review checklist

- [x] **Spec coverage:** Every section from the spec (verdict, scope, checklist, charts, flag explanations, actions, regulatory context, glossary, rewritten conclusion, logo) has a corresponding implementation step
- [x] **Placeholder scan:** No TBDs or TODOs — all code is complete
- [x] **Type consistency:** `BiasAuditReportTemplate` interface matches between base.py, ll144.py, generic.py, and report_generator.py calls
- [x] **Function signature preservation:** `generate_pdf_report(audit: Dict[str, Any]) -> bytes` unchanged — no integration changes needed
- [x] **Template method calls match:** Every `template.xxx()` call in report_generator.py corresponds to an `@abstractmethod` in base.py and implementation in both ll144.py and generic.py
