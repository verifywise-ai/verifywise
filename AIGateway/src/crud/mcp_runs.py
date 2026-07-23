"""Read queries for agent runs — group model calls (spend_logs) and tool calls
(mcp_audit_logs) by agent_run_id within an organization."""

from sqlalchemy import text
from database.db import get_db


async def list_runs(org_id: int, limit: int = 50, offset: int = 0) -> dict:
    """One row per agent_run_id with model/tool counts, denied count, totals."""
    params = {"org_id": org_id, "limit": limit, "offset": offset}

    base = """
        WITH model_calls AS (
            SELECT agent_run_id,
                   COUNT(*) AS model_count,
                   COALESCE(SUM(total_tokens), 0) AS tokens,
                   COALESCE(SUM(cost_usd), 0) AS cost,
                   MIN(created_at) AS first_at,
                   MAX(created_at) AS last_at
            FROM ai_gateway_spend_logs
            WHERE organization_id = :org_id AND agent_run_id IS NOT NULL
            GROUP BY agent_run_id
        ),
        tool_calls AS (
            SELECT agent_run_id,
                   COUNT(*) AS tool_count,
                   COUNT(*) FILTER (WHERE result_status = 'blocked') AS denied_count,
                   MIN(created_at) AS first_at,
                   MAX(created_at) AS last_at,
                   MAX(agent_key_id) AS agent_key_id
            FROM ai_gateway_mcp_audit_logs
            WHERE organization_id = :org_id AND agent_run_id IS NOT NULL
            GROUP BY agent_run_id
        ),
        runs AS (
            SELECT
                COALESCE(m.agent_run_id, t.agent_run_id) AS agent_run_id,
                COALESCE(m.model_count, 0) AS model_count,
                COALESCE(t.tool_count, 0) AS tool_count,
                COALESCE(t.denied_count, 0) AS denied_count,
                COALESCE(m.tokens, 0) AS total_tokens,
                COALESCE(m.cost, 0) AS total_cost,
                t.agent_key_id AS agent_key_id,
                LEAST(COALESCE(m.first_at, t.first_at), COALESCE(t.first_at, m.first_at)) AS started_at,
                GREATEST(COALESCE(m.last_at, t.last_at), COALESCE(t.last_at, m.last_at)) AS last_at
            FROM model_calls m
            FULL OUTER JOIN tool_calls t ON m.agent_run_id = t.agent_run_id
        )
    """

    count_sql = base + " SELECT COUNT(*) AS total FROM runs"
    data_sql = base + """
        SELECT r.*, ak.name AS agent_key_name
        FROM runs r
        LEFT JOIN ai_gateway_mcp_agent_keys ak ON ak.id = r.agent_key_id
        ORDER BY r.last_at DESC
        LIMIT :limit OFFSET :offset
    """

    async with get_db() as db:
        total = (await db.execute(text(count_sql), {"org_id": org_id})).scalar() or 0
        rows = (await db.execute(text(data_sql), params)).mappings().all()
        data = [dict(r) for r in rows]

    return {"data": data, "total": total, "limit": limit, "offset": offset}


async def get_run_stats(org_id: int, days: int = 7) -> dict:
    """Run-grain aggregates over the last N days: total runs, avg tool calls
    per run, and the share of runs that hit at least one blocked tool call.

    Runs are counted from the tool-call side (ai_gateway_mcp_audit_logs grouped
    by agent_run_id). A run consisting solely of model calls with zero tool
    calls is intentionally excluded — all three metrics are about tool activity.
    """
    days = int(days)  # validate before interpolating into INTERVAL

    sql = f"""
        WITH runs AS (
            SELECT agent_run_id,
                   COUNT(*) AS tool_count,
                   COUNT(*) FILTER (WHERE result_status = 'blocked') AS blocked_count
            FROM ai_gateway_mcp_audit_logs
            WHERE organization_id = :org_id
              AND agent_run_id IS NOT NULL
              AND created_at >= NOW() - INTERVAL '{days} days'
            GROUP BY agent_run_id
        )
        SELECT
            COUNT(*) AS total_runs,
            COALESCE(AVG(tool_count), 0) AS avg_tool_calls_per_run,
            COALESCE(
                100.0 * COUNT(*) FILTER (WHERE blocked_count > 0) / NULLIF(COUNT(*), 0),
                0
            ) AS pct_runs_with_block
        FROM runs
    """

    async with get_db() as db:
        row = (await db.execute(text(sql), {"org_id": org_id})).mappings().first()
        if row is None:
            return {"total_runs": 0, "avg_tool_calls_per_run": 0.0, "pct_runs_with_block": 0.0}
        return {
            "total_runs": int(row["total_runs"]),
            "avg_tool_calls_per_run": round(float(row["avg_tool_calls_per_run"]), 1),
            "pct_runs_with_block": round(float(row["pct_runs_with_block"]), 1),
        }


async def get_run(org_id: int, run_id: str) -> dict:
    """Interleaved entries (model + tool) for one run, ordered by created_at."""
    params = {"org_id": org_id, "run_id": run_id}

    model_sql = """
        SELECT 'model' AS kind, created_at, model, provider,
               prompt_tokens, completion_tokens, total_tokens, cost_usd,
               latency_ms, status_code, request_messages, response_text,
               NULL::int AS agent_key_id
        FROM ai_gateway_spend_logs
        WHERE organization_id = :org_id AND agent_run_id = :run_id
    """
    tool_sql = """
        SELECT 'tool' AS kind, created_at, tool_name AS model, NULL AS provider,
               NULL::int AS prompt_tokens, NULL::int AS completion_tokens,
               NULL::int AS total_tokens, NULL::numeric AS cost_usd,
               latency_ms, NULL::int AS status_code,
               arguments AS request_messages, result_summary AS response_text,
               agent_key_id
        FROM ai_gateway_mcp_audit_logs
        WHERE organization_id = :org_id AND agent_run_id = :run_id
    """

    async with get_db() as db:
        model_rows = (await db.execute(text(model_sql), params)).mappings().all()
        tool_rows = (await db.execute(text(tool_sql), params)).mappings().all()

    entries = [dict(r) for r in model_rows] + [dict(r) for r in tool_rows]
    entries.sort(key=lambda e: e["created_at"])
    return {"agent_run_id": run_id, "entries": entries}
