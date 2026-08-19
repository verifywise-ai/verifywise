"""
Request schemas for the DeepEval HTTP API.

These pydantic models type the request bodies that previously arrived as raw
``dict = Body(...)`` payloads, so malformed requests are rejected with a 422
before reaching the controllers.

All models use ``extra="allow"``: the evaluation runner and controllers read a
broad, evolving set of keys (``evaluationMode``, ``taskType``, ``scorerApiKeys``,
``projectId``, ...) that must keep passing through untouched. Validation only
guarantees that known fields, when present, have the right type — it does not
restrict additional fields.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class EvaluateConfig(BaseModel):
    """
    Body for ``POST /deepeval/evaluate``.

    Everything is optional — the controller/runner apply their own defaults.
    Nested objects stay free-form; only the top-level shape is validated.
    """

    model_config = ConfigDict(extra="allow")

    dataset: Optional[Dict[str, Any]] = None
    model: Optional[Dict[str, Any]] = None
    judgeLlm: Optional[Dict[str, Any]] = None
    metrics: Optional[Dict[str, Any]] = None
    metric_thresholds: Optional[Dict[str, Any]] = None
    selectedScorers: Optional[List[str]] = None


class CreateScorerRequest(BaseModel):
    """Body for ``POST /deepeval/scorers``."""

    model_config = ConfigDict(extra="allow")

    name: str = Field(min_length=1)
    metricKey: str = Field(min_length=1)
    id: Optional[str] = None
    orgId: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None
    defaultThreshold: Optional[float] = None
    weight: Optional[float] = None
    createdBy: Optional[str] = None


class UpdateScorerRequest(BaseModel):
    """Body for ``PUT /deepeval/scorers/{scorer_id}`` — partial update."""

    model_config = ConfigDict(extra="allow")

    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    metricKey: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None
    defaultThreshold: Optional[float] = None
    weight: Optional[float] = None


class ScorerTestRequest(BaseModel):
    """Body for ``POST /deepeval/scorers/{scorer_id}/test``."""

    model_config = ConfigDict(extra="allow")

    input: str = Field(min_length=1)
    output: str = Field(min_length=1)
    expected: Optional[str] = None


class CreateModelRequest(BaseModel):
    """Body for ``POST /deepeval/models``."""

    model_config = ConfigDict(extra="allow")

    orgId: str = Field(min_length=1)
    name: str = Field(min_length=1)
    provider: str = Field(min_length=1)
    id: Optional[str] = None
    endpointUrl: Optional[str] = None
    createdBy: Optional[str] = None


class UpdateModelRequest(BaseModel):
    """Body for ``PUT /deepeval/models/{model_id}`` — partial update."""

    model_config = ConfigDict(extra="allow")

    name: Optional[str] = None
    provider: Optional[str] = None
    endpointUrl: Optional[str] = None
