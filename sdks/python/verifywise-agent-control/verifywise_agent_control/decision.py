"""The outcome of checking one tool call with the gateway."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

REFUSAL_PREFIX = "Blocked by VerifyWise policy: "

# Decision.status values
ALLOW = "allow"  # gateway allowed (possibly in monitor mode)
DENY = "deny"  # gateway denied (guardrail, tool list, ...)
APPROVED = "approved"  # a human approved the call
APPROVAL_DENIED = "approval_denied"  # a human denied the call
APPROVAL_EXPIRED = "approval_expired"  # the approval request expired; approval fail mode applied
APPROVAL_TIMEOUT = "approval_timeout"  # no decision within approval_wait; approval fail mode applied
RATE_LIMITED = "rate_limited"  # gateway rate limit; general fail mode applied
GATEWAY_ERROR = "gateway_error"  # unreachable / non-200 / bad reply / not configured; fail mode applied
AUTH_REJECTED = "auth_rejected"  # gateway rejected the agent key (HTTP 401/403); always refused
SDK_ERROR = "sdk_error"  # a bug inside the SDK; always refused (not a gateway outage)
ARGUMENTS_UNSENDABLE = "arguments_unsendable"  # arguments not representable exactly as JSON; always refused
ARGUMENTS_CHANGED = "arguments_changed"  # arguments changed between the check and the run; refused


@dataclass(frozen=True)
class Decision:
    """Whether a tool call may run, and why.

    Attributes:
        allowed: Run the tool when True.
        status: One of the status constants in this module.
        reason: Human-readable reason, set on every refusal.
        approval_id: The approval request id when the call needed approval.
        monitored: The gateway's ``monitored`` block when the agent key is in
            monitor-only mode (what would have happened), else None.
        fail_mode_applied: True when the outcome came from a fail mode rather
            than from a policy decision.
        checked_arguments: On an allowed decision that reached the gateway, the
            exact JSON of the arguments it checked.
    """

    allowed: bool
    status: str = ALLOW
    reason: str | None = None
    approval_id: str | None = None
    monitored: dict[str, Any] | None = None
    fail_mode_applied: bool = False
    # The exact JSON the gateway checked, on allowed decisions; adapters compare
    # it with the arguments right before the tool runs.
    checked_arguments: str | None = field(default=None, repr=False, compare=False)

    @property
    def refusal_message(self) -> str:
        """The text handed to the model instead of the tool's output."""
        return f"{REFUSAL_PREFIX}{self.reason or 'policy violation'}"


class VerifyWiseDenied(Exception):
    """Raised instead of returning a refusal when ``on_deny="raise"``."""

    def __init__(self, tool_name: str, decision: Decision):
        super().__init__(decision.refusal_message)
        self.tool_name = tool_name
        self.decision = decision
