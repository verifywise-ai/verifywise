# MULTI_AGENT_PLAN — Issue #4583: Link AI incidents to model/use case + owner via FK

> Branch: `mo-393-sept-10-link-AI-incidents-to-model-use-case`
> Issue: https://github.com/verifywise-ai/verifywise/issues/4583
> Size: Medium. Standing order from user: **every file modification → commit → push** (overrides interactive STOP gates for this run).

## PRD (Phase 1, Product Manager)

- **Problem**: `ai_incident_managements` stores affected system (`ai_project`, `model_system_version`) and people (`reporter`, `approved_by`) as free text. No relational integrity → cannot answer "all incidents for this model/use case" or "incidents this person owns".
- **Scope**: add nullable FK columns `model_inventory_id` → `model_inventories(id)`, `project_id` → `projects(id)`, `assignee_id` → `users(id)`; keep free-text fields for backward compatibility (FK becomes source of truth); API accepts/returns the FKs and supports filtering by them; UI gets a model picker + owner dropdown + filter columns.
- **Out of scope**: backfilling legacy rows from free text; removing free-text columns; changing `reporter`/`approved_by`.
- **Acceptance criteria** (from issue): FK link to model and/or use case; assignee FK; filterable by model/use case and owner; nullable columns, no forced backfill; migration clean on fresh DB and upgrade.

## Architecture Brief (Phase 3, Technical Lead + DBA)

### ADR-1: Nullable FK columns, `ON DELETE SET NULL` (not CASCADE)
- Precedent in same migration: `model_risks.model_id INTEGER REFERENCES verifywise.model_inventories(id) ON DELETE CASCADE` and `model_risks.owner INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL`.
- Decision: use **SET NULL** for all three. Incidents are EU AI Act Art. 73 compliance records; deleting a model inventory row or a user must not silently erase incident history. The CASCADE precedent fits model_risks (risk register is an accessory of the model); incidents are standalone compliance records.
- New columns nullable → existing rows remain valid (no backfill). Migration runs after `20260226234302-tenant-tables.js` (creates table), so it works on fresh DB and as an upgrade.

### ADR-2: Server-side filter params + display names via LEFT JOIN
- `GET /ai-incident-managements` gains optional query filters `model_inventory_id`, `project_id`, `assignee_id` (validated positive integers → 400 otherwise).
- List/get queries LEFT JOIN `model_inventories`, `projects`, `users` to return `model_inventory_name`, `project_title`, `assignee_name` for UI display/filtering.
- Tenant isolation (AppSec): on create/update, referenced ids must exist **and belong to the caller's organization** (`organization_id` check) → 400 otherwise. Prevents cross-org IDOR.

### API Contract (Cycle 6A)
- `POST /ai-incident-managements` body += optional `model_inventory_id: number|null`, `project_id: number|null`, `assignee_id: number|null`.
- `PATCH /ai-incident-managements/:id` same.
- `GET /ai-incident-managements?model_inventory_id=&project_id=&assignee_id=` → filtered list.
- Response objects += `model_inventory_id`, `project_id`, `assignee_id`, `model_inventory_name`, `project_title`, `assignee_name` (names null when no link).

## Task Board (Phase 5)

### Wave 1 — Backend foundation (Senior Backend Dev + DBA)
| ID | Task | Files | Status |
|----|------|-------|--------|
| B1 | Migration: 3 nullable FK cols + 3 indexes | `Servers/database/migrations/20260910060000-add-fks-to-ai-incident-managements.js` | pending |
| B2 | Interface += FK fields | `Servers/domain.layer/interfaces/i.aiIncidentManagement.ts` | pending |
| B3 | Model += @Column FKs, JSON serializers, create/update factories | `Servers/domain.layer/models/incidentManagement/incidemtManagement.model.ts` | pending |
| B4 | Utils: INSERT/UPDATE cols, list filters, JOIN names, reference tenant checks | `Servers/utils/incidentManagement.utils.ts` | pending |
| B5 | Controller: wire body fields, query filters, reference validation | `Servers/controllers/incident-management.ctrl.ts` | pending |
| B6 | Validation: optional FK validators | `Servers/utils/validations/incidentManagementValidation.utils.ts` | pending |
| B7 | Backend tests (model + validation) | `Servers/domain.layer/tests/`, `Servers/utils/validations/__tests__/` | pending |

### Wave 2 — Frontend (Mid/Senior Frontend Dev)
| ID | Task | Files | Status |
|----|------|-------|--------|
| F1 | Client model += FK + display-name fields | `Clients/src/domain/models/Common/incidentManagement/incidentManagement.model.ts` | pending |
| F2 | Modal: affected-model picker + owner dropdown, send FKs | `Clients/src/presentation/components/Modals/NewIncident/index.tsx` | pending |
| F3 | Page: model/owner filter columns, initialData, export | `Clients/src/presentation/pages/IncidentManagement/index.tsx` | pending |
| F4 | Table: "Affected model" + "Owner" columns | `Clients/src/presentation/pages/IncidentManagement/IncidentTable.tsx` | pending |

### Wave 3 — Quality (QA + Tech Lead)
| ID | Task | Status |
|----|------|--------|
| Q1 | `npm run build` backend + targeted jest green | pending |
| Q2 | Frontend typecheck/tests green | pending |
| Q3 | Review pass vs acceptance criteria | pending |

## Risk & Blocker Log
- Subagent LLM API returned 401 → Orchestrator executes directly, role discipline maintained per file.
- Sequelize `mapToModel` with JOIN aliases: verified pattern — extra selected columns land in `dataValues`; read via `getDataValue()` in serializers.

## Change Log
- 2026-09-10 — Plan initialized (Phase 0–5 compressed; execution started under user's commit-push standing order).
