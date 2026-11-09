"""
FastAPI TestClient tests for the experiments CRUD endpoints.

These exercise the routing + middleware contract without spinning up Postgres
or the background evaluation subprocess. Controllers are mocked, and the
``run_evaluation_task`` background coroutine is replaced with a no-op so the
real subprocess is never spawned.

Important: we deliberately avoid patching ``asyncio.create_task`` directly --
TestClient uses anyio internally, which relies on ``asyncio.create_task``,
and patching it globally hangs the event loop.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, Dict
from unittest.mock import AsyncMock

import pytest


def _build_test_app():
    """
    Build a minimal FastAPI app that mounts only the evaluation_logs router and
    the TenantMiddleware. We avoid loading the full ``app.py`` because it
    triggers startup migrations and Redis init.

    We register an explicit HTTPException handler — Starlette's
    ``BaseHTTPMiddleware`` re-raises HTTPException through ``collapse_excgroups``,
    and the FastAPI default handler is sometimes bypassed in this code path.
    Registering it explicitly makes the contract deterministic across versions.
    """
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import JSONResponse
    from middlewares.middleware import TenantMiddleware
    from routers.evaluation_logs import router as evaluation_logs

    app = FastAPI()

    @app.exception_handler(HTTPException)
    async def _http_handler(_request, exc: HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.add_middleware(TenantMiddleware)
    app.include_router(evaluation_logs)
    return app


@pytest.fixture
def patched_controllers(monkeypatch: pytest.MonkeyPatch) -> Dict[str, AsyncMock]:
    """Patch every controller used by the experiments routes."""
    from controllers import evaluation_logs as controller_module

    create_mock = AsyncMock(return_value={"experiment": {"id": "exp-1", "name": "test"}})
    get_list_mock = AsyncMock(return_value={"experiments": [], "total": 0})
    get_one_mock = AsyncMock(return_value={"experiment": {"id": "exp-1"}})
    update_mock = AsyncMock(return_value={"experiment": {"id": "exp-1", "name": "renamed"}})
    delete_mock = AsyncMock(return_value={"deleted": True})

    monkeypatch.setattr(controller_module, "create_experiment_controller", create_mock)
    monkeypatch.setattr(controller_module, "get_experiments_controller", get_list_mock)
    monkeypatch.setattr(controller_module, "get_experiment_by_id_controller", get_one_mock)
    monkeypatch.setattr(controller_module, "update_experiment_controller", update_mock)
    monkeypatch.setattr(controller_module, "delete_experiment_controller", delete_mock)

    return {
        "create": create_mock,
        "list": get_list_mock,
        "get_one": get_one_mock,
        "update": update_mock,
        "delete": delete_mock,
    }


@pytest.fixture
def no_background_task(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """
    Replace ``run_evaluation_task`` (the awaitable that gets passed to
    ``asyncio.create_task``) with a no-op AsyncMock. The mock returns a coroutine
    that finishes immediately, so the create_task call succeeds without launching
    a subprocess.
    """
    from routers import evaluation_logs as router_module

    no_op = AsyncMock(return_value=None)
    monkeypatch.setattr(router_module, "run_evaluation_task", no_op)
    return no_op


@pytest.fixture
def fake_get_db(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    PATCH/DELETE/POST handlers may open their own DB session via ``get_db``.
    Replace it with an async context manager that yields a mocked session.
    """
    from database import db as db_module
    from routers import evaluation_logs as router_module

    @asynccontextmanager
    async def _fake():
        yield AsyncMock()

    monkeypatch.setattr(db_module, "get_db", _fake)
    monkeypatch.setattr(router_module, "get_db", _fake, raising=False)


@pytest.fixture
def client(patched_controllers, no_background_task, fake_get_db):
    from fastapi.testclient import TestClient

    app = _build_test_app()
    return TestClient(app)


def _headers(org_id: int = 7) -> Dict[str, str]:
    return {
        "x-internal-key": "test-internal-key",
        "x-organization-id": str(org_id),
        "x-user-id": "42",
        "x-role": "Editor",
    }


# --------------------------------------------------------------------------- #
# Middleware: organization id resolution                                       #
# --------------------------------------------------------------------------- #


def test_legacy_tenant_id_header_is_accepted_by_middleware(client) -> None:
    """
    With only x-tenant-id (no x-organization-id), middleware passes but
    `_get_organization_id` raises 400 from inside the route. Confirms middleware
    accepts the legacy tenant header without raising.
    """
    res = client.get(
        "/deepeval/experiments",
        headers={"x-internal-key": "test-internal-key", "x-tenant-id": "legacy-tenant-hash"},
    )
    assert res.status_code == 400


def test_x_organization_id_is_propagated_to_request_state(
    client, patched_controllers
) -> None:
    """The middleware stashes organization_id on request.state so route handlers
    pick it up via _get_organization_id()."""
    res = client.get("/deepeval/experiments?project_id=p1", headers=_headers(org_id=99))
    assert res.status_code == 200
    call_args = patched_controllers["list"].await_args
    assert call_args.kwargs["organization_id"] == 99


# --------------------------------------------------------------------------- #
# POST /deepeval/experiments                                                   #
# --------------------------------------------------------------------------- #


def test_create_experiment_success(client, patched_controllers, no_background_task) -> None:
    body = {
        "project_id": "p1",
        "name": "Exp 1",
        "description": "test",
        "config": {"model": {"name": "m"}, "dataset": {}, "metrics": {}},
    }
    res = client.post("/deepeval/experiments", json=body, headers=_headers())
    assert res.status_code == 200
    assert res.json()["experiment"]["id"] == "exp-1"
    patched_controllers["create"].assert_awaited_once()
    # And the background task got scheduled
    assert no_background_task.call_count == 1
    bg_kwargs = no_background_task.call_args.kwargs
    assert bg_kwargs["experiment_id"] == "exp-1"
    assert bg_kwargs["organization_id"] == 7


def test_create_experiment_missing_name_422(client) -> None:
    body = {"project_id": "p1", "config": {}}  # missing required name
    res = client.post("/deepeval/experiments", json=body, headers=_headers())
    assert res.status_code == 422  # Pydantic validation


# --------------------------------------------------------------------------- #
# GET /deepeval/experiments                                                    #
# --------------------------------------------------------------------------- #


def test_list_experiments(client, patched_controllers) -> None:
    res = client.get("/deepeval/experiments?project_id=p1", headers=_headers())
    assert res.status_code == 200
    assert res.json() == {"experiments": [], "total": 0}
    patched_controllers["list"].assert_awaited_once()
    call_args = patched_controllers["list"].await_args
    assert call_args.kwargs["project_id"] == "p1"
    assert call_args.kwargs["organization_id"] == 7


def test_list_experiments_with_pagination(client, patched_controllers) -> None:
    res = client.get(
        "/deepeval/experiments?project_id=p1&limit=50&offset=10",
        headers=_headers(),
    )
    assert res.status_code == 200
    call_args = patched_controllers["list"].await_args
    assert call_args.kwargs["limit"] == 50
    assert call_args.kwargs["offset"] == 10


def test_list_experiments_invalid_limit_422(client) -> None:
    res = client.get("/deepeval/experiments?limit=99999", headers=_headers())
    assert res.status_code == 422  # limit max is 1000


# --------------------------------------------------------------------------- #
# GET /deepeval/experiments/{id}                                               #
# --------------------------------------------------------------------------- #


def test_get_experiment_by_id(client, patched_controllers) -> None:
    res = client.get("/deepeval/experiments/exp-1", headers=_headers())
    assert res.status_code == 200
    assert res.json()["experiment"]["id"] == "exp-1"
    patched_controllers["get_one"].assert_awaited_once()


# --------------------------------------------------------------------------- #
# PATCH /deepeval/experiments/{id}                                             #
# --------------------------------------------------------------------------- #


def test_update_experiment_with_name(client, patched_controllers) -> None:
    res = client.patch(
        "/deepeval/experiments/exp-1", headers=_headers(), json={"name": "renamed"}
    )
    assert res.status_code == 200
    assert res.json()["experiment"]["name"] == "renamed"
    call_kwargs = patched_controllers["update"].await_args.kwargs
    assert call_kwargs["experiment_id"] == "exp-1"
    assert call_kwargs["name"] == "renamed"
    assert call_kwargs["description"] is None


def test_update_experiment_with_description(client, patched_controllers) -> None:
    res = client.patch(
        "/deepeval/experiments/exp-1", headers=_headers(), json={"description": "new desc"}
    )
    assert res.status_code == 200
    call_kwargs = patched_controllers["update"].await_args.kwargs
    assert call_kwargs["name"] is None
    assert call_kwargs["description"] == "new desc"


def test_update_experiment_empty_body_422(client, patched_controllers) -> None:
    res = client.patch("/deepeval/experiments/exp-1", headers=_headers(), json={})
    assert res.status_code == 422  # at least one of name/description is required
    patched_controllers["update"].assert_not_called()


def test_update_experiment_wrong_type_422(client, patched_controllers) -> None:
    res = client.patch("/deepeval/experiments/exp-1", headers=_headers(), json={"name": 123})
    assert res.status_code == 422
    patched_controllers["update"].assert_not_called()


# --------------------------------------------------------------------------- #
# Model API key validation endpoint                                            #
# --------------------------------------------------------------------------- #


def test_validate_model_with_a_saved_key(client, monkeypatch: pytest.MonkeyPatch) -> None:
    from routers import evaluation_logs as router_module

    monkeypatch.setattr(router_module, "check_db_api_key_available", AsyncMock(return_value=True))
    monkeypatch.setattr(router_module, "check_db_openrouter_available", AsyncMock(return_value=False))

    res = client.post(
        "/deepeval/models/validate",
        json={"model_name": "gpt-4o-mini", "provider": "openai"},
        headers=_headers(),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["valid"] is True
    assert body["provider"] == "openai"
    assert body["has_api_key"] is True


def test_validate_model_ignores_server_env_keys(client, monkeypatch: pytest.MonkeyPatch) -> None:
    """A run never sees the server's provider keys, so they can't make a model valid."""
    from routers import evaluation_logs as router_module

    monkeypatch.setenv("OPENAI_API_KEY", "sk-server")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-server")
    monkeypatch.setattr(router_module, "check_db_api_key_available", AsyncMock(return_value=False))
    monkeypatch.setattr(router_module, "check_db_openrouter_available", AsyncMock(return_value=False))

    res = client.post(
        "/deepeval/models/validate",
        json={"model_name": "gpt-4o-mini", "provider": "openai"},
        headers=_headers(),
    )
    body = res.json()
    assert body["valid"] is False
    assert body["has_api_key"] is False
    assert body["has_openrouter_fallback"] is False


@pytest.mark.parametrize("provider", ["ollama", "huggingface"])
def test_validate_model_keyless_providers_stay_valid(client, monkeypatch: pytest.MonkeyPatch, provider) -> None:
    from routers import evaluation_logs as router_module

    monkeypatch.setattr(router_module, "check_db_api_key_available", AsyncMock(return_value=False))
    monkeypatch.setattr(router_module, "check_db_openrouter_available", AsyncMock(return_value=False))

    res = client.post(
        "/deepeval/models/validate",
        json={"model_name": "llama3", "provider": provider},
        headers=_headers(),
    )
    assert res.json()["valid"] is True


def test_run_subprocess_env_drops_provider_credentials_and_endpoints(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keys an earlier run or the operator left in the server env must not reach another org's run."""
    from routers.evaluation_logs import run_subprocess_env

    for var in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY",
                "MISTRAL_API_KEY", "OPENROUTER_API_KEY", "HF_API_KEY", "AZURE_API_KEY", "GROQ_API_KEY",
                "G_EVAL_BASE_URL", "G_EVAL_API_KEY", "OPENAI_BASE_URL", "OPENAI_API_BASE"):
        monkeypatch.setenv(var, "org-a-value")
    monkeypatch.setenv("AI_GATEWAY_INTERNAL_KEY", "gw")
    monkeypatch.setenv("EVAL_SERVER_INTERNAL_KEY", "es")
    monkeypatch.setenv("ENCRYPTION_KEY", "enc")
    monkeypatch.setenv("HF_TOKEN", "hf")
    monkeypatch.setenv("G_EVAL_TEMPERATURE", "0.2")
    monkeypatch.setenv("DB_HOST", "db")

    env = run_subprocess_env()
    assert "org-a-value" not in env.values()
    # Service settings and non-secret operator defaults still reach the run
    for var, value in (("AI_GATEWAY_INTERNAL_KEY", "gw"), ("EVAL_SERVER_INTERNAL_KEY", "es"),
                       ("ENCRYPTION_KEY", "enc"), ("HF_TOKEN", "hf"), ("G_EVAL_TEMPERATURE", "0.2"),
                       ("DB_HOST", "db"), ("PYTHONUNBUFFERED", "1")):
        assert env[var] == value


def test_validate_model_auto_detects_provider(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    from routers import evaluation_logs as router_module

    monkeypatch.setattr(
        router_module, "check_db_api_key_available", AsyncMock(return_value=False)
    )
    monkeypatch.setattr(
        router_module, "check_db_openrouter_available", AsyncMock(return_value=False)
    )

    res = client.post(
        "/deepeval/models/validate",
        json={"model_name": "claude-3-opus"},
        headers=_headers(),
    )
    assert res.status_code == 200
    assert res.json()["provider"] == "anthropic"


def test_validate_model_returns_error_when_no_key(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    from routers import evaluation_logs as router_module

    monkeypatch.setattr(
        router_module, "check_db_api_key_available", AsyncMock(return_value=False)
    )
    monkeypatch.setattr(
        router_module, "check_db_openrouter_available", AsyncMock(return_value=False)
    )

    res = client.post(
        "/deepeval/models/validate",
        json={"model_name": "claude-3-opus", "provider": "anthropic"},
        headers=_headers(),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["valid"] is False
    assert "No saved API key for provider 'anthropic'" in (body["error_message"] or "")


@pytest.mark.parametrize("provider", ["OpenAI", "gemini", "Google"])
def test_validate_model_cloud_provider_case_and_alias_still_need_a_key(
    client, monkeypatch: pytest.MonkeyPatch, provider
) -> None:
    from routers import evaluation_logs as router_module

    monkeypatch.setattr(router_module, "check_db_api_key_available", AsyncMock(return_value=False))
    monkeypatch.setattr(router_module, "check_db_openrouter_available", AsyncMock(return_value=False))

    res = client.post(
        "/deepeval/models/validate",
        json={"model_name": "some-model", "provider": provider},
        headers=_headers(),
    )
    assert res.json()["valid"] is False


def test_validate_model_failed_key_lookup_does_not_block(client, monkeypatch: pytest.MonkeyPatch) -> None:
    """A DB hiccup must not tell users their saved key is missing."""
    from routers import evaluation_logs as router_module

    monkeypatch.setattr(router_module, "check_db_api_key_available", AsyncMock(return_value=None))
    monkeypatch.setattr(router_module, "check_db_openrouter_available", AsyncMock(return_value=None))
    probe = AsyncMock(return_value=("model_not_found", "x"))
    monkeypatch.setattr(router_module, "probe_model", probe)

    res = client.post(
        "/deepeval/models/validate",
        json={"model_name": "gpt-4o", "provider": "openai", "probe": True},
        headers=_headers(),
    )
    body = res.json()
    assert body["valid"] is True
    assert body["has_openrouter_fallback"] is False
    probe.assert_not_awaited()


def _saved_key_only(monkeypatch: pytest.MonkeyPatch, probe_result):
    from routers import evaluation_logs as router_module

    monkeypatch.setattr(router_module, "check_db_api_key_available", AsyncMock(return_value=True))
    monkeypatch.setattr(router_module, "check_db_openrouter_available", AsyncMock(return_value=False))
    probe = AsyncMock(return_value=probe_result)
    monkeypatch.setattr(router_module, "probe_model", probe)
    return probe


def test_validate_model_probe_reports_a_refused_model(client, monkeypatch: pytest.MonkeyPatch) -> None:
    probe = _saved_key_only(
        monkeypatch,
        ("model_not_found", "The model was not found or is not available to this API key."),
    )

    res = client.post(
        "/deepeval/models/validate",
        json={"model_name": "gemini-2.5-pro", "provider": "google", "probe": True},
        headers=_headers(),
    )
    body = res.json()
    assert body["valid"] is False
    assert body["probe_failed"] is True
    assert body["probe_error_code"] == "model_not_found"
    assert "not available to this API key" in body["error_message"]
    probe.assert_awaited_once()


def test_validate_model_does_not_probe_unless_asked(client, monkeypatch: pytest.MonkeyPatch) -> None:
    probe = _saved_key_only(monkeypatch, ("invalid_api_key", "refused"))

    res = client.post(
        "/deepeval/models/validate",
        json={"model_name": "gemini-2.5-pro", "provider": "google"},
        headers=_headers(),
    )
    assert res.json()["valid"] is True
    probe.assert_not_awaited()


def test_validate_model_probe_that_passes_keeps_it_valid(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _saved_key_only(monkeypatch, None)

    res = client.post(
        "/deepeval/models/validate",
        json={"model_name": "gemini-3.8-flash", "provider": "google", "probe": True},
        headers=_headers(),
    )
    body = res.json()
    assert body["valid"] is True
    assert body["probe_failed"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "raised, expected",
    [
        ("NotFoundError", "model_not_found"),
        ("AuthenticationError", "invalid_api_key"),
        ("RateLimitError", None),
        ("BadRequestError", None),
    ],
)
async def test_probe_model_maps_typed_refusals(
    monkeypatch: pytest.MonkeyPatch, gateway_env: str, raised: str, expected
) -> None:
    from routers import evaluation_logs as router_module
    from utils.gateway_litellm_client import GatewayProviderError

    monkeypatch.setattr(router_module, "_newest_saved_key", AsyncMock(return_value="AIza-saved"))
    sent = {}

    async def fake_completion(model, messages, key, **kwargs):
        sent.update(model=model, key=key, max_tokens=kwargs.get("max_tokens"))
        raise GatewayProviderError(raised, 400, "x")

    monkeypatch.setattr("utils.gateway_litellm_client.gateway_completion_async", fake_completion)

    message = await router_module.probe_model(1, "google", "gemini-2.5-pro")
    assert sent == {"model": "gemini/gemini-2.5-pro", "key": "AIza-saved", "max_tokens": 1}
    if expected is None:
        assert message is None
    else:
        assert message[0] == expected
        assert message[1]


@pytest.mark.asyncio
async def test_probe_model_outage_or_no_key_does_not_block(
    monkeypatch: pytest.MonkeyPatch, gateway_env: str
) -> None:
    from routers import evaluation_logs as router_module

    async def down(*_args, **_kwargs):
        raise RuntimeError("connection refused")

    monkeypatch.setattr("utils.gateway_litellm_client.gateway_completion_async", down)
    monkeypatch.setattr(router_module, "_newest_saved_key", AsyncMock(return_value="sk-saved"))
    assert await router_module.probe_model(1, "openai", "gpt-4o") is None

    monkeypatch.setattr(router_module, "_newest_saved_key", AsyncMock(return_value=None))
    assert await router_module.probe_model(1, "openai", "gpt-4o") is None



# --------------------------------------------------------------------------- #
# Middleware: internal-key authentication                                      #
# --------------------------------------------------------------------------- #


def test_missing_internal_key_is_rejected(client) -> None:
    """Requests without the shared secret must not be able to set tenant context."""
    res = client.get("/deepeval/experiments", headers={"x-organization-id": "7"})
    assert res.status_code == 401


def test_invalid_internal_key_is_rejected(client) -> None:
    res = client.get(
        "/deepeval/experiments",
        headers={"x-internal-key": "wrong-key", "x-organization-id": "7"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_newest_saved_key_reads_the_newest_active_row_with_the_google_alias(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from routers import evaluation_logs as router_module

    seen = {}

    class _Result:
        def fetchone(self):
            return ("ciphertext",)

    class _Session:
        async def execute(self, statement, params):
            seen["sql"] = str(statement)
            seen["params"] = params
            return _Result()

    @asynccontextmanager
    async def fake_db():
        yield _Session()

    monkeypatch.setattr(router_module, "get_db", fake_db)
    monkeypatch.setattr("controllers.reports._decrypt_api_key", lambda value: f"plain-{value}")

    assert await router_module._newest_saved_key(5, "Google") == "plain-ciphertext"
    assert seen["params"] == {"organization_id": 5, "providers": ["google", "gemini"]}
    # "gemini" is not a provider the backend injects a key for, so it is not aliased
    await router_module._newest_saved_key(5, "gemini")
    assert seen["params"]["providers"] == ["gemini"]
    assert "is_active = true" in seen["sql"]
    assert "ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1" in seen["sql"]


@pytest.mark.asyncio
async def test_newest_saved_key_is_none_when_the_lookup_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    from routers import evaluation_logs as router_module

    @asynccontextmanager
    async def broken_db():
        raise RuntimeError("db down")
        yield  # pragma: no cover

    monkeypatch.setattr(router_module, "get_db", broken_db)
    assert await router_module._newest_saved_key(5, "openai") is None


def test_validate_model_does_not_probe_without_a_saved_key(client, monkeypatch: pytest.MonkeyPatch) -> None:
    from routers import evaluation_logs as router_module

    monkeypatch.setattr(router_module, "check_db_api_key_available", AsyncMock(return_value=False))
    monkeypatch.setattr(router_module, "check_db_openrouter_available", AsyncMock(return_value=True))
    probe = AsyncMock(return_value=("model_not_found", "x"))
    monkeypatch.setattr(router_module, "probe_model", probe)

    res = client.post(
        "/deepeval/models/validate",
        json={"model_name": "gpt-4o", "provider": "openai", "probe": True},
        headers=_headers(),
    )
    assert res.json()["valid"] is True
    probe.assert_not_awaited()



def test_validate_model_does_not_probe_a_provider_the_run_gets_no_key_for(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The backend injects saved keys for "google" but not "gemini"
    probe = _saved_key_only(monkeypatch, ("invalid_api_key", "x"))

    res = client.post(
        "/deepeval/models/validate",
        json={"model_name": "gemini-3.8-flash", "provider": "gemini", "probe": True},
        headers=_headers(),
    )
    assert res.json()["probe_failed"] is False
    probe.assert_not_awaited()


def test_run_key_providers_match_the_backend_valid_providers() -> None:
    """The probe runs only for providers Servers injects a saved key for; the lists must not drift."""
    import re
    from pathlib import Path

    from routers.evaluation_logs import RUN_KEY_PROVIDERS

    model = (
        Path(__file__).resolve().parents[2]
        / "Servers" / "domain.layer" / "models" / "evaluationLlmApiKey" / "evaluationLlmApiKey.model.ts"
    )
    if not model.is_file():
        pytest.skip("Servers source not present")
    block = re.search(r"export const VALID_PROVIDERS[^=]*=\s*\[(.*?)\]", model.read_text(), re.DOTALL)
    assert block, "VALID_PROVIDERS not found in evaluationLlmApiKey.model.ts"
    assert set(re.findall(r"\"([^\"]+)\"", block.group(1))) == RUN_KEY_PROVIDERS
