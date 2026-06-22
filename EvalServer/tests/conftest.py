"""
Shared pytest fixtures for the EvalServer test suite.

These fixtures are designed to keep tests fast, deterministic and zero-cost:
- No real LLM calls, no real DB, no real subprocess execution
- Importable EvalServer modules without booting FastAPI / loading uvloop
- Config factories cover every dataset source type and every evaluation mode
  the runner accepts in production
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
EVALSERVER_SRC = REPO_ROOT / "EvalServer" / "src"
EVALMODULE_SRC = REPO_ROOT / "EvaluationModule" / "src"

for path in (EVALSERVER_SRC, EVALMODULE_SRC):
    str_path = str(path.resolve())
    if str_path not in sys.path:
        sys.path.insert(0, str_path)

os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASSWORD", "test")
os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("DB_NAME", "verifywise_test")


@pytest.fixture(autouse=True)
def _isolate_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Strip any provider keys from the parent environment so tests are deterministic."""
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
        "G_EVAL_PROVIDER",
        "G_EVAL_MODEL",
        "G_EVAL_MAX_TOKENS",
        "OPENAI_API_BASE",
        "OLLAMA_HOST",
    ):
        monkeypatch.delenv(key, raising=False)


@pytest.fixture
def gateway_env(monkeypatch: pytest.MonkeyPatch) -> str:
    """Enable AI Gateway mode with a sentinel key (sufficient for gateway_mode_enabled())."""
    key = "test-internal-key-not-real"
    monkeypatch.setenv("AI_GATEWAY_INTERNAL_KEY", key)
    monkeypatch.setenv("AI_GATEWAY_URL", "http://gateway.test:8100")
    return key


@pytest.fixture
def disable_gateway_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force gateway_mode_enabled() == False even if the parent env had a key."""
    monkeypatch.delenv("AI_GATEWAY_INTERNAL_KEY", raising=False)


@pytest.fixture
def mock_db_session() -> AsyncMock:
    """A mock async SQLAlchemy session that supports the methods run_evaluation calls."""
    session = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.close = AsyncMock()
    session.execute = AsyncMock()
    return session


@pytest.fixture
def mock_gateway_response_factory():
    """
    Build a JSON payload shaped like the AI Gateway's chat-completion response.
    Useful with respx / pytest-httpx mocks.
    """

    def _build(content: str = "mocked text") -> Dict[str, Any]:
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


# --------------------------------------------------------------------------- #
# Config factories                                                            #
#                                                                             #
# These mirror the shape that the Node proxy injects into config.* before the #
# request hits EvalServer.run_evaluation (see Servers/routes/deepEvalRoutes). #
# --------------------------------------------------------------------------- #


def _base_config(**overrides: Any) -> Dict[str, Any]:
    cfg: Dict[str, Any] = {
        "project_id": "proj-test-001",
        "model": {
            "name": "tinyllama:1.1b",
            "provider": "ollama",
            "apiKey": None,
        },
        "judgeLlm": {},
        "dataset": {},
        "metrics": {},
        "thresholds": {},
        "evaluationMode": "standard",
        "taskType": "chatbot",
    }
    cfg.update(overrides)
    return cfg


@pytest.fixture
def inline_prompts_config() -> Dict[str, Any]:
    """Single-turn dataset supplied inline via dataset.prompts."""
    cfg = _base_config()
    cfg["dataset"] = {
        "prompts": [
            {"id": "t1", "prompt": "What is 2+2?", "expected_output": "4", "category": "math"},
            {"id": "t2", "prompt": "Capital of France?", "expected_output": "Paris", "category": "knowledge"},
        ]
    }
    return cfg


@pytest.fixture
def multiturn_config() -> Dict[str, Any]:
    """Multi-turn dataset supplied inline (prompts[0] has 'turns')."""
    cfg = _base_config(taskType="chatbot")
    cfg["dataset"] = {
        "prompts": [
            {
                "scenario": "casual chat",
                "expected_outcome": "polite reply",
                "turns": [
                    {"role": "user", "content": "Hi there"},
                    {"role": "assistant", "content": "Hello!"},
                    {"role": "user", "content": "How are you?"},
                ],
            }
        ]
    }
    return cfg


@pytest.fixture
def builtin_chatbot_config() -> Dict[str, Any]:
    cfg = _base_config(taskType="chatbot")
    cfg["dataset"] = {"useBuiltin": "chatbot"}
    return cfg


@pytest.fixture
def builtin_rag_config() -> Dict[str, Any]:
    cfg = _base_config(taskType="rag")
    cfg["dataset"] = {"useBuiltin": "rag"}
    return cfg


@pytest.fixture
def builtin_agent_config() -> Dict[str, Any]:
    cfg = _base_config(taskType="agent")
    cfg["dataset"] = {"useBuiltin": "agent"}
    return cfg


@pytest.fixture
def custom_path_config(tmp_path: Path) -> Dict[str, Any]:
    """Custom dataset on disk via dataset.path (absolute, single-turn)."""
    file_path = tmp_path / "custom_dataset.json"
    payload = [
        {"id": "c1", "prompt": "P1", "expected_output": "E1"},
        {"id": "c2", "prompt": "P2", "expected_output": "E2"},
        {"id": "c3", "prompt": "P3", "expected_output": "E3"},
    ]
    file_path.write_text(json.dumps(payload), encoding="utf-8")
    cfg = _base_config()
    cfg["dataset"] = {"path": str(file_path)}
    return cfg


@pytest.fixture
def simulated_config() -> Dict[str, Any]:
    """
    Simulated-mode config.

    Note: production runner short-circuits with "No prompts or conversations
    in dataset" before evaluating ``simulatedMode`` if neither ``prompts`` nor
    ``conversations`` is set, so we include a placeholder prompt that the
    simulated branch then ignores. This matches what the frontend sends.
    """
    cfg = _base_config(taskType="chatbot")
    cfg["dataset"] = {
        "prompts": [{"id": "placeholder", "prompt": "ignored", "expected_output": ""}],
        "simulatedMode": True,
        "scenarios": [
            {
                "scenario": "User wants help booking a flight",
                "expected_outcome": "Helpful response with options",
                "user_description": "A traveller in a hurry",
            }
        ],
        "maxTurns": 4,
    }
    return cfg


@pytest.fixture
def standard_mode_config(inline_prompts_config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = dict(inline_prompts_config)
    cfg["evaluationMode"] = "standard"
    cfg["judgeLlm"] = {"provider": "openai", "model": "gpt-4o-mini", "apiKey": "sk-fake"}
    return cfg


@pytest.fixture
def scorer_mode_config(inline_prompts_config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = dict(inline_prompts_config)
    cfg["evaluationMode"] = "scorer"
    cfg["scorerApiKeys"] = {"openai": "sk-fake"}
    return cfg


@pytest.fixture
def both_mode_config(inline_prompts_config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = dict(inline_prompts_config)
    cfg["evaluationMode"] = "both"
    cfg["judgeLlm"] = {"provider": "openai", "model": "gpt-4o-mini", "apiKey": "sk-fake"}
    cfg["scorerApiKeys"] = {"openai": "sk-fake"}
    return cfg


@pytest.fixture
def fake_llm_scorer_row() -> Dict[str, Any]:
    """A scorer row matching the shape returned by crud.deepeval_scorers.list_scorers."""
    return {
        "id": "scorer-llm-1",
        "name": "Helpfulness Judge",
        "description": "Judges helpfulness on PASS/FAIL",
        "type": "llm",
        "metricKey": "helpfulness",
        "config": {
            "judgeModel": {"name": "gpt-4o-mini", "provider": "openai"},
            "messages": [
                {"role": "system", "content": "You are a strict judge."},
                {"role": "user", "content": "Is '{{output}}' helpful for '{{input}}'? Answer PASS or FAIL."},
            ],
            "choiceScores": [
                {"label": "PASS", "score": 1.0},
                {"label": "FAIL", "score": 0.0},
            ],
        },
        "enabled": True,
        "defaultThreshold": 0.5,
        "weight": 1.0,
    }


@pytest.fixture
def fake_llm_scorer_rows(fake_llm_scorer_row: Dict[str, Any]) -> List[Dict[str, Any]]:
    """List of three scorer rows: 2 enabled LLM, 1 disabled."""
    second = dict(fake_llm_scorer_row)
    second["id"] = "scorer-llm-2"
    second["name"] = "Correctness Judge"
    second["metricKey"] = "correctness"

    third = dict(fake_llm_scorer_row)
    third["id"] = "scorer-llm-3"
    third["name"] = "Disabled Judge"
    third["enabled"] = False
    third["metricKey"] = "disabled_judge"

    return [fake_llm_scorer_row, second, third]


@pytest.fixture
def stub_model_runner(monkeypatch: pytest.MonkeyPatch):
    """
    Patch ModelRunner.__init__ to a no-op and ModelRunner.generate to a stub.
    Returns the MagicMock used for `generate` so tests can introspect calls.
    """
    from deepeval_engine import model_runner as mr_module

    generate_mock = MagicMock(return_value="stub response")

    def _no_init(self, *args, **kwargs):
        self.model_name = kwargs.get("model_name") or (args[0] if args else "stub-model")
        self.provider = kwargs.get("provider", "openai")
        self.device = "cpu"
        self.model = None
        self.tokenizer = None
        self._gateway_mode = False
        self._gateway_api_key = None

    monkeypatch.setattr(mr_module.ModelRunner, "__init__", _no_init)
    monkeypatch.setattr(mr_module.ModelRunner, "generate", generate_mock)
    return generate_mock
