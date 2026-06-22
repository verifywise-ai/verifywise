"""
Tests for run_custom_scorer.py — the LLM-judge scorer execution helper.

Covered:
  - Object ``judgeModel`` config (the recommended format)
  - Legacy string ``judgeModel`` config (backwards compatibility)
  - Template rendering for {{input}}, {{output}}, {{expected}}, metadata
  - PASS/FAIL label extraction (incl. **PASS**, leading <think>, JSON verdict)
  - Threshold boundary semantics
  - Provider dispatch for openai / anthropic / mistral / google / xai / huggingface / self-hosted
  - Error paths: missing key, missing endpointUrl for self-hosted, missing model
"""

from __future__ import annotations

from typing import Any, Dict, List
from unittest.mock import MagicMock, patch

import pytest

from utils.run_custom_scorer import (
    PROVIDER_CONFIG,
    ScorerResult,
    extract_label,
    get_provider_client,
    get_provider_from_config,
    label_to_score,
    render_messages,
    render_template,
    run_custom_scorer,
)


def _scorer_row(
    *,
    judge_model: Any = None,
    messages: Any = None,
    choice_scores: Any = None,
    threshold: float = 0.5,
    name: str = "Test Scorer",
) -> Dict[str, Any]:
    """Build a scorer row matching the shape returned by list_scorers."""
    return {
        "id": "scorer-id-1",
        "name": name,
        "metricKey": "test_metric",
        "type": "llm",
        "enabled": True,
        "defaultThreshold": threshold,
        "config": {
            "judgeModel": judge_model
            if judge_model is not None
            else {"name": "gpt-4o-mini", "provider": "openai"},
            "messages": messages
            if messages is not None
            else [
                {"role": "user", "content": "Is '{{output}}' helpful for '{{input}}'? PASS or FAIL."}
            ],
            "choiceScores": choice_scores
            if choice_scores is not None
            else [
                {"label": "PASS", "score": 1.0},
                {"label": "FAIL", "score": 0.0},
            ],
        },
    }


# --------------------------------------------------------------------------- #
# get_provider_from_config — both shapes                                      #
# --------------------------------------------------------------------------- #


def test_get_provider_from_config_object_shape() -> None:
    cfg = {"name": "gpt-4o", "provider": "openai", "endpointUrl": None, "apiKey": "sk-x"}
    provider, endpoint, key = get_provider_from_config(cfg)
    assert provider == "openai"
    assert endpoint is None
    assert key == "sk-x"


def test_get_provider_from_config_legacy_string_shape() -> None:
    """Legacy string format defaults to openai with no endpoint/key."""
    provider, endpoint, key = get_provider_from_config("gpt-4o")
    assert provider == "openai"
    assert endpoint is None
    assert key is None


def test_get_provider_from_config_missing_provider_defaults_to_openai() -> None:
    cfg = {"name": "gpt-4o"}
    provider, _, _ = get_provider_from_config(cfg)
    assert provider == "openai"


def test_get_provider_from_config_self_hosted_keeps_endpoint() -> None:
    cfg = {
        "name": "tinyllama",
        "provider": "self-hosted",
        "endpointUrl": "http://host:11434",
        "apiKey": None,
    }
    provider, endpoint, _ = get_provider_from_config(cfg)
    assert provider == "self-hosted"
    assert endpoint == "http://host:11434"


# --------------------------------------------------------------------------- #
# render_template / render_messages                                            #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "template,values,expected",
    [
        ("Hello {{name}}", {"name": "world"}, "Hello world"),
        ("{{a}} + {{b}} = {{c}}", {"a": "1", "b": "2", "c": "3"}, "1 + 2 = 3"),
        ("No placeholders", {}, "No placeholders"),
        ("Missing {{absent}}", {}, "Missing "),
        ("Empty value {{x}}", {"x": ""}, "Empty value "),
        ("Whitespace {{ name }}", {"name": "ok"}, "Whitespace ok"),
        ("Repeated {{x}} and {{x}}", {"x": "y"}, "Repeated y and y"),
    ],
)
def test_render_template(template: str, values: Dict[str, str], expected: str) -> None:
    assert render_template(template, values) == expected


def test_render_messages_substitutes_input_output_expected() -> None:
    messages = [
        {"role": "system", "content": "You are a judge."},
        {
            "role": "user",
            "content": "Input: {{input}}; Output: {{output}}; Expected: {{expected}}",
        },
    ]
    rendered = render_messages(
        messages, {"input": "What is 2+2?", "output": "4", "expected": "4"}
    )
    assert rendered[0] == {"role": "system", "content": "You are a judge."}
    assert "Input: What is 2+2?" in rendered[1]["content"]
    assert "Output: 4" in rendered[1]["content"]
    assert "Expected: 4" in rendered[1]["content"]


def test_render_messages_supports_template_alias_for_yaml() -> None:
    """YAML-loaded scorer messages may use 'template' instead of 'content'."""
    messages = [{"role": "user", "template": "Score {{output}}"}]
    rendered = render_messages(messages, {"output": "X"})
    assert rendered[0]["content"] == "Score X"


# --------------------------------------------------------------------------- #
# extract_label                                                                #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "raw,labels,expected",
    [
        ("PASS", [{"label": "PASS"}, {"label": "FAIL"}], "PASS"),
        ("FAIL", [{"label": "PASS"}, {"label": "FAIL"}], "FAIL"),
        ("PASS: looks good", [{"label": "PASS"}, {"label": "FAIL"}], "PASS"),
        ("**PASS**", [{"label": "PASS"}, {"label": "FAIL"}], "PASS"),
        ("Verdict: FAIL\nReason: ...", [{"label": "PASS"}, {"label": "FAIL"}], "FAIL"),
        ("<think>thinking...</think>\nPASS", [{"label": "PASS"}, {"label": "FAIL"}], "PASS"),
        # Longest-first matching: NOT_PASS should not collapse to PASS
        ("NOT_PASS", [{"label": "PASS"}, {"label": "NOT_PASS"}], "NOT_PASS"),
        # No choice scores → fallback to first alpha word
        ("good answer", None, "GOOD"),
        ("", [{"label": "PASS"}], "UNKNOWN"),
    ],
)
def test_extract_label(raw: str, labels: Any, expected: str) -> None:
    assert extract_label(raw, labels) == expected


@pytest.mark.parametrize(
    "label,scores,expected",
    [
        ("PASS", [{"label": "PASS", "score": 1.0}, {"label": "FAIL", "score": 0.0}], 1.0),
        ("FAIL", [{"label": "PASS", "score": 1.0}, {"label": "FAIL", "score": 0.0}], 0.0),
        ("pass", [{"label": "PASS", "score": 1.0}], 1.0),  # case insensitive
        ("UNKNOWN", [{"label": "PASS", "score": 1.0}], 0.0),  # not in choices
    ],
)
def test_label_to_score(label: str, scores: List[Dict[str, Any]], expected: float) -> None:
    assert label_to_score(label, scores) == expected


# --------------------------------------------------------------------------- #
# get_provider_client — provider dispatch                                     #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "provider,env_var",
    [
        ("openai", "OPENAI_API_KEY"),
        ("anthropic", "ANTHROPIC_API_KEY"),
        ("mistral", "MISTRAL_API_KEY"),
        ("xai", "XAI_API_KEY"),
        ("google", "GEMINI_API_KEY"),
        ("gemini", "GEMINI_API_KEY"),
        ("huggingface", "HF_API_KEY"),
    ],
)
def test_get_provider_client_uses_env_var(
    monkeypatch: pytest.MonkeyPatch, provider: str, env_var: str
) -> None:
    monkeypatch.setenv(env_var, "sk-fake-key-x")
    client, key = get_provider_client(provider)
    assert key == "sk-fake-key-x"
    assert client is not None


def test_get_provider_client_explicit_key_overrides_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "env-key")
    client, key = get_provider_client("openai", api_key="explicit-key")
    assert key == "explicit-key"


def test_get_provider_client_missing_key_raises() -> None:
    with pytest.raises(RuntimeError, match="No API key found for provider"):
        get_provider_client("openai")


def test_get_provider_client_self_hosted_requires_endpoint() -> None:
    with pytest.raises(RuntimeError, match="Self-hosted provider requires"):
        get_provider_client("self-hosted")


def test_get_provider_client_self_hosted_appends_v1_to_endpoint() -> None:
    client, key = get_provider_client("self-hosted", endpoint_url="http://localhost:11434")
    assert client.base_url is not None
    assert "/v1" in str(client.base_url)
    assert key == "not-needed"  # default for self-hosted


def test_get_provider_client_self_hosted_keeps_v1_if_present() -> None:
    client, _ = get_provider_client("self-hosted", endpoint_url="http://x.com/v1")
    # Should not double-append /v1
    assert str(client.base_url).count("/v1") == 1


# --------------------------------------------------------------------------- #
# run_custom_scorer end-to-end (with mocked OpenAI client)                    #
# --------------------------------------------------------------------------- #


def _mock_openai_response(content: str, total_tokens: int = 10):
    response = MagicMock()
    response.choices = [MagicMock(message=MagicMock(content=content))]
    response.usage = MagicMock(prompt_tokens=5, completion_tokens=5, total_tokens=total_tokens)
    return response


@pytest.mark.asyncio
async def test_run_custom_scorer_returns_pass_result(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _mock_openai_response("PASS")

    monkeypatch.setattr(
        "utils.run_custom_scorer.get_provider_client",
        lambda *args, **kwargs: (fake_client, "sk-test"),
    )

    result = await run_custom_scorer(
        scorer_config=_scorer_row(),
        input_text="Q",
        output_text="A",
        expected_text="A",
    )
    assert isinstance(result, ScorerResult)
    assert result.label == "PASS"
    assert result.score == 1.0
    assert result.passed is True


@pytest.mark.asyncio
async def test_run_custom_scorer_returns_fail_result(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _mock_openai_response("FAIL")
    monkeypatch.setattr(
        "utils.run_custom_scorer.get_provider_client",
        lambda *args, **kwargs: (fake_client, "sk-test"),
    )

    result = await run_custom_scorer(
        scorer_config=_scorer_row(),
        input_text="Q",
        output_text="A",
    )
    assert result.label == "FAIL"
    assert result.score == 0.0
    assert result.passed is False


@pytest.mark.asyncio
async def test_run_custom_scorer_handles_legacy_string_judge_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Legacy: scorer_config.config.judgeModel = 'gpt-4o' (string, no provider)."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _mock_openai_response("PASS")
    monkeypatch.setattr(
        "utils.run_custom_scorer.get_provider_client",
        lambda *args, **kwargs: (fake_client, "sk-test"),
    )

    result = await run_custom_scorer(
        scorer_config=_scorer_row(judge_model="gpt-4o"),
        input_text="Q",
        output_text="A",
    )
    assert result.passed is True


@pytest.mark.asyncio
async def test_run_custom_scorer_threshold_boundary(monkeypatch: pytest.MonkeyPatch) -> None:
    """score == defaultThreshold should pass; just below should fail."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    fake_client = MagicMock()
    monkeypatch.setattr(
        "utils.run_custom_scorer.get_provider_client",
        lambda *args, **kwargs: (fake_client, "sk-test"),
    )

    # score = 0.5, threshold = 0.5 → passed (>=)
    fake_client.chat.completions.create.return_value = _mock_openai_response("MED")
    result = await run_custom_scorer(
        scorer_config=_scorer_row(
            choice_scores=[
                {"label": "MED", "score": 0.5},
                {"label": "LOW", "score": 0.49},
            ],
            threshold=0.5,
        ),
        input_text="Q",
        output_text="A",
    )
    assert result.score == 0.5
    assert result.passed is True

    # score = 0.49, threshold = 0.5 → failed
    fake_client.chat.completions.create.return_value = _mock_openai_response("LOW")
    result = await run_custom_scorer(
        scorer_config=_scorer_row(
            choice_scores=[
                {"label": "MED", "score": 0.5},
                {"label": "LOW", "score": 0.49},
            ],
            threshold=0.5,
        ),
        input_text="Q",
        output_text="A",
    )
    assert result.score == 0.49
    assert result.passed is False


@pytest.mark.asyncio
async def test_run_custom_scorer_renders_messages_with_io(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify {{input}}, {{output}}, {{expected}} are substituted before sending to LLM."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    captured: Dict[str, Any] = {}
    fake_client = MagicMock()

    def capture_call(**kwargs):
        captured["messages"] = kwargs.get("messages")
        return _mock_openai_response("PASS")

    fake_client.chat.completions.create.side_effect = capture_call
    monkeypatch.setattr(
        "utils.run_custom_scorer.get_provider_client",
        lambda *args, **kwargs: (fake_client, "sk-test"),
    )

    await run_custom_scorer(
        scorer_config=_scorer_row(
            messages=[
                {"role": "system", "content": "Judge this."},
                {
                    "role": "user",
                    "content": "in={{input}} out={{output}} exp={{expected}}",
                },
            ]
        ),
        input_text="What is 2+2?",
        output_text="4",
        expected_text="4",
    )
    rendered = captured["messages"][1]["content"]
    assert "in=What is 2+2?" in rendered
    assert "out=4" in rendered
    assert "exp=4" in rendered


@pytest.mark.asyncio
async def test_run_custom_scorer_parses_json_verdict(monkeypatch: pytest.MonkeyPatch) -> None:
    """JSON {"verdict": "PASS", "reason": "..."} should be parsed and reason captured."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _mock_openai_response(
        '```json\n{"verdict": "PASS", "reason": "Helpful and accurate"}\n```'
    )
    monkeypatch.setattr(
        "utils.run_custom_scorer.get_provider_client",
        lambda *args, **kwargs: (fake_client, "sk-test"),
    )

    result = await run_custom_scorer(
        scorer_config=_scorer_row(),
        input_text="Q",
        output_text="A",
    )
    assert result.label == "PASS"
    assert result.passed is True
    assert result.reason == "Helpful and accurate"


@pytest.mark.asyncio
async def test_run_custom_scorer_missing_judge_model_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    bad = _scorer_row(judge_model={"provider": "openai"})  # no name
    with pytest.raises(ValueError, match="no judge model configured"):
        await run_custom_scorer(scorer_config=bad, input_text="Q", output_text="A")


@pytest.mark.asyncio
async def test_run_custom_scorer_missing_messages_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    bad = _scorer_row(messages=[])
    with pytest.raises(ValueError, match="no message templates"):
        await run_custom_scorer(scorer_config=bad, input_text="Q", output_text="A")


@pytest.mark.asyncio
async def test_run_custom_scorer_returns_error_on_no_key() -> None:
    """No API key for the provider → ScorerResult with label='ERROR' and passed=False."""
    result = await run_custom_scorer(
        scorer_config=_scorer_row(judge_model={"name": "gpt-4o", "provider": "openai"}),
        input_text="Q",
        output_text="A",
    )
    assert result.label == "ERROR"
    assert result.passed is False
    assert "Failed to initialize" in result.raw_response


@pytest.mark.asyncio
async def test_run_custom_scorer_uses_gateway_when_enabled(
    monkeypatch: pytest.MonkeyPatch, gateway_env: str
) -> None:
    """If gateway mode is enabled, the scorer should hit the gateway, not OpenAI directly."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    gateway_called: Dict[str, Any] = {}

    def fake_gateway_completion(litellm_model, messages, api_key, **kwargs):
        gateway_called["model"] = litellm_model
        gateway_called["api_key"] = api_key
        gateway_called["messages"] = messages
        return "PASS"

    fake_client = MagicMock()
    monkeypatch.setattr(
        "utils.run_custom_scorer.get_provider_client",
        lambda *args, **kwargs: (fake_client, "sk-test"),
    )
    monkeypatch.setattr(
        "utils.gateway_litellm_client.gateway_chat_completion_sync", fake_gateway_completion
    )

    result = await run_custom_scorer(
        scorer_config=_scorer_row(judge_model={"name": "gpt-4o-mini", "provider": "openai"}),
        input_text="Q",
        output_text="A",
    )
    assert gateway_called["model"] == "gpt-4o-mini"  # openai → no prefix
    assert result.label == "PASS"
    # OpenAI client should NOT have been hit
    fake_client.chat.completions.create.assert_not_called()


@pytest.mark.asyncio
async def test_run_custom_scorer_self_hosted_skips_gateway(
    monkeypatch: pytest.MonkeyPatch, gateway_env: str
) -> None:
    """Self-hosted should ALWAYS go through the local OpenAI client even if gateway is enabled."""
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _mock_openai_response("PASS")
    monkeypatch.setattr(
        "utils.run_custom_scorer.get_provider_client",
        lambda *args, **kwargs: (fake_client, "not-needed"),
    )

    gateway_calls = {"count": 0}

    def fake_gateway(*args, **kwargs):
        gateway_calls["count"] += 1
        return "PASS"

    monkeypatch.setattr(
        "utils.gateway_litellm_client.gateway_chat_completion_sync", fake_gateway
    )

    result = await run_custom_scorer(
        scorer_config=_scorer_row(
            judge_model={
                "name": "tinyllama",
                "provider": "self-hosted",
                "endpointUrl": "http://localhost:11434",
            }
        ),
        input_text="Q",
        output_text="A",
    )
    assert result.label == "PASS"
    assert gateway_calls["count"] == 0
    fake_client.chat.completions.create.assert_called_once()


# --------------------------------------------------------------------------- #
# PROVIDER_CONFIG sanity                                                       #
# --------------------------------------------------------------------------- #


def test_provider_config_covers_supported_providers() -> None:
    """Document the canonical list of supported scorer providers."""
    expected = {"openai", "anthropic", "mistral", "xai", "google", "gemini", "huggingface", "self-hosted"}
    assert expected.issubset(set(PROVIDER_CONFIG.keys()))


def test_google_and_gemini_share_same_env_var() -> None:
    assert PROVIDER_CONFIG["google"]["env_var"] == PROVIDER_CONFIG["gemini"]["env_var"]
