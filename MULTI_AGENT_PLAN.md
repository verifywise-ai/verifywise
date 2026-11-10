# MULTI_AGENT_PLAN — One-Fix-To-All (VW-CQ compliance questionnaire batch)

## Scope (from GitHub)
- Dependency PRs (`label:dependencies`, open): **0** — all 19 were superseded by already-merged PR #5290 (verified via `gh` + web UI on 2026-11-09). Nothing to port.
- Open issues assigned to MuhammadKhalilzadeh: **4** — this branch delivers 3 of them.
- **#5260 (VW-CQ-08 training assignments): EXCLUDED at user direction** — already being handled by another developer. All CQ-08 work was reverted out of this branch (revert commits); no training-assignments code remains in the diff.

| Issue | Title | Status in this branch |
|---|---|---|
| #5253 | VW-CQ-01: User groups / teams with RBAC | ✅ Delivered |
| #5254 | VW-CQ-02: Self-service framework import from spreadsheet | ✅ Delivered |
| ~~#5260~~ | ~~VW-CQ-08: Assign training to users~~ | ⛔ Excluded (other dev) |
| #5261 | VW-CQ-09: Organisation-owned policy templates | ✅ Delivered |

## Team (agent roster roles engaged)
- Orchestrator / Technical Lead / Senior Backend / Senior Frontend / API Platform / Application Security / QA / DevOps — per `agents/00-TEAM_WORKFLOW.md`.

## Task Board

### Wave 1 — CQ-01 Groups & RBAC (#5253) ✅
- [x] 1.1 Migration: `groups`, `group_members`, `project_groups` tables + RLS
- [x] 1.2 `groups.manage` + `roles.manage` permission keys
- [x] 1.4 `Servers/utils/group.utils.ts` (CRUD + 60s TTL resolution cache)
- [x] 1.5 `group.ctrl.ts` + v1 `groups.route.ts`
- [x] 1.6 Group access resolved at check time in `projectVisibility.utils.ts`
- [x] 1.7 Frontend repository + hooks
- [x] 1.8 Groups management page + route + sidebar
- [x] 1.9 Use-case settings group selector (saves via PUT /v1/groups/projects/:id/groups)
- [x] 1.10 Custom roles admin UI (permission matrix) in Settings → Roles
- [x] 1.11 Jest (17 tests) + Vitest (3 tests)

### Wave 2 — CQ-02 Framework import (#5254) ✅
- [x] 2.1 Extension `Servers/extensions/framework-import/` (service/ctrl/route) mirroring risk-import
- [x] 2.2 `frameworks.source` + `frameworks.organization_id` columns; `imported_framework_topics/subtopics` tables + RLS
- [x] 2.3 Spreadsheet contract (template + validation + atomic import, idempotent on org+name)
- [x] 2.4 Org-scoped list/detail queries (cross-tenant read hardened)
- [x] 2.5 Frontend: FrameworkImportModal + entry point + imported-frameworks section on the Framework page
- [x] 2.6 Extension catalog migration + icon + swagger tag + `ext.frameworkImport.edit` permission
- [x] 2.7 Jest (18 tests) + Vitest (3 tests)
- Note: attaching imported frameworks to use cases requires a DB-backed structure registry (the 21 bundled frameworks use per-framework tables) — documented as follow-up.

### Wave 3 — CQ-09 Policy templates (#5261) ✅
- [x] 4.1 Migration: `policy_templates` (org NULL = system) + RLS
- [x] 4.2 Seed system rows from `Clients/public/data/PolicyTemplates.json` (seeder module + parity test)
- [x] 4.3 CRUD + create-template-from-policy endpoint; v1 route behind `policyTemplate.edit`
- [x] 4.4 Advisor `search_policy_templates` + `get_template_recommendations` repointed at the DB
- [x] 4.5 Frontend: system/our templates toggle, duplicate, edit, delete, save-as-template from policy rows, editor resolution via API (composite `origin-id`, legacy fallback)
- [x] 4.6 Jest (tests) + Vitest (tests reworked + passing)

### Wave 4 — Cross-cutting ✅
- [x] 5.1 Tenant isolation registry + fixtures for groups/policy_templates; audit entries for imported framework tables
- [x] 5.2 `npm run generate:swagger` + endpoints regenerated (pre-commit hooks), api-drift check
- [x] 5.3 Backend: tsc clean, 9093 unit tests pass; Frontend: tsc clean

## API Contracts
- `GET/POST/PATCH/DELETE /api/v1/groups` (+ `/members`, `/projects/:projectId/groups`) — writes need `groups.manage` (members) / `useCase.edit` (project groups)
- `GET/POST/PATCH/DELETE /api/v1/policy-templates` (+ `POST /from-policy`) — writes need `policyTemplate.edit`
- `GET /api/extensions/framework-import/template`, `POST /import`, `GET/PATCH/DELETE /imported[/:id]` — extension-gated + `ext.frameworkImport.edit` for writes

## Design Decisions
- D1: CQ-01 membership via `project_groups` resolved at check-time (option a), mirroring rolePermissions resolution; 60s TTL cache invalidated on writes.
- D2: CQ-01 custom-roles admin UI ships in Settings → Roles (`roles.manage`).
- D3: CQ-02 import is idempotent on (organization_id, name, source='imported'): re-upload replaces topics/subtopics in one transaction.
- D4: CQ-02 `frameworks.organization_id NULL` = bundled/system catalog (like policy_templates), keeping bundled behavior identical.
- D5: CQ-09 content stored as HTML (matches `policy_manager.content_html` and the TipTap editor), template ids are composite `origin-id` in URLs.
- D6: CQ-09 system templates seeded with `organization_id NULL, is_system_template=true`; writes guarded `org + is_system_template=false` in the query WHERE (report-templates pattern).

## Risk & Blocker Log
- R1: Zero open dependency PRs — consolidated deps already merged (#5290).
- R2: #5260 excluded mid-flight; revert commits removed all CQ-08 code (route, migration, sweep, advisor, ai-app link, frontend).
- R3: Subagent API instability during implementation — mitigated by completing the remaining frontend waves directly.

## Quality Dashboard
- Backend: tsc clean; 582 suites / 9093 tests pass (jest).
- Frontend: tsc clean; PolicyDashboard 178 tests, Groups 3, Framework 21 suites pass (vitest).
- Tenant isolation: registry + fixtures + audit updates committed.

## Change Log
- 2026-11-09: Bootstrap; branch `feature/vw-cq-one-fix-to-all` created from origin/develop.
- 2026-11-09: CQ-08 (#5260) excluded at user direction; all CQ-08 commits reverted file-by-file.

## Retrospective Notes
- Wave isolation worked: 3 features landed in one PR with disjoint file ownership; shared files (rolePermissions.config, route mounts, swagger) owned by the orchestrator.
