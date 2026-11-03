# AI-assisted intake, part 2: risk-based routing and the oversight dashboard

## Why

Part 1 (PR #5077, spec `2026-10-21-ai-intake-classification-design.md`) gives every intake submission a rule-floored risk score and suggested risks. The customer's governance team saw the concept demo (artifact "AI-assisted intake review", stages "Route and decide" and "Oversight dashboard") and wants the next step: the score should pick who reviews a submission, the quick lane should be spot-checked, and the committee should be able to see whether the AI and the people reviewing it are working as intended.

Today any user with `intakeForm.edit` (Admin, Editor) can approve or reject any submission. A form's `recipients` only receive the new-submission email. Nothing records who should review what, nobody checks fast approvals, and there is no view of reviewer behaviour.

This is part 2 of 3. Part 3 (not scheduled) is live checks while filling in the form, the full reviewer brief and the weekly oversight email.

The user skipped the design questions and asked for the design to be written from the demo and the part 1 spec. Every decision below that isn't in the demo or part 1 is marked **(my call)**.

## Goals

- A form can turn on **routing**. Each submission is then assigned to a **senior** or a **standard** review lane from its score, and the lane is shown with the reason.
- Routing rules (from the demo): score at or above the threshold (default 50) → senior; below → standard. Always senior, whatever the score: a prohibited practice, or a score within the close-call margin (default 10) of the threshold.
- When routing is on, **only the assigned lane's reviewers decide** (approve or reject), plus senior reviewers on any lane and Admins.
- **Random second review:** a share (default 10%) of standard-lane approvals is picked at random for a second review by a senior reviewer, who records "agreed" or "missed" with a note.
- An **Oversight** tab on the intake page shows, for a chosen period: submissions per lane per week, median time to decision, prohibited and high-risk uses caught, second-review results, a per-reviewer table with band-override rates (0% over enough decisions is a warning), how often the score band was kept, suggested-risk acceptance, and a "needs attention" list.

## Non-goals (this part)

- The weekly oversight email and "reply to pause" (part 3).
- An AI decision suggestion, hidden or not. The product suggests no decision; the demo's anchoring safeguard has nothing to hide yet.
- New decision options (approve with conditions, send back for changes). Approve and reject stay as they are.
- A threshold slider or score distribution chart (dropped by the user in part 1), a calibrated "chance of high risk" (part 1 anti-goal: the score is never a probability), a second-model judge (dropped).
- Integrating intake with the approval-workflows module (`approval_workflows`, multi-step approvers). Routing is a single decision by one person in the right lane **(my call: the approvals module is multi-step and per entity type; intake needs one decision picked by score, and coupling them would put intake decisions behind a module Admins configure elsewhere)**.
- Fixing the wider gap that the review screen never checks permissions. This part only hides the decide buttons where the new lane rule forbids deciding.
- Changing the score, the rule minimums or the suggested risks.

## Anti-goals (failures even if it "works")

- **Anything is decided without a person.** Routing picks a reviewer; it never approves, rejects or skips review.
- **A prohibited submission, or one with no usable score, lands in the standard lane.**
- **A second-review "miss" silently undoes an approval.** The approval stands; the miss is recorded and shown.
- **A form with routing off behaves differently from today.** Routing is opt-in per form, and existing forms keep today's behaviour.
- **A submission can't be decided by anyone** (for example every lane reviewer left the organisation). Admins can always decide.
- **The dashboard shows a number it can't back up.** If a figure can only be built from partial data (override history, see below), the screen says what it counts.
- **Reviewer figures are visible to people who shouldn't see them.**

## Existing code to build on

Verified 2026-10-22 against develop at 4bc840658.

| Area | Where | Notes |
|---|---|---|
| Submission columns | `intake_submissions` (`20260226234302-tenant-tables.js:2627`) | `status` pending/approved/rejected/superseded, `reviewed_by`, `reviewed_at` (set on approve and reject), `rejection_reason`, `original_submission_id`, `resubmission_count`, `risk_assessment` (v2: `finalScore`, `classificationLevel`, `tier`, `status`), `risk_override` (`{tier, justification, overriddenBy, overriddenAt}`, last value only), `suggested_risks`, `notification_sent_at` |
| Form columns | `intake_forms` | `recipients JSONB` (user ids, email only), `llm_key_id`, no routing column |
| Approve / reject | `Servers/controllers/intakeForm.ctrl.ts` `approveSubmission` (~1741), `rejectSubmission` (~2075); routes `intakeForm.route.ts:98-108` with `authorize("intakeForm.edit")` | Approve locks the row in a transaction. Reject needs a reason and emails a resubmission token. Resubmission marks the original `superseded` |
| Permission | `Servers/config/rolePermissions.config.ts:189` `intakeForm.edit` → Admin, Editor | Custom org roles resolve through `role_permissions`; new keys go in the catalog (parity test `rolePermissions.config.test.ts`) |
| Scoring settles | `Servers/services/intakeScoring/assessmentJob.ts` | The scoring stage writes `complete`, `ai_not_configured` or `ai_failed`. Approve/reject close running stages (`settleAssessmentOnDecision`) |
| New-submission email | `assessmentJob.ts:430` `sendIntakeNotificationOnce` → `intakeFormEmail.service.ts:161`, template `templates/intake-new-submission-admin.mjml` | Sent once, after both stages settle or at the 2-minute cap |
| Recipients picker | `Clients/src/presentation/pages/IntakeFormBuilder/index.tsx:1143` | `CustomizableMultiSelect` over `GET /users` |
| Intake page | `Clients/src/presentation/pages/IntakeFormBuilder/IntakeFormsListPage.tsx` | Tabs forms / submissions (`mainTab`, ~365-390), opens `SubmissionPreviewModal` |
| Dashboard template | `Clients/src/presentation/pages/AIGateway/SpendDashboard/index.tsx` | `StatCard` KPI grid + recharts |
| Event log | `logSuccess` → `event_logs` + `audit_ledger` (`utils/logger/dbLogger.ts`) | Free text; used today on approve/reject |

## Design

### 1. Routing settings, per form

A new **Review routing** section in the form builder, under Recipients. Off by default.

| Setting | Default | Allowed |
|---|---|---|
| Route by risk score | off | on / off |
| Senior reviewers | none | 1 or more users |
| Standard reviewers | none | 1 or more users |
| Threshold | 50 | 1–99 |
| Close-call margin | 10 | 0–25 |
| Second review share | 10% | 0–100% |

- Per form, not per organisation **(my call: recipients are already per form, and an HR form and an IT form have different people)**.
- Stored as `intake_forms.routing JSONB NULL`: `{ enabled, seniorReviewerIds, standardReviewerIds, threshold, closeCallMargin, secondReviewRate }`. The server validates the ranges, that both lists are non-empty when enabled, and that every id is a user of the organisation.
- The pickers list only users whose role has `intakeForm.edit` **(my call: deciding still needs `intakeForm.edit`, so offering anyone else would create reviewers who get a 403)**. A user can sit in both lists; senior wins.
- Helper copy explains the rule in one line: "Scores of 50 or more, prohibited practices and scores within 10 points of 50 go to senior reviewers."
- Saving the settings re-routes the form's pending submissions whose scoring has settled (section 2), except ones escalated by hand. Turning routing off keeps the stored lanes for the record but stops enforcing them.

### 2. Lane assignment

Assigned when the **scoring** stage settles (`complete`, `ai_not_configured` or `ai_failed`), in the same place that writes the scoring result, only while the submission is pending and the form has routing on. Suggestions don't affect the lane.

Rules, first match wins, with a stored reason code:

| Order | Condition | Lane | Reason |
|---|---|---|---|
| 1 | `classificationLevel` is Prohibited | senior | `prohibited` |
| 2 | no `finalScore` (null), or scoring `ai_failed` | senior | `no_score` |
| 3 | \|finalScore − threshold\| < closeCallMargin | senior | `close_call` |
| 4 | finalScore ≥ threshold | senior | `at_or_above_threshold` |
| 5 | otherwise | standard | `below_threshold` |

- Rule 2 is **my call**: without a trustworthy score, the safe lane is senior. A rules-only score (`rulesOnly`, AI not set up) is a real score and routes normally.
- Stored as `intake_submissions.routing JSONB NULL`: `{ lane, reason, score, threshold, closeCallMargin, routedAt, escalation?, secondReview? }`. The threshold and margin are copied in so later setting changes don't rewrite history for decided rows.
- A Retry that re-scores a pending submission re-routes it. Decided submissions are never re-routed.
- **Escalate by hand:** a standard reviewer (or Admin) can send a standard-lane submission to senior review with a required reason. Stored as `escalation: { by, at, reason }`; the lane becomes senior and automatic re-routing no longer applies to it. There's no move from senior down **(my call: the demo only routes up)**.
- **A band override raises the lane.** `PATCH /risk-override` on a pending, routed submission re-runs the rules with the overridden band's lower bound as the score (Low 0, Medium 26, High 51, Critical 76). If that gives senior, the lane moves to senior with reason `override_raised`. It never moves down **(my call)**.
- A submission still being scored has no lane. While it has none, any reviewer in either lane (and Admins) may decide it **(my call: part 1's anti-goal says scoring never blocks a decision)**. The dashboard counts these as "decided before routing".

### 3. Who may decide

With routing on and a lane assigned, approve and reject require, on top of `intakeForm.edit`:

- senior lane: a senior reviewer, or an Admin;
- standard lane: a standard or senior reviewer, or an Admin.

- **The check uses what the decision would make true, not only the stored lane.** Inside the approve transaction, after the reviewer's EU AI Act override and band override are applied and the score is re-floored, the rules run again on that result. If they give senior and the decider is not a senior reviewer or an Admin, the approval is refused with 403 "A senior reviewer has to decide this: <reason>". So a standard reviewer can't approve a submission while setting it to Prohibited or above the threshold **(my call, from the anti-goal)**. Reject checks the stored lane only, since rejecting creates nothing.
- Enforced on the server in `approveSubmission` and `rejectSubmission` (403 "This submission is assigned to senior reviewers"), checked inside the existing transaction after the row lock, so a re-route can't race the check.
- Admins always may, so a lane emptied by departures can't block a submission **(my call)**. An Admin deciding outside their lane is logged as such.
- The preview endpoint returns `routing` plus `canDecide: boolean` and `decideBlockedReason`. The modal shows the lane chip and reason ("Senior review · score 84, prohibited practice") and, when `canDecide` is false, replaces the approve and reject buttons with a line naming the lane's reviewers.
- The submissions list gets a **Lane** column and a filter: all, senior, standard, not routed, assigned to me.

### 4. New-submission email

- With routing on, the email goes to the assigned lane's reviewers plus the form's recipients, de-duplicated. The email states the lane and reason.
- If the 2-minute cap fires before scoring settles (no lane yet), it goes to both lanes plus recipients, with "Not routed yet: scoring is still running" **(my call: no second email when the lane arrives; one email per submission stays the rule from part 1)**.
- Routing off: unchanged.

### 5. Random second review

- When a submission whose lane at decision (after the re-check above) is standard is **approved** by someone other than a senior reviewer, it is picked for second review with probability `secondReviewRate`, using `crypto.randomInt`. Rejections and senior-lane approvals are never picked (the demo audits fast-lane approvals only).
- Picked: `secondReview: { status: "open", selectedAt }`, set inside the approval transaction. After commit, senior reviewers get a short email with a link to the submission.
- A senior reviewer opens the approved submission. The modal shows a **Second review** panel: "Agree" or "Missed something", with a note, required for a miss. Stored as `{ status: "agreed" | "missed", reviewedBy, reviewedAt, note }`. New endpoint `POST /intake/submissions/:id/second-review` (senior reviewers and Admins of that form; 409 unless an open second review exists).
- A miss does not reverse the approval, reopen the submission or delete the entity **(anti-goal)**. It stays in "needs attention" until a senior reviewer or Admin marks it **resolved** with a note on the same panel (`POST /intake/submissions/:id/second-review/resolve`), stored as `resolvedBy`, `resolvedAt`, `resolutionNote` on `secondReview` **(my call: nothing links later edits of the use case or model back to the submission, so resolving is an explicit step)**.
- The person who approved can't do the second review of their own approval.

### 6. Oversight tab

**Decision record.** Every approve and reject (routing on or off) writes `intake_submissions.decision_record JSONB`: `{ level, computedBand, bandInForce, bandChanged, overriddenBy, lane }`. `level` is the EU AI Act level the decision was made at (after a reviewer's level override), `computedBand` is the band of the score after re-flooring, `bandInForce` is the override band if there is one, else `computedBand`, and `lane` is the lane at decision or null. Dashboard figures about decisions read this record, so they reflect what was in force when the person decided **(my call)**. Rows decided before this part have no record; the dashboard falls back to `risk_assessment.tier` vs `risk_override.tier` and `classificationLevel` for them.

A third tab on the intake page, **Oversight**, for users with `intakeForm.edit` **(my call: it shows per-reviewer figures, so not every role that can open the page)**. Filters: period (4, 8 or 12 weeks, default 8) and form (all forms, or one). One endpoint, `GET /intake/oversight?weeks=8&formId=`, computes everything in SQL over the organisation's submissions created in the period. A superseded row that has `reviewed_at` was rejected and later resubmitted; it counts as a decided rejection by its `reviewed_by`. A superseded row without `reviewed_at` counts as a submission only **(my call)**.

**KPI cards** (StatCard, as in SpendDashboard):

| Card | Figure | Sub-line |
|---|---|---|
| Submissions | count | senior · standard · close calls · not routed · routing off |
| Median time to decision | `reviewed_at − created_at`, decided rows | per lane |
| Redlines caught | prohibited + high-risk: `decision_record.level` for decided rows, `classificationLevel` for pending ones | split |
| Second reviews | missed of completed | open count |

**Submissions by lane:** stacked weekly bars (recharts): senior, close call (senior with `close_call`), standard, not routed, routing off.

- "Not routed" means a submission on a form with routing on that has no lane: decided or still pending before scoring settled. Submissions on forms with routing off are their own "routing off" group, so they don't bury that signal **(my call)**.

**Reviewers table:** reviewer, decisions, band changed (count and %), median time to decision, and a "Check" chip when a reviewer has 10 or more decisions in the period and never changed a band **(threshold 10 is my call; the demo treats 0% as a warning)**.

- "Band changed" means `decision_record.bandChanged`: the band in force at decision differs from the computed band. It is credited to the person who decided (`reviewed_by`), whoever set the override, because deciding on a changed band is the act being measured **(my call)**. The screen says "Counts the band in force at decision" under the table. Override history is a non-goal.

**Scores and suggestions:**
- Band kept: decided submissions where the reviewer didn't change the band, as "N of M (x%)", overall and for senior-lane submissions.
- Suggested risks accepted: accepted of suggested, over decided submissions with a `complete` suggestions block.

**Needs attention** (newest first, max 20):
- open second reviews older than 3 days;
- second-review misses in the period;
- pending prohibited submissions;
- pending submissions older than 7 days;
- forms with routing on whose senior or standard list has no active user.

Thresholds (3 days, 7 days) are **my call**.

**Audit trail:** routing, escalations, second reviews and Admin out-of-lane decisions are written through `logSuccess`, as approve and reject already are. No new log table.

### 7. Migrations

One migration (timestamp from `date`): `intake_forms.routing JSONB NULL`, `intake_submissions.routing JSONB NULL`, `intake_submissions.decision_record JSONB NULL`, and an index for the dashboard on `intake_submissions (organization_id, created_at)` if one doesn't exist. No data migration: existing forms have routing off.

### 8. Translations

New strings get de, fr and es in `Clients/src/i18n/translations.ts`. Server strings go through `req.t`.

## Constraints

- Every query is scoped by `organization_id`; the dashboard query must be too.
- House UI: `CustomizableButton`, `StandardModal`, sentence case, 30px controls, `#d0d5dd` borders, 4px radius, pixel spacing strings, theme colours.
- Jest only through `npm run test` (never bare `npx jest <pattern>`). Gates from the package directories.
- No competitor names anywhere.
- Copy never calls the score a probability or confidence.

## Tests the builder must write

- Lane rules: each row of the rules table, the boundaries (score = threshold, score = threshold ± margin), Prohibited at a low score, `ai_failed`, null score, `rulesOnly`.
- Re-route on settings save and on Retry; no re-route after escalation or decision.
- Decision-time re-check: a standard reviewer approving with a Prohibited level override, or a band override above the threshold, gets 403; a senior reviewer doesn't. Band override on a pending submission raises the lane, never lowers it.
- Decision record written on approve and reject, with routing off too.
- Miss resolve: endpoint auth, note required, resolved misses leave "needs attention".
- Decide authorisation: each lane × role (senior, standard, both, neither, Admin), routing off, no lane yet; 403 copy.
- Second review: picked only for standard-lane approvals by non-seniors; rate 0 and 100; endpoint auth; self-review refused; 409 without an open review; a miss leaves the approval and entity untouched.
- Email recipients: lane + recipients de-duplicated; cap before routing; routing off unchanged.
- Settings validation: ranges, empty lists when enabled, users from another organisation.
- Oversight query: lane counts, median, superseded handling, band-changed attribution, org isolation, form filter.
- Client: lane chip and blocked state in the modal, escalate dialog, second-review panel, routing settings section, oversight tab rendering with empty data.

## Left to the builder

- Exact component split for the Oversight tab and the settings section.
- SQL shape of the oversight query (one query or a few).
- Wording of emails and helper copy, within the house style.
- Whether the lane filter "assigned to me" is computed on the server or the client.
