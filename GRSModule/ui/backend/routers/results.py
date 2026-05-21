from __future__ import annotations
import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from .. import app as _app
from ..services.watcher import count_lines

router = APIRouter()


@router.get("/results/leaderboard")
def get_leaderboard(dataset_version: str = Query(...)):
    path = _app.GRS_ROOT / "datasets" / dataset_version / "final" / "leaderboard.json"
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
    final = _app.GRS_ROOT / "datasets" / dataset_version / "final"

    def _count(path):
        return count_lines(path) if path.exists() else None

    scenarios_path = final / "scenarios.jsonl"
    scenarios = _count(scenarios_path)

    responses_dir = final / "responses"
    if responses_dir.exists():
        success_files = [f for f in responses_dir.glob("*.jsonl")
                         if ".failures" not in f.name and ".patch_failures" not in f.name]
        responses = sum(count_lines(f) for f in success_files)
        models_inferred = len(success_files)
    else:
        responses = None
        models_inferred = None

    scores_dir = final / "judge_scores"
    if scores_dir.exists():
        score_files = [f for f in scores_dir.glob("*.jsonl")
                       if ".failures" not in f.name and ".patch_failures" not in f.name]
        scores = sum(count_lines(f) for f in score_files)
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
