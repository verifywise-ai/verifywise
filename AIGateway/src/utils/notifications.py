"""
Notification callbacks — fires HTTP requests to the Express backend's
internal notification endpoint. Fire-and-forget via httpx.
"""

import asyncio
import logging
from typing import Any, Optional

import httpx

from config import settings

logger = logging.getLogger("uvicorn")

_NOTIFY_URL = f"{settings.express_backend_url}/api/internal/ai-gateway/notify"
_TIMEOUT = 5.0  # seconds

# Notifications sent in the background; kept here so they are not garbage
# collected before they finish.
_background: set[asyncio.Task] = set()


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


# Entity key -> (label shown to admins, frontend path, button label). The
# backend's notifyConfigChange turns a path into a full link with FRONTEND_URL.
_CONFIG_ENTITIES: dict[str, tuple[str, str, str]] = {
    "api_key": ("API key", "/ai-gateway/settings", "View settings"),
    "endpoint": ("Endpoint", "/ai-gateway/endpoints", "View endpoints"),
    "virtual_key": ("Virtual key", "/ai-gateway/virtual-keys", "View virtual keys"),
    "guardrail": ("Guardrail rule", "/ai-gateway/guardrails", "View guardrails"),
    "guardrail_settings": ("Guardrail settings", "/ai-gateway/guardrails", "View guardrails"),
    "guardrail_logs": ("Guardrail logs", "/ai-gateway/logs?tab=guardrails", "View logs"),
    "prompt": ("Prompt", "/ai-gateway/prompts", "View prompts"),
    "mcp_server": ("MCP server", "/ai-gateway/mcp/servers", "View MCP servers"),
    "mcp_agent_key": ("Agent key", "/ai-gateway/mcp/agent-keys", "View agent keys"),
    "mcp_guardrail": ("Agent Control guardrail", "/ai-gateway/mcp/guardrails", "View guardrails"),
    "mcp_approval": ("Approval request", "/ai-gateway/mcp/approvals", "View approvals"),
}


# Changes that also email admins. Every config change gets an in-app notice;
# email is kept for changes that weaken or remove a control or change what the
# gateway can reach, so routine edits and approval decisions do not flood
# admin inboxes.
_EMAIL_EVENTS: frozenset[tuple[str, str]] = frozenset({
    ("mcp_agent_key", "revoked"),
    ("mcp_agent_key", "deleted"),
    ("mcp_agent_key", "enforcement_mode_changed"),
    ("virtual_key", "revoked"),
    ("virtual_key", "deleted"),
    ("api_key", "created"),
    ("api_key", "deleted"),
    ("mcp_server", "created"),
    ("mcp_server", "deleted"),
    ("guardrail", "deleted"),
    ("guardrail", "disabled"),
    ("mcp_guardrail", "deleted"),
})


def config_event(
    entity: str,
    action: str,
    name: Optional[str] = None,
    entity_id: Any = None,
    detail: Optional[str] = None,
) -> dict[str, Any]:
    """Build a config-change event in the shape the backend's
    notifyConfigChange reads (entityType, entityName, action, actionUrl,
    actionLabel, email, optional detail). `email` says whether admins also
    get an email (see _EMAIL_EVENTS). Without a name, the entity id stands in so
    the message still says which record changed."""
    label, path, button = _CONFIG_ENTITIES[entity]
    if not name and entity_id is not None:
        name = f"#{entity_id}"
    event: dict[str, Any] = {
        "entityType": label,
        "entityName": name or "",
        "action": action,
        "actionUrl": path,
        "actionLabel": button,
        "email": (entity, action) in _EMAIL_EVENTS,
    }
    if detail:
        event["detail"] = detail
    return event


async def notify_config_change(
    organization_id: Optional[int],
    changed_by_user_id: Optional[int],
    event: dict[str, Any],
) -> None:
    """Notify the organization's other admins of a gateway config change.
    Build `event` with config_event().

    Returns without waiting: the backend emails every admin before it replies,
    so awaiting it would hold up the admin request that made the change."""
    task = asyncio.create_task(_send_notification({
        "type": "config_change",
        "organization_id": organization_id,
        "changed_by_user_id": changed_by_user_id,
        "event": event,
    }))
    _background.add(task)
    task.add_done_callback(_background.discard)


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
