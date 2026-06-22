"""
Shared pytest fixtures for the EvaluationModule test suite.

Keeps the EvaluationModule copy of the gateway client and ModelRunner under
test without booting heavy ML imports; tests should mock everything that
talks to a real model.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
EVALMODULE_SRC = REPO_ROOT / "EvaluationModule" / "src"

str_path = str(EVALMODULE_SRC.resolve())
if str_path not in sys.path:
    sys.path.insert(0, str_path)


@pytest.fixture(autouse=True)
def _isolate_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in (
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GOOGLE_API_KEY",
        "GEMINI_API_KEY",
        "XAI_API_KEY",
        "MISTRAL_API_KEY",
        "OPENROUTER_API_KEY",
        "HF_API_KEY",
        "AI_GATEWAY_INTERNAL_KEY",
        "AI_GATEWAY_URL",
    ):
        monkeypatch.delenv(key, raising=False)


@pytest.fixture
def gateway_env(monkeypatch: pytest.MonkeyPatch) -> str:
    key = "test-internal-key-not-real"
    monkeypatch.setenv("AI_GATEWAY_INTERNAL_KEY", key)
    monkeypatch.setenv("AI_GATEWAY_URL", "http://gateway.test:8100")
    return key


@pytest.fixture
def disable_gateway_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AI_GATEWAY_INTERNAL_KEY", raising=False)


@pytest.fixture
def mock_gateway_response_factory():
    def _build(content: str = "mocked text"):
        return {
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "model": "test-model",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": content},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 5, "completion_tokens": 1, "total_tokens": 6},
        }

    return _build
