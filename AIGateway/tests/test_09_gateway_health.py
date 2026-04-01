"""E2E: Gateway Health and Models"""

import pytest


GATEWAY_URL = "http://localhost:8100"


def test_gateway_health(http):
    """Gateway health check — should return ok."""
    res = http.get(f"{GATEWAY_URL}/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "litellm_version" in data
    assert data["models_in_cost_db"] > 0


def test_providers_list(api):
    """Providers list — should return providers and models from LiteLLM."""
    res = api.get("/providers")
    assert res.status_code == 200
    data = res.json()["data"]
    assert "providers" in data
    assert "models" in data
    assert len(data["providers"]) > 0
    # Should include major providers
    providers = data["providers"]
    assert "openai" in providers or "anthropic" in providers


def test_guardrail_settings_crud(api):
    """Guardrail settings — get and update."""
    res = api.get("/guardrails/settings")
    assert res.status_code == 200

    res = api.put("/guardrails/settings", json={
        "pii_on_error": "block",
        "content_filter_on_error": "allow",
        "log_retention_days": 90,
    })
    assert res.status_code == 200
