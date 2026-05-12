"""Logs API — query evaluation log entries."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .client import _BaseAPI


class LogsAPI(_BaseAPI):

    def list(
        self,
        *,
        project_id: Optional[str] = None,
        experiment_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """List evaluation log entries."""
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if project_id:
            params["project_id"] = project_id
        if experiment_id:
            params["experiment_id"] = experiment_id
        if status:
            params["status"] = status
        data = self._get("logs", params=params)
        if isinstance(data, list):
            return data
        return data.get("logs", [])

    def create(self, log_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a log entry."""
        return self._post("logs", json=log_data)
