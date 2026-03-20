from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        """
        Resolve organization_id for the incoming request.

        The backend proxy forwards these headers:
          - x-organization-id: The organization ID (integer)
          - x-user-id: The user ID
          - x-role: The user's role
          - x-tenant-id: Legacy tenant hash (for backward compatibility)

        Priority:
          1) x-organization-id header (preferred - forwarded from backend)
          2) x-tenant-id header (backward compatibility during migration)
        """
        organization_id = None
        tenant_id = None  # Keep for backward compatibility during migration

        # 1) Try x-organization-id header (forwarded from backend)
        org_id_header = request.headers.get("x-organization-id")
        if org_id_header:
            try:
                organization_id = int(org_id_header)
            except ValueError:
                pass

        # 2) Fallback to x-tenant-id header (backward compatibility)
        if not organization_id:
            tenant_id = request.headers.get("x-tenant-id")
            if not tenant_id:
                raise HTTPException(status_code=400, detail="Missing organization id.")

        # Get user_id and role from headers (forwarded from backend)
        user_id = None
        user_id_header = request.headers.get("x-user-id")
        if user_id_header:
            try:
                user_id = int(user_id_header)
            except ValueError:
                pass

        role = request.headers.get("x-role")

        # Stash for routers/controllers
        request.state.organization_id = organization_id
        request.state.tenant = tenant_id  # Keep for backward compatibility
        request.state.user_id = user_id
        request.state.role = role

        # Continue processing the request
        return await call_next(request)
