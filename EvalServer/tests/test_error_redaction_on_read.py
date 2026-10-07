"""
Failure reasons are shown to every user of the organization, so credentials a
provider error echoes back must not reach them: arena errors are redacted when
stored, and every reader redacts too, which covers rows stored before
redaction on write existed.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

import pytest

from crud.deepeval_arena import _row_to_dict, update_arena_comparison
from crud.evaluation_logs import get_experiment_by_id, get_experiments, get_logs, update_experiment

SECRET = "sk-proj-abcdef1234567890"
LEAKY = f"401 Unauthorized: Bearer {SECRET}"


class _Result:
    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self._rows = rows

    def mappings(self) -> "_Result":
        return self

    def __iter__(self):
        return iter(self._rows)

    def __getitem__(self, i: int) -> Dict[str, Any]:
        return self._rows[i]

    def first(self) -> Dict[str, Any] | None:
        return self._rows[0] if self._rows else None

    def all(self) -> List[Dict[str, Any]]:
        return self._rows


class _FakeDb:
    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self.rows = rows
        self.params: List[Any] = []

    async def execute(self, statement: Any, params: Any = None) -> _Result:
        self.params.append(params)
        return _Result(self.rows)

    async def commit(self) -> None:
        pass


NOW = datetime(2026, 10, 7, 12, 0, 0)


def _experiment_row() -> Dict[str, Any]:
    return {
        "id": "exp-1",
        "project_id": "p1",
        "name": "Run",
        "description": "d",
        "config": {},
        "baseline_experiment_id": None,
        "status": "failed",
        "results": None,
        "error_message": LEAKY,
        "started_at": NOW,
        "completed_at": NOW,
        "created_at": NOW,
        "updated_at": NOW,
        "created_by": None,
        "model_inventory_id": None,
    }


def _arena_row() -> Dict[str, Any]:
    return {
        "id": "arena-1",
        "name": "A",
        "description": None,
        "organization_id": 1,
        "contestants": [],
        "contestant_names": [],
        "metric_config": {},
        "judge_model": "j",
        "status": "failed",
        "progress": None,
        "winner": None,
        "win_counts": {},
        "detailed_results": [
            {
                "reason": f"Error: {LEAKY}",
                "contestants": [{"name": "c", "output": f"Error: {LEAKY}"}],
            }
        ],
        "error_message": LEAKY,
        "created_at": NOW,
        "updated_at": NOW,
        "completed_at": None,
        "created_by": None,
    }


@pytest.mark.asyncio
async def test_experiment_readers_redact_a_stored_reason() -> None:
    experiments = await get_experiments(_FakeDb([_experiment_row()]), organization_id=1)  # type: ignore[arg-type]
    assert SECRET not in experiments[0]["error_message"]
    assert "[redacted]" in experiments[0]["error_message"]

    experiment = await get_experiment_by_id(_FakeDb([_experiment_row()]), "exp-1", organization_id=1)  # type: ignore[arg-type]
    assert SECRET not in experiment["error_message"]


@pytest.mark.asyncio
async def test_log_reader_redacts_a_stored_reason() -> None:
    row = {
        "id": "l1",
        "project_id": "p1",
        "experiment_id": "exp-1",
        "trace_id": None,
        "span_name": None,
        "input_text": "in",
        "output_text": "",
        "model_name": "m",
        "metadata": {},
        "latency_ms": 1,
        "token_count": 1,
        "cost": None,
        "status": "error",
        "error_message": LEAKY,
        "timestamp": NOW,
    }
    logs = await get_logs(_FakeDb([row]), organization_id=1)  # type: ignore[arg-type]
    assert SECRET not in logs[0]["error_message"]


def test_arena_reader_redacts_stored_errors() -> None:
    comparison = _row_to_dict(_arena_row())
    text = str(comparison)
    assert SECRET not in text
    assert comparison["errorMessage"].startswith("401 Unauthorized")


@pytest.mark.asyncio
async def test_arena_update_redacts_before_storing() -> None:
    db = _FakeDb([_arena_row()])
    await update_arena_comparison("arena-1", organization_id=1, db=db, error_message=LEAKY)  # type: ignore[arg-type]
    assert SECRET not in db.params[0]["error_message"]


@pytest.mark.asyncio
async def test_experiment_readers_redact_a_stored_custom_scorer_error() -> None:
    def row() -> Dict[str, Any]:
        r = _experiment_row()
        r["results"] = {
            "detailed_results": [
                {
                    "metric_scores": {
                        "tone": {"label": "ERROR", "score": 0.0, "passed": False, "reason": f"Error calling judge model (openai): {LEAKY}"},
                        "fit": {"label": "Good", "score": 1.0, "passed": True, "reason": "Bearer of good news"},
                    }
                }
            ]
        }
        return r

    for experiment in (
        (await get_experiments(_FakeDb([row()]), organization_id=1))[0],  # type: ignore[arg-type]
        await get_experiment_by_id(_FakeDb([row()]), "exp-1", organization_id=1),  # type: ignore[arg-type]
    ):
        scores = experiment["results"]["detailed_results"][0]["metric_scores"]
        assert SECRET not in scores["tone"]["reason"]
        assert scores["tone"]["reason"].startswith("Error calling judge model (openai): 401")
        assert scores["fit"]["reason"] == "Bearer of good news"


@pytest.mark.asyncio
async def test_custom_scorer_redacts_a_judge_error(monkeypatch: pytest.MonkeyPatch) -> None:
    from utils import run_custom_scorer as module

    def failing_client(*_args: Any, **_kwargs: Any) -> Any:
        raise RuntimeError(LEAKY)

    monkeypatch.setattr(module, "get_provider_client", failing_client)
    result = await module.run_custom_scorer(
        scorer_config={
            "id": "s1",
            "name": "Tone",
            "config": {
                "judgeModel": {"name": "gpt-4o", "provider": "openai"},
                "messages": [{"role": "user", "content": "Rate {{output}}"}],
            },
        },
        input_text="in",
        output_text="out",
    )
    assert result.label == "ERROR"
    assert SECRET not in result.raw_response
    assert "[redacted]" in result.raw_response


def _scorer_error_scores() -> Dict[str, Any]:
    return {
        "tone": {"label": "ERROR", "score": 0.0, "passed": False, "reason": f"Error calling judge model (openai): {LEAKY}"},
    }


@pytest.mark.asyncio
async def test_experiment_update_response_is_redacted() -> None:
    row = _experiment_row()
    row["results"] = {"detailed_results": [{"metric_scores": _scorer_error_scores()}]}
    experiment = await update_experiment(_FakeDb([row]), "exp-1", organization_id=1, name="Renamed")  # type: ignore[arg-type]
    assert SECRET not in str(experiment)
    assert "[redacted]" in experiment["error_message"]


@pytest.mark.asyncio
async def test_log_reader_redacts_scorer_errors_in_metadata() -> None:
    row = {
        "id": "l1",
        "project_id": "p1",
        "experiment_id": "exp-1",
        "trace_id": None,
        "span_name": None,
        "input_text": "in",
        "output_text": "out",
        "model_name": "m",
        "metadata": {"metric_scores": _scorer_error_scores()},
        "latency_ms": 1,
        "token_count": 1,
        "cost": None,
        "status": "success",
        "error_message": None,
        "timestamp": NOW,
    }
    logs = await get_logs(_FakeDb([row]), organization_id=1)  # type: ignore[arg-type]
    reason = logs[0]["metadata"]["metric_scores"]["tone"]["reason"]
    assert SECRET not in reason
    assert reason.startswith("Error calling judge model (openai): 401")
