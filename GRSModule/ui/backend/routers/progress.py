from fastapi import APIRouter, HTTPException, Query
from typing import List
from pydantic import BaseModel
from .. import app as _app
from ..models import ProgressCounts
from ..services.watcher import get_progress

router = APIRouter()

PROGRESS_STAGES = {"infer", "judge"}


class ProgressResponse(BaseModel):
    models: List[ProgressCounts]


@router.get("/progress/{stage}", response_model=ProgressResponse)
def get_stage_progress(stage: str, dataset_version: str = Query(...)):
    if stage not in PROGRESS_STAGES:
        raise HTTPException(status_code=400, detail=f"Progress not available for stage '{stage}'")
    counts = get_progress(stage, dataset_version, _app.GRS_ROOT)
    return ProgressResponse(models=counts)
