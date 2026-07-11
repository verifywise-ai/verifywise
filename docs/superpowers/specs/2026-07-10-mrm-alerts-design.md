# MRM Alerts — Email Delivery + Alerts Config — Design Spec

> **Date:** 2026-07-10
> **Gaps:** #2 (optional email for breach/overdue alerts) + #3 (real alerts settings config)
> **Branch:** `feat/mrm-alerts` — STACKED ON `feat/mrm-retention` (PR #4252). Depends on
> `mrm_org_settings` (table + utils + `GET/PUT /api/mrm/settings`) from that branch.
> Merge order: #4252 first, then this.

## Problem

Breach alerts are in-app only; a breach goes unseen if the assigned owner never
logs in (SS1/23 escalation gap). The overdue-validation sweep notifies **nobody**.
`AlertsSection.tsx` is deliberately display-only — no persisted recipients,
channels, or automation. The B2 plan promised optional email, recipient/channel
config, and a breach-auto-opens-a-finding toggle; none shipped.

## Decisions (locked in brainstorming)

| Question | Decision |
|----------|----------|
| Recipient model | Role-derived base (owner/validator/approver, per-model — unchanged) **∪** org-wide optional extra recipients list. |
| Email default | OFF by default, opt-in per org. In-app always on. |
| Auto-open finding | Only hard breaches (`status = 'breach'`, never `warn`); dedup — while an open-lifecycle auto-finding exists for the same (model, metric), repeated breaches do NOT open another. |
| Overdue cadence | Notify once, when the sweep NEWLY OPENS a validation (`created_validation === true`); daily annotations stay silent. |
| Granularity | Org-wide config in `mrm_org_settings` (per-model targeting already comes free via roles). |

## Verified schema facts this design relies on

- `mrm_findings.validation_id` is **nullable** (`ON DELETE SET NULL`) and
  `model_inventory_id` is NOT NULL — a finding can attach directly to a model.
- The breach path already calls `triggerRevalidation` (dedup-safe) after committed
  ingestion, so a hard-breached model usually has an open validation to link.
- Notification types are a DB enum — adding one requires a migration (mirror
  `20260703110600-add-mrm-breach-notification-type.js`).
- Email infra exists: `services/emailService.ts` (`sendEmail(recipientEmail,
  subject, template, templateData)`) + MJML templates.

## 1. Data model (one migration)

```sql
ALTER TABLE verifywise.mrm_org_settings
  ADD COLUMN alert_email_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN breach_auto_open_finding BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE verifywise.mrm_alert_recipients (
  organization_id INTEGER NOT NULL
    REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL
    REFERENCES verifywise.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE verifywise.mrm_findings
  ADD COLUMN auto_metric VARCHAR(100);

CREATE INDEX idx_mrm_findings_auto_metric
  ON verifywise.mrm_findings(organization_id, model_inventory_id, auto_metric)
  WHERE auto_metric IS NOT NULL;

-- Amendment 2026-07-11 (see §4): once-per-lifecycle claim for the overdue alert.
ALTER TABLE verifywise.mrm_validations
  ADD COLUMN overdue_notified_at TIMESTAMP WITH TIME ZONE;

-- + add the overdue notification type to the notification enum
-- (exact enum name/value per the existing breach-type migration pattern).
```

- Join table (not an INTEGER[] column) so a deleted user disappears from the
  list automatically — FK integrity, matching repo patterns.
- `auto_metric` is set ONLY by the auto-open path; human-created findings keep
  it NULL. It is the dedup key and the audit marker for "system-opened".

## 2. Breach notification dispatch

Extend the existing breach-notify block in `mrmMonitoring.ctrl.ts`:

- Recipients = `getBreachNotificationRecipientsQuery(org, model)` (unchanged)
  **∪** `getAlertExtraRecipientsQuery(org)` (new util reading
  `mrm_alert_recipients`), deduplicated.
- In-app notification: always, as today (type `MRM_METRIC_BREACH`).
- If `alert_email_enabled` (read via `getMrmOrgSettings` — extended, see §5):
  additionally send one MJML email per recipient via the existing email service
  (`emailService.ts` / `notificationService.ts` — the plan picks the
  system-email entry point the other automation emails use). New template
  `mrm-breach-alert` carrying model label, metric, value, severity, and an app
  link built the way existing automation email templates build theirs
  (frontend base URL pattern). Recipient emails resolved from user ids.
- Per-recipient try/catch (existing pattern) — one failing address never blocks
  the rest, and email failure never affects ingestion (the whole notify block
  is already fire-and-forget after the ingestion transaction commits).
- **Testability:** the recipient-union, auto-finding dedup+create, and dispatch
  helpers live in a NEW `Servers/utils/mrmAlerts.utils.ts` — the controller and
  the sweep call it. Keeps the controller thin and makes the logic
  unit-testable without HTTP.

## 3. Auto-open finding

In the breach path, after evaluations are recorded, when
`breach_auto_open_finding` is true:

- Trigger condition: `status === 'breach'` only (threshold severities
  high/critical). `warn` never opens a finding.
- **Dedup:** skip when a finding exists with the same
  `(organization_id, model_inventory_id, auto_metric = metric)` and
  `stage != 'closed'` (`enum_mrm_finding_stage` = open, remediation_planned,
  in_progress, resolved, closed — everything except `closed` counts as still
  in-flight). A re-breach after verified closure opens a NEW finding (the
  problem returned). Repeated breaches while one is in-flight are already
  evidenced in the immutable evaluation audit.
- **Dedup is deliberately segment-coarse:** the key is (model, metric), NOT
  (model, metric, segment). Two segments breaching the same metric share one
  finding — the finding says "this metric is breaching"; per-segment detail
  lives in the evaluation audit. Less register noise, and consistent with
  findings being problem-level records.
- **Concurrency-safe:** the check+create pair runs in one short transaction
  that first takes `SELECT id FROM model_inventories WHERE id = :modelId AND
  organization_id = :orgId FOR UPDATE` — serializing auto-finding creation per
  model. Without this, two concurrent ingestion requests breaching the same
  metric would both pass the dedup check and both create a finding — and
  findings are permanent (no hard delete), so the duplicate is forever. (A
  partial UNIQUE index was considered and rejected: it would make a human
  reopening an old closed auto-finding fail with a DB error whenever a newer
  in-flight one exists — the lock keeps the constraint out of the PATCH path.)
  Batch requests are inherently serial within the request, so within-batch
  repeats of the same metric hit the just-created in-flight finding and skip.
- Created finding: `title = "Metric breach: <metric>"`, severity mapped from
  the threshold severity (critical→critical, high→high), `auto_metric = metric`,
  `validation_id` = the model's open validation id if one exists (else NULL),
  `owner_id` = the model's owner role user if assigned (else NULL).
- Guarded: any failure here is logged and swallowed — never poisons ingestion.

## 4. Overdue-validation alerts

Inside `runRevalidationSweep` (the shared per-org function in
`mrmRevalidationSweep.ts`), after `triggerRevalidation` returns — so BOTH the
daily BullMQ job AND the on-demand `POST /revalidation/sweep` endpoint notify
(they call the same function):

- **AMENDED 2026-07-11 — trigger condition.** The original condition
  (`result.created_validation === true`) is effectively unreachable:
  `getDueRevalidationsQuery` only returns models that already HAVE an open
  `not_started` validation past `next_due`, so `triggerRevalidation` takes the
  annotate path and returns `created_validation: false` for every swept row
  (`true` only in a validated-between-query-and-trigger race). The intent —
  notify ONCE per overdue lifecycle, daily annotations silent — is instead
  implemented with an atomic claim: new nullable column
  `mrm_validations.overdue_notified_at`. After `triggerRevalidation` returns,
  the sweep runs `UPDATE mrm_validations SET overdue_notified_at = now() WHERE
  id = :validationId AND organization_id = :orgId AND overdue_notified_at IS
  NULL RETURNING id` — a returned row means this sweep won the first-nudge
  claim and notifies; every later daily sweep finds the claim taken and stays
  silent. A new validation row (next cycle) starts with NULL and notifies once
  again. The claim is taken before the recipient lookup, so an org with no
  recipients still consumes its one nudge (consistent with the breach path's
  "recorded, but no one assigned to notify").
- Scope: only the sweep runs the claim, so manual request-revalidation
  (requester already knows), breach-triggered (recipients just got the breach
  alert), and tier-increase sources stay silent — unchanged from the original
  decision.
- Same recipient union as §2; in-app with the NEW notification type
  `MRM_REVALIDATION_DUE = "mrm_revalidation_due"` (TS enum in
  `i.notification.ts` + `ALTER TYPE verifywise.enum_notification_type ADD VALUE
  IF NOT EXISTS 'mrm_revalidation_due'` migration, down = no-op — mirrors the
  breach-type migration); email if `alert_email_enabled` — new MJML template
  `mrm-revalidation-due` (model label, due date, link to the validation).
- Per-org/per-model try/catch consistent with the sweep's isolation pattern.

## 5. Settings API + UI

**API** — extend the existing `GET/PUT /api/mrm/settings` (from gap #1):

- Payload becomes `{ organization_id, retention_months, alert_email_enabled,
  breach_auto_open_finding, alert_recipients: number[] }`.
- GET: settings row (or defaults: false/false/[]) + recipient ids from
  `mrm_alert_recipients`.
- PUT: **PARTIAL semantics** — only the fields present in the body are
  validated and updated. This keeps gap #1's `RetentionSection` (which PUTs
  only `retention_months`) working unchanged, and lets `AlertsSection` PUT only
  its three fields. Validation per present field: `retention_months` rules
  unchanged; booleans must be booleans; `alert_recipients` must be an array of
  integers, each an existing user in the caller's org (400 otherwise).
- Upsert: `upsertMrmOrgSettings` signature changes from
  `(orgId, retentionMonths)` to `(orgId, { retention_months?,
  alert_email_enabled?, breach_auto_open_finding? })` — COALESCE-style update
  of only provided columns (gap #1's controller call site updated to the new
  shape); when `alert_recipients` is present, the list is replaced wholesale
  (DELETE + INSERT in one transaction).

**UI** — `AlertsSection.tsx`:

- KEEP the existing role-derived explainer table (accurate and educational).
- ADD a config card above it: `Toggle` "Send email alerts" (helper: applies to
  breach and overdue-validation alerts), `Toggle` "Automatically open a finding
  on hard breach" (helper: one finding per model + metric while open; warnings
  never open findings), `VerifyWiseMultiSelect` "Additional recipients" (org
  users; helper: these people are alerted for every model, on top of the
  model's roles), save button.
- Wired through the extended settings repository/hook from gap #1
  (`useMrmSettings` / `useUpdateMrmSettings` — payload type extended).
- Update the section's intro copy to reflect the new reality (it currently
  says config doesn't exist). Remove the stale "intentionally descriptive"
  comment block. i18n de/fr/es for every new string.

## 6. Testing

- **Unit:** recipient-union dedup; severity mapping; auto-finding trigger
  predicate (breach yes / warn no / toggle off no); email service MOCKED
  (no real sends in any test).
- **Integration (tenant-isolation, live Postgres):**
  - settings roundtrip with recipients — org A's recipients invisible to org B;
    PUT rejects a user id from another org (400).
  - breach with toggle on → finding created with `auto_metric`; second breach
    same metric → NO second finding; breach on a different metric → new finding.
  - ONE batch containing two breaching points of the same metric → exactly one
    finding (within-batch dedup).
  - re-breach after the auto-finding is moved to `closed` → a NEW finding opens.
  - warn with toggle on → no finding; breach with toggle off → no finding.
  - sweep newly-opens validation → notification row created; sweep annotates
    existing → no new notification.
- Full unit suite + both builds + i18n audit + format checks green.

## Out of scope (deliberate)

- Per-model alert overrides; weekly overdue reminders; digest emails;
  Slack/webhook channels; retroactive auto-findings for pre-existing breaches.

## Regulatory note

Email escalation closes the SS1/23 §1.7/§3.7-3.8 gap (breach reaching
accountable owners who never log in). The auto-finding dedup keeps the findings
register a credible audit artifact — one finding per problem, with the
point-by-point evidence remaining in `mrm_metric_evaluations`.
