import litellm
from fastapi import APIRouter, Request

from middlewares.auth import verify_internal_key
from services.cost_service import validate_model

router = APIRouter()

# Cache the model list at module scope — computed once on first import
_cached_models: dict | None = None


def _get_models_grouped() -> dict:
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
    verify_internal_key(request)
    return _get_models_grouped()


_cached_catalog: list | None = None


def _get_model_catalog() -> list:
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
        catalog.append({
            "id": model_key,
            "provider": info.get("litellm_provider", "unknown"),
            "mode": info.get("mode", "chat"),
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
        })

    _cached_catalog = catalog
    return _cached_catalog


@router.get("/v1/models/catalog")
async def model_catalog(request: Request):
    """Return full model catalog with pricing and feature metadata."""
    verify_internal_key(request)
    catalog = _get_model_catalog()
    return {"models": catalog, "total": len(catalog)}


@router.get("/v1/models/{model:path}/validate")
async def validate_model_endpoint(request: Request, model: str):
    """Validate a model string and return its info."""
    verify_internal_key(request)

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
        },
    }
