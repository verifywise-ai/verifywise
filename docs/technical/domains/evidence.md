# Evidence & File Management Domain

## Overview

The Evidence & File Management domain provides centralized storage, tracking, and linking of compliance evidence across VerifyWise. It supports file uploads with BLOB storage, evidence categorization, multi-entity linking, and comprehensive audit trails for regulatory compliance documentation.

## Key Features

- Centralized evidence registry with categorization
- Database BLOB storage for files
- Multi-entity linking (models, policies, controls, assessments)
- File access logging for audit trails
- Evidence expiration tracking
- Change history for evidence modifications
- Role-based access control

## Database Schema

### Evidence Hub Table

```
evidence_hub
├── id (PK, SERIAL)
├── evidence_name (VARCHAR(255) NOT NULL)
├── evidence_type (VARCHAR(100) NOT NULL)
├── description (TEXT, nullable)
├── evidence_files (JSONB, default=[])
├── expiry_date (TIMESTAMP, nullable)
├── mapped_model_ids (INTEGER[], nullable)
├── mapped_risk_ids (INTEGER[], nullable)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

### Files Table

```
files
├── id (PK, SERIAL)
├── filename (VARCHAR)
├── content (BLOB) -- Binary content
├── type (VARCHAR) -- MIME type
├── size (BIGINT, nullable)
├── file_path (VARCHAR(500), nullable)
├── project_id (FK → projects, nullable)
├── org_id (FK → organizations, nullable)
├── model_id (INTEGER, nullable)
├── uploaded_by (FK → users)
├── uploaded_time (DATE)
├── source (ENUM)
├── is_demo (BOOLEAN, default: false)
├── tags (TEXT[], nullable) -- Categorization tags
├── review_status (ENUM, nullable) -- Draft/Pending/Approved/Rejected/Expired
├── version (VARCHAR, nullable) -- Document version
├── expiry_date (TIMESTAMP, nullable) -- Document expiration
├── description (TEXT, nullable) -- File description
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

### File Access Log Table

```
file_access_logs
├── id (PK, SERIAL)
├── file_id (FK → files)
├── accessed_by (FK → users)
├── access_date (TIMESTAMP, default: NOW())
├── action (ENUM: download/view)
└── org_id (FK → organizations)
```

### CE Marking Evidence Table

```
ce_marking_evidences (junction table)
├── ce_marking_id (FK → ce_markings)
├── file_id (FK → files)
├── linked_by (FK → users)
└── linked_at (TIMESTAMP)
```

## Enumerations

### Evidence Type

```typescript
enum EvidenceType {
  MODEL_CARD = "Model Card"
  RISK_ASSESSMENT_REPORT = "Risk Assessment Report"
  BIAS_AND_FAIRNESS_REPORT = "Bias and Fairness Report"
  SECURITY_ASSESSMENT_REPORT = "Security Assessment Report"
  DATA_PROTECTION_IMPACT_ASSESSMENT = "Data Protection Impact Assessment"
  ROBUSTNESS_AND_STRESS_TEST_REPORT = "Robustness and Stress Test Report"
  EVALUATION_METRICS_SUMMARY = "Evaluation Metrics Summary"
  HUMAN_OVERSIGHT_PLAN = "Human Oversight Plan"
  POST_MARKET_MONITORING_PLAN = "Post-Market Monitoring Plan"
  VERSION_CHANGE_LOG = "Version Change Log"
  THIRD_PARTY_AUDIT_REPORT = "Third-Party Audit Report"
  CONFORMITY_ASSESSMENT_REPORT = "Conformity Assessment Report"
  TECHNICAL_FILE = "Technical File / CE Documentation"
  VENDOR_MODEL_DOCUMENTATION = "Vendor Model Documentation"
  INTERNAL_APPROVAL_RECORD = "Internal Approval Record"
}
```

### File Review Status

```typescript
type ReviewStatus =
  | "draft" // Initial state, under development
  | "pending_review" // Submitted for review
  | "approved" // Reviewed and approved
  | "rejected" // Reviewed and rejected
  | "expired"; // Past expiry date
```

### File Source

```typescript
enum FileSource {
  // Assessment groups
  "Assessment tracker group"
  "Compliance tracker group"
  "Management system clauses group"
  "Reference controls group"
  "Main clauses group"
  "Annex controls group"
  "AI trust center group"

  // Reports
  "Project risks report"
  "Compliance tracker report"
  "Assessment tracker report"
  "Vendors and risks report"
  "All reports"
  "Clauses and annexes report"
  "ISO 27001 report"
  "Models and risks report"
  "Training registry report"
  "Policy manager report"
  "Post-Market Monitoring report"

  // File Manager
  "File Manager"
  "policy_editor"
}
```

## API Endpoints

### Evidence Hub

| Method | Endpoint           | Description        |
| ------ | ------------------ | ------------------ |
| GET    | `/evidenceHub/`    | Get all evidence   |
| GET    | `/evidenceHub/:id` | Get evidence by ID |
| POST   | `/evidenceHub/`    | Create evidence    |
| PATCH  | `/evidenceHub/:id` | Update evidence    |
| DELETE | `/evidenceHub/:id` | Delete evidence    |

### File Manager

| Method | Endpoint                      | Description                                  | Access                  |
| ------ | ----------------------------- | -------------------------------------------- | ----------------------- |
| POST   | `/file-manager/`              | Upload file                                  | Admin, Editor, Reviewer |
| GET    | `/file-manager/`              | List all files                               | All authenticated       |
| GET    | `/file-manager/with-metadata` | List files with full metadata                | All authenticated       |
| GET    | `/file-manager/highlighted`   | Get highlighted files (due, pending, recent) | All authenticated       |
| GET    | `/file-manager/:id`           | Download file                                | All authenticated       |
| GET    | `/file-manager/:id/metadata`  | Get file metadata                            | All authenticated       |
| PATCH  | `/file-manager/:id/metadata`  | Update file metadata                         | Admin, Editor, Reviewer |
| GET    | `/file-manager/:id/preview`   | Preview file (max 5MB)                       | All authenticated       |
| DELETE | `/file-manager/:id`           | Delete file                                  | Admin, Editor, Reviewer |

**Query parameters:**

- POST: `model_id`, `source`
- GET list: `page`, `pageSize`
- GET highlighted: `daysUntilExpiry` (default 30), `recentDays` (default 7)

### Files

| Method | Endpoint     | Description                |
| ------ | ------------ | -------------------------- |
| GET    | `/files/:id` | Get file content           |
| GET    | `/files`     | Get user files metadata    |
| POST   | `/files`     | Upload file for assessment |

### Evidence AI

| Method | Endpoint                                 | Description                            |
| ------ | ---------------------------------------- | -------------------------------------- |
| POST   | `/evidence-ai/analyze/:fileId`           | Analyze a file and grade its quality   |
| GET    | `/evidence-ai/analysis/:fileId`          | Stored analysis for a file             |
| GET    | `/evidence-ai/quality-scores`            | Quality scores across the organization |
| GET    | `/evidence-ai/gaps`                      | Evidence coverage per requirement      |
| GET    | `/evidence-ai/suggestions/:fileId`       | Suggested control links for a file     |
| POST   | `/evidence-ai/suggestions/:fileId/apply` | Create links from accepted suggestions |

`GET /gaps` takes `framework_type` (`eu_ai_act` or `iso_42001`; both when omitted, and an
unrecognized value returns nothing rather than quietly answering for another framework) and
`low_grades` (default `D,F`). `getEvidenceGapsQuery` also accepts a `projectId`, which restricts
counted evidence to files uploaded under that project (used by the advisor tool, not the HTTP
route). It classifies every requirement as `no_evidence`, `low_quality` — evidence exists but none
of it is graded above the low bar, which includes files with no AI analysis at all — or `adequate`,
and returns the non-adequate ones plus the summary counts. **Evidence coverage** on
**Model inventory → Evidence hub** renders it
(`Clients/src/presentation/pages/ModelInventory/EvidenceCoveragePanel.tsx`).

#### Counting evidence against a requirement

Evidence is attached from several drawers, and each writes a different kind of id into
`file_entity_links.entity_id`. The gap query maps each id space onto the requirement's template id
before counting (`Servers/utils/evidenceAi.utils.ts`, `EVIDENCE_REQUIREMENT_SOURCES`):

| Framework   | `entity_type`    | `entity_id` is                                           | Counted against               |
| ----------- | ---------------- | -------------------------------------------------------- | ----------------------------- |
| `eu_ai_act` | `control`        | `controls_struct_eu.id` (AI suggestion accepted)         | itself                        |
| `eu_ai_act` | `subcontrol`     | `subcontrols_eu.id` (subcontrol drawer)                  | `controls_eu.control_meta_id` |
| `iso_42001` | `control`        | `annexcategories_struct_iso.id` (AI suggestion accepted) | itself                        |
| `iso_42001` | `annex_category` | `annexcategories_iso.id` (annex drawer)                  | `annexcategory_meta_id`       |

Two entity types are deliberately **not** counted, because they belong to a different axis and have
no path to a control or annex category:

- `eu_ai_act` / `assessment` stores an `answers_eu` id. Answers hang off
  `questions_struct_eu → subtopics → topics`, which never reaches `controls_struct_eu` — the
  assessment tracker is separate from the compliance tracker.
- `iso_42001` / `subclause` stores a `subclauses_iso` id, which belongs to the clause axis.

Counting those ids as control ids is what made the report wrong before: a subcontrol or answer id
was joined straight onto the struct table, so a control could show evidence it did not have, or a
gap it did not have. `getEvidenceGapsQuery` logs the organization's links by entity type before
counting, marking the ones it cannot attribute `NOT COUNTED` — that line explains a report that
reads 0% while files exist.

## Evidence File Structure

```typescript
interface FileResponse {
  id: number;
  filename: string;
  size: number;
  mimetype: string;
  upload_date: string;
  uploaded_by: number;
}

interface IEvidenceHub {
  id?: number;
  evidence_name: string;
  evidence_type: string;
  description?: string | null;
  evidence_files: FileResponse[];
  expiry_date?: Date | string;
  mapped_model_ids?: number[] | null;
  mapped_risk_ids?: number[] | null;
  created_at?: Date;
  updated_at?: Date;
}
```

## Highlighted Files Response

The `/file-manager/highlighted` endpoint returns files that need attention:

```typescript
{
  dueForUpdate: number[],      // Files expiring within daysUntilExpiry
  pendingApproval: number[],   // Files with review_status = 'pending_review'
  recentlyModified: number[]   // Files updated within recentDays
}
```

## File Metadata Update Request

```typescript
PATCH /file-manager/:id/metadata
{
  tags?: string[],           // Array of categorization tags
  review_status?: string,    // draft | pending_review | approved | rejected | expired
  version?: string,          // Version identifier
  expiry_date?: string,      // ISO date string
  description?: string       // File description
}
```

## Create Evidence Request

```typescript
POST /
  evidenceHub /
  {
    evidence_name: "GPT-4 Model Card",
    evidence_type: "Model Card",
    description: "Official model documentation",
    evidence_files: [
      {
        id: 1,
        filename: "gpt4-model-card.pdf",
        size: 245000,
        mimetype: "application/pdf",
        upload_date: "2025-01-15",
        uploaded_by: 5,
      },
    ],
    expiry_date: "2026-01-15",
    mapped_model_ids: [1, 3, 5],
    mapped_risk_ids: [12],
  };
```

## File Upload

### Allowed MIME Types

**Documents:**

- PDF (`.pdf`)
- Word (`.doc`, `.docx`)
- Excel (`.xls`, `.xlsx`)
- CSV (`.csv`)
- Markdown (`.md`)

**Images:**

- JPEG (`.jpg`, `.jpeg`)
- PNG (`.png`)
- GIF (`.gif`)
- WebP (`.webp`)
- SVG (`.svg`)
- BMP (`.bmp`)
- TIFF (`.tiff`)

**Videos:**

- MP4 (`.mp4`)
- MPEG (`.mpeg`)
- MOV (`.mov`)
- AVI (`.avi`)
- WMV (`.wmv`)
- WebM (`.webm`)
- MKV (`.mkv`)

### Upload Limits

- Max file size: 30MB
- Rate limiting applied via `fileOperationsLimiter`

### Upload Flow

```
[File Upload] → [Multer Memory Storage]
     ↓
[Validate MIME Type]
     ↓
[Sanitize Filename]
     ↓
[Insert BLOB to Database]
     ↓
[Return FileModel with ID]
```

### Filename Sanitization

```typescript
sanitizedFilename = filename.replace(/[^a-zA-Z0-9-_\.]/g, "_");
```

## Entity Relationships

### Model Inventory

```
Evidence ──── mapped_model_ids ──── Model Inventory
```

Evidence linked via `mapped_model_ids` array. Changes tracked in model change history.

### Risks

```
Evidence ──── mapped_risk_ids ──── Risks
```

Evidence linked via `mapped_risk_ids` array (set from the "Mapped risks"
multi-select in the evidence modal). The nightly evidence-freshness sweep
(`evidence_freshness_sweep`, 05:00) flags risks whose mapped evidence is past
its `expiry_date` or untouched for 90 days by setting
`risks.evidence_stale_at`, and notifies the risk owner in-app
(`evidence_stale`). A freshly flagged risk still sitting at
`mitigation_status = 'Completed'` is knocked down to `'Requires review'` —
stale evidence contradicts a completed mitigation, and `'Completed'` is the
only status that claim is made from. The flag, the downgrade and the risk
change-history entry for it (`recordEntityFieldChangeBulk`: actor `NULL` and
`changed_by_system = true`, so the history panel shows "System" rather than
"Deleted User") commit in one transaction, so a crash can't
leave a risk flagged but still `'Completed'`; the matching audit-ledger
entries are appended only after the commit. Clearing the flag deliberately
does not restore the status: re-attesting a mitigation as complete is a human
act. The sweep
owns both the set and the clear, and its summary
(`{ organization_id, stale, downgraded, cleared, notified }`) is the response
body of `POST /api/evidenceHub/freshness-sweep`.

### Policies

```
Evidence ──── ce_marking_evidences ──── CE Marking/Policy
```

Evidence linked through junction table with `linked_by` and `linked_at` timestamps.

### Compliance Controls

Evidence linked via `evidence_links` JSONB field on:

- Subclauses (ISO 27001, ISO 42001, NIST AI RMF)
- Annex Controls

### Assessments

Evidence files attached to assessment answers via:

- `evidence_files` array on question records
- `parent_id` (topic), `sub_id` (subtopic), `meta_id` (question)

## Change Tracking

### Evidence Operations

| Operation              | Change Record                                 |
| ---------------------- | --------------------------------------------- |
| Create                 | "Evidence added: {name} ({type})" per model   |
| Update (field)         | "{Field}: {old} → {new}"                      |
| Update (model added)   | "Evidence added: {name} ({type})"             |
| Update (model removed) | "Evidence removed: {name} ({type})"           |
| Delete                 | "Evidence removed: {name} ({type})" per model |

### File Access Logging

```typescript
{
  file_id: number,
  accessed_by: number,
  access_date: Date,
  action: "download" | "view",
  org_id: number
}
```

## Frontend Structure

### Evidence Hub Table

**Location:** `pages/ModelInventory/evidenceHubTable.tsx`

**Features:**

- Sortable columns (localStorage persistence)
- Pagination (default 10 rows)
- User/model name mapping
- Edit/delete actions
- File icons
- Tooltip support

**Columns:**

- evidence_name
- evidence_type
- mapped_models
- uploaded_by
- uploaded_on
- expiry_date
- actions

### Evidence Hub Modal

**Location:** `components/Modals/EvidenceHub/index.tsx`

**Fields:**

- evidence_name (text, required)
- evidence_type (select dropdown)
- description (textarea)
- evidence_files (file upload)
- mapped_model_ids (multi-select)
- mapped_risk_ids (multi-select)
- expiry_date (date picker)

### Link Evidence Selector Modal

**Location:** `components/Policies/LinkEvidenceSelectorModal.tsx`

**Features:**

- Evidence selection via checkboxes
- Sortable table
- Pagination
- Shows already linked evidence
- Empty state handling

## Authorization

### Evidence Hub Endpoints

All endpoints require JWT authentication.

### File Manager

| Operation | Required Role           |
| --------- | ----------------------- |
| Upload    | Admin, Editor, Reviewer |
| List      | All authenticated       |
| Download  | All authenticated       |
| Delete    | Admin, Editor, Reviewer |

### File Access Checks

**Organization files:**

- User must be in same organization

**Project files:**

- User is project member, OR
- User is project owner, OR
- User is file uploader

## Validation

### Evidence ID Validation

```typescript
if (!Number.isSafeInteger(Number(id))) {
  return res.status(400).json({ message: "Invalid ID" });
}
```

### File Upload Validation

```typescript
validateFileUpload(file) {
  // Check file exists
  // Check size <= 30MB
  // Check MIME type in whitelist
  // Validate extension matches MIME type
}
```

### Tenant Identifier Validation

```typescript
// Pattern: /^[a-zA-Z0-9_]{1,30}$/
// Prevents SQL injection
```

## Key Files

### Backend

| File                                                     | Purpose                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `domain.layer/models/evidenceHub/evidenceHub.model.ts`   | Evidence model                                                |
| `domain.layer/models/file/file.model.ts`                 | File model                                                    |
| `domain.layer/models/fileManager/fileAccessLog.model.ts` | Access log model                                              |
| `domain.layer/interfaces/i.evidenceHub.ts`               | Interfaces                                                    |
| `utils/evidenceHub.utils.ts`                             | Evidence queries                                              |
| `utils/fileUpload.utils.ts`                              | Upload utilities                                              |
| `utils/validations/fileManagerValidation.utils.ts`       | Validation                                                    |
| `controllers/evidenceHub.ctrl.ts`                        | Evidence controller                                           |
| `controllers/fileManager.ctrl.ts`                        | File manager controller (upload, download, metadata, preview) |
| `controllers/file.ctrl.ts`                               | File controller                                               |
| `repositories/file.repository.ts`                        | File database queries                                         |
| `routes/evidenceHub.route.ts`                            | Evidence routes                                               |
| `routes/fileManager.route.ts`                            | File manager routes                                           |

### Frontend

| File                                                    | Purpose        |
| ------------------------------------------------------- | -------------- |
| `domain/models/Common/evidenceHub/evidenceHub.model.ts` | Client model   |
| `domain/enums/evidenceHub.enum.ts`                      | Evidence types |
| `application/repository/evidenceHub.repository.ts`      | Evidence API   |
| `application/repository/file.repository.ts`             | File API       |
| `pages/ModelInventory/evidenceHubTable.tsx`             | Evidence table |
| `components/Modals/EvidenceHub/index.tsx`               | Evidence modal |
| `components/Policies/LinkEvidenceSelectorModal.tsx`     | Link selector  |

## Related Documentation

- [Model Inventory](./models.md)
- [Policies](./policies.md)
- [Compliance Frameworks](./compliance-frameworks.md)
- [File Storage](../infrastructure/file-storage.md)
