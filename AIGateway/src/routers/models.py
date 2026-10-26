from datetime import date

import litellm
from fastapi import APIRouter, Request

from services.cost_service import validate_model

router = APIRouter()


def _deprecation_date(info: dict) -> str | None:
    """The ISO date the provider retires the model, or None when LiteLLM has none or a bad one."""
    value = info.get("deprecation_date")
    try:
        return date.fromisoformat(value).isoformat() if isinstance(value, str) else None
    except ValueError:
        return None

# Cache the model list at module scope — computed once on first import
_cached_models: dict | None = None


def build_models_grouped() -> dict:
    """Build and cache the grouped models dict."""
    global _cached_models
    if _cached_models is not None:
        return _cached_models

    models_by_provider: dict[str, list[dict]] = {}
    for model_key, info in litellm.model_cost.items():
        if not isinstance(info, dict):
            continue
        provider = info.get("litellm_provider", "unknown")
        if provider not in models_by_provider:
            models_by_provider[provider] = []
        models_by_provider[provider].append(
            {
                "id": model_key,
                "provider": provider,
                "mode": info.get("mode", "chat"),
            }
        )

    _cached_models = {
        "providers": sorted(models_by_provider.keys()),
        "models": models_by_provider,
        "total": len(litellm.model_cost),
    }
    return _cached_models


@router.get("/v1/models")
async def list_models(request: Request):
    """Return list of supported models grouped by provider."""
    return build_models_grouped()


_cached_catalog: list | None = None


def build_model_catalog() -> list:
    """Build a flat catalog of all models with full metadata. Cached at module scope."""
    global _cached_catalog
    if _cached_catalog is not None:
        return _cached_catalog

    catalog = []
    # Skip metadata entries that aren't real models
    skip_keys = {"sample_spec"}
    for model_key, info in litellm.model_cost.items():
        if not isinstance(info, dict):
            continue
        if model_key in skip_keys:
            continue
        # Skip entries with no provider or garbage mode strings
        provider = info.get("litellm_provider", "")
        if not provider or len(provider) > 50:
            continue
        # Entries without a mode are LiteLLM pricing tiers (e.g.
        # "fireworks-ai-embedding-up-to-150m"), not callable models. Defaulting
        # them to "chat" put them in the cost calculator as the cheapest models.
        mode = info.get("mode")
        if not mode:
            continue
        catalog.append({
            "id": model_key,
            "provider": provider,
            "mode": mode,
            "max_input_tokens": info.get("max_input_tokens"),
            "max_output_tokens": info.get("max_output_tokens"),
            "input_cost_per_million": round((info.get("input_cost_per_token") or 0) * 1_000_000, 4),
            "output_cost_per_million": round((info.get("output_cost_per_token") or 0) * 1_000_000, 4),
            "supports_vision": info.get("supports_vision", False),
            "supports_function_calling": info.get("supports_function_calling", False),
            "supports_pdf_input": info.get("supports_pdf_input", False),
            "supports_prompt_caching": info.get("supports_prompt_caching", False),
            "supports_response_schema": info.get("supports_response_schema", False),
            "supports_system_messages": info.get("supports_system_messages", False),
            "supports_tool_choice": info.get("supports_tool_choice", False),
            "supports_parallel_function_calling": info.get("supports_parallel_function_calling", False),
            # A missing date doesn't mean the provider still serves the model to every key
            "deprecation_date": _deprecation_date(info),
        })

    _cached_catalog = catalog
    return _cached_catalog


@router.get("/v1/models/catalog")
async def model_catalog(request: Request):
    """Return full model catalog with pricing and feature metadata."""
    catalog = build_model_catalog()
    return {"models": catalog, "total": len(catalog)}


@router.get("/v1/models/{model:path}/validate")
async def validate_model_endpoint(request: Request, model: str):
    """Validate a model string and return its info."""

    info = validate_model(model)
    if info is None:
        return {"valid": False, "model": model}

    return {
        "valid": True,
        "model": model,
        "info": {
            "max_tokens": info.get("max_tokens"),
            "max_input_tokens": info.get("max_input_tokens"),
            "max_output_tokens": info.get("max_output_tokens"),
            "input_cost_per_token": info.get("input_cost_per_token"),
            "output_cost_per_token": info.get("output_cost_per_token"),
            "supports_vision": info.get("supports_vision", False),
            "supports_function_calling": info.get(
                "supports_function_calling", False
            ),
            "supports_streaming": info.get("supports_native_streaming", True),
            "mode": info.get("mode", "chat"),
            # get_model_info drops this field; read the cost-map entry it resolved
            # ("anthropic/claude-x" is stored as "claude-x")
            "deprecation_date": _deprecation_date(
                litellm.model_cost.get(info.get("key") or model) or {}
            ),
        },
    }
