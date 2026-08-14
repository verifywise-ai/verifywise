from __future__ import annotations
import json
import os
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from .. import app as _app
from ..services.watcher import count_lines
from ..services.path_utils import resolve_dataset_path

router = APIRouter()


def _safe_path(base: Path, target: Path) -> Path:
    """Return target resolved under base, or raise if it escapes.

    Uses os.path.normpath + startswith so CodeQL recognizes the check as a
    py/path-injection sanitizer.
    """
    fullpath = os.path.normpath(os.path.join(str(base), str(target)))
    basepath = os.path.normpath(str(base))
    if not fullpath.startswith(basepath + os.sep) and fullpath != basepath:
        raise ValueError(f"Path {fullpath} escapes allowed base {basepath}")
    return Path(fullpath)


@router.get("/results/leaderboard")
def get_leaderboard(dataset_version: str = Query(...)):
    path = resolve_dataset_path(_app.GRS_ROOT, dataset_version, "final", "leaderboard.json")
    path = _safe_path(_app.GRS_ROOT, path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Leaderboard not found for this dataset version")
    return json.loads(path.read_text(encoding="utf-8"))


class SummaryResponse(BaseModel):
    scenarios: Optional[int] = None
    responses: Optional[int] = None
    scores: Optional[int] = None
    models_inferred: Optional[int] = None
    models_scored: Optional[int] = None


@router.get("/results/summary", response_model=SummaryResponse)
def get_summary(dataset_version: str = Query(...)):
    final = resolve_dataset_path(_app.GRS_ROOT, dataset_version, "final")

    scenarios_path = _safe_path(_app.GRS_ROOT, final / "scenarios.jsonl")
    scenarios = count_lines(scenarios_path, base=_app.GRS_ROOT) if scenarios_path.exists() else None

    responses_dir = _safe_path(_app.GRS_ROOT, final / "responses")
    if responses_dir.exists():
        success_files = [f for f in responses_dir.glob("*.jsonl")
                         if ".failures" not in f.name and ".patch_failures" not in f.name]
        responses = sum(count_lines(f, base=_app.GRS_ROOT) for f in success_files)
        models_inferred = len(success_files)
    else:
        responses = None
        models_inferred = None

    scores_dir = _safe_path(_app.GRS_ROOT, final / "judge_scores")
    if scores_dir.exists():
        score_files = [f for f in scores_dir.glob("*.jsonl")
                       if ".failures" not in f.name and ".patch_failures" not in f.name]
        scores = sum(count_lines(f, base=_app.GRS_ROOT) for f in score_files)
        models_scored = len(score_files)
    else:
        scores = None
        models_scored = None

    return SummaryResponse(
        scenarios=scenarios,
        responses=responses,
        scores=scores,
        models_inferred=models_inferred,
        models_scored=models_scored,
    )
