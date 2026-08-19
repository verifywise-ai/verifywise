"""
FastAPI TestClient tests for the pydantic request schemas on the deepeval
router (``/evaluate``, ``/scorers``, ``/models``).

Malformed bodies must be rejected with a 422 before any controller runs;
well-formed bodies must reach the controller as plain dicts. Controllers are
mocked — unlike ``test_api_experiments.py``, this router binds controller
functions directly by name, so we patch attributes on ``routers.deepeval``
itself rather than on the controller module.
"""

from __future__ import annotations

from typing import Any, Dict
from unittest.mock import AsyncMock

import pytest


def _build_test_app():
    """
    Build a minimal FastAPI app mounting only the deepeval router and the
    TenantMiddleware (same rationale as ``test_api_experiments.py``: avoid
    the full ``app.py`` startup; register an explicit HTTPException handler
    for deterministic behavior through ``BaseHTTPMiddleware``).
    """
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import JSONResponse
    from middlewares.middleware import TenantMiddleware
    from routers.deepeval import router as deepeval_router

    app = FastAPI()

    @app.exception_handler(HTTPException)
    async def _http_handler(_request, exc: HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.add_middleware(TenantMiddleware)
    app.include_router(deepeval_router, prefix="/deepeval")
    return app


@pytest.fixture
def patched_controllers(monkeypatch: pytest.MonkeyPatch) -> Dict[str, AsyncMock]:
    """Patch every controller bound by name in the deepeval router."""
    from routers import deepeval as router_module

    mocks = {
        "evaluate": AsyncMock(return_value={"eval_id": "deepeval_test"}),
        "create_scorer": AsyncMock(return_value={"id": "scorer_1"}),
        "update_scorer": AsyncMock(return_value={"id": "scorer_1"}),
        "test_scorer": AsyncMock(return_value={"score": 1.0}),
        "create_model": AsyncMock(return_value={"id": "model_1"}),
        "update_model": AsyncMock(return_value={"id": "model_1"}),
    }

    monkeypatch.setattr(router_module, "create_deepeval_evaluation_controller", mocks["evaluate"])
    monkeypatch.setattr(router_module, "create_deepeval_scorer_controller", mocks["create_scorer"])
    monkeypatch.setattr(router_module, "update_deepeval_scorer_controller", mocks["update_scorer"])
    monkeypatch.setattr(router_module, "test_deepeval_scorer_controller", mocks["test_scorer"])
    monkeypatch.setattr(router_module, "create_deepeval_model_controller", mocks["create_model"])
    monkeypatch.setattr(router_module, "update_deepeval_model_controller", mocks["update_model"])

    return mocks


@pytest.fixture
def client(patched_controllers):
    from fastapi.testclient import TestClient

    return TestClient(_build_test_app())


def _headers(org_id: int = 7) -> Dict[str, str]:
    return {
        "x-internal-key": "test-internal-key",
        "x-organization-id": str(org_id),
        "x-user-id": "42",
        "x-role": "Editor",
    }


# --------------------------------------------------------------------------- #
# POST /deepeval/evaluate                                                      #
# --------------------------------------------------------------------------- #


def test_evaluate_valid_body_reaches_controller(client, patched_controllers) -> None:
    resp = client.post(
        "/deepeval/evaluate",
        headers=_headers(),
        json={
            "model": {"name": "gpt-4o", "provider": "openai"},
            "metrics": {"answer_relevancy": True},
            "selectedScorers": ["scorer_1"],
        },
    )
    assert resp.status_code == 200
    kwargs = patched_controllers["evaluate"].call_args.kwargs
    assert kwargs["config_data"]["model"]["name"] == "gpt-4o"
    assert kwargs["config_data"]["selectedScorers"] == ["scorer_1"]
    assert kwargs["organization_id"] == 7


def test_evaluate_unknown_fields_pass_through(client, patched_controllers) -> None:
    """extra="allow": runner-specific keys must survive validation untouched."""
    resp = client.post(
        "/deepeval/evaluate",
        headers=_headers(),
        json={"evaluationMode": "both", "taskType": "summarization", "metrics": {}},
    )
    assert resp.status_code == 200
    config_data = patched_controllers["evaluate"].call_args.kwargs["config_data"]
    assert config_data["evaluationMode"] == "both"
    assert config_data["taskType"] == "summarization"


def test_evaluate_wrong_type_metrics_returns_422(client, patched_controllers) -> None:
    resp = client.post("/deepeval/evaluate", headers=_headers(), json={"metrics": "yes"})
    assert resp.status_code == 422
    patched_controllers["evaluate"].assert_not_called()


def test_evaluate_wrong_type_selected_scorers_returns_422(client, patched_controllers) -> None:
    resp = client.post("/deepeval/evaluate", headers=_headers(), json={"selectedScorers": "scorer_1"})
    assert resp.status_code == 422
    patched_controllers["evaluate"].assert_not_called()


# --------------------------------------------------------------------------- #
# POST /deepeval/scorers                                                       #
# --------------------------------------------------------------------------- #


def test_create_scorer_missing_name_returns_422(client, patched_controllers) -> None:
    resp = client.post("/deepeval/scorers", headers=_headers(), json={"metricKey": "answer_correctness"})
    assert resp.status_code == 422
    patched_controllers["create_scorer"].assert_not_called()


def test_create_scorer_empty_metric_key_returns_422(client, patched_controllers) -> None:
    resp = client.post("/deepeval/scorers", headers=_headers(), json={"name": "Judge", "metricKey": ""})
    assert resp.status_code == 422
    patched_controllers["create_scorer"].assert_not_called()


def test_create_scorer_wrong_type_name_returns_422(client, patched_controllers) -> None:
    resp = client.post(
        "/deepeval/scorers", headers=_headers(), json={"name": 123, "metricKey": "answer_correctness"}
    )
    assert resp.status_code == 422
    patched_controllers["create_scorer"].assert_not_called()


def test_create_scorer_valid_injects_created_by(client, patched_controllers) -> None:
    resp = client.post(
        "/deepeval/scorers",
        headers=_headers(),
        json={"name": "Judge", "metricKey": "answer_correctness", "config": {"threshold": 0.7}},
    )
    assert resp.status_code == 200
    payload = patched_controllers["create_scorer"].call_args.kwargs["payload"]
    assert payload["name"] == "Judge"
    assert payload["metricKey"] == "answer_correctness"
    assert payload["createdBy"] == "42"
    assert payload["config"] == {"threshold": 0.7}


def test_create_scorer_explicit_created_by_is_preserved(client, patched_controllers) -> None:
    resp = client.post(
        "/deepeval/scorers",
        headers=_headers(),
        json={"name": "Judge", "metricKey": "answer_correctness", "createdBy": "99"},
    )
    assert resp.status_code == 200
    payload = patched_controllers["create_scorer"].call_args.kwargs["payload"]
    assert payload["createdBy"] == "99"


# --------------------------------------------------------------------------- #
# PUT /deepeval/scorers/{scorer_id}                                            #
# --------------------------------------------------------------------------- #


def test_update_scorer_wrong_type_weight_returns_422(client, patched_controllers) -> None:
    resp = client.put("/deepeval/scorers/scorer_1", headers=_headers(), json={"weight": "heavy"})
    assert resp.status_code == 422
    patched_controllers["update_scorer"].assert_not_called()


def test_update_scorer_partial_update_only_sends_set_fields(client, patched_controllers) -> None:
    resp = client.put("/deepeval/scorers/scorer_1", headers=_headers(), json={"enabled": False})
    assert resp.status_code == 200
    call = patched_controllers["update_scorer"].call_args
    assert call.args[0] == "scorer_1"
    assert call.kwargs["payload"] == {"enabled": False}


# --------------------------------------------------------------------------- #
# POST /deepeval/scorers/{scorer_id}/test                                      #
# --------------------------------------------------------------------------- #


def test_test_scorer_missing_output_returns_422(client, patched_controllers) -> None:
    resp = client.post("/deepeval/scorers/scorer_1/test", headers=_headers(), json={"input": "hello"})
    assert resp.status_code == 422
    patched_controllers["test_scorer"].assert_not_called()


def test_test_scorer_empty_input_returns_422(client, patched_controllers) -> None:
    resp = client.post(
        "/deepeval/scorers/scorer_1/test", headers=_headers(), json={"input": "", "output": "world"}
    )
    assert resp.status_code == 422
    patched_controllers["test_scorer"].assert_not_called()


def test_test_scorer_valid_reaches_controller(client, patched_controllers) -> None:
    resp = client.post(
        "/deepeval/scorers/scorer_1/test",
        headers=_headers(),
        json={"input": "hello", "output": "world", "expected": "earth"},
    )
    assert resp.status_code == 200
    call = patched_controllers["test_scorer"].call_args
    assert call.args[0] == "scorer_1"
    assert call.kwargs["payload"] == {"input": "hello", "output": "world", "expected": "earth"}


# --------------------------------------------------------------------------- #
# POST /deepeval/models                                                        #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("missing_field", ["orgId", "name", "provider"])
def test_create_model_missing_required_field_returns_422(
    client, patched_controllers, missing_field: str
) -> None:
    body: Dict[str, Any] = {"orgId": "org-1", "name": "GPT-4o", "provider": "openai"}
    del body[missing_field]
    resp = client.post("/deepeval/models", headers=_headers(), json=body)
    assert resp.status_code == 422
    patched_controllers["create_model"].assert_not_called()


def test_create_model_empty_org_id_returns_422(client, patched_controllers) -> None:
    resp = client.post(
        "/deepeval/models", headers=_headers(), json={"orgId": "", "name": "GPT-4o", "provider": "openai"}
    )
    assert resp.status_code == 422
    patched_controllers["create_model"].assert_not_called()


def test_create_model_valid_injects_created_by(client, patched_controllers) -> None:
    resp = client.post(
        "/deepeval/models",
        headers=_headers(),
        json={"orgId": "org-1", "name": "GPT-4o", "provider": "openai", "endpointUrl": "https://api.openai.com"},
    )
    assert resp.status_code == 200
    payload = patched_controllers["create_model"].call_args.kwargs["payload"]
    assert payload["orgId"] == "org-1"
    assert payload["createdBy"] == "42"


# --------------------------------------------------------------------------- #
# PUT /deepeval/models/{model_id}                                              #
# --------------------------------------------------------------------------- #


def test_update_model_wrong_type_name_returns_422(client, patched_controllers) -> None:
    resp = client.put("/deepeval/models/model_1", headers=_headers(), json={"name": 123})
    assert resp.status_code == 422
    patched_controllers["update_model"].assert_not_called()


def test_update_model_partial_update_only_sends_set_fields(client, patched_controllers) -> None:
    resp = client.put("/deepeval/models/model_1", headers=_headers(), json={"provider": "anthropic"})
    assert resp.status_code == 200
    call = patched_controllers["update_model"].call_args
    assert call.args[0] == "model_1"
    assert call.kwargs["payload"] == {"provider": "anthropic"}
