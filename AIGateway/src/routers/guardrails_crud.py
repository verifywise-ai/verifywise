"""
CRUD router for AI Gateway guardrail rules, settings, logs, and stats.
Handles management operations (create/update/delete rules, settings, purge logs).
NOTE: scan/test routes live in routers/guardrails.py — this file is guardrails_crud.py
      to avoid a naming conflict.
"""

import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Query, Request
from middlewares.auth import verify_internal_key
from utils.auth import get_org_id, get_user_id, require_admin
from utils.change_history import record_guardrail_change
from utils.notifications import notify_config_change

from crud.guardrails import (
    create_guardrail,
    delete_guardrail,
    get_active_guardrails,
    get_all_guardrails,
    get_guardrail_logs,
    get_guardrail_settings,
    get_guardrail_stats,
    get_guardrail_stats_by_day,
    get_guardrail_stats_by_type,
    purge_guardrail_logs,
    update_guardrail,
    upsert_guardrail_settings,
)

router = APIRouter(prefix="/guardrails", tags=["guardrails-crud"])

FRONTEND_URL = "http://localhost:5173"

VALID_GUARDRAIL_TYPES = {"pii", "content_filter"}
VALID_ACTIONS = {"block", "mask"}


def get_date_range(period: str) -> tuple[datetime, datetime]:
    """Return (start_date, end_date) UTC datetimes for a named period."""
    now = datetime.now(timezone.utc)

    if period == "24h":
        return now - timedelta(hours=24), now
    elif period == "7d":
        return now - timedelta(days=7), now
    elif period == "30d":
        return now - timedelta(days=30), now
    elif period == "90d":
        return now - timedelta(days=90), now
    else:
        # Default: last 30 days
        return now - timedelta(days=30), now


def _validate_regex(pattern: str) -> bool:
    """Return True if pattern is a valid Python/PCRE regex, False otherwise."""
    try:
        re.compile(pattern)
        return True
    except re.error:
        return False


# ---------------------------------------------------------------------------
# GET /guardrails/  — list all rules
# ---------------------------------------------------------------------------


@router.get("")
async def list_guardrails(request: Request):
    verify_internal_key(request)
    org_id = get_org_id(request)

    rules = await get_all_guardrails(org_id)
    return {"rules": rules}


# ---------------------------------------------------------------------------
# POST /guardrails/  — create rule (admin)
# ---------------------------------------------------------------------------


@router.post("")
async def create_guardrail_rule(request: Request):
    verify_internal_key(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)
    require_admin(request)

    body = await request.json()

    # Validate guardrail_type
    guardrail_type = body.get("guardrail_type", "")
    if guardrail_type not in VALID_GUARDRAIL_TYPES:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=400,
            detail=f"guardrail_type must be one of {sorted(VALID_GUARDRAIL_TYPES)}",
        )

    # Validate action
    action = body.get("action", "block")
    if action not in VALID_ACTIONS:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=400,
            detail=f"action must be one of {sorted(VALID_ACTIONS)}",
        )

    # Validate regex pattern if content_filter
    if guardrail_type == "content_filter":
        config = body.get("config", {})
        pattern = config.get("pattern") if isinstance(config, dict) else None
        if pattern and not _validate_regex(pattern):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=400,
                detail=f"Invalid regex pattern: {pattern!r}",
            )

    rule = await create_guardrail(
        org_id,
        {**body, "created_by": user_id},
    )

    await notify_config_change(
        org_id=org_id,
        user_id=user_id,
        entity="guardrail",
        action="created",
        detail={"rule_id": rule.get("id"), "name": rule.get("name")},
        frontend_url=FRONTEND_URL,
    )

    return {"rule": rule}


# ---------------------------------------------------------------------------
# PATCH /guardrails/{rule_id}  — update rule (admin)
# ---------------------------------------------------------------------------


@router.patch("/{rule_id}")
async def update_guardrail_rule(rule_id: int, request: Request):
    verify_internal_key(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)
    require_admin(request)

    body = await request.json()

    # Validate action if provided
    if "action" in body and body["action"] not in VALID_ACTIONS:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=400,
            detail=f"action must be one of {sorted(VALID_ACTIONS)}",
        )

    # Validate regex if config contains a pattern
    config = body.get("config", {})
    if isinstance(config, dict):
        pattern = config.get("pattern")
        if pattern and not _validate_regex(pattern):
            from fastapi import HTTPException

            raise HTTPException(
                status_code=400,
                detail=f"Invalid regex pattern: {pattern!r}",
            )

    updated = await update_guardrail(org_id, rule_id, body)

    if updated is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Guardrail rule not found")

    # Record change history
    await record_guardrail_change(
        organization_id=org_id,
        guardrail_id=rule_id,
        changed_by=user_id,
        action="updated",
    )

    # Notify on is_active toggle
    if "is_active" in body:
        toggle_label = "enabled" if body["is_active"] else "disabled"
        await notify_config_change(
            org_id=org_id,
            user_id=user_id,
            entity="guardrail",
            action=toggle_label,
            detail={"rule_id": rule_id, "name": updated.get("name")},
            frontend_url=FRONTEND_URL,
        )

    return {"rule": updated}


# ---------------------------------------------------------------------------
# DELETE /guardrails/{rule_id}  — delete rule (admin)
# ---------------------------------------------------------------------------


@router.delete("/{rule_id}")
async def delete_guardrail_rule(rule_id: int, request: Request):
    verify_internal_key(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)
    require_admin(request)

    deleted = await delete_guardrail(org_id, rule_id)

    if not deleted:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Guardrail rule not found")

    await notify_config_change(
        org_id=org_id,
        user_id=user_id,
        entity="guardrail",
        action="deleted",
        detail={"rule_id": rule_id},
        frontend_url=FRONTEND_URL,
    )

    return {"deleted": True, "rule_id": rule_id}


# ---------------------------------------------------------------------------
# GET /guardrails/settings  — get settings
# ---------------------------------------------------------------------------


@router.get("/settings")
async def read_guardrail_settings(request: Request):
    verify_internal_key(request)
    org_id = get_org_id(request)

    settings = await get_guardrail_settings(org_id)
    return {"settings": settings}


# ---------------------------------------------------------------------------
# PUT /guardrails/settings  — upsert settings (admin)
# ---------------------------------------------------------------------------


@router.put("/settings")
async def write_guardrail_settings(request: Request):
    verify_internal_key(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)
    require_admin(request)

    body = await request.json()

    settings = await upsert_guardrail_settings(org_id, body)

    await notify_config_change(
        org_id=org_id,
        user_id=user_id,
        entity="guardrail_settings",
        action="updated",
        detail={"settings": settings},
        frontend_url=FRONTEND_URL,
    )

    return {"settings": settings}


# ---------------------------------------------------------------------------
# GET /guardrails/logs  — get logs (limit/offset query params, max 200)
# ---------------------------------------------------------------------------


@router.get("/logs")
async def read_guardrail_logs(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    verify_internal_key(request)
    org_id = get_org_id(request)

    logs = await get_guardrail_logs(org_id, limit=limit, offset=offset)
    return {"logs": logs, "limit": limit, "offset": offset}


# ---------------------------------------------------------------------------
# GET /guardrails/stats  — get stats (period query param)
# ---------------------------------------------------------------------------


@router.get("/stats")
async def read_guardrail_stats(
    request: Request,
    period: str = Query(default="30d"),
):
    verify_internal_key(request)
    org_id = get_org_id(request)

    start_date, end_date = get_date_range(period)

    summary, by_type, by_day = await _gather_stats(org_id, start_date, end_date)

    return {
        "period": period,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "summary": summary,
        "byType": by_type,
        "byDay": by_day,
    }


async def _gather_stats(
    org_id: int, start_date: datetime, end_date: datetime
) -> tuple[dict, list[dict], list[dict]]:
    """Fetch all three stat queries concurrently."""
    import asyncio

    summary, by_type, by_day = await asyncio.gather(
        get_guardrail_stats(org_id, start_date, end_date),
        get_guardrail_stats_by_type(org_id, start_date, end_date),
        get_guardrail_stats_by_day(org_id, start_date, end_date),
    )
    return summary, by_type, by_day


# ---------------------------------------------------------------------------
# POST /guardrails/logs/purge  — purge logs (admin, uses settings for retention)
# ---------------------------------------------------------------------------


@router.post("/logs/purge")
async def purge_logs(request: Request):
    verify_internal_key(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)
    require_admin(request)

    # Read retention_days from settings (fall back to 90 if not configured)
    settings = await get_guardrail_settings(org_id)
    retention_days: int = 90
    if settings and settings.get("log_retention_days") is not None:
        retention_days = int(settings["log_retention_days"])

    total_deleted = await purge_guardrail_logs(org_id, retention_days)

    await notify_config_change(
        org_id=org_id,
        user_id=user_id,
        entity="guardrail_logs",
        action="purged",
        detail={"total_deleted": total_deleted, "retention_days": retention_days},
        frontend_url=FRONTEND_URL,
    )

    return {
        "purged": True,
        "total_deleted": total_deleted,
        "retention_days": retention_days,
    }
