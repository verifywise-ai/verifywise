"""
API Keys router — CRUD for provider API keys + key verification.

Mounted at /internal/keys (behind internal key + tenant middleware).
"""

import logging

import httpx
from fastapi import APIRouter, HTTPException, Request

from crud.api_keys import (
    get_all_api_keys,
    get_api_key_by_id,
    create_api_key,
    update_api_key,
    delete_api_key,
)
from utils.auth import get_org_id, get_user_id, require_admin, require_admin_or_editor
from utils.encryption import decrypt
from utils.notifications import config_event, notify_config_change

logger = logging.getLogger("uvicorn")

router = APIRouter(prefix="/keys", tags=["API Keys"])


# Providers that LiteLLM can call with a single API key. Keep in sync with
# API_KEY_PROVIDERS in Clients/src/presentation/pages/AIGateway/shared.ts.
# Azure OpenAI and AWS Bedrock also need a base URL / API version or cloud
# credentials, which ai_gateway_api_keys has no columns for, so they are not
# accepted here.
VALID_PROVIDERS = {"openai", "anthropic", "gemini", "xai", "mistral", "openrouter", "together_ai", "cohere"}

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
    "together_ai": {
        "url": lambda _k: "https://api.together.xyz/v1/models",
        "headers": lambda k: {"Authorization": f"Bearer {k}"},
    },
    "cohere": {
        "url": lambda _k: "https://api.cohere.com/v1/models",
        "headers": lambda k: {"Authorization": f"Bearer {k}"},
    },
}


def _google_error(resp: httpx.Response) -> tuple[str, list[str]]:
    """The status and detail reasons of a Google API error body; empty when it isn't one."""
    try:
        error = resp.json().get("error") or {}
        status = str(error.get("status") or "")
    except (ValueError, AttributeError):
        return "", []
    # A malformed details list must not throw away a valid status
    details = error.get("details")
    if not isinstance(details, list):
        return status, []
    return status, [d.get("reason", "") for d in details if isinstance(d, dict)]


def _rejects_key(provider: str, resp: httpx.Response, forbidden_rejects: bool) -> bool:
    """True when the provider refused the key itself."""
    if resp.status_code == 401:
        return True
    # A 403 can also mean a working key without permission to list models (an OpenAI
    # restricted key, an Anthropic permission_error). Unless the caller counts every 403,
    # only Google's own PERMISSION_DENIED from Gemini does: its key travels in the URL, so
    # that reply means the key is leaked, blocked or has the API disabled, and every model
    # call through the gateway would fail too. A proxy's or firewall's 403 page doesn't.
    if resp.status_code == 403:
        return forbidden_rejects or (
            provider == "gemini" and _google_error(resp)[0] == "PERMISSION_DENIED"
        )
    # Gemini answers an invalid or expired key with 400 API_KEY_INVALID, not 401.
    return (
        provider == "gemini"
        and resp.status_code == 400
        and "API_KEY_INVALID" in _google_error(resp)[1]
    )


async def _check_provider_key(provider: str, api_key: str, forbidden_rejects: bool = True) -> dict:
    """Ask the provider's models endpoint whether it accepts the key."""
    trimmed = api_key.strip()
    config = PROVIDER_VERIFY_ENDPOINTS.get(provider)

    if not config:
        return {"valid": True, "message": "Provider does not support live verification"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                config["url"](trimmed),
                headers=config["headers"](trimmed),
            )

        if _rejects_key(provider, resp, forbidden_rejects):
            return {"valid": False, "message": "Invalid API key — authentication failed"}

        if resp.status_code == 429:
            return {"valid": True, "message": "Key is valid (rate limited)"}

        return {"valid": True, "message": "Key is valid"}
    except Exception:
        # Network error — assume valid (provider might be down)
        return {"valid": True, "message": "Could not reach provider — key assumed valid"}


@router.post("/verify")
async def verify_api_key(request: Request):
    """Verify a provider API key by hitting the provider's models endpoint."""
    require_admin(request)

    body = await request.json()
    provider = body.get("provider", "").lower()
    api_key = body.get("api_key", "")

    if not provider or not api_key:
        raise HTTPException(status_code=400, detail="provider and api_key are required")

    return {"data": await _check_provider_key(provider, api_key)}


@router.post("/{key_id}/verify")
async def verify_saved_api_key(key_id: int, request: Request):
    """Verify a saved key without sending it to the client. Only says valid or not."""
    require_admin_or_editor(request)
    org_id = get_org_id(request)

    key = await get_api_key_by_id(org_id, key_id)
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    if not key.get("encrypted_key"):
        return {"data": {"valid": False, "message": "No key is stored"}}

    try:
        api_key = decrypt(key["encrypted_key"])
    except Exception:
        logger.warning("Saved provider entry %s could not be decrypted", key_id)
        return {"data": {"valid": False, "message": "Stored key cannot be read"}}

    provider = str(key.get("provider") or "").strip().lower()
    if provider == "google":
        provider = "gemini"
    # The wizard runs this check on every open: a 403 for missing permissions must not
    # lock out a key that can still call models.
    return {"data": await _check_provider_key(provider, api_key, forbidden_rejects=False)}


@router.get("")
async def list_api_keys(request: Request):
    """Get all API keys for the organization (masked)."""
    org_id = get_org_id(request)
    keys = await get_all_api_keys(org_id)
    return {"data": keys}


def _safe_key(key: dict) -> dict:
    """Strip encrypted_key from a key row before returning to the client."""
    return {k: v for k, v in key.items() if k != "encrypted_key"}


@router.post("")
async def create_key(request: Request):
    """Create a new provider API key."""
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
    await notify_config_change(
        org_id,
        user_id,
        config_event("api_key", "created", key_name, detail=f"Provider: {provider}"),
    )

    return {"data": _safe_key(key)}


@router.patch("/{key_id}")
async def update_key(key_id: int, request: Request):
    """Update an existing API key."""
    require_admin(request)
    org_id = get_org_id(request)

    body = await request.json()
    if "provider" in body:
        provider = str(body.get("provider") or "").strip().lower()
        if provider not in VALID_PROVIDERS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid provider '{provider}'. Must be one of: {', '.join(sorted(VALID_PROVIDERS))}",
            )
        body["provider"] = provider
    updated = await update_api_key(org_id, key_id, body)

    if not updated:
        raise HTTPException(status_code=404, detail="API key not found")

    return {"data": _safe_key(updated)}


@router.delete("/{key_id}")
async def delete_key(key_id: int, request: Request):
    """Delete an API key."""
    require_admin(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)

    deleted = await delete_api_key(org_id, key_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="API key not found")

    await notify_config_change(
        org_id,
        user_id,
        config_event("api_key", "deleted", deleted["name"], key_id),
    )

    return {"data": {"deleted": True}}
