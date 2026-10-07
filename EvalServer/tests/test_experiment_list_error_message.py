"""
The experiments list must carry error_message, so the experiment tables can
show why a failed run failed (the detail endpoint already returns it).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

import pytest

from crud.evaluation_logs import create_log, get_experiments, update_experiment_status


class _Result:
    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self._rows = rows

    def mappings(self) -> List[Dict[str, Any]]:
        return self._rows


class _FakeDb:
    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self.rows = rows
        self.sql: List[str] = []

    async def execute(self, statement: Any, params: Any = None) -> _Result:
        self.sql.append(str(statement))
        return _Result(self.rows)


@pytest.mark.asyncio
async def test_list_returns_the_failure_reason() -> None:
    now = datetime(2026, 10, 6, 12, 0, 0)
    row = {
        "id": "exp-1",
        "project_id": "p1",
        "name": "Run",
        "description": "Evaluating m with 2 prompts",
        "config": {},
        "status": "failed",
        "results": None,
        "error_message": "No responses generated: 2/2 prompts failed. First error: boom",
        "created_at": now,
        "updated_at": now,
        "started_at": now,
        "completed_at": now,
        "model_inventory_id": None,
    }
    db = _FakeDb([row])

    experiments = await get_experiments(db, organization_id=1)  # type: ignore[arg-type]

    assert "error_message" in db.sql[0]
    assert experiments[0]["error_message"] == row["error_message"]


class _RecordingDb:
    """Records the parameters of each statement; returns no rows."""

    def __init__(self) -> None:
        self.params: List[Dict[str, Any]] = []

    async def execute(self, statement: Any, params: Any = None) -> Any:
        self.params.append(dict(params or {}))

        class _R:
            def mappings(self) -> Any:
                class _M:
                    def first(self) -> None:
                        return None

                    def __iter__(self):  # type: ignore[no-untyped-def]
                        return iter([])

                return _M()

            def fetchone(self) -> None:
                return None

        return _R()

    async def commit(self) -> None:
        return None


SECRET_ERROR = "Evaluation failed: 403 for url https://x/m?key=AIzaSyABCDEF1234567890"


@pytest.mark.asyncio
async def test_experiment_failure_reason_is_stored_redacted() -> None:
    # Every failure path stores its reason through here, and it is shown to
    # every user of the organization.
    db = _RecordingDb()
    await update_experiment_status(  # type: ignore[arg-type]
        db, experiment_id="exp-1", status="failed", organization_id=1, error_message=SECRET_ERROR
    )
    stored = next(p["error_message"] for p in db.params if "error_message" in p)
    assert "AIzaSyABCDEF1234567890" not in stored
    assert stored.startswith("Evaluation failed: 403 for url")


@pytest.mark.asyncio
async def test_log_error_is_stored_redacted() -> None:
    db = _RecordingDb()
    await create_log(  # type: ignore[arg-type]
        db,
        project_id="p1",
        organization_id=1,
        experiment_id="exp-1",
        input_text="q",
        output_text="",
        status="error",
        error_message="Bearer sk-proj-abcdefghijklmnop rejected",
    )
    stored = next(p["error_message"] for p in db.params if "error_message" in p)
    assert "sk-proj-abcdefghijklmnop" not in stored

