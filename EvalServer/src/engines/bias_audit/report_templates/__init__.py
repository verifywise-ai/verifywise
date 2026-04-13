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
