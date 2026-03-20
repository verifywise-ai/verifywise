"""
Budget router — GET and PUT (upsert) for organization AI Gateway budgets.

Mounted at /internal/budget (behind internal key + tenant middleware).
"""

import logging

from fastapi import APIRouter, HTTPException, Request

from sqlalchemy import text

from crud.budget import get_budget, upsert_budget
from database.db import get_db
from middlewares.auth import verify_internal_key
from utils.auth import get_org_id, require_admin

logger = logging.getLogger("uvicorn")

router = APIRouter(prefix="/budget", tags=["Budget"])


@router.get("")
async def get_org_budget(request: Request):
    """Get the budget for the organization."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    budget = await get_budget(org_id)
    return {"data": budget}


@router.put("")
async def upsert_org_budget(request: Request):
    """Create or update the organization budget."""
    verify_internal_key(request)
    require_admin(request)
    org_id = get_org_id(request)

    body = await request.json()

    try:
        monthly_limit_usd = float(body.get("monthly_limit_usd", 0))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=400, detail="monthly_limit_usd must be a positive number"
        )

    if monthly_limit_usd <= 0:
        raise HTTPException(
            status_code=400, detail="monthly_limit_usd must be a positive number"
        )

    try:
        alert_threshold_pct = float(body.get("alert_threshold_pct", 80))
    except (TypeError, ValueError):
        alert_threshold_pct = 80.0

    if alert_threshold_pct < 0 or alert_threshold_pct > 100:
        raise HTTPException(
            status_code=400, detail="alert_threshold_pct must be between 0 and 100"
        )

    is_hard_limit = bool(body.get("is_hard_limit", False))

    budget = await upsert_budget(
        org_id,
        monthly_limit_usd=monthly_limit_usd,
        alert_threshold_pct=alert_threshold_pct,
        is_hard_limit=is_hard_limit,
    )
    return {"data": budget}


@router.post("/reset")
async def reset_all_budgets(request: Request):
    """Reset current_spend_usd to 0 for all budgets. Called by BullMQ monthly job."""
    verify_internal_key(request)
    async with get_db() as db:
        await db.execute(
            text("UPDATE ai_gateway_budgets SET current_spend_usd = 0, updated_at = NOW()")
        )
        await db.commit()
    return {"data": {"reset": True}}
