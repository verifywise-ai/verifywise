from __future__ import annotations

from pydantic import BaseModel


class GeneratedBy(BaseModel):
    model_id: str
    provider: str | None = None
    generated_at: str | None = None  # ISO 8601 timestamp
