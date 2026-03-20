"""
Tenant middleware — extracts organization, user, and role from headers
forwarded by the Express backend proxy.

Skips /v1/* (virtual key auth) and /health endpoints.
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


class TenantMiddleware(BaseHTTPMiddleware):
    """Extract tenant context from headers set by the Express proxy."""

    # Paths that don't require tenant headers:
    # - /v1/* — virtual key auth (public SDK routes)
    # - /internal/v1/* — hot-path routes (completions, models, guardrails scan)
    #   that receive provider keys directly, not tenant-scoped
    # - /health, /docs — service endpoints
    SKIP_PREFIXES = ("/v1/", "/internal/v1/", "/health", "/docs", "/openapi.json")

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip tenant extraction for public/virtual-key routes and health
        if any(path.startswith(p) for p in self.SKIP_PREFIXES):
            return await call_next(request)

        # x-organization-id (set by Express proxy from JWT)
        organization_id = None
        org_id_header = request.headers.get("x-organization-id")
        if org_id_header:
            try:
                organization_id = int(org_id_header)
            except ValueError:
                pass

        # User ID
        user_id = None
        user_id_header = request.headers.get("x-user-id")
        if user_id_header:
            try:
                user_id = int(user_id_header)
            except ValueError:
                pass

        # Role
        role = request.headers.get("x-role")

        # Stash for routers — organization_id may be None for system-wide
        # endpoints (budget/reset, risk/detection-orgs). Route handlers
        # validate via get_org_id() which raises 400 if missing.
        request.state.organization_id = organization_id
        request.state.user_id = user_id
        request.state.role = role

        return await call_next(request)
