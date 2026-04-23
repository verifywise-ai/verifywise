"""Abstract base class that every framework template must implement."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Tuple

from .helpers import min_impact_ratio, category_names_from_tables, count_evaluated_groups


class BiasAuditReportTemplate(ABC):
    """Base class for bias audit report templates.

    Each compliance framework (e.g. NYC LL144, EU AI Act) subclasses this
    and provides framework-specific content for the PDF report.

    Methods marked @abstractmethod MUST be overridden. Methods with default
    implementations CAN be overridden if the framework needs different behavior.
    """

    @property
    @abstractmethod
    def framework_name(self) -> str:
        """Return the human-readable name of the compliance framework."""
        ...

    # ------------------------------------------------------------------ verdict

    def verdict(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """Return an overall assessment verdict for the audit.

        Returns a dict with keys:
            - color: "green" | "amber" | "red"
            - label: short verdict label
            - narrative: one-paragraph explanation
            - data_completeness: dict with "color" and "label"

        Default implementation uses 4/5ths rule thresholds (0.80 / 0.50).
        Override to change the logic for frameworks with different standards.
        """
        min_ratio, worst_group = min_impact_ratio(results)
        total_evaluated, total_flagged = count_evaluated_groups(results)
        categories = category_names_from_tables(results)
        category_str = ", ".join(categories) if categories else "the provided categories"
        total_applicants = results.get("total_applicants", 0)

        if min_ratio >= 0.80:
            color = "green"
            label = "No adverse impact detected"
        elif min_ratio >= 0.50:
            color = "amber"
            label = "Adverse impact detected \u2014 review recommended"
        else:
            color = "red"
            label = "Significant adverse impact detected \u2014 action required"

        excluded_count = results.get("excluded_count", 0)
        unknown_count = results.get("unknown_count", 0)
        if excluded_count == 0 and unknown_count == 0:
            dc_color, dc_label = "green", "Complete"
        else:
            dc_color, dc_label = "amber", "Gaps noted"

        if total_flagged == 0:
            narrative = (
                f"This audit analyzed {total_applicants:,} records across {category_str}. "
                f"No group was found to have an impact ratio below the configured threshold."
            )
        else:
            severity = "substantially " if min_ratio < 0.50 else ""
            narrative = (
                f"This audit analyzed {total_applicants:,} records across {category_str}. "
                f"{total_flagged} group(s) were flagged as having an impact ratio "
                f"{severity}below the threshold. "
                f"The lowest impact ratio observed was {min_ratio:.3f} for {worst_group}."
            )

        return {
            "color": color,
            "label": label,
            "narrative": narrative,
            "data_completeness": {"color": dc_color, "label": dc_label},
        }

    # ------------------------------------------------------------------ scope

    @abstractmethod
    def scope_in(self, config: Dict[str, Any], results: Dict[str, Any]) -> List[str]:
        """Return a list of items that are in scope for this audit."""
        ...

    @abstractmethod
    def scope_out(self) -> List[str]:
        """Return a list of items that are explicitly out of scope."""
        ...

    # ------------------------------------------------------------------ checklist

    @abstractmethod
    def checklist(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        """Return a compliance checklist for the framework.

        Each dict has keys:
            - requirement: description of the requirement
            - status: "pass" | "warning" | "info"
            - note: additional context or explanation
        """
        ...

    @abstractmethod
    def required_categories(self) -> Dict[str, List[str]]:
        """Return the demographic categories required by the framework.

        Keys are category types (e.g. "sex", "race"), values are lists of
        required group labels within that category.
        """
        ...

    # ------------------------------------------------------------------ methodology

    def metric_label(self, metric: str) -> str:
        """Return a plain-English label for the metric used in this audit.

        Default labels use LL144/EEOC language. Override in frameworks that
        use different terminology (e.g., Colorado SB 21-169 uses rate-difference
        framing, not 4/5ths rule).
        """
        return {
            "selection_rate": "Selection rate (4/5ths rule)",
            "scoring_rate": "Scoring rate (LL144 alternative)",
            "fairness_metrics": "Fairness metrics (TPR / FPR / equalized odds)",
        }.get(metric, metric)

    @abstractmethod
    def threshold_explanation(self, threshold: float) -> str:
        """Return a plain-language explanation of the impact ratio threshold."""
        ...

    # ------------------------------------------------------------------ results

    def flag_explanation(
        self,
        group: str,
        ratio: float,
        highest_group: str,
        highest_rate: float,
        threshold: float,
    ) -> str:
        """Return a one-line prose explanation for a flagged group.

        Default implementation works for any threshold-based framework.
        Override only if the framework uses a different explanation style.
        """
        pct = ratio * 100
        severity = "substantially below" if ratio < 0.50 else "below"
        return (
            f"<b>{group}</b>: impact ratio {ratio:.3f} \u2014 "
            f"this group is selected at {pct:.1f}% the rate of the highest "
            f"group ({highest_group}, {highest_rate * 100:.1f}%), which is "
            f"{severity} the {threshold:.2f} threshold."
        )

    # ------------------------------------------------------------------ actions

    @abstractmethod
    def recommended_actions(
        self, has_flags: bool, results: Dict[str, Any]
    ) -> List[str]:
        """Return a list of recommended next steps."""
        ...

    # ------------------------------------------------------------------ context

    @abstractmethod
    def regulatory_context(self) -> List[str]:
        """Return paragraphs describing the regulatory background."""
        ...

    @abstractmethod
    def glossary(self) -> List[Tuple[str, str]]:
        """Return a glossary of terms as (term, definition) tuples."""
        ...

    # ------------------------------------------------------------------ conclusion

    @abstractmethod
    def conclusion_summary(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> str:
        """Return a concluding summary paragraph for the report."""
        ...

    @abstractmethod
    def additional_limitations(self) -> List[str]:
        """Return additional limitations specific to this framework."""
        ...
