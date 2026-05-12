"""Arena API — run model-vs-model comparisons."""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from .client import _BaseAPI
from .exceptions import TimeoutError
from .models import ArenaComparison


class ArenaAPI(_BaseAPI):

    def compare(
        self,
        contestants: List[Dict[str, Any]],
        *,
        dataset_id: Optional[str] = None,
        dataset_path: Optional[str] = None,
        judge_model: str = "gpt-4o",
        metric: str = "overall_quality",
        num_samples: int = 10,
    ) -> ArenaComparison:
        """Start an arena comparison between models."""
        body: Dict[str, Any] = {
            "contestants": contestants,
            "judgeModel": judge_model,
            "metric": metric,
            "numSamples": num_samples,
        }
        if dataset_id:
            body["datasetId"] = dataset_id
        if dataset_path:
            body["datasetPath"] = dataset_path

        data = self._post("arena/compare", json=body, timeout=60)
        return ArenaComparison.from_dict(data)

    def list(self, org_id: Optional[str] = None) -> List[ArenaComparison]:
        """List arena comparisons."""
        params: Dict[str, Any] = {}
        if org_id:
            params["org_id"] = org_id
        data = self._get("arena/comparisons", params=params)
        items = data if isinstance(data, list) else data.get("comparisons", [])
        return [ArenaComparison.from_dict(c) for c in items]

    def get(self, comparison_id: str) -> ArenaComparison:
        """Get arena comparison status."""
        data = self._get(f"arena/comparisons/{comparison_id}")
        return ArenaComparison.from_dict(data)

    def get_results(self, comparison_id: str) -> Dict[str, Any]:
        """Get detailed arena comparison results."""
        return self._get(f"arena/comparisons/{comparison_id}/results")

    def delete(self, comparison_id: str) -> None:
        """Delete an arena comparison."""
        self._delete(f"arena/comparisons/{comparison_id}")

    def compare_and_wait(
        self,
        contestants: List[Dict[str, Any]],
        *,
        timeout_minutes: int = 30,
        poll_interval: int = 10,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Start a comparison, poll until done, and return results."""
        comp = self.compare(contestants, **kwargs)
        deadline = time.time() + timeout_minutes * 60

        while time.time() < deadline:
            current = self.get(comp.id)
            if current.status in ("completed", "failed"):
                if current.status == "completed":
                    return self.get_results(comp.id)
                raise RuntimeError(f"Arena comparison failed: {comp.id}")
            time.sleep(poll_interval)

        raise TimeoutError(f"Arena comparison {comp.id} did not complete within {timeout_minutes} minutes")
