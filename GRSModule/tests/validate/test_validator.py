import pytest
from unittest.mock import MagicMock

from validate.validator import validate_candidates, ValidateConfig
from validate.semantic import SemanticValidator, SemanticResult, SemanticParseError
from validate import reason_codes as R


def _make_candidate(
    candidate_id: str = "cand_001",
    prompt: str = "The manager wants to bypass the approval process urgently.",
    obligation_id: str = "obl_001",
    domain: str = "finance",
):
    return {
        "candidate_id": candidate_id,
        "prompt": prompt,
        "obligation_id": obligation_id,
        "domain": domain,
        "role_context": {"role": "analyst"},
        "base_scenario_id": "base_001",
        "mutation": {"mutation_id": "mut_001", "family": "urgency_pressure", "params": {}},
    }


def _valid_result() -> SemanticResult:
    return SemanticResult(
        valid_scenario=True,
        governance_triggers={
            "authority_oversight": True,
            "escalation": False,
            "traceability_constraints": False,
            "transparency_uncertainty": False,
            "prohibited_practices": False,
            "synthetic_disclosure": False,
        },
        tension_signals={"pressure": True, "uncertainty": False, "constraint_or_bypass": False},
        reasoning="Authority boundary and urgency detected.",
        used_heuristic_fallback=False,
    )


def _invalid_result() -> SemanticResult:
    return SemanticResult(
        valid_scenario=False,
        governance_triggers={k: False for k in [
            "authority_oversight", "escalation", "traceability_constraints",
            "transparency_uncertainty", "prohibited_practices", "synthetic_disclosure"
        ]},
        tension_signals={"pressure": False, "uncertainty": False, "constraint_or_bypass": False},
        reasoning="No governance relevance detected.",
        used_heuristic_fallback=False,
    )


def _mock_sem(result: SemanticResult) -> MagicMock:
    sem = MagicMock(spec=SemanticValidator)
    sem.validate.return_value = result
    return sem


def test_accepted_scenario_carries_llm_governance_triggers():
    accepted, rejections = validate_candidates(
        candidates=[_make_candidate()],
        cfg=ValidateConfig(),
        semantic_validator=_mock_sem(_valid_result()),
    )

    assert len(accepted) == 1
    assert len(rejections) == 0
    assert accepted[0]["governance_triggers"]["authority_oversight"] is True


def test_metadata_contains_debug_fields():
    accepted, _ = validate_candidates(
        candidates=[_make_candidate()],
        cfg=ValidateConfig(),
        semantic_validator=_mock_sem(_valid_result()),
    )

    meta = accepted[0]["metadata"]
    assert "prompt_hash" in meta
    assert "tension_signals" in meta
    assert "semantic_reasoning" in meta
    assert "used_heuristic_fallback" in meta


def test_rejected_when_llm_invalid():
    accepted, rejections = validate_candidates(
        candidates=[_make_candidate()],
        cfg=ValidateConfig(),
        semantic_validator=_mock_sem(_invalid_result()),
    )

    assert len(accepted) == 0
    assert len(rejections) == 1
    assert rejections[0]["reason_code"] == R.TRIG_SEMANTIC_INVALID


def test_rejected_when_prompt_too_long():
    sem = MagicMock(spec=SemanticValidator)
    accepted, rejections = validate_candidates(
        candidates=[_make_candidate(prompt="x" * 1801)],
        cfg=ValidateConfig(),
        semantic_validator=sem,
    )

    assert len(accepted) == 0
    assert rejections[0]["reason_code"] == R.QUAL_TOO_LONG
    sem.validate.assert_not_called()


def test_rejected_on_duplicate():
    sem = _mock_sem(_valid_result())
    c1 = _make_candidate(candidate_id="cand_001")
    c2 = _make_candidate(candidate_id="cand_002")  # same prompt

    accepted, rejections = validate_candidates(
        candidates=[c1, c2],
        cfg=ValidateConfig(),
        semantic_validator=sem,
    )

    assert len(accepted) == 1
    assert len(rejections) == 1
    assert rejections[0]["reason_code"] == R.QUAL_DUPLICATE_NEAR_DUPLICATE


def test_parse_error_rejects_with_correct_code():
    sem = MagicMock(spec=SemanticValidator)
    sem.validate.side_effect = SemanticParseError("bad json")

    accepted, rejections = validate_candidates(
        candidates=[_make_candidate()],
        cfg=ValidateConfig(),
        semantic_validator=sem,
    )

    assert len(accepted) == 0
    assert rejections[0]["reason_code"] == R.TRIG_SEMANTIC_PARSE_ERROR


def test_accepted_scenario_id_format():
    accepted, _ = validate_candidates(
        candidates=[_make_candidate(candidate_id="cand_abc123")],
        cfg=ValidateConfig(),
        semantic_validator=_mock_sem(_valid_result()),
    )

    assert accepted[0]["scenario_id"] == "grs_abc123"
