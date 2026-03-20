from __future__ import annotations

from typing import Any, Dict, List

from seeds.index import ObligationIndex
from validate.signals import compute_risk_and_reasons


def enrich_with_obligations(
    *,
    scenarios: List[Dict[str, Any]],
    ob_index: ObligationIndex,
    inject_constraints_into_prompt: bool,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []

    for s in scenarios:
        # Our accepted records currently have: seed_trace.obligation_ids = [<obl_id>]
        obligation_ids = (s.get("seed_trace", {}) or {}).get("obligation_ids", [])
        obligation_id = obligation_ids[0] if obligation_ids else None

        obl = ob_index.get(obligation_id) if obligation_id else None
        if obl is None:
            # Keep scenario but leave constraints empty; also mark in metadata
            s.setdefault("metadata", {})
            s["metadata"]["obligation_missing"] = True
            out.append(s)
            continue

        # Fill constraints
        s["constraints"]["must"] = list(obl.must)
        s["constraints"]["must_not"] = list(obl.must_not)

        # Fill seed_trace sources for auditability
        s["seed_trace"]["sources"] = [
            {
                "source_type": obl.source.source_type,
                "source_ref": obl.source.source_ref,
                "excerpt_id": obl.source.excerpt_id,
            }
        ]

        # Overwrite risk fields (Option A)
        risk_level, risk_reasons = compute_risk_and_reasons(
            domain=s.get("domain", "unknown"),
            obligation=obl,
            prompt=s.get("prompt", ""),
        )
        s["risk_level"] = risk_level
        s["risk_reasons"] = risk_reasons

        # Optionally inject constraints into the prompt (for candidate LLM and/or judge context)
        if inject_constraints_into_prompt:
            must_lines = "\n".join([f"- {x}" for x in obl.must]) if obl.must else "- (none)"
            must_not_lines = "\n".join([f"- {x}" for x in obl.must_not]) if obl.must_not else "- (none)"
            block = (
                "\n\n---\n"
                "Constraints (governance obligations):\n"
                "MUST:\n"
                f"{must_lines}\n"
                "MUST NOT:\n"
                f"{must_not_lines}\n"
                "---\n"
            )
            s["prompt"] = s["prompt"].rstrip() + block

        out.append(s)

    return out
