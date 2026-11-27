# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Overview

GRSModule (Governance Readiness Score Module) is a Python pipeline that generates evaluation datasets to test LLM compliance with regulatory obligations (EU AI Act, ISO 42001). It produces adversarial governance scenarios, runs LLM inference, judges responses on a multi-dimensional rubric, and aggregates a compliance leaderboard.

---

## Setup & Installation

```bash
# Requires Python 3.12 (see .python-version)
uv sync                        # Install all dependencies
```

The package manager is `uv`. All commands run via `uv run`.

---


## Running the Pipeline

### Full pipeline (seeds → render → perturb → validate)
```bash
make all
```

### Individual stages
```bash
make seeds                     # Stage 1: Load & validate obligations
make render                    # Stage 2: Generate base scenarios (seed=42, 2 per obligation)
make perturb                   # Stage 3: Apply mutations (k=3, per_family coverage)
make validate                  # Stage 4: Filter & enrich scenarios
make infer-mock-client         # Stage 5: Mock inference (3 scenarios, for testing)
make infer-openrouter-gpt4     # Stage 5: Real inference via OpenRouter
make infer-multi-model         # Stage 5: Multi-model inference with resume
make judge                     # Stage 6: Judge responses (OpenRouter gpt-4o-mini, 5 scenarios)
make judge-resume              # Stage 6: Resume judging
make run-scenario-viewer       # Launch Streamlit UI
```

### CLI directly
```bash
uv run grs-scenarios generate --stage <stage> [options]
```

Key CLI options:
- `--stage`: `seeds|render|perturb|validate|infer|judge|leaderboard`
- `--seed 42`, `--per-obligation 2`, `--k-per-base 3`, `--coverage random|per_family`
- `--provider mock|openrouter`, `--model-id <id>`, `--temperature 0.2`, `--max-tokens 500`
- `--limit N`: cap number of scenarios for infer/judge smoke tests
- `--resume`: skip already-completed (scenario_id, model_id) pairs
- `--models-config configs/models.yaml`: run inference over multiple models
- `--dataset-version grs_scenarios_v0.1`, `--out-dir datasets`

---

## Testing

```bash
uv run pytest tests/
```

Pytest is a dev dependency (`pyproject.toml`, `[tool.pytest.ini_options]`, `testpaths = ["tests"]`). Tests live under `tests/`: pipeline and export checks, plus `render/`, `validate/`, `infer/`, `judge/`, `llm/`, and `ui/`.

---

## Architecture

### Pipeline Stages

```
seeds   → intermediate/behavioral_obligations.jsonl
render  → intermediate/base_scenarios_deduped.jsonl
perturb → intermediate/mutated_candidates.jsonl
validate→ final/scenarios.jsonl  +  intermediate/rejections.jsonl
infer   → final/candidate_responses.jsonl  (or final/responses/<model_id>.jsonl for multi-model)
judge   → final/judge_scores/<model_id>.jsonl
leaderboard → final/leaderboard.json + leaderboard.csv
```

Each stage also writes `final/manifest.json` and `final/sampling_report.json` (or stage-specific report) with SHA256 checksums for reproducibility.

### Source Layout

```
src/
├── cli.py              # Argparse entry point; all stage orchestration lives here
├── config.py           # YAML loading with Pydantic validation
├── models/             # Core Pydantic data models (Obligation, Scenario, CandidateResponse, JudgeScore, Mutation)
├── seeds/              # Stage 1: load + validate obligations from YAML
├── render/             # Stage 2: combinatorial scenario generation from templates + catalogs
├── perturb/            # Stage 3: apply adversarial mutations to base scenarios
├── validate/           # Stage 4: quality filtering, judgeability checks, enrichment with constraints
├── infer/              # Stage 5: LLM inference with resumable execution
├── judge/              # Stage 6: pair scenarios+responses, score with rubric via judge LLM
├── leaderboard/        # Stage 7: aggregate judge scores per model
├── llm/                # LLM client abstraction (base Protocol, MockChatClient, OpenRouterChatClient, retry)
├── io_utils/           # JSONL read/write/append, SHA256 checksums, manifest writing
└── reports/            # Per-stage report builders (seed, render, perturb, validate, infer, judge)
```

### Key Configuration Files

| File | Purpose |
|------|---------|
| `configs/obligations.yaml` | Regulatory MUST/MUST_NOT constraints with source refs |
| `configs/mutations.yaml` | Adversarial perturbation templates organized by family |
| `configs/judge_rubric.yaml` | 4 scoring dimensions with weights (boundary_management 30%, constraint_adherence 35%, clarity 15%, escalation 20%) |
| `configs/models.yaml` | LLM provider specs for multi-model inference |
| `configs/catalogs/*.yaml` | Domain vocabularies: roles, activities, org_contexts, industries, domains |
| `configs/templates/base_scenarios.yaml` | Prompt templates with placeholders for scenario rendering |

### LLM Client Abstraction

`src/llm/base.py` defines a `ChatClient` Protocol. Implementations:
- `MockChatClient` — deterministic, no API calls (use for testing)
- `OpenRouterChatClient` — real API calls (requires `OPENROUTER_API_KEY` env var)

Both implement `chat(messages) -> ChatResult`.

### Resumability

- Infer stage: `run_inference_resumable()` loads completed `(scenario_id, model_id)` pairs from existing output and skips them.
- Judge stage: `run_judging_resumable()` loads completed judgement keys and skips them.
- Pass `--resume` flag to activate.

---

## Conventions

- **One responsibility per module**: `seeds/load.py` loads, `seeds/export.py` exports — no mixing.
- **Pydantic** for all data models and config validation.
- **JSONL** as the interchange format between all stages.
- **Rich** for terminal output (progress bars, colored status).
- **Functional style**: prefer pure functions; classes only for config models and the LLM client.
- **Version strings** in all YAML configs and manifests for reproducibility tracing.

---

## Environment Variables

```bash
OPENROUTER_API_KEY=sk_...   # Required for OpenRouter inference/judging
```
