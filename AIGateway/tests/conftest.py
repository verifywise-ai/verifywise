"""
Shared fixtures for AI Gateway E2E tests.

Uses synchronous httpx to avoid async event loop issues across tests.
"""

import os
import httpx
import pytest

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3000")
GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8100")
VW_EMAIL = os.getenv("VW_EMAIL", "gorkem.cetin@verifywise.ai")
VW_PASSWORD = os.getenv("VW_PASSWORD", "")

# Shared state across tests
_state = {}


def get_state(key, default=None):
    return _state.get(key, default)


def set_state(key, value):
    _state[key] = value


# Singleton HTTP client + cached token
_client = httpx.Client(timeout=30.0)
_token = None


def _get_token():
    global _token
    if _token is not None:
        return _token
    if not VW_PASSWORD:
        return None
    res = _client.post(
        f"{BACKEND_URL}/api/users/login",
        json={"email": VW_EMAIL, "password": VW_PASSWORD},
    )
    assert res.status_code in (200, 202), f"Login failed: {res.status_code} {res.text}"
    _token = res.json()["data"]["token"]
    return _token


class API:
    """Authenticated requests to the Express backend."""

    def __init__(self):
        token = _get_token()
        assert token, "VW_PASSWORD not set"
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    def get(self, path, **kw):
        return _client.get(f"{BACKEND_URL}/api/ai-gateway{path}", headers=self._headers, **kw)

    def post(self, path, **kw):
        return _client.post(f"{BACKEND_URL}/api/ai-gateway{path}", headers=self._headers, **kw)

    def put(self, path, **kw):
        return _client.put(f"{BACKEND_URL}/api/ai-gateway{path}", headers=self._headers, **kw)

    def patch(self, path, **kw):
        return _client.patch(f"{BACKEND_URL}/api/ai-gateway{path}", headers=self._headers, **kw)

    def delete(self, path, **kw):
        return _client.delete(f"{BACKEND_URL}/api/ai-gateway{path}", headers=self._headers, **kw)


class Gateway:
    """Direct requests to the AI Gateway (virtual key auth)."""

    def post(self, path, virtual_key=None, **kw):
        headers = {"Content-Type": "application/json"}
        if virtual_key:
            headers["Authorization"] = f"Bearer {virtual_key}"
        return _client.post(f"{GATEWAY_URL}{path}", headers=headers, **kw)

    def get(self, path, virtual_key=None, **kw):
        headers = {}
        if virtual_key:
            headers["Authorization"] = f"Bearer {virtual_key}"
        return _client.get(f"{GATEWAY_URL}{path}", headers=headers, **kw)


@pytest.fixture
def api():
    return API()


@pytest.fixture
def gateway():
    return Gateway()


@pytest.fixture
def http():
    return _client
