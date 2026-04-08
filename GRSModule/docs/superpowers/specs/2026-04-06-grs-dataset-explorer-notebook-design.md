# GRS Dataset Explorer Notebook — Design Spec

**Date:** 2026-04-06
**Status:** Approved
**Scope:** A Jupyter notebook for interactively exploring GRS v3.0 dataset pool statistics before running the sampling operation defined in `GRS_Sampling_Implementation_Plan.pdf`.

---

## Purpose

Before committing to the sampling procedure, the user needs to understand the composition, distribution, and quality of the combined scenario pool across three source datasets. This notebook provides that visibility in a single interactive document — no target comparisons, no deduplication, just honest distributions.

---

## Constraints & Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data source | 3 existing `final/scenarios.jsonl` files (one per dataset version) | Datasets already generated; each version = one model source |
| Source labeling | Config cell mapping `version` → model name | Version field exists in schema; model name is not stored in scenario data |
| GRS Dimension proxy | `governance_triggers` (6 binary flags) as-is | No `grs_dimension` field in schema; `governance_triggers` is the honest representation |
| Semantic deduplication | Skipped | Belongs in pipeline code, not exploratory notebook |
| Target vs actual | Actual distributions only | User judges fitness manually |
| Visualization | `matplotlib` + `seaborn` (static) | All charts are categorical/count-based; no interactivity needed |
| Obligation design | Obligations are intentionally partitioned across versions | Each obligation appears in exactly one source by design — per-source gap warnings would be false alarms |

---

## Architecture

Single `.ipynb` file. One DataFrame built at load time; all sections read from it. No re-loading between sections.

**File location:** `GRSModule/pre_sampling_analysis.ipynb`

**Dependencies:** `pandas`, `matplotlib`, `seaborn`, `pyyaml` — all expected to be available in the `uv` environment.

---

## Sections

### Section 1 — Config & Data Loading

A single user-editable config cell:

```python
DATASET_ROOT = "datasets"
SOURCE_MAP = {
    "grs_scenarios_v0.1": "GPT-5.2",
    "grs_scenarios_v0.2": "Gemini 2.5",
    "grs_scenarios_v0.3": "Claude Sonnet 4.6",
}
```

Loading cell reads each `final/scenarios.jsonl`, adds a `source` column derived from the `version` field via `SOURCE_MAP`, and concatenates into a single `pd.DataFrame`. Prints per-source row count as a sanity check.

---

### Section 2 — Dataset Inventory

A styled `pandas` DataFrame table (no chart). One row per source plus a Combined row. Columns:

| Column | Derivation |
|--------|-----------|
| Total Scenarios | Row count per source |
| Unique Obligations | Distinct values in `seed_trace.obligation_ids` flattened per source |
| Base Scenarios | Rows where `mutation_trace.mutations` is empty |
| Mutated Scenarios | Rows where `mutation_trace.mutations` is non-empty |
| Mutation Families Present | Distinct `family` values across all mutations in that source |

Directly fills the Pre-Sampling Checklist 2.1 from the sampling plan.

---

### Section 3 — Source Balance

A single horizontal bar chart: scenario count per source, one bar per source, colored by source.

Below the chart: one printed line per source showing count and percentage of combined pool.

---

### Section 4 — Scenario Type Distribution

A grouped bar chart: base vs mutated counts, one group per source, two bars per group.

Below the chart: a table with count and percentage breakdown per source.

- **Base**: `mutation_trace.mutations` is empty
- **Mutated**: `mutation_trace.mutations` is non-empty

Percentages are out of total scenarios per source.

---

### Section 5 — Mutation Family Distribution

A grouped bar chart: mutation family counts per source. One group per family, bars colored by source.

Below the chart: a table with counts and percentages **within mutated scenarios only** (base scenarios have no mutations). Families derived from `mutation_trace.mutations[].family`.

Known families in existing data: `authority_pressure`, `urgency_pressure`, `ambiguity_pressure`, `bypass_request`, `language_nuance`. Any additional families discovered at load time are included automatically.

---

### Section 6 — Obligation Coverage

**Part 1 — Obligation-to-source mapping table:**

Rows = obligation IDs, columns = source name, cell = scenario count. Since obligations are partitioned, each obligation appears in exactly one source column.

**Part 2 — Combined pool coverage check:**

Load `configs/obligations.yaml` to get the full list of seeded obligation IDs. Compare against combined pool. Flag any obligation from the config that appears in zero scenarios across all sources — these are blockers for Phase 1 of the sampling draw.

Expected output (partitioned design):
```
✓ N/N seeded obligations covered across combined pool
✓ Each obligation appears in exactly 1 source (partitioned design confirmed)
```

No per-source gap warnings — partitioned presence is correct by design.

---

### Section 7 — Governance Triggers Distribution

A heatmap: triggers as rows, sources as columns. Cell values = percentage of scenarios in that source where the trigger is `True`. Color scale: low → light, high → dark.

The 6 triggers: `authority_oversight`, `escalation`, `traceability_constraints`, `transparency_uncertainty`, `prohibited_practices`, `synthetic_disclosure`.

Below the heatmap: a table with absolute counts alongside percentages.

Note: `governance_triggers` is generated by the SemanticValidator (LLM judge) during the validate stage. These are not the GRS sampling plan's 5-dimension taxonomy — they are the honest structural representation of what is in the data.

---

### Section 8 — Pre-Sampling Readiness Summary

A final cell running automated checks from the DataFrame and printing a plain-text checklist. Checks include:

- All 3 sources loaded with data (non-empty)
- All seeded obligations from `configs/obligations.yaml` covered in combined pool
- Each obligation appears in exactly 1 source (partitioned design confirmed)
- All expected mutation families present in each source
- Source size imbalance flag (warn if any source deviates > 20% from mean)

Followed by pool totals (combined count, base %, mutated %).

Warnings are printed but non-blocking. The user decides whether to proceed with sampling.

---

## What This Notebook Does NOT Do

- No semantic deduplication (belongs in pipeline code)
- No target vs actual comparison (user judges distributions manually)
- No sampling execution (read-only exploration only)
- No model name inference from scenario content (source labeling is config-driven)
