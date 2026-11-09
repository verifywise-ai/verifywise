# MULTI_AGENT_PLAN — One-Fix-To-All (VW-CQ compliance questionnaire batch)

## Scope (from GitHub)
- Dependency PRs (`label:dependencies`, open): **0** — all 19 were superseded by already-merged PR #5290 (verified via `gh` + web UI on 2026-11-09). Nothing to port.
- Open issues assigned to MuhammadKhalilzadeh: **4** — implemented in this branch.

| Issue | Title | Status target |
|---|---|---|
| #5253 | VW-CQ-01: User groups / teams with RBAC | 2026-11-11 |
| #5254 | VW-CQ-02: Self-service framework import from spreadsheet | 2026-11-11 |
| #5260 | VW-CQ-08: Assign training to users | 2026-11-25 |
| #5261 | VW-CQ-09: Organisation-owned policy templates | 2026-11-25 |

## Team (agent roster roles engaged)
- Orchestrator / Technical Lead / Senior Backend / Senior Frontend / API Platform / Application Security / QA / DevOps — per `agents/00-TEAM_WORKFLOW.md`.

## Task Board

### Wave 1 — CQ-01 Groups & RBAC (#5253)
- [ ] 1.1 Migration: `groups`, `group_members`, `project_groups` tables
- [ ] 1.2 `groups.manage` permission key in `rolePermissions.config.ts` (legacyRoles: Admin)
- [ ] 1.3 Models: Group, GroupMember, ProjectGroup
- [ ] 1.4 `Servers/utils/group.utils.ts` (CRUD + membership resolution, 60s TTL cache)
- [ ] 1.5 `Servers/controllers/group.ctrl.ts` + `Servers/routes/group.route.ts` (v1)
- [ ] 1.6 Use-case membership: project_groups expansion in access checks / project.utils.ts
- [ ] 1.7 Frontend: repository + hooks (`useGroups`)
- [ ] 1.8 Frontend: Groups management page + route + sidebar
- [ ] 1.9 Frontend: use-case members selector "add group" mode
- [ ] 1.10 Frontend: custom roles admin UI (permission matrix) in SettingsPage
- [ ] 1.11 Jest + Vitest tests

### Wave 2 — CQ-02 Framework import (#5254)
- [ ] 2.1 Extension chassis: `Servers/extensions/framework-import/` (service/ctrl/route) mirroring risk-import
- [ ] 2.2 `frameworks.source` column migration (bundled | imported)
- [ ] 2.3 Spreadsheet contract: Framework → Topics → Subtopics; template generator; parser+validation
- [ ] 2.4 Import through `frameworkRegistry.utils.ts` wrappers; idempotent on (org, name)
- [ ] 2.5 Frontend: FrameworkImportModal (clone of RiskImportModal) on frameworks page

### Wave 3 — CQ-08 Training assignments (#5260)
- [ ] 3.1 Migrations: `training_assignments`; `ai_apps.required_training_id` FK
- [ ] 3.2 Assignment CRUD under `/api/v1/training/assignments` (user subjects now; group subjects via CQ-01)
- [ ] 3.3 Daily BullMQ reminder sweep (due-in-7d + overdue) using training-assigned.mjml
- [ ] 3.4 Completion endpoint + per-person tracking
- [ ] 3.5 Frontend: Assign modal + assignments drawer in TrainingRegistar
- [ ] 3.6 Frontend: AI Apps `required_training` → training picker (required_training_id)
- [ ] 3.7 Advisor: trainingFunctions aware of assignments
- [ ] 3.8 Tests

### Wave 4 — CQ-09 Policy templates (#5261)
- [ ] 4.1 Migration: `policy_templates` (org NULL = system) + seed from PolicyTemplates.json
- [ ] 4.2 CRUD + create-template-from-policy endpoint
- [ ] 4.3 Advisor `search_policy_templates` repointed to DB
- [ ] 4.4 Frontend: PolicyTemplates system/our toggle + save-as-template + template editor mode
- [ ] 4.5 Tests

### Wave 5 — Cross-cutting
- [ ] 5.1 Tenant isolation registry + tests for new org-scoped tables
- [ ] 5.2 `npm run generate:swagger` + `check:api-drift` artifacts
- [ ] 5.3 Lint/build/test full pass
- [ ] 5.4 PR open, CI green

## API Contracts
(Published by backend first; see Wave sections. All v1, all behind `authenticateJWT`; writes behind `authorize(...)`.)

## Design Decisions
- D1: CQ-01 membership via `project_groups` table resolved at check-time (option a from issue), mirroring rolePermissions resolution pattern.
- D2: CQ-01 custom-roles admin UI ships in this PR (R1 item) as part of #5253 gap.
- D3: CQ-02 keep import idempotent on (organization_id, name) with ON CONFLICT upsert of topics/subtopics.
- D4: CQ-08 group subjects resolve through CQ-01 groups (cross-feature dependency handled in same PR).
- D5: CQ-09 store TipTap JSON verbatim in `policy_templates.content` (no lossy HTML round-trip).

## Risk & Blocker Log
- R1: Zero open dependency PRs — consolidated deps already merged (#5290). No dependency work in this PR.
- R2: Four epics in one PR — mitigated by wave isolation; shared touchpoints (routes registration, swagger, tenant registry) handled in Wave 5.

## Quality Dashboard
- Pending

## Change Log
- 2026-11-09: Bootstrap; branch `feature/vw-cq-one-fix-to-all` created from origin/develop.

## Retrospective Notes
- Pending
