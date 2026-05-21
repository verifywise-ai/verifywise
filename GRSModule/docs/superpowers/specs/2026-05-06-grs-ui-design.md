# GRS Module UI — Design Spec

**Date:** 2026-05-06
**Last Updated:** 2026-05-07
**Status:** Approved

---

## Overview

A standalone web UI for the GRS Module that replaces direct CLI and config-file usage. Primary audience: the developer/researcher running the pipeline, with secondary audience of ML teammates. Designed to be easily extracted and integrated into the VerifyWise frontend in the future.

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Deployment model | Standalone now, extractable later | Not integrated into VerifyWise yet; components must be portable |
| Primary workflow | Full pipeline runs | Configure → Run → Monitor → Results is the dominant path |
| Config editing | YAML-based (Monaco editor) | Reproducibility requirement; technical users comfortable with YAML |
| Config placement | Hybrid — run params inline, YAML in Configs section | Stage pages stay lean; one place for all YAML editing |
| Progress monitoring | Counts polled from JSONL output files | Infer and judge write output incrementally; no log streaming needed |
| Results in UI | Leaderboard + high-level stats only | Deep inspection stays in existing Streamlit viewer |
| Stage execution | Chained subprocesses, one per stage | CLI only accepts a single `--stage`; backend controls the loop for stage-level visibility |
| Run state | In-memory only | Single-user local tool; server restart = idle; user resumes with `--resume` |
| `run_config.yaml` | Source of truth for all run param defaults | Full write-back on every run; UI and CLI share state |
| Leaderboard stage | Auto-run after judge, not user-visible | Aggregation step; shouldn't require explicit user action |
| API key validation | 400 before subprocess spawn | Fail fast with clear message; skip check when `provider=mock` |
| Polling | Conditional — only while run is active | Zero idle requests; `refetchInterval` gated on `state === "running"` |

---

## Pre-implementation Cleanup

- **Delete `configs/generator.yaml`** — confirmed duplicate of `configs/run_config.yaml`
- **Add `fastapi` and `uvicorn[standard]`** to `pyproject.toml` — shared environment, one `uv sync`

---

## Architecture

### Two-process development, single-process production

**Development:**
```
npm run dev      → Vite HMR at localhost:5173 (proxies /api → localhost:8200)
uvicorn app:app  → FastAPI at localhost:8200
```

**Production:**
```
npm run build    → React bundle compiled into ui/backend/static/
uvicorn app:app  → FastAPI serves both API + static files at localhost:8200
```

### GRS_ROOT detection

`app.py` lives at `ui/backend/app.py`. The GRSModule root is derived at startup:

```python
GRS_ROOT = Path(__file__).parent.parent.parent  # ui/backend/app.py → GRSModule/
```

All subprocess calls use `cwd=GRS_ROOT`. All file paths resolve relative to `GRS_ROOT`.

### Stage execution model

The CLI accepts a single `--stage` at a time. For a full or multi-stage run, `runner.py` loops through the requested stages, spawning one subprocess per stage sequentially:

```
runner.py: for stage in requested_stages:
    spawn subprocess → uv run grs-scenarios generate --stage <stage> [params]
    wait for exit
    advance current_stage / detect failure
```

After `judge` completes successfully, `runner.py` automatically spawns one additional subprocess for `--stage leaderboard`. This is invisible to the user.

### Directory layout

```
GRSModule/
  ui/
    backend/           ← FastAPI application
      app.py           ← entry point, mounts router + static files
      routers/
        configs.py     ← GET/PUT config YAML files
        runs.py        ← POST run, GET status, GET history
        progress.py    ← GET progress counts per stage
        results.py     ← GET leaderboard, GET summary
        datasets.py    ← GET dataset version listing
      services/
        runner.py      ← subprocess wrapper; chains stages; holds in-memory run state
        watcher.py     ← JSONL file polling for progress counts (newline counting)
        snapshot.py    ← config snapshot writer at run start
      static/          ← compiled React build (gitignored)
    frontend/          ← React + TypeScript application
      src/
        pages/
          Overview.tsx
          StagePage.tsx       ← shared by all 6 stage nav items
          ConfigEditor.tsx    ← shared by all config nav items
          Leaderboard.tsx
          RunHistory.tsx
        components/
          Sidebar.tsx
          PipelineStatusFlow.tsx
          ModelProgressBar.tsx
          StageParamForm.tsx
          YamlEditor.tsx      ← Monaco wrapper
        context/
          ConfigContext.tsx   ← app-level dirty-config tracking (Set<string>)
        api/                  ← React Query hooks (useProgress, useRun, useConfig…)
      vite.config.ts          ← proxy /api → localhost:8200
  src/                 ← existing pipeline code (untouched)
  configs/             ← YAML files (read/written by backend)
```

---

## Backend API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/datasets` | List dataset versions (subdirs of `datasets/`) sorted by mtime descending |
| `GET` | `/api/configs/{name}` | Read a config YAML file as string |
| `PUT` | `/api/configs/{name}` | Write a config YAML file |
| `POST` | `/api/run` | Start a pipeline run (full or single stage) |
| `DELETE` | `/api/run` | Stop the current run (SIGTERM to current stage subprocess) |
| `GET` | `/api/run/status` | Current run state + active stage + error (if failed) |
| `GET` | `/api/progress/{stage}` | Completed + total + failure counts from output JSONL files |
| `GET` | `/api/results/leaderboard` | Parsed `final/leaderboard.json` for a dataset version |
| `GET` | `/api/results/summary` | Per-stage output counts for a dataset version |
| `GET` | `/api/runs` | Run history from config snapshot directories |

### Config file allowlist

The `configs` router uses an explicit allowlist — unknown names return 404:

```python
CONFIG_FILES = {
    "obligations":  "configs/obligations.yaml",
    "mutations":    "configs/mutations.yaml",
    "judge_rubric": "configs/judge_rubric.yaml",
    "models":       "configs/models.yaml",
    "templates":    "configs/templates/base_scenarios.yaml",
    "run_config":   "configs/run_config.yaml",
}
```

### Run request body

```json
{
  "dataset_version": "grs_scenarios_v0.1",
  "stages": ["seeds", "render", "perturb", "validate", "infer", "judge"],
  "params": {
    "seed": 42,
    "per_obligation": 2,
    "k_per_base": 3,
    "coverage": "per_family",
    "provider": "openrouter",
    "validator_model_id": "openai/gpt-4o-mini",
    "temperature": 0.2,
    "max_tokens": 500,
    "infer_provider": "openrouter",
    "limit": null,
    "resume": true,
    "judge_temperature": 0.0
  }
}
```

### API key validation

Before spawning any subprocess for `infer`, `judge`, or `validate` (when `provider=openrouter`), `runner.py` checks `os.environ.get("OPENROUTER_API_KEY")`. If missing, `POST /api/run` returns HTTP 400 with a clear error message. Check is skipped when `provider=mock`.

### Run state (`GET /api/run/status` response shape)

```json
{
  "state": "idle | running | done | failed",
  "active_stage": "seeds | render | ... | null",
  "started_at": "<ISO timestamp> | null",
  "completed_at": "<ISO timestamp> | null",
  "error": "<stderr text> | null"
}
```

**Config snapshot:** At run start, `snapshot.py` copies all active YAML files + the run request body into `datasets/<version>/configs_snapshot/run_<ISO_timestamp>/`. At run completion (success or failure), `runner.py` writes `run_result.json` into the same directory:

```json
{ "status": "done | failed", "completed_at": "<ISO>", "error_message": null }
```

---

## Frontend

### Tech stack

- **React 19 + TypeScript** — matches VerifyWise frontend
- **Vite** — dev server with HMR and /api proxy
- **Monaco Editor** (`@monaco-editor/react`) — YAML editing with syntax highlighting
- **React Query (`@tanstack/react-query`)** — API calls and conditional progress polling
- **React Router v6** — client-side routing for sidebar navigation
- **No Redux** — component state + React Query + one React context is sufficient

### Polling behaviour

React Query polls `/api/run/status` and `/api/progress/:stage` only while a run is active:

```ts
refetchInterval: (data) => data?.state === "running" ? 2000 : false
```

Zero background requests when idle.

### Sidebar navigation

```
PIPELINE
  /              → Overview
  /stage/seeds
  /stage/render
  /stage/perturb
  /stage/validate
  /stage/infer
  /stage/judge

CONFIGS
  /config/obligations
  /config/mutations
  /config/judge_rubric
  /config/models
  /config/templates
  /config/run_config

RESULTS
  /results/leaderboard
  /results/history
```

Config nav items show an unsaved-changes indicator driven by `ConfigContext` (app-level `Set<string>` of dirty config names). Survives navigation between pages.

---

## Key Pages

### Overview (`/`)

- **Dataset version** combo input — type a new name or select from `GET /api/datasets` (sorted by recency). Defaults to most recent.
- **Stage toggles** — click to include/exclude stages from the run. All 6 stages on by default.
- **Run Full Pipeline** button → POST `/api/run`. Writes submitted params back to `run_config.yaml` before spawning.
- **Pipeline status flow** — horizontal chain of stage chips: `pending → running (animated) → done / failed`. Stages 1–5 show spinner only (binary). Infer and judge show progress counts.
- **Error detail** — when a stage chip turns failed, a collapsible panel below it shows the captured stderr.
- **Stats row** — 4 cards: Scenarios · Responses · Scores · Elapsed time
- Stats and pipeline status poll `/api/run/status` every 2s **only while a run is active**.

Run params on the Overview form pre-populate from `run_config.yaml` on mount (`GET /api/configs/run_config`).

### Stage Page (`/stage/:stage`)

Shared component parameterised by stage name. Content adapts via a `STAGE_PARAMS` config object:

| Stage | Params |
|-------|--------|
| seeds | _(none)_ |
| render | `seed`, `per_obligation` |
| perturb | `k_per_base`, `coverage` (random\|per_family) |
| validate | `provider` (mock\|openrouter), `validator_model_id` (shown when openrouter) |
| infer | `provider` (mock\|openrouter), `temperature`, `max_tokens`, `limit`, `resume` |
| judge | `judge_temperature`, `limit`, `resume` |

Each stage page also shows:
- **Quick-link** to relevant config file(s)
- **Run this stage** button → POST `/api/run` with `stages: [stage]`
- **Stop** button (visible while running) → DELETE `/api/run`
- **Progress** (infer + judge only) — per-model progress bars with failure badge (shown only when `failures > 0`)
- **Last run status** badge (success / failed / never run)
- **Error detail** — collapsible stderr panel on failure

Stage → relevant config mappings:
| Stage | Config link |
|-------|------------|
| seeds | obligations |
| render | obligations, templates |
| perturb | mutations |
| validate | obligations |
| infer | models |
| judge | judge_rubric, models |

### Config Editor (`/config/:name`)

- **Monaco editor** with YAML language mode, dark theme
- **File path** label (e.g. `configs/obligations.yaml`)
- **Used by** label listing pipeline stages that read this file
- **Save** button → PUT `/api/configs/:name`; clears dirty state in `ConfigContext`
- **Reset** button → reloads from disk (discards unsaved edits); clears dirty state
- Edits immediately set the config name in `ConfigContext` dirty set; sidebar nav item shows indicator

### Leaderboard (`/results/leaderboard`)

- Table: model ID · overall GRS score (0–100) · per-dimension scores
- **Columns are dynamic** — driven by the `dimensions` array in `leaderboard.json` (currently 5: `accountability_transparency`, `boundary_management`, `clarity_and_questions`, `constraint_adherence`, `escalation_and_controls`)
- Dataset version selector (combo input, same as Overview)
- Link to open Streamlit viewer at `http://localhost:8501` for deep scenario inspection

### Run History (`/results/history`)

- List of past runs reconstructed by scanning `datasets/*/configs_snapshot/run_*/`:
  - `run_config.json` → timestamp (from dir name), stages run, dataset version, params
  - `run_result.json` (sibling) → status (done/failed) and error message if any
  - Runs without a `run_result.json` are shown as "interrupted"
- Expand a run to see the full config snapshot used

---

## Progress Monitoring

Infer and judge write output incrementally to JSONL files. Progress is derived by counting newlines (not parsing JSON — robust to truncated last lines):

| Stage | Total | Completed |
|-------|-------|-----------|
| infer | `scenarios.jsonl` line count × model count | lines in each `responses/<model>.jsonl` + lines in `responses/<model>.jsonl.failures.jsonl` |
| judge | same total | lines in each `judge_scores/<model>.jsonl` + lines in `judge_scores/<model>.jsonl.failures.jsonl` |

`watcher.py` returns per-model counts: `{completed, total, failures}`. The frontend shows a progress bar for each model. A failure badge (e.g. "3 failures") appears only when `failures > 0`.

`watcher.py` reads counts on each `/api/progress/:stage` call — no file watchers, polling is sufficient.

---

## Summary Endpoint

`GET /api/results/summary` returns per-stage output counts for a given dataset version:

```json
{
  "scenarios": 50,
  "responses": 750,
  "scores": 750,
  "models_inferred": 15,
  "models_scored": 15
}
```

Missing output files return `null` (stage not yet run), not `0` (stage ran with no output). The frontend renders `null` as `—` in the stats row.

---

## Config Snapshot

On every run start, `snapshot.py` writes:

```
datasets/<version>/configs_snapshot/run_<ISO_timestamp>/
  obligations.yaml
  mutations.yaml
  judge_rubric.yaml
  models.yaml
  run_config.yaml
  templates/
    base_scenarios.yaml
  catalogs/          (all catalog files)
  run_config.json    (the exact POST /api/run body)
```

At run completion, `runner.py` writes `run_result.json` into the same directory.

---

## Makefile Integration

```makefile
ui-install:
    uv sync && cd ui/frontend && npm install

ui-dev:
    # Start FastAPI backend and Vite frontend in parallel
    uvicorn ui.backend.app:app --port 8200 & cd ui/frontend && npm run dev

ui-build:
    cd ui/frontend && npm run build
```

---

## VerifyWise Integration Path

When this UI is eventually integrated into VerifyWise:

1. **Frontend**: The React components in `ui/frontend/src/` are moved into the VerifyWise `Clients/` app as a new page/route. No rewrite needed — same React + TypeScript stack.
2. **Backend**: The FastAPI routes in `ui/backend/routers/` are ported to Express controllers in the VerifyWise `Servers/` app, or the FastAPI service is kept as a microservice behind the VerifyWise API gateway.
3. **Config files**: The YAML configs stay in `GRSModule/configs/` and the backend resolves paths relative to the GRSModule root.

---

## Out of Scope

- Real-time log streaming (progress counts are sufficient)
- Editing catalog YAML files (roles, domains, industries — rarely changed)
- Deep scenario / response inspection (stays in Streamlit)
- User authentication (single-user local tool)
- Multi-user / concurrent run support
