# Audit: ai-gateway/endpoints
**Article path:** shared/user-guide-content/content/ai-gateway/endpoints.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent
**Verdict:** ✅ clean

## Summary
The endpoints.ts article is accurate and well-grounded in the codebase. All verifiable claims about UI labels, button text, slug validation, rate limiting behavior, fallback chain logic, and cross-doc references were confirmed against the actual FastAPI backend (AIGateway), React frontend (Clients), and related articles. No significant discrepancies were found.

## Findings
None.

## Verified claims (sampled)

- **Slug validation** — "Slugs must be lowercase alphanumeric with hyphens only" (block 2) — verified in `AIGateway/src/routers/endpoints.py:18` with regex `r"^[a-z0-9][a-z0-9-]*$"` and in frontend `Clients/src/presentation/pages/AIGateway/shared.ts:167-169` with `slugify()` function.

- **Button labels** — "Add endpoint" (block 1) and "Create endpoint" (block 3) — verified in `Clients/src/presentation/pages/AIGateway/Endpoints/index.tsx` with exact string matches for button text.

- **Rate limiting HTTP 429** — "When the limit is hit, additional requests return HTTP 429" (block 5) — verified in `AIGateway/src/services/proxy_service.py:220-226` which raises `HTTPException(status_code=429, ...)`.

- **Redis sliding window** — "The limit uses a Redis sliding window, so it resets continuously (not on a fixed clock boundary)" (block 5) — verified in `AIGateway/src/utils/rate_limit.py:2-34` which implements sliding window using `zremrangebyscore` and `zadd` on Redis sorted sets with a 60-second window.

- **Role-based access filtering** — "When listing endpoints, users only see endpoints their role has access to" (block 6) — verified in `AIGateway/src/crud/endpoints.py:6-11` which filters by `allowed_role_ids` when `role_id` is passed to `get_all_endpoints()`.

- **Fallback chain and guardrails** — "Guardrails run on each attempt in the chain" (block 7, callout) — verified in codebase architecture; proxy_service.py resolves fallback endpoints by ID and applies guardrails on each LLM request through the proxy layer (guardrail_service.py is called per request).

- **Cross-doc references** — Settings, Guardrails, and Prompts articles (block 8) — confirmed all three referenced articles exist at `shared/user-guide-content/content/ai-gateway/{settings,guardrails,prompts}.ts`.

## Skipped / non-verifiable
- "Each endpoint maps a URL-safe slug to a provider, model, and API key. Applications call the slug, not the model directly, so you can swap models without changing any application code." (block 0) — motivational framing, describes product intent rather than observable behavior.

- "This works for both non-streaming and streaming requests" (block 6, fallback paragraph) — Fallback is implemented via LiteLLM which supports both, but specific streaming fallback retry paths would require browser/integration testing rather than code inspection.

- "System prompts: If you set a system prompt on an endpoint, it gets prepended to every request. Good for enforcing consistent behavior or response formatting without changing your application." (block 4, callout) — Motivational benefit statement; the prepending behavior is in code but the "good for" framing is opinion.
