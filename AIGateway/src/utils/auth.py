"""
Role enforcement helpers for CRUD routers.

Reads tenant context from request.state (set by TenantMiddleware).
"""

from fastapi import HTTPException, Request

# Role name → ID mapping (matches Express backend)
ROLE_NAME_TO_ID = {
    "Admin": 1,
    "Reviewer": 2,
    "Editor": 3,
    "Auditor": 4,
}


def get_org_id(request: Request) -> int:
    """Return the organization ID or raise 400."""
    org_id = getattr(request.state, "organization_id", None)
    if not org_id:
        raise HTTPException(status_code=400, detail="Missing organization id")
    return org_id


def get_user_id(request: Request) -> int:
    """Return the user ID or raise 400."""
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=400, detail="Missing user id")
    return user_id


def get_role(request: Request) -> str:
    """Return the role name string."""
    return getattr(request.state, "role", None) or ""


def get_role_id(request: Request) -> int:
    """Return the numeric role ID (defaults to 0 if unknown)."""
    return ROLE_NAME_TO_ID.get(get_role(request), 0)


def require_admin(request: Request) -> None:
    """Raise 403 if the user is not an Admin."""
    role = get_role(request)
    if role != "Admin":
        raise HTTPException(status_code=403, detail="Admin access required")
