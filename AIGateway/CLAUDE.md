# AIGateway — LLM Gateway Service

> **Last Updated:** 2026-10-08

---

## Overview

FastAPI service that proxies LLM requests through governance controls. Accepts OpenAI-compatible API requests, applies guardrails, enforces budgets, and routes to providers via LiteLLM. Provider API keys can be stored for the providers in `VALID_PROVIDERS` (`src/routers/api_keys.py`); keep that set in sync with `API_KEY_PROVIDERS` in `Clients/src/presentation/pages/AIGateway/shared.ts`.

Port: **8100**

---

## Architecture

```
Express Backend (proxy)  →  FastAPI (AIGateway)
                              ├─ Auth (virtual key validation)
                              ├─ Pre-request guardrails (PII, content filter; user messages only)
                              ├─ LiteLLM → LLM Provider (fallback chain, max depth 3, non-streaming /v1 only)
                              │   Model responses are NOT scanned by guardrails.
                              ├─ Cost calculation + spend logging
                              └─ Risk condition evaluation (daily)
```

---

## Key Files

| Purpose | Path |
|---------|------|
| Entry point | `src/app.py` |
| Routers | `src/routers/` (completions, endpoints, guardrails, models, prompts, virtual_keys, spend, cache, budget, risk) |
| Services | `src/services/` (proxy, guardrail, cache, cost, llm, risk_conditions) |
| CRUD | `src/crud/` |
| DB config | `src/database/config.py` |
| Alembic migrations | `src/database/migrations/` |

---

## Migrations (Alembic)

```bash
cd src
alembic upgrade head          # Run migrations
alembic downgrade -1          # Rollback last
```

Tables use `verifywise` schema with `search_path`. Main `ai_gateway_*` tables: endpoints, api_keys, virtual_keys, guardrails, guardrail_logs, guardrail_settings, spend_logs, cache, budgets, risk_settings, risk_suggestions, plus change-history, prompt and `mcp_*` (Agent Control) tables. See `src/database/migrations/versions/` for the full list.

---

## Environment

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=...
DB_PASSWORD=...
DB_NAME=verifywise
AI_GATEWAY_INTERNAL_KEY=...    # Must match Express backend
AI_GATEWAY_PORT=8100
```

---

## Commands

```bash
source venv/bin/activate
cd src && uvicorn app:app --host 0.0.0.0 --port 8100 --reload   # Development
```

---

## Express Proxy

Express backend at `Servers/routes/aiGateway.route.ts` proxies `/api/ai-gateway/*` to `/internal/*` on the gateway (`http://ai_gateway:8100`) with JWT auth forwarding (`x-organization-id`, `x-user-id`, `x-role` headers). `Servers/routes/virtualKeyProxy.route.ts` passes `/v1/*` through unchanged; virtual-key auth happens in the gateway.

---

## References

| When working on... | Read this file |
|---------------------|---------------|
| Agent Control (native tool-call hook, file-write gating, approval, result capture, run correlation) | `docs/technical/domains/agent-control.md` |
| Agent Control developer/integrator guide (connect any agent: Claude Code, Cursor, generic) | `shared/user-guide-content/content/developers/` |
| AI Advisor | `docs/technical/infrastructure/ai-advisor.md` |
| Integrations (Slack, GitHub) | `docs/technical/infrastructure/integrations.md` |

> All `docs/` paths are relative to the repository root.
