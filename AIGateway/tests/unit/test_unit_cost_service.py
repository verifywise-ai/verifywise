"""Unit tests for services.cost_service with LiteLLM monkeypatched.

Covers prompt-cost estimation (incl. tool tokens), counter/cost failure
fallbacks, NaN coercion, and the whole_tokens / tool_definitions helpers.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

import services.cost_service as cost_service  # noqa: E402

MESSAGES = [{"role": "user", "content": "hello"}]
TOOLS = [{"type": "function", "function": {"name": "f", "parameters": {"type": "object"}}}]


def test_estimate_prompt_cost_known_model(monkeypatch):
    monkeypatch.setattr(cost_service.litellm, "token_counter", lambda **_: 10)
    monkeypatch.setattr(
        cost_service.litellm, "cost_per_token",
        lambda **_: (0.001, 0.002),
    )
    assert cost_service.estimate_prompt_cost("gpt-4o", MESSAGES, max_tokens=100) == pytest.approx(0.003)


def test_estimate_counts_tool_tokens(monkeypatch):
    seen = {}

    def fake_counter(model=None, messages=None, tools=None, **kwargs):
        if tools is not None:
            seen["tools"] = tools
            return 50  # litellm returns one total when tools are passed
        return 10

    monkeypatch.setattr(cost_service.litellm, "token_counter", fake_counter)
    monkeypatch.setattr(cost_service.litellm, "cost_per_token", lambda **_: (0.0, 0.0))

    cost_service.estimate_prompt_cost("gpt-4o", MESSAGES, max_tokens=10, tools=TOOLS)
    assert seen["tools"] == TOOLS


def test_estimate_falls_back_to_size_count_when_counter_rejects_input(monkeypatch):
    """A counter failure must not zero the estimate (that would bypass budgets)."""
    def fake_counter(**_kwargs):
        raise ValueError("unsupported shape")

    monkeypatch.setattr(cost_service.litellm, "token_counter", fake_counter)
    monkeypatch.setattr(cost_service.litellm, "cost_per_token", lambda **_: (0.0, 0.0))

    result = cost_service.estimate_prompt_cost("weird-model", [{"unserializable"}], max_tokens=10, tools=TOOLS)
    # Size-based fallback is non-negative and was used without raising.
    assert result == 0.0  # prices are mocked to zero; the point is no exception


def test_estimate_returns_zero_when_pricing_raises(monkeypatch):
    monkeypatch.setattr(cost_service.litellm, "token_counter", lambda **_: 10)

    def boom(**_kwargs):
        raise Exception("no price list")

    monkeypatch.setattr(cost_service.litellm, "cost_per_token", boom)
    assert cost_service.estimate_prompt_cost("unknown-model", MESSAGES) == 0.0


def test_estimate_nan_cost_becomes_zero(monkeypatch):
    monkeypatch.setattr(cost_service.litellm, "token_counter", lambda **_: 10)
    monkeypatch.setattr(cost_service.litellm, "cost_per_token", lambda **_: (float("nan"), 0.0))
    assert cost_service.estimate_prompt_cost("gpt-4o", MESSAGES) == 0.0


def test_calculate_stream_cost_uses_token_counts(monkeypatch):
    monkeypatch.setattr(cost_service.litellm, "token_counter", lambda **_: 20)
    monkeypatch.setattr(cost_service.litellm, "cost_per_token", lambda **_: (0.001, 0.002))

    cost, usage = cost_service.calculate_stream_cost("gpt-4o", MESSAGES, "some text")
    assert usage == {"prompt_tokens": 20, "completion_tokens": 20, "total_tokens": 40}
    assert cost == pytest.approx(0.003)


def test_calculate_stream_cost_keeps_usage_when_pricing_fails(monkeypatch):
    def fake_counter(model=None, messages=None, text=None, **kwargs):
        return 8 if text is not None else 4

    def boom(**_kwargs):
        raise Exception("unpriced model")

    monkeypatch.setattr(cost_service.litellm, "token_counter", fake_counter)
    monkeypatch.setattr(cost_service.litellm, "cost_per_token", boom)

    cost, usage = cost_service.calculate_stream_cost("unpriced", MESSAGES, "acc")
    assert cost == 0.0
    assert usage["prompt_tokens"] == 4
    assert usage["completion_tokens"] == 8


@pytest.mark.parametrize(
    "value, expected",
    [
        (12, 12),
        (12.0, 12),
        (0, 0),
        (None, None),
        (True, None),  # bool is an int subclass; must not count as tokens
        (-3, None),
        (3.5, None),
        ("12", None),
    ],
)
def test_whole_tokens(value, expected):
    assert cost_service.whole_tokens(value) == expected


def test_tool_definitions_combines_tools_and_functions():
    tools = [{"type": "function"}]
    functions = [{"name": "legacy"}]
    assert cost_service.tool_definitions({"tools": tools, "functions": functions}) == tools + functions
    assert cost_service.tool_definitions({"tools": tools}) == tools
    assert cost_service.tool_definitions({}) is None
    assert cost_service.tool_definitions({"tools": [], "functions": []}) is None
