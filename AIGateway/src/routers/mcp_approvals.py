from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

from crud.mcp_approvals import (
    decide_approval,
    get_approval_history,
    get_approval_status,
    get_pending_approvals,
)
from middlewares.auth import verify_internal_key
from utils.auth import get_org_id, get_user_id, require_admin
from utils.notifications import notify_config_change

router = APIRouter(prefix="/mcp/approvals", tags=["mcp-approvals"])


# ---------------------------------------------------------------------------
# GET /mcp/approvals/
# ---------------------------------------------------------------------------

@router.get("", status_code=status.HTTP_200_OK)
async def list_pending_approvals(request: Request):
    """List all pending approval requests for the organization."""
    verify_internal_key(request)
    org_id = get_org_id(request)

    approvals = await get_pending_approvals(org_id)
    return {"status": "success", "data": approvals}


# ---------------------------------------------------------------------------
# GET /mcp/approvals/history
# ---------------------------------------------------------------------------

@router.get("/history", status_code=status.HTTP_200_OK)
async def list_approval_history(
    request: Request,
    limit: int = 50,
    offset: int = 0,
):
    """List decided approval requests with pagination."""
    verify_internal_key(request)
    org_id = get_org_id(request)

    if limit < 1 or limit > 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="limit must be between 1 and 200",
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="offset must be >= 0",
        )

    approvals = await get_approval_history(org_id, limit=limit, offset=offset)
    return {"status": "success", "data": approvals}


# ---------------------------------------------------------------------------
# GET /mcp/approvals/{request_id}
# ---------------------------------------------------------------------------

@router.get("/{request_id}", status_code=status.HTTP_200_OK)
async def get_single_approval(request_id: int, request: Request):
    """Get the status of a single approval request."""
    verify_internal_key(request)
    org_id = get_org_id(request)

    approval = await get_approval_status(org_id, request_id)
    if approval is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval request not found",
        )

    return {"status": "success", "data": approval}


# ---------------------------------------------------------------------------
# POST /mcp/approvals/{request_id}/approve
# ---------------------------------------------------------------------------

@router.post("/{request_id}/approve", status_code=status.HTTP_200_OK)
async def approve_request(request_id: int, request: Request):
    """Approve a pending tool execution request (admin only)."""
    verify_internal_key(request)
    require_admin(request)

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    body: dict[str, Any] = {}
    try:
        body = await request.json()
    except Exception:
        pass

    reason = body.get("reason")
    if reason is not None and not isinstance(reason, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="reason must be a string",
        )

    record = await decide_approval(
        org_id,
        request_id,
        {
            "status": "approved",
            "user_id": user_id,
            "reason": reason,
        },
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval request not found or already decided",
        )

    await notify_config_change(
        organization_id=org_id,
        changed_by_user_id=user_id,
        event={
            "action": "approved",
            "entity_type": "mcp_approval",
            "entity_id": str(request_id),
            "entity_name": record.get("tool_name", ""),
        },
    )

    return {"status": "success", "data": record}


# ---------------------------------------------------------------------------
# POST /mcp/approvals/{request_id}/deny
# ---------------------------------------------------------------------------

@router.post("/{request_id}/deny", status_code=status.HTTP_200_OK)
async def deny_request(request_id: int, request: Request):
    """Deny a pending tool execution request (admin only)."""
    verify_internal_key(request)
    require_admin(request)

    org_id = get_org_id(request)
    user_id = get_user_id(request)

    body: dict[str, Any] = {}
    try:
        body = await request.json()
    except Exception:
        pass

    reason = body.get("reason")
    if reason is not None and not isinstance(reason, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="reason must be a string",
        )

    record = await decide_approval(
        org_id,
        request_id,
        {
            "status": "denied",
            "user_id": user_id,
            "reason": reason,
        },
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval request not found or already decided",
        )

    await notify_config_change(
        organization_id=org_id,
        changed_by_user_id=user_id,
        event={
            "action": "denied",
            "entity_type": "mcp_approval",
            "entity_id": str(request_id),
            "entity_name": record.get("tool_name", ""),
        },
    )

    return {"status": "success", "data": record}
