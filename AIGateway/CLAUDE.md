# AIGateway — LLM Gateway Service

> **Last Updated:** 2026-10-26

---

## Overview

FastAPI service that proxies LLM requests through governance controls. Accepts OpenAI-compatible API requests, applies guardrails, enforces budgets, and routes to providers via LiteLLM. Provider API keys can be stored for the providers in `VALID_PROVIDERS` (`src/routers/api_keys.py`); keep that set in sync with `API_KEY_PROVIDERS` in `Clients/src/presentation/pages/AIGateway/shared.ts`.

Port: **8100**

---

## Architecture

```
Express Backend (proxy)  →  FastAPI (AIGateway)
                              ├─ Invalid unicode check (middleware, before auth)
                              ├─ Auth (virtual key validation)
                              ├─ Pre-request guardrails (PII, content filter; user messages and tool results)
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
| Invalid unicode check | `src/middlewares/invalid_unicode.py`: any POST/PUT/PATCH/DELETE body except known binary types (`_BINARY_MEDIA_PREFIXES`: multipart, octet-stream, archives, pdf, protobuf, grpc (incl. grpc-web+json, which is framed), msgpack, cbor, image/audio/video/font) that does not decode, or is JSON with a lone `\uD800`–`\uDFFF` escape gets 400 `{"detail": "Request contains an invalid character"}` (on `/v1/mcp`: a JSON-RPC -32700 error with HTTP 200), instead of a 500 later |
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

A new column that references `users(id)` needs `ON DELETE SET NULL`: the backend's user deletion does not clear gateway tables, so a bare reference blocks deleting that user (`a0016` fixed the existing ones; `tests/test_config_change_notifications.py` fails on a new bare one).

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
GUARDRAILS_PRELOAD_PII=true    # Load Presidio + spaCy en_core_web_md in the background at startup (skipped if the model is not installed)
```

Guardrail scans (regex, keyword, Presidio PII) run on one dedicated thread
(`guardrail_service.get_scan_executor()`), not on the event loop. Async code
must call `scan_text_async`, not `scan_text`. Known exceptions still on the
loop: MCP prompt-injection regex (`mcp_guardrail_service._check_prompt_injection`)
and require_approval matching (`mcp_approval_match`). Presidio uses its default
NLP config with the model swapped to `en_core_web_md`
(`presidio_engine.SPACY_MODEL`), installed from a pinned wheel in
`requirements.txt`. `presidio-analyzer` and `presidio-anonymizer` are pinned
exactly; bump them deliberately and re-check `nlp_configuration()`.

---

## Commands

```bash
source venv/bin/activate
cd src && uvicorn app:app --host 0.0.0.0 --port 8100 --reload   # Development
```

---

## Express Proxy

Express backend at `Servers/routes/aiGateway.route.ts` proxies `/api/ai-gateway/*` to `/internal/*` on the gateway (`http://ai_gateway:8100`) with JWT auth forwarding (`x-organization-id`, `x-user-id`, `x-role` headers). `Servers/routes/virtualKeyProxy.route.ts` forwards `/v1/*` to the gateway's `/v1/*`; virtual-key auth happens in the gateway. It is mounted at `/v1`, so it puts the prefix back with `pathRewrite`. `app.ts` skips the JSON body parser for `/v1/` so the raw body reaches the gateway (`fixRequestBody` stays as a guard if a parser ever runs first), and mounts the route before the global per-IP limiter with its own `virtualKeyProxyLimiter` (3000/min per IP; per-key RPM and budget are enforced by the gateway). Deployments must route `/v1/` to the backend (Ansible nginx template, `Clients/nginx.conf`, both Kubernetes ingresses) with buffering off for streamed responses.

Endpoint models are stored as `<provider>/<model>` with the prefix once. LiteLLM lists many models with the prefix already, so the endpoint form and `utils/endpoint_model.normalize_endpoint_model` (applied on create and update) never add it twice.

---

## Admin notifications

Config changes reach the Express backend through `utils/notifications.py`. Build the event with `config_event(entity, action, name, entity_id, detail)` and pass it to `notify_config_change(org_id, user_id, event)`, which sends it in the background so the admin request does not wait for the backend's emails; add a new entity to `_CONFIG_ENTITIES` (label, frontend path, button label). Every change is an in-app notice; only the (entity, action) pairs in `_EMAIL_EVENTS` (keys revoked or deleted, monitor only switched, API keys and MCP servers added or removed, guardrails deleted or disabled) also email admins. The backend reads only these camelCase fields, and a test fails on any router call that builds the event another way.

---

## CI test classification

`.github/workflows/aigateway-checks.yml` runs only the self-contained suites below (`pytest tests/unit tests/test_cache_service.py tests/test_cost_service.py ...`). Everything else under `tests/` is E2E and needs a live Express backend (`:3000`), gateway (`:8100`), Postgres, and Redis (see `tests/conftest.py` — it errors out without `VW_PASSWORD`). Verified 2026-10-20 with `AIGateway/venv`.

**Self-contained (CI):**
- `tests/unit/` — unit suite: cost/guardrail/cache/proxy services, rate limiter, LiteLLM error mapping. DB = FakeSession, Redis = in-memory fake, LiteLLM = monkeypatched.
- `tests/test_cache_service.py`, `tests/test_cost_service.py` — pure-function unit tests.
- `tests/test_proxy_tool_calling.py`, `tests/test_virtual_key_endpoint_names.py`, `tests/test_endpoint_delete_keeps_key_limits.py`, `tests/test_guardrail_test_route.py`, `tests/test_guardrail_logs_route.py`, `tests/test_guardrail_scan_offload.py`, `tests/test_spend_by_day_sql.py`, `tests/test_model_catalog_contract.py`, `tests/test_agent_policy_scope.py`, `tests/test_retention.py`, `tests/test_agent_control_retention.py`, `tests/test_internal_key.py`, `tests/test_18_mcp_credentials.py`, `tests/test_19_mcp_discovery.py`, `tests/test_20_mcp_servers_router.py`, `tests/test_21_safe_outbound_url.py`, `tests/test_22_monitor_mode.py`, `tests/test_mcp_hook_tool_acls.py`, `tests/test_mcp_hook_result_outcome.py`, `tests/test_mcp_hook_request_validation.py`, `tests/test_config_change_notifications.py`, `tests/test_endpoint_role_visibility.py`, `tests/test_invalid_unicode_body.py` — mocked router/service tests (no live services).

**Needs live services (not in CI):**
- `tests/test_01_api_keys.py` … `tests/test_17_mcp_runs.py` — numbered E2E suites; hit the real backend/gateway over httpx.
- `tests/e2e_mock_agentic_system.py` — not collected by pytest (`testpaths`/naming); standalone script needing a branch gateway + real LLM key.

---

## References

| When working on... | Read this file |
|---------------------|---------------|
| Agent Control (native tool-call hook, file-write gating, approval, result capture, run correlation) | `docs/technical/domains/agent-control.md` |
| Agent Control developer/integrator guide (connect any agent: Claude Code, Cursor, generic) | `shared/user-guide-content/content/developers/` |
| AI Advisor | `docs/technical/infrastructure/ai-advisor.md` |
| Integrations (Slack, GitHub) | `docs/technical/infrastructure/integrations.md` |

> All `docs/` paths are relative to the repository root.
