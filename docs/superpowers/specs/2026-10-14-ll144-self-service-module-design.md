# Self-service bias testing module — design spec

> Date: 2026-10-14
> Status: draft for review
> Branch: `feat/ll144-self-service-module` off `origin/develop`

## Problem

VerifyWise has a working bias audit engine. It cannot ask the questions that decide whether
its numbers mean anything.

The engine (`EvalServer/src/engines/bias_audit/`, 3,106 lines) computes selection rates,
scoring rates, confusion-matrix fairness metrics, intersectional analysis and impact ratios,
and renders a PDF. The intake wizard collects four metadata fields: AEDT name, description,
distribution date, data source description.

Across three completed LL 144 engagements (Client C, Client A, Client B), the questions
that caused every expensive failure were not statistical. They were about scope, party status,
what the tool ingests, and what the data can support. None of them has a home in the current
module.

This spec adds that layer, and the generation step that makes it usable by customers who hold
no demographic data — which, in all three engagements, was every client.

## Scope

### Relationship to the existing bias audit UI

`Clients/src/presentation/pages/EvalsDashboard/` already contains a working bias audit:
`BiasAuditsList.tsx`, `BiasAuditDetail.tsx`, `NewBiasAuditModal.tsx`, backed by EvalServer and
serving 17 framework presets.

**It stays exactly as it is.** This module is a separate sidebar entry and changes nothing in
the Evals dashboard. Decided 2026-10-14.

Two surfaces therefore coexist, deliberately:

| Surface | What it is |
| --- | --- |
| Evals dashboard bias audit | EvalServer-backed, 17 presets, upload-and-compute for an analyst who already holds scored results |
| This module | Standalone, LL 144 only, intake-led, generates its own corpus, produces a readiness stance |

Neither replaces the other and nothing migrates between them. A future decision may deprecate
one; until that decision is taken, removing or rewiring either is out of scope for any task in
these plans.

### In scope

- A project-level AEDT profile: the customer's own answers to the questions that determine
  what can be measured and what the result may claim.
- A readiness score derived from those answers, with four questions that gate rather than score.
- Synthetic corpus generation from two fixed job descriptions, driven by the profile answers.
- A criteria-comparison check between the expected criteria for the chosen JD and the criteria
  the customer's platform actually generates.
- Data-quality gates that refuse to produce figures the result cannot support.
- A short per-project stance: one screen in-app, 2–3 page PDF, immutable and hashed.
- Expiry derived from the test-data basis, not from a fixed 365-day countdown.
- Substantive education on every page: what it decides, the statutory hook, and what goes wrong.

### Out of scope (explicitly)

- **Any claim of compliance.** No self-run can satisfy § 5-300, which requires an independent
  auditor. The module never prints "compliant", "certified", "passed" or "bias-free".
- **The § 5-303 public summary snippet.** Publication is the deploying employer's obligation and
  requires an independent audit. Generating a postable summary from a self-run would leave a
  customer worse off than posting nothing.
- **Determining AEDT status.** The module records the customer's determination as theirs,
  attributed and quoted. It does not restate it as a finding. (See Prior art, item 1.)
- **An engagement workbench.** Client round trips, delivery packaging, received-artifact
  records, permutation tests, matched-pair designs and full report generation stay out. The data
  model leaves seams for them; nothing here implements them.
- **Spend tracking on generation.** Cost is immaterial: 4,918 CVs cost USD 1.42 on a comparable
  run.

## Prior art: what the three engagements established

Each item below is a design constraint with a documented cost. They are the reason this module
is shaped the way it is.

**1. The auditor must not determine AEDT status.** Client C's report asserted both tools in scope on
a client confirmation the client later denied; the determination was withdrawn entirely from the
final version. Client B declined to determine it from the outset, citing that withdrawal. The
rule carried forward: "Do not determine AEDT status for a client's customers. That had to be
withdrawn from a signed Client C report after counsel objected twice."

**2. Vendor-versus-deployer status, unasked, was the most expensive recurring error.** Client C:
assumed employer throughout, three signed documents reissued. Client A: asked on 2026-09-25
only, after a published summary had already told them to post it on their own website; summary
reissued, publish instruction retracted. The record states plainly: "it is the error that cost
the Client C reissue. It did NOT need to be inferred."

A vendor has no single distribution date (§ 5-303(a)(2) is the date a given employer began
using the tool) and carries no § 5-303 duty. "Client A's live applicant population" was
wrong in two documents: a vendor has no applicant population, its customers do.

**3. The test-data basis differs in kind, and the kinds have different expiry triggers.** Four
distinct bases arose:

| Engagement | Basis | Expires when |
| --- | --- | --- |
| Client C | Categorical — holds no demographic data at all | They begin collecting self-identification |
| Client A interview tool | Volume — 281 sex, 50 ethnicity disclosures | Disclosure volumes become sufficient |
| Client A shortlist tool | Attribute — race/ethnicity not collected at all | Customers begin capturing race and ethnicity |
| Client B match tool | Availability — historical data sits with the deploying agency | The vendor gains access to it |

"Sex-only records do not end it however far their volume grows." A date-based renewal reminder
would be wrong in both directions.

**4. Questions deferred as non-blocking became the late crises.** The 2026-08-29 Client A
ask deliberately deferred four items as "none of which block the build": redaction scope,
knockout automation, applicant volume, cohort-relativity. Three became blocking. The Client C
retrospective: "Three were parked as non-blocking; each became a blocker, a chase, or a caveat."

**5. Questions asked repeatedly were often never answered.** Shortlist criteria: 4 asks. Pre/post
redaction JSON: 3–4. What the tool ingests: 3 asks over 11 days, finally answered by an artifact
rather than a reply. Knockout: 2–3 at Client A, 3 at Client B, 4 at Client C — "We asked four
times and got the answer after shipping." Sourcing fields: 3 asks, answered "Not sure if i
understand the question."

A question a consultant asked four times is a question a form gets zero answers to. This is the
central design fact: the module asks less and detects more.

**6. The corpus is derived from the intake answers.** Each client answer changed the corpus
design. Client B's screening tool ingests a speaker-labelled ASR transcript with scored clarifying
follow-ups, not written answers — the v1 design was superseded outright. Client A's five
generated criteria differed from our reconstructed eight, forcing a remap with "66 hits across
three files". Knockout configuration set the qualification gradient: "safe for a knockout on 1,
survivable on 2 or 3, and unusable on 4 or 5."

**7. Clean ratios from a badly built corpus are more dangerous than flagged ones.** Client B's
screening corpus assigned demographics in 14 contiguous ID blocks while generation ran in ID
order. Balance checks passed. Blueprint independence passed. Sex returned 0.9770 *because* it
was the most perfectly blocked attribute — a two-block split averages position effects over half
the corpus each and they cancel. "A clean sex ratio is therefore NOT evidence against the
mechanism and must not be read as such."

The defect shipped twice before a `count_runs` gate existed.

**8. Our inference written back as the client's statement is a named, recurring failure.** Four
instances: Client C's "Client C confirmed" sentence (false as written), the Client A knockout, "no
rubric exists", and reading "no breakdowns" as "not held". Any text the module generates from an
answer must be traceable to that answer, and should quote rather than characterise.

**9. Three levels of output make the standard calculation produce nothing.** Client C's phone screen
returned stoplight levels; 3,739 of 5,000 were green, so the median summary level was itself
green. Counting strictly above the median gave every group a rate of zero. The rate had to be
"at or above", disclosed explicitly. Score granularity must be detected before a run, not
discovered after.

**10. Independence is a § 5-300 requirement and was nearly omitted.** Six template sections went
missing from a report drafted from scratch rather than from a delivered one, independence among
them. A short document still needs a fixed section list and a checker.

## Statutory basis

From the DCWP final rule implementing Local Law 144, as recorded in the verified requirements
mapping. The module cites only what the rule text contains.

- **§ 5-301(b)** — selection branch: the tool selects or classifies.
- **§ 5-301(c)** — scoring branch: the tool scores. Requires the median for the full sample,
  the scoring rate and impact ratio per category, sex and race/ethnicity categories, the
  **mandatory intersectional sex × race/ethnicity analysis**, and the count assessed but in an
  unknown category. All three engagements landed here.
- **§ 5-301(d)** — a category under 2% of the data may be excluded. This is the statutory rule.
- **§ 5-302(a)** — a bias audit must use historical data.
- **§ 5-302(b)** — test data is permitted if insufficient historical data is available to conduct
  a statistically significant bias audit, and then imposes two duties on the summary: explain why
  historical data was not used, and describe how the test data was generated and obtained.
- **§ 5-303** — publication, by the employer or employment agency. Not the vendor (FAQ V.1).
- **§ 5-301(a)** — the only re-audit trigger in the rule: more than one year since the most
  recent audit. The rule contains no trigger for role, configuration, weighting or model change.
  A prior report cited § 5-301(a) for a proposition it does not contain and the table was deleted.

**0.80 is the EEOC four-fifths convention and the statute does not adopt it.** The module
displays it as a convention with that provenance stated, never as a pass mark. The current
`nyc_ll144.json` places `threshold: 0.80` and `small_sample_exclusion: 0.02` side by side with
nothing marking one as law and the other as convention.

## Architecture

Node/TypeScript in `Servers/`, React in `Clients/`, and shared-schema tenancy with
`organization_id`. `Servers/CLAUDE.md` documents a four-layer pattern, route → controller →
utils → model; this module adds a service layer between controller and utils, as the 40-plus
existing directories under `Servers/services/` already do.

**No dependency on EvalServer or the platform AIGateway.** The engine is ported to TypeScript;
generation calls the Vercel AI Gateway directly.

### Why port rather than call EvalServer

The engine imports only Python stdlib, `pydantic` and `reportlab` — no database, no HTTP client,
no LLM, no queue. The EvalServer coupling is entirely in the surrounding router, controller, CRUD
and preset-loader layers plus Alembic migrations in EvalServer's schema. The computation is
portable; its housing is not.

The module's value is a per-project stance tracked across a year, which requires reading project
state, respecting `organization_id`, and hooking the existing notification system. All of that
lives in Node. A process boundary between the audit and the project it describes is where
provenance questions went wrong on Client B.

**Port discipline:** every ported function is validated against the Python as a differential
oracle on a shared fixture set, and must reproduce its table output before it ships. The
scoring-rate mode computes "rate above overall median", where mixing `>=` and `>` previously
produced 23 wrong rows out of 46 on a delivered figure set. The median convention is pinned by
test.

### Module layout

```
Servers/
  structures/NYC-Local-Law-144/
    intake.questions.ts          question set, versioned, with appliesWhen + consequences
    job-descriptions/
      commercial-ae.ts           fixed JD 1 + expected criteria
      operational-hourly.ts      fixed JD 2 + expected criteria
  services/biasAudit/
    engine/                      ported computation (pure)
      selectionRate.ts
      scoringRate.ts
      fairnessMetrics.ts
      intersectional.ts
      impactRatio.ts
    readinessScore.ts            pure: answers -> score | blocked
    answerGates.ts               pure: answers -> blocked outputs
    dataGates.ts                 pure: dataset -> hard stops + warnings
    idOrderCheck.ts              pure: run-count test on input ordering
    criteriaComparison.ts        pure: expected vs supplied criteria
    generation/
      plan.ts                    demographic allocation + qualification tiers
      assignCandidateIds.ts      seeded permutation (never zip)
      generate.ts                Vercel AI Gateway calls
      manifest.ts                demographics held separate from corpus
    stance/
      compose.ts                 answers + result -> stance model
      render.ts                  stance model -> PDF
      vocabulary.test.ts         forbidden-word lint
```

Every file above the `generation/` boundary is a pure function: given inputs, return outputs, no
I/O. The legally consequential logic is readable in one sitting and table-testable.

## Data model

Four tables in the `verifywise` schema, all tenant-scoped.

### `aedt_profiles`

The project-level answers. Append-only and versioned.

```
id, organization_id, project_id, framework_id
version                int, from 1
status                 draft | attested | superseded
question_set_version   int
attested_by_user_id, attested_at, superseded_at
created_by, created_at, updated_at

UNIQUE (project_id, framework_id, version)
UNIQUE (project_id, framework_id) WHERE status = 'attested'   -- partial
```

`(project_id, framework_id)` matches the `projects_frameworks` join, which carries no surrogate
key. The partial unique index enforces one current profile per project-framework and closes a
race on concurrent attestation.

Changing an answer writes version N+1 and supersedes N. A run records the profile version it ran
against, which makes cross-version trend comparison detectable in a query rather than by
convention.

**One profile per tool, not per company.** The Client C retrospective: ask the tool questions "once
per tool, not once for the company. On one engagement the same question gave opposite answers for
two products — one had no usable candidate data, the other had thirty thousand records, which
changed that piece from a document review into a full audit. Nobody found out until week four."

### `aedt_profile_answers`

One row per answered question. Not JSON on the profile: each answer carries its own author,
timestamp and the customer's own words.

```
id, organization_id, profile_id
question_key           e.g. 'role.party'
question_set_version   int
answer_value           text
answer_notes           text          -- the customer's own words, verbatim
is_dont_know           boolean
is_not_applicable      boolean       -- derived from appliesWhen, stored for audit
answered_by_user_id, answered_at

UNIQUE (profile_id, question_key)
```

Three states that must stay distinct: answered, "I don't know", and not-applicable. A null is a
fourth — never asked. A blank field cannot be told from an unasked question a year later, and in
all three engagements the unanswerable questions were the ones that mattered.

`answer_notes` captures verbatim text because paraphrases did not hold up. Client B's
"Nothing happens automatically. A person, a recruiter, reviews and they are the ones who make a
decision" became a load-bearing citation in a signed report. Required for the four veto
questions.

`question_set_version` means a reworded prompt cannot silently inherit an answer given to
different wording.

### `bias_audit_runs`

```
id, organization_id, project_id
profile_id, profile_version
preset_id, question_set_version
job_description_key          'commercial-ae' | 'operational-hourly'
metric                       selection_rate | scoring_rate | fairness_metrics
threshold, threshold_source  statutory | convention | customer_operational
small_sample_exclusion
data_basis_json              per-category basis (see below)
expiry_date                  the annual date
expiry_trigger               text, the basis-specific condition in words
readiness_score              int, nullable
readiness_blocked_reason     text, set when a veto is unanswered
result_json, result_schema_version
dataset_sha256, dataset_retained
row_count
corpus_id                    nullable, set when generated in-app
created_by, created_at
```

`threshold_source` is what fixes the 0.80-versus-0.02 ambiguity: the stance can print "0.80,
EEOC four-fifths convention, not adopted by the statute" rather than presenting a tuning knob.

`data_basis_json` is per protected category, not per run. "We hold sex but not race" is a real
and likely answer, and a single value would flatten it into a wrong one. One engagement held sex
for roughly 1,500 to 2,000 candidates and no race or ethnicity at all: sex was auditable from
historical data while race and all 11 intersectional categories were not.

**It is derived, not asked twice.** The veto question `data.held` already captures what the
customer holds, per characteristic. `data.basis` states the reason for the run as a whole, and
the per-category split is computed from the two. Asking a second per-category grid would add
friction for information already given, and friction is what makes people click through.

The derivation carries one obligation. A derived split is VerifyWise's inference, not the
customer's statement, and writing our inference back as the client's words is a named failure
that put a false sentence in a signed report. So the stance **shows the derived split and asks
the customer to confirm it**, presented as "we read your answers as follows" rather than as
something they said. An unconfirmed split appears in the open items.

The expiry trigger is per category for the same reason. Sex-only records never end a race
attribute basis, however far their volume grows, so a customer who later collects 50,000 sex
disclosures must not see a race basis reported as resolved.

`expiry_trigger` is text because the § 5-302(b) triggers are not dates.

`dataset_retained` is false by default. Applicant demographic records are not retained; the hash
is a fingerprint and the stance says so in those words.

`result_schema_version` prevents a stance regenerated later from silently misreading a changed
result shape.

### `bias_audit_corpora`

Generated corpora. Separate from runs because one corpus may be scored more than once.

```
id, organization_id, project_id, profile_id, profile_version
job_description_key
seed                         int, recorded for reproducibility
model_pinned                 the model requested
models_observed_json         models actually returned, per record, counted
record_count, artifact_kind  resume | transcript
id_order_check_json          observed vs expected runs per attribute
manifest_sha256              demographics, held separate from the corpus
corpus_sha256
generated_by, generated_at
```

`models_observed_json` is recorded from each response rather than from config. Credentials do not
select the provider; config does. Two corpora in prior work went through ten and eleven models,
found by accident after signing. A corpus routed across models is not one configuration, and the
stance states the model set.

`id_order_check_json` stores the run-count measurement so the check is evidenced rather than
asserted.

### `bias_audit_stances`

Immutable outputs.

```
id, organization_id, project_id, run_id
version
pdf_sha256, pdf_file_id
score_at_generation, scope_at_generation    in_scope | out_of_scope | undetermined
profile_version, question_set_version
generated_by, generated_at
```

Never updated; regeneration inserts version N+1. This is the `delivered/` discipline as a table.
The live unresolved problem on a delivered engagement is precisely a version question: a sent
report cites artifacts by hash whose figures it does not reproduce. Multiplied across customers,
"which run produced the number in our procurement answer" becomes a support ticket.

Stance PDFs reuse the files table, which requires one migration:

```sql
ALTER TYPE verifywise.enum_files_source
  ADD VALUE IF NOT EXISTS 'Bias audit stance report';
```

Down is a no-op, matching the existing pattern in
`20260904013000-add-evidence-expired-notification-type.js`.

**No `compliance_status` column exists anywhere.** Nothing in the model can hold the value
"compliant".

**No `open_items` table.** Open items are derived from answers where `is_dont_know` is true or a
gating answer is absent, so they cannot drift out of sync with the answers that produced them.

## Intake

### Question schema

Questions live in code, versioned with the app, reviewable in a diff. A question set is a legal
artifact and should not be editable from an admin screen.

```ts
interface IntakeQuestion {
  key: string;
  scope: 'profile' | 'run';
  prompt: string;
  statutoryRef?: string;
  weight: 'veto' | 'high' | 'standard' | 'low';
  options: Array<{
    value: string;
    label: string;
    consequence?: string;      // shown BEFORE they answer
    emits?: Consequence[];     // applied to the stance when chosen
  }>;
  allowDontKnow: boolean;
  notesRequired: boolean;
  notesPrompt?: string;
  appliesWhen?: Predicate;     // evaluated against prior answers
  gates?: Array<'ratios' | 'stance' | 'scoring_rate' | 'generation'>;
}
```

`appliesWhen` should reuse the visibility-rule evaluator from the intake-form-logic work
(`Servers/services/intakeFormLogic/`) rather than introducing a second predicate system.

### Attestation and roles

Answers may be drafted by Admin (1) or Editor (3). **Attestation is restricted to Admin**, moves
the profile from `draft` to `attested`, and records `attested_by_user_id` and `attested_at`. The
four veto answers also carry their own `answered_by_user_id`, and the stance prints the attesting
user and date beside each one.

Reviewer (2) and Auditor (4) are read-only here. Note that the platform's Auditor role is
read-only and unrelated to the § 5-300 sense of auditor: holding that role confers nothing about
independence, and the module never treats it as doing so.

Rationale: the vetoes are legal determinations about the customer's own position. On one
engagement the compliance owner who later sent 51 deletions across three signed documents had
never been in a conversation with us. The person who can overturn a determination should be the
person who made it.

### Four tiers

**Tier 1 — veto (4).** Preconditions, not scored. All four answered → a score exists. Any
unanswered → no score, `readiness_blocked_reason` set, the UI reads "Scope not established" and
names the missing questions. Not a low number: a 40% implies the other 60% is meaningful when
scope is unknown.

| Key | Prompt | Options | Source |
| --- | --- | --- | --- |
| `role.party` | Do you use this tool to hire your own staff, place candidates with other companies, or supply it to employers who use it themselves? | employer / employment agency / vendor / both | Client C: 3 documents reissued. Client A: summary reissued |
| `scope.weighting` | When someone is assessed, how much does the result matter — the only thing looked at, the biggest single factor, or one of several? | only / biggest / one of several / don't know | Client C Q3: "Decides whether the law applies at all" |
| `independence.auditor` | Who is performing this test? | self / internal team / third party | § 5-300 |
| `data.held` | Do you hold anything on candidates' sex, race or ethnicity — not whether you can report on it, whether it exists anywhere? | per-category matrix | Client C Q6: "We took it the wrong way and never resolved it before signing" |

`data.held` is a matrix rather than a single answer, because sex-held-but-not-race is the common
case and it produces a split basis.

**Tier 2 — asked, with the consequence stated in the question (5).** The strongest pattern in the
record. Client A's Q2 told the client the consequence before they answered: "Platform means
we report a selection rate, which is the stronger LL 144 figure. A person means we report a
scoring rate and say the decision sat with a human. Either is fine." A customer who can see the
consequence answers more carefully.

| Key | Prompt | Consequence shown |
| --- | --- | --- |
| `cutoff.applied_by` | Is any cutoff applied by the platform, or by a person? | Platform → selection rate under § 5-301(b). Person → scoring rate under § 5-301(c), and the stance records that the decision sat with a human. |
| `cutoff.planned` | If not currently automatic, is that planned? | Planned → the stance carries a dated scope statement and expires when the feature ships. |
| `knockout.exists` | Can any criterion fail a candidate outright, rather than just scoring low? | Yes → the stance states that knocked-out records are pooled with low scorers unless you identify the column. |
| `pipeline.input_form` | What does your tool take as input — a resume document, a call transcript, structured answers, or audio? | This determines what the corpus contains. Generating the wrong artifact means your platform scores material it never normally sees, and the result describes nothing. |
| `pipeline.preprocessing` | Does anything transform the input before scoring — extraction, normalisation, parsing, redaction? | Yes → the stance records that the scored input is not the submitted input, as an unresolved limitation. |

`pipeline.input_form` is weighted `high` and gates `generation`. It cannot be detected, because
at generation time there is no data to detect from, and it is the answer that invalidated an
entire corpus design on a prior engagement: a tool documented as taking written answers in fact
ingested a speaker-labelled ASR transcript with scored clarifying follow-ups, and the corpus had
to model a conversation rather than a fixed question list. An `audio` answer blocks generation
outright and the stance says why.
| `history.prior_audit` | Has this tool been audited before, and has it changed since? | Changes affect what the result describes; § 5-301(a) sets the only statutory re-audit trigger at one year. |
| `threshold.operational` | For a scoring tool, what cutoff does your process actually use? | Without it the module will not compute scoring rates, because inventing a cutoff would make the central figure our choice rather than a fact about your tool. |

`threshold.operational` is weighted `low` and gates only the scoring-rate output, not the stance.
A missing cutoff blocks one deliverable; it does not make the other answers uninterpretable.

`cutoff.planned` exists because the real Client A answer was neither platform nor person:
"Currently, none of the tools automatically progress or reject candidates. Psychometrics may
begin to do this from next week… is it best to conduct the audit as if this feature exists
today?" A tool in transition is a likely state and the schema must hold it.

**Tier 3 — detected from the data, never asked (4).** Because the record shows these questions
were asked repeatedly and not answered.

| Check | What it detects | Source |
| --- | --- | --- |
| Score granularity | Distinct values in the score column. Fewer than ~5 → warn that the median may coincide with a modal value and the rate becomes degenerate | Client C: 3 levels, median landed on green, strict-above gave every group zero |
| Outcome column populated | All-blank `selection_outcome` → metric is scoring rate regardless of what was selected | Client C returned 5,000 blank decision rows |
| Protected-attribute ordering | Run-count test on input row order | Client B: 14 contiguous blocks produced a false race finding |
| Cell sizes | Intersectional cells against the § 5-301(d) 2% threshold | § 5-301(d) |

**Tier 4 — permanent disclosures, not asked.** Things the record shows never get resolved. The
stance states them as limitations. Chiefly: the scored input may not be the submitted input
unless the customer attests they have verified the intermediate form. On Client B this was
drafted twice, never sent, and became "the most significant open gap in the audit".

### Scoring

Readiness: how close the customer is to commissioning an independent audit that would survive
scrutiny. **Measured impact ratios never enter the score.** A customer with good governance and a
genuine 0.78 scores high and has the 0.78 reported plainly; folding ratios in would reward
massaging the data, which is the failure mode the module exists to prevent.

```
weights:   high = 2, standard = 1, low = 0.5
earned   = sum(weight) over answered, non-don't-know, applicable questions
possible = sum(weight) over applicable questions
score    = round(100 * earned / possible)
```

- Vetoes are not scored. They gate.
- `scope.weighting = 'one of several'` short-circuits: remaining questions become
  not-applicable, `scope_at_generation = out_of_scope`, and the stance explains why LL 144 does
  not attach. This is a complete and favourable outcome.
- "Don't know" earns zero and appears in the stance's open items by question text.

The score is VerifyWise's construct. No regulator recognises it. The stance says so in a plain
line: it measures readiness to commission an independent audit and is not a finding of
compliance.

### Gates

**Answer gates.** From each question's `gates`:

| Condition | Blocks |
| --- | --- |
| Any veto unanswered | stance, ratios, generation |
| `role.party = vendor` | any stance text implying the customer's own § 5-303 duty is discharged |
| `data.held` unanswered | stance — no § 5-302(b) basis, so no expiry statable |
| `threshold.operational` unanswered and metric is scoring_rate | the scoring-rate output only |

The vendor case produces a stance, a different one: the tool was tested, and a vendor's test
cannot discharge the publication duty of the employers deploying it. The distribution date
appears as a **visibly blank field with an instruction** — "to be completed by the deploying
employer or employment agency" — which is the pattern a delivered Client B summary already uses.

**Data gates.** This layer does not exist today; `dataset_parser.py` is 166 lines of parsing with
no validation.

Hard stops, no figures produced:

- any demographic column majority-missing
- fewer than two groups present in a required category
- zero selected, or all selected (impact ratios undefined)

Warnings that gate the PDF but not the in-app view:

- any intersectional cell below the § 5-301(d) 2% threshold with no exclusion applied
- protected attributes clustered in contiguous input rows beyond chance

### The ID-order check

A run-count test on the ordering of each protected attribute in the input. Expected runs under
random ordering, for group sizes n_i summing to n:

```
expected = n + 1 - sum(n_i^2) / n
```

The general formula, **not** `n * (1 - 1/k)`, which assumes equal group sizes and previously
rejected a correct interleave.

**Two thresholds, by provenance.** Uploaded data is checked at 0.5 of expected runs, because a
real applicant file may legitimately cluster and the check exists to catch block structure
rather than ordinary clustering. A generated corpus is gated at 0.9 and a failure blocks
release, because a generator has no excuse. Measured on a seeded permutation: 7 categories over
5,000 records give 4,305 observed against 4,286.7 expected (1.0043), and an unequal 700/300
split gives 0.9762. Both clear 0.9, so the strict gate does not reject correct work, while the
real defect measured 14 against 4,285.

This check is also applied to generated corpora before they are released, where it is a hard gate
rather than a warning: `assignCandidateIds` uses a seeded permutation and never `zip`, and the
measured run counts are stored on the corpus row.

## Generation

### Two fixed job descriptions

The customer chooses one. They do not supply their own.

| Key | Role | Why |
| --- | --- | --- |
| `commercial-ae` | Account Executive, commercial/sales | Clear gradable attributes (quota attainment, cycle length, deal size) so the qualification gradient separates candidates |
| `operational-hourly` | Operational/hourly | Fewer gradable attributes, the harder case; Client C's "entrepreneurial motivation" separated nobody across 5,000 candidates and carried a third of the summary score |

Fixing the JD is a deliberate restriction with three benefits. The expected criteria are known
ahead of time, so the qualification gradient is designed and tested once rather than derived per
customer. Every customer's corpus is comparable, which accumulates cross-customer evidence the
consulting work cannot generate. And the criteria-comparison check below is only possible because
the expected set is fixed.

**The stance states which role was tested** and that the result characterises the platform's
behaviour on that role, not across the customer's hiring. Under § 5-301 the audit attaches to the
tool rather than the position (FAQ III.4, confirmed at 20-871(a)(1)), so one role is defensible —
but it must be named.

### The criteria-comparison check

After choosing a JD, the customer runs it through their own platform and pastes back the criteria
it generates. The module compares them against the expected set for that JD.

This is a single text field, and it catches the failure that cost Client A a full remap:
five generated criteria against eight we had reconstructed, "66 hits across three files", with the
gradient losing its top rung because the only criterion separating solid from strong was dropped.

Outcomes:

- **Close match** → proceed; the stance records the comparison.
- **Material divergence** → warn before generation that the corpus may not exercise their
  configuration well, and record the divergence in the stance.
- **Not supplied** → generation proceeds, and the stance states the corpus was built against
  expected criteria that were not confirmed against the platform's own output.

### Corpus construction

Driven by the profile answers:

- `artifact_kind` from `pipeline.input_form` — resume or transcript. Client B's v1 transcript
  design was superseded entirely because the tool ingests a speaker-labelled ASR transcript with
  scored clarifying follow-ups rather than written answers. Getting this wrong invalidates the
  whole corpus.
- The qualification gradient from the expected criteria for the chosen JD, adjusted by
  `knockout.exists`.
- Demographic allocation balanced across sex and race/ethnicity. A balanced synthetic pool is
  what makes all 14 cells reportable, which a real applicant pool often cannot do. Note that a
  balanced allocation clears § 5-301(d)'s 2% exclusion by construction at any size, since each
  cell is always 1/14 of the sample: the exclusion is not the constraint on generated volume.
  The constraint is per-cell count, which is statistical power, and the floor is 50 per cell.
- Candidate IDs by seeded permutation. The manifest holding demographics is stored separately
  from the corpus, so the customer's platform scores blind.

**Volume.** 14 intersectional cells at a usable size means low thousands. At 700 candidates a
real effect of a previously measured size reproduced the correct ordering 37% of the time;
at ~2,500 per half, 62%. The default is 5,000 with a documented floor, and the module states the
cell sizes it achieved rather than assuming them.

### LLM configuration

Vercel AI Gateway, OpenAI-compatible, matching the configuration that produced five delivered
audits: `LLM_API_KEY` and `LLM_BASE_URL`.

- The key lives in the bias module's own settings, separate from other platform keys.
- Entered by VerifyWise. Never displayed to the customer, never returned by any API response.
- No spend tracking.
- The model is pinned in config, and the model actually returned is recorded **per record** from
  the response. `models_observed_json` is surfaced in the stance. A corpus routed across models is
  not one configuration.

## The stance

### In-app, one screen

- Scope: in scope / out of scope / not established, in the customer's own words, quoted.
- Readiness score, or "Scope not established" with the blocking questions named.
- Impact ratios per category plus the mandatory intersectional table, with 0.80 shown as a
  convention and its provenance stated.
- Open items, by question text.
- Expiry: the annual date, and the basis-specific trigger in words.
- Which JD was tested.

### PDF, 2–3 pages

Fixed section list, enforced by a checker written for this module. It is equivalent to one used
on prior engagements, which exists because six sections went missing from a report drafted from
scratch, independence among them. That script is not in this repository, so the checker here is
written fresh against the rendered HTML rather than ported. Sections: scope and party status; basis for the data
used; what was tested (JD, corpus, model set, cell sizes); results; open items and limitations;
independence declaration; expiry; data relied on, with hashes.

**Independence** appears prominently, and for `independence.auditor = self` the document states
that this is a self-administered test, that § 5-300 requires an independent auditor, and that this
result is not an LL 144 bias audit.

### The out-of-scope variant

When `scope_at_generation = out_of_scope`, the PDF is a different document: headed **"Scope
determination"**, not "Result". It carries no ratios and no readiness score, because neither was
computed.

It states: the customer's determination in their own words, quoted, with the attesting user and
date; the § 5-300 limb relied on; that VerifyWise did not verify the determination and does not
determine AEDT status; and that a change in how the output is used may bring the tool into scope,
at which point the determination should be revisited.

This is a favourable outcome and the document should not read as a failed run. Nor may it read as
a clearance: it records what the customer established, not what VerifyWise found.

### Vocabulary

A lint test asserts that generated output never contains: compliant, certified, passed,
bias-free, audited (as a claim about this run). Customers paste whatever is printed into
procurement answers.

Permitted: in scope / out of scope, obligations identified, no adverse impact observed in this
run, ready to commission an independent audit.

### Trends

Ratios across runs are shown only where runs share a profile version and a JD. Across a version
change the series is segmented with a visible break labelled with what changed. A gap the customer
has to explain is preferable to a smooth line they will misread; comparability was the entire
argument that made a prior finding attributable.

## Education on every page

**Requirement.** Every page the customer sees carries substantive explanation of what they are
looking at and why it matters. This is not tooltips bolted on at the end: the content is
specified here and ships with the page.

The reason is in the record. Every expensive failure across three engagements came from a
customer not knowing what a question decided. The ones who were told the consequence in advance
answered well: Client A's cutoff question stated "Platform means we report a selection rate,
which is the stronger LL 144 figure. A person means we report a scoring rate", and the answer
came back usable first time. The ones left to infer produced determinations that had to be
withdrawn from signed documents.

A self-service customer has no consultant to ask. The page is the only place the explanation can
live.

### Pattern

Each page carries three elements, in this order:

1. **What this page decides** — one or two sentences, plain language, naming the downstream
   effect.
2. **Why the law cares** — the statutory hook with its citation, or an explicit statement that
   the item is a convention rather than a requirement.
3. **What goes wrong** — a concrete failure, drawn from real engagement experience, anonymised.
   This is the element that changes behaviour; abstract guidance does not.

Content is held in `Clients/src/presentation/pages/BiasAudit/education/` as structured data, not
inline JSX, so it is reviewable, translatable through the existing i18n path, and versioned
alongside the question set.

### Content per page

| Page | What it decides | Law | What goes wrong |
| --- | --- | --- | --- |
| Profile: party status | Whether the publication duty is yours or your customers', and whether a distribution date exists for you at all | § 5-303 binds an employer or employment agency in the city. FAQ V.1: the vendor that created the AEDT is not responsible for a bias audit of it | A tool supplier assumed it was the employer. Three signed documents stated obligations that were not theirs and had to be reissued. A vendor has no single distribution date, because § 5-303(a)(2) is the date a given employer began using the tool |
| Profile: scope weighting | Whether LL 144 applies to your use at all | § 5-300 defines an AEDT as one whose output is relied on solely, weighted more than any other criterion, or used to overrule a human conclusion | A score that is one input among several with no extra weight falls outside the statute. Answering honestly that it is one of several is a complete and favourable result, not a failure. One engagement asserted a tool was in scope on a client's description, the client later disagreed, and the determination was withdrawn from the signed report |
| Profile: demographic data held | Which § 5-302(b) basis you rely on, and when that basis expires | § 5-302(a) requires historical data; § 5-302(b) permits test data where historical data is insufficient for a statistically significant audit | "We don't have breakdowns" means two different things: you hold nothing, or you hold it unseparated. One engagement read it the wrong way and never resolved it before signing. Sex-held-but-not-race is the common case and produces a split basis: sex-only records never end a race-attribute basis however far their volume grows |
| Profile: independence | Whether this result can be called an audit | § 5-300 requires an independent auditor: no financial interest in the tool, no part in developing it | A test you run on yourself is not an LL 144 bias audit at any level of quality. This module will not say it is. What a self-run does do is tell you what an independent audit would find before you pay for one |
| Run: cutoff applied by | Which statutory branch governs and which figure is computed | Platform → § 5-301(b), selection rate. Person → § 5-301(c), scoring rate | One client's own team gave both answers minutes apart. Another returned 5,000 rows with the decision column entirely blank, which settled it as a scoring rate after the corpus was already built. If automation is planned but not live, say so: the result then carries a dated scope statement and expires when the feature ships |
| Run: knockout | What your selection rate is actually measuring | Not a statutory item; it determines whether the rate conflates two mechanisms | One engagement asked four times and got the answer after shipping. A knockout on one criterion cut the usable sample from 5,000 to 3,000. If knocked-out candidates are pooled with low scorers, a ratio measures two different things at once |
| Run: pre-processing | Whether the audit covers what your tool actually scores | Not a statutory item; it bounds what the result may claim | One client volunteered that evaluation runs on extracted and normalised answers rather than on the submitted transcripts. The intermediate form was never seen, so the report had to disclose that the scored input was not the submitted input. It remained the largest open gap in that audit |
| Job description choice | What the corpus contains evidence of, and which role the result describes | Under § 5-301 the audit attaches to the tool, not the position (FAQ III.4, confirmed at 20-871(a)(1)) | A sample for a junior hourly role was once used to reason about a senior role at four times the salary. The role tested is named in your result for exactly this reason |
| Criteria comparison | Whether the corpus exercises your configuration | Not a statutory item; it is a validity check | One platform generated five criteria where eight had been reconstructed from the same job description. The qualification gradient lost its top rung, because the only criterion separating a solid candidate from a strong one was not among the five |
| Data upload | Whether figures can be produced at all | § 5-301(d) permits excluding a category under 2% of the data | A demographic column that is mostly blank cannot produce a ratio at any volume. Three distinct score levels made a median land on the modal value, so counting strictly above it gave every group a rate of zero |
| Results | What the numbers mean and what they do not | § 5-301(c) requires the median, per-category scoring rates and impact ratios, and the mandatory intersectional sex × race/ethnicity analysis | **0.80 is the EEOC four-fifths convention and this statute does not adopt it.** There is no pass mark in LL 144 and no pass or fail. A ratio below 0.80 is a number to report and investigate. The intersectional analysis is the requirement most often skipped by anyone working from the four-fifths rule rather than the rule text |
| Results: data quality | Whether to trust the figures above | Not a statutory item | A clean ratio from a badly built dataset is more dangerous than a flagged one, because nobody looks twice. One corpus assigned demographics in contiguous blocks and returned 0.9770 on sex precisely because that attribute was the most perfectly blocked: a two-block split averages position effects over half the data each and they cancel |
| Stance | What you can and cannot say about this result | § 5-300, § 5-303 | This document is not an LL 144 bias audit and does not satisfy any publication duty. What it is: a record of what your platform did on a named role, what you have established, and what an independent auditor would still need |
| Expiry | When this result stops describing your platform | § 5-301(a) is the only re-audit trigger in the rule: more than one year since the most recent audit | The rule contains no trigger for a change of role, configuration, weighting or model. A prior report cited § 5-301(a) for re-audit triggers it does not contain and the claim was withdrawn. Your test-data basis expires separately and on its own condition, which may fire well before a year |

### Constraints on the content

- **Anonymous.** No client is named on any page. The failures are real and the attribution is
  removed, matching the existing internal question bank: "No client is named here, and none
  should be added."
- **Cited or marked.** Every statutory claim carries its section. Anything that is a convention
  says so. The record contains a case where § 5-301(a) was cited for a proposition it does not
  contain, and the resulting table had to be deleted from a signed report.
- **No instruction on their obligations.** The module explains what the law says and leaves the
  customer's duties to their counsel. One engagement's redlines characterised the opposite as
  "legal advice that is unhelpful, counter to our goals, and incorrect", and the client was
  right: § 5-303 duties belong to the deploying employer, so advice about them in a vendor's
  document is advice to nobody in the room.
- **Tested.** The forbidden-vocabulary lint runs over education content as well as generated
  output. A statutory reference appearing in education content must exist in the citation table
  in this spec, asserted by test, so a reference cannot drift.

## Testing

| Layer | Approach |
| --- | --- |
| Ported engine | Differential against the Python on a shared fixture set; byte-identical table output required per function before it ships. Median convention (`>=` vs `>`) pinned explicitly. |
| Readiness score | Table-driven: every veto state, don't-know, not-applicable, short-circuit. |
| Answer gates | Table-driven, one case per gate condition. |
| Data gates | Fixtures per hard stop and per warning, including a deliberately block-ordered dataset that the ID-order check must reject. |
| ID-order check | Unequal group sizes, to pin the general expected-runs formula. A correct interleave must pass. |
| Criteria comparison | Close match, material divergence, not supplied. |
| Generation | The ID-order gate runs on output and must fail a `zip`-built corpus. Model-set recording asserted against a mixed-model response fixture. |
| Stance | Section-list checker; forbidden-vocabulary lint; immutability (a second generate inserts a version rather than updating). |
| Tenancy | Isolation matrix per `docs/technical/security/tenant-isolation.md`. |

A test suite that reports success while verifying nothing is a known failure here: a prior
package's `testpaths` pointed at an empty directory. CI must assert a non-zero test count.

## Migrations

1. Four tables with `organization_id` and the partial unique index.
2. The `enum_files_source` addition, with a no-op down.

Following `Servers/database/migrations/` conventions and the timestamp-prefix naming.

## Open questions

1. **Does `out_of_scope` produce a PDF? Resolved: yes.** A customer who establishes that their
   tool is one input among several has a useful document to hold, and withholding it would make
   the favourable outcome feel like a failed run. Constraints: the document states the
   determination is the customer's own, quoted, with the date and the person who attested it;
   it names the § 5-300 limb relied on; it states that the determination was not verified by
   VerifyWise and that a change in how the output is used may bring the tool into scope. It
   carries no ratios and no readiness score, because neither was computed. It must not read as
   a clearance: the heading is "Scope determination", not "Result".

2. **Who may attest? Resolved: Admin only, and the attesting user is named in the stance.**
   The four vetoes are legal determinations about the customer's own position, not analyst work.
   **Admin (1) or Editor (3) may draft** answers; Reviewer (2) and Auditor (4) are read-only
   here. Attestation moves the profile from `draft` to `attested` and is **restricted to
   Admin**. The stance prints the attesting user and date beside each veto answer.

   The record's argument is specific: on one engagement the compliance owner who later sent 51
   deletions across three documents had never been in a conversation with us. The person who
   can overturn a determination should be the person who made it.
3. **Renewal notifications.** Display-only in v1. Wiring the existing BullMQ notifications is a
   follow-up, and the trigger must be basis-derived rather than a 365-day countdown.
4. **Corpus retention.** A generated corpus is synthetic and carries no real applicant data, so
   retaining it is safe and aids reproducibility. Retention period unspecified.
5. **Whether the 17 other presets get question sets.** The schema is framework-driven and several
   (Colorado SB205, Illinois HB3773, Texas TRAIGA, California FEHA) have structurally similar
   scope questions. Out of scope for v1; the seam exists.

## Success criteria

- A vendor can answer the profile questions, generate a corpus against a fixed JD, score it on
  their own platform, upload the results and obtain a stance.
- A customer whose tool is one factor among several reaches a clear out-of-scope stance without
  generating anything.
- A customer holding no demographic data reaches a stance that names their § 5-302(b) basis and
  its expiry trigger.
- Unanswered veto questions produce no score and no figures.
- A block-ordered dataset is rejected before any ratio is shown.
- A three-level score column produces a warning before a run rather than a degenerate rate after.
- No generated output contains "compliant" or any forbidden term, asserted by test.
- Every ported engine function reproduces the Python's output on the fixture set.
- A stance PDF is hashed, immutable, and regeneration produces a new version.
- Every customer-facing page carries its three education elements, and every statutory reference
  in that content resolves to the citation table in this spec, asserted by test.
- A customer reading only the page, with no prior LL 144 knowledge, can state why 0.80 is not a
  pass mark and which party carries the publication duty.
