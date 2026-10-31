# Intake forms: AI scoring, suggested risks, routing and oversight

Public intake submissions get a rule-floored risk score and up to 10 suggested risks, computed in the background. Reviewers see both in the review modal. Accepted suggestions become real risks when the submission is approved.

A form can also route each scored submission to a senior or standard review lane, sample some standard approvals for a second review, and feed an Oversight tab. See Routing, Second review and Oversight below.

Design specs: `docs/superpowers/specs/2026-10-21-ai-intake-classification-design.md` (scoring) and `docs/superpowers/specs/2026-10-22-intake-routing-oversight-design.md` (routing and oversight).

## Where the code lives

| Area | Path |
|---|---|
| Score maths (server, mirrored on the client) | `Servers/services/intakeScoring/scoreMath.ts`, `Clients/src/application/utils/intakeScoring/scoreMath.ts` |
| AI scoring runs, prompt | `Servers/services/intakeScoring/aiScoring.ts`, `prompts.ts`, `scoringInput.ts` |
| Suggested risks, register mappers | `Servers/services/intakeScoring/intakeSuggestions.ts`, `riskMappers.ts` |
| Background job, enqueue, email | `Servers/services/intakeScoring/assessmentJob.ts`, `enqueue.ts` |
| Retry stage selection | `Servers/services/intakeScoring/retry.ts` |
| Approval risks, recompute | `Servers/services/intakeScoring/approvalRisks.ts` |
| Storage queries | `Servers/utils/intakeForm.utils.ts` |
| Migration | `Servers/database/migrations/20261021120000-intake-ai-assessment.js` |
| Review UI | `Clients/src/presentation/pages/IntakeFormBuilder/assessment/` |
| Lane rules, decision gate, routing writes | `Servers/services/intakeRouting/routingRules.ts`, `decisionGate.ts`, `routingService.ts` |
| Oversight figures | `Servers/services/intakeRouting/oversight.ts` |
| Routing and oversight UI | `Clients/src/presentation/pages/IntakeFormBuilder/routing/`, `oversight/` |
| Lane rules (client mirror, for "Preview as") | `Clients/src/application/utils/intakeRouting/routingRules.ts`, `previewRole.ts` |
| Preview menu and role banner | `Clients/src/presentation/pages/IntakeFormBuilder/preview/`, `PublicIntakeForm/PreviewBanner.tsx` |

## Score

The final score is the higher of the rule minimum and the AI median. The AI can raise it but never lower it.

| EU AI Act level | Rule minimum |
|---|---|
| Prohibited | 90 |
| High risk | 70 |
| Limited risk | 30 |
| Minimal risk, Out of scope | 0 |
| No questionnaire run (step off, model forms) | none, `notRuleChecked: true` |

- The level comes from the submission's stored EU AI Act run, re-scored under its own questionnaire version (`rescoreStoredRun` in `Servers/utils/intakeSubmissionData.utils.ts`).
- The AI part is 5 parallel runs on the form's LLM key (temperature 0.7). A run is valid when it parses against the schema. At least 3 valid runs are needed for a median.
- Each reason must quote the answer it cites. Reasons whose excerpt is not in that answer are dropped. Select answers are matched against the option label.
- Bands: Low 0 to 25, Medium 26 to 50, High 51 to 75, Critical 76 to 100. `risk_tier` stores the band for v2 rows.
- With no AI median the score is the rule minimum (`rulesOnly`), shown as "at least N (rules only)". With no AI median and a minimum of 0 there is no score (`finalScore: null`).

### Prompt safety

Submitter name, submitter email and schema fields of type `email` never reach the LLM. Answers are serialised as JSON inside a delimiter tag carrying a per-call random nonce, and the nonce is stripped from the submitted text, so an answer can't close the block. The system prompt names the tag and tells the model to ignore instructions inside it. The suggestion prompt fences its context the same way. Each answer is capped at 2,000 characters and all answers at 24,000.

## Storage

`intake_submissions.risk_assessment` holds a versioned object. `version: 2` is the AI score; rows without a version are the old keyword score and keep the old display.

```ts
{ version: 2, status, notRuleChecked, classificationLevel, ruleMinimum,
  ai: { runs, failedRuns, validRuns, median, min, max, reasons } | null,
  finalScore, source: "rule_minimum" | "ai" | null, rulesOnly,
  overallScore /* = finalScore */, tier /* band */, stageStartedAt, scoredAt, error? }
```

`intake_submissions.suggested_risks` (JSONB) holds `{ status, items, droppedCount, stageStartedAt, generatedAt, error? }`. `notification_sent_at` marks the one-time email.

Stage statuses: `pending`, `complete`, `ai_not_configured` (form has no LLM key, or the key was deleted) and `ai_failed`.

Per-suggestion writes are single atomic `UPDATE`s on the matching array element (`updateSuggestedRiskItemQuery`, `setAllSuggestionStatesQuery`). Two reviewers acting at once don't overwrite each other, and the same statement refuses to leave an accepted item without a mitigation plan. Every assessment and suggestion write requires `status = 'pending'`, so a job that finishes after approve or reject changes nothing. The assessment write keeps a reviewer override's band in `risk_tier`.

## Background job

Both public submit handlers call `startIntakeAssessment` after the transaction commits. It is not awaited, so a slow queue never delays the submitter.

- `intake_assessment` runs the requested stages (`scoring`, `suggestions`) side by side. Each stage writes `pending` first, then its result. A failure in one stage, or in loading the key, classification or answers, is recorded as `ai_failed` and the other stage still runs. Its job id is `intake-assessment:{org}:{submission}-{stages}`: BullMQ rejects a custom id containing `:` unless it has exactly 3 parts.
- `intake_notify_cap` fires 2 minutes later. The new-submission email goes out once, when both stages settle or at the cap, whichever comes first. `claimSubmissionNotificationQuery` makes it one email. A cap that fires mid-run sends a "still running" note in place of numbers. A submission already approved or rejected gets no email.
- If the job can't be queued, the handler emails reviewers at once without results, after claiming the notification.
- Forms opened through the legacy `/{tenantSlug}/{formSlug}` route email org admins when the form has no recipients (`adminFallback`). The public-id route skips them, as before.
- On worker start, `backfillIntakeAssessments` queues the stages each pending submission still needs: legacy rows, missing blocks and stages pending for over 10 minutes. It never re-runs a settled stage. A submission whose email never went (`notification_sent_at` is NULL, so its job or cap was lost) is queued with `notify: true`, or emailed at once when both stages have settled. Only forms with recipients count, so a form without recipients (which never claims) isn't listed on every start. The direct send also waits until the submission is over 10 minutes old, so a live job keeps its own email and language. The submitter's language and the route's `adminFallback` aren't stored, so that email uses the default language and a form without recipients stays silent.

## Submitter confirmation and review time

`intake_forms.review_days` (1–30, default 3, CHECK constraint) is the agreed review time in business days, edited in the form builder (`ReviewTimeField`). At submit, the handler stores `intake_submissions.review_due_date` (DATE): that many weekdays after the submission's calendar day. Counting starts the next day, and holidays are not skipped. Organizations have no stored timezone, so the day is taken in UTC (`REVIEW_TIME_ZONE` in `services/intakeConfirmation/reviewTime.ts`; `addBusinessDays` takes the zone as a parameter). The due date is returned on submission rows and in the review preview (`reviewDueDate`), for "time in review against the agreed time".

The submitter's "submission received" email names who reviews and by when, so it waits for routing. `sendSubmitterConfirmationOnce` (`services/intakeConfirmation/confirmation.ts`) sends it at most once per submission, claimed through `intake_submissions.confirmation_sent_at` (`claimSubmissionConfirmationQuery`, atomic, pending submissions only). It is called:

- by the submit handler, without fallback. It sends at once when routing is off (naming the form's recipients who can still review) or when neither lane has a reviewer. Otherwise it waits.
- by the assessment job, once `routeSettled` has run (or thrown), with fallback. It names the stored lane's reviewers, or the governance team if no lane was stored.
- by `intake_notify_cap` at 2 minutes, with fallback, naming the governance team if routing has not picked a lane yet.
- when the job can't be queued, at once, with fallback.
- on worker start, `backfillSubmitterConfirmations` sends confirmations still unclaimed 10 minutes after submit, with fallback, in the default language.

Up to three reviewers are named (first and last name), then "and N others". The resubmit link uses a freshly signed token. A failed reviewer lookup names the governance team, and a failed tenant slug lookup links to the generic page. The token is built before the claim, so a failure there leaves the claim for the next path. A resubmission is its own submission and gets its own email. The migration marks every existing submission as confirmed, because the old code emailed at submit.

## Review endpoints

All new writes use `authorize("intakeForm.edit")`.

| Route | Purpose |
|---|---|
| `GET /intake/submissions/:id/preview` | Adds `assessment`, `suggestedRisks`, `ruleMinimumPreview` (current rules) and `assessedLevel` (stored) |
| `POST /intake/submissions/:id/assessment/retry` | 202 with the stages queued. Only failed stages, stages never stored, or stages pending over 10 minutes. 409 when nothing qualifies |
| `PATCH /intake/submissions/:id/suggested-risks/:suggestionId` | Edit, accept, dismiss or restore one suggestion. Whitelisted fields only. Accepting needs a mitigation plan |
| `POST /intake/submissions/:id/suggested-risks/accept-all` | Accepts open suggestions that have a mitigation plan. Returns `{ accepted, skipped, items }`, with items as stored. 409 when the submission isn't pending, including one decided during the call |
| `PATCH /intake/submissions/:id/risk-override` | Pending submissions only (409 otherwise). A pre-v2 tier name is stored as its band (`bandOfTier`). For v2, or a submission not scored yet, the tier must be a band at or above the band of the current rule minimum |

## Routing endpoints

All use `authorize("intakeForm.edit")`.

| Route | Purpose |
|---|---|
| `GET /intake/routing/eligible-reviewers` | Users of the organization whose role has `intakeForm.edit`: `[{ id, name, surname, email }]`. The form builder fills its reviewer pickers from it |
| `POST /intake/submissions/:id/escalate` | Body `{ reason }`, 1 to 1000 characters (400 otherwise). Moves a pending standard-lane submission to senior with reason `escalated`. 404 for an unknown submission or form. 409 when it isn't pending, routing is off, it isn't in the standard lane, or it changed meanwhile. 403 unless the caller is an Admin or a reviewer listed on the form. Returns the new routing |
| `POST /intake/submissions/:id/second-review` | Body `{ outcome: "agreed" or "missed", note? }`. The note is at most 2,000 characters and required for `missed` (400). 403 unless the caller is a senior reviewer of the form or an Admin, or if they approved the submission themselves. 404 for an unknown submission. 409 when the review isn't open. Returns the new routing |
| `POST /intake/submissions/:id/second-review/resolve` | Body `{ note }`, 1 to 2,000 characters (400 otherwise). Same 403 and 404 rules. 409 unless the review is missed and not yet resolved. Returns the new routing |
| `GET /intake/oversight?weeks=4, 8 or 12&formId=` | See Oversight. `weeks` defaults to 8 |

Fields added to existing responses:

- Form create and update bodies, and form responses, carry `routing`.
- `GET /intake/submissions` rows carry `routing`, `routingEnabled`, `laneReviewerIds` (who can decide the row's stored lane) and `secondReviewerIds`: the form's senior reviewers who are currently eligible (`getEligibleReviewerIdsQuery`, org-scoped), minus the approver (`reviewedBy`), only for a row whose second review is open or missed and not yet resolved, else `[]`. They are listed even when routing has since been turned off.
- Submissions list filters (client, `laneFilter.ts`): "Second review" shows rows with an open or unresolved-missed second review and is not blocked for routing-off forms. Picking it resets a pending, rejected or superseded status filter to All, since second reviews sit on approved rows. "Assigned to me" also matches such a row when the user is in `secondReviewerIds` and did not approve it; Admins are not added unless they are listed, matching `laneReviewerIds` for lanes; Admins find every open second review under "Second review". Those rows also get a "Second review" chip.
- The second-review email links to `/intake-forms/submissions?submission=<id>` (only that email; the others still link to `/intake-forms`). The list page validates the id as a positive integer, opens the preview modal for it whatever the filters show (it asks the preview endpoint, so an approved row works), clears the param, and shows "That submission could not be found" for an invalid or unknown id.
- `GET /intake/submissions/:id/preview` adds `routing`, `routingEnabled`, `canDecide`, `decideBlockedReason`, `laneReviewers` (`[{ id, name }]`) and `isSeniorReviewer`.
- Approve and reject return 403 when the caller may not decide the lane.

## Routing

Routing is opt-in per form. It is stored in `intake_forms.routing` (JSONB) and, per submission, in `intake_submissions.routing`. A form with no routing block, or `enabled: false`, behaves as before: any user with `intakeForm.edit` can decide.

Form settings (`routing` in the body of `POST /intake/forms` and `PATCH /intake/forms/:id`, validated by `validateRoutingSettings`):

| Field | Rule | Default |
|---|---|---|
| `enabled` | boolean, required | |
| `seniorReviewerIds`, `standardReviewerIds` | arrays of positive integer user ids, repeats dropped. Both need at least one entry when `enabled` is true | `[]` |
| `threshold` | whole number, 1 to 99 | 50 |
| `closeCallMargin` | whole number, 0 to 25 | 10 |
| `secondReviewRate` | whole number, 0 to 100, a percent | 10 |

Omitting `routing` leaves it alone and sending `null` clears it. On create every listed id must belong to a user of the organization whose role has `intakeForm.edit` (`getEligibleReviewerIdsQuery`). On update only ids newly added compared with the stored lists must; ids already stored may stay. Otherwise the save is refused with 400. When enabled, a changed list needs at least one currently eligible reviewer. Only an Admin (`req.role === "Admin"`) may change routing, on create and update: any other role gets 403 "Only an Admin can change review routing" before anything is written. A change is detected by value (`routingChanged`): the enabled flag, the senior or standard id sets (order ignored), or any of the three numbers differ from the stored block, with no stored block counting as off with the default numbers; `null` is a change only when a block is stored. The builder sends the stored block on every save, so an Editor saving other edits is not affected. Every routing change by an Admin is audit-logged (`logRoutingChange`) with the form id and the before and after enabled flag, id lists and numbers (user ids only). In the builder the settings are read-only for non-Admins. After a save that sets routing, `rerouteFormPending` routes the form's pending submissions again. A failure there is logged and does not fail the save.

### Lane rules

`laneFor` in `routingRules.ts`. The first match wins:

| Order | Condition | Lane | Reason |
|---|---|---|---|
| 1 | EU AI Act level is Prohibited | senior | `prohibited` |
| 2 | `finalScore` is null, or scoring status is `ai_failed` | senior | `no_score` |
| 3 | `abs(score - threshold) < closeCallMargin` | senior | `close_call` |
| 4 | `score >= threshold` | senior | `at_or_above_threshold` |
| 5 | otherwise | standard | `below_threshold` |

Two more reasons are set outside `laneFor`: `override_raised` and `escalated`.

- `routeSubmission` runs once a submission's scoring has settled (status other than `pending`) and stores `{ lane, reason, score, threshold, closeCallMargin, routedAt }`. It writes only while the stored routing is still the value it read, and does nothing for a decided submission or one a reviewer escalated. A rejected submission that is resubmitted becomes a new row with `routing = NULL` and is routed on its own when its scoring settles.
- `raiseForOverride` runs after `PATCH /intake/submissions/:id/risk-override`. If the override band, taken at its lower bound (Low 0, Medium 26, High 51, Critical 76), would route to senior, the submission moves to senior with reason `override_raised`. It never lowers a lane, and a later re-route keeps a raised submission in senior.
- Escalation moves a standard submission to senior with reason `escalated` and stores `escalation: { by, at, reason }`. Re-routing leaves an escalated submission alone.

### Who may decide

`canDecideLane`: with routing off, any user with `intakeForm.edit` can decide. With routing on, a submission with no lane stored yet is not open to everyone: its lane is computed from the current values, and an unscored or still-pending score counts as senior (reason `no_score`), so standard reviewers are refused until scoring settles. With routing on, an Admin can always decide, a senior reviewer can decide in either lane, and a standard reviewer only in the standard lane.

Approve checks the lane the approval would make true (`laneAtDecision`): the stored lane, raised to senior when the level and score after the reviewer's changes route there. It never lowers a stored lane. A standard reviewer who sets a Prohibited level or a band that routes to senior gets 403. Reject uses the stored lane (`laneOnRecord`). When an Admin decides in a lane the lists would not have let them into, the controller logs it (`logIfOutsideLane`).

A reviewer who is deleted, or who loses `intakeForm.edit`, stays in the form's lists. Admins can still decide and the form shows as "No active reviewer" in the Oversight tab when a lane has nobody left. A save may keep a stored id that is no longer eligible, because it grants nothing (`authorize("intakeForm.edit")` still gates every decision); the builder lists such ids as "Former user" so they can be removed. Only ids added by the request must be eligible. When routing is on, a list that changed in the request (or every list, when routing is being switched on) must contain at least one currently eligible reviewer, else 400; an untouched form with an emptied lane can still save other edits.

Second-review actions by senior reviewers keep working after routing is turned off: `loadSecondReview` checks the stored senior list, not `routing.enabled`.

### Preview as a role

The builder's Preview menu opens either the public form or the review flow as a role. Both are UI only; the server still authorises every real action for the signed-in user.

- **Submitter.** Opens `/<publicId>/use-case-form-intake?vwPreview=1&as=submitter` in a new tab. `PublicIntakeForm` shows a dismissible notice and nothing else changes: submitting still creates a real submission. Without `vwPreview=1` the page is unchanged.
- **Admin, senior reviewer, standard reviewer.** Opens `/intake-forms/submissions?simulateRole=admin|senior|standard` in a new tab. The role lives only in the query string and only applies on the Submissions tab. A banner ("Previewing as <role>, simulation only") switches role in place or exits. The list's "Assigned to me" filter and the review modal follow the simulated role: `simulatedReviewGate` (`previewRole.ts`) runs the client copies of `entityLevel`, `laneOnRecord`, `canDecideLane` and `laneReviewerIdsFor` for a stand-in user who is the form's only reviewer of that kind. The modal reads the form's current routing with `getIntakeForm` when it opens; until that loads, or if it fails, the banner says so and no decision control shows. The blocked line names the form's reviewers for the simulated lane. Second-review actions follow one rule in the modal and the list (`simulatedCanSecondReview`): a second review is waiting and the role is a senior reviewer or an Admin. In the modal, Approve, Reject, Retry, Send to senior review, second-review actions and suggested-risk edits are turned off or hidden. Local edits (override, entity fields) still work and are never sent.

The client copies of `laneFor`, `canDecideLane`, `laneReviewerIdsFor`, `laneAtDecision`, `laneOnRecord` and `entityLevel` are kept identical to the server's by a shared fixture, `Servers/services/intakeRouting/__fixtures__/routingRulesCases.json`. `Clients/src/application/utils/intakeRouting/__tests__/routingRules.test.ts` runs every case; on the server, `routingRules.mirror.test.ts` runs the lane cases and `controllers/__tests__/intakeForm.entityLevel.mirror.test.ts` runs the `entityLevel` cases through `getSubmissionPreview` (the function is private to the controller). Change a rule on the server and add a case there, and the client suite fails until the copy matches.

### Decision record

Approve and reject both write `intake_submissions.decision_record` through `buildDecisionRecord`: `{ level, computedBand, bandInForce, bandChanged, overriddenBy, lane }`. `bandChanged` is true when the band in force at the decision differs from the computed one. Oversight reads it.

## Second review

When a non-senior reviewer approves a standard-lane submission, `pickSecondReview` selects it with probability `secondReviewRate` percent (`crypto.randomInt`). A selected submission gets `routing.secondReview = { status: "open", selectedAt }` inside the approval transaction, and the form's senior reviewers get an email. Approvals by senior reviewers, and approvals in the senior lane, are never sampled.

- `POST /intake/submissions/:id/second-review` closes an open review as `agreed` or `missed`. A `missed` outcome needs a note.
- `POST /intake/submissions/:id/second-review/resolve` closes a missed review with a resolution note, once the follow-up is done.

Neither endpoint changes the approval or the entity it created. Writes are guarded on the current review state (`updateSecondReviewQuery`), so when two reviewers act at once the second gets a 409.

## Oversight

`GET /intake/oversight` returns figures for the last 4, 8 or 12 weeks, optionally for one form. `aggregateOversight` in `oversight.ts` is a pure function over the rows `ROWS_SQL` returns, so it is tested without a database. The query filters by `organization_id`. Weeks start on Monday, UTC (`date_trunc('week', created_at AT TIME ZONE 'UTC')`), and `byWeek` has one entry for every week in the period, including empty ones.

| Figure | What it counts |
|---|---|
| `totals` | Submissions created in the period. Each lands in exactly one of `routingOff` (form has routing off), `notRouted` (routing on, no lane yet), `senior` or `standard`. `closeCalls` is the part of `senior` with reason `close_call` |
| `byWeek` | The same split per week. Close calls are counted in `closeCall` and not again in `senior` |
| `medianDecisionHours` | Median hours from `created_at` to `reviewed_at` for decided submissions, overall and by lane. A rejected submission that was resubmitted counts as decided. Null when there are none |
| `redlines` | Decided and pending submissions whose EU AI Act level is Prohibited or High risk. The level is the one at decision for decided rows |
| `secondReviews` | `completed` (agreed or missed), `missed`, `open` |
| `reviewers` | Per decision maker: decisions, decisions that changed the band, median hours. `check` is true at 10 or more decisions with a known band outcome and none changed |
| `bandKept` | Decisions where the band in force equalled the computed band, out of decisions with a known outcome, and the same for the senior lane. Legacy assessments with no computed band compare the override with the stored tier, and are skipped when there is no tier |
| `suggestions` | Accepted suggested risks over suggested ones, for decided submissions whose suggestion stage completed |
| `needsAttention` | At most 20 rows. Forms with no eligible reviewer in a lane come first so they are never pushed out by the cap; the rest are newest first: an open second review older than 3 days, a missed review not yet resolved, a pending Prohibited submission, a pending submission older than 7 days, and routed forms whose senior or standard list has no eligible reviewer left |

An empty period returns zero counts and null medians, and the client shows a rate only when its denominator is above zero. `weeks` outside 4, 8 and 12 is a 400, and a `formId` from another organization is a 404.

## Approval

Approve also checks the lane (see Routing) and may select a second review.

Inside the existing approval transaction:

1. A v2 assessment is re-floored under the level being approved (the reviewer may have changed it) with `recomputeAssessmentForLevel`. A stage still running is closed: scoring keeps the rule minimum (`ai_failed`, "Approved before AI scoring finished") and pending suggestions are marked `ai_failed`.
2. A band override below that level's minimum is refused with 400, whether it comes with the request or was saved earlier through `PATCH /risk-override`. The stored override is built from whitelisted fields.
3. Each accepted suggestion becomes a risk on the new entity. Use cases go through `createRiskService` (owner = approver, deadline = suggestion deadline or approval + 90 days, "Not Started", default category "Strategic risk"). Models go through `createNewModelRiskQuery` (owner = approver id as a string, status "Open"). Any failure rolls the whole approval back. Rejecting creates nothing, but closes running stages the same way as step 1 (`settleAssessmentOnDecision`), so a rejected submission never shows "Scoring…".

## Release

The migration adds `suggested_risks` and `notification_sent_at` and sets the default of `intake_forms.eu_ai_act_risk_step_enabled` to `true`. Existing forms keep their setting. A second migration, `20261022001648-intake-ai-assessment-data`, marks existing submissions as notified (`notification_sent_at = created_at`), because the old code emailed at submit. It also moves a pending submission's override saved under the pre-v2 tiers to the band covering the same scores (Minimal → Low, Limited → Medium, Unacceptable → Critical), in `risk_override.tier` and `risk_tier`. Decided submissions keep their history. Pending submissions are then scored by the worker-start backfill, with no email.

## Tests

Server: `Servers/services/intakeScoring/__tests__/`, `Servers/utils/__tests__/intakeForm.assessment.utils.test.ts`, `Servers/controllers/__tests__/intakeForm.{assessmentEnqueue,review,approveRisks}.test.ts`. Client: `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/{ScoreSection,SuggestedRisksSection,OverrideBandFloor,RiskTierChip}.test.tsx`.

Routing and oversight: `Servers/services/intakeRouting/__tests__/` (`routingRules`, `routingService`, `decisionGate`, `oversight`). Client, in the same `__tests__` folder: `{RoutingSettingsSection,LaneSection,SecondReviewPanel,OversightTab,SubmissionPreviewModal.lane,laneFilter,IntakeFormsListPage.oversight}`.

Preview as a role: `Servers/services/intakeRouting/__tests__/routingRules.mirror.test.ts`, `Servers/controllers/__tests__/intakeForm.entityLevel.mirror.test.ts`, `Clients/src/application/utils/intakeRouting/__tests__/`, `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/{SubmissionPreviewModal.simulation,IntakeFormsListPage.simulation,PreviewMenu}.test.tsx`, `Clients/src/presentation/pages/PublicIntakeForm/__tests__/PublicIntakeForm.preview.test.tsx`.
