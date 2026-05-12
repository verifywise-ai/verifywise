"""Orgs API — manage organizations."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .client import _BaseAPI
from .models import Org, Project


class OrgsAPI(_BaseAPI):

    def list(self) -> List[Org]:
        """List organizations."""
        data = self._get("orgs")
        items = data if isinstance(data, list) else data.get("orgs", [])
        return [Org.from_dict(o) for o in items]

    def create(self, name: str) -> Org:
        """Create an organization."""
        data = self._post("orgs", json={"name": name})
        return Org.from_dict(data)

    def update(self, org_id: str, **fields: Any) -> Org:
        """Update an organization."""
        data = self._put(f"orgs/{org_id}", json=fields)
        return Org.from_dict(data)

    def delete(self, org_id: str) -> None:
        """Delete an organization."""
        self._delete(f"orgs/{org_id}")

    def list_projects(self, org_id: str) -> List[Project]:
        """List projects for an organization."""
        data = self._get(f"orgs/{org_id}/projects")
        items = data if isinstance(data, list) else data.get("projects", [])
        return [Project.from_dict(p) for p in items]
