"""Core HTTP client for the VerifyWise SDK."""

from __future__ import annotations

from typing import Any, Dict, Optional

import requests

from .exceptions import (
    AuthenticationError,
    NotFoundError,
    ServerError,
    ValidationError,
    VerifyWiseError,
)


class _BaseAPI:
    """Base class for sub-API namespaces."""

    def __init__(self, client: "VerifyWiseClient"):
        self._client = client

    def _get(self, path: str, **kwargs: Any) -> Any:
        return self._client._request("GET", path, **kwargs)

    def _post(self, path: str, **kwargs: Any) -> Any:
        return self._client._request("POST", path, **kwargs)

    def _put(self, path: str, **kwargs: Any) -> Any:
        return self._client._request("PUT", path, **kwargs)

    def _patch(self, path: str, **kwargs: Any) -> Any:
        return self._client._request("PATCH", path, **kwargs)

    def _delete(self, path: str, **kwargs: Any) -> Any:
        return self._client._request("DELETE", path, **kwargs)

    def _raw(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        return self._client._raw_request(method, path, **kwargs)


class VerifyWiseClient:
    """Main entry point for the VerifyWise Python SDK.

    Usage::

        from verifywise import VerifyWiseClient

        client = VerifyWiseClient(
            api_url="https://your-instance.com",
            token="your-jwt-token",
        )
        experiments = client.experiments.list(project_id="proj_123")
    """

    def __init__(
        self,
        api_url: str,
        token: str,
        timeout: int = 30,
    ):
        self.api_url = api_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        })

        from .experiments import ExperimentsAPI
        from .datasets import DatasetsAPI
        from .model_configs import ModelsAPI
        from .scorers import ScorersAPI
        from .reports import ReportsAPI
        from .arena import ArenaAPI
        from .projects import ProjectsAPI
        from .orgs import OrgsAPI
        from .logs import LogsAPI
        from .bias_audits import BiasAuditsAPI
        from .metrics import MetricsAPI

        self.experiments = ExperimentsAPI(self)
        self.datasets = DatasetsAPI(self)
        self.models = ModelsAPI(self)
        self.scorers = ScorersAPI(self)
        self.reports = ReportsAPI(self)
        self.arena = ArenaAPI(self)
        self.projects = ProjectsAPI(self)
        self.orgs = OrgsAPI(self)
        self.logs = LogsAPI(self)
        self.bias_audits = BiasAuditsAPI(self)
        self.metrics = MetricsAPI(self)

    def _url(self, path: str) -> str:
        path = path.lstrip("/")
        return f"{self.api_url}/api/deepeval/{path}"

    def _handle_error(self, resp: requests.Response) -> None:
        if resp.ok:
            return
        body = ""
        try:
            body = resp.text[:500]
        except Exception:
            pass
        msg = f"HTTP {resp.status_code}: {body}"
        if resp.status_code in (401, 403, 406):
            raise AuthenticationError(msg, resp.status_code, body)
        if resp.status_code == 404:
            raise NotFoundError(msg, resp.status_code, body)
        if resp.status_code in (400, 422):
            raise ValidationError(msg, resp.status_code, body)
        if resp.status_code >= 500:
            raise ServerError(msg, resp.status_code, body)
        raise VerifyWiseError(msg, resp.status_code, body)

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Any] = None,
        data: Optional[Any] = None,
        files: Optional[Any] = None,
        timeout: Optional[int] = None,
    ) -> Any:
        headers = {}
        if files:
            headers["Content-Type"] = None  # let requests set multipart boundary

        resp = self._session.request(
            method,
            self._url(path),
            params=params,
            json=json,
            data=data,
            files=files,
            headers=headers,
            timeout=timeout or self.timeout,
        )
        self._handle_error(resp)
        if not resp.content:
            return None
        try:
            return resp.json()
        except ValueError:
            return resp.text

    def _raw_request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Any] = None,
        timeout: Optional[int] = None,
        **kwargs: Any,
    ) -> requests.Response:
        resp = self._session.request(
            method,
            self._url(path),
            params=params,
            json=json,
            timeout=timeout or self.timeout,
            **kwargs,
        )
        self._handle_error(resp)
        return resp
