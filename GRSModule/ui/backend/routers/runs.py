from __future__ import annotations
import json
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import app as _app
from ..models import RunRequest, RunStatus
from ..state import run_state
from ..services.runner import start_run, stop_run

router = APIRouter()


@router.get("/run/status", response_model=RunStatus)
def get_run_status():
    return RunStatus(
        state=run_state.state,
        active_stage=run_state.active_stage,
        started_at=run_state.started_at,
        completed_at=run_state.completed_at,
        error=run_state.error,
    )


@router.post("/run", status_code=202)
def post_run(request: RunRequest):
    error = start_run(request, _app.GRS_ROOT)
    if error == "A run is already in progress":
        raise HTTPException(status_code=409, detail=error)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return {"ok": True}


@router.delete("/run", status_code=200)
def delete_run():
    if run_state.state != "running":
        raise HTTPException(status_code=409, detail="No run in progress")
    stop_run()
    return {"ok": True}


class RunHistoryEntry(BaseModel):
    timestamp: str
    dataset_version: Optional[str]
    stages: Optional[List[str]]
    status: str
    error_message: Optional[str] = None


class RunHistoryList(BaseModel):
    runs: List[RunHistoryEntry]


@router.get("/runs", response_model=RunHistoryList)
def get_runs():
    datasets_dir = _app.GRS_ROOT / "datasets"
    if not datasets_dir.exists():
        return RunHistoryList(runs=[])

    entries: List[RunHistoryEntry] = []
    for snapshot_dir in sorted(
        datasets_dir.glob("*/configs_snapshot/run_*"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    ):
        run_cfg_path = snapshot_dir / "run_config.json"
        result_path = snapshot_dir / "run_result.json"

        dataset_version = None
        stages = None
        if run_cfg_path.exists():
            try:
                data = json.loads(run_cfg_path.read_text())
                dataset_version = data.get("dataset_version")
                stages = data.get("stages")
            except (json.JSONDecodeError, KeyError):
                pass

        status = "interrupted"
        error_message = None
        if result_path.exists():
            try:
                result = json.loads(result_path.read_text())
                status = result.get("status", "interrupted")
                error_message = result.get("error_message")
            except json.JSONDecodeError:
                pass

        entries.append(RunHistoryEntry(
            timestamp=snapshot_dir.name,
            dataset_version=dataset_version,
            stages=stages,
            status=status,
            error_message=error_message,
        ))

    return RunHistoryList(runs=entries)
