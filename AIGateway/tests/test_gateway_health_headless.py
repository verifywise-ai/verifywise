"""
Headless integration test for the AI Gateway health endpoint.

This test imports the FastAPI app directly and uses TestClient, so it does not
require a running gateway, Express backend, or database. It only exercises the
health check, which reads LiteLLM metadata from the installed package (no live
LLM calls).
"""

import os
import sys
from pathlib import Path

# Make AIGateway/src importable from the tests directory
REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = REPO_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

# Provide minimal environment values so the app can import without a real DB.
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASSWORD", "test")
os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("DB_NAME", "verifywise_test")
os.environ.setdefault("AI_GATEWAY_INTERNAL_KEY", "test-internal-key-not-real")
os.environ.setdefault("ENCRYPTION_KEY", "default-key-change-this-in-production-32chars!!")

import litellm  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app import app  # noqa: E402


def test_gateway_health_headless():
    """Health endpoint returns ok and LiteLLM metadata without live services."""
    # Pin a deterministic value so the assertion does not depend on the exact
    # LiteLLM version installed in the test environment.
    monkeypatched_cost_db = {"gpt-4": {}, "gpt-3.5-turbo": {}}
    original_cost_db = getattr(litellm, "model_cost", None)
    litellm.model_cost = monkeypatched_cost_db  # type: ignore[attr-defined]

    try:
        client = TestClient(app)
        res = client.get("/health")
        assert res.status_code == 200, res.text

        data = res.json()
        assert data["status"] == "ok"
        assert "litellm_version" in data
        assert data["models_in_cost_db"] == len(monkeypatched_cost_db)
    finally:
        if original_cost_db is not None:
            litellm.model_cost = original_cost_db  # type: ignore[attr-defined]
        else:
            delattr(litellm, "model_cost")
