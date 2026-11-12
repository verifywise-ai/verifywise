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


def require_admin_or_editor(request: Request) -> None:
    """Raise 403 if the user is not an Admin or Editor."""
    role = get_role(request)
    if role not in ("Admin", "Editor"):
        raise HTTPException(status_code=403, detail="Admin or Editor access required")


# Set only by the Express proxy, which strips any client-supplied value and
# sends "true" when the caller holds the "llmKeys.admin" permission. Trusted
# the same way as x-role (requests reach /internal only with x-internal-key).
LLM_KEYS_ADMIN_HEADER = "x-can-manage-llm-keys"


def has_llm_keys_admin(request: Request) -> bool:
    """True when the proxy marked the caller as holding llmKeys.admin."""
    return request.headers.get(LLM_KEYS_ADMIN_HEADER, "").lower() == "true"


def require_llm_keys_admin(request: Request) -> None:
    """Raise 403 unless the caller is an Admin or holds llmKeys.admin.

    A custom role never matches the "Admin" role name, so the permission
    is what lets it manage provider keys.
    """
    if get_role(request) == "Admin" or has_llm_keys_admin(request):
        return
    raise HTTPException(status_code=403, detail="Admin access required")


def require_llm_keys_writer(request: Request) -> None:
    """Raise 403 unless the caller is an Admin or Editor, or holds llmKeys.admin."""
    if get_role(request) in ("Admin", "Editor") or has_llm_keys_admin(request):
        return
    raise HTTPException(status_code=403, detail="Admin or Editor access required")
