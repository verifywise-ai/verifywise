"""Bias Audits API — run fairness and bias evaluations."""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from .client import _BaseAPI
from .exceptions import TimeoutError
from .models import BiasAudit


class BiasAuditsAPI(_BaseAPI):

    def presets(self) -> List[Dict[str, Any]]:
        """List available bias audit presets."""
        data = self._get("bias-audits/presets")
        return data if isinstance(data, list) else data.get("presets", [])

    def get_preset(self, preset_id: str) -> Dict[str, Any]:
        """Get a specific bias audit preset."""
        return self._get(f"bias-audits/presets/{preset_id}")

    def run(
        self,
        csv_file_path: str,
        config: Dict[str, Any],
        *,
        org_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> BiasAudit:
        """Run a bias audit from a CSV file."""
        with open(csv_file_path, "rb") as f:
            data = self._post(
                "bias-audits/run",
                files={"dataset": (csv_file_path, f, "text/csv")},
                data={
                    "config_json": __import__("json").dumps(config),
                    **({"org_id": org_id} if org_id else {}),
                    **({"project_id": project_id} if project_id else {}),
                },
            )
        return BiasAudit.from_dict(data)

    def list(self, org_id: Optional[str] = None, project_id: Optional[str] = None) -> List[BiasAudit]:
        """List bias audits."""
        params: Dict[str, Any] = {}
        if org_id:
            params["org_id"] = org_id
        if project_id:
            params["project_id"] = project_id
        data = self._get("bias-audits", params=params)
        items = data if isinstance(data, list) else data.get("audits", [])
        return [BiasAudit.from_dict(a) for a in items]

    def poll_status(self, audit_id: str) -> BiasAudit:
        """Check the status of a bias audit."""
        data = self._get(f"bias-audits/{audit_id}/status")
        return BiasAudit.from_dict(data)

    def get_results(self, audit_id: str) -> Dict[str, Any]:
        """Get bias audit results."""
        return self._get(f"bias-audits/{audit_id}/results")

    def delete(self, audit_id: str) -> None:
        """Delete a bias audit."""
        self._delete(f"bias-audits/{audit_id}")

    def parse_headers(self, csv_file_path: str) -> List[str]:
        """Parse CSV headers for column mapping."""
        with open(csv_file_path, "rb") as f:
            data = self._post(
                "bias-audits/parse-headers",
                files={"dataset": (csv_file_path, f, "text/csv")},
            )
        return data if isinstance(data, list) else data.get("headers", [])

    def run_and_wait(
        self,
        csv_file_path: str,
        config: Dict[str, Any],
        *,
        timeout_minutes: int = 30,
        poll_interval: int = 10,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Run a bias audit, poll until done, and return results."""
        audit = self.run(csv_file_path, config, **kwargs)
        deadline = time.time() + timeout_minutes * 60

        while time.time() < deadline:
            current = self.poll_status(audit.id)
            if current.status in ("completed", "failed"):
                if current.status == "completed":
                    return self.get_results(audit.id)
                raise RuntimeError(f"Bias audit failed: {audit.id}")
            time.sleep(poll_interval)

        raise TimeoutError(f"Bias audit {audit.id} did not complete within {timeout_minutes} minutes")
