"""
What counts as a simulated-dataset row. The upload check and the evaluation runner
both use this, and the wizard mirrors it
(Clients/.../EvalsDashboard/NewExperiment/simulatedScenarios.ts), so a file accepted
as simulated is run as simulated.
"""

from typing import Any


def is_scenario_row(row: Any) -> bool:
    """A simulated-dataset row: a non-empty scenario and no prompt or turns."""
    return (
        isinstance(row, dict)
        and bool(str(row.get("scenario") or "").strip())
        and not row.get("prompt")
        and not row.get("turns")
    )
