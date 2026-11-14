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

`next_review_date` is a calendar day stored at midnight in a `TIMESTAMP` (no time zone) column. Clients send `"YYYY-MM-DD"`. Policy reads format it in SQL as `"YYYY-MM-DDT00:00:00.000Z"` (`to_char`), so the value does not depend on the backend's time zone; node-pg alone would read it as server-local midnight, a day early east of UTC. The client reads the first 10 characters (`toDateOnlyString`), and automation emails format it in UTC. Migration `20261114090000-policy-review-date-calendar-day` rounds dates the old picker stored with a time of day to the nearest midnight.

The checks reject only input the database used to fail on with a 500, since the legacy endpoint is frozen. Create requires a non-empty `title` of at most 255 characters (untrimmed, it is `VARCHAR(255)`). `status` must be one of `POLICY_STATUS_ENUM` (the `policy_manager_status_check` constraint) and defaults to Draft. `tags` must be known tags; a missing or empty list stores `{}`. `next_review_date` must start with a valid `YYYY-MM-DD`; `null` or `""` stores or sets NULL. Update checks only the fields sent. Invalid input returns `400` with `STATUS_CODE[400]({ message, errors: [{ field, message }] })`, translated. The editor shows each message under its field, and a message with no field in a snackbar. History compares the review date by calendar day (`GENERIC_FORMATTERS.calendarDate`), so an unchanged date records no change on any server time zone.

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

Each trigger runs every action of every active automation for it, ordered by automation id and then action order (`getEventAutomationActionsQuery`, `enqueueAutomationActions`). The jobs are enqueued after the save commits, so a rolled-back save sends nothing. One failing action is logged and does not stop the others. Risk automations and AI Detection scan automations use the same dispatcher.

Automations that existed before every-action dispatch keep their old behaviour until someone edits and saves them: only the event's first action runs (`automations.legacy_first_action_only`, set by migration `20261114200100-legacy-automation-first-action`; the dispatch keeps the single first legacy row by action order, then automation id). Saving the automation in the editor clears the flag; the active toggle does not. New automations run every action.

### Review Reminders

One daily sweep, `policy_review_reminder_sweep` at 08:00 server time (`services/automations/actions/policyReviewReminderSweep.ts`), reminds people of a policy's review twice: once when `next_review_date` comes within 7 days (`POLICY_DUE_SOON`) and once when it has passed (`POLICY_OVERDUE`). Days are compared by calendar day (`next_review_date::date` against `CURRENT_DATE`, UTC). Archived and Deprecated policies are skipped.

- **Recipients** (`findPolicyRemindersDueQuery`): the policy owner and the assigned reviewers, each once; when none of them is still a member of the organization, the author. Only current members are told, and a policy with nobody to tell is skipped.
- **Channels** (`notifyPolicyReviewReminder`): the in-app notice, then the email (`policy-review-reminder.mjml`, best-effort); title, message and subject are i18n keys, the email body stays English. For a recipient with a Slack webhook on the "Policy reminders and status" route, also a Slack message; Slack is best-effort.
- **Once per kind**: `policy_manager.due_soon_reminded_at` / `overdue_reminded_at` (migration `20261114200000-policy-review-reminder-stamps`) are stamped once at least one recipient's in-app notice was stored; the in-app notice is the channel of record. Every per-recipient failure is logged, and a recipient whose notice failed is not retried; only a policy that reached nobody is retried the next day. Email and Slack failures are logged and never block the stamp. The stamp applies only while the row still has the review day the sweep read, so a date changed mid-sweep is not marked reminded. The stamps are bookkeeping and are stripped from policy API and advisor responses (`omitReminderStamps`). The migration stamps policies already overdue or inside the 7-day window, so the first run after deploy sends nothing for them. Moving the review date to another day (policy update or advisor update) clears both stamps; saving the same day keeps them.
- **Replaced jobs**: the 08:00 `send_policy_due_soon_notification` email job and the 09:00 `slack-notification-policy` Slack job. Startup removes their Redis schedulers (`removeRetiredPolicyDueSoonScheduler`, `removeRetiredSlackPolicyScheduler`); a job of either name still queued completes without sending.

The policy renewal workflow (`services/workflows/definitions/policyRenewal.workflow.ts`) is an opt-in autopilot that sends an in-app "Policy renewal due" notice 30 days ahead. It notifies the policy owner if they are still a member of the organization, otherwise the author if they are; with neither, it skips. An organization with it enabled also gets that 30-day notice, separate from the 7-day reminder.

The compliance score counts a policy as overdue when `next_review_date::date` is before `CURRENT_DATE` and its status is not Archived or Deprecated (`getPolicyDocumentationData` in `utils/compliance.utils.ts`). Published policies count when their review day has passed.

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
