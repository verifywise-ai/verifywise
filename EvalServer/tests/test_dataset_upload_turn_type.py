"""
Upload keeps a simulated dataset's turn type and counts its scenarios.

Before this, "simulated" was coerced to "single-turn" with a prompt count of 0,
so the New experiment wizard never saw a simulated dataset to run.
"""

from __future__ import annotations

import io
import json
from contextlib import asynccontextmanager
from typing import Any, Dict

import pytest
from fastapi import UploadFile

from controllers import deepeval as controller


def _upload(rows: list) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(json.dumps(rows).encode("utf-8")),
        filename="support_scenarios.json",
        headers={"content-type": "application/json"},
    )


@pytest.fixture
def saved(monkeypatch: pytest.MonkeyPatch, tmp_path) -> Dict[str, Any]:
    """Uploads go to a temp dir; captures what would be stored in the DB."""
    record: Dict[str, Any] = {}

    @asynccontextmanager
    async def fake_db():
        class _Db:
            async def commit(self) -> None:
                return None

        yield _Db()

    async def fake_create(**kwargs: Any) -> None:
        record.update(kwargs)

    monkeypatch.setattr(controller, "_get_uploads_root", lambda: tmp_path)
    monkeypatch.setattr(controller, "get_db", fake_db)
    monkeypatch.setattr(controller, "create_user_dataset", fake_create)
    return record


@pytest.mark.asyncio
async def test_simulated_dataset_keeps_turn_type_and_counts_scenarios(saved):
    rows = [
        {"scenario": "Reset a password", "expected_outcome": "Steps explained"},
        {"scenario": "Cancel an order", "expected_outcome": "Order cancelled", "max_turns": 4},
        {"scenario": "   ", "expected_outcome": "blank scenario is not counted"},
    ]
    response = await controller.upload_deepeval_dataset_controller(
        dataset=_upload(rows), organization_id=1, org_id="1", turn_type="simulated"
    )

    body = json.loads(response.body)
    assert body["turnType"] == "simulated"
    assert saved["turn_type"] == "simulated"
    assert saved["prompt_count"] == 2


@pytest.mark.asyncio
async def test_scenario_rows_are_not_counted_as_single_turn_prompts(saved):
    rows = [{"scenario": "Reset a password", "expected_outcome": "Steps explained"}]
    await controller.upload_deepeval_dataset_controller(
        dataset=_upload(rows), organization_id=1, org_id="1", turn_type="single-turn"
    )
    assert saved["turn_type"] == "single-turn"
    assert saved["prompt_count"] == 0


@pytest.mark.asyncio
async def test_unknown_turn_type_still_falls_back_to_single_turn(saved):
    rows = [{"prompt": "Hello"}]
    await controller.upload_deepeval_dataset_controller(
        dataset=_upload(rows), organization_id=1, org_id="1", turn_type="bogus"
    )
    assert saved["turn_type"] == "single-turn"
    assert saved["prompt_count"] == 1
