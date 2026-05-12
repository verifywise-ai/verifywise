"""Models API — manage saved model configurations."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .client import _BaseAPI
from .models import ModelConfig


class ModelsAPI(_BaseAPI):

    def list(self, org_id: Optional[str] = None) -> List[ModelConfig]:
        """List saved model configurations."""
        params: Dict[str, Any] = {}
        if org_id:
            params["org_id"] = org_id
        data = self._get("models", params=params)
        items = data if isinstance(data, list) else data.get("models", [])
        return [ModelConfig.from_dict(m) for m in items]

    def create(
        self,
        name: str,
        provider: str,
        model_name: str,
        *,
        endpoint_url: str = "",
        config: Optional[Dict[str, Any]] = None,
    ) -> ModelConfig:
        """Create a saved model configuration."""
        data = self._post("models", json={
            "name": name,
            "provider": provider,
            "model_name": model_name,
            "endpoint_url": endpoint_url,
            "config": config or {},
        })
        return ModelConfig.from_dict(data)

    def update(self, model_id: Any, **fields: Any) -> ModelConfig:
        """Update a model configuration."""
        data = self._put(f"models/{model_id}", json=fields)
        return ModelConfig.from_dict(data)

    def delete(self, model_id: Any) -> None:
        """Delete a model configuration."""
        self._delete(f"models/{model_id}")

    def get_latest(self) -> Optional[ModelConfig]:
        """Get the most recently used model configuration."""
        data = self._get("models/latest")
        if not data:
            return None
        return ModelConfig.from_dict(data)

    def validate(self, provider: str, api_key: str, model_name: str = "") -> Dict[str, Any]:
        """Validate an API key for a provider."""
        return self._post("models/validate", json={
            "provider": provider,
            "api_key": api_key,
            "model_name": model_name,
        })
