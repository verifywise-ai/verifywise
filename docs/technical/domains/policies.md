# Policies Domain

## Overview

A Policy in VerifyWise is a rich-text governance document for establishing AI governance frameworks, compliance standards, and operational guidelines. Policies support a status lifecycle, approval through approval workflows, reviewer assignments, PDF/DOCX export, and linking to risks and evidence.

## Key Features

- Rich text editing with TipTap (ProseMirror-based)
- Status lifecycle (Draft → Under Review → Approved → Published, plus Archived and Deprecated)
- Approval through approval workflows, or by an Admin when the organization has none
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
├── policy_owner_id (FK → users)
├── review_status (pending_review / approved / changes_requested / NULL)
├── review_comment (TEXT)
├── reviewed_by (FK → users)
├── reviewed_at
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

## Statuses and approval

### Who sets each status

| Status | Set by |
|--------|--------|
| Draft | Hand (default on create), a rejected or withdrawn approval request |
| Under Review | Submitting for approval only |
| Approved | The final approval of the workflow, or an Admin's direct approval |
| Published | Hand, only from Approved |
| Archived, Deprecated | Hand |

`utils/policyStatus.utils.ts` is the one place that decides whether a status may be set by hand. Create, update, bulk archive and the advisor's create and update tools all call it. The rules, first match wins:

1. Create: the status (Draft when missing) must be Draft, Archived or Deprecated.
2. Update: a status that is not sent, or equals the stored one, is not a change and is always accepted. The editor sends the status on every save.
3. A policy with a Pending approval request cannot change status: "Withdraw the approval request before changing the status".
4. Under Review and Approved cannot be set by hand.
5. Published only from Approved.
6. The transition table `POLICY_INVALID_STATUS_TRANSITIONS` (`utils/validations/policiesValidation.utils.ts`): Published → Draft, Published → Under Review, Archived → Draft, Archived → Under Review, Archived → Approved, Deprecated → Published. After rules 3 to 5, only Published → Draft and Archived → Draft reach it.

A refusal is a `400` with `field: "status"` in the usual `{ message, errors: [{ field, message }] }` body, translated. Bulk archive returns one `400` naming every policy with a pending request and changes nothing. The same file's content-similarity and future review date rules are not wired.

This gate applies to the legacy `POST /policies` and `PUT /policies/:id` as an authorization fix: before it, an Editor could set Approved or Published by hand. API clients that set those statuses directly now get a `400`.

The client mirrors the rules in `Clients/src/application/utils/policyStatusOptions.ts`, so the status dropdown offers only statuses the server accepts. It is disabled while a request is pending.

### Usable policy workflow

A workflow is usable for an organization when it belongs to the organization, has `entity_type = 'policy'`, is active, has at least one step, and every step has at least one approver (`getUsablePolicyWorkflows` in `services/policies/policyApproval.service.ts`). The "Policy Approval" workflow that migration `20260413175412` seeded for every organization has one step and no approvers, so it is not usable and is ignored. An Admin makes it usable by adding approvers to its step.

### Approval paths

- **The organization has a usable workflow.** A user with `policy.edit` submits the policy. In one transaction this opens an approval request (`entity_type 'policy'`, `request_name` = policy title, `entity_data` = snapshot of title, status, tags, next review date and owner), sets the policy to Under Review with `review_status = 'pending_review'`, clears the previous review fields and records the status change in history. Step 1 approvers, except the requester, are notified after the commit. The workflow's approvers then decide through `/approval-requests` (see [Approvals](./approvals.md#policy-requests)).
- **The organization has no usable workflow.** An Admin (a role with `organization.admin`) approves the policy directly, with an optional comment. Submitting returns 409.

A policy can be submitted or approved directly only from Draft or Under Review, and only with no pending request. An Under Review policy without a pending request is legacy data and may be submitted.

What each decision does to the policy:

| Decision | status | review_status | Also sets |
|----------|--------|---------------|-----------|
| Submit | Under Review | `pending_review` | clears `review_comment`, `reviewed_by`, `reviewed_at`; sets `last_updated_by/at` |
| Final approval of the request | Approved | `approved` | `reviewed_by`, `reviewed_at`, `review_comment` (approver's comment or NULL) |
| Rejection at any step | Draft | `changes_requested` | `reviewed_by`, `reviewed_at`, `review_comment` |
| Withdraw by the requester | Draft | NULL | |
| Admin direct approval | Approved | `approved` | `reviewed_by`, `reviewed_at`, `review_comment` |

Every row is recorded in policy change history with the user who acted (none when the advisor withdraws). The requester gets an in-app and email notification on approval or rejection that links to the policy editor (`/policies/:id/edit`).

A policy request can only come from submit for approval. The generic `POST /approval-requests` and the advisor's `agent_create_approval_request` refuse `entity_type 'policy'` with a `400` ("Submit the policy for approval from the policy").

If the requester is also an approver on the workflow, they can decide their own request. That is a workflow configuration choice; the notification skips them, but the decision is not blocked.

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

Deleting a policy rejects its pending approval request in the same transaction ("The policy was deleted."), and the requester is notified after the commit. The advisor's `agent_delete_policy` does the same.

### Policy approval (v1)

All three are under `/api/v1/policies` (`routes/v1/policies.route.ts`, `controllers/policyApproval.ctrl.ts`). Responses use the `STATUS_CODE` envelope `{ message, data }`. The organization always comes from the token. The generated swagger lists only 200 and 500 for these operations; the table below is the real contract.

| Method | Endpoint | Auth | Body |
|--------|----------|------|------|
| GET | `/v1/policies/:id/approval` | Any member | |
| POST | `/v1/policies/:id/submit-for-approval` | `policy.edit` | `{ workflow_id?: number }` |
| POST | `/v1/policies/:id/approve` | `policy.edit`, then `organization.admin` in the service | `{ comment?: string }` (at most 2000 characters) |

`GET /approval` returns `200` with:

```typescript
{
  usable_workflows: [{ id, workflow_title, step_count }],
  pending_request: {
    id, workflow_id, workflow_title, current_step, total_steps,
    requested_by, requested_by_name, created_at
  } | null,
  review_status, review_comment, reviewed_by, reviewed_by_name, reviewed_at,
  can_submit,           // policy.edit && a usable workflow && Draft/Under Review && nothing pending
  can_approve_directly, // organization.admin && no usable workflow && Draft/Under Review && nothing pending
  can_withdraw          // a pending request made by the caller
}
```

`POST /submit-for-approval` returns `201` with `{ request_id, policy }`. When `workflow_id` is sent it must be a JSON number naming a usable workflow; a numeric string is a `400`. When it is omitted the server uses the only usable workflow.

`POST /approve` returns `200` with the re-read policy.

| Status | Route | When |
|--------|-------|------|
| 400 | all | `:id` is not a positive integer ("Invalid policy ID") |
| 400 | submit | `workflow_id` malformed or not usable: field `workflow_id`, "Choose an approval workflow with an approver on every step" |
| 400 | submit | More than one usable workflow and none sent: field `workflow_id`, "Choose an approval workflow" |
| 400 | approve | Comment over 2000 characters: field `comment` |
| 401 | all | No valid token |
| 403 | submit, approve | Role lacks `policy.edit` ("Access denied") |
| 403 | approve | Role lacks `organization.admin` ("Only an Admin can approve a policy directly"). Checked before anything else. |
| 404 | all | The policy does not exist or belongs to another organization ("Policy not found") |
| 409 | submit, approve | "This policy already has a pending approval request" |
| 409 | submit, approve | "Only a draft or under review policy can be submitted or approved" |
| 409 | submit | "This organization has no policy approval workflow. An Admin can approve the policy directly." |
| 409 | approve | "Use the approval workflow" (the organization has a usable workflow) |

400 field errors use `{ message, errors: [{ field, message }] }` in `data`; other errors put the translated message string in `data`. Check order: submit is 404, then pending, then status, then workflow; approve is 403, then comment, then 404, then usable workflow, then pending, then status. Submit and approve lock the policy row (`FOR UPDATE`), so concurrent submits cannot open two requests.

### Deprecated review endpoints

| Method | Endpoint | Sunset |
|--------|----------|--------|
| POST | `/policies/:id/review/request` | not before v2.7.0 |
| PUT | `/policies/:id/review/approve` | not before v2.7.0 |
| PUT | `/policies/:id/review/reject` | not before v2.7.0 |

These keep their old behaviour, frozen: they write only `review_status`, `review_comment`, `reviewed_by` and `reviewed_at`, never the policy status, and open no approval request. They are listed in `Servers/scripts/apiDeprecations.ts`, so the generated swagger marks them `deprecated: true` with a Sunset notice (ADR 0001 §7). Use submit for approval and the approval request endpoints instead, or the direct approve when the organization has no usable workflow. Removal is a later PR.

### Bulk actions

`PATCH /policies/bulk` takes `{ ids, action: "archive" | "set_reviewer" | "set_tags" }`. `set_reviewer` replaces each policy's team members (`policy_manager__assigned_reviewer_ids`) with the one user, skipping a policy that user owns, and no longer sets `review_status`. `archive` goes through the status gate.

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

`next_review_date` is a calendar day stored at midnight in a `TIMESTAMP` (no time zone) column. Clients send `"YYYY-MM-DD"`. Policy reads format it in SQL as `"YYYY-MM-DDT00:00:00.000Z"` (`to_char`), so the value does not depend on the backend's time zone; node-pg alone would read it as server-local midnight, a day early east of UTC. The client reads the first 10 characters (`toDateOnlyString`), and automation emails format it in UTC. Migration `20261114090000-policy-review-date-calendar-day` rounds dates the old picker stored with a time of day to the nearest midnight.

The checks reject only input the database used to fail on with a 500, since the legacy endpoint is frozen, plus the status gate (see [Statuses and approval](#statuses-and-approval)). Create requires a non-empty `title` of at most 255 characters (untrimmed, it is `VARCHAR(255)`). `status` must be one of `POLICY_STATUS_ENUM` (the `policy_manager_status_check` constraint), defaults to Draft, and on create may only be Draft, Archived or Deprecated. `tags` must be known tags; a missing or empty list stores `{}`. `next_review_date` must start with a valid `YYYY-MM-DD`; `null` or `""` stores or sets NULL. Update checks only the fields sent. Invalid input returns `400` with `STATUS_CODE[400]({ message, errors: [{ field, message }] })`, translated. The editor shows each message under its field, and a message with no field in a snackbar. History compares the review date by calendar day (`GENERIC_FORMATTERS.calendarDate`), so an unchanged date records no change on any server time zone.

Create and update accept only `title`, `content_html`, `status`, `tags`, `next_review_date`, `policy_owner_id` and `assigned_reviewer_ids`; other body fields (`is_demo`, `review_status`, `author_id`, ...) are dropped.

`policy_owner_id`, `assigned_reviewer_ids`, bulk `reviewerId` and `reviewer_ids` in a review request must be members of the caller's organization, or the request returns 400 (`assertPolicyUsersInOrganization` in `utils/policyManager.utils.ts`). On update only newly named users are checked.

Folder assignment (`PATCH /policies/:id/folders`) returns 404 for another organization's policy and 403 for another organization's folder. Reading a policy's folders joins folders on the organization.

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

`object_type` must be `risk` (ids from `risks`) or `evidence` (ids from `files`), otherwise 400. The policy must belong to the caller's organization (404) and so must every object (403). Ids already linked are skipped, and the policy row is locked while linking so concurrent requests cannot create duplicates. The response stays 201 (legacy contract) and adds `linked: <count>`, the number of links actually created. REST and the advisor's `agent_link_object_to_policy` both go through `linkObjectsToPolicyQuery` (`utils/policyLinkedObject.utils.ts`).

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
- Sort by date, title
- Bulk export
- Policy templates
- Change history sidebar

### Policy Templates

Templates live in the `policy_templates` table (#5261), served by
`/api/v1/policy-templates` (`routes/v1/policyTemplates.route.ts`,
`utils/policyTemplate.utils.ts`).

- **System templates**: `organization_id IS NULL`, `is_system_template = true`,
  seeded by migration `20261111091002-seed-policy-templates.js` from
  `database/seeders/systemPolicyTemplates.js`. Read-only for every org.
- **Organization templates**: `organization_id` set. Created by duplicating a
  system template, by "Save as template" on a policy (`POST /from-policy`,
  content sanitized, category asked in the modal), or directly. Edited in
  two places: details (name, description, category) in a modal, content in
  the template editor page `/policies/templates/:templateId/edit`.
- Writes need `policyTemplate.edit` (Admin and Editor by default). Update and
  delete only match `organization_id = caller AND is_system_template = false`.
- All HTML content goes through `sanitizeUserHtml`; tags are written as
  `text[]` and validated (at most 50, 100 characters each).
- A policy created from a template keeps its own copy; deleting a template
  does not affect policies.

Categories: Core AI governance, Model lifecycle, Data and security, Legal
and compliance, People and organization, Industry packs.

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
| `utils/policyStatus.utils.ts` | Status gate for hand-set statuses |
| `utils/policyApprovalDecision.utils.ts` | What an approval decision does to the policy |
| `services/policies/policyApproval.service.ts` | Usable workflows, submit, direct approve, approval state, delete-time rejection |
| `controllers/policy.ctrl.ts` | Controller |
| `controllers/policyApproval.ctrl.ts` | v1 approval controller |
| `routes/policy.route.ts` | Routes |
| `routes/v1/policies.route.ts` | v1 approval routes |
| `scripts/apiDeprecations.ts` | Deprecated endpoints read by the swagger generator |
| `services/policies/policyExporter.ts` | Export service |

### Frontend

| File | Purpose |
|------|---------|
| `pages/PolicyDashboard/PolicyManager.tsx` | Main page |
| `components/Policies/PolicyTable.tsx` | Table |
| `components/Policies/PolicyDetailsModal.tsx` | Editor modal (TipTap) |
| `components/Policies/PolicyForm.tsx` | Form |
| `pages/PolicyDashboard/PolicyEditor/PolicyApprovalSection.tsx` | Approval section in the editor sidebar |
| `application/hooks/usePolicyApproval.ts` | Approval state query and actions |
| `application/utils/policyStatusOptions.ts` | Statuses the dropdown offers |
| `repository/policy.repository.ts` | API calls |

## Related Documentation

- [Risk Management](./risk-management.md)
- [Evidence](./evidence.md)
- [PDF Generation](../infrastructure/pdf-generation.md)
