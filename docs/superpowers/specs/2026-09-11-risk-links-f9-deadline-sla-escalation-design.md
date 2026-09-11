# Feature 9 — Deadline & SLA escalation

> Roadmap item 10, verbatim:
> *"Deadline & SLA escalation (Risk + Vendor + Model) — deadline, mitigation_status, target_date alanları var ama otomasyon zayıf. automationTrigger ile 'deadline -7 gün kala owner'a + admin'e mail, -1 gün kala Slack' chain'i. Mevcut automationActmion tipine 1 satır ek."*

**Status:** approved 2026-09-11. This is the first feature in the chain that **writes**. One migration (two enum values).

---

## 1. What ships

A scheduled sweep that escalates approaching deadlines on two entities:

| Entity | Date column | Owner column | Recipients |
|---|---|---|---|
| `risks` | `deadline` | `risk_owner` | owner + org admins |
| `model_risks` | `target_date` | **`owner`** | owner + org admins |

The two owner columns are named differently — `model_risks` has `owner`, not `risk_owner`. Verified against `information_schema`; a shared row type must not assume one name.

**The model leg's `action_url` cannot come from `buildEntityUrl`.** The `entity_type` enum has no `model_risk` value, and `buildEntityUrl(MODEL, id)` emits `/model-inventory/models/${id}` (`inAppNotification.service.ts:34`). Passing a model-risk id there links to a model that does not exist. So for the model leg: `entity_id` is the **model-risk** id, because that is what gives the dedup its granularity (two risks on one model must each notify), and `action_url` is built separately from `model_risks.model_id` — which F6 established is nullable, so fall back to the model list when it is null.

Two thresholds, matching the roadmap:

- **7 days out** → in-app notification + email
- **1 day out** → Slack

It is a BullMQ repeatable job alongside the existing sweeps, not a new service.

---

## 2. Three things the roadmap line gets wrong

Each is a measurement, not an opinion.

### 2.1 The Vendor leg already ships

It is built and wired:

- trigger `vendor_review_date_approaching`, id 3 in `automation_triggers`
- `sendVendorReviewDateNotification` — `services/automations/automationWorker.ts:91`
- `notifyVendorReviewDue` — `services/inAppNotification.service.ts`, reached from `automationWorker.ts:166`
- `vendor-review-due.mjml` + `EMAIL_TEMPLATES.VENDOR_REVIEW_DUE` (`constants/emailTemplates.ts:53`)

And if "Vendor" meant vendor *risks* rather than vendors: **`vendorrisks` has no date column at all.** Its only temporal column is `updated_at`. There is nothing to escalate on.

So F9's real new work is **Risk deadlines + Model Risk target dates**. Do not rebuild the vendor sweep.

### 2.2 "One line added to the existing automationAction type" is not one line

`automation_actions` contains exactly one row:

```
1 | send_email | Send Email
```

There is no Slack action type. Adding one means a new `automation_actions` row, a new handler under `services/automations/actions/`, and a branch in the worker's action dispatch — not a line.

Slack itself does exist, on a **separate** path: `services/slack/slackNotificationService.ts` with `sendSlackNotification`, and a due-soon precedent at `services/slack/policyDueSoonNotification.ts`. §6 uses that path instead.

### 2.3 The named mechanism cannot express the requested chain

`automationWorker.ts:120` reads:

```ts
const automation = automations[0][0];
```

One row, carrying one `automation_params.daysBefore`. A chain of "-7 days email, then -1 day Slack" is two steps with two thresholds and two channels; this shape holds one of each.

It is also **dormant**. The worker bails at `if (automations[0].length === 0) continue;`, and in the dev org:

```
automations rows = 0
automation_actions_data rows = 0
```

So the single existing Pattern A sweep has never fired. Building F9 on that mechanism would mean adopting the thing that makes the requirement impossible, to get a feature that does not run.

---

## 3. The mechanism: a hardcoded sweep

Follow **`sendPolicyDueSoonEmailNotification` (`automationWorker.ts:190`)**, not the configurable-trigger pattern: iterate orgs, query what is due, notify.

```ts
export const DEADLINE_EMAIL_DAYS = 7;   // roadmap: "-7 gün kala owner'a + admin'e mail"
export const DEADLINE_SLACK_DAYS = 1;   // roadmap: "-1 gün kala Slack"
```

Per-org configurability is deferred to §8. Constants now; the roadmap's intent is the thresholds, not the settings UI.

---

## 4. Deduplication — the correctness problem at the centre of this feature

The existing vendor sweep computes:

```ts
notificationDate.setDate(notificationDate.getDate() - daysBefore);
if (notificationDate.getTime() !== today.getTime()) continue;
```

That exact-day equality is silently doing dedup duty. It has two failure modes and F9 must have neither:

- **Miss the run** — worker down, deploy, a queue backlog — and the -7d notice is never sent. Not late: never. For an SLA feature that is the whole value gone.
- **Widen it to a range** to fix that, and it fires every day for seven days.

The fix is a sent-record, and the `notifications` table already is one:

```
organization_id | user_id | type | entity_type | entity_id | metadata jsonb | created_at
```

`metadata` is already used this way — `inAppNotification.service.ts:737` writes `metadata: { stepNumber: … }`.

So:

- the sweep selects with a **range** (`deadline <= NOW() + INTERVAL '7 days'`), so a missed run catches up the next day
- each notification is written with `metadata: { threshold_days: 7 }` (or 1)
- **before each individual write**, the sweep checks whether that recipient already has that notice

**No dedup migration.** One notice per recipient per entity per threshold — late if the worker was down, never duplicated, never dropped.

### 4.1 The check is per recipient, in the service — not a join in the query

This is the part that is easy to get subtly wrong. Each row notifies several people: the owner plus every admin. A dedup that filters *rows* in the SQL can only ask "has anyone been notified about this risk?", which is the wrong question twice over:

- it silently downgrades the §4 guarantee from per-recipient to per-entity, so an admin added tomorrow never learns about a deadline the owner was told about today;
- and it interacts badly with the per-recipient `try/catch` the sweep needs. Owner's write succeeds, one admin's write throws and is logged-and-continued — with a row-level filter the entity is now excluded forever and that admin is never notified.

So the query is a plain range scan with no `notifications` join, and the service calls a small `EXISTS` helper immediately before each write. A write that fails leaves no dedup record, so the next night retries exactly that recipient and nobody else.

### 4.2 What can re-arm a notice

The dedup record is the notification row itself, so deleting it re-arms the notice. Checked:

- `deleteNotificationQuery` — user-initiated, via the DELETE endpoint at `controllers/notification.ctrl.ts:328`. A user who dismisses the 7-day notice will get it again the next night. That is defensible: they cleared it, the deadline is still coming.
- `deleteOldNotificationsQuery` and `deleteNotificationsByEntityQuery` — **no callers anywhere.** Dead code.

**There is no scheduled purge**, so the guarantee does not silently reset. If a retention job is ever added, it re-arms every outstanding notice and this section is what it has to be weighed against.

### 4.3 Already-overdue rows

A range query also matches deadlines already in the past. Include them: an overdue deadline is more urgent, not less, and the dedup makes it safe. The 7-day notice fires once for an overdue risk that never got one; the 1-day notice likewise. A dedicated overdue escalation is §8.

---

## 5. The one migration

`entity_type` already has `risk` and `model` — nothing needed there.

`type` has `vendor_review_due`, `policy_due_soon`, `policy_overdue` and nothing for risk deadlines. Two values, one migration, following the exact precedent of `20260910092735-model-risk-candidate-notification-type.js`:

```sql
ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'risk_deadline_due_soon';
ALTER TYPE verifywise.enum_notification_type ADD VALUE IF NOT EXISTS 'model_risk_due_soon';
```

`down` is a no-op — removing a Postgres enum value requires recreating the type and migrating every column using it. Same decision as the three prior migrations in this chain.

Both values must also be added to `NotificationType` in `domain.layer/interfaces/i.notification.ts`.

**Postgres will not let a new enum value be used in the same transaction that adds it.** The migration adds the values; the sweep that uses them runs later, in its own transaction. Do not combine them.

---

## 6. Slack

Use `sendSlackNotification` from `services/slack/slackNotificationService.ts`, taking `services/slack/policyDueSoonNotification.ts` as the shape reference.

**Read that file for its shape only — it has a live bug. Do not copy its control flow.** It calls `return userToNotify;` *inside* the per-policy loop (twice), so it exits after the first policy of the first organization and every later org is silently skipped. F9's sweep must complete every org and every row, with per-row `try/catch` that logs and continues.

**Routing type:** reuse `SlackNotificationRoutingType.EVIDENCE_AND_TASK_ALERTS`. A dedicated risk value would be truer, but `routing_type` is a Postgres `ARRAY(ENUM)` column and adding a value there is a second migration for a label. Deliberate reuse; note it in the code.

Slack failures must never abort the sweep — in dev there are **0 rows in `slack_webhooks`**, so `sendSlackNotification` finding no target is the normal path, not an error.

---

## 7. Safety: both outbound channels are inert in dev

Verified before any sweep was run, and Spark must re-verify before running one:

- `RESEND_API_KEY` in `Servers/.env` is **empty** (`EMAIL_PROVIDER=resend`), so Resend cannot authenticate and no mail leaves the machine.
- `slack_webhooks` has **0 rows**, so no Slack message has a destination.

This matters because the sweep's recipients are the real `risk_owner` values on 37 demo risks. **If either of those two facts stops being true, do not run the sweep against the dev database.** Check both, every time, before invoking it.

---

## 8. Out of scope / deferred

- **Per-org configurable thresholds.** The roadmap's `automationTrigger` path, rejected in §2.3 because it cannot express the chain. Revisit when `automations` is non-empty for a real tenant and the chain shape is fixed.
- **A Slack automation *action* type.** §2.2. Slack ships here via the notification service, not the automation action registry.
- **A dedicated overdue escalation** with its own cadence (e.g. weekly until resolved). §4.1 covers overdue rows once; a repeating nag is a different feature.
- **Vendor review escalation** — already ships (§2.1).
- **`mitigation_status` gating.** The roadmap names the column. Escalating only unresolved risks is reasonable, but "resolved" is not a single value on this enum and picking one silently changes who gets notified. Escalate on the date alone; revisit with a decision about which statuses mute a deadline.
- **`pmm-reminder.mjml`** is declared in `constants/emailTemplates.ts` but referenced nowhere. Pre-existing dead template. Do not wire it.
- Frontend. The notification bell renders unknown types with a default — verified for `evidence_stale` during F6.

---

## 9. Tests

**Unit — `Servers/services/automations/actions/__tests__/deadlineEscalationSweep.test.ts`** (mock the queries and notifiers):

1. A risk 7 days out with no prior notice → in-app+email notifier called once, Slack not called.
2. A risk 1 day out → Slack called; and the 7-day notice is independent (its own dedup row).
3. A risk 7 days out **that already has a `threshold_days: 7` notification** → nothing sent.
4. A risk already overdue with no prior notice → still notified once (§4.1).
5. A risk with `risk_owner = null` → admins still notified, no crash.
6. One recipient's notifier throwing → the sweep continues to the next row and the next org. This is the `policyDueSoonNotification` bug (§6); the test is what stops it recurring.

**Integration — `Servers/tests/integration/deadlineEscalation.test.ts`:**

1. Seeded risk 7 days out → exactly one `notifications` row with `metadata->>'threshold_days' = '7'`.
2. Running the sweep **twice** produces exactly one row, not two.
3. Tenant isolation: a second org's due risk never notifies org 1's users.
4. A risk 30 days out produces no row.

---

## 10. Seed

`Servers/seed_risk_deadlines_demo.sql`.

**Relative dates only** — `NOW() + INTERVAL '7 days'`, never a literal date. This feature is entirely about distance from today; absolute dates go stale the day after they are written.

Today the dev org has no rows the sweep would touch:

```
risks.deadline:          set=37/37  within_7d=0  overdue=0
model_risks.target_date: set=8/8    within_7d=0
vendors.review_date:     set=3/3    within_7d=0
```

The seed **mutates existing demo risks** rather than inserting new ones — a narrow `UPDATE` on pinned ids, so it stays inside the 9500-9599 block that `seed_risk_links_demo.sql` owns and adds no new id block:

| Risk | New deadline | Exercises |
|---|---|---|
| 9501 | `NOW() + INTERVAL '7 days'` | the email threshold |
| 9505 | `NOW() + INTERVAL '1 day'` | the Slack threshold |
| 9530 | `NOW() - INTERVAL '3 days'` | overdue (§4.1) |
| 9502 | `NOW() + INTERVAL '30 days'` | must **not** fire |

Plus one `model_risks` row at `NOW() + INTERVAL '7 days'` to exercise the second entity.

The seed header must name these ids and say it updates rather than inserts, so a reader does not go looking for a new block.
