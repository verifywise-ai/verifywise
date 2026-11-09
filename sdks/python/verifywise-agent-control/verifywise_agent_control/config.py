"""Settings, read from the same environment variables as ``scripts/vw-tool-hook.sh``.

Explicit keyword arguments win over the environment. Invalid values never stop the
agent: they fall back to the default and log a warning. The exceptions are
``on_deny`` and ``approval_poll_interval``, which only come from code and are
rejected at construction.
"""

from __future__ import annotations

import dataclasses
import logging
import math
import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from ._logsafe import log_safe

logger = logging.getLogger("verifywise_agent_control")

ENV_GATEWAY_URL = "VW_GATEWAY_URL"
ENV_AGENT_KEY = "VW_AGENT_KEY"
ENV_FAIL_MODE = "VW_FAIL_MODE"
ENV_TIMEOUT = "VW_TIMEOUT"
ENV_APPROVAL_WAIT = "VW_APPROVAL_WAIT"
ENV_APPROVAL_FAIL_MODE = "VW_APPROVAL_FAIL_MODE"

DEFAULT_TIMEOUT = 3.0
DEFAULT_APPROVAL_WAIT = 120.0
DEFAULT_POLL_INTERVAL = 2.0
MIN_POLL_INTERVAL = 0.5
# The gateway caps json.dumps(tool_response) at this many bytes and cuts
# anything longer. The SDK keeps the envelope it sends a margin below that, so
# the gateway never cuts it again (which could split an escape sequence).
GATEWAY_RESULT_CAP_BYTES = 10240
MAX_RESULT_BYTES = 9216
DEFAULT_MAX_RESULT_BYTES = MAX_RESULT_BYTES
ON_DENY_VALUES = ("refuse", "raise")

_ENV_FIELDS = {
    "gateway_url": ENV_GATEWAY_URL,
    "agent_key": ENV_AGENT_KEY,
    "fail_mode": ENV_FAIL_MODE,
    "timeout": ENV_TIMEOUT,
    "approval_wait": ENV_APPROVAL_WAIT,
    "approval_fail_mode": ENV_APPROVAL_FAIL_MODE,
}


def _text(value: Any) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _number(value: Any, default: float, name: str, *, allow_zero: bool) -> float:
    if value is None or (isinstance(value, str) and not value.strip()):
        return default
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = math.nan
    if not math.isfinite(number) or number < 0 or (number == 0 and not allow_zero):
        logger.warning("Ignoring invalid %s=%s; using %s", name, log_safe(repr(value)), default)
        return default
    return number


def _poll_interval(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = math.nan
    if not math.isfinite(number) or number < MIN_POLL_INTERVAL:
        raise ValueError(
            f"approval_poll_interval must be at least {MIN_POLL_INTERVAL:g} seconds, got {value!r}"
        )
    return number


def _max_result_bytes(value: Any) -> int:
    number = int(_number(value, DEFAULT_MAX_RESULT_BYTES, "max_result_bytes", allow_zero=False))
    if number > MAX_RESULT_BYTES:
        logger.warning(
            "max_result_bytes=%s is above what the gateway stores without cutting; using %s",
            log_safe(value),
            MAX_RESULT_BYTES,
        )
        return MAX_RESULT_BYTES
    return number


@dataclass(frozen=True)
class Settings:
    """Connection and behaviour settings for Agent Control.

    Attributes:
        gateway_url: The URL VerifyWise is opened at (``VW_GATEWAY_URL``), e.g.
            ``https://verifywise.example.com``. In local development use the
            backend, e.g. ``http://localhost:3000``: the Vite dev server does
            not forward ``/v1``.
        agent_key: Agent key ``sk-mcp-...`` (``VW_AGENT_KEY``).
        fail_mode: ``open`` runs the tool when the gateway cannot decide; ``closed``
            refuses it (``VW_FAIL_MODE``, default ``open``).
        timeout: Seconds per gateway request (``VW_TIMEOUT``, default 3).
        approval_wait: Max seconds to wait for a human approval (``VW_APPROVAL_WAIT``, default 120).
        approval_fail_mode: What to do when no approval decision arrives in time
            (``VW_APPROVAL_FAIL_MODE``, default ``closed``).
        approval_poll_interval: Seconds between approval status polls (default 2,
            at least 0.5; a smaller value raises ``ValueError``).
        on_deny: ``refuse`` returns a refusal to the model; ``raise`` raises
            :class:`~verifywise_agent_control.VerifyWiseDenied`.
        max_result_bytes: The serialized result envelope sent to the gateway
            (``{"output": ...}`` or ``{"error": ...}``) is cut to fit this many
            bytes (default and maximum 9216, safely under the gateway's 10240).
    """

    gateway_url: str | None = None
    # Kept out of repr() so a logged Settings (or client) never shows the key.
    agent_key: str | None = dataclasses.field(default=None, repr=False)
    fail_mode: str = "open"
    timeout: float = DEFAULT_TIMEOUT
    approval_wait: float = DEFAULT_APPROVAL_WAIT
    approval_fail_mode: str = "closed"
    approval_poll_interval: float = DEFAULT_POLL_INTERVAL
    on_deny: str = "refuse"
    max_result_bytes: int = DEFAULT_MAX_RESULT_BYTES

    def __post_init__(self) -> None:
        url = _text(self.gateway_url)
        fix = {
            "gateway_url": url.rstrip("/") if url else None,
            "agent_key": _text(self.agent_key),
            # Same semantics as the shell hook: only "closed" closes the general
            # fail mode and only "open" opens the approval fail mode.
            "fail_mode": "closed" if (_text(self.fail_mode) or "").lower() == "closed" else "open",
            "approval_fail_mode": "open"
            if (_text(self.approval_fail_mode) or "").lower() == "open"
            else "closed",
            "timeout": _number(self.timeout, DEFAULT_TIMEOUT, "timeout", allow_zero=False),
            "approval_wait": _number(
                self.approval_wait, DEFAULT_APPROVAL_WAIT, "approval_wait", allow_zero=True
            ),
            "approval_poll_interval": _poll_interval(self.approval_poll_interval),
            "max_result_bytes": _max_result_bytes(self.max_result_bytes),
        }
        on_deny = (_text(self.on_deny) or "refuse").lower()
        if on_deny not in ON_DENY_VALUES:
            raise ValueError(f"on_deny must be one of {ON_DENY_VALUES}, got {self.on_deny!r}")
        fix["on_deny"] = on_deny
        for name, value in fix.items():
            object.__setattr__(self, name, value)

    @property
    def configured(self) -> bool:
        """True when both the gateway URL and the agent key are set."""
        return bool(self.gateway_url and self.agent_key)

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None, **overrides: Any) -> Settings:
        """Build settings from the environment; non-None keyword arguments win."""
        env = os.environ if env is None else env
        values: dict[str, Any] = {}
        for field, var in _ENV_FIELDS.items():
            if env.get(var) is not None:
                values[field] = env[var]
        values.update({k: v for k, v in overrides.items() if v is not None})
        return cls(**values)

    def replace(self, **overrides: Any) -> Settings:
        """A copy with the given non-None values changed."""
        return dataclasses.replace(self, **{k: v for k, v in overrides.items() if v is not None})
