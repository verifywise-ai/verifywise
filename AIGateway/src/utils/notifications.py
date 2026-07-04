"""
Notification callbacks — fires HTTP requests to the Express backend's
internal notification endpoint. Fire-and-forget via httpx.
"""

import logging
from typing import Any, Optional

import httpx

from config import settings

logger = logging.getLogger("uvicorn")

_NOTIFY_URL = f"{settings.express_backend_url}/api/internal/ai-gateway/notify"
_TIMEOUT = 5.0  # seconds


async def _send_notification(payload: dict[str, Any]) -> None:
    """POST a notification payload to Express. Fire-and-forget."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                _NOTIFY_URL,
                json=payload,
                headers={
                    "x-internal-key": settings.ai_gateway_internal_key,
                    "Content-Type": "application/json",
                },
            )
            if resp.status_code >= 400:
                logger.warning(
                    f"Notification callback returned {resp.status_code}: {resp.text[:200]}"
                )
    except Exception as e:
        logger.warning(f"Notification callback failed (fire-and-forget): {e}")


async def notify_config_change(
    organization_id: Optional[int] = None,
    changed_by_user_id: Optional[int] = None,
    event: Optional[dict[str, Any]] = None,
    **kwargs: Any,
) -> None:
    """Notify admins of a config change (API key, endpoint, guardrail).

    Accepts both positional-style and keyword-style arguments to accommodate
    various callers (virtual_keys, endpoints, guardrails, api_keys, prompts).
    """
    org_id = organization_id or kwargs.get("org_id")
    user_id = changed_by_user_id or kwargs.get("user_id")

    # Build event dict from explicit event param or from kwargs
    if event is None:
        event = {}
        for k in ("action", "entity", "entity_type", "entity_name",
                   "entity_id", "detail", "payload", "frontend_url"):
            if k in kwargs:
                event[k] = kwargs[k]

    await _send_notification({
        "type": "config_change",
        "organization_id": org_id,
        "changed_by_user_id": user_id,
        "event": event,
    })


async def notify_budget_warning(
    organization_id: int,
    budget: dict[str, Any],
) -> None:
    """Notify admins that budget threshold has been crossed."""
    await _send_notification({
        "type": "budget_warning",
        "organization_id": organization_id,
        "budget": budget,
    })


async def notify_budget_exhausted(
    organization_id: int,
    budget: dict[str, Any],
) -> None:
    """Notify admins that budget hard limit has been hit."""
    await _send_notification({
        "type": "budget_exhausted",
        "organization_id": organization_id,
        "budget": budget,
    })


async def notify_guardrail_spike(
    organization_id: int,
    stats: dict[str, Any],
) -> None:
    """Notify admins of a guardrail detection spike."""
    await _send_notification({
        "type": "guardrail_spike",
        "organization_id": organization_id,
        "stats": stats,
    })


async def notify_approval_pending(
    organization_id: int,
    approval: dict[str, Any],
) -> None:
    """Notify admins that an MCP tool call is waiting for human approval."""
    await _send_notification({
        "type": "approval_pending",
        "organization_id": organization_id,
        "approval": approval,
    })


async def notify_virtual_key_budget_exhausted(
    organization_id: int,
    key_name: str,
    spend: float,
    limit: float,
) -> None:
    """Notify admins that a virtual key's budget is exhausted."""
    await _send_notification({
        "type": "virtual_key_budget_exhausted",
        "organization_id": organization_id,
        "key_name": key_name,
        "spend": spend,
        "limit": limit,
    })
