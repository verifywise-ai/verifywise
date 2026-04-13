"""NYC Local Law 144 bias audit report template."""

from typing import Any, Dict, List, Tuple

from .base import BiasAuditReportTemplate


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------


def _min_impact_ratio(results: Dict[str, Any]) -> Tuple[float, str]:
    """Find the minimum impact ratio across all result table rows.

    Skips rows marked as excluded.  Returns ``(min_ratio, group_name)``.
    If no valid ratios are found, returns ``(1.0, "")``.
    """
    min_ratio = 1.0
    group_name = ""

    for table in results.get("tables", []):
        for row in table.get("rows", []):
            if row.get("excluded", False):
                continue
            ratio = row.get("impact_ratio")
            if ratio is not None and ratio < min_ratio:
                min_ratio = ratio
                group_name = row.get("group", "")

    return (min_ratio, group_name)


def _category_names_from_tables(results: Dict[str, Any]) -> List[str]:
    """Extract non-intersectional category titles from results tables."""
    names: List[str] = []
    for table in results.get("tables", []):
        title = table.get("title", "")
        key = table.get("category_key", "")
        # Skip intersectional tables (they typically contain " x " or "×")
        if " x " in key.lower() or "\u00d7" in key.lower():
            continue
        if title and title not in names:
            names.append(title)
    return names


def _has_category(results: Dict[str, Any], keyword: str) -> bool:
    """Check whether results contain a table whose category_key contains *keyword*."""
    kw = keyword.lower()
    for table in results.get("tables", []):
        if kw in table.get("category_key", "").lower():
            return True
    return False


def _count_evaluated_groups(
    results: Dict[str, Any],
) -> Tuple[int, int]:
    """Return ``(total_evaluated, total_flagged)`` across all tables.

    Excluded rows are not counted.
    """
    total_evaluated = 0
    total_flagged = 0
    for table in results.get("tables", []):
        for row in table.get("rows", []):
            if row.get("excluded", False):
                continue
            total_evaluated += 1
            if row.get("flagged", False):
                total_flagged += 1
    return (total_evaluated, total_flagged)


# ---------------------------------------------------------------------------
# Template
# ---------------------------------------------------------------------------


class LL144Template(BiasAuditReportTemplate):
    """NYC Local Law 144 compliance template."""

    @property
    def framework_name(self) -> str:
        return "NYC Local Law 144"

    # --------------------------------------------------------------------- #
    # verdict
    # --------------------------------------------------------------------- #

    def verdict(self, results: Dict[str, Any]) -> Dict[str, Any]:
        min_ratio, worst_group = _min_impact_ratio(results)
        total_evaluated, total_flagged = _count_evaluated_groups(results)
        categories = _category_names_from_tables(results)
        category_str = ", ".join(categories) if categories else "the provided categories"
        total_records = results.get("total_records", 0)

        # Overall color / label
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
        excluded_count = results.get("excluded_count", 0)
        unknown_count = results.get("unknown_count", 0)
        if excluded_count == 0 and unknown_count == 0:
            dc_color = "green"
            dc_label = "Complete"
        else:
            dc_color = "amber"
            dc_label = "Gaps noted"

        # Narrative
        severity = "substantially" if min_ratio < 0.50 else ""
        flag_detail = ""
        if total_flagged > 0:
            below_phrase = f" {severity} below" if severity else " below"
            flag_detail = (
                f" {total_flagged} group(s) were flagged as having an impact ratio"
                f"{below_phrase} the threshold."
                f" The lowest impact ratio observed was {min_ratio:.3f}"
                f" for {worst_group}."
            )

        narrative = (
            f"This audit analyzed {total_records:,} records across {category_str}."
            f"{flag_detail}"
        )

        return {
            "color": color,
            "label": label,
            "narrative": narrative,
            "data_completeness": {
                "color": dc_color,
                "label": dc_label,
            },
        }

    # --------------------------------------------------------------------- #
    # scope_in
    # --------------------------------------------------------------------- #

    def scope_in(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> List[str]:
        items: List[str] = []

        # Categories tested
        categories = _category_names_from_tables(results)
        if categories:
            items.append(f"Categories tested: {', '.join(categories)}")

        # Intersectional analysis
        intersectional = config.get("intersectional", {})
        if intersectional.get("required", False):
            dims = intersectional.get("dimensions", [])
            dim_str = " \u00d7 ".join(dims) if dims else "configured dimensions"
            items.append(f"Intersectional analysis: {dim_str}")

        # Metric used
        metric_map = {
            "selection_rate": "Selection rate (4/5ths rule)",
            "scoring_rate": "Scoring rate (LL144 alternative)",
            "fairness_metrics": "Fairness metrics (TPR / FPR / equalized odds)",
        }
        metric_key = config.get("metric", "selection_rate")
        items.append(f"Metric used: {metric_map.get(metric_key, metric_key)}")

        # Threshold
        threshold = config.get("threshold", 0.80)
        items.append(f"Threshold value: {threshold}")

        # Data period
        start = config.get("dataDateRangeStart", "")
        end = config.get("dataDateRangeEnd", "")
        if start or end:
            items.append(f"Data period: {start} to {end}")

        return items

    # --------------------------------------------------------------------- #
    # scope_out
    # --------------------------------------------------------------------- #

    def scope_out(self) -> List[str]:
        return [
            "Does not certify the assessed tool as \u201cbias-free\u201d",
            "Does not test categories beyond those provided in the dataset",
            "Does not determine whether the system is an AEDT under LL144",
            "Not intended for compliance with other legislation",
        ]

    # --------------------------------------------------------------------- #
    # checklist
    # --------------------------------------------------------------------- #

    def checklist(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        items: List[Dict[str, str]] = []

        # 1. System description
        has_name = bool(config.get("systemName"))
        has_desc = bool(config.get("systemDescription"))
        if has_name and has_desc:
            items.append({
                "requirement": "System description provided",
                "status": "pass",
                "note": "System name and description are documented.",
            })
        elif has_name:
            items.append({
                "requirement": "System description provided",
                "status": "warning",
                "note": "System name provided but description is missing.",
            })
        else:
            items.append({
                "requirement": "System description provided",
                "status": "warning",
                "note": "System name and description are not provided.",
            })

        # 2. Sex / gender category
        if _has_category(results, "sex") or _has_category(results, "gender"):
            items.append({
                "requirement": "Sex/gender category tested",
                "status": "pass",
                "note": "Results include sex/gender analysis.",
            })
        else:
            items.append({
                "requirement": "Sex/gender category tested",
                "status": "warning",
                "note": "LL144 requires testing by sex category.",
            })

        # 3. Race / ethnicity category
        if _has_category(results, "race") or _has_category(results, "ethnicity"):
            items.append({
                "requirement": "Race/ethnicity category tested",
                "status": "pass",
                "note": "Results include race/ethnicity analysis.",
            })
        else:
            items.append({
                "requirement": "Race/ethnicity category tested",
                "status": "warning",
                "note": "LL144 requires testing by race/ethnicity category.",
            })

        # 4. Intersectional analysis
        intersectional = config.get("intersectional", {})
        if intersectional.get("required", False):
            items.append({
                "requirement": "Intersectional analysis performed",
                "status": "pass",
                "note": "Intersectional analysis was included.",
            })
        else:
            items.append({
                "requirement": "Intersectional analysis performed",
                "status": "warning",
                "note": "LL144 requires intersectional analysis.",
            })

        # 5. Auditor independence
        auditor_type = config.get("auditorType", "").lower()
        if auditor_type in ("third_party", "internal"):
            items.append({
                "requirement": "Auditor independence",
                "status": "pass",
                "note": f"Auditor type: {auditor_type}.",
            })
        elif auditor_type == "self":
            items.append({
                "requirement": "Auditor independence",
                "status": "warning",
                "note": "LL144 requires an independent auditor.",
            })
        else:
            items.append({
                "requirement": "Auditor independence",
                "status": "warning",
                "note": "Auditor independence not declared.",
            })

        # 6. Timeliness
        items.append({
            "requirement": "Audit timeliness",
            "status": "info",
            "note": "Ensure this audit is no more than 1 year old at time of AEDT use.",
        })

        return items

    # --------------------------------------------------------------------- #
    # required_categories
    # --------------------------------------------------------------------- #

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

    # --------------------------------------------------------------------- #
    # threshold_explanation
    # --------------------------------------------------------------------- #

    def threshold_explanation(self, threshold: float) -> str:
        return (
            f"<p>This audit uses a threshold of <strong>{threshold}</strong>, "
            "derived from the <strong>4/5ths rule</strong> (also known as the "
            "EEOC adverse impact standard). Under this rule, a selection rate "
            "for any demographic group that is less than four-fifths (80%) of "
            "the rate for the group with the highest selection rate is generally "
            "regarded as evidence of adverse impact.</p>"
            f"<p>A threshold of {threshold} means that any group whose impact "
            f"ratio falls below {threshold} is flagged for further review. "
            "A flag does not automatically indicate a legal violation; it is a "
            "statistical indicator that warrants closer examination.</p>"
            "<p>Reference: Uniform Guidelines on Employee Selection Procedures "
            "(1978), 29 C.F.R. Part 1607, \u00a7\u00a060-3.4.D.</p>"
        )

    # --------------------------------------------------------------------- #
    # flag_explanation
    # --------------------------------------------------------------------- #

    def flag_explanation(
        self,
        group: str,
        ratio: float,
        highest_group: str,
        highest_rate: float,
        threshold: float,
    ) -> str:
        pct = ratio * 100
        severity = "substantially below" if ratio < 0.50 else "below"
        return (
            f"<strong>{group}</strong>: impact ratio {ratio:.3f} \u2014 "
            f"this group is selected at {pct:.1f}% the rate of the highest "
            f"group ({highest_group}, {highest_rate * 100:.1f}%), which is "
            f"{severity} the {threshold:.2f} threshold."
        )

    # --------------------------------------------------------------------- #
    # recommended_actions
    # --------------------------------------------------------------------- #

    def recommended_actions(
        self, has_flags: bool, results: Dict[str, Any]
    ) -> List[str]:
        if has_flags:
            return [
                "Investigate root causes of the observed disparities in selection or scoring rates.",
                (
                    "Document any business necessity defense for the continued use of the tool "
                    "(see 42 U.S.C. \u00a7\u00a02000e-2(k))."
                ),
                "Consider alternative selection procedures with less adverse impact.",
                (
                    "Ensure the audit summary is publicly posted on the employer\u2019s website "
                    "(NYC Admin Code \u00a7\u00a020-871(b)(3))."
                ),
                (
                    "Provide notice to candidates at least 10 business days before the tool\u2019s use "
                    "(6 RCNY \u00a7\u00a05-303)."
                ),
            ]

        return [
            "Document this audit as compliance evidence for NYC Local Law 144.",
            (
                "Schedule the next annual audit before the current one expires "
                "(NYC Admin Code \u00a7\u00a020-871(b)(2))."
            ),
            "Continue monitoring selection and scoring rates for emerging disparities.",
            (
                "Ensure the audit summary is publicly posted on the employer\u2019s website "
                "(NYC Admin Code \u00a7\u00a020-871(b)(3))."
            ),
            (
                "Provide notice to candidates at least 10 business days before the tool\u2019s use "
                "(6 RCNY \u00a7\u00a05-303)."
            ),
        ]

    # --------------------------------------------------------------------- #
    # regulatory_context
    # --------------------------------------------------------------------- #

    def regulatory_context(self) -> List[str]:
        return [
            (
                "<p>NYC Local Law 144 (Int. 1894-A), codified at NYC Admin Code "
                "\u00a7\u00a7\u00a020-870 through 20-874, requires employers and "
                "employment agencies in New York City that use an automated employment "
                "decision tool (AEDT) to conduct an annual bias audit, publicly post "
                "the audit summary on their website, and provide notice to candidates "
                "before the tool is used.</p>"
            ),
            (
                "<p>An \u201cindependent auditor\u201d under LL144 is a person or entity "
                "that is not involved in using or developing the AEDT and that exercises "
                "objective and impartial judgment in conducting the bias audit "
                "(6 RCNY \u00a7\u00a05-300).</p>"
            ),
            (
                "<p>The <strong>4/5ths rule</strong> originates from the EEOC Uniform "
                "Guidelines on Employee Selection Procedures (1978), "
                "\u00a7\u00a060-3.4.D. It states that a selection rate for any "
                "demographic group that is less than four-fifths of the rate for the "
                "group with the highest rate is generally regarded as evidence of "
                "adverse impact.</p>"
            ),
            (
                "<p>A flag in this audit is a <strong>statistical indicator</strong> "
                "that a particular group\u2019s selection or scoring rate falls below "
                "the established threshold relative to the highest-performing group. "
                "It does not automatically constitute a legal violation or proof of "
                "intentional discrimination.</p>"
            ),
        ]

    # --------------------------------------------------------------------- #
    # glossary
    # --------------------------------------------------------------------- #

    def glossary(self) -> List[Tuple[str, str]]:
        return [
            (
                "AEDT (Automated Employment Decision Tool)",
                "A computational process, derived from machine learning, statistical "
                "modeling, data analytics, or artificial intelligence, that issues "
                "simplified output to substantially assist or replace discretionary "
                "decision making for employment decisions (NYC Admin Code \u00a7\u00a020-870).",
            ),
            (
                "Adverse impact",
                "A substantially different rate of selection in hiring, promotion, or "
                "other employment decision that works to the disadvantage of members "
                "of a protected group.",
            ),
            (
                "Impact ratio",
                "The ratio of a demographic group\u2019s selection or scoring rate to "
                "the rate of the group with the highest rate. A ratio below the "
                "threshold indicates potential adverse impact.",
            ),
            (
                "Selection rate",
                "The proportion of applicants or candidates in a demographic group who "
                "are selected (hired, promoted, or advanced) by the tool.",
            ),
            (
                "Scoring rate",
                "The proportion of applicants or candidates in a demographic group who "
                "receive a score above the median score, as reported to the employer.",
            ),
            (
                "4/5ths rule",
                "A guideline from the EEOC Uniform Guidelines (1978) stating that a "
                "selection rate below 80% of the highest group\u2019s rate is generally "
                "regarded as evidence of adverse impact.",
            ),
            (
                "Intersectional analysis",
                "An analysis that examines the combined effect of two or more "
                "demographic categories (e.g., race \u00d7 sex) rather than each "
                "category independently.",
            ),
        ]

    # --------------------------------------------------------------------- #
    # conclusion_summary
    # --------------------------------------------------------------------- #

    def conclusion_summary(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> str:
        system_name = config.get("systemName", "the assessed system")
        total_records = results.get("total_records", 0)
        categories = _category_names_from_tables(results)
        category_str = ", ".join(categories) if categories else "the provided categories"
        total_evaluated, total_flagged = _count_evaluated_groups(results)

        if total_flagged == 0:
            return (
                f"This audit of {system_name} analyzed {total_records:,} records "
                f"across {category_str}. No demographic group was found to have an "
                "impact ratio below the 0.80 threshold. While this result is favorable, "
                "it does not guarantee the absence of bias. Continued monitoring and "
                "periodic re-auditing are recommended to ensure ongoing compliance "
                "with NYC Local Law 144."
            )

        min_ratio, worst_group = _min_impact_ratio(results)
        return (
            f"This audit of {system_name} analyzed {total_records:,} records "
            f"across {category_str}. {total_flagged} of {total_evaluated} "
            "evaluated groups were flagged as having an impact ratio below the "
            f"threshold. The most significant disparity was observed for "
            f"{worst_group} (impact ratio: {min_ratio:.3f}). "
            "These findings warrant further investigation and may require "
            "remedial action to ensure compliance with NYC Local Law 144."
        )

    # --------------------------------------------------------------------- #
    # additional_limitations
    # --------------------------------------------------------------------- #

    def additional_limitations(self) -> List[str]:
        return [
            (
                "This audit is scoped to NYC Local Law 144 and the EEOC 4/5ths rule. "
                "It does not evaluate compliance with other federal, state, or local "
                "anti-discrimination laws, nor does it assess the tool\u2019s validity "
                "or job-relatedness under the Uniform Guidelines on Employee Selection "
                "Procedures."
            ),
        ]
