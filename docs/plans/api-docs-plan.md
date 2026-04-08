# API Documentation Plan

> Created: 2026-04-05

## Current state

- **557 endpoints** across 89 route files
- **Swagger (swagger.yaml)** documents ~85 paths covering only the original core (users, projects, risks, vendors, assessments, frameworks, files, roles, ISO/EU Act)
- **66 route groups** (approx. 450 endpoints) have zero documentation
- The existing Swagger docs also have stale paths (controlCategory, subcontrols, subtopics, projectScopes) that may no longer exist as standalone routes

## Approach

Auto-generate OpenAPI specs from the route files using a script that:
1. Reads each `*.route.ts` file
2. Extracts method, path, middleware (auth, roles)
3. Reads the corresponding controller to get request/response shapes
4. Outputs OpenAPI 3.0 YAML per route group
5. Merges into a single `swagger.yaml`

Manual review pass after generation to add descriptions and examples.

## Prioritization

### Tier 1: Public-facing & partner APIs (document first)
These are used by external developers or integrations.

| Route group | Endpoints | Why first |
|------------|-----------|-----------|
| ai-gateway (+ virtual keys, proxy) | ~20 | External devs use the OpenAI-compatible proxy |
| shadow-ai + ingestion | 27+3 | External SIEM/proxy integrations push data here |
| webhooks | 3 | External services call these |
| intake forms (public) | 23 | Public form submissions |
| shares | 6 | Public shared views |

### Tier 2: Core governance CRUD (document second)
These are the main app features.

| Route group | Endpoints | Notes |
|------------|-----------|-------|
| projects | 15 | Core entity |
| users | 16 | Auth, login, registration |
| datasets | 8 | + bulk upload (3) |
| model inventory | 7 | + history (3) |
| risks (project + vendor + model) | 7+7+6 | 3 risk types |
| vendors | 6 | |
| policies | 12 | + folders, linked objects |
| tasks | 10 | |
| incidents | 6 | |
| training | 5 | |
| organizations | 6 | |

### Tier 3: Compliance modules (document third)
These are feature-specific.

| Route group | Endpoints | Notes |
|------------|-----------|-------|
| fria | 16 | Assessments, rights, risk items, models, evidence, versions |
| ce-marking | ~4 | Classification, conformity, declaration, registration |
| post-market monitoring | 20 | Configs, cycles, questions, reports |
| eu-ai-act | 15 | Controls, assessments, compliance |
| iso-42001 | 22 | Clauses, annexes |
| iso-27001 | 20 | Clauses, annexes |
| nist-ai-rmf | 14 | |
| compliance | ~4 | Cross-framework progress |
| quantitative risks | 6 | FAIR model |
| risk benchmarks | ~4 | |

### Tier 4: Platform features (document fourth)
Supporting features.

| Route group | Endpoints | Notes |
|------------|-----------|-------|
| ai-detection | 20 | + repositories (8) |
| approval workflows + requests | 5+8 | |
| automations | 9 | |
| plugins | 10 | |
| notifications | 7 | |
| entity graph | 14 | |
| evidence hub | 5 | |
| file manager | 11 | |
| search | ~3 | |
| notes | 4 | |
| agent discovery | 13 | |
| ai trust centre | 15 | |

### Tier 5: Internal & admin (document last)
Low external visibility.

| Route group | Endpoints | Notes |
|------------|-----------|-------|
| super-admin | 8 | Internal admin |
| internal | ~3 | Python service callbacks |
| audit-ledger | ~3 | Internal logging |
| feature-settings | ~3 | Feature flags |
| logger | ~2 | |
| 12x change-history routes | ~24 | All follow same pattern |
| advisor | 5 | AI advisor |
| evaluationLlmApiKey | 5 | LLM eval keys |
| llm-keys | 6 | |
| deepeval | ~5 | Proxy to EvalServer |
| subscriptions, tiers, tokens | ~9 | Billing/auth tokens |
| slack webhooks | 6 | |
| github integration | 4 | |
| user-preferences | ~3 | |
| version | 1 | |
| reporting | 4 | |
| dashboard | ~3 | |

## Execution plan

### Phase 1: Build the generator script (1 session)
- Write a Node.js script that reads route files and outputs OpenAPI YAML
- Parse `router.get/post/put/patch/delete` calls
- Extract path params, middleware (auth requirements, role restrictions)
- Look up controller function to infer request body and response shape
- Output one YAML section per route group

### Phase 2: Generate Tier 1 + Tier 2 docs (1-2 sessions)
- Run generator on Tier 1 and 2 route files
- Manual review: add descriptions, example values, error responses
- Replace stale swagger.yaml with new generated version
- Verify `/api/docs` renders correctly

### Phase 3: Generate Tier 3 + 4 docs (1-2 sessions)
- Run generator on remaining route files
- Manual review pass
- Add to swagger.yaml

### Phase 4: Generate Tier 5 + cleanup (1 session)
- Document remaining internal routes
- Remove stale paths from old swagger
- Final review pass
- Add CI check to flag undocumented new routes

## Estimated scope

| Tier | Route groups | Endpoints | Effort |
|------|-------------|-----------|--------|
| 1 | 5 | ~75 | Medium |
| 2 | 11 | ~105 | Medium |
| 3 | 10 | ~125 | Medium |
| 4 | 12 | ~120 | Medium |
| 5 | 18 | ~130 | Low (repetitive patterns) |
| **Total** | **56** | **~557** | |

## Output

- Single `Servers/swagger.yaml` with all endpoints
- Accessible at `/api/docs` via swagger-ui
- Each endpoint documented with: method, path, description, auth requirements, request body schema, response schema, error codes
