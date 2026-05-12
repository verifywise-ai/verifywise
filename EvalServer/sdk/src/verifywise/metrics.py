"""Metrics API — query available metrics and aggregated stats."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .client import _BaseAPI


class MetricsAPI(_BaseAPI):

    def available(self) -> List[Dict[str, Any]]:
        """List all available DeepEval metrics and their requirements."""
        data = self._get("metrics/available")
        return data if isinstance(data, list) else data.get("metrics", [])

    def aggregates(
        self,
        project_id: str,
        *,
        metric_name: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get aggregated metric statistics for a project."""
        params: Dict[str, Any] = {"project_id": project_id}
        if metric_name:
            params["metric_name"] = metric_name
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        return self._get("metrics/aggregates", params=params)
