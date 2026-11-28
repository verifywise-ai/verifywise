"""
MCP Gateway session manager — manages client-to-gateway and gateway-to-backend sessions.

Redis only caches the backend session ids behind a gateway session, so every
function here fails open: without Redis a client still gets a session id and
each tool call opens a fresh backend session instead of reusing one.
"""

import json
import logging
import uuid
from typing import Optional

from utils.redis import get_redis, log_fail_open

logger = logging.getLogger("uvicorn")

SESSION_TTL = 3600  # 1 hour


async def create_session() -> str:
    """Create a new gateway session. Returns session ID, even if Redis is down."""
    session_id = str(uuid.uuid4())
    try:
        r = await get_redis()
        await r.set(f"gw:mcp:session:{session_id}", json.dumps({}), ex=SESSION_TTL)
    except Exception as e:
        log_fail_open(logger, "MCP session create", e)
    return session_id


async def get_backend_session(session_id: str, server_id: int) -> Optional[str]:
    """Get the backend session ID for a given gateway session and server."""
    try:
        r = await get_redis()
        data = await r.get(f"gw:mcp:session:{session_id}")
        if not data:
            return None
        return json.loads(data).get(str(server_id))
    except Exception as e:
        log_fail_open(logger, "MCP session lookup", e)
        return None


async def set_backend_session(session_id: str, server_id: int, backend_session_id: str) -> None:
    """Store a backend session ID for a gateway session."""
    try:
        r = await get_redis()
        key = f"gw:mcp:session:{session_id}"
        data = await r.get(key)
        sessions = json.loads(data) if data else {}
        sessions[str(server_id)] = backend_session_id
        await r.set(key, json.dumps(sessions), ex=SESSION_TTL)
    except Exception as e:
        log_fail_open(logger, "MCP session store", e)


async def destroy_session(session_id: str) -> None:
    """Delete a gateway session."""
    r = await get_redis()
    await r.delete(f"gw:mcp:session:{session_id}")


async def session_exists(session_id: str) -> bool:
    """Check if a session exists."""
    r = await get_redis()
    return await r.exists(f"gw:mcp:session:{session_id}") > 0
