"""Generic fallback bias audit report template for custom or unknown frameworks."""

from typing import Any, Dict, List, Tuple

from .base import BiasAuditReportTemplate
from .helpers import min_impact_ratio, category_names_from_tables, count_evaluated_groups


class GenericTemplate(BiasAuditReportTemplate):
    """Fallback template for custom or unknown compliance frameworks."""

    @property
    def framework_name(self) -> str:
        return "Custom framework"

    # Uses base class verdict() and flag_explanation() defaults

    # --------------------------------------------------------------------- #
    # scope_in
    # --------------------------------------------------------------------- #

    def scope_in(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> List[str]:
        items: List[str] = []

        # Categories tested
        categories = category_names_from_tables(results)
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
        categories = category_names_from_tables(results)
        category_str = ", ".join(categories) if categories else "the provided categories"
        total_evaluated, total_flagged = count_evaluated_groups(results)

        if total_flagged == 0:
            return (
                f"This audit of {system_name} analyzed {total_records:,} records "
                f"across {category_str}. No demographic group was found to have an "
                "impact ratio below the threshold. Continued monitoring and "
                "periodic re-auditing are recommended."
            )

        min_ratio, worst_group = min_impact_ratio(results)
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
