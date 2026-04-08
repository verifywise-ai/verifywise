# AIGateway — LLM Gateway Service

> **Last Updated:** 2026-03-24

---

## Overview

FastAPI service that proxies LLM requests through governance controls. Accepts OpenAI-compatible API requests, applies guardrails, enforces budgets, and routes to 100+ providers via LiteLLM.

Port: **8100**

---

## Architecture

```
Express Backend (proxy)  →  FastAPI (AIGateway)
                              ├─ Auth (virtual key validation)
                              ├─ Pre-request guardrails (PII, content filter)
                              ├─ LiteLLM → LLM Provider
                              ├─ Post-response guardrails
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

Tables use `verifywise` schema with `search_path`. All `ai_gateway_*` tables: endpoints, api_keys, virtual_keys, guardrail_rules, guardrail_logs, logs, cache, spend, budgets, risk_suggestions.

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

Express backend at `Servers/routes/aiGateway.route.ts` proxies `/api/ai-gateway/*` to `http://ai_gateway:8100/` with JWT auth forwarding (`x-organization-id`, `x-user-id`, `x-role` headers).

---

## References

| When working on... | Read this file |
|---------------------|---------------|
| AI Advisor | `docs/technical/infrastructure/ai-advisor.md` |
| Integrations (Slack, GitHub) | `docs/technical/infrastructure/integrations.md` |

> All `docs/` paths are relative to the repository root.
