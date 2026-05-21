from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel


class RunRequest(BaseModel):
    dataset_version: str
    stages: List[str]
    params: dict


class RunStatus(BaseModel):
    state: str  # idle | running | done | failed
    active_stage: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None


class ProgressCounts(BaseModel):
    model_id: str
    completed: int
    total: int
    failures: int


class DatasetList(BaseModel):
    versions: List[str]
