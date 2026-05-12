"""Typed response models for the VerifyWise SDK."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class Experiment:
    id: str
    name: str
    status: str
    project_id: str = ""
    description: str = ""
    config: Dict[str, Any] = field(default_factory=dict)
    results: Optional[Dict[str, Any]] = None
    error_message: str = ""
    created_at: str = ""
    completed_at: str = ""
    created_by: Optional[int] = None

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Experiment":
        return cls(
            id=d.get("id", ""),
            name=d.get("name", ""),
            status=d.get("status", "unknown"),
            project_id=d.get("project_id", ""),
            description=d.get("description", ""),
            config=d.get("config") or {},
            results=d.get("results"),
            error_message=d.get("error_message", ""),
            created_at=d.get("created_at", ""),
            completed_at=d.get("completed_at", ""),
            created_by=d.get("created_by"),
        )


@dataclass
class MetricResult:
    name: str
    score: float
    threshold: float
    passed: bool
    inverted: bool = False


@dataclass
class EvalResults:
    experiment_id: str
    name: str
    status: str
    model: str
    passed: bool
    metrics: List[MetricResult] = field(default_factory=list)
    total_prompts: int = 0
    duration_ms: Optional[float] = None

    @classmethod
    def from_experiment(cls, exp: Experiment, default_threshold: float = 0.5) -> "EvalResults":
        results = exp.results or {}
        avg_scores = results.get("avg_scores", {})
        thresholds = results.get("metric_thresholds", {})
        config = exp.config or {}

        inverted_keywords = ("bias", "toxicity", "hallucination")
        metrics_out: List[MetricResult] = []
        all_passed = True

        for metric_name, score_val in avg_scores.items():
            score = float(score_val)
            thr = float(thresholds[metric_name]) if metric_name in thresholds else default_threshold
            inverted = any(k in metric_name.lower() for k in inverted_keywords)
            passed = (score <= thr) if inverted else (score >= thr)
            if not passed:
                all_passed = False
            metrics_out.append(MetricResult(
                name=metric_name, score=score, threshold=thr,
                passed=passed, inverted=inverted,
            ))

        model_cfg = config.get("model", {})
        model_name = model_cfg.get("name") or model_cfg.get("model_name", "Unknown")

        return cls(
            experiment_id=exp.id,
            name=exp.name,
            status=exp.status,
            model=model_name,
            passed=all_passed,
            metrics=metrics_out,
            total_prompts=results.get("total_prompts", 0),
            duration_ms=results.get("duration"),
        )


@dataclass
class Dataset:
    id: Any
    name: str
    path: str = ""
    prompt_count: int = 0
    dataset_type: str = ""
    turn_type: str = ""
    created_at: str = ""

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Dataset":
        return cls(
            id=d.get("id", ""),
            name=d.get("name", ""),
            path=d.get("path", ""),
            prompt_count=d.get("prompt_count") or d.get("promptCount", 0),
            dataset_type=d.get("dataset_type", ""),
            turn_type=d.get("turn_type", ""),
            created_at=d.get("created_at", ""),
        )


@dataclass
class ModelConfig:
    id: Any
    name: str
    provider: str = ""
    model_name: str = ""
    endpoint_url: str = ""
    config: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ModelConfig":
        return cls(
            id=d.get("id", ""),
            name=d.get("name", ""),
            provider=d.get("provider", ""),
            model_name=d.get("model_name", ""),
            endpoint_url=d.get("endpoint_url", ""),
            config=d.get("config") or {},
        )


@dataclass
class Scorer:
    id: Any
    name: str
    provider: str = ""
    model: str = ""
    prompt_template: str = ""
    config: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Scorer":
        return cls(
            id=d.get("id", ""),
            name=d.get("name", ""),
            provider=d.get("provider", ""),
            model=d.get("model", ""),
            prompt_template=d.get("prompt_template", ""),
            config=d.get("config") or {},
        )


@dataclass
class Report:
    id: str
    title: str
    format: str
    file_size: int = 0
    experiments: int = 0
    experiment_ids: List[str] = field(default_factory=list)
    project_id: str = ""
    created_at: str = ""

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Report":
        return cls(
            id=d.get("id", ""),
            title=d.get("title", ""),
            format=d.get("format", "pdf"),
            file_size=d.get("fileSize") or d.get("file_size", 0),
            experiments=d.get("experiments", 0),
            experiment_ids=d.get("experimentIds") or d.get("experiment_ids", []),
            project_id=d.get("projectId") or d.get("project_id", ""),
            created_at=d.get("createdAt") or d.get("created_at", ""),
        )


@dataclass
class Project:
    id: str
    name: str
    description: str = ""
    use_case: str = ""
    created_at: str = ""

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Project":
        return cls(
            id=d.get("id", ""),
            name=d.get("name", ""),
            description=d.get("description", ""),
            use_case=d.get("use_case") or d.get("useCase", ""),
            created_at=d.get("created_at") or d.get("createdAt", ""),
        )


@dataclass
class Org:
    id: str
    name: str

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Org":
        return cls(id=d.get("id", ""), name=d.get("name", ""))


@dataclass
class ArenaComparison:
    id: str
    status: str
    contestants: List[Dict[str, Any]] = field(default_factory=list)
    results: Optional[Dict[str, Any]] = None
    created_at: str = ""

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ArenaComparison":
        return cls(
            id=d.get("id", ""),
            status=d.get("status", ""),
            contestants=d.get("contestants", []),
            results=d.get("results"),
            created_at=d.get("created_at") or d.get("createdAt", ""),
        )


@dataclass
class BiasAudit:
    id: str
    status: str
    config: Dict[str, Any] = field(default_factory=dict)
    results: Optional[Dict[str, Any]] = None
    created_at: str = ""

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "BiasAudit":
        return cls(
            id=d.get("id", ""),
            status=d.get("status", ""),
            config=d.get("config") or {},
            results=d.get("results"),
            created_at=d.get("created_at") or d.get("createdAt", ""),
        )
