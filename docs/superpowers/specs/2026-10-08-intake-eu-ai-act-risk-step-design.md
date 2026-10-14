# Intake forms: EU AI Act risk classification step

**Date:** 2026-10-08
**Status:** Design approved section by section; written spec awaiting review

## Goal

A use case intake form can require the submitter to answer an EU AI Act risk
classification questionnaire before the form's own questions. The server
scores the answers. Reviewers see the result with its reasons, and on approval
it becomes the new use case's AI risk classification, which the reviewer can
change with a justification.

The same questionnaire, rewritten to fix the current scoring errors, replaces
the one in the use case's risk wizard. There is one copy of the questions and
one copy of the scoring, both on the server.

## How it works today

- **In-app wizard** (`Clients/src/presentation/pages/ProjectView/RiskAnalysisModal/`):
  questions in `questions.config.ts` (branching via `showCondition`), scoring in
  `Clients/src/presentation/utils/riskClassification.ts`. Answers live only in
  `localStorage`; the result is saved as `projects.ai_risk_classification` through
  the generic `PATCH /api/projects/:id`.
- **The scoring is wrong in several places** (`riskClassification.ts`):
  real-time remote biometric identification is backwards (prohibited outside law
  enforcement, high inside it, :71-84); any Q1a answer, including "other
  decisions", gives High (:109); a critical-infrastructure *deployer* gives High
  (:136); `Q4 === "yes"` can never match (:150); Q5 "affects rights" gives
  Prohibited (:157). Only biometric Article 5 practices are asked, and there is
  no Article 6(3) question.
- **Intake forms** (`IntakeFormBuilder/`, `PublicIntakeForm/`,
  `Servers/controllers/intakeForm.ctrl.ts`): one page of fields, no steps. A form
  creates a use case or a model. A question can map to the use case's
  `ai_risk_classification`. Each submission gets a separate six-dimension intake
  risk score (`risk_assessment`, `risk_tier`) with a justified reviewer override.
  Approval (`approveSubmission`) takes `confirmedEntityData` and creates the use
  case with status Under review. Rejection issues a signed resubmission token
  that pre-fills the form.
- `projects.ai_risk_classification` is `verifywise.enum_projects_ai_risk_classification`:
  Prohibited, High risk, Limited risk, Minimal risk, GPAI, General Risk.

## Decisions (settled)

- The step runs **once, as a required first step**, before the form's questions.
  The server rejects a submission without it.
- **Per-form toggle** in the builder settings, next to "suggested questions".
- **Use case forms only.** Hidden on model forms; the server forces it off.
- **Scoring is server-only.** `Servers` cannot import `shared/` (rootDir and the
  Dockerfile copy only `Servers`), and a public submitter must never be able to
  send a level. The server scores again from stored answers on submit, on read
  and on approval.
- The **submitter does not see the result.** Reviewers own the classification;
  showing "Prohibited" publicly invites re-answering until the result improves.
- A reviewer who sets a level other than the computed one **must give a
  justification**, as the intake risk override already requires.
- Existing saved levels are **not reclassified**. Every run stores its
  `questionnaire_version`.
- GPAI is out of scope for the wizard.

## Questionnaire v2

Order of questions; each step cites the article it applies.

1. **Scope.** Research and development only, before being placed on the market
   or put into service (Art. 2(6)/(8)) → result **Out of scope** (a new enum
   value). Otherwise continue.
2. **Provider or deployer.** Changes the obligations listed with the result, not
   the level. Carried to the use case's `type_of_high_risk_role` on approval.
3. **Article 5 checklist** of prohibited practices. Any yes → **Prohibited**.
   - 5(1)(h) real-time remote biometric identification in publicly accessible
     spaces for law enforcement: prohibited **unless** used for one of the
     authorised objectives, asked as a follow-up.
   - New bans added by the Omnibus (Regulation (EU) 2026/1744, in force
     2026-07-27): non-consensual intimate imagery of real people and child sexual
     abuse material, applying from **2026-12-02**, with a safe harbour for
     providers with adequate safeguards. Before that date the result reads
     "prohibited from 2 Dec 2026".
4. **Article 6(1) safety component**, using the post-Omnibus safety-function test
   (6(1a)/(1c); machinery moved to Annex I Section B) → **High risk**
   (applies from 2028-08-02).
5. **Annex III area**, with the carve-outs asked as follow-ups: 1:1 biometric
   verification, fraud detection, travel documents, campaign organisation tools.
   An Annex III match → continue to 6. Otherwise go to 7.
6. **Article 6(3) derogation.** Profiling of natural persons → always **High
   risk**. Otherwise, if one of the 6(3) conditions holds, the system is not high
   risk, but the result states that the assessment must be **documented** and the
   system still **registered** (with reduced information). Without a derogation →
   **High risk** (Annex III obligations apply from 2027-12-02).
7. **Article 50 transparency** (interacts with people, generates or manipulates
   content, emotion recognition or biometric categorisation) → **Limited risk**
   (in force since 2026-08-02; 50(2) marking for systems already on the market by
   2026-12-02). Otherwise **Minimal risk**.

**Stopping rule.** Out of scope (step 1) and Prohibited (step 3) end the
questionnaire. High risk from step 4 skips steps 5–6. Step 7 is always asked for
High risk and non-high-risk systems: for High risk it adds the Article 50
transparency obligations without changing the level. A 6(3) derogation continues
to step 7.

A result is `{ level, reasons: [{ article, text, applies_from? }], obligations: [...] }`.
Obligations depend on level and role.

Answers are option keys only, with no free text, so a run holds no personal data
and nothing a reviewer must sanitise.

## Server module

`Servers/services/euAiActClassification/`:

- `questionnaire.v2.ts`: the definition (questions, options, `showCondition`
  branching) served to clients. The version is part of the definition.
- `score.ts`: `scoreClassification(version, role, answers) → result`. It
  dispatches by version, so later versions add a scorer and runs keep the rules
  they were made with.
- `validate.ts`: rejects unknown keys and option values, and unanswered required
  follow-ups for the given answers.

The client no longer contains scoring. `riskClassification.ts` and
`questions.config.ts` are removed once the wizard uses the server definition.

## Intake flow

**Builder.** A toggle, "EU AI Act risk classification step", in form settings
next to the suggested-questions toggle; stored as
`intake_forms.eu_ai_act_risk_step_enabled` (boolean, default false). It shows
only for use case forms.

- While the step is on, no question can map to `ai_risk_classification`: the
  builder disables that mapping with a short explanation, and the server rejects
  a form that has both (400).
- The builder preview shows both steps.

**Public form.** With the step on, the page has two steps: 1) risk
classification, 2) the form's questions. "Back" keeps answers. The public GET
endpoints (by id and by slug) return the questionnaire definition when the step
is on. A resubmission pre-fills the risk answers from the original submission's
run.

**Submit.** Both submit routes (`submitPublicFormByPublicId`, `submitPublicForm`):

- the step is on and `euAiActRiskAnswers` is missing → 400;
- `validate.ts` fails → 400;
- otherwise the server scores, stores a run (see below) and ignores any level the
  client sent. The response carries no classification.

If the definition fails to load, the public form shows an error and does not
submit.

## Storage

New tenant table `eu_ai_act_classifications`:

| Column | Notes |
| --- | --- |
| `id`, `organization_id` | tenant-scoped like every table |
| `use_case_id` | FK `projects(id)` ON DELETE CASCADE, nullable |
| `intake_submission_id` | FK `intake_submissions(id)` ON DELETE CASCADE, nullable |
| `questionnaire_version` | e.g. `2` |
| `role` | `Provider` / `Deployer` |
| `answers` | JSONB, option keys only |
| `result` | JSONB, snapshot of the result when the run was saved |
| `reviewer_level`, `reviewer_justification`, `reviewed_by` | set only when an approver overrode the computed level |
| `source` | `wizard` or `intake` |
| `created_by` | nullable (public submitters) |
| `created_at` | |

A CHECK ensures **exactly one** of `use_case_id` and `intake_submission_id` is
set. Each run belongs to one owner, and deleting the owner deletes its runs; no
run is left without an owner.

Register the table in `Servers/tests/integration/tenant-isolation/tenantIsolation.registry.ts`
(CI fails without it).

## Review and approval

- **Submission detail** gets an "EU AI Act classification" panel: level, reasons
  with article citations and dates, role, and each question with its answer. The
  result is **scored again on read** from the stored answers and version. If it
  differs from the stored snapshot (the scorer for that version was fixed), the
  panel shows the current result and says it was updated since submission.
- The intake risk score panel is unchanged. The two are labelled "Intake risk
  score" and "EU AI Act classification" everywhere.
- **Approval dialog** pre-fills the use case's AI risk classification and role
  with the computed result. If the reviewer picks another level, a justification
  field appears and is required.
- **Approve request** gains `euAiActOverride?: { level, justification }`. The
  server scores again; if the final level differs from the computed one without a
  justification → 400. A computed or chosen level of Prohibited is allowed, but
  the dialog shows a warning first.
- **On approval**, in the same transaction:
  - the use case is created with the final level and role;
  - a new run with `use_case_id`, `source = intake` and the same answers and
    version is inserted (the submission's run stays with the submission), with
    the reviewer override fields when used;
  - the use case history records "AI risk classification set from intake: High
    risk", or "…computed High risk, set to Limited risk by reviewer: <justification>".

## In-app wizard

- Loads the definition from `GET /api/eu-ai-act-classification/questionnaire`.
- Saves through a new `POST /api/projects/:id/eu-ai-act-classification` with
  `{ role, answers }`. In one transaction the server validates, scores, inserts a
  run (`source = wizard`), sets `ai_risk_classification` and
  `type_of_high_risk_role`, and records history.
- The route is guarded with `authorize("useCase.classify")`, a new permission key
  for Admin and Editor. (Project routes have no role checks today; the new
  route must not repeat that.)
- Opening the wizard pre-fills answers from the use case's latest run; for a use
  case created from intake, that is the intake run. The `localStorage` draft is
  kept only for unsaved progress.
- Setting the level by hand in use case settings stays possible, as today. It
  writes history but no run.

## Migrations

1. Add `Out of scope` to `enum_projects_ai_risk_classification`. On PostgreSQL 12+
   `ALTER TYPE … ADD VALUE` can run in a transaction, but the new value cannot be
   used in that same transaction, so it is its own migration. `down` is a
   documented no-op: an enum value cannot be dropped without recreating the type.
2. `intake_forms.eu_ai_act_risk_step_enabled BOOLEAN NOT NULL DEFAULT false`.
3. Create `eu_ai_act_classifications` with the FKs, CHECK and an index on
   `(organization_id, use_case_id)` and `(organization_id, intake_submission_id)`.

The `AiRiskClassification` enums (Servers and Clients) gain `OUT_OF_SCOPE`.
Labels, chips, filters and dashboard counts handle it. The EU AI Act category
filter (`getVisibleEuCategoryIdsForProject`) needs no change: no risk tier row
matches "Out of scope", so only the general-risk category (AI literacy) shows.

All new user-facing strings get de, fr and es translations
(`npm run i18n:audit:strict`), and backend messages go into `Servers/locales`.

## Testing

- **Scoring:** one unit test per branch of the questionnaire, including each
  Article 5 item, the 5(1)(h) authorised-objective follow-up, the date-dependent
  Omnibus bans (before and after 2026-12-02), each Annex III carve-out, the 6(3)
  profiling rule and derogation, Article 50, and research-only → Out of scope.
  Regression tests for each bug listed under "How it works today".
- **Validation:** unknown keys, unknown values, missing follow-ups.
- **Intake controllers**, for both submit routes: step missing → 400; tampered
  level ignored; step on a model form rejected; form with both the step and an
  `ai_risk_classification` mapping rejected.
- **Approval:** scored again from stored answers; pre-fill; override without
  justification → 400; run copied to the use case; history entry written.
- **Wizard route:** authorisation (Auditor and Reviewer → 403), run written, level
  and role set.
- **Migrations** up and down; tenant isolation test for the new table.
- **Frontend:** builder toggle hidden on model forms; two-step public form;
  approval dialog justification rule.

## Out of scope

- GPAI classification.
- Reclassifying existing use cases.
- Conditional questions in intake forms generally (the step's branching is
  internal to the questionnaire).
- Showing the result to the public submitter.
- Role checks on the existing project routes (a separate security fix).
