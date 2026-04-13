"""Generic fallback bias audit report template for custom or unknown frameworks."""

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
                group_name = row.get("category_name", "")

    return (min_ratio, group_name)


def _category_names_from_tables(results: Dict[str, Any]) -> List[str]:
    """Extract non-intersectional category titles from results tables."""
    names: List[str] = []
    for table in results.get("tables", []):
        title = table.get("title", "")
        key = table.get("category_key", "")
        # Skip intersectional tables
        if key == "intersectional" or " x " in key.lower() or "\u00d7" in key.lower():
            continue
        if title and title not in names:
            names.append(title)
    return names


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


class GenericTemplate(BiasAuditReportTemplate):
    """Fallback template for custom or unknown compliance frameworks."""

    @property
    def framework_name(self) -> str:
        return "Custom framework"

    # --------------------------------------------------------------------- #
    # verdict
    # --------------------------------------------------------------------- #

    def verdict(self, results: Dict[str, Any]) -> Dict[str, Any]:
        min_ratio, worst_group = _min_impact_ratio(results)
        total_evaluated, total_flagged = _count_evaluated_groups(results)
        categories = _category_names_from_tables(results)
        category_str = ", ".join(categories) if categories else "the provided categories"
        total_records = results.get("total_applicants", 0)

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

        # Metric used
        metric_key = config.get("metric", "selection_rate")
        metric_label = metric_key.replace("_", " ")
        items.append(f"Metric used: {metric_label}")

        # Threshold
        threshold = config.get("threshold", 0.80)
        items.append(f"Threshold value: {threshold}")

        return items

    # --------------------------------------------------------------------- #
    # scope_out
    # --------------------------------------------------------------------- #

    def scope_out(self) -> List[str]:
        return [
            "Does not certify the assessed tool as \u201cbias-free\u201d",
            "Does not test categories beyond those provided in the dataset",
        ]

    # --------------------------------------------------------------------- #
    # checklist
    # --------------------------------------------------------------------- #

    def checklist(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        return []

    # --------------------------------------------------------------------- #
    # required_categories
    # --------------------------------------------------------------------- #

    def required_categories(self) -> Dict[str, List[str]]:
        return {}

    # --------------------------------------------------------------------- #
    # threshold_explanation
    # --------------------------------------------------------------------- #

    def threshold_explanation(self, threshold: float) -> str:
        return (
            f"<p>Groups with an impact ratio below <strong>{threshold:.2f}</strong> "
            "are flagged as potentially exhibiting adverse impact. The impact ratio "
            "compares a group\u2019s selection or scoring rate to that of the "
            "highest-performing group. A flag is a statistical indicator that warrants "
            "further review; it does not automatically indicate a violation.</p>"
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
                "Determine whether the disparities are attributable to legitimate, non-discriminatory factors.",
                "Consider alternative selection procedures with less adverse impact.",
                "Document the findings, analysis, and any remedial actions taken.",
            ]

        return [
            "Document this audit as evidence of ongoing bias monitoring.",
            "Schedule periodic re-audits to detect emerging disparities.",
        ]

    # --------------------------------------------------------------------- #
    # regulatory_context
    # --------------------------------------------------------------------- #

    def regulatory_context(self) -> List[str]:
        return []

    # --------------------------------------------------------------------- #
    # glossary
    # --------------------------------------------------------------------- #

    def glossary(self) -> List[Tuple[str, str]]:
        return [
            (
                "Impact ratio",
                "The ratio of a demographic group\u2019s selection or scoring rate to "
                "the rate of the group with the highest rate. A ratio below the "
                "threshold indicates potential adverse impact.",
            ),
            (
                "Adverse impact",
                "A substantially different rate of selection in hiring, promotion, or "
                "other employment decision that works to the disadvantage of members "
                "of a protected group.",
            ),
        ]

    # --------------------------------------------------------------------- #
    # conclusion_summary
    # --------------------------------------------------------------------- #

    def conclusion_summary(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> str:
        system_name = config.get("systemName", "the assessed system")
        total_records = results.get("total_applicants", 0)
        categories = _category_names_from_tables(results)
        category_str = ", ".join(categories) if categories else "the provided categories"
        total_evaluated, total_flagged = _count_evaluated_groups(results)

        if total_flagged == 0:
            return (
                f"This audit of {system_name} analyzed {total_records:,} records "
                f"across {category_str}. No demographic group was found to have an "
                "impact ratio below the threshold. Continued monitoring and "
                "periodic re-auditing are recommended."
            )

        min_ratio, worst_group = _min_impact_ratio(results)
        return (
            f"This audit of {system_name} analyzed {total_records:,} records "
            f"across {category_str}. {total_flagged} of {total_evaluated} "
            "evaluated groups were flagged as having an impact ratio below the "
            f"threshold. The most significant disparity was observed for "
            f"{worst_group} (impact ratio: {min_ratio:.3f}). "
            "These findings warrant further investigation."
        )

    # --------------------------------------------------------------------- #
    # additional_limitations
    # --------------------------------------------------------------------- #

    def additional_limitations(self) -> List[str]:
        return []
