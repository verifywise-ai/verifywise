# Policies Domain

## Overview

A Policy in VerifyWise is a rich-text governance document for establishing AI governance frameworks, compliance standards, and operational guidelines. Policies support status workflows, reviewer assignments, PDF/DOCX export, and linking to risks and evidence.

## Key Features

- Rich text editing with TipTap (ProseMirror-based)
- Status lifecycle (Draft → Published → Archived)
- 19 predefined governance tags
- PDF and DOCX export
- Link to risks, evidence, and controls
- Change history tracking
- Review date scheduling

## Database Schema

### Policy Manager Table

```
policy_manager
├── id (PK)
├── title
├── content_html (TEXT)
├── status (ENUM)
├── tags (ARRAY)
├── next_review_date
├── author_id (FK → users)
├── last_updated_by (FK → users)
├── last_updated_at
└── created_at
```

### Policy Linked Objects Table

```
policy_linked_objects
├── id (PK)
├── policy_id (FK → policy_manager)
├── object_id
├── object_type (control/risk/evidence)
├── created_at
└── updated_at
```

### Reviewer Assignment Table

```
policy_manager__assigned_reviewer_ids
├── policy_id (FK)
└── user_id (FK)
```

## Enumerations

### Policy Status

```typescript
enum PolicyStatus {
  DRAFT = "Draft"
  UNDER_REVIEW = "Under Review"
  APPROVED = "Approved"
  PUBLISHED = "Published"
  ARCHIVED = "Archived"
  DEPRECATED = "Deprecated"
}
```

### Policy Tags (19 Available)

```typescript
const POLICY_TAGS = [
  "AI ethics",
  "Fairness",
  "Transparency",
  "Explainability",
  "Bias mitigation",
  "Privacy",
  "Data governance",
  "Model risk",
  "Accountability",
  "Security",
  "LLM",
  "Human oversight",
  "EU AI Act",
  "ISO 42001",
  "NIST RMF",
  "Red teaming",
  "Audit",
  "Monitoring",
  "Vendor management"
];
```

### Linked Object Types

```typescript
enum LinkedObjectType {
  CONTROL = "control"
  RISK = "risk"
  EVIDENCE = "evidence"
}
```

## API Endpoints

### Policy CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/policies/` | List all policies |
| GET | `/policies/:id` | Get policy by ID |
| POST | `/policies/` | Create policy |
| PUT | `/policies/:id` | Update policy |
| DELETE | `/policies/:id` | Delete policy |

### Policy Tags

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/policies/tags` | Get available tags |

### Policy Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/policies/:id/export/pdf` | Download as PDF |
| GET | `/policies/:id/export/docx` | Download as DOCX |

### Linked Objects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/policy-linked/` | All linked objects |
| GET | `/policy-linked/:policyId/linked-objects` | Links for policy |
| POST | `/policy-linked/:policyId/linked-objects` | Create links |
| DELETE | `/policy-linked/:policyId/linked-objects` | Remove link |
| DELETE | `/policy-linked/risk/:riskId/unlink-all` | Unlink risk |
| DELETE | `/policy-linked/evidence/:evidenceId/unlink-all` | Unlink evidence |

### Change History

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/policy-change-history/:id` | Get history |

Query params: `limit` (max 500), `offset`

## Create Policy Request

```typescript
POST /policies/
{
  title: "AI Ethics Policy",
  content_html: "<h1>Introduction</h1><p>...</p>",
  status: "Draft",
  tags: ["AI ethics", "Transparency"],
  next_review_date: "2025-06-01",
  assigned_reviewer_ids: [5, 12]
}
```

## Rich Text Editor

### TipTap Integration

The policy editor uses TipTap (ProseMirror-based) with these extensions:

**Text Formatting:**
- Bold, Italic, Underline, Strikethrough
- Highlight

**Headings:**
- H1, H2, H3

**Structure:**
- Bullet lists, Numbered lists
- Blockquotes
- Tables (with headers)
- Images
- Links

**Alignment:**
- Left, Center, Right

### HTML Sanitization

Content is sanitized with DOMPurify:

**Allowed Tags:**
```
p, br, strong, b, em, i, u, h1-h6, blockquote, code, pre,
ul, ol, li, a, img, span, div, mark, s,
table, thead, tbody, tr, th, td
```

**Forbidden:**
```
script, object, embed, iframe, form, input, button
onerror, onload, onclick, onmouseover
```

## PDF/DOCX Export

### PDF Export

- Uses Playwright (Chromium) for conversion
- A4 format, 20mm margins
- VerifyWise branding
- Smart image handling (base64 conversion)
- Singleton browser instance

### DOCX Export

- Uses `docx` library
- JSDOM for HTML parsing
- Supports: headings, paragraphs, lists, tables, images
- Image dimension detection
- 1-inch margins

### Filename Format

```
[sanitized_title]_[YYYY-MM-DD].[pdf|docx]
```

## Linked Objects

### Linking Response

```json
{
  "controls": [
    { "id": 1, "title": "Control name", ... }
  ],
  "risks": [
    { "id": 2, "risk_name": "Risk name", ... }
  ],
  "evidence": [
    { "id": 3, "name": "Evidence name", ... }
  ]
}
```

### Bulk Linking

```typescript
POST /policy-linked/:policyId/linked-objects
{
  object_type: "risk",
  object_ids: [1, 2, 3, 4]
}
```

## Change History

### Tracked Events

- Policy creation
- Field updates (old → new value)
- Policy deletion

### History Entry

```typescript
{
  entity_type: "policy",
  entity_id: number,
  action: "created" | "updated" | "deleted",
  field_name: string,
  old_value: string,
  new_value: string,
  changed_by_user_id: number,
  created_at: Date
}
```

## Frontend Structure

### Main Page

**Location:** `pages/PolicyDashboard/PolicyManager.tsx`

### Key Components

| Component | Purpose |
|-----------|---------|
| `PolicyManager` | Main page with CRUD |
| `PolicyTable` | Sortable policy list |
| `PolicyDetailsModal` | Edit modal with TipTap editor |
| `PolicyForm` | Metadata form |
| `LinkedPolicyModal` | Link objects modal |
| `PolicyStatusCard` | Dashboard stats |

### Features

- Search by title
- Filter by status, tags, reviewers
- Group by status, tags
- Sort by date, title
- Bulk export
- Policy templates
- Change history sidebar

### Policy Templates

Pre-built templates by category:
- Core AI governance
- Model lifecycle
- Data and security
- Legal and compliance
- People and organization
- Industry packs

## Automation Triggers

| Trigger | Event |
|---------|-------|
| `policy_added` | New policy created |
| `policy_updated` | Policy modified |
| `policy_deleted` | Policy deleted |

### Review Reminders

Slack notifications sent 7 days before `next_review_date` to:
- Policy author
- Organization admins

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `domain.layer/models/policy/policyManager.model.ts` | Model |
| `domain.layer/models/policy/policyLinkedObjects.model.ts` | Links |
| `utils/policyManager.utils.ts` | Queries |
| `controllers/policy.ctrl.ts` | Controller |
| `routes/policy.route.ts` | Routes |
| `services/policies/policyExporter.ts` | Export service |

### Frontend

| File | Purpose |
|------|---------|
| `pages/PolicyDashboard/PolicyManager.tsx` | Main page |
| `components/Policies/PolicyTable.tsx` | Table |
| `components/Policies/PolicyDetailsModal.tsx` | Editor modal (TipTap) |
| `components/Policies/PolicyForm.tsx` | Form |
| `repository/policy.repository.ts` | API calls |

## Related Documentation

- [Risk Management](./risk-management.md)
- [Evidence](./evidence.md)
- [PDF Generation](../infrastructure/pdf-generation.md)
