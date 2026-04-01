"""
CRUD operations for ai_gateway_budgets table.

Translated from Servers/utils/aiGatewayBudget.utils.ts.
"""

import logging
from typing import Any, Optional

from sqlalchemy import text

from database.db import get_db

logger = logging.getLogger("uvicorn")


def _serialize_budget(row) -> dict[str, Any]:
    """Convert a DB row to a JSON-safe dict."""
    d = dict(row)
    for k in ("created_at", "updated_at", "period_start"):
        if k in d and d[k] is not None:
            d[k] = str(d[k])
    # Ensure numeric fields are floats
    for k in ("monthly_limit_usd", "current_spend_usd", "alert_threshold_pct"):
        if k in d and d[k] is not None:
            d[k] = float(d[k])
    return d


async def get_budget(organization_id: int) -> Optional[dict[str, Any]]:
    """Get the budget for an organization."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT id, organization_id, monthly_limit_usd, current_spend_usd,
                       alert_threshold_pct, is_hard_limit, period_start,
                       created_at, updated_at
                FROM ai_gateway_budgets
                WHERE organization_id = :org_id
            """),
            {"org_id": organization_id},
        )
        row = result.mappings().fetchone()
        return _serialize_budget(row) if row else None


async def upsert_budget(
    organization_id: int,
    monthly_limit_usd: float,
    alert_threshold_pct: float = 80,
    is_hard_limit: bool = False,
) -> dict[str, Any]:
    """Create or update an organization budget (upsert)."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                INSERT INTO ai_gateway_budgets
                    (organization_id, monthly_limit_usd, current_spend_usd,
                     alert_threshold_pct, is_hard_limit, period_start,
                     created_at, updated_at)
                VALUES
                    (:org_id, :monthly_limit_usd, 0, :alert_threshold_pct,
                     :is_hard_limit, DATE_TRUNC('month', NOW()), NOW(), NOW())
                ON CONFLICT (organization_id)
                DO UPDATE SET
                    monthly_limit_usd = :monthly_limit_usd,
                    alert_threshold_pct = :alert_threshold_pct,
                    is_hard_limit = :is_hard_limit,
                    updated_at = NOW()
                RETURNING id, organization_id, monthly_limit_usd, current_spend_usd,
                          alert_threshold_pct, is_hard_limit, period_start,
                          created_at, updated_at
            """),
            {
                "org_id": organization_id,
                "monthly_limit_usd": monthly_limit_usd,
                "alert_threshold_pct": alert_threshold_pct,
                "is_hard_limit": is_hard_limit,
            },
        )
        await db.commit()
        row = result.mappings().fetchone()
        return _serialize_budget(row)


async def reserve_budget(organization_id: int, estimated_cost: float) -> bool:
    """Atomic budget reservation. Returns True if reservation succeeded."""
    async with get_db() as db:
        result = await db.execute(
            text("""
                UPDATE ai_gateway_budgets
                SET current_spend_usd = current_spend_usd + :cost,
                    updated_at = NOW()
                WHERE organization_id = :org_id
                  AND (
                    is_hard_limit = false
                    OR current_spend_usd + :cost <= monthly_limit_usd
                  )
                RETURNING id
            """),
            {"org_id": organization_id, "cost": estimated_cost},
        )
        await db.commit()
        return result.mappings().fetchone() is not None


async def adjust_budget_spend(
    organization_id: int,
    estimated_cost: float,
    actual_cost: float,
) -> None:
    """Adjust budget spend after a request completes."""
    adjustment = actual_cost - estimated_cost
    if abs(adjustment) < 0.000001:
        return

    async with get_db() as db:
        await db.execute(
            text("""
                UPDATE ai_gateway_budgets
                SET current_spend_usd = GREATEST(0, current_spend_usd + :adjustment),
                    updated_at = NOW()
                WHERE organization_id = :org_id
            """),
            {"org_id": organization_id, "adjustment": adjustment},
        )
        await db.commit()


async def reset_budget_spend(organization_id: Optional[int] = None) -> int:
    """
    Reset budget spend to 0 and update period_start.
    If organization_id provided, resets that org only.
    Otherwise resets all orgs where period_start < current month.
    """
    if organization_id:
        where = "organization_id = :org_id"
        params = {"org_id": organization_id}
    else:
        where = "period_start < DATE_TRUNC('month', NOW())"
        params = {}

    async with get_db() as db:
        result = await db.execute(
            text(f"""
                UPDATE ai_gateway_budgets
                SET current_spend_usd = 0,
                    period_start = DATE_TRUNC('month', NOW()),
                    updated_at = NOW()
                WHERE {where}
            """),
            params,
        )
        await db.commit()
        return result.rowcount or 0
