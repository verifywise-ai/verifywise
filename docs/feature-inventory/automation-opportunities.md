# VerifyWise Automation Opportunities

**Scope:** Frontend React/TypeScript app (`Clients/`) and Node/Express backend (`Servers/`).
**Sources:**
- `docs/feature-inventory/frontend-features.md`
- `docs/feature-inventory/backend-features.md`
- `Clients/e2e/*.spec.ts` (42 Playwright specs)
- `Clients/src/**/*.test.tsx` (472 component/unit tests)
- `docs/user-guide-audit/_summary.md`

---

## 1. Methodology

A feature was classified as **covered by E2E** when `frontend-features.md` listed a `Clients/e2e/*.spec.ts` file for it. A feature was classified as **covered by backend tests** when `backend-features.md` listed a controller/integration/isolation test for the matching API domain, or when a matching `*.ctrl.test.ts` / `*.isolation.test.ts` existed. **Component tests** were taken from the per-page "Unit tests" column and verified against the `Clients/src/**/*.test.tsx` inventory.

A feature was marked **likely manual only** when it had **no E2E spec and no backend test** (component tests alone do not validate end-to-end behavior, auth boundaries, or data persistence).

Priority was driven by business criticality: auth/public surfaces, tenant isolation, EU AI Act/compliance workflows, and customer-facing intake/sharing features.

---

## 2. Coverage Summary

| Category | Total features | Features with E2E tests | Features with backend tests | Likely manual only |
|---|---:|---:|---:|---:|
| Authentication | 4 | 3 | 3 | 1 |
| Core (Dashboard / Tasks / Settings / Extensions) | 5 | 5 | 3 | 0 |
| Project / Use cases | 2 | 2 | 2 | 0 |
| Inventory (Models / AI apps / Datasets / Agent discovery) | 4 | 4 | 3 | 0 |
| Assurance (Risk / Training / Evidence / Reporting / Trust Center) | 5 | 5 | 4 | 0 |
| Governance (Vendors / Policies / Incidents / Frameworks / Event tracker) | 5 | 5 | 3 | 0 |
| AI Product (AI audit / Observability / Approvals / Automations / PMM / Intake) | 6 | 4 | 4 | 1 |
| LLM Evals | 1 | 1 | 0 | 0 |
| AI Detection (scan / repos / history / details / settings) | 5 | 5 | 0 | 0 |
| Shadow AI | 5 | 5 | 1 | 0 |
| AI Gateway (non-MCP) | 9 | 9 | 0 | 0 |
| AI Gateway — Agent Control (MCP) | 7 | 7 | 0 | 0 |
| AI Trust Index | 4 | 1 | 1 | 3 |
| Super Admin | 3 | 3 | 0 | 0 |
| Public pages (Trust Centre / Shared views / Intake) | 3 | 2 | 1 | 1 |
| Cross-cutting (Command palette / Navigation / Notifications / Onboarding / etc.) | 6 | 6 | 0 | 0 |
| **Totals** | **74** | **67** | **35** | **6** |

> *Note:* "Likely manual only" means no E2E **and** no backend automated coverage. Several AI Gateway and AI Detection pages have E2E but lack backend API tests; they are not counted as manual only but are still gaps (see Medium-priority candidates).

---

## 3. High-Priority Automation Candidates

These features are security, compliance, or tenant-isolation critical and currently rely primarily on manual verification.

### 3.1 Microsoft Entra ID SSO

| Attribute | Value |
|---|---|
| **Feature / route** | Microsoft SSO login & settings — `/login`, `/auth/microsoft/callback`, `/settings/:tab` (SSO tab) |
| **Why it matters** | Authentication boundary. Misconfiguration or callback regression locks out enterprise customers. Gated by `ssoFeatureEnabled`. |
| **Current coverage** | `Login.test.tsx`, `MicrosoftSignIn.test.tsx`; `auth.spec.ts` covers email/password only. No E2E for SSO flow. Backend `ssoConfig.route.ts` has no dedicated test in `backend-features.md`. |
| **Suggested approach** | API contract tests for `/api/ssoConfig/*`; Playwright E2E with mocked OIDC/Microsoft callback; visual regression for SSO button/tab state. |
| **Effort** | Medium |
| **Dependencies** | Test Entra ID tenant or OIDC mock; feature flag enabled in test env. |

### 3.2 AI Audit Dashboard

| Attribute | Value |
|---|---|
| **Feature / route** | AI audit dashboard — `/ai-audit` |
| **Why it matters** | EU AI Act Article 12 requires a complete, retrievable audit trail of AI actions. Hidden behind `SHOW_AI_AGENT_DASHBOARD_TABS=false`. |
| **Current coverage** | No E2E spec. Backend `/api/ai-audit` has no controller/integration test listed. No component test listed in `frontend-features.md`. |
| **Suggested approach** | API tests for `/api/ai-audit/log`, `/api/ai-audit/export`, `/api/ai-audit/log/:actionId`; Playwright E2E navigating by direct URL; AI-agent log-completeness check. |
| **Effort** | Medium |
| **Dependencies** | Seed AI action/audit records; hidden-tab flag configuration. |

### 3.3 Shared Views

| Attribute | Value |
|---|---|
| **Feature / route** | Public shared resource views — `/shared/:resourceType/:token` |
| **Why it matters** | Exposes model/vendor/risk tables publicly. A regression could leak tenant data or bypass share settings (export, open records). |
| **Current coverage** | `SharedView.test.tsx` component test. Frontend inventory lists `Clients/e2e/ai-governance/share-links.md` (markdown, not a Playwright spec). Backend `/api/shares/*` has no dedicated test. |
| **Suggested approach** | API tests for `/api/shares`, `/api/shares/view/:token`, token revocation; Playwright E2E opening shared links; negative tests for revoked tokens. |
| **Effort** | Medium |
| **Dependencies** | Seed share links and resource rows; test both enabled and disabled export/open-record flags. |

### 3.4 AI Trust Index — Tracked Apps, Settings, App Detail

| Attribute | Value |
|---|---|
| **Feature / route** | `/ai-trust-index/tracked`, `/ai-trust-index/settings`, `/ai-trust-index/:slug` |
| **Why it matters** | Drives AI vendor procurement and trust scoring decisions. Admin settings control weights and data sources. |
| **Current coverage** | Component tests exist (`Tracked/**/*.test.tsx`, `Settings/**/*.test.tsx`, `AppDetail/**/*.test.tsx`). Backend `aiTrustIndex.ctrl.test.ts` exists but no integration/E2E. `ai-trust-center.spec.ts` only tangentially touches Browse. |
| **Suggested approach** | API tests for track/untrack, bulk track, settings update; Playwright E2E for tracked list, app detail score breakdown, and settings form; visual regression for score cards. |
| **Effort** | Medium |
| **Dependencies** | Seed `ai_trust_index_apps` and `ai_trust_index_tracked_apps` data. |

### 3.5 Super Admin Organization & User Provisioning

| Attribute | Value |
|---|---|
| **Feature / route** | `/super-admin`, `/super-admin/users`, `/super-admin/organizations/:id/users` |
| **Why it matters** | Instance-level tenant isolation and user lifecycle. A bug here can cross organizations or grant unintended SuperAdmin access. |
| **Current coverage** | `super-admin.spec.ts` covers the UI. `backend-features.md` states the Super Admin domain has **no dedicated controller/integration tests**. |
| **Suggested approach** | Backend integration tests for `/api/super-admin/organizations` and `/api/super-admin/users`; tenant-isolation tests for org-scoped user lists; API contract tests for invite/update/remove. |
| **Effort** | High |
| **Dependencies** | SuperAdmin JWT fixture; seeded organizations and users; RLS/test isolation harness. |

### 3.6 Intake Forms — Risk Scoring & Submission Approvals

| Attribute | Value |
|---|---|
| **Feature / route** | `/intake-forms`, `/intake-forms/submissions`, public `/:publicId/use-case-form-intake` |
| **Why it matters** | Customer-facing intake directly feeds the governance pipeline. LLM-based risk scoring and approve/reject decisions affect downstream use-case creation. |
| **Current coverage** | `intake-forms.spec.ts` and `public-intake-form.spec.ts` cover UI flows. `backend-features.md` lists **no dedicated tests** for `/api/intake`. `intakeLLM.service.ts`, `intakeRiskScoring.service.ts`, and email notifications are not covered. |
| **Suggested approach** | API tests for form CRUD, public submission, risk override, approve/reject; component tests for risk-score badges; mocked LLM provider tests for risk scoring. |
| **Effort** | Medium |
| **Dependencies** | Public form fixture; captcha bypass for tests; mocked LLM service. |

---

## 4. Medium-Priority Candidates

These have UI E2E coverage but lack backend API/integration tests, or have backend unit tests but no E2E.

| Feature / route | Gap | Suggested approach | Effort |
|---|---|---|---|
| **AI Detection backend** — `/api/ai-detection/*`, `/api/ai-detection/repositories/*` | E2E `ai-detection.spec.ts` covers UI; backend controller/service has zero tests. | API tests for scan start/cancel/delete, findings, suppressions, repositories, risk-score recalculation. | High |
| **AI Gateway proxy / keys** — `/api/ai-gateway/*`, `/ai-gateway/virtual-keys`, `/v1` | E2E `ai-gateway.spec.ts` covers UI; backend route inventory shows `/api/ai-gateway` with 0 endpoints / proxy layer not tested. | API contract + smoke tests for spend, endpoints, guardrails, virtual keys; negative auth tests. | High |
| **AI Gateway MCP backend** — `/api/ai-gateway/mcp/*` | E2E `ai-gateway.spec.ts` covers UI; MCP controller/routes have no backend tests. | API tests for runs, approvals, agent keys, servers, tools, guardrails. | High |
| **AI Observability E2E** — `/ai-observability` | Backend `observability.ctrl.test.ts` exists; component `AIObservability/index.test.tsx` exists; no E2E. | Playwright E2E for metrics/traces/costs pages; API integration tests. | Low |
| **Training registry backend** — `/api/training` | E2E `training.spec.ts` and component tests exist; backend Training & Trust Centre domain has no tests. | API CRUD tests for `/api/training`; file/evidence link tests. | Low |
| **Event tracker backend** — `/api/logger/events`, `/api/events` | E2E `event-tracker.spec.ts` and `WatchTower.test.tsx` exist; backend has no dedicated test. | API tests for event/log endpoints and filters; tenant-scoped visibility. | Low |
| **Notifications backend** — `/api/notifications/*` | E2E `notifications.spec.ts` and component tests exist; backend notification route has no test. | API tests for unread count, mark-read, delete, summary. | Low |
| **Extensions enablement & per-extension routes** — `/api/extensions/*` | E2E `plugins.spec.ts` exists; backend Extensions domain has no tests. | API tests for enable/disable/configure, plus per-extension gates (Slack, MLflow, Azure, Jira, bulk upload, risk import, model lifecycle). | Medium |

---

## 5. Quick Wins

These can be automated cheaply with existing API routes and already-tested components.

| Feature | Quick test layer | Evidence |
|---|---|---|
| Settings profile / password / preferences | API tests for `/api/users/:id`, `/api/users/chng-pass/:id`, `/api/users/me/preferences` | `user.ctrl.test.ts` exists; expand targeted coverage. |
| Tasks bulk update | API tests for `/api/tasks/bulk` | `task.bulk.ctrl.test.ts` exists. |
| Vendor + vendor-risk CRUD | API tests for `/api/vendors`, `/api/vendorRisks` | `vendor.ctrl.test.ts` exists. |
| File manager virtual folders | API tests for `/api/virtual-folders/*` | `fileManager.ctrl.test.ts` and `file.ctrl.test.ts` exist. |
| AI Approval Rules | API tests for `/api/ai-approval-rules/*` | Small CRUD surface; hidden tab `SHOW_AI_APPROVAL_RULES=false`. |
| Feature settings | API tests for `/api/feature-settings` | Two-endpoint surface; no current test. |
| Public AI Trust Centre endpoint | API test for `/api/aiTrustCentre/:hash` | `aiTrustCentre.ctrl.test.ts` exists; add public contract test. |
| Version / health smoke | Contract tests for `/api/version` and `/health` | Public endpoints; low effort. |

---

## 6. Drift-Prone Areas

The user-guide audit (`docs/user-guide-audit/_summary.md`) found 89 findings across 56 articles. Four drift patterns dominate and map directly to automation opportunities:

| Drift pattern | Affected feature areas | Example from audit | Automation recommendation |
|---|---|---|---|
| **Enum/list count drift** | Policies, risk management, compliance frameworks, AI detection, LLM evals | `policies/policy-templates`: doc says 5 categories, enum has 6; `ai-detection/scanning`: doc says 100+ patterns, code has 83; `compliance/nist-ai-rmf`: subcategory counts wrong. | Snapshot tests that export enums and compare against doc source; CI gate on enum changes. |
| **Enum string vs. UI label drift** | Risk management, vendor risks, EU AI Act compliance | `risk-management/vendor-risks`: "Internal business data" vs. "Internal only"; `compliance/eu-ai-act`: "Waiting" vs. "Not started". | Component tests assert rendered labels match a single source-of-truth enum map. |
| **UI label drift** | Training, reporting, agent discovery, watchtower | `training/training-tracking`: button is "New training", doc says "Add training"; `reporting/generating-reports`: button label/dropdown mismatch; `ai-governance/agent-discovery`: "Sync now" vs. "Refresh". | Visual regression / E2E text assertions against data-testid labels; docs lint against exported label constants. |
| **Permission model drift** | Settings organization, share links | `settings/organization-settings`: doc says Editor can modify, code is Admin-only; `ai-governance/share-links`: doc says Admin revokes, code is creator-only. | Automated RBAC matrix tests per role for each mutation endpoint. |

**Key drift-prone pages to prioritize for RBAC/label automation:**
- `/settings` (organization, team, custom fields)
- `/risk-management` and `/vendors/risks`
- `/framework/:tab?` (EU AI Act, NIST AI RMF, ISO frameworks)
- `/ai-detection/scan` and `/ai-detection/history`
- `/policies` and `/policies/templates`
- `/agent-discovery` and `/event-tracker`

---

## 7. Recommended Automation Order

1. **Microsoft Entra ID SSO** — close the auth boundary gap (E2E + API).
2. **Shared views** — protect public data exposure (API + E2E).
3. **Super Admin org/user provisioning** — secure tenant isolation (backend integration tests).
4. **AI audit dashboard** — satisfy EU AI Act audit-trail requirements (API + E2E).
5. **AI Trust Index tracked/settings/detail** — harden procurement trust decisions (E2E + API).
6. **Intake form risk scoring & approvals** — stabilize customer-facing intake (backend API + mocked LLM).
7. **AI Detection backend** — secure code-scanning governance data (API tests).
8. **AI Gateway / MCP backend** — prevent proxy/key regressions (API contract tests).
9. **Notifications, event tracker, training backend** — quick backend coverage wins.
10. **RBAC/label snapshot automation** — reduce recurring doc/UI drift.

---

## 8. Appendix: Feature Coverage Checklist

| Feature | Route(s) | Has E2E | Has Backend Tests | Has Component Tests | Manual Only | Recommended Layer |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **Authentication** |
| Login | `/login` | ✅ | ✅ | ✅ | No | E2E + API |
| Forgot / reset / set-new password | `/forgot-password`, `/reset-password`, `/set-new-password`, `/reset-password-continue` | ✅ | ✅ | ✅ | No | E2E + API |
| User registration | `/user-reg` | ✅ | ✅ | ✅ | No | E2E + API |
| Microsoft Entra ID SSO | `/auth/microsoft/callback`, `/settings` (SSO tab) | ❌ | ❌ | ✅ | **Yes** | E2E + API |
| **Core** |
| Integrated dashboard | `/` | ✅ | ✅ | ✅ | No | E2E |
| Start here | `/start-here` | ✅ | ❌ | ✅ | No | E2E + component |
| Tasks | `/tasks` | ✅ | ✅ | ✅ | No | E2E + API |
| Settings | `/settings`, `/settings/:tab` | ✅ | ✅ | ✅ | No | E2E + API |
| Extensions | `/extensions`, `/extensions/:key/settings` | ✅ | ❌ | ✅ | No | E2E + API |
| **Project / Use cases** |
| Use cases list | `/overview` | ✅ | ✅ | ✅ | No | E2E + API |
| Project view | `/project-view` | ✅ | ✅ | ✅ | No | E2E + API |
| **Inventory** |
| Model inventory | `/model-inventory/*` | ✅ | ✅ | ✅ | No | E2E + API |
| AI apps | `/ai-apps`, `/ai-apps/:id` | ⚠️ | ✅ | ✅ | No | E2E + API |
| Datasets | `/datasets` | ✅ | ✅ | ✅ | No | E2E + API |
| Agent discovery | `/agent-discovery` | ✅ | ❌ | ✅ | No | E2E + API |
| **Assurance** |
| Risk management | `/risk-management` | ✅ | ✅ | ✅ | No | E2E + API |
| Training registry | `/training`, `/training/evidence-hub` | ✅ | ❌ | ✅ | No | API + E2E |
| Evidence / file manager | `/file-manager` | ✅ | ✅ | ✅ | No | E2E + API |
| Reporting | `/reporting` | ✅ | ✅ | ✅ | No | E2E + API |
| AI Trust Center | `/ai-trust-center/*` | ✅ | ✅ | ✅ | No | E2E + API |
| **Governance** |
| Vendors | `/vendors`, `/vendors/risks` | ✅ | ✅ | ✅ | No | E2E + API |
| Policy manager | `/policies/*` | ✅ | ✅ | ✅ | No | E2E + API |
| Incident management | `/ai-incident-managements` | ✅ | ❌ | ✅ | No | API + E2E |
| Frameworks | `/framework/*`, `/projects/:projectId/framework/:frameworkId` | ✅ | ✅ | ✅ | No | E2E + API |
| Event tracker (WatchTower) | `/event-tracker`, `/event-tracker/logs` | ✅ | ❌ | ✅ | No | API + E2E |
| **AI Product** |
| AI audit dashboard | `/ai-audit` | ❌ | ❌ | ❌ | **Yes** | E2E + API |
| AI observability | `/ai-observability` | ❌ | ✅ | ✅ | No | E2E + API |
| Approval workflows | `/approval-workflows` | ✅ | ✅ | ✅ | No | E2E + API |
| Automations | `/automations` | ✅ | ✅ | ✅ | No | E2E + API |
| Post-market monitoring | `/monitoring/cycle/:cycleId`, `/monitoring/reports` | ✅ | ✅ | ✅ | No | E2E + API |
| Intake forms | `/intake-forms/*`, public intake URLs | ✅ | ❌ | ✅ | No | API + E2E |
| **LLM Evals** |
| Evals dashboard | `/evals/*` | ✅ | ⚠️ | ✅ | No | API + E2E |
| **AI Detection** |
| Scan | `/ai-detection/scan` | ✅ | ❌ | ✅ | No | API + E2E |
| Repositories | `/ai-detection/repositories` | ✅ | ❌ | ✅ | No | API + E2E |
| Scan history | `/ai-detection/history` | ✅ | ❌ | ✅ | No | API + E2E |
| Scan details | `/ai-detection/scans/:scanId/:tab` | ✅ | ❌ | ✅ | No | API + E2E |
| AI Detection settings | `/ai-detection/settings` | ✅ | ❌ | ✅ | No | API + E2E |
| **Shadow AI** |
| Insights | `/shadow-ai/insights` | ✅ | ✅ | ✅ | No | E2E + API |
| User activity | `/shadow-ai/user-activity/*` | ✅ | ✅ | ✅ | No | E2E + API |
| AI tools | `/shadow-ai/tools/*` | ✅ | ✅ | ✅ | No | E2E + API |
| Rules & alerts | `/shadow-ai/rules/*` | ✅ | ✅ | ✅ | No | E2E + API |
| Settings | `/shadow-ai/settings` | ✅ | ✅ | ✅ | No | E2E + API |
| **AI Gateway** |
| Spend dashboard | `/ai-gateway/dashboard` | ✅ | ❌ | ✅ | No | E2E + API contract |
| Endpoints | `/ai-gateway/endpoints` | ✅ | ❌ | ✅ | No | E2E + API contract |
| Playground | `/ai-gateway/playground` | ✅ | ❌ | ✅ | No | E2E + API contract |
| Guardrails | `/ai-gateway/guardrails/:tab` | ✅ | ❌ | ✅ | No | E2E + API contract |
| Prompts | `/ai-gateway/prompts/*` | ✅ | ❌ | ✅ | No | E2E + API contract |
| Models | `/ai-gateway/models/:tab` | ✅ | ❌ | ✅ | No | E2E + API contract |
| Logs | `/ai-gateway/logs` | ✅ | ❌ | ✅ | No | E2E + API contract |
| Virtual keys | `/ai-gateway/virtual-keys` | ✅ | ❌ | ✅ | No | E2E + API contract |
| Settings | `/ai-gateway/settings/:tab` | ✅ | ❌ | ✅ | No | E2E + API contract |
| **AI Gateway — Agent Control (MCP)** |
| Agent keys | `/ai-gateway/mcp/agent-keys` | ✅ | ❌ | ✅ | No | E2E + API contract |
| MCP servers | `/ai-gateway/mcp/servers` | ✅ | ❌ | ✅ | No | E2E + API contract |
| MCP tools | `/ai-gateway/mcp/tools` | ✅ | ❌ | ✅ | No | E2E + API contract |
| Runs | `/ai-gateway/mcp/runs` | ✅ | ❌ | ✅ | No | E2E + API contract |
| Activity audit | `/ai-gateway/mcp/audit` | ✅ | ❌ | ✅ | No | E2E + API contract |
| Approvals | `/ai-gateway/mcp/approvals` | ✅ | ❌ | ✅ | No | E2E + API contract |
| MCP guardrails | `/ai-gateway/mcp/guardrails` | ✅ | ❌ | ✅ | No | E2E + API contract |
| **AI Trust Index** |
| Browse | `/ai-trust-index`, `/ai-trust-index/browse` | ⚠️ | ✅ | ✅ | No | E2E + API |
| App detail | `/ai-trust-index/:slug` | ❌ | ✅ | ✅ | **Yes** | E2E + API |
| Tracked | `/ai-trust-index/tracked` | ❌ | ✅ | ✅ | **Yes** | E2E + API |
| Settings | `/ai-trust-index/settings` | ❌ | ✅ | ✅ | **Yes** | E2E + API |
| **Super Admin** |
| Organizations | `/super-admin` | ✅ | ❌ | ✅ | No | API + E2E |
| Users | `/super-admin/users`, `/super-admin/organizations/:id/users` | ✅ | ❌ | ✅ | No | API + E2E |
| Settings | `/super-admin/settings` | ✅ | ❌ | ✅ | No | API + E2E |
| **Public pages** |
| Public AI Trust Centre | `/aiTrustCentre/:hash` | ✅ | ✅ | ✅ | No | E2E + API |
| Shared views | `/shared/:resourceType/:token` | ❌ | ❌ | ✅ | **Yes** | E2E + API |
| Public intake forms | `/:publicId/use-case-form-intake`, `/intake/:tenantSlug/:formSlug` | ✅ | ❌ | ✅ | No | API + E2E |
| **Cross-cutting** |
| Command palette / Wise Search | Global `Ctrl/Cmd+K` | ✅ | ❌ | ✅ | No | E2E + component |
| Navigation / sidebars | Main + module sidebars | ✅ | ❌ | ✅ | No | E2E + component |
| Notifications | Notification bell / stream | ✅ | ❌ | ✅ | No | API + E2E |
| Onboarding flow | `/start-here`, `SetupModal` | ✅ | ❌ | ✅ | No | E2E + component |
| Page not found | `*` | ✅ | ❌ | ✅ | No | E2E + component |
| Critical journey | Cross-cutting happy path | ✅ | ❌ | ❌ | No | E2E |

**Legend:** ✅ = covered, ❌ = not covered, ⚠️ = partial/tangential coverage. Component-test coverage is based on the per-page test directories listed in `frontend-features.md` and confirmed against `Clients/src/**/*.test.tsx`. E2E coverage is based on `Clients/e2e/*.spec.ts` files. Backend coverage is based on `backend-features.md` per-domain existing tests and the controller/integration test file lists.
