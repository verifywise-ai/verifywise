from typing import Optional

from fastapi import APIRouter, Request, status

from crud.mcp_audit import (
    delete_expired_audit_logs,
    get_audit_logs,
    get_audit_stats,
    get_audit_stats_by_agent,
    get_audit_stats_by_tool,
)
from middlewares.auth import verify_internal_key
from utils.auth import get_org_id

router = APIRouter(prefix="/mcp/audit", tags=["mcp-audit"])


# ---------------------------------------------------------------------------
# GET /mcp/audit/logs
# ---------------------------------------------------------------------------

@router.get("/logs", status_code=status.HTTP_200_OK)
async def list_audit_logs(
    request: Request,
    limit: int = 50,
    offset: int = 0,
    agent_key_id: Optional[int] = None,
    tool_name: Optional[str] = None,
    result_status: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    verify_internal_key(request)
    org_id = get_org_id(request)

    filters: dict = {}
    if agent_key_id is not None:
        filters["agent_key_id"] = agent_key_id
    if tool_name is not None:
        filters["tool_name"] = tool_name
    if result_status is not None:
        filters["result_status"] = result_status
    if start_date is not None:
        filters["start_date"] = start_date
    if end_date is not None:
        filters["end_date"] = end_date

    result = await get_audit_logs(org_id, limit=limit, offset=offset, filters=filters)
    return {
        "status": "success",
        "data": result["data"],
        "total": result["total"],
        "limit": result["limit"],
        "offset": result["offset"],
    }


# ---------------------------------------------------------------------------
# GET /mcp/audit/stats
# ---------------------------------------------------------------------------

@router.get("/stats", status_code=status.HTTP_200_OK)
async def audit_stats(request: Request, days: int = 7):
    verify_internal_key(request)
    org_id = get_org_id(request)

    stats = await get_audit_stats(org_id, days=days)
    return {"status": "success", "data": stats}


# ---------------------------------------------------------------------------
# GET /mcp/audit/stats/by-tool
# ---------------------------------------------------------------------------

@router.get("/stats/by-tool", status_code=status.HTTP_200_OK)
async def audit_stats_by_tool(request: Request, days: int = 7):
    verify_internal_key(request)
    org_id = get_org_id(request)

    stats = await get_audit_stats_by_tool(org_id, days=days)
    return {"status": "success", "data": stats}


# ---------------------------------------------------------------------------
# GET /mcp/audit/stats/by-agent
# ---------------------------------------------------------------------------

@router.get("/stats/by-agent", status_code=status.HTTP_200_OK)
async def audit_stats_by_agent(request: Request, days: int = 7):
    verify_internal_key(request)
    org_id = get_org_id(request)

    stats = await get_audit_stats_by_agent(org_id, days=days)
    return {"status": "success", "data": stats}


# ---------------------------------------------------------------------------
# POST /mcp/audit/cleanup
# ---------------------------------------------------------------------------

@router.post("/cleanup", status_code=status.HTTP_200_OK)
async def cleanup_audit_logs(request: Request):
    """Delete audit logs older than retention period. Called by scheduled job."""
    verify_internal_key(request)
    from config import settings

    deleted = await delete_expired_audit_logs(settings.mcp_audit_retention_days)
    return {"status": "success", "deleted": deleted}


# ---------------------------------------------------------------------------
# POST /mcp/audit/cleanup-approvals
# ---------------------------------------------------------------------------

@router.post("/cleanup-approvals", status_code=status.HTTP_200_OK)
async def cleanup_approval_requests(request: Request):
    """Delete decided/expired approval requests older than retention period."""
    verify_internal_key(request)
    from config import settings
    from crud.mcp_approvals import delete_expired_approval_requests

    deleted = await delete_expired_approval_requests(settings.mcp_audit_retention_days)
    return {"status": "success", "deleted": deleted}
