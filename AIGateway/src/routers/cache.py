"""
Cache management router for the AI Gateway.
Prefix: /cache (mounted under /internal)
"""

from fastapi import APIRouter, Request

from crud.cache import (
    get_cache_stats,
    purge_expired_cache,
    clear_endpoint_cache,
    get_global_cache_settings,
    update_global_cache_settings,
)
from middlewares.auth import verify_internal_key
from utils.auth import get_org_id, require_admin

router = APIRouter(prefix="/cache", tags=["cache"])


@router.get("/stats")
async def cache_stats(request: Request):
    """Return cache statistics for the dashboard."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    stats = await get_cache_stats(org_id)
    return {"stats": stats}


@router.get("/settings")
async def get_settings(request: Request):
    """Return global cache settings."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    settings = await get_global_cache_settings(org_id)
    return {"settings": settings}


@router.put("/settings")
async def save_settings(request: Request):
    """Update global cache settings (admin only)."""
    verify_internal_key(request)
    require_admin(request)
    org_id = get_org_id(request)
    body = await request.json()

    settings = await update_global_cache_settings(
        organization_id=org_id,
        cache_global_enabled=body.get("cache_global_enabled", True),
        cache_default_ttl_seconds=body.get("cache_default_ttl_seconds", 14400),
        cache_max_entries_per_org=body.get("cache_max_entries_per_org", 50000),
    )
    return {"settings": settings}


@router.post("/purge")
async def purge_cache(request: Request):
    """Purge expired cache entries (admin only)."""
    verify_internal_key(request)
    require_admin(request)
    org_id = get_org_id(request)
    deleted = await purge_expired_cache(org_id)
    return {"purged": True, "deleted": deleted}


@router.post("/purge-expired")
async def purge_all_expired(request: Request):
    """System-level: purge all expired cache entries (called by BullMQ job)."""
    verify_internal_key(request)
    deleted = await purge_expired_cache(organization_id=None)
    return {"purged": True, "deleted": deleted}


@router.delete("/endpoint/{endpoint_id}")
async def clear_endpoint(endpoint_id: int, request: Request):
    """Clear all cache entries for a specific endpoint (admin only)."""
    verify_internal_key(request)
    require_admin(request)
    org_id = get_org_id(request)
    deleted = await clear_endpoint_cache(org_id, endpoint_id)
    return {"cleared": True, "endpoint_id": endpoint_id, "deleted": deleted}
