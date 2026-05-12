"""VerifyWise Python SDK — AI governance and LLM evaluation platform."""

from .client import VerifyWiseClient
from .exceptions import (
    AuthenticationError,
    NotFoundError,
    ServerError,
    TimeoutError,
    ValidationError,
    VerifyWiseError,
)
from .models import (
    ArenaComparison,
    BiasAudit,
    Dataset,
    EvalResults,
    Experiment,
    MetricResult,
    ModelConfig,
    Org,
    Project,
    Report,
    Scorer,
)

__version__ = "0.1.0"

__all__ = [
    "VerifyWiseClient",
    "VerifyWiseError",
    "AuthenticationError",
    "NotFoundError",
    "ValidationError",
    "ServerError",
    "TimeoutError",
    "Experiment",
    "EvalResults",
    "MetricResult",
    "Dataset",
    "ModelConfig",
    "Scorer",
    "Report",
    "Project",
    "Org",
    "ArenaComparison",
    "BiasAudit",
]
