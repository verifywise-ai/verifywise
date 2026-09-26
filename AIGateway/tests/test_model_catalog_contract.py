import os
import sys
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

# Add src to path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import routers.models as models_router
import routers.tenant_chat as tenant_chat

# Fields the Models page (catalog, cost calculator, comparison) reads from
# GET /api/ai-gateway/models/catalog — see ModelInfo in
# Clients/src/presentation/pages/AIGateway/Models/index.tsx.
MODEL_INFO_FIELDS = {
    "id",
    "provider",
    "mode",
    "max_input_tokens",
    "max_output_tokens",
    "input_cost_per_million",
    "output_cost_per_million",
    "supports_vision",
    "supports_function_calling",
    "supports_pdf_input",
    "supports_prompt_caching",
    "supports_response_schema",
    "supports_system_messages",
    "supports_tool_choice",
    "supports_parallel_function_calling",
}

# A small, fixed stand-in for litellm.model_cost so the contract doesn't
# depend on whichever cost map LiteLLM loads at test time.
FAKE_COST_MAP = {
    "sample_spec": {"litellm_provider": "openai", "mode": "chat"},
    "gpt-4o": {
        "litellm_provider": "openai",
        "mode": "chat",
        "input_cost_per_token": 2.5e-06,
        "output_cost_per_token": 1e-05,
        "max_input_tokens": 128000,
        "max_output_tokens": 16384,
        "supports_vision": True,
    },
    "text-embedding-3-small": {
        "litellm_provider": "openai",
        "mode": "embedding",
        "input_cost_per_token": 2e-08,
    },
    # LiteLLM pricing tier with no mode: not a callable model.
    "fireworks-ai-embedding-up-to-150m": {
        "litellm_provider": "fireworks_ai-embedding-models",
        "input_cost_per_token": 8e-09,
    },
}


@pytest.fixture
def fake_cost_map(monkeypatch):
    monkeypatch.setattr(models_router.litellm, "model_cost", FAKE_COST_MAP)
    monkeypatch.setattr(models_router, "_cached_catalog", None)
    monkeypatch.setattr(models_router, "_cached_models", None)
    monkeypatch.setattr(tenant_chat, "verify_internal_key", lambda _request: None)


# Regression: the Express-proxied catalog returned {model, input_cost_per_token,
# ...} with no id/mode/per-million prices, so the cost calculator (which keeps
# priced chat models) was always empty and the catalog showed no names.
async def test_proxied_catalog_matches_models_page_contract(fake_cost_map):
    response = await tenant_chat.get_model_catalog(MagicMock())
    models = response["data"]["models"]

    assert response["data"]["total"] == len(models)
    assert all(MODEL_INFO_FIELDS <= set(m) for m in models)
    by_id = {m["id"]: m for m in models}
    assert by_id["gpt-4o"]["mode"] == "chat"
    assert by_id["gpt-4o"]["input_cost_per_million"] == 2.5
    assert by_id["gpt-4o"]["output_cost_per_million"] == 10.0


async def test_catalog_skips_pricing_tiers_without_a_mode(fake_cost_map):
    response = await tenant_chat.get_model_catalog(MagicMock())
    ids = {m["id"] for m in response["data"]["models"]}

    assert "fireworks-ai-embedding-up-to-150m" not in ids
    assert "sample_spec" not in ids
    assert ids == {"gpt-4o", "text-embedding-3-small"}


async def test_catalog_failure_is_an_error_not_an_empty_list(fake_cost_map, monkeypatch):
    def boom():
        raise RuntimeError("bad cost map")

    monkeypatch.setattr(tenant_chat, "build_model_catalog", boom)
    with pytest.raises(HTTPException) as exc:
        await tenant_chat.get_model_catalog(MagicMock())
    assert exc.value.status_code == 500


async def test_providers_reuse_the_grouped_models(fake_cost_map):
    response = await tenant_chat.get_providers(MagicMock())
    data = response["data"]

    assert data["providers"] == sorted(data["providers"])
    assert {m["id"] for m in data["models"]["openai"]} >= {"gpt-4o", "text-embedding-3-small"}
