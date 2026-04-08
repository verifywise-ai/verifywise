# Design: Backfill Base Scenarios into Final Dataset

**Date:** 2026-04-06
**Status:** Approved

---

## Problem

The GRS pipeline only writes mutated scenarios to `final/scenarios.jsonl`. Base (non-mutated) scenarios remain in `intermediate/base_scenarios_deduped.jsonl` and are never promoted to the final dataset. This makes it impossible to measure mutation effectiveness (i.e., compare LLM responses on base vs. mutated prompts) or know how many base scenarios are available for sampling workflows.

Three dataset versions (v0.1–v0.3) already exist and need to be retroactively patched.

---

## Solution

Add a `backfill-base` stage to the existing CLI. When run against an existing dataset version, it:

1. Reads base scenarios from `intermediate/base_scenarios_deduped.jsonl`
2. Enriches each record using the existing `enrich_with_obligations` + `compute_risk_and_reasons` logic
3. Assigns continuing `grs_` IDs after the current maximum
4. Appends enriched records to `final/scenarios.jsonl`
5. Updates `manifest.json` with a `backfill_base` audit section

---

## Invocation

```bash
uv run grs-scenarios generate \
  --stage backfill-base \
  --dataset-version grs_scenarios_v0.3

# Or via Makefile
make backfill-base
```

---

## Inputs & Outputs

| | Path |
|---|---|
| **Input** | `intermediate/base_scenarios_deduped.jsonl` |
| **Input** | `final/scenarios.jsonl` (read for max ID) |
| **Input** | `configs/obligations.yaml` |
| **Output** | `final/scenarios.jsonl` (rewritten with base records appended) |
| **Output** | `final/manifest.json` (updated in-place) |

---

## Enriched Record Shape

```python
{
  "scenario_id": "grs_000595",          # continues from max existing grs_ ID + 1
  "version": "<dataset_version>",
  "domain": ...,                         # from base record
  "industry": "general",
  "role_context": ...,                   # from base record
  "prompt": ...,                         # from base record, unmodified
  "constraints": {                       # filled by enrich_with_obligations
    "must": [...],
    "must_not": [...],
    "format": {"required": False, "type": "none", "notes": ""}
  },
  "governance_triggers": {},             # empty — semantic validation not re-run
  "seed_trace": {
    "obligation_ids": ["obl_..."],
    "sources": [...]                     # filled by enrich_with_obligations
  },
  "mutation_trace": {
    "base_scenario_id": "base_000001",
    "mutations": []                      # empty list = base scenario, no mutations applied
  },
  "metadata": {
    "prompt_hash": ...,                  # from base record
    "is_base_scenario": True            # explicit flag for downstream filtering
  },
  "risk_level": ...,                    # from compute_risk_and_reasons
  "risk_reasons": [...]
}
```

### Notes
- `governance_triggers` is an empty dict because semantic validation (LLM call) is not re-run for base scenarios.
- `mutation_trace.mutations: []` is the canonical marker distinguishing base from mutated records.
- `metadata.is_base_scenario: True` makes filtering trivial in downstream queries and the parquet export.

---

## ID Assignment

```python
max_id = max(int(s["scenario_id"].split("_")[1]) for s in existing_scenarios)

for i, base in enumerate(base_scenarios):
    scenario_id = f"grs_{(max_id + 1 + i):06d}"
```

Base scenario IDs continue the existing `grs_` sequence. The link back to the original intermediate record is preserved via `mutation_trace.base_scenario_id`.

---

## Manifest Update

The existing `manifest.json` is updated in-place by merging a `backfill_base` key. Existing fields are untouched.

```json
{
  "...existing fields preserved...",
  "backfill_base": {
    "run_at": "<iso timestamp>",
    "base_scenarios_added": 199,
    "scenarios_total_after": 793,
    "inputs": {
      "base_scenarios_deduped_jsonl": "intermediate/base_scenarios_deduped.jsonl",
      "base_scenarios_deduped_jsonl_sha256": "...",
      "obligations_yaml": "configs/obligations.yaml",
      "obligations_yaml_sha256": "..."
    },
    "outputs": {
      "scenarios_jsonl": "final/scenarios.jsonl",
      "scenarios_jsonl_sha256": "..."
    }
  }
}
```

### Versioning note
- **v0.1–v0.3:** `backfill_base` section present as a permanent provenance record.
- **v0.4+:** No `backfill_base` section — once the validate stage natively includes base scenarios, this stage is legacy-only.

---

## Future Pipeline Change

When the validate stage is updated to process base scenarios natively, the `backfill-base` CLI stage should be documented as "legacy/retroactive use only" but can remain in the codebase for historical reproducibility of v0.1–v0.3.
