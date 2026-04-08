# Fundamental Rights Impact Assessment (FRIA)

## Overview

The FRIA module implements EU AI Act Article 27 compliance, which requires deployers of high-risk AI systems to perform a fundamental rights impact assessment before putting a system into use. The module provides an 8-section structured assessment with auto-save, snapshot versioning, risk scoring, evidence attachments, and a field-by-field diff viewer for version history.

## EU AI Act Reference

- **Article 27(1)**: Deployers of high-risk AI systems must perform a FRIA before deployment
- **Article 6 / Annex III**: High-risk classification criteria
- **Article 9**: Risk management integration
- **Article 13-14**: Transparency and human oversight requirements
- **Article 49**: Record-keeping and documentation

## Assessment Sections

| # | Section | ID | Description |
|---|---------|-----|-------------|
| 1 | Organisation & system profile | `org-profile` | Deployer org, system name, assessment owner, context |
| 2 | Applicability & scope | `applicability` | High-risk classification, Annex III category, review cycle |
| 3 | Affected persons & groups | `affected-persons` | Impacted groups, vulnerability context, group flags |
| 4 | Fundamental rights matrix | `rights-matrix` | 10 EU Charter rights with flagging, severity, mitigation |
| 5 | Specific risks of harm | `specific-risks` | Risk register with likelihood/severity, import from project risks |
| 6 | Human oversight & transparency | `oversight` | Oversight measures, transparency, redress, data governance |
| 7 | Stakeholder consultation | `consultation` | Legal/DPO/owner review status, stakeholder notes |
| 8 | Summary & recommendation | `summary` | Deployment decision and conditions |

## Default Rights (Section 4)

The 10 fundamental rights assessed, from the EU Charter of Fundamental Rights:

| Key | Title | Charter Reference |
|-----|-------|------------------|
| `human_dignity` | Human dignity | Art. 1 |
| `privacy` | Right to privacy | Art. 7 |
| `data_protection` | Protection of personal data | Art. 8 |
| `non_discrimination` | Non-discrimination | Art. 21 |
| `gender_equality` | Equality between women and men | Art. 23 |
| `fair_working` | Fair and just working conditions | Art. 31 |
| `consumer_protection` | Consumer protection | Art. 38 |
| `freedom_expression` | Freedom of expression | Art. 11 |
| `effective_remedy` | Right to an effective remedy | Art. 47 |
| `child_rights` | Rights of the child | Art. 24 |

## API Endpoints

Base path: `/api/fria`

All endpoints require `authenticateJWT` middleware.

### Assessment CRUD

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/:projectId` | JWT | Get or auto-create FRIA for project |
| `PUT` | `/:projectId` | JWT + Admin/Editor | Update assessment fields |

### Rights

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `PUT` | `/:friaId/rights` | JWT + Admin/Editor | Bulk upsert rights (flagged, severity, etc.) |

### Risk Items

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/:friaId/risk-items` | JWT | List risk items for assessment |
| `POST` | `/:friaId/risk-items` | JWT + Admin/Editor | Add risk item |
| `PUT` | `/:friaId/risk-items/:itemId` | JWT + Admin/Editor | Update risk item |
| `DELETE` | `/:friaId/risk-items/:itemId` | JWT + Admin/Editor | Delete risk item |

### Model Links

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/:friaId/models` | JWT | List linked models |
| `POST` | `/:friaId/models/:modelId` | JWT + Admin/Editor | Link model to FRIA |
| `DELETE` | `/:friaId/models/:modelId` | JWT + Admin/Editor | Unlink model from FRIA |

### Evidence

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/:friaId/evidence/:section` | JWT | Get evidence files for section |
| `POST` | `/:friaId/evidence` | JWT + Admin/Editor | Link evidence file to section |
| `DELETE` | `/:friaId/evidence/:linkId` | JWT + Admin/Editor | Remove evidence link |

### Versioning

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/:friaId/submit` | JWT + Admin/Editor | Save snapshot with optional note |
| `GET` | `/:friaId/versions` | JWT | List all snapshots |
| `GET` | `/:friaId/versions/:version` | JWT | Get specific snapshot |

## Database Schema

### fria_assessments

Core assessment table, one per project (versioned).

```
fria_assessments
├── id (PK, SERIAL)
├── organization_id (FK → organizations, NOT NULL)
├── project_id (FK → projects, NOT NULL)
├── version (INTEGER, DEFAULT 1)
├── status (VARCHAR(30), DEFAULT 'draft')
│
├── Section 1: Organisation & system profile
│   ├── assessment_owner (VARCHAR(255))
│   ├── assessment_date (DATE)
│   └── operational_context (TEXT)
│
├── Section 2: Applicability & scope
│   ├── is_high_risk (VARCHAR(30))
│   ├── high_risk_basis (VARCHAR(100))
│   ├── deployer_type (VARCHAR(100))
│   ├── annex_iii_category (VARCHAR(100))
│   ├── first_use_date (DATE)
│   ├── review_cycle (VARCHAR(50))
│   ├── period_frequency (TEXT)
│   └── fria_rationale (TEXT)
│
├── Section 3: Affected persons
│   ├── affected_groups (TEXT)
│   ├── vulnerability_context (TEXT)
│   └── group_flags (JSONB, DEFAULT '[]')
│
├── Section 5: Specific risks context
│   ├── risk_scenarios (TEXT)
│   └── provider_info_used (TEXT)
│
├── Section 6: Oversight
│   ├── human_oversight (TEXT)
│   ├── transparency_measures (TEXT)
│   ├── redress_process (TEXT)
│   └── data_governance (TEXT)
│
├── Section 7: Consultation
│   ├── legal_review (VARCHAR(20))
│   ├── dpo_review (VARCHAR(20))
│   ├── owner_approval (VARCHAR(20))
│   ├── stakeholders_consulted (TEXT)
│   └── consultation_notes (TEXT)
│
├── Section 8: Summary
│   ├── deployment_decision (VARCHAR(50))
│   └── decision_conditions (TEXT)
│
├── Computed (cached on save)
│   ├── completion_pct (INTEGER, DEFAULT 0)
│   ├── risk_score (INTEGER, DEFAULT 0)
│   ├── risk_level (VARCHAR(10), DEFAULT 'Low')
│   └── rights_flagged (INTEGER, DEFAULT 0)
│
├── Metadata
│   ├── created_by (FK → users, NOT NULL)
│   ├── updated_by (FK → users)
│   ├── created_at (TIMESTAMPTZ)
│   ├── updated_at (TIMESTAMPTZ)
│   ├── is_deleted (BOOLEAN, DEFAULT FALSE)
│   └── deleted_at (TIMESTAMPTZ)
│
└── UNIQUE(project_id, version)
```

### fria_rights

10 rows per assessment, one per EU Charter right.

```
fria_rights
├── id (PK, SERIAL)
├── organization_id (FK → organizations)
├── fria_id (FK → fria_assessments)
├── right_key (VARCHAR(50))
├── right_title (VARCHAR(255))
├── charter_ref (VARCHAR(100))
├── flagged (BOOLEAN, DEFAULT FALSE)
├── severity (INTEGER, DEFAULT 0)
├── confidence (INTEGER, DEFAULT 0)
├── impact_pathway (TEXT)
├── mitigation (TEXT)
├── created_at, updated_at (TIMESTAMPTZ)
├── is_deleted, deleted_at
└── UNIQUE(fria_id, right_key)
```

### fria_risk_items

FRIA-specific risk register.

```
fria_risk_items
├── id (PK, SERIAL)
├── organization_id (FK → organizations)
├── fria_id (FK → fria_assessments)
├── risk_description (TEXT, NOT NULL)
├── likelihood (VARCHAR(10))
├── severity (VARCHAR(10))
├── existing_controls (TEXT)
├── further_action (TEXT)
├── linked_project_risk_id (INTEGER)
├── sort_order (INTEGER, DEFAULT 0)
├── created_at, updated_at (TIMESTAMPTZ)
└── is_deleted, deleted_at
```

### fria_model_links

Links FRIA assessments to model inventory entries.

```
fria_model_links
├── id (PK, SERIAL)
├── organization_id (FK → organizations)
├── fria_id (FK → fria_assessments)
├── model_id (INTEGER, NOT NULL)
├── created_at, updated_at (TIMESTAMPTZ)
├── is_deleted, deleted_at
└── UNIQUE(fria_id, model_id)
```

### fria_snapshots

Version snapshots for audit trail.

```
fria_snapshots
├── id (PK, SERIAL)
├── organization_id (FK → organizations)
├── fria_id (FK → fria_assessments)
├── version (INTEGER, NOT NULL)
├── snapshot_data (JSONB, NOT NULL)
├── snapshot_reason (VARCHAR(255))
├── created_by (FK → users)
├── created_at, updated_at (TIMESTAMPTZ)
└── is_deleted, deleted_at
```

### fria_change_history

Change tracking for audit.

```
fria_change_history
├── id (PK, SERIAL)
├── organization_id (FK → organizations)
├── fria_id (FK → fria_assessments)
├── action (VARCHAR(20))
├── field_name (VARCHAR(255))
├── old_value (TEXT)
├── new_value (TEXT)
├── changed_by_user_id (INTEGER)
├── changed_at (TIMESTAMPTZ)
└── is_deleted, deleted_at
```

## Score Computation

Scores are recomputed on every field save, rights update, and risk item mutation via `computeFriaScore()`.

### Risk Score (0-100)

```
score = 0

For each flagged right:
  score += (severity × 15) + (confidence × 5)

For each risk item:
  L = likelihood_map[likelihood]   // Low=1, Medium=2, High=3
  S = severity_map[severity]       // Low=1, Medium=2, High=3
  score += L × S × 3

score = min(score, 100)
```

### Risk Level

| Score | Level |
|-------|-------|
| 0-29 | Low |
| 30-59 | Medium |
| 60-100 | High |

### Completion Percentage

Counts non-empty fields across all sections:

- 17 assessment text/select fields
- +1 if any right has been assessed (flagged, severity, confidence, impact, or mitigation set)
- +1 if any risk items exist

```
completion_pct = round((filled_fields + rights_complete + risks_complete) / 19 × 100)
```

### Rights Flagged

Count of rights where `flagged = true`.

## Enums

```typescript
enum FriaStatus {
  DRAFT = "draft",
  SUBMITTED = "submitted",
  APPROVED = "approved",
  REJECTED = "rejected",
}

enum FriaRiskLevel { LOW = "Low", MEDIUM = "Medium", HIGH = "High" }
enum FriaLikelihood { LOW = "Low", MEDIUM = "Medium", HIGH = "High" }
enum FriaSeverity { LOW = "Low", MEDIUM = "Medium", HIGH = "High" }
```

## Frontend Architecture

### Component Tree

```
FriaAssessment (index.tsx)
├── StatCard × 4 (completion, risk score, rights flagged, status)
├── Action buttons (Version history, Save snapshot)
├── SectionSidebar (shared component, sticky, 300px)
└── Section stack
    ├── OrgProfileSection
    ├── ApplicabilityScopeSection
    ├── AffectedPersonsSection
    ├── RightsMatrixSection
    ├── SpecificRisksSection
    │   └── FriaRiskImportModal (import from project risks)
    ├── OversightSection
    ├── ConsultationSection
    └── SummarySection

Each section wraps in:
  FriaSectionCard (title, subtitle, EU Act reference, collapsible)
  └── FriaEvidenceButton (attach/view evidence per section)

Modals:
  StandardModal (Save snapshot) → note field
  StandardModal (Version history) → FriaVersionHistory (inline)
```

### Data Flow

```
User types in field
  → Local state updates (useState)
  → onBlur fires dirty check
  → useFria.updateAssessment({ field: value })
  → Debounced (500ms) accumulator batches fields
  → PUT /api/fria/:projectId
  → Backend recomputes scores + persists
  → Frontend updates assessment state
  → "Saved" indicator appears
```

### Auto-Save (Debounce Pattern)

The `useFria` hook accumulates field updates in a `pendingUpdate` ref. Each `updateAssessment()` call merges into the ref and resets a 500ms timer. When the timer fires, all accumulated fields are flushed in a single `PUT` request. On unmount, any pending updates are flushed synchronously.

### Section Sidebar (IntersectionObserver)

The `SectionSidebar` component highlights the active section. An `IntersectionObserver` (threshold 0.3, rootMargin "-100px 0px -60% 0px") monitors all section `<div>` elements and updates `activeSection` state when a section enters the viewport. Clicking a sidebar item smooth-scrolls to the section.

### Version History Diff Viewer

The `FriaVersionHistory` component shows snapshots in a table. Expanding a row computes a field-by-field diff between that snapshot and the previous one:

- **v1 (first)**: Shows all non-empty fields as baseline values
- **v2+**: Shows only changed fields with old (strikethrough) and new (green) values
- Tracks assessment field changes, rights flagging/severity changes, and risk item count changes
- Shows a "3 changes" chip for quick overview

## Evidence Attachments

Each of the 8 sections can have evidence files attached via `FriaEvidenceButton`. Evidence uses the shared `evidenceFiles.utils.ts` system with entity types `section_1` through `section_8`. Files are linked (not copied) via the `file_entity_links` junction table.

## Snapshot System

- **Save snapshot**: Creates a JSONB snapshot of the full assessment (assessment + rights + riskItems + modelLinks), increments version
- **Status**: Changes to `submitted` on snapshot save
- **Unique versions**: Each snapshot gets a unique version number via post-save version bump
- **Audit**: Snapshots are logged to the audit ledger
