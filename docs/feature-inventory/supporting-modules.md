# VerifyWise Supporting Modules

This document covers the standalone Python services and libraries that support the main VerifyWise platform: `AIGateway`, `EvalServer`, `EvaluationModule`, and `GRSModule`.

---

## AIGateway

**Location:** `C:\Workspace\verifywise\AIGateway`  
**Tech stack:** Python 3, FastAPI, SQLAlchemy 2.0 (async), asyncpg, Redis, Alembic, LiteLLM, Presidio, MCP SDK, OpenTelemetry  
**Default port:** `8100` (configured via `AI_GATEWAY_URL` in the main backend)

### Purpose
AIGateway is a multi-tenant LLM gateway that proxies, governs, and audits generative AI traffic for VerifyWise. It provides an OpenAI-compatible completion endpoint plus a management API for tenants.

### Key capabilities

| Capability | Description | Key files |
|---|---|---|
| **OpenAI-compatible proxy** | Route chat/completion requests to 50+ LLM providers via LiteLLM. | `src/routers/proxy.py`, `src/routers/completions.py`, `src/services/proxy_service.py`, `src/services/llm_service.py` |
| **Virtual keys** | Tenant-scoped API keys with budgets, rate limits, model ACLs, and metadata. | `src/routers/virtual_keys.py`, `src/crud/virtual_keys.py`, `src/utils/acl.py` |
| **Spend tracking** | Per-tenant cost aggregation, dashboards, budget alerts. | `src/routers/spend.py`, `src/crud/budget.py`, `src/services/cost_service.py` |
| **Guardrails** | PII detection/filtering (Presidio), prompt/response risk rules, content filtering. | `src/routers/guardrails.py`, `src/routers/guardrails_crud.py`, `src/services/guardrail_service.py`, `src/services/presidio_engine.py` |
| **Response cache** | Cached LLM responses to reduce cost/latency. | `src/routers/cache.py`, `src/crud/cache.py`, `src/services/cache_service.py` |
| **Prompt registry** | Versioned prompt templates (gated by `SHOW_AI_GATEWAY_PROMPTS` on frontend). | `src/routers/prompts.py`, `src/crud/prompts.py` |
| **Endpoints / models catalog** | Manage gateway endpoints and supported models. | `src/routers/endpoints.py`, `src/routers/models.py`, `src/crud/endpoints.py` |
| **MCP Gateway** | Model Context Protocol server registry, agent keys, tool catalog, runs, approvals, audit, guardrails. | `src/routers/mcp_*.py`, `src/services/mcp_*.py`, `src/crud/mcp_*.py` |
| **Risk & audit** | Risk scoring, change history, notifications. | `src/routers/risk.py`, `src/crud/risk.py`, `src/utils/change_history.py` |
| **API keys / tenant auth** | Gateway-level API key management and tenant isolation. | `src/routers/api_keys.py`, `src/middlewares/auth.py`, `src/middlewares/tenant.py` |

### Integration with main platform
- The main backend proxies AIGateway through `/api/ai-gateway/*` (`Servers/routes/aiGateway.route.ts`).
- Frontend AI Gateway pages (`/ai-gateway/*`) call the main backend proxy, which forwards to AIGateway.
- Health check: `/health` is verified by the main backend `/health` endpoint.

### How to run
```bash
cd AIGateway
# install dependencies (virtual environment recommended)
pip install -r requirements.txt
# run migrations
alembic upgrade head
# start server
uvicorn src.app:app --host 0.0.0.0 --port 8100
```

### Tests
- Look for `tests/` or `*_test.py` files under `AIGateway/`.
- VerifyWise-level integration is exercised indirectly through `Servers/tests/integration` and frontend E2E specs (`Clients/e2e/ai-gateway.spec.ts`).

---

## EvalServer

**Location:** `C:\Workspace\verifywise\EvalServer`  
**Tech stack:** Python 3, FastAPI, SQLAlchemy 2.0, asyncpg, Redis, Alembic, DeepEval, LiteLLM  
**Default port:** `8000`

### Purpose
EvalServer is a standalone LLM evaluation service used by the VerifyWise **LLM Evals** module. It runs DeepEval metrics, manages evaluation projects/datasets/models/scorers, and produces reports.

### Key capabilities

| Capability | Description | Key files |
|---|---|---|
| **Evaluation projects** | CRUD projects, org-scoped. | `src/controllers/deepeval_projects.py`, `src/routers/deepeval_projects.py`, `src/crud/deepeval_projects.py` |
| **Experiments / evaluations** | Run DeepEval metrics against models and datasets. | `src/controllers/deepeval.py`, `src/routers/deepeval.py`, `src/utils/run_evaluation.py` |
| **Datasets** | Dataset CRUD, upload, inline editor. | `src/crud/deepeval_datasets.py`, `src/routers/deepeval.py` |
| **Scorers / metrics** | Custom and built-in DeepEval scorers. | `src/crud/deepeval_scorers.py`, `src/utils/metric_constants.py`, `src/utils/run_custom_scorer.py` |
| **Models** | Provider model registry and endpoints. | `src/crud/deepeval_models.py`, `src/utils/gateway_litellm_client.py` |
| **LLM Arena** | Head-to-head model comparisons. | `src/controllers/deepeval_arena.py`, `src/routers/deepeval_arena.py`, `src/crud/deepeval_arena.py` |
| **Bias audits** | Bias/fairness audits with report templates (e.g., NYC LL144, CA SB169). | `src/controllers/bias_audits.py`, `src/engines/bias_audit/`, `src/routers/bias_audits.py` |
| **Reports** | Evaluation report generation and summarization. | `src/controllers/reports.py`, `src/routers/reports.py`, `src/utils/report_generator.py`, `src/utils/report_summarizer.py` |
| **Evaluation logs** | Execution logging and observability. | `src/controllers/evaluation_logs.py`, `src/models/evaluation_logs.py` |
| **Organizations / settings** | Org-level settings and API keys. | `src/controllers/deepeval_orgs.py`, `src/routers/deepeval_orgs.py` |

### Integration with main platform
- Main backend exposes `/api/deepeval/*` routes (`Servers/routes/deepEvalRoutes.route.ts`) that proxy to EvalServer.
- Frontend LLM Evals module (`/evals/*`) uses `EvalsDashboard` and related pages.
- EvalServer shares the same PostgreSQL/Redis infrastructure with the main backend and stores data in the `verifywise` shared schema.

### How to run
```bash
cd EvalServer
# install dependencies in a virtual environment
pip install -r requirements.txt
# run migrations
alembic upgrade head
# start server
uvicorn src.app:app --host 0.0.0.0 --port 8000
```

### Tests
- Python tests under `EvalServer/tests/` if present.
- Frontend coverage: `Clients/e2e/evals-dashboard.spec.ts`.

---

## EvaluationModule

**Location:** `C:\Workspace\verifywise\EvaluationModule`  
**Tech stack:** Python 3, DeepEval, YAML configuration  
**Relationship to EvalServer:** EvaluationModule is the standalone library/engine; EvalServer is the FastAPI service that wraps it.

### Purpose
A standalone LLM evaluation engine for running DeepEval metrics locally or in CI.

### Key capabilities
- LLM-as-a-Judge evaluation with DeepEval metrics:
  - Answer Relevancy
  - Bias
  - Toxicity
  - Faithfulness
  - Hallucination
- Multiple model providers: OpenAI, Anthropic, Gemini, xAI, Mistral, Ollama, HuggingFace.
- Built-in dataset with 11 curated prompts across 5 categories (Coding, Mathematics, Reasoning, Creative, Knowledge).

### Key files
- `src/deepeval_engine/` — core evaluation logic.
- `configs/deepeval_config.yaml` — evaluation configuration.
- `data/` — datasets.
- `artifacts/` — evaluation results.

### How to run
```bash
cd EvaluationModule
pip install -r requirements.txt
python main.py --config configs/deepeval_config.yaml
```

### Integration
- Used by EvalServer for the actual DeepEval execution.
- The frontend does not talk to EvaluationModule directly; it goes through EvalServer.

---

## GRSModule

**Location:** `C:\Workspace\verifywise\GRSModule`  
**Tech stack:** Python 3, uv, Pydantic, YAML  
**Purpose:** Governance Readiness Score scenario generator — creates evaluation datasets to test LLM compliance against regulatory obligations (EU AI Act, ISO 42001, internal policies).

### Pipeline stages

| Stage | Purpose | Command |
|---|---|---|
| 1. Seeds | Load and validate obligations from `configs/obligations.yaml`. | `make seeds` |
| 2. Render | Combine obligations + catalogs + templates to generate base scenarios. | `make render` |
| 3. Perturb | Apply mutations to create adversarial test cases. | `make perturb` |
| 4. Validate | Filter by quality, judgeability, tension, triggers. | `make validate` |
| 5. Infer | Run validated scenarios through LLM providers. | `make infer-mock-client` / `make infer-openrouter-gpt4` |
| 6. Judge | Score responses against obligations. | (part of pipeline) |
| 7. Leaderboard | Compare model readiness scores. | (part of pipeline) |

### Key files
- `src/seeds/`, `src/render/`, `src/perturb/`, `src/validate/`, `src/infer/` — pipeline stages.
- `src/models/` — Pydantic schemas for obligations, mutations, candidate responses.
- `src/llm/` — `ChatClient` protocol, mock client, OpenRouter client.
- `configs/obligations.yaml`, `configs/catalogs/`, `configs/mutations.yaml`, `configs/templates/` — configuration.

### How to run
```bash
cd GRSModule
uv sync
make all
```

### Integration
- GRSModule is currently a standalone research/CLI tool.
- It does not expose a web API to the main platform, but generated scenario datasets can be consumed by EvaluationModule/EvalServer or imported into the LLM Evals module.

---

## Summary table

| Module | Type | Port | Frontend route | Main backend proxy | Primary user |
|---|---|---|---|---|---|
| AIGateway | FastAPI service | 8100 | `/ai-gateway/*` | `/api/ai-gateway/*` | AI/LLM admins |
| EvalServer | FastAPI service | 8000 | `/evals/*` | `/api/deepeval/*` | ML engineers, compliance teams |
| EvaluationModule | Python library/CLI | — | — | — | Data scientists, CI pipelines |
| GRSModule | Python CLI pipeline | — | — | — | Governance/compliance researchers |
