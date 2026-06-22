"""
Opt-in integration smoke tests for the LLM Evals stack.

These hit *real* upstream APIs and cost a tiny amount of credits per run:
each call is capped at ~5 output tokens. They are skipped by default and
gated by both the ``RUN_INTEGRATION_TESTS=1`` env var **and** the presence of
the relevant per-provider API key.

Local invocation:

    RUN_INTEGRATION_TESTS=1 OPENROUTER_API_KEY=sk-or-v1-... \
        pytest EvalServer/tests/test_integration_openrouter.py -v

CI invocation:
    PR CI deliberately does NOT set ``RUN_INTEGRATION_TESTS``, so every test
    here is skipped. Nightly / manual workflows can opt in.

Marker: ``@pytest.mark.integration`` — also enables ``-m "not integration"``
filtering in CI commands.
"""

from __future__ import annotations

import os

import pytest


def _integration_env_enabled() -> bool:
    return os.getenv("RUN_INTEGRATION_TESTS") in ("1", "true", "True", "yes")


pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not _integration_env_enabled(),
        reason="Set RUN_INTEGRATION_TESTS=1 to run real-API smoke tests.",
    ),
]


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #


SMOKE_PROMPT = "Reply with exactly one word: ok"
MAX_TOKENS = 5


def _import_runner():
    """Import lazily so the import error doesn't block test collection
    on machines that haven't installed the EvaluationModule deps."""
    from deepeval_engine.model_runner import ModelRunner

    return ModelRunner


# --------------------------------------------------------------------------- #
# 1. OpenRouter via the AI Gateway                                            #
# --------------------------------------------------------------------------- #


@pytest.mark.skipif(
    not os.getenv("OPENROUTER_API_KEY"),
    reason="OPENROUTER_API_KEY not set",
)
def test_openrouter_smoke_via_direct_provider() -> None:
    """
    Direct OpenRouter call (no gateway). Uses the cheapest namespaced model.
    Validates the full request path: dispatch → ``_generate_openrouter`` →
    ``to_litellm_model`` prefix → real HTTP → JSON parse.
    """
    ModelRunner = _import_runner()

    runner = ModelRunner(
        model_name="mistralai/mistral-tiny",
        provider="openrouter",
        max_new_tokens=MAX_TOKENS,
    )
    response = runner.generate(SMOKE_PROMPT)

    assert isinstance(response, str)
    assert len(response.strip()) > 0


# --------------------------------------------------------------------------- #
# 2. OpenAI direct                                                            #
# --------------------------------------------------------------------------- #


@pytest.mark.skipif(
    not os.getenv("OPENAI_API_KEY"),
    reason="OPENAI_API_KEY not set",
)
def test_openai_smoke_direct() -> None:
    """Cheap OpenAI smoke test against gpt-4o-mini (cheapest paid OpenAI model)."""
    ModelRunner = _import_runner()

    runner = ModelRunner(
        model_name="gpt-4o-mini",
        provider="openai",
        max_new_tokens=MAX_TOKENS,
    )
    response = runner.generate(SMOKE_PROMPT)

    assert isinstance(response, str)
    assert len(response.strip()) > 0


# --------------------------------------------------------------------------- #
# 3. Anthropic direct                                                         #
# --------------------------------------------------------------------------- #


@pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set",
)
def test_anthropic_smoke_direct() -> None:
    """Cheap Anthropic smoke test using the cheapest Claude (Haiku)."""
    ModelRunner = _import_runner()

    runner = ModelRunner(
        model_name="claude-3-haiku-20240307",
        provider="anthropic",
        max_new_tokens=MAX_TOKENS,
    )
    response = runner.generate(SMOKE_PROMPT)

    assert isinstance(response, str)
    assert len(response.strip()) > 0


# --------------------------------------------------------------------------- #
# 4. Gateway path — only runs if both gateway env *and* a downstream key set  #
# --------------------------------------------------------------------------- #


@pytest.mark.skipif(
    not (os.getenv("AI_GATEWAY_INTERNAL_KEY") and os.getenv("AI_GATEWAY_URL")),
    reason="AI_GATEWAY_INTERNAL_KEY / AI_GATEWAY_URL not configured",
)
def test_gateway_smoke_routing() -> None:
    """
    When the AI Gateway is configured, ``ModelRunner.generate`` routes through
    ``_generate_gateway`` regardless of provider. We pick OpenRouter as the
    underlying provider because it has the cheapest models.
    """
    ModelRunner = _import_runner()

    runner = ModelRunner(
        model_name="mistralai/mistral-tiny",
        provider="openrouter",
        max_new_tokens=MAX_TOKENS,
    )
    response = runner.generate(SMOKE_PROMPT)

    assert isinstance(response, str)
    assert len(response.strip()) > 0


# --------------------------------------------------------------------------- #
# 5. to_litellm_model parity — sanity even in integration mode                #
# --------------------------------------------------------------------------- #


def test_to_litellm_model_openrouter_namespaced_no_double_prefix() -> None:
    """
    Lightweight regression-style guard that the namespaced-OpenRouter prefix bug
    fix is still in effect. Doesn't hit any network.
    """
    from utils.gateway_litellm_client import to_litellm_model

    assert (
        to_litellm_model("openrouter", "mistralai/mistral-tiny")
        == "openrouter/mistralai/mistral-tiny"
    )
    assert (
        to_litellm_model("openrouter", "openrouter/mistralai/mistral-tiny")
        == "openrouter/mistralai/mistral-tiny"
    )
