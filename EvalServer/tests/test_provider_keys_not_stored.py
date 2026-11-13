"""
Provider keys the backend adds to an experiment config are for the run only.

They must not be stored in llm_evals_experiments, returned by the experiment
endpoints or reports, or passed to the evaluation subprocess on its command line.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock

import pytest

KEY = "sk-ant-api03-not-a-real-key"


def _config_with_keys() -> Dict[str, Any]:
    return {
        "model": {"name": "claude-haiku-4-5", "provider": "anthropic", "apiKey": KEY},
        "judgeLlm": {"provider": "anthropic", "model": "claude-sonnet-4-6", "apiKey": KEY},
        "scorerApiKeys": {"anthropic": KEY},
        "scorerApiKey": KEY,
        "apiKeys": {"openai": KEY},
        "dataset": {"name": "d", "prompts": [{"prompt": "q", "api_key": "fixture value"}]},
        "metrics": {"faithfulness": True},
    }


def test_strip_secrets_removes_keys_at_any_depth_without_touching_the_input() -> None:
    from utils.secret_config import strip_secrets

    config = _config_with_keys()
    cleaned = strip_secrets(config)

    assert KEY not in json.dumps(cleaned)
    assert cleaned["model"] == {"name": "claude-haiku-4-5", "provider": "anthropic"}
    assert cleaned["judgeLlm"] == {"provider": "anthropic", "model": "claude-sonnet-4-6"}
    assert "scorerApiKeys" not in cleaned and "apiKeys" not in cleaned
    assert "scorerApiKey" not in cleaned
    # Dataset content is the user's, and keys are never injected there.
    assert cleaned["dataset"]["prompts"] == [{"prompt": "q", "api_key": "fixture value"}]
    assert cleaned["metrics"] == {"faithfulness": True}
    # The running evaluation still has the original.
    assert config["model"]["apiKey"] == KEY


@pytest.mark.asyncio
async def test_create_experiment_stores_config_without_keys(mock_db_session: AsyncMock) -> None:
    from crud import evaluation_logs as crud

    result = MagicMock()
    result.mappings.return_value.first.return_value = {
        "id": "exp_1", "name": "n", "status": "pending", "created_at": None, "model_inventory_id": None,
    }
    mock_db_session.execute.return_value = result

    await crud.create_experiment(
        db=mock_db_session, project_id="p", name="n", config=_config_with_keys(), organization_id=1,
    )

    params = mock_db_session.execute.call_args.args[1]
    assert KEY not in params["config_json"]
    assert json.loads(params["config_json"])["model"]["name"] == "claude-haiku-4-5"


def _experiment_row(config: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": "exp_1", "project_id": "p", "name": "n", "description": None, "config": config,
        "baseline_experiment_id": None, "status": "completed", "results": {}, "error_message": None,
        "started_at": None, "completed_at": None, "created_at": None, "updated_at": None,
        "created_by": None, "model_inventory_id": None,
    }


@pytest.mark.asyncio
async def test_experiment_reads_strip_keys_from_rows_stored_before_the_fix(
    mock_db_session: AsyncMock,
) -> None:
    from crud import evaluation_logs as crud

    row = MagicMock()
    row.__getitem__.side_effect = _experiment_row(_config_with_keys()).__getitem__
    row.get.side_effect = _experiment_row(_config_with_keys()).get

    single = MagicMock()
    single.mappings.return_value.first.return_value = row
    many = MagicMock()
    many.mappings.return_value = [row]

    mock_db_session.execute.return_value = single
    one = await crud.get_experiment_by_id(db=mock_db_session, experiment_id="exp_1", organization_id=1)
    assert KEY not in json.dumps(one["config"])

    mock_db_session.execute.return_value = many
    listed = await crud.get_experiments(db=mock_db_session, organization_id=1)
    assert all(KEY not in json.dumps(e["config"]) for e in listed)


@pytest.mark.asyncio
async def test_evaluation_subprocess_gets_the_config_on_stdin_not_argv(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from crud import evaluation_logs as crud_module
    from routers import evaluation_logs as router_module

    async def _noop(*args: Any, **kwargs: Any) -> None:
        return None

    monkeypatch.setattr(crud_module, "update_experiment_status", _noop)

    class _FakeDb:
        async def __aenter__(self) -> "_FakeDb":
            return self

        async def __aexit__(self, *exc: Any) -> None:
            return None

    monkeypatch.setattr("database.db.get_db", lambda: _FakeDb())

    captured: Dict[str, Any] = {"args": None, "stdin": b""}

    class _FakeStdin:
        def write(self, data: bytes) -> None:
            captured["stdin"] += data

        async def drain(self) -> None:
            return None

        def close(self) -> None:
            return None

    class _FakeStdout:
        async def readline(self) -> bytes:
            return b""

    class _FakeProc:
        stdin = _FakeStdin()
        stdout = _FakeStdout()

        async def wait(self) -> int:
            return 0

    async def _fake_exec(*args: Any, **kwargs: Any) -> _FakeProc:
        captured["args"] = args
        captured["kwargs"] = kwargs
        return _FakeProc()

    monkeypatch.setattr("asyncio.create_subprocess_exec", _fake_exec)

    await router_module.run_evaluation_task("exp_1", _config_with_keys(), 1)

    assert all(KEY not in str(a) for a in captured["args"])
    payload = json.loads(captured["stdin"])
    assert payload["experiment_id"] == "exp_1"
    # The run itself still receives the keys.
    assert payload["config"]["model"]["apiKey"] == KEY


def test_migration_strips_the_same_fields() -> None:
    path = next(
        (Path(__file__).parent.parent / "src" / "database" / "migrations" / "versions").glob(
            "h20261111220035_*.py"
        )
    )
    spec = importlib.util.spec_from_file_location("strip_keys_migration", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)

    from utils.secret_config import strip_secrets

    config = _config_with_keys()
    assert module._strip(config) == strip_secrets(config)


@pytest.mark.asyncio
async def test_renaming_an_experiment_does_not_return_stored_keys(mock_db_session: AsyncMock) -> None:
    from crud import evaluation_logs as crud

    result = MagicMock()
    result.mappings.return_value.first.return_value = _experiment_row(_config_with_keys())
    mock_db_session.execute.return_value = result

    updated = await crud.update_experiment(
        db=mock_db_session, experiment_id="exp_1", organization_id=1, name="renamed"
    )
    assert KEY not in json.dumps(updated["config"])
