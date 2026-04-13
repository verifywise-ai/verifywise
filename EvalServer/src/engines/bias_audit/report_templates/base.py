"""Abstract base class that every framework template must implement."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple


class BiasAuditReportTemplate(ABC):
    """Base class for bias audit report templates.

    Each compliance framework (e.g. NYC LL144, EU AI Act) subclasses this
    and provides framework-specific content for the PDF report.
    """

    @property
    @abstractmethod
    def framework_name(self) -> str:
        """Return the human-readable name of the compliance framework."""
        ...

    @abstractmethod
    def verdict(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """Return an overall pass/fail verdict for the audit.

        Returns a dict with keys:
            - color: hex color string for the verdict badge
            - label: short verdict label (e.g. "PASS", "FAIL", "REVIEW NEEDED")
            - narrative: one-paragraph explanation of the verdict
            - data_completeness: float between 0 and 1 indicating data quality
        """
        ...

    @abstractmethod
    def scope_in(self, config: Dict[str, Any], results: Dict[str, Any]) -> List[str]:
        """Return a list of items that are in scope for this audit."""
        ...

    @abstractmethod
    def scope_out(self) -> List[str]:
        """Return a list of items that are explicitly out of scope."""
        ...

    @abstractmethod
    def checklist(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        """Return a compliance checklist for the framework.

        Each dict has keys:
            - requirement: description of the requirement
            - status: one of "met", "not_met", "partial", "not_applicable"
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

    @abstractmethod
    def threshold_explanation(self, threshold: float) -> str:
        """Return a plain-language explanation of the impact ratio threshold.

        Args:
            threshold: the numeric threshold value (e.g. 0.8).
        """
        ...

    @abstractmethod
    def flag_explanation(
        self,
        group: str,
        ratio: float,
        highest_group: str,
        highest_rate: float,
        threshold: float,
    ) -> str:
        """Return a plain-language explanation of why a specific group was flagged.

        Args:
            group: the demographic group that was flagged.
            ratio: the impact ratio for the flagged group.
            highest_group: the group with the highest selection rate.
            highest_rate: the highest selection rate value.
            threshold: the threshold that was violated.
        """
        ...

    @abstractmethod
    def recommended_actions(
        self, has_flags: bool, results: Dict[str, Any]
    ) -> List[str]:
        """Return a list of recommended next steps.

        Args:
            has_flags: whether any groups were flagged in the audit.
            results: the full audit results dict.
        """
        ...

    @abstractmethod
    def regulatory_context(self) -> List[str]:
        """Return paragraphs describing the regulatory background and legal context."""
        ...

    @abstractmethod
    def glossary(self) -> List[Tuple[str, str]]:
        """Return a glossary of terms as (term, definition) tuples."""
        ...

    @abstractmethod
    def conclusion_summary(
        self, config: Dict[str, Any], results: Dict[str, Any]
    ) -> str:
        """Return a concluding summary paragraph for the report.

        Args:
            config: the audit configuration dict.
            results: the full audit results dict.
        """
        ...

    @abstractmethod
    def additional_limitations(self) -> List[str]:
        """Return additional limitations or caveats specific to this framework."""
        ...
