"""
Spend analytics router for the AI Gateway FastAPI service.
Prefix: /spend
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, status

from crud import spend as spend_crud
from database.db import get_db
from middlewares.auth import verify_internal_key
from utils.auth import get_org_id, require_admin

router = APIRouter(prefix="/spend", tags=["spend"])

# ---------------------------------------------------------------------------
# Period → date-range helper
# ---------------------------------------------------------------------------

_PERIOD_DAYS: dict[str, int] = {
    "1d": 1,
    "7d": 7,
    "30d": 30,
    "90d": 90,
}


def get_date_range(period: str) -> tuple[datetime, datetime]:
    """
    Convert a period string ("1d" | "7d" | "30d" | "90d") to
    (start_datetime, end_datetime) UTC datetime objects.

    Raises HTTPException 400 for unknown periods.
    """
    days = _PERIOD_DAYS.get(period)
    if days is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid period '{period}'. Must be one of: 1d, 7d, 30d, 90d.",
        )
    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(days=days)
    return start, now


# ---------------------------------------------------------------------------
# Tag-key validation
# ---------------------------------------------------------------------------

_TAG_KEY_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def _validate_tag_key(tag_key: str) -> None:
    if not _TAG_KEY_RE.match(tag_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "tag_key must be 1–64 characters and contain only "
                "letters, digits, underscores, or hyphens."
            ),
        )


# ---------------------------------------------------------------------------
# GET /spend/   — aggregated spend overview
# ---------------------------------------------------------------------------

@router.get("", summary="Spend summary dashboard")
async def spend_summary(
    request: Request,
    period: str = Query("7d", description="Time period: 1d | 7d | 30d | 90d"),
):
    """
    Return a comprehensive spend overview for the requesting organisation.
    All sub-queries run in parallel via asyncio.gather.
    """
    verify_internal_key(request)
    org_id = get_org_id(request)
    start_date, end_date = get_date_range(period)

    async with get_db() as db:
        (
            summary,
            by_day,
            by_model,
            by_provider,
            error_rate_by_day,
            tokens_per_endpoint,
        ) = await asyncio.gather(
            spend_crud.get_spend_summary(db, org_id, start_date, end_date),
            spend_crud.get_spend_by_day(db, org_id, start_date, end_date, period),
            spend_crud.get_spend_by_model(db, org_id, start_date, end_date),
            spend_crud.get_spend_by_provider(db, org_id, start_date, end_date),
            spend_crud.get_error_rate_by_day(db, org_id, start_date, end_date),
            spend_crud.get_tokens_per_request_by_endpoint(db, org_id, start_date, end_date),
        )

    return {
        "period": period,
        "start_date": start_date,
        "end_date": end_date,
        "summary": summary,
        "by_day": by_day,
        "by_model": by_model,
        "by_provider": by_provider,
        "error_rate_by_day": error_rate_by_day,
        "tokens_per_endpoint": tokens_per_endpoint,
    }


# ---------------------------------------------------------------------------
# GET /spend/by-endpoint
# ---------------------------------------------------------------------------

@router.get("/by-endpoint", summary="Spend broken down by endpoint")
async def spend_by_endpoint(
    request: Request,
    period: str = Query("7d", description="Time period: 1d | 7d | 30d | 90d"),
):
    """Return cost/requests/tokens grouped by endpoint for the given period."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    start_date, end_date = get_date_range(period)

    async with get_db() as db:
        rows = await spend_crud.get_spend_by_endpoint(db, org_id, start_date, end_date)

    return {
        "period": period,
        "start_date": start_date,
        "end_date": end_date,
        "data": rows,
    }


# ---------------------------------------------------------------------------
# GET /spend/by-user
# ---------------------------------------------------------------------------

@router.get("/by-user", summary="Spend broken down by user")
async def spend_by_user(
    request: Request,
    period: str = Query("7d", description="Time period: 1d | 7d | 30d | 90d"),
):
    """Return cost/requests/tokens grouped by user for the given period."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    start_date, end_date = get_date_range(period)

    async with get_db() as db:
        rows = await spend_crud.get_spend_by_user(db, org_id, start_date, end_date)

    return {
        "period": period,
        "start_date": start_date,
        "end_date": end_date,
        "data": rows,
    }


# ---------------------------------------------------------------------------
# GET /spend/by-tag
# ---------------------------------------------------------------------------

@router.get("/by-tag", summary="Spend broken down by a metadata tag")
async def spend_by_tag(
    request: Request,
    tag: str = Query(..., description="Metadata tag key (e.g. 'project', 'team')"),
    period: str = Query("7d", description="Time period: 1d | 7d | 30d | 90d"),
):
    """
    Return cost/requests/tokens grouped by the value of a specific metadata
    tag key.  The tag key must match ^[a-zA-Z0-9_-]{1,64}$.
    """
    verify_internal_key(request)
    _validate_tag_key(tag)

    org_id = get_org_id(request)
    start_date, end_date = get_date_range(period)

    async with get_db() as db:
        rows = await spend_crud.get_spend_by_tag(
            db, org_id, tag, start_date, end_date
        )

    return {
        "period": period,
        "tag_key": tag,
        "start_date": start_date,
        "end_date": end_date,
        "data": rows,
    }


# ---------------------------------------------------------------------------
# GET /spend/logs
# ---------------------------------------------------------------------------

@router.get("/logs", summary="Paginated spend log detail")
async def spend_logs(
    request: Request,
    limit: int = Query(50, ge=1, le=500, description="Rows per page"),
    offset: int = Query(0, ge=0, description="Row offset"),
    endpoint_id: Optional[int] = Query(None, description="Filter by endpoint ID"),
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        description="Filter by status: success | error",
    ),
    source: Optional[str] = Query(
        None, description="Filter by source: playground | virtual-key"
    ),
    start_date: Optional[str] = Query(None, description="ISO date string (start)"),
    end_date: Optional[str] = Query(None, description="ISO date string (end)"),
    search: Optional[str] = Query(
        None,
        description="Full-text search on endpoint name, model, user name, virtual key name",
    ),
):
    """
    Return a paginated list of individual spend log entries with full JOIN
    context (endpoint, user, virtual key).
    """
    verify_internal_key(request)
    org_id = get_org_id(request)

    # Validate enum-like fields
    if status_filter and status_filter not in ("success", "error"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="status must be 'success' or 'error'.",
        )
    if source and source not in ("playground", "virtual-key"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="source must be 'playground' or 'virtual-key'.",
        )

    filters = {
        k: v
        for k, v in {
            "endpoint_id": endpoint_id,
            "status": status_filter,
            "source": source,
            "start_date": start_date,
            "end_date": end_date,
            "search": search,
        }.items()
        if v is not None
    }

    async with get_db() as db:
        result = await spend_crud.get_spend_logs_detail(
            db, org_id, limit=limit, offset=offset, filters=filters
        )

    return result


# ---------------------------------------------------------------------------
# POST /spend/logs/purge  — admin only
# ---------------------------------------------------------------------------

@router.post(
    "/logs/purge",
    summary="Purge old spend logs (admin only)",
    status_code=status.HTTP_200_OK,
)
async def purge_spend_logs(
    request: Request,
):
    """
    Delete spend logs older than the configured retention period.
    Reads `spend_log_retention_days` from the organisation's guardrail
    settings.  Falls back to 90 days if not configured.
    Only accessible by Admin-role users.
    """
    verify_internal_key(request)
    require_admin(request)

    org_id = get_org_id(request)

    async with get_db() as db:
        # Fetch retention days from guardrail settings
        retention_days = await _get_retention_days(db, org_id)

        result = await spend_crud.purge_spend_logs(db, org_id, retention_days)

    return {
        "ok": True,
        "retention_days": retention_days,
        "deleted": result["deleted"],
        "batches": result["batches"],
    }


# ---------------------------------------------------------------------------
# Internal: read retention days from guardrail settings
# ---------------------------------------------------------------------------

async def _get_retention_days(db, org_id: int, default: int = 90) -> int:
    """
    Query ai_gateway_guardrail_settings for spend_log_retention_days.
    Returns the configured value, or `default` (90) if not set.
    """
    try:
        from sqlalchemy import text

        sql = text("""
            SELECT spend_log_retention_days
            FROM ai_gateway_guardrail_settings
            WHERE organization_id = :org_id
            LIMIT 1
        """)
        result = await db.execute(sql, {"org_id": org_id})
        row = result.fetchone()
        if row and row[0] is not None:
            return int(row[0])
    except Exception:
        # If the column/table doesn't exist yet, fall back gracefully
        pass
    return default
