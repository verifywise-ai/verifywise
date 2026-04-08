from __future__ import annotations

from typing import Any, Dict, List

from seeds.index import ObligationIndex
from validate.signals import compute_risk_and_reasons


def build_base_scenario_records(
    *,
    base_scenarios: List[Dict[str, Any]],
    ob_index: ObligationIndex,
    dataset_version: str,
    start_id: int,
) -> List[Dict[str, Any]]:
    """
    Convert base (non-mutated) scenario records into enriched final scenario records.

    Args:
        base_scenarios: Records from intermediate/base_scenarios_deduped.jsonl.
        ob_index: Obligation index built from configs/obligations.yaml.
        dataset_version: e.g. "grs_scenarios_v0.3" — written into the version field.
        start_id: The first grs_ integer to assign. First record gets
                  grs_{start_id:06d}, second gets grs_{start_id+1:06d}, etc.

    Returns:
        List of enriched scenario dicts ready to append to final/scenarios.jsonl.
    """
    records: List[Dict[str, Any]] = []

    for i, base in enumerate(base_scenarios):
        scenario_id = f"grs_{(start_id + i):06d}"
        obligation_id = base.get("obligation_id")
        obl = ob_index.get(obligation_id) if obligation_id else None

        if obl is not None:
            constraints = {
                "must": list(obl.must),
                "must_not": list(obl.must_not),
                "format": {"required": False, "type": "none", "notes": ""},
            }
            seed_trace = {
                "obligation_ids": [obligation_id],
                "sources": [
                    {
                        "source_type": obl.source.source_type,
                        "source_ref": obl.source.source_ref,
                        "excerpt_id": obl.source.excerpt_id,
                    }
                ],
            }
            risk_level, risk_reasons = compute_risk_and_reasons(
                domain=base.get("domain", "unknown"),
                obligation=obl,
                prompt=base.get("prompt", ""),
            )
        else:
            constraints = {
                "must": [],
                "must_not": [],
                "format": {"required": False, "type": "none", "notes": ""},
            }
            seed_trace = {
                "obligation_ids": [obligation_id] if obligation_id else [],
                "sources": [],
            }
            risk_level = "low"
            risk_reasons = []

        records.append(
            {
                "scenario_id": scenario_id,
                "version": dataset_version,
                "domain": base.get("domain", "unknown"),
                "industry": "general",
                "role_context": base.get("role_context", {}),
                "prompt": base.get("prompt", ""),
                "constraints": constraints,
                "governance_triggers": {},
                "seed_trace": seed_trace,
                "mutation_trace": {
                    "base_scenario_id": base["base_scenario_id"],
                    "mutations": [],
                },
                "metadata": {
                    "prompt_hash": base.get("prompt_hash", ""),
                    "is_base_scenario": True,
                },
                "risk_level": risk_level,
                "risk_reasons": risk_reasons,
            }
        )

    return records
