"""Agent runs — group model calls and tool calls by agent_run_id."""

from fastapi import APIRouter, Request, status, HTTPException

from middlewares.auth import verify_internal_key
from utils.auth import get_org_id
from crud.mcp_runs import list_runs, get_run

router = APIRouter(prefix="/mcp/runs", tags=["mcp-runs"])


@router.get("", status_code=status.HTTP_200_OK)
async def runs_list(request: Request, limit: int = 50, offset: int = 0):
    verify_internal_key(request)
    org_id = get_org_id(request)
    result = await list_runs(org_id, limit=limit, offset=offset)
    return {
        "status": "success",
        "data": result["data"],
        "total": result["total"],
        "limit": result["limit"],
        "offset": result["offset"],
    }


@router.get("/{run_id}", status_code=status.HTTP_200_OK)
async def run_detail(run_id: str, request: Request):
    verify_internal_key(request)
    org_id = get_org_id(request)
    result = await get_run(org_id, run_id)
    if not result["entries"]:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"status": "success", "data": result}
