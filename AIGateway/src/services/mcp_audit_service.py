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
                         latency_ms, session_id, metadata)
                    VALUES
                        (:org_id, :agent_key_id, :server_id, :tool_name,
                         CAST(:arguments AS jsonb), :result_status, :result_summary, :is_error,
                         :latency_ms, :session_id, CAST(:metadata AS jsonb))
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
                },
            )
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to log MCP tool call: {e}")
