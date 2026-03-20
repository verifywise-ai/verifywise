from validate import reason_codes as R


def test_reason_codes_exist():
    assert R.TRIG_SEMANTIC_INVALID == "TRIG_SEMANTIC_INVALID"
    assert R.TRIG_SEMANTIC_PARSE_ERROR == "TRIG_SEMANTIC_PARSE_ERROR"


import json
import pytest
from unittest.mock import MagicMock

from validate.semantic import (
    SemanticValidator,
    SemanticValidatorConfig,
    SemanticResult,
    SemanticParseError,
    SYSTEM_PROMPT,
)
from llm.mock import MockChatClient
from llm.base import ChatResult


VALID_LLM_RESPONSE = json.dumps({
    "valid_scenario": True,
    "governance_triggers": {
        "authority_oversight": True,
        "escalation": False,
        "traceability_constraints": False,
        "transparency_uncertainty": False,
        "prohibited_practices": False,
        "synthetic_disclosure": False,
    },
    "tension_signals": {
        "pressure": True,
        "uncertainty": False,
        "constraint_or_bypass": False,
    },
    "reasoning": "The scenario involves authority boundaries and urgency.",
})

INVALID_LLM_RESPONSE = json.dumps({
    "valid_scenario": False,
    "governance_triggers": {
        "authority_oversight": False,
        "escalation": False,
        "traceability_constraints": False,
        "transparency_uncertainty": False,
        "prohibited_practices": False,
        "synthetic_disclosure": False,
    },
    "tension_signals": {
        "pressure": False,
        "uncertainty": False,
        "constraint_or_bypass": False,
    },
    "reasoning": "No governance dimension or tension signal detected.",
})


def _real_client(response_text: str) -> MagicMock:
    """Return a MagicMock that looks like a real (non-Mock) ChatClient."""
    fake = MagicMock()
    fake.chat.return_value = ChatResult(text=response_text, raw={})
    # Make isinstance(fake, MockChatClient) return False
    fake.__class__ = type("RealClient", (), {})
    return fake


def test_llm_path_valid_scenario():
    validator = SemanticValidator(client=_real_client(VALID_LLM_RESPONSE), cfg=SemanticValidatorConfig())
    result = validator.validate("The CEO is demanding we skip the compliance review.")

    assert isinstance(result, SemanticResult)
    assert result.valid_scenario is True
    assert result.governance_triggers["authority_oversight"] is True
    assert result.tension_signals["pressure"] is True
    assert result.used_heuristic_fallback is False
    assert "authority" in result.reasoning.lower()


def test_llm_path_invalid_scenario():
    validator = SemanticValidator(client=_real_client(INVALID_LLM_RESPONSE), cfg=SemanticValidatorConfig())
    result = validator.validate("What is the weather today?")

    assert result.valid_scenario is False
    assert result.used_heuristic_fallback is False


def test_llm_path_parse_error_raises():
    validator = SemanticValidator(client=_real_client("not valid json"), cfg=SemanticValidatorConfig())

    with pytest.raises(SemanticParseError):
        validator.validate("Some scenario prompt.")


def test_llm_path_strips_markdown_fences():
    wrapped = f"```json\n{VALID_LLM_RESPONSE}\n```"
    validator = SemanticValidator(client=_real_client(wrapped), cfg=SemanticValidatorConfig())
    result = validator.validate("Any prompt.")

    assert result.valid_scenario is True


def test_mock_path_uses_heuristic_fallback():
    validator = SemanticValidator(client=MockChatClient(), cfg=SemanticValidatorConfig())
    # Prompt with a clear governance keyword — heuristic should detect it
    result = validator.validate("The manager wants to bypass the approval process urgently.")

    assert result.used_heuristic_fallback is True
    assert isinstance(result.valid_scenario, bool)


def test_sanity_check_overrides_llm_valid_scenario():
    # LLM claims valid_scenario=True but all triggers are False — sanity recomputes to False
    bad_response = json.dumps({
        "valid_scenario": True,
        "governance_triggers": {k: False for k in [
            "authority_oversight", "escalation", "traceability_constraints",
            "transparency_uncertainty", "prohibited_practices", "synthetic_disclosure"
        ]},
        "tension_signals": {"pressure": False, "uncertainty": False, "constraint_or_bypass": False},
        "reasoning": "contradictory LLM response",
    })
    validator = SemanticValidator(client=_real_client(bad_response), cfg=SemanticValidatorConfig())
    result = validator.validate("Any prompt.")

    assert result.valid_scenario is False


def test_system_prompt_contains_all_dimensions():
    for dim in [
        "authority_oversight", "escalation", "traceability_constraints",
        "transparency_uncertainty", "prohibited_practices", "synthetic_disclosure"
    ]:
        assert dim in SYSTEM_PROMPT


def test_system_prompt_contains_all_signals():
    for sig in ["pressure", "uncertainty", "constraint_or_bypass"]:
        assert sig in SYSTEM_PROMPT
