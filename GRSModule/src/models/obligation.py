from __future__ import annotations

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Literal

from models.generated_by import GeneratedBy


class SourceRef(BaseModel):
    source_type: Literal["internal_policy", "eu_ai_act", "iso_42001", "other"]
    source_ref: str
    excerpt_id: str


class Obligation(BaseModel):
    obligation_id: str
    source: SourceRef

    must: List[str] = Field(default_factory=list)
    must_not: List[str] = Field(default_factory=list)
    generated_by: GeneratedBy | None = None

    @field_validator("obligation_id")
    @classmethod
    def _id_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("obligation_id must not be blank")
        return v

    @field_validator("must", "must_not")
    @classmethod
    def _nonempty_strings(cls, v: List[str]) -> List[str]:
        return [s.strip() for s in v if isinstance(s, str) and s.strip()]

    @model_validator(mode="after")
    def _must_have_at_least_one_rule(self) -> "Obligation":
        if not self.must and not self.must_not:
            raise ValueError("Each obligation must include at least one rule in must or must_not")
        return self