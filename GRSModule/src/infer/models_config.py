from __future__ import annotations

from pydantic import BaseModel
from typing import List


class ModelSpec(BaseModel):
    provider: str
    model_id: str
    region: str | None = None


class ModelsConfig(BaseModel):
    version: str
    models: List[ModelSpec]
