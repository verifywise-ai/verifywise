# Intake Form System - Implementation Plan

## Overview

A multi-entity intake form system that allows admins to create drag-and-drop forms for collecting model, use case, and incident submissions from company employees. Forms are publicly accessible (unauthenticated) via unique URLs, and submissions create pending entries that require admin approval.

---

## Table of Contents

1. [Requirements Summary](#requirements-summary)
2. [Architecture Overview](#architecture-overview)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Frontend Components](#frontend-components)
6. [Email Notifications](#email-notifications)
7. [Implementation Phases](#implementation-phases)
8. [File Structure](#file-structure)

---

## Requirements Summary

| Requirement | Decision |
|-------------|----------|
| Form Builder | Full drag-and-drop visual editor |
| Public Access | Unauthenticated via `/intake/:tenantSlug/:formSlug` |
| Submitter Info | Name + Email always collected (no domain restriction) |
| CAPTCHA | Simple math question, regenerate on wrong answer |
| On Submit | Creates "pending" entity immediately |
| Confirmation | Email to submitter with submission copy |
| Admin Notification | Email to all admins (on submission AND approval/rejection) |
| Approval UI | Modal in entity dashboard, badge on tab with count |
| Approval Action | Approve/reject as-is, rejection reason required |
| Rejected Entity | Keeps "rejected" status (Model) / "Under review" stays (Use Case) |
| Resubmission | Pre-filled form, creates NEW submission + entity |
| TTL | Form unavailable after expiry (DatePicker for input) |
| Expired Forms | Auto-archive, cannot be restored |
| Form Deletion | Archive only (drafts can be permanently deleted) |
| Multi-entity | Phase 1: Models, Use Cases. Phase 2+: Incidents |
| Multi-tenant | Tenant-scoped forms and submissions |
| Rate Limit | 100 submissions/IP/hour |
| Preview | `?preview=true` flag, skips submission |
| Auto-save | Every 30 seconds with visual indicator |
| Textarea max | 5000 characters default |
| Slug collision | Append number (`-2`, `-3`, etc.) |

### Entity Status Mapping

| Entity | On Submission Status | On Rejection Status |
|--------|---------------------|---------------------|
| Model Inventory | `Pending` | `Rejected` (new status to add) |
| Use Case (Project) | `Under review` | `Rejected` |
| Incident (Phase 2) | `Open` + `approval_status: Pending` | `Open` + `approval_status: Rejected` |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        ADMIN FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│  /intake-forms          → List all forms                        │
│  /intake-forms/new      → Drag-drop builder (create)            │
│  /intake-forms/:id/edit → Drag-drop builder (edit)              │
│  /intake-forms/:id      → View form details + submissions       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       PUBLIC FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│  /intake/:tenantSlug/:formSlug              → Public form       │
│  /intake/:tenantSlug/:formSlug/submitted    → Thank you page    │
│  /intake/:tenantSlug/:formSlug?resubmit=:id → Pre-filled form   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      APPROVAL FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│  /model-inventory?tab=pending    → Pending model submissions    │
│  /use-cases?tab=pending          → Pending use case submissions │
│  /incidents?tab=pending          → Pending incident submissions │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Table: `intake_forms`

Stores form definitions created by admins.

```sql
CREATE TABLE intake_forms (
  id SERIAL PRIMARY KEY,

  -- Form identification
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  slug VARCHAR(255) NOT NULL,  -- Auto-generated from name

  -- Entity configuration
  entity_type VARCHAR(50) NOT NULL,  -- 'model' | 'use_case' | 'incident'

  -- Form schema (JSON)
  schema JSONB NOT NULL DEFAULT '{"version":"1.0","fields":[]}',

  -- Settings
  submit_button_text VARCHAR(100) DEFAULT 'Submit',

  -- Lifecycle
  status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- 'draft' | 'active' | 'expired' | 'archived'
  ttl_expires_at TIMESTAMPTZ,  -- NULL = no expiry

  -- Audit
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(slug)  -- Unique within organization
);

CREATE INDEX idx_intake_forms_status ON intake_forms(status);
CREATE INDEX idx_intake_forms_entity_type ON intake_forms(entity_type);
CREATE INDEX idx_intake_forms_slug ON intake_forms(slug);
```

### Table: `intake_submissions`

Stores form submissions from public users.

```sql
CREATE TABLE intake_submissions (
  id SERIAL PRIMARY KEY,

  -- Form reference
  form_id INTEGER NOT NULL REFERENCES intake_forms(id),

  -- Submitter info (always collected)
  submitter_name VARCHAR(255) NOT NULL,
  submitter_email VARCHAR(255) NOT NULL,

  -- Submission data (JSON)
  submission_data JSONB NOT NULL,

  -- Entity reference (created on submission)
  entity_type VARCHAR(50) NOT NULL,  -- 'model' | 'use_case' | 'incident'
  entity_id INTEGER NOT NULL,  -- FK to respective entity table

  -- Approval workflow
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,  -- Required when status = 'rejected'

  -- Resubmission tracking
  original_submission_id INTEGER REFERENCES intake_submissions(id),  -- NULL if original

  -- Resubmission token (for pre-filled form link)
  resubmit_token UUID DEFAULT gen_random_uuid(),

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(resubmit_token)
);

CREATE INDEX idx_intake_submissions_form_id ON intake_submissions(form_id);
CREATE INDEX idx_intake_submissions_status ON intake_submissions(status);
CREATE INDEX idx_intake_submissions_entity ON intake_submissions(entity_type, entity_id);
CREATE INDEX idx_intake_submissions_resubmit_token ON intake_submissions(resubmit_token);
```

### Form Schema JSON Structure

```typescript
interface FormSchema {
  version: "1.0";
  fields: FormField[];
}

interface FormField {
  id: string;  // UUID
  type: FieldType;
  label: string;
  placeholder?: string;
  helpText?: string;  // Always visible below field
  required: boolean;

  // Validation (type-specific)
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;  // Regex
  };

  // Options (for select, multi-select, radio, checkbox)
  options?: Array<{ value: string; label: string }>;

  // Entity field mapping
  mapTo?: string;  // e.g., "model.provider", "model.capabilities"
}

type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'date'
  | 'select'
  | 'multi-select'
  | 'radio'
  | 'checkbox'
  | 'section-header'
  | 'description-block'
  | 'divider';
```

### Entity Field Mappings

#### Model Inventory
```typescript
const MODEL_MAPPABLE_FIELDS = {
  'model.provider': { label: 'Provider', type: 'text', required: true },
  'model.model': { label: 'Model Name', type: 'text', required: true },
  'model.version': { label: 'Version', type: 'text', required: true },
  'model.capabilities': { label: 'Capabilities', type: 'textarea', required: true },
  'model.biases': { label: 'Known Biases', type: 'textarea', required: false },
  'model.limitations': { label: 'Limitations', type: 'textarea', required: false },
  'model.hosting_provider': { label: 'Hosting Provider', type: 'text', required: false },
  'model.reference_link': { label: 'Reference Link', type: 'text', required: false },
};
```

#### Use Case (Project)
```typescript
const USE_CASE_MAPPABLE_FIELDS = {
  'use_case.project_title': { label: 'Title', type: 'text', required: true },
  'use_case.goal': { label: 'Goal', type: 'textarea', required: true },
  'use_case.description': { label: 'Description', type: 'textarea', required: false },
  'use_case.ai_risk_classification': {
    label: 'AI Risk Classification',
    type: 'select',
    options: ['high risk', 'limited risk', 'minimal risk'],
    required: true
  },
  'use_case.type_of_high_risk_role': {
    label: 'High Risk Role Type',
    type: 'select',
    options: ['deployer', 'provider', 'distributor', 'importer', 'product manufacturer', 'authorized representative'],
    required: true
  },
  'use_case.target_industry': { label: 'Target Industry', type: 'text', required: false },
};
```

#### Incident (Phase 2+)
```typescript
// TO BE IMPLEMENTED IN PHASE 2
const INCIDENT_MAPPABLE_FIELDS = {
  'incident.ai_project': { label: 'AI Project', type: 'text', required: true },
  'incident.type': {
    label: 'Incident Type',
    type: 'select',
    options: ['Malfunction', 'Unexpected behavior', 'Model drift', 'Misuse', 'Data corruption', 'Security breach', 'Performance degradation'],
    required: true
  },
  'incident.severity': {
    label: 'Severity',
    type: 'select',
    options: ['Minor', 'Serious', 'Very serious'],
    required: true
  },
  'incident.description': { label: 'Description', type: 'textarea', required: true },
  'incident.categories_of_harm': {
    label: 'Categories of Harm',
    type: 'multi-select',
    options: ['Health', 'Safety', 'Rights', 'Property', 'Environment'],
    required: true
  },
  'incident.affected_persons_groups': { label: 'Affected Persons/Groups', type: 'textarea', required: false },
  'incident.immediate_mitigations': { label: 'Immediate Mitigations', type: 'textarea', required: false },
  'incident.planned_corrective_actions': { label: 'Planned Corrective Actions', type: 'textarea', required: false },
};
```

### Pre-requisite: Model Inventory Status Update

Before implementation, add "Rejected" to ModelInventoryStatus enum:

```typescript
// Servers/domain.layer/enums/model-inventory-status.enum.ts
export enum ModelInventoryStatus {
  APPROVED = "Approved",
  RESTRICTED = "Restricted",
  PENDING = "Pending",
  BLOCKED = "Blocked",
  REJECTED = "Rejected",  // NEW - for rejected intake submissions
}
```

---

## API Endpoints

### Admin Routes (Authenticated)

```
GET    /api/intake-forms                    # List all forms
POST   /api/intake-forms                    # Create form
GET    /api/intake-forms/:id                # Get form by ID
PUT    /api/intake-forms/:id                # Update form
DELETE /api/intake-forms/:id                # Soft delete (archive)
POST   /api/intake-forms/:id/duplicate      # Duplicate form as draft
POST   /api/intake-forms/:id/publish        # Publish draft form
POST   /api/intake-forms/:id/archive        # Archive form

GET    /api/intake-forms/:id/submissions    # Get submissions for form
```

### Public Routes (Unauthenticated)

```
GET    /api/public/intake/:tenantSlug/:formSlug              # Get form for rendering
POST   /api/public/intake/:tenantSlug/:formSlug              # Submit form
GET    /api/public/intake/:tenantSlug/:formSlug/resubmit/:token  # Get pre-filled data
```

### Approval Routes (Admin)

```
GET    /api/intake-submissions/pending                # All pending (cross-entity)
GET    /api/intake-submissions/pending/:entityType    # Pending by entity type
GET    /api/intake-submissions/:id                    # Get submission details
POST   /api/intake-submissions/:id/approve            # Approve submission
POST   /api/intake-submissions/:id/reject             # Reject with reason
```

---

## Frontend Components

### Form Builder Components

```
/Clients/src/presentation/components/IntakeFormBuilder/
├── index.tsx                    # Main builder container
├── FieldPalette/
│   └── index.tsx                # Left sidebar with draggable field types
├── FormCanvas/
│   └── index.tsx                # Center drop zone with sortable fields
├── FieldCard/
│   └── index.tsx                # Draggable field on canvas
├── FieldEditor/
│   └── index.tsx                # Right sidebar for field properties
├── FormSettings/
│   └── index.tsx                # Modal for form settings (TTL, button text)
├── FormPreview/
│   └── index.tsx                # Preview modal (opens new tab)
└── types.ts                     # TypeScript interfaces
```

### Public Form Components

```
/Clients/src/presentation/components/IntakeForm/
├── index.tsx                    # Main public form renderer
├── FormField/
│   └── index.tsx                # Renders single field based on type
├── MathCaptcha/
│   └── index.tsx                # Math question component
└── SubmittedPage/
    └── index.tsx                # Thank you page
```

### Admin Pages

```
/Clients/src/presentation/pages/IntakeForms/
├── index.tsx                    # List page (/intake-forms)
├── IntakeFormBuilder/
│   └── index.tsx                # Builder page (/intake-forms/new, /intake-forms/:id/edit)
└── IntakeFormSubmissions/
    └── index.tsx                # Submissions list (/intake-forms/:id/submissions)
```

### Public Pages

```
/Clients/src/presentation/pages/PublicIntake/
├── index.tsx                    # Public form page (/intake/:tenantSlug/:formSlug)
└── Submitted/
    └── index.tsx                # Thank you page
```

### Approval Components (in existing entity pages)

```
/Clients/src/presentation/components/PendingSubmissions/
├── index.tsx                    # Tab/section component for entity dashboards
├── SubmissionCard/
│   └── index.tsx                # Card in pending list
├── SubmissionModal/
│   └── index.tsx                # Modal for viewing submission details
└── RejectModal/
    └── index.tsx                # Modal for rejection reason
```

---

## Email Notifications

### Templates to Create

1. **intake-submission-confirmation.mjml** - To submitter after submission
2. **intake-admin-notification.mjml** - To all admins when new submission
3. **intake-approved.mjml** - To submitter when approved
4. **intake-rejected.mjml** - To submitter when rejected (with reason + resubmit link)

### Template Variables

#### Submission Confirmation
```
{{submitter_name}}
{{form_name}}
{{entity_type}}
{{submission_summary}}  // Formatted key-value pairs
{{submission_date}}
```

#### Admin Notification
```
{{submitter_name}}
{{submitter_email}}
{{form_name}}
{{entity_type}}
{{entity_name}}  // e.g., model name
{{review_link}}
```

#### Approved
```
{{submitter_name}}
{{form_name}}
{{entity_type}}
{{entity_name}}
{{entity_link}}  // Link to view entity
```

#### Rejected
```
{{submitter_name}}
{{form_name}}
{{entity_type}}
{{entity_name}}
{{rejection_reason}}
{{resubmit_link}}
```

---

## Implementation Phases

### Phase 1: Database Foundation (Backend)
**Estimated files: 5**

1. Create migration for `intake_forms` table
2. Create migration for `intake_submissions` table
3. Create TypeScript interfaces (`i.intakeForm.ts`, `i.intakeSubmission.ts`)
4. Create Sequelize models
5. Create enums (`intake-form-status.enum.ts`, `intake-entity-type.enum.ts`)

### Phase 2: Admin CRUD API (Backend)
**Estimated files: 4**

1. Create `intakeForm.utils.ts` - Database queries
2. Create `intakeForm.ctrl.ts` - Controllers
3. Create `intakeForm.route.ts` - Routes
4. Register routes in `index.ts`

### Phase 3: Public Submission API (Backend)
**Estimated files: 3**

1. Create `publicIntake.utils.ts` - Public queries (cross-tenant lookup)
2. Create `publicIntake.ctrl.ts` - Public controllers
3. Create `publicIntake.route.ts` - Public routes (no auth)
4. Add rate limiting middleware
5. Implement math CAPTCHA validation

### Phase 4: Entity Creation Logic (Backend)
**Estimated files: 3**

1. Create `intakeEntityFactory.ts` - Factory for creating entities from submission
2. Implement model inventory creation from submission
3. Implement use case (project) creation from submission
4. Implement incident creation from submission

### Phase 5: Approval API (Backend)
**Estimated files: 2**

1. Create `intakeApproval.utils.ts` - Approval queries
2. Create `intakeApproval.ctrl.ts` - Approval controllers
3. Add approval routes to existing routes

### Phase 6: Email Notifications (Backend)
**Estimated files: 5**

1. Create `intake-submission-confirmation.mjml`
2. Create `intake-admin-notification.mjml`
3. Create `intake-approved.mjml`
4. Create `intake-rejected.mjml`
5. Create `intakeEmail.utils.ts` - Email sending functions

### Phase 7: Form Builder UI (Frontend)
**Estimated files: 10**

1. Create `IntakeFormBuilder/index.tsx`
2. Create `FieldPalette/index.tsx`
3. Create `FormCanvas/index.tsx`
4. Create `FieldCard/index.tsx`
5. Create `FieldEditor/index.tsx`
6. Create `FormSettings/index.tsx`
7. Create `types.ts`
8. Install `@dnd-kit/core` and `@dnd-kit/sortable`
9. Create builder page `/intake-forms/new`
10. Create edit page `/intake-forms/:id/edit`

### Phase 8: Form List & Management UI (Frontend)
**Estimated files: 5**

1. Create `IntakeForms/index.tsx` - List page
2. Create form table component
3. Create form card component
4. Create duplicate/archive actions
5. Add routes to router

### Phase 9: Public Form Renderer (Frontend)
**Estimated files: 6**

1. Create `IntakeForm/index.tsx` - Main renderer
2. Create `FormField/index.tsx` - Field renderer
3. Create `MathCaptcha/index.tsx`
4. Create `SubmittedPage/index.tsx`
5. Create public page layout (no auth header)
6. Add public routes

### Phase 10: Approval Dashboard (Frontend)
**Estimated files: 5**

1. Create `PendingSubmissions/index.tsx`
2. Create `SubmissionCard/index.tsx`
3. Create `SubmissionModal/index.tsx`
4. Create `RejectModal/index.tsx`
5. Integrate into Model Inventory, Use Cases, Incidents pages

### Phase 11: Testing & Polish
**Estimated files: 0 (testing)**

1. Test form creation flow
2. Test public submission flow
3. Test approval/rejection flow
4. Test email notifications
5. Test TTL expiry
6. Test resubmission flow
7. Test multi-tenant isolation

---

## File Structure

### Backend Files

```
Servers/
├── database/migrations/
│   ├── YYYYMMDDHHMMSS-create-intake-forms-table.js
│   └── YYYYMMDDHHMMSS-create-intake-submissions-table.js
├── domain.layer/
│   ├── interfaces/
│   │   ├── i.intakeForm.ts
│   │   └── i.intakeSubmission.ts
│   ├── models/
│   │   ├── intakeForm/
│   │   │   └── intakeForm.model.ts
│   │   └── intakeSubmission/
│   │       └── intakeSubmission.model.ts
│   └── enums/
│       ├── intake-form-status.enum.ts
│       └── intake-entity-type.enum.ts
├── controllers/
│   ├── intakeForm.ctrl.ts
│   ├── publicIntake.ctrl.ts
│   └── intakeApproval.ctrl.ts
├── routes/
│   ├── intakeForm.route.ts
│   └── publicIntake.route.ts
├── utils/
│   ├── intakeForm.utils.ts
│   ├── publicIntake.utils.ts
│   ├── intakeApproval.utils.ts
│   ├── intakeEntityFactory.ts
│   └── intakeEmail.utils.ts
├── middleware/
│   └── rateLimitIntake.middleware.ts
└── templates/
    ├── intake-submission-confirmation.mjml
    ├── intake-admin-notification.mjml
    ├── intake-approved.mjml
    └── intake-rejected.mjml
```

### Frontend Files

```
Clients/src/
├── presentation/
│   ├── components/
│   │   ├── IntakeFormBuilder/
│   │   │   ├── index.tsx
│   │   │   ├── FieldPalette/
│   │   │   │   └── index.tsx
│   │   │   ├── FormCanvas/
│   │   │   │   └── index.tsx
│   │   │   ├── FieldCard/
│   │   │   │   └── index.tsx
│   │   │   ├── FieldEditor/
│   │   │   │   └── index.tsx
│   │   │   ├── FormSettings/
│   │   │   │   └── index.tsx
│   │   │   └── types.ts
│   │   ├── IntakeForm/
│   │   │   ├── index.tsx
│   │   │   ├── FormField/
│   │   │   │   └── index.tsx
│   │   │   ├── MathCaptcha/
│   │   │   │   └── index.tsx
│   │   │   └── SubmittedPage/
│   │   │       └── index.tsx
│   │   └── PendingSubmissions/
│   │       ├── index.tsx
│   │       ├── SubmissionCard/
│   │       │   └── index.tsx
│   │       ├── SubmissionModal/
│   │       │   └── index.tsx
│   │       └── RejectModal/
│   │           └── index.tsx
│   └── pages/
│       ├── IntakeForms/
│       │   ├── index.tsx
│       │   ├── IntakeFormBuilder/
│       │   │   └── index.tsx
│       │   └── IntakeFormSubmissions/
│       │       └── index.tsx
│       └── PublicIntake/
│           ├── index.tsx
│           └── Submitted/
│               └── index.tsx
├── application/
│   ├── repository/
│   │   └── intakeForm.repository.ts
│   └── hooks/
│       └── useIntakeForms.ts
└── domain/
    ├── interfaces/
    │   ├── i.intakeForm.ts
    │   └── i.intakeSubmission.ts
    └── enums/
        ├── intakeFormStatus.enum.ts
        └── intakeEntityType.enum.ts
```

---

## Dependencies to Install

### Backend
- None (using existing Sequelize, Express, MJML)

### Frontend
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

## Next Steps

1. Review and approve this implementation plan
2. Start with Phase 1: Database Foundation
3. Proceed through phases sequentially
4. Test each phase before moving to next

---

*Document created: January 2026*
*Last updated: January 2026*
