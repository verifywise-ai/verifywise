"""Reports API — generate, list, download, and delete evaluation reports."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .client import _BaseAPI
from .models import Report


class ReportsAPI(_BaseAPI):

    def generate(
        self,
        experiment_ids: List[str],
        *,
        project_id: str = "",
        title: str = "",
        format: str = "pdf",
        sections: Optional[List[str]] = None,
        include_detailed_samples: bool = False,
        include_arena: bool = False,
        org_name: str = "",
    ) -> Report:
        """Generate a report and store it in the database.

        Returns metadata including the report ID for subsequent download.
        """
        data = self._post("reports/generate", json={
            "experimentIds": experiment_ids,
            "projectId": project_id,
            "title": title,
            "format": format,
            "sections": sections or [],
            "includeDetailedSamples": include_detailed_samples,
            "includeArena": include_arena,
            "orgName": org_name,
        }, timeout=180)
        return Report.from_dict(data)

    def list(self, project_id: Optional[str] = None) -> List[Report]:
        """List stored reports."""
        params: Dict[str, Any] = {}
        if project_id:
            params["project_id"] = project_id
        data = self._get("reports", params=params)
        items = data if isinstance(data, list) else data.get("reports", [])
        return [Report.from_dict(r) for r in items]

    def download(self, report_id: str) -> bytes:
        """Download a stored report's file content as bytes."""
        resp = self._raw("GET", f"reports/{report_id}/file", timeout=60)
        return resp.content

    def download_to_file(self, report_id: str, output_path: str) -> str:
        """Download a report and save it to disk."""
        content = self.download(report_id)
        with open(output_path, "wb") as f:
            f.write(content)
        return output_path

    def delete(self, report_id: str) -> None:
        """Delete a stored report."""
        self._delete(f"reports/{report_id}")

    def generate_and_download(
        self,
        experiment_ids: List[str],
        output_path: str,
        **kwargs: Any,
    ) -> Report:
        """Generate a report and download it to a file in one call."""
        report = self.generate(experiment_ids, **kwargs)
        self.download_to_file(report.id, output_path)
        return report
