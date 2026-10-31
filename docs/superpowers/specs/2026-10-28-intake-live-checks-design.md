# Intake live checks: design

Part 3a of the AI-assisted intake work. Parts 1 (classification, score, suggested risks, #5077) and 2 (routing, second review, oversight, #5089) are merged. Part 3 was listed as "live checks while filling in the form, the full reviewer brief and the weekly oversight email". This document covers only the live checks. The reviewer brief and the weekly email stay out of scope.

The behaviour comes from the approved demo (artifact "AI-assisted intake review" v3, Intake stage).

## Why

Submitters fill in intake forms through a public link. Today the form takes any answer: "TBD", a one-word purpose, "no personal data" next to a question that lists CVs, a plan to score video interviews for enthusiasm. Reviewers find these problems later and send the form back. Live checks show the problem while the submitter is still typing, and the same flags reach the reviewer with the submission.

## Goals

- Show hints under a question while the submitter fills in the public form.
- Four hint kinds, in severity order: `prohibited` (red), `regulation` (amber), `contradiction` (amber), `vague` (blue). The demo's grey `note` kind is dropped: nothing in this part produces it.
- Rule hints with no AI: possible EU AI Act Article 5 practices, possible Annex III high-risk uses, possible GDPR Article 22 automated decisions, and answers that are too short or placeholders.
- AI hints when the form has an LLM key: vague answers and contradictions between answers.
- Vendor document prefill: the submitter uploads a PDF or Word file, the AI suggests answers for empty questions, and each suggestion is marked "AI-suggested" with a Confirm button.
- At submit, the server re-runs the checks itself and stores them on the submission. The reviewer sees them in the submission review modal.

## Non-goals

- The full reviewer brief (summary, "3 things to check", grouped flags). Part 3b.
- The weekly oversight email. Part 3c.
- Feeding hints into the risk score or the routing lane. Scoring already has its own rule floor (user approved).
- Rule keywords in German, French or Spanish. Rules match English text in this part; hint text itself is translated. The limit is stated in the form builder help text.
- Checking free text against the EU AI Act risk step answers.
- Storing the uploaded vendor document.

## Anti-goals

These would make the feature a failure even if it works:

- **Blocking or slowing submission.** A failed, slow or rate-limited check never stops the submitter. Submit works with no check ever having run.
- **Stating a legal conclusion.** Rule hints say what the answer mentions and why it may matter ("This answer mentions emotion recognition at work. Emotion recognition at work or in education is prohibited under Article 5(1)(f), except for medical or safety reasons."). They never say "this system is prohibited".
- **Leaking the LLM key or other organisation data to the public page.** The key is read on the server. Responses carry hints only.
- **Trusting the browser for what the reviewer sees.** Stored hints come from the server's own run.
- **Uncapped spend on the customer's key.** Every AI call from the public page is rate-limited per visitor and per form.
- **AI text presented as fact.** AI hints and prefill suggestions are labelled as AI. A suggestion the submitter did not confirm reaches the reviewer marked "not confirmed".

## Decided by the user

- Anyone with the public link may trigger AI checks on the organisation's key, as long as calls are debounced and rate-limited, and a form with no key falls back to rule checks only.
- Rules catch regulated uses; the AI catches vague and conflicting answers.
- Checks never block submission.
- Hints are not fed into the score.
- Prefill: AI-suggested values with a Confirm button; unconfirmed values may be submitted and reach the reviewer labelled as unconfirmed.
- The vendor file is not stored. Only its name and the quoted passage are kept.
- Rule hints are translated in the app (de, fr, es). AI hints are written in the submitter's language.
- Live checks are on by default for new and existing forms, including forms that already have an LLM key (user, 2026-10-28).

## Current state (origin/develop @ 0eb71fcfa)

- Public form: `Clients/src/presentation/pages/PublicIntakeForm/index.tsx` (react-hook-form, `watchedValues`, `evaluateForm` for visibility). Fields render in `FormFieldRenderer.tsx`. Field types (`IntakeFormBuilder/types.ts:13`): text, textarea, select, multiselect, checkbox, date, email, url, number, calculated. There is no authenticated fill path.
- Public routes: `Servers/routes/intakeForm.route.ts:148-156`, `GET`/`POST /public/by-id/:publicId` and `/public/:tenantSlug/:formSlug`, with only `generalApiLimiter`. Submit checks a signed math captcha and a 10/hour per-IP-per-org limit counted from submission rows.
- No public endpoint calls an LLM today. The form's `llm_key_id` is used in the async assessment job (`Servers/services/intakeScoring/assessmentJob.ts`).
- Reusable server parts:
  - `intakeScoring/scoringInput.ts` `buildScoringAnswers` (drops email fields, caps 2,000 chars per answer and 24,000 in total).
  - `intakeScoring/prompts.ts` nonce delimiters for untrusted answer text; `aiScoring.ts` keeps an AI reason only when its excerpt is found in the answer.
  - `advisor/llmSelfCorrect.ts` `generateObjectWithSelfCorrection`; `advisor/llmModelFactory.ts` `createModelFromKey`.
  - `services/fileIngestion/textExtractor.ts` `extractText(buffer, mimetype)` (pdf-parse, mammoth) and `normalizeText`.
  - `euAiActClassification/score.v2.ts` `ARTICLE_5` and `ANNEX_III_ARTICLE` wording and references (module-private today; export them).
- `controllers/intakeForm.ctrl.ts:168` `createSignedToken` / `verifySignedToken` (used for the captcha and resubmission tokens; move to a util to share).
- `database/redis.ts` shared ioredis connection.
  - `middleware/rateLimit.middleware.ts` `createRateLimiter`.
- Reviewer modal: `Clients/src/presentation/pages/IntakeFormBuilder/SubmissionPreviewModal.tsx`, fed by `GET /submissions/:id/preview`.
- i18n: the app-wide DOM translator (`Clients/src/i18n/domTranslator.ts`) translates English strings found in `Clients/src/i18n/translations.ts`. The public page follows the language stored in the browser, else English.

## Design

### Hint shape

One type, shared by rules, AI, the API and storage:

```ts
type HintKind = "prohibited" | "regulation" | "contradiction" | "vague";

interface LiveCheckHint {
  id: string;               // stable: ruleId + questionId, or "ai:" + hash
  kind: HintKind;
  source: "rule" | "ai";
  questionId: string;       // the field the hint sits under
  alsoQuestionId?: string;  // contradictions: the other field
  ruleId?: string;          // rule hints only
  ref?: string;             // "EU AI Act, Article 5(1)(f)", "GDPR, Article 22"
  title: string;            // English for rules (translated client-side), submitter language for AI
  text: string;
  excerpt?: string;         // AI hints: the quoted words from the answer
}
```

### Rule checks

A pure module with no I/O, written once on the server (`Servers/services/intakeLiveChecks/rules.ts`) and mirrored on the client (`Clients/src/application/utils/intakeLiveChecks/rules.ts`), with one shared fixture file that both test suites run. This is the existing pattern for `intakeFormLogic` and `intakeScoring/scoreMath`.

Input: the form schema plus the visible answers. Only `text` and `textarea` answers are read. Hidden fields are ignored.

Rules:

1. **Placeholder answer** (`vague`): the trimmed answer is one of TBD, TBA, N/A, NA, not sure, unknown, none, -, ?, or "to be decided". Applies to `text` and `textarea`.
2. **Too short** (`vague`): a `textarea` answer under 20 characters. Not applied to `text` fields, which hold names and short values.
3. **Article 5 practices** (`prohibited`): keyword groups for each practice in `ARTICLE_5`. Some groups need two terms within the same answer, for example emotion recognition plus a work or education term for 5(1)(f), or "scrap" plus "face" for 5(1)(e). The hint quotes the matched terms, cites the article and reuses its `ARTICLE_5` text. One hint per practice per question.
4. **Annex III areas** (`regulation`): keyword groups for the 8 points (employment: recruit, hiring, CV, candidate, shortlist, promotion, termination; education: exam, grading, admission, proctoring; essential services: credit score, creditworthiness, insurance pricing, benefits eligibility; and so on). Reference from `ANNEX_III_ARTICLE`.
5. **GDPR Article 22** (`regulation`): an automated-decision phrase (automatically reject, auto-approve, without human review, no human in the loop, fully automated decision) in any answer. Reference "GDPR, Article 22".

Matching is case-insensitive at word starts, the same approach as the keyword scorer in `intakeRiskScoring.service.ts`. A matched term preceded within three words by "no", "not", "never" or "without" does not fire rules 3 and 4 (so "we do not use emotion recognition" stays quiet). Keyword lists live in one data file per side; the shared fixture keeps the two sides equal.

Rule hint titles and texts are fixed English strings with every one added to `translations.ts` for de, fr and es, so the DOM translator renders them in the submitter's language. Quoted terms are inserted as a separate element so the sentence itself matches the dictionary.

### What the page knows up front

The public form GET (both paths) adds `liveChecks: { enabled: boolean, aiAvailable: boolean }` to its response. `aiAvailable` is true when live checks are on and the form has an LLM key that still exists in the organisation. The key id and provider are never sent. The page uses this to decide whether to run rules, show the AI notice and show the prefill card before it has made any call.

### AI checks

Run only when the form has an LLM key and live checks are on (see Settings).

**Endpoint:** `POST /api/intake/public/by-id/:publicId/live-checks` and `POST /api/intake/public/:tenantSlug/:formSlug/live-checks`. No JWT. Body: `{ data, language }`. The server resolves the form and organisation the same way the public GET does, refuses a form that is not active, builds the answers with `buildScoringAnswers` (visible fields only, after `evaluateForm`), and asks the model for at most 8 hints of kind `vague` or `contradiction`. Response: `{ aiAvailable: boolean, hints: LiveCheckHint[] }`. A form with no key or with live checks off returns `{ aiAvailable: false, hints: [] }`.

**Prompt and output:** the answers go inside the nonce delimiters from `intakeScoring/prompts.ts`, with the instruction that answer text is data. Output is a strict zod schema validated by `generateObjectWithSelfCorrection`. A hint is kept only if its `questionId` (and `alsoQuestionId`) exist among the sent answers and its `excerpt` is found in that answer, the same filter as `aiScoring.ts`. Titles and texts are written in `language` (en, de, fr or es; anything else falls back to en). The client sends the language the DOM translator is currently using, the same one the page renders in. One model call per request. Time limit 15 seconds; on timeout or any error the endpoint answers `{ aiAvailable: true, hints: [], error: "unavailable" }` with status 200, and the page shows nothing new.

**Client calls:** 2 seconds after the last change to any `text` or `textarea` field, and only when at least one free-text answer has 20 or more characters. Each request carries a sequence number; a response older than the newest request is dropped. While a field is being edited its AI hints stay visible but dimmed until the next response.

### Vendor document prefill

**Endpoint:** `POST .../prefill` on both public paths, multipart with one `file` field. PDF and DOCX only (mimetype and extension both checked), 10 MB maximum, held in memory (`multer.memoryStorage`), never written to disk or the database. Text is extracted with `extractText`, normalised and capped at 60,000 characters. The model gets the extracted text inside nonce delimiters plus the list of questions that are empty, visible and of type `text`, `textarea` or `select` (select options listed). It returns at most one suggestion per question: `{ questionId, value, excerpt, location }`, where `location` is a short page or section label if the document shows one.

A suggestion is kept only if the question was in the list, the excerpt is found in the extracted text (whitespace-normalised, case-insensitive), and for a select the value is one of the option values. Each kept suggestion carries a `token`: `createSignedToken({ formId, questionId, value, fileName, location, excerpt, issuedAt })`. Response: `{ fileName, suggestions }`. A form with no key or with live checks off returns 404 for this endpoint, and the page hides the upload. An unreadable file, or one with no extractable text (a scanned PDF), returns 422 with a plain message. Model time limit 30 seconds; a timeout or model error returns 502 with "We couldn't read answers from this document. You can fill in the form as usual."

**Client:** a "Fill from a vendor document" card above the questions, shown only when AI is available. After upload, each suggested question gets the value plus a line: chip "AI-suggested", "Read from <file>, <location>", and a Confirm link. Confirming changes the chip to "Confirmed by submitter". Editing the value by hand also counts as the submitter's own answer and removes the AI-suggested line. Suggestions never overwrite a non-empty answer. The side panel counts unconfirmed suggestions.

### Rate limits

Separate from the submit limit. In-memory `createRateLimiter` instances with a custom `keyGenerator`. A form is reachable by two URLs (by public id and by slugs), so a small middleware resolves the form first and puts its id on the request; both limiters key on that id (per form) or on IP plus that id (per visitor). An unknown form answers 404 before any limiter counts. The limiters are per server instance, like every other limiter in the app.

| Endpoint | Per IP and form | Per form, all visitors |
|---|---|---|
| live-checks | 10 a minute | 300 an hour |
| prefill | 3 per 10 minutes | 20 an hour |

The per-visitor limits use the in-memory `createRateLimiter` (per server instance, like every limiter in the app). The per-form hourly caps are the real ceiling on the customer's key, so they are counted in Redis (`database/redis.ts`, `INCR` plus `EXPIRE` on a key per form, endpoint and hour) and hold across replicas and restarts. If Redis is unreachable the per-form check fails closed for AI (the endpoint answers as if rate-limited) and rules keep working.

When a limit is hit the client stops calling for the limiter's window and keeps showing rule hints. The page says nothing about it beyond a faint "AI checks paused for a few minutes" line in the side panel. Exact numbers are the builder's to tune; the shape (per visitor and per form) is fixed.

### Public form UI

- Rule hints update on every change (no request). A hint whose field becomes hidden is dropped.
- Hints render under the field's control, sorted by kind order, each with the bold title, the reference after a dot, and the text. Field border turns red for `prohibited`, amber for `regulation` or `contradiction`. A contradiction shows under both fields.
- An "Intake assistant" side panel on wide screens (sticky, right of the questions), and above the submit button on narrow screens. It shows a count per kind, a list of open hints that scroll to their field on click, the unconfirmed-suggestion count, and the line "These checks never block submission. Your reviewer sees them too."
- A one-line notice at the top of the form step when AI is available: "Your answers are checked by AI as you type to help you complete this form." This is required, since answers now leave the page before submit.
- The EU AI Act risk step (when on) is unchanged. Checks run on the form step only.
- House UI rules: sentence case, `#d0d5dd` border, 4px radius, `#13715B`, 30px controls, VerifyWise components where one exists.

### Submit and storage

- The submit body gains an optional `prefill` map: `{ [questionId]: { token, confirmed } }`. The server keeps an entry only if the token verifies, is under 24 hours old, names this form and question, and its signed `value` equals the submitted answer. Provenance (file name, location, excerpt) is read from the token, never from the body. An answer the submitter changed after prefill fails the value check and is stored as their own answer with no prefill entry. So the reviewer only ever sees provenance the server issued.
- New nullable column `intake_submissions.live_checks JSONB`:
  ```
  { version: 1, rules: LiveCheckHint[], ai: { status: "pending" | "done" | "failed" | "skipped", hints: LiveCheckHint[] }, prefill: {...} }
  ```
- Rule hints are computed synchronously in the submit request, over the visible answers (server-side `evaluateForm`). They are pure and fast.
- AI hints are computed by the existing assessment job (`intakeScoring/assessmentJob.ts`) as a third stage, `liveChecks`, added to `AssessmentStage` in `enqueue.ts`. It uses the same prompt and filter as the endpoint, so submit never waits on the model. A form with no key stores `ai.status: "skipped"` and the stage is not queued.
- The new stage must not change part 1 behaviour:
  - The new-submission email does not wait for it. `hasPendingStage` and the settle logic keep looking at scoring and suggestions only.
  - Backfill (`backfillIntakeAssessments`) does not queue `liveChecks` for submissions made before this feature (their `live_checks` is null). It queues it only for a row whose `ai.status` is still `pending`.
  - A failure or timeout of this stage stores `ai.status: "failed"` and never fails the other stages.
  - The stage writes its result whatever the submission's status. The hints are information for the reviewer and change nothing else.
  - The reviewer's existing assessment retry (`selectRetryStages`, `/assessment/retry`) also re-queues `liveChecks` when its `ai.status` is `failed`.
  - Stored AI hints are written in the submitter's language (the job's `lang`, from the submit request's Accept-Language), the same language as the answers they quote. A backfilled row with no language uses en.
- A form with live checks off stores `live_checks: null`. The reviewer view then shows nothing.
- Resubmissions compute fresh checks; nothing is copied from the original.

### Reviewer view

In `SubmissionPreviewModal.tsx`:

- Each flagged answer shows its hints as compact chips (kind label plus reference) with the text on hover or expand.
- Prefilled answers show "AI-suggested from <file>, <location>" and either "Confirmed by submitter" or "Not confirmed".
- An "Intake checks" section next to the risk section: counts by kind, and "AI checks still running" or "AI checks unavailable" when the AI stage is pending or failed.
- `GET /submissions/:id/preview` adds `liveChecks` to its payload.

### Settings

A per-form toggle in the form builder: "Check answers while the submitter types", default on for new and existing forms, stored as `intake_forms.live_checks_enabled BOOLEAN NOT NULL DEFAULT true`. Off turns off all live checks for that form: rules, AI and prefill, on the page and at submit. Help text states that AI checks and prefill need the form's LLM key, and that rules match English answers. Turning the toggle on for existing forms by default means forms that already have a key start making AI calls from the public page after deploy. The PR description must say so.

### Migration

One migration adding `intake_submissions.live_checks` and `intake_forms.live_checks_enabled`, with the `verifywise.` schema prefix. Columns on existing tables, so no tenant-isolation registry change.

## Testing

- Rule module: the shared fixture (each rule firing, negation suppressing, hidden fields ignored, `text` vs `textarea` length rule) run by both the Jest and Vitest suites.
- Endpoints: no key, live checks off, inactive form, rate limit, model error, excerpt filter dropping an invented quote, select prefill with a value that is not an option, file type and size refusals.
- Submit: rules stored, AI stage stored by the job, `prefill` sanitising.
- Client: debounce and stale-response drop, Confirm and hand-edit flows, side panel counts, submit still works with every check failing.
- i18n: `npm run i18n:audit:strict` clean for all new strings.

## Left to the builder

- File layout inside the two new modules, component names, and how the side panel is split into components.
- The exact keyword lists, within the groups above, and the hint wording within the style of the example in Anti-goals.
- Exact rate-limit numbers.
- How the assessment job orders the new stage relative to scoring, as long as a failure in one does not fail the other.

## Calls I made (not discussed with the user)

- Too-short rule only on `textarea`; the 20-character threshold.
- Negation within three words suppresses Article 5 and Annex III rules.
- 2-second debounce; 8 AI hints maximum; 15-second model timeout.
- 10 MB, PDF and DOCX only, 60,000 extracted characters, 30-second model limit.
- Per-form rate limits keyed on the resolved form id, not the URL.
- The live-checks job stage writes whatever the submission's status, and old submissions are not backfilled.
- AI hints for the stored submission come from the assessment job, not the submit request.
- One toggle covers rules, AI and prefill.
- The "checked by AI as you type" notice.
