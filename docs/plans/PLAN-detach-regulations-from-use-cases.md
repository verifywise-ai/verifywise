# Orchestrated Plan: Detach Regulations from Use Cases

**Feature:** Detach Regulations from Use Cases (Phase 1 MVP)  
**Date:** 2026-07-09  
**Status:** Planning complete — awaiting approval to implement  
**Planning team:** Product Manager, Technical Lead, UX/UI Designer, QA Engineer, DevOps Engineer, Senior/Mid/Junior Frontend & Backend Developers

---

## 1. Executive Summary

### The conversation

**James Kavanagh (AI Career Pro)** asked VerifyWise CEO Gorkem why creating a use case forces him to select the EU AI Act, a risk tier, and a high-risk role even though the systems in his course have no EU AI Act requirement. He could only find custom fields as a workaround and wanted to know if he was missing an administrative control.

**Gorkem confirmed** that this is a real product limitation. VerifyWise started two years ago focused exclusively on the EU AI Act and baked its concepts (risk tiers, roles) into the use-case model. Detaching regulations from use cases has been planned but never executed. He agreed it is time to fix it.

### What this plan covers

This document is the output of a full-team planning exercise. It defines the Phase 1 MVP that:

1. Makes framework/regulation selection **optional** when creating or editing a use case.
2. Shows EU AI Act-specific fields **only when EU AI Act is selected**.
3. Introduces a regulation-independent **use case classification** concept.
4. Preserves all existing EU AI Act data and workflows for current customers.
5. Leaves deep downstream refactoring for Phase 2, guarding it instead.

---

## 2. Research Findings

### 2.1 Backend coupling points

A project (`projects` table) is the backend name for a use case. The EU AI Act is framework ID `1` in the `frameworks` table. Current seeded frameworks:

| ID | Name | Type |
|---|---|---|
| 1 | EU AI Act | Non-organizational |
| 2 | ISO 42001 | Organizational |
| 3 | ISO 27001 | Organizational |
| 4 | NIST AI RMF | Non-organizational (currently hidden) |

Key coupling found:

| # | Coupling | File | Severity |
|---|---|---|---|
| 1 | Non-organizational projects restricted to EU AI Act only | `Servers/utils/validations/projectValidation.utils.ts` | High |
| 2 | Framework ID whitelist excludes NIST AI RMF (4) | `Servers/utils/validations/projectValidation.utils.ts` | Medium |
| 3 | Project creation hardcodes framework IDs 1→EU, 2→ISO 42001, etc. | `Servers/controllers/project.ctrl.ts` | Medium |
| 4 | Deferred framework creation hardcodes IDs | `Servers/utils/approvalRequest.utils.ts` | Medium |
| 5 | EU utility queries hardcode `framework_id = 1` / name `EU AI Act` | `Servers/utils/eu.utils.ts` | High |
| 6 | EU AI Act control visibility filtered by project tier + role | `Servers/utils/eu.utils.ts` | High |
| 7 | CE Marking looks up EU AI Act by name | `Servers/controllers/ceMarking.ctrl.ts` | Medium |
| 8 | Governance coverage / OS control counts keyed by hardcoded IDs | `Servers/utils/governanceCoverage.utils.ts`, `Servers/controllers/governanceOs.ctrl.ts` | Medium |
| 9 | Advisor resolves project→EU AI Act by `framework_id = 1` | `Servers/advisor/functions/euAiActFunctions.ts` | Low |
| 10 | `projects.ai_risk_classification` and `type_of_high_risk_role` are EU AI Act–centric | Model + migration | Architectural |

### 2.2 Frontend coupling points

| # | Coupling | File(s) | Impact |
|---|---|---|---|
| 1 | Form copy says "EU AI Act only" for project-based frameworks | `ProjectForm/constants.ts` | High messaging impact |
| 2 | Framework filtering by `is_organizational === false` hides NIST | `ProjectForm/index.tsx` | Blocks non-EU frameworks |
| 3 | At least one framework required on create | `ProjectForm/index.tsx` | Forces EU AI Act selection |
| 4 | Risk tier & role required for project-based frameworks | `ProjectForm/index.tsx` | Forces EU AI Act data |
| 5 | Hardcoded default `{ _id: 1, name: "EU AI Act" }` | `ProjectSettings/index.tsx` | Defaults to EU AI Act |
| 6 | Hardcoded `FRAMEWORK_IDS.EU_AI_ACT = 1` in many places | Compliance/Assessment/Overview/Risks/Reporting | High |
| 7 | Legacy `CreateProjectForm` enforces risk tier/role unconditionally | `CreateProjectForm/index.tsx` | Medium |
| 8 | ProjectSettings validation does not enforce risk tier/role on save | `ProjectSettings/index.tsx` | Inconsistent |

### 2.3 Architectural tension

The platform already has the right junction table (`projects_frameworks`) and per-framework tenant tables to support multiple regulations. The problem is that the `projects` table and the create/edit UI were built around EU AI Act assumptions. Detaching regulations means closing this gap: moving from "EU AI Act by default" to "framework-agnostic use case with optional regulation attachments."

---

## 3. Product Requirements Document (PRD)

### 3.1 Problem statement

VerifyWise currently treats the EU AI Act as mandatory and central to every use case. Users cannot create or classify a use case without selecting EU AI Act applicability, risk tier, and high-risk role—even when the use case has no EU AI Act relevance.

### 3.2 Success metrics

| Metric | Target | Measurement |
|---|---|---|
| Use-case creation completion rate | +15% within 30 days | Product analytics |
| Support tickets about removing EU AI Act | 0 within 60 days | Support desk tags |
| Use cases created without EU AI Act | ≥30% of new use cases within 90 days | `projects_frameworks` junction |
| Average time to create a use case | -20% within 30 days | Product analytics |
| User-reported clarity of classification | ≥4.0 / 5 | In-app CES/CSAT |

### 3.3 Scope

**In scope (Phase 1 MVP):**
- Make framework selection optional and regulation-agnostic during use-case creation and editing.
- Remove mandatory EU AI Act fields from the default form; show them only when EU AI Act is selected.
- Introduce generic, regulation-independent "use case classification" fields.
- Update validation logic so non-organizational projects are no longer restricted to framework ID 1.
- Update in-product copy.
- Preserve existing EU AI Act data for current customers; non-destructive migration.

**Out of scope (Phase 1):**
- Refactoring every downstream hardcoded `framework_id === 1` path (compliance tracker, assessment tracker, reporting, CE marking, advisor, risk utils).
- Multi-framework selection as a promoted feature (UI will allow it where the backend already does, but not the primary focus).
- Adding new framework content beyond what is already seeded.
- Re-architecting the compliance engine or multi-tenancy model.

### 3.4 User stories

**Story 1 — Optional framework selection**  
As a compliance owner, I want to create a use case without selecting any framework so that I can record a system even when no regulation currently applies to it.

- AC: I can leave the framework section empty and still save the use case.
- AC: The use case appears in the list and is editable without validation errors.
- AC: Downstream features that require a framework show a clear empty state instead of crashing.

**Story 2 — Conditional EU AI Act fields**  
As a compliance owner, I want risk tier and high-risk role to appear only when I choose the EU AI Act framework so that I am not forced to provide irrelevant regulatory data.

- AC: When EU AI Act is not selected, risk tier and role are hidden and not validated.
- AC: When EU AI Act is selected, risk tier and role become visible and mandatory.
- AC: Deselecting EU AI Act after filling risk tier/role clears or disables them and keeps the form valid.

**Story 3 — Generic use-case classification**  
As a compliance owner, I want to classify a use case by purpose, category, and deployment context using built-in fields so that I can organize and report on my AI inventory independently of regulations.

- AC: A "Classification" section is visible in create/edit with category, purpose, audience, and deployment context.
- AC: Values are stored on the project record and returned by the API.
- AC: Values are visible in the use-case detail view.

**Story 4 — Preserved existing EU AI Act data**  
As an existing VerifyWise customer, I want my current EU AI Act use cases to keep their risk tier and role data after the change so that my compliance reports do not break.

- AC: Existing use cases with EU AI Act selected retain risk tier and role values.
- AC: They continue to appear in compliance tracker, assessment tracker, and reporting without manual intervention.

### 3.5 Priority

- **Strategic priority:** High — directly addresses a CEO-acknowledged customer objection and supports multi-framework positioning.
- **User-value priority:** High — removes onboarding friction for non-EU prospects.
- **Technical risk:** Medium-High — touches validation, forms, and database columns that downstream features assume are populated.
- **Size:** Large (cross-cutting, requires migration and phased cleanup).

### 3.6 Dependencies

- Backend validation relaxation must land before UI changes are meaningful.
- Frontend `ProjectForm` and `ProjectSettings` updates are tightly coupled.
- Downstream consumers must tolerate missing EU AI Act data during Phase 1.
- Database migration must be non-destructive and reversible.

---

## 4. Architecture Brief

### 4.1 Approach

- **Minimal surface area:** change use-case creation/editing path only; do not refactor downstream compliance/assessment trackers, CE marking, advisor tools, risk utils, or reporting in Phase 1.
- **Non-destructive:** preserve existing `ai_risk_classification`, `type_of_high_risk_role`, and `projects_frameworks` rows.
- **Nullable > rewrite:** make EU AI Act fields nullable and conditionally required, rather than removing or re-typing them.
- **Additive classification:** introduce new regulation-independent columns on the `projects` table.
- **Guard downstream:** consumers that hardcode `framework_id === 1` must tolerate projects without an EU AI Act framework association.

### 4.2 Affected layers

| Layer | What changes |
|---|---|
| Domain | `ProjectModel`, `IProjectAttributes`, new classification enums, loosened non-null constraints. |
| Application | Validation schemas, project creation/update queries, controller orchestration, framework dispatch logic, approval-request deferred creation, downstream guards. |
| Infrastructure | New migration to add nullable columns and relax `NOT NULL` on EU fields. |
| Presentation | Project form, legacy create-project form, project settings, frameworks tab, overview progress cards, copy/labels, home list. |

### 4.3 Key files to change

**Backend**
- `Servers/domain.layer/models/project/project.model.ts`
- `Servers/domain.layer/interfaces/i.project.ts`
- `Servers/domain.layer/enums/useCaseClassification.enum.ts` (new)
- `Servers/database/migrations/2026XXXXXX-detach-regulations-from-use-cases.js` (new)
- `Servers/utils/validations/projectValidation.utils.ts`
- `Servers/utils/project.utils.ts`
- `Servers/utils/approvalRequest.utils.ts`
- `Servers/controllers/project.ctrl.ts`
- `Servers/utils/eu.utils.ts` (guards only)
- `Servers/utils/risk.utils.ts` (guards only)
- `Servers/controllers/ceMarking.ctrl.ts` (guards only)
- `Servers/advisor/functions/euAiActFunctions.ts` (guards only)
- `Servers/services/reporting/dataCollector.ts` (verify)

**Frontend**
- `Clients/src/presentation/components/Forms/ProjectForm/index.tsx`
- `Clients/src/presentation/components/Forms/ProjectForm/constants.ts`
- `Clients/src/presentation/components/CreateProjectForm/index.tsx`
- `Clients/src/presentation/pages/ProjectView/ProjectSettings/index.tsx`
- `Clients/src/presentation/pages/ProjectView/ProjectFrameworks/index.tsx`
- `Clients/src/presentation/pages/ProjectView/V1.0ProjectView/Overview/index.tsx`
- `Clients/src/presentation/components/ProjectsList/ProjectsList.tsx`
- `Clients/src/presentation/components/ProjectsList/ProjectTableView.tsx`
- `Clients/src/domain/types/Project.ts`
- `Clients/src/application/dtos/project.dto.ts`
- `Clients/src/application/mappers/project.mapper.ts`
- `Clients/src/application/repository/project.repository.ts`

### 4.4 Data model changes

**New nullable columns on `projects`:**

| Column | Type | Notes |
|---|---|---|
| `use_case_category` | `VARCHAR(64)` or enum | e.g., "Generative AI", "Computer Vision", "Predictive Analytics", "Other" |
| `use_case_purpose` | `TEXT` | Free-text description of purpose |
| `is_internal_facing` | `BOOLEAN` | internal / external / both |
| `deployment_context` | `VARCHAR(64)` or enum | Cloud, On-premise, Edge, Hybrid |

**Relaxed columns:**
- `ai_risk_classification` — `NOT NULL` → nullable
- `type_of_high_risk_role` — `NOT NULL` → nullable

**Migration strategy:**
1. `ALTER TABLE projects ALTER COLUMN ai_risk_classification DROP NOT NULL;`
2. `ALTER TABLE projects ALTER COLUMN type_of_high_risk_role DROP NOT NULL;`
3. Add four new classification columns as nullable.
4. Backfill nothing; existing EU AI Act data remains intact.
5. Rollback script drops new columns and restores `NOT NULL` only if rolled back before new null rows are inserted.

### 4.5 API contract changes

**`POST /projects`**
- `framework` array becomes optional; empty array accepted.
- `ai_risk_classification` and `type_of_high_risk_role` become optional; required only when framework `1` is included.
- New optional fields: `use_case_category`, `use_case_purpose`, `is_internal_facing`, `deployment_context`.

**`PATCH /projects/:id`**
- Same optional/nullable semantics.
- Updates that remove framework `1` may set EU AI Act fields to `null` or omit them.
- Existing payloads continue to work unchanged.

**Response payloads**
- Add new classification fields to project JSON responses.
- Existing `framework` array continues to be returned; may be empty.

### 4.6 Breaking change assessment

| Area | Risk | Mitigation |
|---|---|---|
| Database | Low | Nullable additions only; test migration against staging copy. |
| API clients | Low | Old payloads still valid; new payloads more permissive. |
| Frontend | Medium | Update form initialization, validation, and submission mapping. |
| Downstream consumers | Medium | Add existence guards rather than refactoring logic. |
| Copy/instructions | Low | Audit strings in forms, settings, overview, empty states. |

### 4.7 Technical risks

1. Downstream hardcoded `framework_id === 1` paths may throw when a project has no EU AI Act framework.
2. `is_organizational` semantics may affect risk utils and other features that distinguish organizational from project-based use cases.
3. Deferred framework creation with approval workflows must handle empty framework arrays safely.
4. Frontend form state initializes risk fields to numeric IDs and treats them as required; must distinguish "not selected" from "invalid."
5. Overview progress cards and home list must handle missing EU AI Act data gracefully.
6. Integration tests may assert framework 1 is mandatory and need updating.

---

## 5. UX/UI Design Brief

The complete design brief is saved separately at:

**`docs/plans/DESIGN_BRIEF-detach-regulations-from-use-cases.md`**

### 5.1 Summary of design changes

- **ProjectForm:** optional framework multi-select, conditional EU AI Act subsection, new Use case classification section.
- **ProjectSettings:** remove hardcoded EU AI Act default, split "Team & Compliance" into separate cards, add conditional "EU AI Act details" card and new "Use Case Classification" card.
- **CreateProjectForm:** mirror the new ProjectForm behavior.
- **ProjectsList / ProjectTableView:** add "Frameworks" column, conditionally show "AI risk level" and "Role" columns, add grouping/filter options for classification fields.
- **ProjectFrameworks:** verify empty state is regulation-agnostic and "Add Framework" button is visible with no frameworks.

### 5.2 Key copy changes

| Location | Current | New |
|---|---|---|
| Modal description | "Create a new use case from scratch by filling in the following." | "Create a new use case. Frameworks and EU AI Act details are optional and can be added later." |
| Framework selector label | "Applicable regulations" | "Applicable regulations and standards (optional)" |
| New section title | (none) | "Use case classification" |
| EU AI Act subsection | (none, fields inline) | "EU AI Act details" |
| Settings card title | "Team & Compliance" | Split into "Frameworks & Compliance" and "Team" |
| Frameworks empty body | existing | "This use case doesn't have any frameworks yet. Add one to start tracking controls and assessments." |

### 5.3 State inventory highlights

- Framework selector supports default/empty, hover, focused, active, disabled, loading, error, and filled states.
- Classification selects are optional with clear placeholders.
- Conditional EU AI Act fields are hidden by default, shown with required indicators when EU AI Act is selected.
- Submit button adapts label and loading state between create and update.
- Home table rows show framework chips and fall back to "—" for missing optional data.

### 5.4 Accessibility notes

- Conditional EU AI Act section wrapped in `aria-live="polite"` or focus moved to first newly visible field.
- All new selects have visible labels and matching `htmlFor`/`id`.
- Helper links have descriptive `aria-label`s.
- Keyboard navigation preserved through dropdowns and table rows.

---

## 6. Task Board — Phase 1 MVP

### Wave 1 — Domain Foundation & UX Finalization

| ID | Title | Agent | Depends On | Acceptance Criteria | Files |
|---|---|---|---|---|---|
| T-001 | Define use-case classification domain model & enum | Senior Backend Developer | — | New classification fields modeled as additive/nullable; EU fields left intact. | `Servers/domain.layer/interfaces/i.project.ts`<br>`Servers/domain.layer/models/project/project.model.ts`<br>`Servers/domain.layer/enums/useCaseClassification.enum.ts` |
| T-002 | Finalize UX specs for regulation-agnostic project forms | UX/UI Designer | — | Specs updated for ProjectForm, CreateProjectForm, ProjectSettings, ProjectsList, Overview. | Design deliverables |
| T-003 | Draft non-destructive migration strategy | Senior Backend Developer | T-001 | Migration plan preserves data; rollback defined. | Migration design doc |

### Wave 2 — API & Core UI

| ID | Title | Agent | Depends On | Acceptance Criteria | Files |
|---|---|---|---|---|---|
| T-004 | Implement database migration for classification fields | Senior Backend Developer | T-001, T-003 | Adds nullable columns; `up`/`down` tested locally. | `Servers/database/migrations/2026XXXXXX-detach-regulations-from-use-cases.js` |
| T-005 | Update backend validation logic | Senior Backend Developer | T-001, T-004 | EU AI Act fields nullable unless framework 1 selected; non-organizational projects not restricted to framework 1. | `Servers/utils/validations/projectValidation.utils.ts` |
| T-006 | Update project controller & utility layer | Mid Backend Developer | T-001, T-004, T-005 | Create/update endpoints accept new fields and optional framework list; response DTOs include classification. | `Servers/controllers/project.ctrl.ts`<br>`Servers/utils/project.utils.ts`<br>`Servers/utils/approvalRequest.utils.ts` |
| T-007 | Update frontend types, DTOs, mapper & repository | Senior Frontend Developer | T-001, T-002 | Project types include new fields; mapper handles nullable EU fields; repository passes new fields. | `Clients/src/domain/types/Project.ts`<br>`Clients/src/application/dtos/project.dto.ts`<br>`Clients/src/application/mappers/project.mapper.ts`<br>`Clients/src/application/repository/project.repository.ts` |
| T-008 | Refactor ProjectForm for optional framework & conditional EU AI Act | Senior Frontend Developer | T-002, T-007 | Framework multi-select optional; EU AI Act fields conditional; form submits valid payload. | `Clients/src/presentation/components/Forms/ProjectForm/index.tsx`<br>`Clients/src/presentation/components/Forms/ProjectForm/constants.ts` |
| T-009 | Refactor CreateProjectForm to mirror new ProjectForm | Senior Frontend Developer | T-002, T-007, T-008 | Legacy form consistent with new behavior. | `Clients/src/presentation/components/CreateProjectForm/index.tsx` |

### Wave 3 — Secondary UI, Downstream Guards & Copy

| ID | Title | Agent | Depends On | Acceptance Criteria | Files |
|---|---|---|---|---|---|
| T-010 | Add downstream guards for projects without EU AI Act framework | Mid Backend Developer | T-006 | `eu.utils.ts`, `risk.utils.ts`, `ceMarking.ctrl.ts`, `euAiActFunctions.ts`, `dataCollector.ts` tolerate missing framework 1. | `Servers/utils/eu.utils.ts`<br>`Servers/utils/risk.utils.ts`<br>`Servers/controllers/ceMarking.ctrl.ts`<br>`Servers/advisor/functions/euAiActFunctions.ts`<br>`Servers/services/reporting/dataCollector.ts` |
| T-011 | Refactor ProjectSettings with split cards & classification | Mid Frontend Developer | T-002, T-008 | Cards split; EU AI Act details conditional; classification card added; no hardcoded default. | `Clients/src/presentation/pages/ProjectView/ProjectSettings/index.tsx` |
| T-012 | Verify ProjectFrameworks empty state & regulation-agnostic copy | Mid Frontend Developer | T-002, T-008 | Empty state copy regulation-agnostic; add/remove works with optional frameworks. | `Clients/src/presentation/pages/ProjectView/ProjectFrameworks/index.tsx` |
| T-013 | Update ProjectView Overview for classification display | Mid Frontend Developer | T-002, T-007 | Overview renders classification; EU AI Act fields hidden/N/A when not selected. | `Clients/src/presentation/pages/ProjectView/V1.0ProjectView/Overview/index.tsx` |
| T-014 | Update ProjectsList & ProjectTableView | Mid Frontend Developer | T-002, T-007 | Frameworks column added; AI risk/role columns conditional; grouping/filter updated. | `Clients/src/presentation/components/ProjectsList/ProjectsList.tsx`<br>`Clients/src/presentation/components/ProjectsList/ProjectTableView.tsx` |
| T-015 | Apply copy updates across forms, settings & home list | Junior Frontend Developer | T-008, T-009, T-011, T-014 | All user-facing strings reflect regulation-agnostic language. | Touched frontend files |

### Wave 4 — Integration Wiring

| ID | Title | Agent | Depends On | Acceptance Criteria | Files |
|---|---|---|---|---|---|
| T-016 | Backend integration support & endpoint finalization | Senior Backend Developer | T-006, T-010 | Endpoints return consistent payloads; optional framework list persisted; classification fields included. | `Servers/controllers/project.ctrl.ts`<br>`Servers/utils/project.utils.ts` |
| T-017 | Frontend integration wiring & end-to-end validation | Senior Frontend Developer | T-008–T-015, T-016 | Full create/edit/view flow tested; payloads match DTOs; UI state syncs after save. | Cross-cutting frontend files |
| T-018 | Migration smoke test & data integrity check | Senior Backend + Senior Frontend | T-004, T-017 | Migration runs against production-like data; existing EU AI Act projects retain values; rollback succeeds. | Migration scripts, staging DB |

### Continuous — QA & DevOps

| ID | Title | Agent | Depends On | Acceptance Criteria | Files |
|---|---|---|---|---|---|
| T-019 | Define test strategy & acceptance suite for Phase 1 | QA Engineer | T-002 | Test plan covers optional frameworks, conditional fields, classification CRUD, guards, copy, migration. | Test plan docs |
| T-020 | Write & execute backend unit/integration tests | QA Engineer | T-006, T-010 | Tests pass for projects with and without EU AI Act. | `Servers/tests/**/*` |
| T-021 | Write & execute frontend component/E2E tests | QA Engineer | T-017 | Tests cover conditional rendering, framework selection, classification fields. | `Clients/src/**/*.{test,spec}.{ts,tsx}`<br>`Clients/e2e/**/*` |
| T-022 | CI/CD pipeline & deployment support | DevOps Engineer | T-004 | Pipeline runs migration in staging; rollback documented; no deployment blockers. | `.github/workflows/`<br>`ansible/`<br>`kubernetes/` |

### Dependency graph summary

```text
T-001 ─┬─ T-003 ─┬─ T-004 ─┬─ T-005 ─┬─ T-006 ─┬─ T-010 ─┬─ T-016 ─┐
       │         │         │         │         │          │        │
       │         │         │         │         │          │        └─ T-018
       │         │         │         │         │          │
T-002 ─┘         │         │         │         │          └─ T-017
                 │         │         │         │
                 │         │         │         └─ T-008 ─┬─ T-009
                 │         │                             │
                 │         │                             ├─ T-011
                 │         │                             │
                 │         │                             ├─ T-012
                 │         │                             │
                 │         │                             ├─ T-013
                 │         │                             │
                 │         │                             ├─ T-014
                 │         │                             │
                 │         │                             └─ T-015
                 │         │
                 │         └─ T-007 ─────────────────────┘
                 │
                 └─ T-019 (Continuous from Wave 2)
```

---

## 7. Recommended Phasing

| Phase | Scope | Goal |
|---|---|---|
| **Phase 1: Core detachment** (this plan) | Optional frameworks, conditional EU AI Act fields, generic classification, non-destructive migration, downstream guards | Unblock users like AI Career Pro; keep existing customers whole |
| **Phase 2: Multi-framework polish** | Promote multi-framework selection, allow NIST AI RMF as project-based, clean up remaining `framework_id === 1` assumptions in trackers/reporting | Make multi-framework a first-class selling point |
| **Phase 3: Platform cleanup** | Generic framework manifest, framework-scoped metadata, refactor EU-specific struct tables toward generic schema | Long-term regulation-agnostic architecture |

---

## 8. Open Questions for Stakeholders

1. **Use case classification values:** Should category/purpose/audience/deployment context be free-text, enums, or configurable per tenant?
2. **NIST AI RMF as project-based:** Should Phase 1 expose NIST AI RMF in the project-based framework list, or wait for Phase 2?
3. **Multi-framework in create form:** Should the create form allow selecting multiple frameworks at once, or only one during Phase 1?
4. **Existing use cases with no framework:** How should the compliance tracker and assessment tracker behave for legacy use cases that have no `projects_frameworks` rows after the change?
5. **Approval workflows:** Should use cases with no framework still support approval workflows in Phase 1?

---

## 9. Approval Gate

This plan should be reviewed and approved before implementation begins. Per the team workflow, the next steps after approval are:

1. Technical Lead publishes the final Task Board.
2. Wave 1 tasks (T-001, T-002, T-003) are assigned and started.
3. QA Engineer begins test planning in parallel with Wave 2.
4. DevOps Engineer prepares migration and deployment pipeline.

---

## 10. Appendices

### A. Agent roster loaded

| Role | Source |
|---|---|
| Orchestrator / Master prompt | `C:\Workspace\verifywise\agents\agent.md` |
| Team Workflow | `C:\Workspace\verifywise\agents\00-TEAM_WORKFLOW.md` |
| Product Manager | `C:\Workspace\verifywise\agents\product-manager.md` |
| Technical Lead | `C:\Workspace\verifywise\agents\technical-lead.md` |
| Senior Backend Developer | `C:\Workspace\verifywise\agents\senior-backend-developer.md` |
| Mid Backend Developer | `C:\Workspace\verifywise\agents\mid-backend-developer.md` |
| Junior Backend Developer | `C:\Workspace\verifywise\agents\junior-backend-developer.md` |
| Senior Frontend Developer | `C:\Workspace\verifywise\agents\senior-frontend-developer.md` |
| Mid Frontend Developer | `C:\Workspace\verifywise\agents\mid-frontend-developer.md` |
| Junior Frontend Developer | `C:\Workspace\verifywise\agents\junior-frontend-developer.md` |
| UX/UI Designer | `C:\Workspace\verifywise\agents\ux-ui-designer.md` |
| QA Engineer | `C:\Workspace\verifywise\agents\qa-engineer.md` |
| DevOps Engineer | `C:\Workspace\verifywise\agents\devops-engineer.md` |

### B. Related files

- Full design brief: `docs/plans/DESIGN_BRIEF-detach-regulations-from-use-cases.md`
