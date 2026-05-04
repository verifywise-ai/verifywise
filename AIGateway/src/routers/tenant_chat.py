"""
Tenant chat router — handles JWT-authenticated chat/stream/embedding requests
proxied from Express via http-proxy-middleware.

Mounted at /internal (so paths are /internal/chat, /internal/chat/stream, etc.)

Also serves /internal/providers and /internal/models/catalog as thin wrappers
around the existing /internal/v1/models service.
"""

import logging
from typing import Optional

import litellm
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from middlewares.auth import verify_internal_key
from services.tenant_proxy import (
    tenant_chat_completion,
    tenant_embedding,
    tenant_stream_completion,
)
from utils.auth import get_org_id, get_user_id, get_role_id

logger = logging.getLogger("uvicorn")

router = APIRouter(tags=["Tenant Proxy"])

ROLE_NAME_TO_ID = {"Admin": 1, "Reviewer": 2, "Editor": 3, "Auditor": 4}


@router.post("/chat")
async def chat_completion(request: Request):
    """Proxy a chat completion for a JWT-authenticated user."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)
    role_id = get_role_id(request)

    body = await request.json()
    endpoint_slug = body.get("endpoint_slug")
    messages = body.get("messages")

    if not endpoint_slug or not messages:
        raise HTTPException(status_code=400, detail="endpoint_slug and messages are required")

    result = await tenant_chat_completion(
        organization_id=org_id,
        endpoint_slug=endpoint_slug,
        messages=messages,
        user_id=user_id,
        role_id=role_id,
        max_tokens=body.get("max_tokens"),
        temperature=body.get("temperature"),
        top_p=body.get("top_p"),
        metadata=body.get("metadata"),
    )

    return {"data": result}


@router.post("/chat/stream")
async def chat_completion_stream(request: Request):
    """Proxy a streaming chat completion for a JWT-authenticated user."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)
    role_id = get_role_id(request)

    body = await request.json()
    endpoint_slug = body.get("endpoint_slug")
    messages = body.get("messages")

    if not endpoint_slug or not messages:
        raise HTTPException(status_code=400, detail="endpoint_slug and messages are required")

    stream = tenant_stream_completion(
        organization_id=org_id,
        endpoint_slug=endpoint_slug,
        messages=messages,
        user_id=user_id,
        role_id=role_id,
        max_tokens=body.get("max_tokens"),
        temperature=body.get("temperature"),
        top_p=body.get("top_p"),
        metadata=body.get("metadata"),
    )

    return StreamingResponse(stream, media_type="text/event-stream")


@router.post("/embeddings")
async def embedding_proxy(request: Request):
    """Proxy an embedding request for a JWT-authenticated user."""
    verify_internal_key(request)
    org_id = get_org_id(request)
    user_id = get_user_id(request)
    role_id = get_role_id(request)

    body = await request.json()
    endpoint_slug = body.get("endpoint_slug")
    input_data = body.get("input")

    if not endpoint_slug or not input_data:
        raise HTTPException(status_code=400, detail="endpoint_slug and input are required")

    result = await tenant_embedding(
        organization_id=org_id,
        endpoint_slug=endpoint_slug,
        input_data=input_data,
        user_id=user_id,
        role_id=role_id,
    )

    return {"data": result}


@router.get("/providers")
async def get_providers(request: Request):
    """Get available LLM providers and their models from LiteLLM cost DB."""
    verify_internal_key(request)

    try:
        providers: dict[str, list] = {}
        for model_name, info in litellm.model_cost.items():
            provider = info.get("litellm_provider", "unknown")
            if provider not in providers:
                providers[provider] = []
            providers[provider].append({
                "id": model_name,
                "mode": info.get("mode", "chat"),
            })

        return {
            "data": {
                "providers": list(providers.keys()),
                "models": providers,
                "total": len(litellm.model_cost),
            }
        }
    except Exception as e:
        logger.error(f"Failed to get providers: {e}")
        return {"data": {"providers": [], "models": {}, "total": 0}}


@router.get("/models/catalog")
async def get_model_catalog(request: Request):
    """Get the full model catalog from LiteLLM cost DB."""
    verify_internal_key(request)

    try:
        models = []
        for model_name, info in litellm.model_cost.items():
            models.append({
                "model": model_name,
                "provider": info.get("litellm_provider", "unknown"),
                "input_cost_per_token": info.get("input_cost_per_token"),
                "output_cost_per_token": info.get("output_cost_per_token"),
                "max_tokens": info.get("max_tokens"),
                "max_input_tokens": info.get("max_input_tokens"),
                "max_output_tokens": info.get("max_output_tokens"),
                "supports_function_calling": info.get("supports_function_calling", False),
                "supports_vision": info.get("supports_vision", False),
                "supports_streaming": info.get("supports_streaming", True),
            })
        return {"data": {"models": models, "total": len(models)}}
    except Exception as e:
        logger.error(f"Failed to get model catalog: {e}")
        return {"data": {"models": [], "total": 0}}
