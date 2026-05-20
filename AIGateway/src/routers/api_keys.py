"""
API Keys router — CRUD for provider API keys + key verification.

Mounted at /internal/keys (behind internal key + tenant middleware).
"""

import logging

import httpx
from fastapi import APIRouter, HTTPException, Request

from crud.api_keys import (
    get_all_api_keys,
    create_api_key,
    update_api_key,
    delete_api_key,
)
from middlewares.auth import verify_internal_key
from utils.auth import get_org_id, get_user_id, require_admin, require_admin_or_editor
from utils.notifications import notify_config_change

logger = logging.getLogger("uvicorn")

router = APIRouter(prefix="/keys", tags=["API Keys"])

FRONTEND_URL = "http://localhost:5173"  # overridable via env if needed

VALID_PROVIDERS = {"openai", "anthropic", "gemini", "xai", "mistral", "openrouter"}

# Provider verification endpoints (matches Express controller)
PROVIDER_VERIFY_ENDPOINTS: dict[str, dict] = {
    "openai": {
        "url": lambda _k: "https://api.openai.com/v1/models",
        "headers": lambda k: {"Authorization": f"Bearer {k}"},
    },
    "anthropic": {
        "url": lambda _k: "https://api.anthropic.com/v1/models",
        "headers": lambda k: {"x-api-key": k, "anthropic-version": "2023-06-01"},
    },
    "gemini": {
        "url": lambda k: f"https://generativelanguage.googleapis.com/v1beta/models?key={k}",
        "headers": lambda _k: {},
    },
    "xai": {
        "url": lambda _k: "https://api.x.ai/v1/models",
        "headers": lambda k: {"Authorization": f"Bearer {k}"},
    },
    "mistral": {
        "url": lambda _k: "https://api.mistral.ai/v1/models",
        "headers": lambda k: {"Authorization": f"Bearer {k}"},
    },
    "openrouter": {
        "url": lambda _k: "https://openrouter.ai/api/v1/models",
        "headers": lambda k: {"Authorization": f"Bearer {k}"},
    },
}


@router.post("/verify")
async def verify_api_key(request: Request):
    """Verify a provider API key by hitting the provider's models endpoint."""
    verify_internal_key(request)
    require_admin(request)

    body = await request.json()
    provider = body.get("provider", "").lower()
    api_key = body.get("api_key", "")

    if not provider or not api_key:
        raise HTTPException(status_code=400, detail="provider and api_key are required")

    trimmed = api_key.strip()
    config = PROVIDER_VERIFY_ENDPOINTS.get(provider)

    if not config:
        return {"data": {"valid": True, "message": "Provider does not support live verification"}}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                config["url"](trimmed),
                headers=config["headers"](trimmed),
            )

        if resp.status_code in (401, 403):
            return {"data": {"valid": False, "message": "Invalid API key — authentication failed"}}

        if resp.status_code == 429:
            return {"data": {"valid": True, "message": "Key is valid (rate limited)"}}

        return {"data": {"valid": True, "message": "Key is valid"}}
    except Exception:
        # Network error — assume valid (provider might be down)
        return {"data": {"valid": True, "message": "Could not reach provider — key assumed valid"}}


@router.get("")
async def list_api_keys(request: Request):
    """Get all API keys for the organization (masked)."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    keys = await get_all_api_keys(org_id)
    return {"data": keys}


def _safe_key(key: dict) -> dict:
    """Strip encrypted_key from a key row before returning to the client."""
    return {k: v for k, v in key.items() if k != "encrypted_key"}


@router.post("")
async def create_key(request: Request):
    """Create a new provider API key."""
    verify_internal_key(request)
    require_admin_or_editor(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)

    body = await request.json()
    provider = body.get("provider", "").lower()
    key_name = body.get("key_name")
    api_key = body.get("api_key")

    if not provider or not key_name or not api_key:
        raise HTTPException(
            status_code=400, detail="provider, key_name, and api_key are required"
        )

    if provider not in VALID_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider '{provider}'. Must be one of: {', '.join(sorted(VALID_PROVIDERS))}",
        )

    key = await create_api_key(org_id, provider, key_name, api_key)

    # Fire-and-forget notification
    await notify_config_change(org_id, user_id, {
        "entityType": "API key",
        "entityName": key_name,
        "action": "created",
        "detail": f"Provider: {provider}",
        "actionUrl": f"{FRONTEND_URL}/ai-gateway/settings",
        "actionLabel": "View settings",
    })

    return {"data": _safe_key(key)}


@router.patch("/{key_id}")
async def update_key(key_id: int, request: Request):
    """Update an existing API key."""
    verify_internal_key(request)
    require_admin(request)
    org_id = get_org_id(request)

    body = await request.json()
    updated = await update_api_key(org_id, key_id, body)

    if not updated:
        raise HTTPException(status_code=404, detail="API key not found")

    return {"data": _safe_key(updated)}


@router.delete("/{key_id}")
async def delete_key(key_id: int, request: Request):
    """Delete an API key."""
    verify_internal_key(request)
    require_admin(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)

    deleted = await delete_api_key(org_id, key_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="API key not found")

    await notify_config_change(org_id, user_id, {
        "entityType": "API key",
        "entityName": f"Key #{key_id}",
        "action": "deleted",
        "actionUrl": f"{FRONTEND_URL}/ai-gateway/settings",
        "actionLabel": "View settings",
    })

    return {"data": {"deleted": True}}
