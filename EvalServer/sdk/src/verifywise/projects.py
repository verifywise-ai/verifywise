"""Projects API — manage evaluation projects."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .client import _BaseAPI
from .models import Project


class ProjectsAPI(_BaseAPI):

    def list(self) -> List[Project]:
        """List all projects."""
        data = self._get("projects")
        items = data if isinstance(data, list) else data.get("projects", [])
        return [Project.from_dict(p) for p in items]

    def create(self, name: str, *, description: str = "", use_case: str = "chatbot") -> Project:
        """Create a new project."""
        data = self._post("projects", json={
            "name": name,
            "description": description,
            "useCase": use_case,
        })
        proj = data.get("project", data) if isinstance(data, dict) else data
        return Project.from_dict(proj)

    def get(self, project_id: str) -> Project:
        """Get a project by ID."""
        data = self._get(f"projects/{project_id}")
        return Project.from_dict(data)

    def update(self, project_id: str, **fields: Any) -> Project:
        """Update a project."""
        data = self._put(f"projects/{project_id}", json=fields)
        return Project.from_dict(data)

    def delete(self, project_id: str) -> None:
        """Delete a project and all its experiments."""
        self._delete(f"projects/{project_id}")

    def stats(self, project_id: str) -> Dict[str, Any]:
        """Get project statistics (experiment count, avg metrics)."""
        return self._get(f"projects/{project_id}/stats")

    def dashboard(self, project_id: str) -> Dict[str, Any]:
        """Get monitoring dashboard data (metrics, logs, experiments)."""
        return self._get(f"projects/{project_id}/monitor/dashboard")
