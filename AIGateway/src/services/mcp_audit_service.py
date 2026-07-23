"""
MCP Gateway audit service — logs every tool invocation for compliance and observability.
"""

import json
import logging
from typing import Optional

from sqlalchemy import text
from database.db import get_db

logger = logging.getLogger("uvicorn")

MAX_ARGUMENTS_SIZE = 10_240  # 10 KB


def _cap_arguments(arguments: dict | None) -> str:
    """Serialize arguments to JSON, truncating to MAX_ARGUMENTS_SIZE."""
    if not arguments:
        return "{}"
    serialized = json.dumps(arguments)
    if len(serialized) <= MAX_ARGUMENTS_SIZE:
        return serialized
    original_size = len(serialized)
    return json.dumps({"_truncated": True, "_original_size": original_size})


async def log_tool_call(
    organization_id: int,
    agent_key_id: int,
    server_id: Optional[int],
    tool_name: str,
    arguments: Optional[dict],
    result_status: str,  # "success", "error", "blocked", "rate_limited", "approval_required"
    result_summary: Optional[str],  # truncated to 500 chars
    is_error: bool,
    latency_ms: int,
    session_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    tool_use_id: Optional[str] = None,
    events: Optional[list] = None,
) -> None:
    """Insert an MCP audit log entry. Fire-and-forget with error catch."""
    try:
        # Truncate result_summary to 500 chars
        if result_summary and len(result_summary) > 500:
            result_summary = result_summary[:497] + "..."

        async with get_db() as db:
            await db.execute(
                text("""
                    INSERT INTO ai_gateway_mcp_audit_logs
                        (organization_id, agent_key_id, server_id, tool_name,
                         arguments, result_status, result_summary, is_error,
                         latency_ms, session_id, metadata, tool_use_id, events,
                         agent_run_id)
                    VALUES
                        (:org_id, :agent_key_id, :server_id, :tool_name,
                         CAST(:arguments AS jsonb), :result_status, :result_summary, :is_error,
                         :latency_ms, :session_id, CAST(:metadata AS jsonb),
                         :tool_use_id, CAST(:events AS jsonb),
                         :agent_run_id)
                """),
                {
                    "org_id": organization_id,
                    "agent_key_id": agent_key_id,
                    "server_id": server_id,
                    "tool_name": tool_name,
                    "arguments": _cap_arguments(arguments),
                    "result_status": result_status,
                    "result_summary": result_summary,
                    "is_error": is_error,
                    "latency_ms": latency_ms,
                    "session_id": session_id,
                    "metadata": json.dumps(metadata or {}),
                    "tool_use_id": tool_use_id,
                    "events": json.dumps(events or []),
                    "agent_run_id": session_id,
                },
            )
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to log MCP tool call: {e}")


async def update_tool_result(
    organization_id: int,
    session_id: str,
    tool_use_id: str,
    agent_key_id: int,
    result_response: dict,
    result_truncated: bool,
    outcome_event: dict,  # {"type": "...", "at": "...", "detail"?: "..."}
) -> str:
    """Update the audit row for (org, session_id, tool_use_id) with the tool result.
    Flips approval_required -> success, stores result_response, appends outcome_event.
    Returns: "ok" | "no_match" | "forbidden" | "error". Fire-and-forget safe."""
    try:
        async with get_db() as db:
            row = (await db.execute(
                text("""
                    SELECT id, agent_key_id, result_status, events
                    FROM ai_gateway_mcp_audit_logs
                    WHERE organization_id = :org_id
                      AND session_id = :session_id
                      AND tool_use_id = :tool_use_id
                    ORDER BY created_at DESC
                    LIMIT 1
                """),
                {"org_id": organization_id, "session_id": session_id, "tool_use_id": tool_use_id},
            )).mappings().fetchone()

            if not row:
                return "no_match"
            if row["agent_key_id"] != agent_key_id:
                return "forbidden"

            existing_events = row["events"] or []
            if isinstance(existing_events, str):
                existing_events = json.loads(existing_events)
            new_events = existing_events + [outcome_event]

            new_status = "success" if row["result_status"] == "approval_required" else row["result_status"]

            await db.execute(
                text("""
                    UPDATE ai_gateway_mcp_audit_logs
                    SET result_response = CAST(:result_response AS jsonb),
                        result_truncated = :result_truncated,
                        result_status = :new_status,
                        events = CAST(:events AS jsonb)
                    WHERE id = :id
                """),
                {
                    "id": row["id"],
                    "result_response": json.dumps(result_response),
                    "result_truncated": result_truncated,
                    "new_status": new_status,
                    "events": json.dumps(new_events),
                },
            )
            await db.commit()
            return "ok"
    except Exception as e:
        logger.error(f"Failed to update MCP tool result: {e}")
        return "error"
