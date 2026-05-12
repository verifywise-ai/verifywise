"""Experiments API — create, run, poll, and manage LLM evaluation experiments."""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from .client import _BaseAPI
from .exceptions import TimeoutError
from .models import EvalResults, Experiment


class ExperimentsAPI(_BaseAPI):

    def create(
        self,
        project_id: str,
        name: str,
        *,
        model_name: str,
        model_provider: str,
        dataset_id: Optional[str] = None,
        dataset_path: Optional[str] = None,
        metrics: Optional[List[str]] = None,
        threshold: float = 0.7,
        judge_model: str = "gpt-4o",
        judge_provider: str = "openai",
        description: str = "",
        config_overrides: Optional[Dict[str, Any]] = None,
    ) -> Experiment:
        """Create and start an evaluation experiment.

        Either ``dataset_id`` or ``dataset_path`` must be provided.
        If ``dataset_id`` is given, the dataset path is resolved automatically.
        """
        dataset_cfg: Dict[str, Any] = {}
        if dataset_id:
            ds = self._resolve_dataset(dataset_id)
            dataset_cfg = {"id": dataset_id, "name": ds.get("name", ""), "path": ds.get("path", "")}
        elif dataset_path:
            dataset_cfg = {"path": dataset_path}

        metric_configs = [{"name": m, "threshold": threshold} for m in (metrics or [])]

        config: Dict[str, Any] = {
            "evaluationMode": "standard",
            "model": {
                "name": model_name,
                "model_name": model_name,
                "provider": model_provider,
            },
            "dataset": dataset_cfg,
            "metrics": metric_configs,
            "metric_thresholds": {m: threshold for m in (metrics or [])},
            "judgeLlm": {
                "provider": judge_provider,
                "model": judge_model,
            },
        }
        if config_overrides:
            config.update(config_overrides)

        data = self._post("experiments", json={
            "project_id": project_id,
            "name": name,
            "description": description,
            "config": config,
        })
        exp = data.get("experiment", data)
        return Experiment.from_dict(exp)

    def list(
        self,
        project_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Experiment]:
        """List experiments with optional filtering."""
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if project_id:
            params["project_id"] = project_id
        if status:
            params["status"] = status
        data = self._get("experiments", params=params)
        return [Experiment.from_dict(e) for e in data.get("experiments", [])]

    def list_all(self, project_id: Optional[str] = None) -> List[Experiment]:
        """List all experiments without pagination."""
        params: Dict[str, Any] = {}
        if project_id:
            params["project_id"] = project_id
        data = self._get("experiments/all", params=params)
        return [Experiment.from_dict(e) for e in data.get("experiments", [])]

    def get(self, experiment_id: str) -> Experiment:
        """Get a single experiment by ID."""
        data = self._get(f"experiments/{experiment_id}")
        exp = data.get("experiment", data)
        return Experiment.from_dict(exp)

    def update(self, experiment_id: str, *, name: Optional[str] = None, description: Optional[str] = None) -> Experiment:
        """Update experiment name or description."""
        body: Dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if description is not None:
            body["description"] = description
        data = self._patch(f"experiments/{experiment_id}", json=body)
        return Experiment.from_dict(data.get("experiment", data))

    def delete(self, experiment_id: str) -> None:
        """Delete an experiment and its logs."""
        self._delete(f"experiments/{experiment_id}")

    def poll(
        self,
        experiment_id: str,
        *,
        timeout_minutes: int = 30,
        poll_interval: int = 10,
        on_status: Any = None,
    ) -> Experiment:
        """Poll an experiment until it completes or fails.

        Args:
            on_status: Optional callback ``fn(status: str)`` invoked on status changes.
        """
        deadline = time.time() + timeout_minutes * 60
        last_status = ""

        while time.time() < deadline:
            exp = self.get(experiment_id)
            if exp.status != last_status:
                last_status = exp.status
                if on_status:
                    on_status(exp.status)
            if exp.status in ("completed", "failed"):
                return exp
            time.sleep(poll_interval)

        raise TimeoutError(f"Experiment {experiment_id} did not complete within {timeout_minutes} minutes")

    def run_and_wait(
        self,
        project_id: str,
        name: str,
        *,
        model_name: str,
        model_provider: str,
        dataset_id: Optional[str] = None,
        dataset_path: Optional[str] = None,
        metrics: Optional[List[str]] = None,
        threshold: float = 0.7,
        judge_model: str = "gpt-4o",
        judge_provider: str = "openai",
        timeout_minutes: int = 30,
        poll_interval: int = 10,
        on_status: Any = None,
    ) -> EvalResults:
        """Create an experiment, poll until done, and return parsed results.

        This is the high-level convenience method for CI/CD integration::

            results = client.experiments.run_and_wait(
                project_id="proj_123",
                name="Nightly Eval",
                model_name="gpt-4o-mini",
                model_provider="openai",
                dataset_id="2",
                metrics=["correctness", "completeness", "answerRelevancy"],
                threshold=0.7,
            )
            assert results.passed
        """
        exp = self.create(
            project_id=project_id,
            name=name,
            model_name=model_name,
            model_provider=model_provider,
            dataset_id=dataset_id,
            dataset_path=dataset_path,
            metrics=metrics,
            threshold=threshold,
            judge_model=judge_model,
            judge_provider=judge_provider,
        )
        completed = self.poll(
            exp.id,
            timeout_minutes=timeout_minutes,
            poll_interval=poll_interval,
            on_status=on_status,
        )
        return EvalResults.from_experiment(completed, default_threshold=threshold)

    def _resolve_dataset(self, dataset_id: str) -> Dict[str, Any]:
        datasets = self._get("datasets/user")
        if isinstance(datasets, dict):
            datasets = datasets.get("datasets", datasets)
        if isinstance(datasets, list):
            for ds in datasets:
                if str(ds.get("id")) == str(dataset_id):
                    return ds
        raise ValueError(f"Dataset {dataset_id} not found")
