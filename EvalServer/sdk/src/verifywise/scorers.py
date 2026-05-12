"""Scorers API — manage custom scoring functions."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .client import _BaseAPI
from .models import Scorer


class ScorersAPI(_BaseAPI):

    def list(self, org_id: Optional[str] = None) -> List[Scorer]:
        """List saved scorers."""
        params: Dict[str, Any] = {}
        if org_id:
            params["org_id"] = org_id
        data = self._get("scorers", params=params)
        items = data if isinstance(data, list) else data.get("scorers", [])
        return [Scorer.from_dict(s) for s in items]

    def create(
        self,
        name: str,
        provider: str,
        model: str,
        prompt_template: str,
        *,
        config: Optional[Dict[str, Any]] = None,
    ) -> Scorer:
        """Create a custom scorer."""
        data = self._post("scorers", json={
            "name": name,
            "provider": provider,
            "model": model,
            "prompt_template": prompt_template,
            "config": config or {},
        })
        return Scorer.from_dict(data)

    def update(self, scorer_id: Any, **fields: Any) -> Scorer:
        """Update a scorer."""
        data = self._put(f"scorers/{scorer_id}", json=fields)
        return Scorer.from_dict(data)

    def delete(self, scorer_id: Any) -> None:
        """Delete a scorer."""
        self._delete(f"scorers/{scorer_id}")

    def get_latest(self) -> Optional[Scorer]:
        """Get the most recently used scorer."""
        data = self._get("scorers/latest")
        if not data:
            return None
        return Scorer.from_dict(data)

    def test(self, scorer_id: Any, input_text: str, output_text: str) -> Dict[str, Any]:
        """Test a scorer with sample input/output."""
        return self._post(f"scorers/{scorer_id}/test", json={
            "input": input_text,
            "output": output_text,
        })
