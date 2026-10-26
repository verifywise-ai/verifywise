"""
Tests for ModelRunner (EvaluationModule).

ModelRunner instantiation imports `transformers` at module load, but the
*setup* methods for cloud providers can be patched out so we never touch a
real client. We construct partial mock instances using ``__new__`` and then
manually populate fields, sidestepping the heavy provider SDK imports.
"""

from __future__ import annotations

from typing import Optional
from unittest.mock import MagicMock, patch

import pytest

from deepeval_engine.gateway_litellm_client import GatewayCompletion


def _make_runner(provider: str, model_name: str = "test-model", gateway_mode: bool = False):
    """Build a ModelRunner instance without running __init__."""
    from deepeval_engine.model_runner import ModelRunner

    runner = ModelRunner.__new__(ModelRunner)
    runner.model_name = model_name
    runner.provider = provider.lower()
    runner.device = "cpu"
    runner.model = None
    runner.tokenizer = None
    runner._gateway_mode = gateway_mode
    runner._gateway_api_key = "sk-fake" if gateway_mode else None
    runner.last_completion = None
    runner.dropped_params = set()
    runner.custom_client = MagicMock()
    runner.ollama_client = MagicMock()
    runner.openrouter_client = MagicMock()
    return runner


# --------------------------------------------------------------------------- #
# Provider dispatch table — gateway OFF                                       #
# --------------------------------------------------------------------------- #


def test_generate_unknown_provider_raises() -> None:
    runner = _make_runner("not-a-real-provider")
    runner._gateway_mode = False
    with pytest.raises(ValueError, match="Unsupported provider"):
        runner.generate("hi")


# --------------------------------------------------------------------------- #
# Gateway-mode routing — ALL cloud providers redirect to _generate_gateway     #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "provider,model_name,expected_litellm",
    [
        ("openai", "gpt-4o", "gpt-4o"),
        ("anthropic", "claude-3", "anthropic/claude-3"),
        ("google", "gemini-1.5-pro", "gemini/gemini-1.5-pro"),
        ("xai", "grok-beta", "xai/grok-beta"),
        ("mistral", "mistral-large", "mistral/mistral-large"),
        ("openrouter", "meta-llama/llama-3.1-70b-instruct", "openrouter/meta-llama/llama-3.1-70b-instruct"),
        ("openrouter", "gpt-4o", "openrouter/gpt-4o"),
    ],
)
def test_generate_gateway_mode_uses_litellm_prefix(
    provider: str, model_name: str, expected_litellm: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    runner = _make_runner(provider, model_name=model_name, gateway_mode=True)

    captured = {}

    def fake_completion(litellm_model, messages, api_key, **kwargs):
        captured["litellm_model"] = litellm_model
        captured["api_key"] = api_key
        captured["messages"] = messages
        return GatewayCompletion(text="gateway response", total_tokens=11, cost_usd=0.0003)

    monkeypatch.setattr(
        "deepeval_engine.gateway_litellm_client.gateway_completion_sync",
        fake_completion,
    )

    result = runner.generate("hi", max_tokens=5, temperature=0.1)
    assert result == "gateway response"
    # The gateway's usage and cost stay on the runner for the caller to record
    assert runner.last_completion.total_tokens == 11
    assert runner.last_completion.cost_usd == 0.0003
    assert captured["litellm_model"] == expected_litellm
    assert captured["api_key"] == "sk-fake"
    assert captured["messages"] == [{"role": "user", "content": "hi"}]


def test_generate_gateway_mode_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    runner = _make_runner("openai", gateway_mode=True)
    runner._gateway_api_key = ""
    with pytest.raises(RuntimeError, match="Gateway mode without API key"):
        runner.generate("hi")


# --------------------------------------------------------------------------- #
# Local providers (Ollama, HuggingFace)                                       #
# --------------------------------------------------------------------------- #


def test_generate_ollama_returns_response() -> None:
    runner = _make_runner("ollama")
    runner.ollama_client.generate.return_value = {"response": "  ollama out  "}
    out = runner._generate_ollama("p", max_tokens=5, temperature=0.0, top_p=None)
    assert out == "ollama out"


def test_generate_batch_returns_list_of_same_length(monkeypatch: pytest.MonkeyPatch) -> None:
    runner = _make_runner("openai")
    monkeypatch.setattr(runner, "generate", lambda p, *a, **kw: f"resp:{p}")
    out = runner.generate_batch(["p1", "p2", "p3"])
    assert out == ["resp:p1", "resp:p2", "resp:p3"]


def test_generate_batch_empty_input() -> None:
    runner = _make_runner("openai")
    assert runner.generate_batch([]) == []


# --------------------------------------------------------------------------- #
# _env_api_key_for_provider — provider→env var mapping                        #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "provider,env_var,key",
    [
        ("openai", "OPENAI_API_KEY", "sk-x"),
        ("anthropic", "ANTHROPIC_API_KEY", "sk-ant-x"),
        ("google", "GOOGLE_API_KEY", "AIza-x"),
        ("gemini", "GOOGLE_API_KEY", "AIza-x"),
        ("xai", "XAI_API_KEY", "xai-x"),
        ("mistral", "MISTRAL_API_KEY", "mist-x"),
        ("openrouter", "OPENROUTER_API_KEY", "sk-or-v1-x"),
        ("huggingface", "HF_API_KEY", "hf-x"),
    ],
)
def test_env_api_key_for_provider(
    monkeypatch: pytest.MonkeyPatch, provider: str, env_var: str, key: str
) -> None:
    from deepeval_engine.model_runner import ModelRunner

    monkeypatch.setenv(env_var, key)
    assert ModelRunner._env_api_key_for_provider_static(provider) == key


def test_env_api_key_for_unknown_provider_returns_none() -> None:
    from deepeval_engine.model_runner import ModelRunner

    assert ModelRunner._env_api_key_for_provider_static("not-real") is None


def test_gateway_quota_error_is_not_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    from deepeval_engine.gateway_litellm_client import GatewayProviderError

    runner = _make_runner("openai", model_name="gpt-4o", gateway_mode=True)
    calls = {"count": 0}

    def quota(*_args, **_kwargs):
        calls["count"] += 1
        raise GatewayProviderError("RateLimitError", 429, "insufficient_quota")

    monkeypatch.setattr("deepeval_engine.gateway_litellm_client.gateway_completion_sync", quota)
    monkeypatch.setattr("deepeval_engine.model_runner.time.sleep", lambda _s: pytest.fail("slept"))

    with pytest.raises(GatewayProviderError):
        runner.generate("hi")
    assert calls["count"] == 1


def test_gateway_passing_rate_limit_is_retried_with_backoff(monkeypatch: pytest.MonkeyPatch) -> None:
    from deepeval_engine.gateway_litellm_client import GatewayCompletion, GatewayProviderError

    runner = _make_runner("openai", model_name="gpt-4o", gateway_mode=True)
    calls = {"count": 0}
    slept = []

    def flaky(*_args, **_kwargs):
        calls["count"] += 1
        if calls["count"] < 3:
            raise GatewayProviderError("RateLimitError", 429, "Rate limit reached for requests per min")
        return GatewayCompletion(text="ok")

    monkeypatch.setattr("deepeval_engine.gateway_litellm_client.gateway_completion_sync", flaky)
    monkeypatch.setattr("deepeval_engine.model_runner.time.sleep", slept.append)

    assert runner.generate("hi") == "ok"
    assert calls["count"] == 3
    assert slept == [2, 4]


@pytest.mark.parametrize(
    "message, attempt, delay",
    [
        ("Rate limit reached for requests per min", 1, 4),
        ("Quota exceeded ... per minute. Please retry in 30s", 0, 30),
        ("Quota exceeded ... per minute. Please retry in 1.5s", 2, 8),
        ("Quota exceeded ... per minute. Please retry in 300s", 0, 60),
    ],
)
def test_rate_limit_delay_uses_hint_capped_at_a_minute(message: str, attempt: int, delay: float) -> None:
    from deepeval_engine.gateway_litellm_client import GatewayProviderError
    from deepeval_engine.model_runner import _rate_limit_delay

    assert _rate_limit_delay(GatewayProviderError("RateLimitError", 429, message), attempt) == delay


@pytest.mark.parametrize(
    "message, passing",
    [
        ("Quota exceeded for metric generate_content_free_tier_requests per minute. Please retry in 30s", True),
        ("Rate limit reached for requests per min", True),
        ('Resource exhausted. "retryDelay": "12s"', True),
        ("Too many requests", True),
        ("Quota exceeded for metric generate_content_free_tier_requests per day. Please retry in 30s", False),
        ("Quota exceeded for metric generate_content_free_tier_requests", False),
        ('quotaId: "GenerateRequestsPerMinutePerProjectPerModel"', True),
        ("Quota exceeded for metric x, limit: 0, model: gemini-2.5-pro. Please retry in 30s", False),
        ("Rate limit reached on requests per day (RPD): Limit 200. Please try again in 8s", False),
        ("Insufficient credits. Please retry in 10s", False),
        (
            "You exceeded your current quota, please check your plan and billing details. "
            "Quota exceeded for metric x, limit: 10. Please retry in 43.6s",
            True,
        ),
        ("You exceeded your current quota, please check your plan and billing details. insufficient_quota", False),
        ("Your credit balance is too low", False),
    ],
)
def test_passing_rate_limit_rule(message: str, passing: bool) -> None:
    from deepeval_engine.gateway_litellm_client import GatewayProviderError
    from deepeval_engine.model_runner import _is_passing_rate_limit

    assert _is_passing_rate_limit(GatewayProviderError("RateLimitError", 429, message)) is passing


def test_gateway_retries_stop_at_the_wait_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    from deepeval_engine.gateway_litellm_client import GatewayProviderError

    runner = _make_runner("google", model_name="gemini-3.8-flash", gateway_mode=True)
    slept = []

    def limited(*_args, **_kwargs):
        raise GatewayProviderError("RateLimitError", 429, "Quota exceeded ... per minute. Please retry in 40s")

    monkeypatch.setattr("deepeval_engine.gateway_litellm_client.gateway_completion_sync", limited)
    monkeypatch.setattr("deepeval_engine.model_runner.time.sleep", slept.append)

    with pytest.raises(GatewayProviderError):
        runner.generate("hi")
    # 40 + 40 fits the 90 s budget; a third 40 s wait would not
    assert slept == [40, 40]


def test_gateway_forwards_top_p_and_collects_dropped_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    from deepeval_engine.gateway_litellm_client import GatewayCompletion

    runner = _make_runner("openai", model_name="o3-mini", gateway_mode=True)
    seen = {}

    def fake(_model, _messages, _key, **kwargs):
        seen.update(kwargs)
        return GatewayCompletion(text="ok", dropped_params=["temperature", "top_p"])

    monkeypatch.setattr("deepeval_engine.gateway_litellm_client.gateway_completion_sync", fake)

    assert runner.generate("hi", temperature=0.7, top_p=0.5) == "ok"
    assert seen["top_p"] == 0.5
    assert runner.dropped_params == {"temperature", "top_p"}


@pytest.mark.parametrize("provider", ["openai", "anthropic", "google", "xai", "mistral", "openrouter"])
def test_cloud_provider_without_the_gateway_raises(monkeypatch: pytest.MonkeyPatch, provider: str) -> None:
    from deepeval_engine.model_runner import ModelRunner

    monkeypatch.delenv("AI_GATEWAY_INTERNAL_KEY", raising=False)
    with pytest.raises(RuntimeError, match="AI_GATEWAY_INTERNAL_KEY"):
        ModelRunner(model_name="m", provider=provider, device="cpu")


def test_custom_api_uses_its_own_endpoint_not_the_gateway(monkeypatch: pytest.MonkeyPatch) -> None:
    from deepeval_engine.model_runner import ModelRunner

    monkeypatch.setenv("AI_GATEWAY_INTERNAL_KEY", "internal-test-key")
    built = {}

    def fake_client(base_url, api_key):
        built.update(api_key=api_key, base_url=base_url)
        client = MagicMock()
        client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=" out "))]
        )
        return client

    monkeypatch.setattr("deepeval_engine.endpoint_client.openai_compatible_client", fake_client)
    runner = ModelRunner(
        model_name="my-model", provider="custom_api", device="cpu",
        endpoint_url="http://vllm.local:8000/v1/", api_key="k-1",
    )
    assert runner._gateway_mode is False
    assert built == {"api_key": "k-1", "base_url": "http://vllm.local:8000/v1"}
    assert runner.generate("hi", top_p=0.5) == "out"
    assert runner.custom_client.chat.completions.create.call_args.kwargs["top_p"] == 0.5


def test_custom_api_needs_an_endpoint() -> None:
    from deepeval_engine.model_runner import ModelRunner

    with pytest.raises(ValueError, match="endpoint URL"):
        ModelRunner(model_name="m", provider="custom_api", device="cpu")


def test_self_hosted_judge_runs_against_its_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    from deepeval_engine import deepeval_evaluator

    built = {}
    monkeypatch.setattr(deepeval_evaluator, "ModelRunner", lambda **kw: built.update(kw) or "runner")
    monkeypatch.setenv("G_EVAL_BASE_URL", "http://host:8080/v1")
    monkeypatch.delenv("G_EVAL_API_KEY", raising=False)

    assert deepeval_evaluator.judge_runner("tinyllama", "openai") == "runner"
    assert built == {"model_name": "tinyllama", "provider": "custom_api", "endpoint_url": "http://host:8080/v1", "api_key": None}

    monkeypatch.delenv("G_EVAL_BASE_URL")
    built.clear()
    deepeval_evaluator.judge_runner("gpt-4o-mini", "openai")
    assert built == {"model_name": "gpt-4o-mini", "provider": "openai"}


@pytest.mark.parametrize(
    "url",
    ["http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "http://user:pw@host/v1", "http://0.0.0.0:8000"],
)
def test_custom_api_refuses_unsafe_endpoints(url: str) -> None:
    from deepeval_engine.model_runner import ModelRunner
    from deepeval_engine.safe_outbound_url import UnsafeOutboundUrlError

    with pytest.raises(UnsafeOutboundUrlError):
        ModelRunner(model_name="m", provider="custom_api", device="cpu", endpoint_url=url)


def test_outbound_policy_matches_the_gateway_copy() -> None:
    """EvaluationModule keeps its own copy (separate deploy); its code must not drift.
    Only the module docstring may differ (it describes where each copy is used)."""
    import ast
    from pathlib import Path

    def code(path: Path) -> str:
        tree = ast.parse(path.read_text())
        if ast.get_docstring(tree) is not None:
            tree.body = tree.body[1:]
        return ast.dump(tree)

    here = Path(__file__).resolve().parents[1] / "src" / "deepeval_engine" / "safe_outbound_url.py"
    gateway = Path(__file__).resolve().parents[2] / "AIGateway" / "src" / "utils" / "safe_outbound_url.py"
    if not gateway.is_file():
        pytest.skip("AIGateway source not present")
    assert code(here) == code(gateway)


def test_endpoint_clients_do_not_follow_redirects() -> None:
    from deepeval_engine.endpoint_client import ollama_client, openai_compatible_client

    assert openai_compatible_client("http://host:8000/v1")._client.follow_redirects is False
    assert ollama_client()._client.follow_redirects is False


@pytest.mark.parametrize(
    "entered, base",
    [("http://host:8000", "http://host:8000/v1"), ("http://host:8000/", "http://host:8000/v1"),
     ("http://host:8000/openai/v1", "http://host:8000/openai/v1")],
)
def test_custom_api_bare_host_gets_v1(monkeypatch: pytest.MonkeyPatch, entered: str, base: str) -> None:
    from deepeval_engine import endpoint_client
    from deepeval_engine.model_runner import ModelRunner

    seen = {}
    monkeypatch.setattr(endpoint_client, "openai_compatible_client", lambda url, key: seen.update(url=url) or MagicMock())
    ModelRunner(model_name="m", provider="custom_api", device="cpu", endpoint_url=entered)
    assert seen["url"] == base


def test_local_model_is_refused_not_loaded_or_sent_to_the_gateway(monkeypatch: pytest.MonkeyPatch) -> None:
    from deepeval_engine.model_runner import ModelRunner

    monkeypatch.setenv("AI_GATEWAY_INTERNAL_KEY", "internal-test-key")
    loaded = []
    monkeypatch.setattr(ModelRunner, "_load_huggingface_model", lambda self: loaded.append(self.model_name))
    with pytest.raises(ValueError, match="custom API model"):
        ModelRunner(model_name="TinyLlama/TinyLlama-1.1B-Chat-v1.0", provider="local", device="cpu")
    assert loaded == []


@pytest.mark.parametrize(
    "entered, base",
    [
        ("localhost:11434", "http://localhost:11434/v1"),
        ("192.168.1.5:8000/", "http://192.168.1.5:8000/v1"),
        ("http://proxy:4000?api-version=2024-02", "http://proxy:4000/v1?api-version=2024-02"),
        ("http://host:8000/openai", "http://host:8000/openai/v1"),
        ("https://host/v1", "https://host/v1"),
    ],
)
def test_openai_base_url_normalises_entered_endpoints(entered: str, base: str) -> None:
    from deepeval_engine.endpoint_client import openai_base_url

    assert openai_base_url(entered) == base


def test_ollama_client_uses_this_runs_checked_host_not_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    from deepeval_engine.endpoint_client import ollama_client
    from deepeval_engine.safe_outbound_url import UnsafeOutboundUrlError

    monkeypatch.setenv("OLLAMA_HOST", "http://other-orgs-host:11434")
    assert "10.0.0.5" in str(ollama_client("10.0.0.5:11434")._client.base_url)
    with pytest.raises(UnsafeOutboundUrlError):
        ollama_client("http://169.254.169.254")


@pytest.mark.parametrize(
    "entered, base",
    [
        ("https://generativelanguage.googleapis.com/v1beta/openai", "https://generativelanguage.googleapis.com/v1beta/openai"),
        ("http://host:8000", "http://host:8000/v1"),
        ("proxy:4000?target=http://x", "http://proxy:4000/v1?target=http://x"),
    ],
)
def test_custom_api_keeps_an_entered_path(entered: str, base: str) -> None:
    from deepeval_engine.endpoint_client import openai_base_url

    assert openai_base_url(entered, keep_entered_path=True) == base
