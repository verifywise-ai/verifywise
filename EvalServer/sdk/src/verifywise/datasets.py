"""Datasets API — manage evaluation datasets."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .client import _BaseAPI
from .models import Dataset


class DatasetsAPI(_BaseAPI):

    def list_user(self, org_id: Optional[str] = None) -> List[Dataset]:
        """List user-uploaded datasets."""
        params: Dict[str, Any] = {}
        if org_id:
            params["org_id"] = org_id
        data = self._get("datasets/user", params=params)
        items = data if isinstance(data, list) else data.get("datasets", [])
        return [Dataset.from_dict(d) for d in items]

    def list_builtin(self, use_case: Optional[str] = None) -> List[Dict[str, Any]]:
        """List built-in preset datasets (chatbot, rag, agent)."""
        params: Dict[str, Any] = {}
        if use_case:
            params["use_case"] = use_case
        return self._get("datasets/list", params=params)

    def info(self) -> Dict[str, Any]:
        """Get built-in dataset info (prompts, categories, difficulties)."""
        return self._get("dataset/info")

    def read(self, path: str) -> List[Dict[str, Any]]:
        """Read dataset contents by file path."""
        return self._get("datasets/read", params={"path": path})

    def upload(
        self,
        file_path: str,
        name: str,
        *,
        org_id: str = "1",
        dataset_type: str = "chatbot",
        turn_type: str = "single-turn",
    ) -> Dict[str, Any]:
        """Upload a JSON dataset file."""
        with open(file_path, "rb") as f:
            return self._post(
                "datasets/upload",
                files={"dataset": (name, f, "application/json")},
                data={
                    "org_id": org_id,
                    "dataset_type": dataset_type,
                    "turn_type": turn_type,
                },
            )

    def delete(self, paths: List[str]) -> None:
        """Delete uploaded datasets by their file paths."""
        self._delete("datasets/user", json={"paths": paths})

    def list_uploads(self) -> List[Dict[str, Any]]:
        """List uploaded dataset files."""
        return self._get("datasets/uploads")
