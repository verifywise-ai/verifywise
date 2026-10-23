# Intake routing and oversight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route each intake submission to a senior or standard review lane from its score, gate decisions by lane, spot-check standard-lane approvals, and show an Oversight tab.

**Architecture:** Pure routing rules in a new `Servers/services/intakeRouting/` module; storage in three new JSONB columns; hooks in the existing scoring job, risk-override, approve and reject paths; one aggregate SQL endpoint for the dashboard. Client adds a settings section to the form builder, lane UI in `SubmissionPreviewModal`, and an Oversight tab on `IntakeFormsListPage`.

**Tech Stack:** Express 4 + Sequelize raw queries (Postgres JSONB), BullMQ job already in place, Jest; React 19 + MUI 7 + house components, recharts, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-intake-routing-oversight-design.md`

## Global Constraints

- Every query filters by `organization_id`.
- Jest only via `cd Servers && npm run test` or `npx jest <path> --testPathIgnorePatterns=/tests/integration/`. Never a bare `npx jest <pattern>` (it can TRUNCATE the dev DB).
- Migration timestamp from `date +%Y%m%d%H%M%S`; file in `Servers/database/migrations/`.
- House UI: `CustomizableButton` (`text=` prop), `StandardModal`, sentence case, 30px controls, `#d0d5dd` borders, 4px radius, pixel spacing strings (`gap: "8px"`), theme colours, no `console.log`.
- Every new user-facing client string gets de, fr and es in `Clients/src/i18n/translations.ts` (`npm run i18n:audit:strict` must pass). Server strings through `req.t!(...)`.
- Copy never calls the score a probability, confidence or certainty.
- Defaults: threshold 50 (1–99), close-call margin 10 (0–25), second review rate 10 (0–100, percent). "Check" chip at ≥ 10 decisions with 0 band changes. Needs-attention ages: open second review > 3 days, pending > 7 days. Max 20 needs-attention rows.
- Lane rule order (first match): Prohibited → senior `prohibited`; finalScore null or scoring `ai_failed` → senior `no_score`; |score − threshold| < margin → senior `close_call`; score ≥ threshold → senior `at_or_above_threshold`; else standard `below_threshold`. Override raise uses reason `override_raised`, escalation `escalated`.
- Band lower bounds for override re-routing: Low 0, Medium 26, High 51, Critical 76.

## Review Focus

1. A lane reviewer is deleted or loses `intakeForm.edit` after being saved: Admins can still decide; the form appears in "needs attention"; saving the form again with the stale id is refused with 400.
2. A rejected, routed submission is resubmitted: the new row starts with `routing = NULL` and is routed fresh when its scoring settles; nothing is copied from the original.
3. A form with routing on and no LLM key at minimal level (finalScore null) goes to senior with `no_score`, and the modal says "No score yet" rather than a number.
4. `GET /intake/oversight` with no submissions, `weeks` not in {4, 8, 12}, or a `formId` from another organisation: empty figures, 400, and 404 respectively. No division by zero in rates.
5. Weekly buckets use `date_trunc('week', created_at AT TIME ZONE 'UTC')`, so a submission on Sunday 23:30 UTC lands in its own week; the chart shows every week in the period, including empty ones.

---

### Task 1: Storage, types and pure routing rules

**Files:**
- Create: `Servers/database/migrations/<date>-intake-routing.js`
- Create: `Servers/services/intakeRouting/routingRules.ts`
- Modify: `Servers/domain.layer/interfaces/i.intakeForm.ts` (form + create/update inputs), `Servers/domain.layer/interfaces/i.intakeSubmission.ts`, `Servers/utils/intakeForm.utils.ts` (select columns for forms and `SUBMISSION_SELECT_COLUMNS`, create/update form queries persist `routing`)
- Test: `Servers/services/intakeRouting/__tests__/routingRules.test.ts`

**Interfaces:**
- Produces (types, in `i.intakeSubmission.ts` / `i.intakeForm.ts`):
  - `type ReviewLane = "senior" | "standard"`
  - `type RoutingReason = "prohibited" | "no_score" | "close_call" | "at_or_above_threshold" | "below_threshold" | "override_raised" | "escalated"`
  - `interface IFormRouting { enabled: boolean; seniorReviewerIds: number[]; standardReviewerIds: number[]; threshold: number; closeCallMargin: number; secondReviewRate: number }` → `IIntakeForm.routing: IFormRouting | null`
  - `interface ISecondReview { status: "open" | "agreed" | "missed"; selectedAt: string; reviewedBy?: number; reviewedAt?: string; note?: string; resolvedBy?: number; resolvedAt?: string; resolutionNote?: string }`
  - `interface ISubmissionRouting { lane: ReviewLane; reason: RoutingReason; score: number | null; threshold: number; closeCallMargin: number; routedAt: string; escalation?: { by: number; at: string; reason: string }; secondReview?: ISecondReview }` → `IIntakeSubmission.routing: ISubmissionRouting | null`
  - `interface IDecisionRecord { level: string | null; computedBand: string | null; bandInForce: string | null; bandChanged: boolean; overriddenBy: number | null; lane: ReviewLane | null }` → `IIntakeSubmission.decisionRecord: IDecisionRecord | null`
- Produces (functions, `routingRules.ts`):
  - `DEFAULT_ROUTING: Omit<IFormRouting, "enabled" | "seniorReviewerIds" | "standardReviewerIds">` = `{ threshold: 50, closeCallMargin: 10, secondReviewRate: 10 }`
  - `laneFor(input: { level: string | null; finalScore: number | null; scoringStatus: string | null }, cfg: Pick<IFormRouting, "threshold" | "closeCallMargin">): { lane: ReviewLane; reason: RoutingReason }`
  - `BAND_LOWER_BOUND: Record<ScoreBand, number>` = `{ Low: 0, Medium: 26, High: 51, Critical: 76 }`
  - `validateRoutingSettings(raw: unknown): { ok: true; value: IFormRouting } | { ok: false; error: string }` — ranges from Global Constraints, integers only, both lists non-empty when `enabled`, ids de-duplicated; missing numeric fields take `DEFAULT_ROUTING`.
  - `canDecideLane(lane: ReviewLane | null, userId: number, isAdmin: boolean, cfg: IFormRouting | null): boolean` — true when `!cfg?.enabled`, `lane === null`, Admin, senior reviewer, or (`lane === "standard"` and standard reviewer).

- [ ] **Step 1: Write the failing tests** in `routingRules.test.ts`:
  - `laneFor` with cfg `{threshold: 50, closeCallMargin: 10}`: `{level:"Prohibited", finalScore: 12, scoringStatus:"complete"}` → `{lane:"senior", reason:"prohibited"}`; `{finalScore:null}` → `no_score`; `{finalScore:30, scoringStatus:"ai_failed"}` → `no_score`; 40 → `below_threshold`/standard (|40−50| = 10 is not < 10); 41 → `close_call`; 59 → `close_call`; 60 → `at_or_above_threshold`; 50 with margin 0 → `at_or_above_threshold`; 49 with margin 0 → standard.
  - `validateRoutingSettings`: `{enabled:true, seniorReviewerIds:[1], standardReviewerIds:[]}` → error; threshold 0 / 100 / 50.5 → error; closeCallMargin 26 → error; secondReviewRate 101 → error; `{enabled:false}` → ok with defaults and empty lists; `[1,1,2]` → `[1,2]`.
  - `canDecideLane`: senior lane × {senior reviewer true, standard reviewer false, Admin true, neither false}; standard lane × {standard true, senior true}; `lane: null` true; `cfg.enabled === false` true.
- [ ] **Step 2: Run** `cd Servers && npx jest services/intakeRouting --testPathIgnorePatterns=/tests/integration/` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `routingRules.ts` as specified; write the migration adding `intake_forms.routing JSONB NULL`, `intake_submissions.routing JSONB NULL`, `intake_submissions.decision_record JSONB NULL`, and `CREATE INDEX IF NOT EXISTS idx_intake_submissions_org_created ON verifywise.intake_submissions (organization_id, created_at)`; down drops them. Add the types, select the columns (`routing`, `decision_record AS "decisionRecord"`), and persist `routing` in `createIntakeFormQuery` / `updateIntakeFormQuery` (JSON-stringified, `NULL` allowed).
- [ ] **Step 4: Run** the same jest command and `npx tsc --noEmit -p .` — Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `feat(intake): add routing storage and lane rules`.

### Task 2: Routing settings on forms, eligible reviewers, re-route on save

**Files:**
- Create: `Servers/services/intakeRouting/routingService.ts`
- Modify: `Servers/controllers/intakeForm.ctrl.ts` (`createIntakeForm`, `updateIntakeForm`), `Servers/routes/intakeForm.route.ts`, `Servers/utils/intakeForm.utils.ts`
- Test: `Servers/services/intakeRouting/__tests__/routingService.test.ts`, `Servers/controllers/__tests__/intakeForm.routingSettings.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `laneFor`, `validateRoutingSettings`.
- Produces:
  - `getEligibleReviewerIdsQuery(organizationId: number, ids?: number[]): Promise<number[]>` (utils) — org users whose role holds `intakeForm.edit`, resolved with `roleInfoHasPermission` per distinct role.
  - `GET /intake/routing/eligible-reviewers` → `200 [{id, name, surname, email}]`, `authorize("intakeForm.edit")`.
  - `updateSubmissionRoutingQuery(id: number, routing: ISubmissionRouting | null, organizationId: number, transaction?: Transaction): Promise<void>` — only `status = 'pending'`.
  - `routingService.routeSubmission(submission: IIntakeSubmission, form: IIntakeForm, organizationId: number, opts?: { now?: Date; transaction?: Transaction }): Promise<ISubmissionRouting | null>` — returns null and writes nothing when routing is off, the submission isn't pending, scoring isn't settled (`risk_assessment.status` pending or not v2), or `routing.escalation` exists. Otherwise computes `laneFor`, keeps an existing `secondReview`, writes and logs via `logSuccess` ("routed submission N to senior: close_call"). A stored `override_raised` lane is kept if the new result is standard.
  - `routingService.rerouteFormPending(form: IIntakeForm, organizationId: number): Promise<number>` — routes every pending submission of the form; returns how many changed.

- [ ] **Step 1: Write failing tests**:
  - service: routing off → null, no write; scoring pending → null; escalated → null; settled score 72 → senior `at_or_above_threshold` written with `threshold: 50, closeCallMargin: 10` copied; existing `override_raised` senior + new standard result → stays senior; existing `secondReview` preserved.
  - controller: PATCH form with `routing.enabled` and a reviewer id not in `getEligibleReviewerIdsQuery` → 400 "Reviewers must be users who can review intake submissions"; invalid threshold → 400 with the validator message; valid save calls `rerouteFormPending` once; `routing` omitted from the body leaves it unchanged.
  - eligible-reviewers returns only users of the caller's organisation with the permission.
- [ ] **Step 2: Run** `npx jest services/intakeRouting controllers/__tests__/intakeForm.routingSettings --testPathIgnorePatterns=/tests/integration/` — Expected: FAIL.
- [ ] **Step 3: Implement** the query, service and controller changes; validate in the controller, reject stale ids with 400, call `rerouteFormPending` after a successful update when `routing` was in the body.
- [ ] **Step 4: Run** the tests and `npx tsc --noEmit -p .` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(intake): routing settings per form and re-route on save`.

### Task 3: Route when scoring settles and when a band override raises it

**Files:**
- Modify: `Servers/services/intakeScoring/assessmentJob.ts` (deps gain `routeSubmission`; call after the scoring stage's final write, both success and `failScoring`), `Servers/controllers/intakeForm.ctrl.ts` (`overrideSubmissionRisk`)
- Test: `Servers/services/intakeScoring/__tests__/assessmentJob.test.ts`, `Servers/controllers/__tests__/intakeForm.review.test.ts`

**Interfaces:**
- Consumes: `routingService.routeSubmission`, `BAND_LOWER_BOUND`, `updateSubmissionRoutingQuery`.
- Produces: `routingService.raiseForOverride(submission: IIntakeSubmission, form: IIntakeForm, band: ScoreBand, organizationId: number): Promise<ISubmissionRouting | null>` — runs `laneFor` with `finalScore = BAND_LOWER_BOUND[band]` and the stored level; if senior and the current lane is standard (or unset), writes lane senior, reason `override_raised`; never lowers.

- [ ] **Step 1: Write failing tests**: job — scoring success re-reads the submission and calls `routeSubmission` once; scoring failure calls it too; a suggestions-only job doesn't; a `routeSubmission` throw is logged and doesn't fail the job. Override — standard-lane submission, threshold 50, band High → lane senior `override_raised`; band Low on a senior submission → unchanged; routing off → unchanged.
- [ ] **Step 2: Run** `npx jest services/intakeScoring/__tests__/assessmentJob controllers/__tests__/intakeForm.review --testPathIgnorePatterns=/tests/integration/` — Expected: FAIL.
- [ ] **Step 3: Implement.** Retry needs no change: it re-runs the scoring stage, which routes.
- [ ] **Step 4: Run** the tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(intake): route on scoring and raise the lane on a band override`.

### Task 4: Lane gate, decision-time re-check, decision record, second-review pick, escalation

**Files:**
- Create: `Servers/services/intakeRouting/decisionGate.ts`
- Modify: `Servers/controllers/intakeForm.ctrl.ts` (`approveSubmission`, `rejectSubmission`, `getSubmissionPreview`, new `escalateSubmission`), `Servers/utils/intakeForm.utils.ts`, `Servers/routes/intakeForm.route.ts`
- Test: `Servers/services/intakeRouting/__tests__/decisionGate.test.ts`, `Servers/controllers/__tests__/intakeForm.routingDecisions.test.ts`

**Interfaces:**
- Consumes: `canDecideLane`, `laneFor`, `BAND_LOWER_BOUND`, `bandFor` (scoreMath).
- Produces:
  - `decisionGate.laneAtDecision(stored: ISubmissionRouting | null, cfg: IFormRouting | null, effective: { level: string | null; finalScore: number | null; scoringStatus: string | null; bandInForce: ScoreBand | null }): { lane: ReviewLane | null; reason: RoutingReason | null }` — null lane when routing is off or `stored` is null; else senior if the stored lane is senior or `laneFor` on the effective values (finalScore raised to the band's lower bound when the band in force is higher) gives senior.
  - `decisionGate.buildDecisionRecord(args: { level: string | null; assessment: IRiskAssessmentV2 | null; override: { tier: string; overriddenBy: number } | null; lane: ReviewLane | null }): IDecisionRecord`
  - `decisionGate.pickSecondReview(rate: number, randomInt?: (max: number) => number): boolean` — `randomInt(100) < rate`, default `crypto.randomInt`.
  - `setDecisionRecordQuery(id, record, organizationId, transaction)`; approve/reject queries unchanged.
  - Preview response adds `routing`, `canDecide: boolean`, `decideBlockedReason: string | null`, `laneReviewers: {id, name}[]`, `isSeniorReviewer: boolean`.
  - `POST /intake/submissions/:id/escalate` body `{ reason: string }` (1–1000 chars) → 200 routing; 409 unless pending and standard lane; 403 unless standard/senior reviewer of the form or Admin.
- Approve order inside the transaction (after the existing level override and re-floor): compute `laneAtDecision`; if `!canDecideLane(...)` → rollback, 403 `req.t!("A senior reviewer has to decide this: {reason}")` with the translated reason; write the decision record; if lane is standard, decider is not a senior reviewer and `pickSecondReview(cfg.secondReviewRate)` → set `routing.secondReview = {status:"open", selectedAt}`; after commit send the second-review email (Task 5). Reject: check the stored lane only, write the decision record. Out-of-lane Admin decisions log "decided outside their lane".

- [ ] **Step 1: Write failing tests**:
  - gate: stored standard + effective level Prohibited → senior; stored standard + band in force High (threshold 50) → senior; stored senior + effective Low → senior; routing off → null.
  - record: no override → `bandChanged: false, bandInForce === computedBand`; override High on computed Medium by user 3 → `bandChanged: true, overriddenBy: 3`.
  - `pickSecondReview(0)` never, `(100)` always, `(10, () => 9)` true, `(10, () => 10)` false.
  - controller: standard reviewer approving with `euAiActOverride` Prohibited → 403; senior reviewer same → 200; standard reviewer approving a standard submission with rate 100 → `secondReview.status === "open"`; senior reviewer approving a standard submission with rate 100 → no second review; standard reviewer rejecting a senior submission → 403; Admin not in either list → 200; routing off → 200 for any `intakeForm.edit` user; decision record written on approve and reject with routing off; preview returns `canDecide: false` and the senior reviewers for a standard-only user on a senior submission; escalate happy path and its 409/403.
- [ ] **Step 2: Run** `npx jest services/intakeRouting controllers/__tests__/intakeForm.routingDecisions controllers/__tests__/intakeForm.approveRisks --testPathIgnorePatterns=/tests/integration/` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests plus the existing intake controller tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(intake): gate decisions by lane and pick second reviews`.

### Task 5: Second-review endpoints and emails, lane-aware new-submission email

**Files:**
- Modify: `Servers/controllers/intakeForm.ctrl.ts` (new `recordSecondReview`, `resolveSecondReviewMiss`), `Servers/routes/intakeForm.route.ts`, `Servers/services/intakeScoring/assessmentJob.ts` (`sendIntakeNotificationOnce`), `Servers/services/intakeFormEmail.service.ts`
- Create: `Servers/templates/intake-second-review.mjml`
- Test: `Servers/controllers/__tests__/intakeForm.secondReview.test.ts`, `Servers/services/intakeScoring/__tests__/assessmentJob.test.ts`

**Interfaces:**
- Consumes: Task 4 routing on approved rows, `getUsersByIds`.
- Produces:
  - `POST /intake/submissions/:id/second-review` body `{ outcome: "agreed" | "missed", note?: string }` (note required for `missed`, ≤ 2000 chars) → 200 routing. 403 unless senior reviewer of the form or Admin; 403 "You can't second-review your own approval" when `reviewed_by === req.userId`; 409 unless `secondReview.status === "open"`.
  - `POST /intake/submissions/:id/second-review/resolve` body `{ note: string }` (1–2000) → 200. Same auth; 409 unless status `missed` and not yet resolved.
  - Both write with a JSONB update guarded on the current status (atomic, no lost update) and log via `logSuccess`. Neither changes `status`, `entity_id` or the entity.
  - `sendSecondReviewRequestEmail(organizationId: number, submissionId: number, seniorReviewerIds: number[], lang?: string): Promise<void>`.
  - New-submission email: with routing on, recipients = form recipients ∪ assigned lane's reviewers (de-duplicated); no lane yet → recipients ∪ both lanes, with "Not routed yet: scoring is still running". The template gets `laneText` ("Senior review: close call" / "Standard review").

- [ ] **Step 1: Write failing tests**: agree by senior → status agreed with reviewer and time; miss without note → 400; self-review → 403; standard reviewer → 403; second call → 409; resolve after miss → resolved fields set, approval and `entity_id` unchanged; resolve on `agreed` → 409. Email: lane senior → recipients `[1, 9]` from recipients `[1]` and senior `[1, 9]`; no lane → both lanes plus recipients; routing off → recipients only.
- [ ] **Step 2: Run** `npx jest controllers/__tests__/intakeForm.secondReview services/intakeScoring/__tests__/assessmentJob --testPathIgnorePatterns=/tests/integration/` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(intake): second reviews and lane-aware emails`.

### Task 6: Oversight endpoint

**Files:**
- Create: `Servers/services/intakeRouting/oversight.ts`
- Modify: `Servers/controllers/intakeForm.ctrl.ts` (`getIntakeOversight`), `Servers/routes/intakeForm.route.ts`
- Test: `Servers/services/intakeRouting/__tests__/oversight.test.ts`, `Servers/controllers/__tests__/intakeForm.oversight.test.ts`

**Interfaces:**
- Produces: `GET /intake/oversight?weeks=4|8|12&formId=` (`authorize("intakeForm.edit")`; 400 on other weeks; 404 when `formId` isn't in the org) → `IIntakeOversight`:
  ```ts
  interface IIntakeOversight {
    weeks: number;
    totals: { submissions: number; senior: number; standard: number; closeCalls: number; notRouted: number; routingOff: number };
    medianDecisionHours: { all: number | null; senior: number | null; standard: number | null };
    redlines: { prohibited: number; highRisk: number };
    secondReviews: { completed: number; missed: number; open: number };
    byWeek: Array<{ weekStart: string; senior: number; closeCall: number; standard: number; notRouted: number; routingOff: number }>;
    reviewers: Array<{ userId: number; name: string; decisions: number; bandChanged: number; medianDecisionHours: number | null; check: boolean }>;
    bandKept: { kept: number; decided: number; seniorKept: number; seniorDecided: number };
    suggestions: { accepted: number; suggested: number };
    needsAttention: Array<{ kind: "second_review_open" | "second_review_missed" | "prohibited_pending" | "pending_old" | "lane_empty"; submissionId: number | null; formId: number; title: string; at: string }>;
  }
  ```
- Rules from the spec: superseded rows with `reviewed_at` count as decided rejections; "decided" rows read `decision_record`, falling back to `risk_assessment.tier` vs `risk_override.tier` and `classificationLevel` when it's null; `closeCalls` ⊂ `senior`; `notRouted` = routing-on form, `routing IS NULL`; `routingOff` = form routing off or null; `check` = decisions ≥ 10 and bandChanged = 0; `byWeek` has one row per week in the period, zero-filled, UTC weeks.
- `lane_empty` rows: forms with routing on where a lane list has no id in `getEligibleReviewerIdsQuery`.

- [ ] **Step 1: Write failing tests** (service, against a small fixture set through mocked `sequelize.query` results where the SQL is split, or a pure aggregator over rows if the builder keeps SQL to row fetches): counts per lane; median of [2, 4, 10] hours = 4; superseded-with-review counted as a decision; a reviewer with 10 decisions and none changed → `check: true`, 9 → false; zero rows → all zeros, medians null, `byWeek.length === weeks`; open second review 4 days old listed, 2 days old not; controller 400 for `weeks=5`, 404 for a foreign `formId`, and the query is called with the caller's organisation id.
- [ ] **Step 2: Run** `npx jest services/intakeRouting controllers/__tests__/intakeForm.oversight --testPathIgnorePatterns=/tests/integration/` — Expected: FAIL.
- [ ] **Step 3: Implement.** Builder's choice of one query or a few; every one carries `organization_id = :organizationId`.
- [ ] **Step 4: Run** — Expected: PASS. Also run the SQL once against a temp-table copy in a rolled-back transaction from a scratchpad script (never inside `Servers/`) to prove it parses on Postgres.
- [ ] **Step 5: Commit** `feat(intake): oversight figures endpoint`.

### Task 7: Client — repository, routing settings section

**Files:**
- Modify: `Clients/src/application/repository/intakeForm.repository.ts`, `Clients/src/presentation/pages/IntakeFormBuilder/types.ts`, `Clients/src/presentation/pages/IntakeFormBuilder/index.tsx` (below Recipients, ~1143)
- Create: `Clients/src/presentation/pages/IntakeFormBuilder/routing/RoutingSettingsSection.tsx`
- Test: `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/RoutingSettingsSection.test.tsx`

**Interfaces:**
- Produces (repository): `getEligibleReviewers()`, `escalateSubmission(id, reason)`, `recordSecondReview(id, outcome, note?)`, `resolveSecondReviewMiss(id, note)`, `getIntakeOversight(weeks, formId?)`, with the server types mirrored in `types.ts` (`FormRouting`, `SubmissionRouting`, `IntakeOversight`).
- `RoutingSettingsSection({ value: FormRouting | null, onChange: (next: FormRouting) => void, reviewers: Array<{ _id: number; name: string; email: string }> })` — a toggle "Route by risk score", two `CustomizableMultiSelect`s (Senior reviewers, Standard reviewers), three number fields (Threshold, Close-call margin, Second review share %), and the live helper line "Scores of {threshold} or more, prohibited practices and scores within {margin} points of {threshold} go to senior reviewers." Inline errors mirror the server validator.

- [ ] **Step 1: Write failing tests**: off by default hides the fields; turning on shows them with 50/10/10; threshold 0 shows "Use a number from 1 to 99"; empty senior list when on shows "Pick at least one senior reviewer"; the helper line updates when the threshold changes to 60.
- [ ] **Step 2: Run** `cd Clients && npx vitest run src/presentation/pages/IntakeFormBuilder/__tests__/RoutingSettingsSection.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement**; load reviewers from `getEligibleReviewers()` in `index.tsx`; send `routing` on save; add translations.
- [ ] **Step 4: Run** the test, `npm run typecheck`, `npm run i18n:audit:strict` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(intake): routing settings in the form builder`.

### Task 8: Client — lane in the review modal and the submissions list

**Files:**
- Create: `Clients/src/presentation/pages/IntakeFormBuilder/routing/LaneSection.tsx`, `Clients/src/presentation/pages/IntakeFormBuilder/routing/SecondReviewPanel.tsx`
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/SubmissionPreviewModal.tsx`, `Clients/src/presentation/pages/IntakeFormBuilder/IntakeFormsListPage.tsx`
- Test: `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/LaneSection.test.tsx`, `__tests__/SecondReviewPanel.test.tsx`

**Interfaces:**
- Consumes: preview fields from Task 4, repository from Task 7.
- `LaneSection({ routing, canDecide, decideBlockedReason, laneReviewers, canEscalate, onEscalated })` — chip "Senior review" / "Standard review" / "Not routed yet", reason line (`close_call` → "Within {margin} points of the threshold", `prohibited` → "Prohibited practice", `no_score` → "No usable score", `at_or_above_threshold` → "Score {score}, threshold {threshold}", `below_threshold` → "Score {score}, below {threshold}", `override_raised` → "Band raised by a reviewer", `escalated` → "Sent to senior review: {reason}"); an "Send to senior review" button opening a `StandardModal` with a required reason.
- When `canDecide` is false the modal hides approve/reject and shows "Only {names} can decide this submission."
- `SecondReviewPanel({ submissionId, secondReview, canReview, onChange })` — for an open review: "Agree" / "Missed something" with a note (required for miss); for a miss: "Mark resolved" with a required note; read-only summary otherwise.
- List page: a "Lane" column (chip) and a lane filter: All, Senior, Standard, Not routed, Assigned to me (client-side over the loaded rows; "assigned to me" = the user is in the assigned lane's list, which the list endpoint returns as `laneReviewerIds`).

- [ ] **Step 1: Write failing tests**: chip and reason copy per reason code; blocked state hides the decide buttons and names reviewers; escalate requires a reason and calls `escalateSubmission(11, "…")`; second-review miss without note keeps the button disabled; resolve calls `resolveSecondReviewMiss`.
- [ ] **Step 2: Run** the two vitest files — Expected: FAIL.
- [ ] **Step 3: Implement**; have `getPendingSubmissionsQuery` return `routing` and `laneReviewerIds` (server, add a test in `intakeForm.routingDecisions.test.ts`); add translations.
- [ ] **Step 4: Run** tests, `npm run typecheck`, i18n audit — Expected: PASS.
- [ ] **Step 5: Commit** `feat(intake): lane and second review in the review modal`.

### Task 9: Client — Oversight tab

**Files:**
- Create: `Clients/src/presentation/pages/IntakeFormBuilder/oversight/OversightTab.tsx` (and small child components as the builder sees fit)
- Modify: `Clients/src/presentation/pages/IntakeFormBuilder/IntakeFormsListPage.tsx` (third tab "Oversight", shown only when `useHasPermission("intakeForm.edit")`), `Clients/src/application/config/routes.tsx` and `presentation/components/breadcrumbs/routeMapping.ts` for `/intake-forms/oversight`
- Test: `Clients/src/presentation/pages/IntakeFormBuilder/__tests__/OversightTab.test.tsx`

**Interfaces:**
- Consumes: `getIntakeOversight(weeks, formId?)`.
- Layout (SpendDashboard pattern): period select (Last 4 / 8 / 12 weeks, default 8) and form select; four `StatCard`s (Submissions, Median time to decision as "0.9 days", Redlines caught, Second reviews "missed of completed"); stacked weekly bar chart (recharts) with legend Senior, Close call, Standard, Not routed, Routing off; Reviewers table with columns Reviewer, Decisions, Band changed ("4 (17%)"), Median time, and a "Check" chip with tooltip "Never changed a band in {n} decisions"; the note "Counts the band in force at decision"; Band kept and Suggested risks accepted as "N of M (x%)"; Needs attention list linking to the submission (opens the modal) or the form.
- Empty period: "No submissions in this period."

- [ ] **Step 1: Write failing tests**: renders KPI values from a fixture; "Check" chip only on the flagged reviewer; empty fixture shows the empty copy and no NaN; changing the period calls `getIntakeOversight(12, undefined)`; tab hidden without the permission.
- [ ] **Step 2: Run** `npx vitest run src/presentation/pages/IntakeFormBuilder/__tests__/OversightTab.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement**; add translations.
- [ ] **Step 4: Run** tests, `npm run typecheck`, i18n audit, `npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(intake): oversight tab`.

### Task 10: Docs, API docs, full gates

**Files:**
- Modify: `docs/technical/domains/intake-forms.md` (new "Routing", "Second review", "Oversight" sections and endpoint rows), `shared/user-guide-content/content/ai-governance/intake-forms.ts` (user-facing routing and oversight section), `Servers/swagger.yaml` + regenerated `docs/api-docs/src/config/endpoints.ts`

- [ ] **Step 1:** Write the docs; document every new endpoint in `swagger.yaml`.
- [ ] **Step 1b:** Copy the changed user-guide file to `~/website/verifywise/content/user-guide/` at the same relative path (do not commit in the website repo).
- [ ] **Step 2: Run** `cd Servers && npm run generate:swagger && npm run generate:endpoints` and commit the diff.
- [ ] **Step 3: Run** all gates: Servers `npm run build`, `npx tsc --noEmit -p .`, `npm run format-check`, `npm run test`; Clients `npm run typecheck`, `npm run i18n:audit:strict`, `npm run format-check`, `npm run build`, `npx vitest run`; Semgrep with `--baseline-commit origin/develop`. Expected: all pass.
- [ ] **Step 4: Commit** `docs(intake): routing, second review and oversight`.
