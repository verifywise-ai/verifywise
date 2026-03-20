from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

from rich.progress import track

from render.dedup import prompt_hash
from validate import reason_codes as R
from validate.semantic import SemanticValidator, SemanticParseError


@dataclass(frozen=True)
class ValidateConfig:
    max_prompt_chars: int = 1800


def validate_candidates(
    *,
    candidates: List[Dict[str, Any]],
    cfg: ValidateConfig,
    semantic_validator: SemanticValidator,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Returns (accepted_scenarios, rejections).

    Validation pipeline:
      1. Length hygiene
      2. Deduplication
      3. LLM semantic validation (dimension trigger + signal gate).
         Falls back to heuristic regex when client is MockChatClient.
    """
    rejections: List[Dict[str, Any]] = []
    accepted: List[Dict[str, Any]] = []
    seen_hashes: set[str] = set()

    for c in track(candidates, description="Validating candidates…"):
        prompt = c.get("prompt", "")
        cid = c.get("candidate_id", "unknown")

        # Check 1: length hygiene
        if len(prompt) > cfg.max_prompt_chars:
            rejections.append({"candidate_id": cid, "reason_code": R.QUAL_TOO_LONG, "notes": "prompt too long"})
            continue

        # Check 2: deduplication
        h = prompt_hash(prompt)
        if h in seen_hashes:
            rejections.append({"candidate_id": cid, "reason_code": R.QUAL_DUPLICATE_NEAR_DUPLICATE, "notes": "duplicate prompt"})
            continue
        seen_hashes.add(h)

        # Check 3: LLM semantic validation (dimension trigger + signal gate)
        try:
            result = semantic_validator.validate(prompt)
        except SemanticParseError as exc:
            rejections.append({"candidate_id": cid, "reason_code": R.TRIG_SEMANTIC_PARSE_ERROR, "notes": str(exc)})
            continue

        if not result.valid_scenario:
            rejections.append({"candidate_id": cid, "reason_code": R.TRIG_SEMANTIC_INVALID, "notes": result.reasoning})
            continue

        accepted.append(
            {
                "scenario_id": c["candidate_id"].replace("cand_", "grs_"),
                "version": "grs_scenarios_v0.1",
                "domain": c.get("domain", "unknown"),
                "industry": "general",
                "role_context": c.get("role_context", {}),
                "prompt": prompt,
                "constraints": {
                    "must": [],
                    "must_not": [],
                    "format": {"required": False, "type": "none", "notes": ""},
                },
                "governance_triggers": result.governance_triggers,
                "seed_trace": {"obligation_ids": [c.get("obligation_id")]},
                "mutation_trace": {
                    "base_scenario_id": c.get("base_scenario_id"),
                    "mutations": [
                        {
                            "mutation_id": c.get("mutation", {}).get("mutation_id"),
                            "family": c.get("mutation", {}).get("family"),
                            "params": c.get("mutation", {}).get("params", {}),
                        }
                    ],
                },
                "metadata": {
                    "prompt_hash": h,
                    "tension_signals": result.tension_signals,
                    "semantic_reasoning": result.reasoning,
                    "used_heuristic_fallback": result.used_heuristic_fallback,
                },
            }
        )

    return accepted, rejections
