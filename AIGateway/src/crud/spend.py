"""
CRUD operations for AI Gateway spend logs and analytics.
Translated from Servers/utils/aiGatewaySpendLog.utils.ts
"""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database.db import get_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row_to_dict(row) -> dict:
    """Convert a SQLAlchemy Row/RowMapping to a plain dict."""
    return dict(row._mapping) if hasattr(row, "_mapping") else dict(row)


# ---------------------------------------------------------------------------
# Spend summary
# ---------------------------------------------------------------------------

async def get_spend_summary(
    db: AsyncSession,
    org_id: int,
    start_date: str,
    end_date: str,
) -> dict:
    """
    Return aggregate totals: total_cost, total_requests, total_tokens,
    avg_latency_ms for the given org and date range.
    """
    sql = text("""
        SELECT
            COALESCE(SUM(cost_usd), 0)           AS total_cost,
            COUNT(*)                              AS total_requests,
            COALESCE(SUM(total_tokens), 0)        AS total_tokens,
            COALESCE(AVG(latency_ms), 0)          AS avg_latency_ms
        FROM ai_gateway_spend_logs
        WHERE organization_id = :org_id
          AND created_at BETWEEN :start_date AND :end_date
    """)
    result = await db.execute(
        sql,
        {"org_id": org_id, "start_date": start_date, "end_date": end_date},
    )
    row = result.fetchone()
    if row is None:
        return {
            "total_cost": 0,
            "total_requests": 0,
            "total_tokens": 0,
            "avg_latency_ms": 0,
        }
    return _row_to_dict(row)


# ---------------------------------------------------------------------------
# Spend by model
# ---------------------------------------------------------------------------

async def get_spend_by_model(
    db: AsyncSession,
    org_id: int,
    start_date: str,
    end_date: str,
) -> list[dict]:
    """
    Return cost/requests/tokens grouped by model.
    """
    sql = text("""
        SELECT
            model,
            COALESCE(SUM(cost_usd), 0)      AS total_cost,
            COUNT(*)                         AS total_requests,
            COALESCE(SUM(total_tokens), 0)  AS total_tokens
        FROM ai_gateway_spend_logs
        WHERE organization_id = :org_id
          AND created_at BETWEEN :start_date AND :end_date
        GROUP BY model
        ORDER BY total_cost DESC
    """)
    result = await db.execute(
        sql,
        {"org_id": org_id, "start_date": start_date, "end_date": end_date},
    )
    return [_row_to_dict(r) for r in result.fetchall()]


# ---------------------------------------------------------------------------
# Spend by endpoint
# ---------------------------------------------------------------------------

async def get_spend_by_endpoint(
    db: AsyncSession,
    org_id: int,
    start_date: str,
    end_date: str,
) -> list[dict]:
    """
    Return cost/requests/tokens grouped by endpoint, with display name via
    LEFT JOIN on ai_gateway_endpoints.
    """
    sql = text("""
        SELECT
            sl.endpoint_id,
            COALESCE(ep.display_name, sl.endpoint_id::text) AS endpoint_name,
            COALESCE(SUM(sl.cost_usd), 0)      AS total_cost,
            COUNT(*)                            AS total_requests,
            COALESCE(SUM(sl.total_tokens), 0)  AS total_tokens
        FROM ai_gateway_spend_logs sl
        LEFT JOIN ai_gateway_endpoints ep
               ON ep.id = sl.endpoint_id
              AND ep.organization_id = sl.organization_id
        WHERE sl.organization_id = :org_id
          AND sl.created_at BETWEEN :start_date AND :end_date
        GROUP BY sl.endpoint_id, ep.display_name
        ORDER BY total_cost DESC
    """)
    result = await db.execute(
        sql,
        {"org_id": org_id, "start_date": start_date, "end_date": end_date},
    )
    return [_row_to_dict(r) for r in result.fetchall()]


# ---------------------------------------------------------------------------
# Spend by user
# ---------------------------------------------------------------------------

async def get_spend_by_user(
    db: AsyncSession,
    org_id: int,
    start_date: str,
    end_date: str,
) -> list[dict]:
    """
    Return cost/requests/tokens grouped by user_id, with name via LEFT JOIN
    on users table.
    """
    sql = text("""
        SELECT
            sl.user_id,
            COALESCE(u.name, sl.user_id::text) AS user_name,
            u.email                             AS user_email,
            COALESCE(SUM(sl.cost_usd), 0)      AS total_cost,
            COUNT(*)                            AS total_requests,
            COALESCE(SUM(sl.total_tokens), 0)  AS total_tokens
        FROM ai_gateway_spend_logs sl
        LEFT JOIN users u ON u.id = sl.user_id
        WHERE sl.organization_id = :org_id
          AND sl.created_at BETWEEN :start_date AND :end_date
        GROUP BY sl.user_id, u.name, u.email
        ORDER BY total_cost DESC
    """)
    result = await db.execute(
        sql,
        {"org_id": org_id, "start_date": start_date, "end_date": end_date},
    )
    return [_row_to_dict(r) for r in result.fetchall()]


# ---------------------------------------------------------------------------
# Spend by day (or hour for "1d")
# ---------------------------------------------------------------------------

async def get_spend_by_day(
    db: AsyncSession,
    org_id: int,
    start_date: str,
    end_date: str,
    period: str = "7d",
) -> list[dict]:
    """
    Return cost/requests/tokens grouped by day.
    For period="1d" returns an hourly breakdown (00:00 – 23:00) using
    generate_series so that hours with no activity still appear.
    """
    if period == "1d":
        # Hourly breakdown for single-day view
        sql = text("""
            WITH hours AS (
                SELECT generate_series(0, 23) AS hour
            )
            SELECT
                TO_CHAR(hours.hour, 'FM00') || ':00'    AS period,
                COALESCE(SUM(sl.cost_usd), 0)             AS total_cost,
                COUNT(sl.id)                            AS total_requests,
                COALESCE(SUM(sl.total_tokens), 0)       AS total_tokens
            FROM hours
            LEFT JOIN ai_gateway_spend_logs sl
                   ON EXTRACT(HOUR FROM sl.created_at) = hours.hour
                  AND sl.organization_id = :org_id
                  AND sl.created_at BETWEEN :start_date AND :end_date
            GROUP BY hours.hour
            ORDER BY hours.hour ASC
        """)
    else:
        # Daily breakdown
        sql = text("""
            SELECT
                DATE(created_at)                        AS period,
                COALESCE(SUM(cost_usd), 0)              AS total_cost,
                COUNT(*)                                AS total_requests,
                COALESCE(SUM(total_tokens), 0)          AS total_tokens
            FROM ai_gateway_spend_logs
            WHERE organization_id = :org_id
              AND created_at BETWEEN :start_date AND :end_date
            GROUP BY DATE(created_at)
            ORDER BY period ASC
        """)

    result = await db.execute(
        sql,
        {"org_id": org_id, "start_date": start_date, "end_date": end_date},
    )
    rows = result.fetchall()
    # Normalise period to string
    out = []
    for r in rows:
        d = _row_to_dict(r)
        if isinstance(d.get("period"), date):
            d["period"] = d["period"].isoformat()
        out.append(d)
    return out


# ---------------------------------------------------------------------------
# Spend by metadata tag
# ---------------------------------------------------------------------------

async def get_spend_by_tag(
    db: AsyncSession,
    org_id: int,
    tag_key: str,
    start_date: str,
    end_date: str,
) -> list[dict]:
    """
    Return cost/requests/tokens grouped by a specific metadata tag key.
    Uses JSONB operator metadata->>:tag_key.
    """
    sql = text("""
        SELECT
            metadata->>:tag_key                 AS tag_value,
            COALESCE(SUM(cost_usd), 0)          AS total_cost,
            COUNT(*)                            AS total_requests,
            COALESCE(SUM(total_tokens), 0)      AS total_tokens
        FROM ai_gateway_spend_logs
        WHERE organization_id = :org_id
          AND created_at BETWEEN :start_date AND :end_date
          AND metadata->>:tag_key IS NOT NULL
        GROUP BY metadata->>:tag_key
        ORDER BY total_cost DESC
    """)
    result = await db.execute(
        sql,
        {
            "org_id": org_id,
            "tag_key": tag_key,
            "start_date": start_date,
            "end_date": end_date,
        },
    )
    return [_row_to_dict(r) for r in result.fetchall()]


# ---------------------------------------------------------------------------
# Spend by provider
# ---------------------------------------------------------------------------

async def get_spend_by_provider(
    db: AsyncSession,
    org_id: int,
    start_date: str,
    end_date: str,
) -> list[dict]:
    """
    Return cost/requests/tokens grouped by provider (pulled from the
    ai_gateway_endpoints table via LEFT JOIN).
    """
    sql = text("""
        SELECT
            COALESCE(ep.provider, 'unknown')    AS provider,
            COALESCE(SUM(sl.cost_usd), 0)       AS total_cost,
            COUNT(*)                            AS total_requests,
            COALESCE(SUM(sl.total_tokens), 0)   AS total_tokens
        FROM ai_gateway_spend_logs sl
        LEFT JOIN ai_gateway_endpoints ep
               ON ep.id = sl.endpoint_id
              AND ep.organization_id = sl.organization_id
        WHERE sl.organization_id = :org_id
          AND sl.created_at BETWEEN :start_date AND :end_date
        GROUP BY ep.provider
        ORDER BY total_cost DESC
    """)
    result = await db.execute(
        sql,
        {"org_id": org_id, "start_date": start_date, "end_date": end_date},
    )
    return [_row_to_dict(r) for r in result.fetchall()]


# ---------------------------------------------------------------------------
# Error rate by day
# ---------------------------------------------------------------------------

async def get_error_rate_by_day(
    db: AsyncSession,
    org_id: int,
    start_date: str,
    end_date: str,
) -> list[dict]:
    """
    Return total requests, error count, and error_rate per day.
    """
    sql = text("""
        SELECT
            DATE(created_at)                                AS day,
            COUNT(*)                                        AS total_requests,
            COUNT(*) FILTER (WHERE status_code >= 400)        AS error_count,
            ROUND(
                COUNT(*) FILTER (WHERE status_code >= 400)::numeric
                / NULLIF(COUNT(*), 0) * 100,
                2
            )                                               AS error_rate
        FROM ai_gateway_spend_logs
        WHERE organization_id = :org_id
          AND created_at BETWEEN :start_date AND :end_date
        GROUP BY DATE(created_at)
        ORDER BY day ASC
    """)
    result = await db.execute(
        sql,
        {"org_id": org_id, "start_date": start_date, "end_date": end_date},
    )
    rows = result.fetchall()
    out = []
    for r in rows:
        d = _row_to_dict(r)
        if isinstance(d.get("day"), date):
            d["day"] = d["day"].isoformat()
        out.append(d)
    return out


# ---------------------------------------------------------------------------
# Tokens per request by endpoint
# ---------------------------------------------------------------------------

async def get_tokens_per_request_by_endpoint(
    db: AsyncSession,
    org_id: int,
    start_date: str,
    end_date: str,
) -> list[dict]:
    """
    Return average total_tokens per request for each endpoint.
    """
    sql = text("""
        SELECT
            sl.endpoint_id,
            COALESCE(ep.display_name, sl.endpoint_id::text) AS endpoint_name,
            ROUND(AVG(sl.total_tokens), 2)                  AS avg_tokens_per_request,
            COUNT(*)                                        AS total_requests
        FROM ai_gateway_spend_logs sl
        LEFT JOIN ai_gateway_endpoints ep
               ON ep.id = sl.endpoint_id
              AND ep.organization_id = sl.organization_id
        WHERE sl.organization_id = :org_id
          AND sl.created_at BETWEEN :start_date AND :end_date
        GROUP BY sl.endpoint_id, ep.display_name
        ORDER BY avg_tokens_per_request DESC
    """)
    result = await db.execute(
        sql,
        {"org_id": org_id, "start_date": start_date, "end_date": end_date},
    )
    return [_row_to_dict(r) for r in result.fetchall()]


# ---------------------------------------------------------------------------
# Paginated spend log detail
# ---------------------------------------------------------------------------

async def get_spend_logs_detail(
    db: AsyncSession,
    org_id: int,
    limit: int = 50,
    offset: int = 0,
    filters: Optional[dict] = None,
) -> dict:
    """
    Return paginated spend log rows with JOINs on endpoints, users, and
    virtual_keys.

    Supported filters (all optional):
        endpoint_id  : int
        status       : "success" | "error"
        source       : "playground" | "virtual-key"
        start_date   : ISO date string
        end_date     : ISO date string
        search       : ILIKE match on display_name, model, user name, vk name
    """
    filters = filters or {}

    where_clauses = ["sl.organization_id = :org_id"]
    params: dict[str, Any] = {"org_id": org_id, "limit": limit, "offset": offset}

    if filters.get("endpoint_id"):
        where_clauses.append("sl.endpoint_id = :endpoint_id")
        params["endpoint_id"] = filters["endpoint_id"]

    if filters.get("status"):
        if filters["status"] == "error":
            where_clauses.append("sl.status_code >= 400")
        else:
            where_clauses.append("sl.status_code < 400")

    if filters.get("source"):
        if filters["source"] == "virtual-key":
            where_clauses.append("sl.virtual_key_id IS NOT NULL")
        else:
            where_clauses.append("sl.virtual_key_id IS NULL")

    if filters.get("start_date"):
        where_clauses.append("sl.created_at >= :start_date")
        params["start_date"] = filters["start_date"]

    if filters.get("end_date"):
        where_clauses.append("sl.created_at <= :end_date")
        params["end_date"] = filters["end_date"]

    if filters.get("search"):
        where_clauses.append(
            """(
                ep.display_name  ILIKE :search
                OR sl.model      ILIKE :search
                OR u.name        ILIKE :search
                OR vk.name       ILIKE :search
            )"""
        )
        params["search"] = f"%{filters['search']}%"

    where_sql = " AND ".join(where_clauses)

    base_joins = """
        FROM ai_gateway_spend_logs sl
        LEFT JOIN ai_gateway_endpoints ep
               ON ep.id = sl.endpoint_id
              AND ep.organization_id = sl.organization_id
        LEFT JOIN users u ON u.id = sl.user_id
        LEFT JOIN ai_gateway_virtual_keys vk ON vk.id = sl.virtual_key_id
    """

    count_sql = text(f"SELECT COUNT(*) AS total {base_joins} WHERE {where_sql}")
    count_result = await db.execute(count_sql, params)
    total = count_result.scalar() or 0

    rows_sql = text(f"""
        SELECT
            sl.id,
            sl.endpoint_id,
            COALESCE(ep.display_name, sl.endpoint_id::text) AS endpoint_name,
            sl.model,
            sl.status_code,
            CASE WHEN sl.virtual_key_id IS NOT NULL THEN 'virtual-key' ELSE 'playground' END AS source,
            sl.cost_usd AS cost,
            sl.prompt_tokens,
            sl.completion_tokens,
            sl.total_tokens,
            sl.latency_ms,
            sl.metadata,
            sl.error_message,
            sl.created_at,
            sl.user_id,
            u.name      AS user_name,
            u.email     AS user_email,
            sl.virtual_key_id,
            vk.name     AS virtual_key_name
        {base_joins}
        WHERE {where_sql}
        ORDER BY sl.created_at DESC
        LIMIT :limit OFFSET :offset
    """)
    rows_result = await db.execute(rows_sql, params)
    rows = [_row_to_dict(r) for r in rows_result.fetchall()]

    # Normalise datetime fields
    for row in rows:
        if isinstance(row.get("created_at"), datetime):
            row["created_at"] = row["created_at"].isoformat()

    return {"rows": rows, "total": total}


# ---------------------------------------------------------------------------
# Purge old spend logs
# ---------------------------------------------------------------------------

async def purge_spend_logs(
    db: AsyncSession,
    org_id: int,
    retention_days: int,
) -> dict:
    """
    Delete spend logs older than retention_days for the given org.
    Operates in batches of 1 000 rows, up to 50 batches (50 000 rows max
    per call) to avoid long-running transactions.

    Returns {"deleted": <total_deleted>, "batches": <batches_run>}.
    """
    cutoff = (
        datetime.now(tz=timezone.utc) - timedelta(days=retention_days)
    ).isoformat()

    total_deleted = 0
    batches = 0
    max_batches = 50
    batch_size = 1000

    delete_sql = text("""
        DELETE FROM ai_gateway_spend_logs
        WHERE id IN (
            SELECT id
            FROM ai_gateway_spend_logs
            WHERE organization_id = :org_id
              AND created_at < :cutoff
            LIMIT :batch_size
        )
    """)

    while batches < max_batches:
        result = await db.execute(
            delete_sql,
            {"org_id": org_id, "cutoff": cutoff, "batch_size": batch_size},
        )
        deleted_this_batch = result.rowcount or 0
        total_deleted += deleted_this_batch
        batches += 1

        if deleted_this_batch < batch_size:
            # No more rows to delete
            break

    await db.commit()
    return {"deleted": total_deleted, "batches": batches}
