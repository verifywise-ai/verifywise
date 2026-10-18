# Bias audit module

Self-service LL 144 module. It has two layers:

- **The pure core**: `engine/`, `index.ts`, `dataGates.ts`, `idOrderCheck.ts`,
  `datasetParser.ts`, `applicability.ts`, `answerGates.ts`, `readinessScore.ts`,
  `deriveBasis.ts`, `profileDecision.ts`, `trendSeries.ts`, `jobDescription.ts`, and in
  `stance/`, `compose.ts`, `sectionChecker.ts`, `vocabulary.ts` and `labels.ts`. It imports
  nothing from outside this directory and `structures/NYC-Local-Law-144/`, and performs no I/O.
- **The I/O layer**: `profileService.ts`, `runService.ts`, `stanceService.ts`,
  `serviceHelpers.ts`, `projectAccess.ts` and `stance/render.ts`. These read and write the
  module's own tables, read `projects`, `projects_members` and `users` (project access and
  attribution names), render the stance PDF, store it as a `files` row and read that row back
  to serve the download (410 when it is gone). Each is listed by exact path, with its reason,
  in `__tests__/moduleIndependence.test.ts`.

Neither layer imports from EvalServer, AIGateway or another VerifyWise module's services
(`__tests__/moduleRules.test.ts`, `__tests__/moduleIndependence.test.ts`).

## Entry point

```ts
import { runAudit } from "./services/biasAudit";

const outcome = runAudit(records, config);
// order-checks every category in config.categories; pass a list to narrow it
// outcome.gates   — findings, and whether ratios/PDF are permitted
// outcome.order   — per-attribute run-count findings
// outcome.result  — null when a hard stop fired
```

Records arrive with canonical keys (`RECORD_KEYS`: `selected`, `score`, `prediction`,
`ground_truth`, plus one key per protected category). The dataset parser maps uploaded columns
onto them before anything here runs; the engine and the gates read the same keys.

Gate findings carry one of three severities. A `stop` means no figures are produced. A `warn`
allows the in-app view but withholds the PDF. A `note` withholds nothing: it reports a fact the
result must carry, such as the § 5-301(c) count of records in an unknown category, which
`runAudit` also passes to the engine. Clustered ID-order findings join the same list as `warn`.

## Structure

| File                          | Responsibility                                                       |
| ----------------------------- | -------------------------------------------------------------------- |
| `engine/categoryTable.ts`     | Rates and impact ratios for one category                             |
| `engine/intersectional.ts`    | The mandatory sex × race/ethnicity cells, § 5-301(c)                 |
| `engine/impactRatios.ts`      | Exclusion, ratio and flag pass shared by both tables                 |
| `engine/scoringRate.ts`       | The § 5-301(c) median rule, plus degenerate-median detection         |
| `engine/fairnessMetrics.ts`   | Confusion-matrix metrics                                             |
| `engine/scoreDistribution.ts` | Per-group distributions                                              |
| `engine/round.ts`             | Python-compatible round half to even                                 |
| `engine/recordKeys.ts`        | The canonical record keys                                            |
| `engine/groupValue.ts`        | The one definition of a blank demographic value                      |
| `engine/index.ts`             | `computeBiasAudit`                                                   |
| `dataGates.ts`                | Input validation: stops, PDF-gating warnings, and notes              |
| `idOrderCheck.ts`             | Run-count test on input ordering                                     |
| `index.ts`                    | `runAudit`: gate, then compute; clustered ordering withholds the PDF |
| `datasetParser.ts`            | CSV upload and column mapping onto the canonical keys                |
| `applicability.ts`            | Which questions apply, given the answers so far                      |
| `answerGates.ts`              | What the answers allow: ratios, scoring rate, stance, generation     |
| `readinessScore.ts`           | Readiness score and open items                                       |
| `deriveBasis.ts`              | The per-category § 5-302(b) basis and its expiry triggers            |
| `profileDecision.ts`          | Readiness and metric from the attested answers                       |
| `trendSeries.ts`              | Lowest ratio per run, segmented at configuration changes             |
| `jobDescription.ts`           | The job title tested, as the key a run stores                        |
| `stance/compose.ts`           | The stance document model and its section lists                      |
| `stance/render.ts`            | HTML and PDF rendering behind the export gate                        |
| `stance/sectionChecker.ts`    | Required sections, read from the rendered HTML                       |
| `stance/vocabulary.ts`        | The forbidden-word list and its matcher                              |
| `stance/labels.ts`            | Readable labels for presets, metrics and blank fields                |

The question set is `Servers/structures/NYC-Local-Law-144/intake.questions.ts`
(`LL144_QUESTION_SET_VERSION`); the stance template is `Servers/templates/biasAudit/stance.ejs`.

## Question tiers

Thirteen questions, each with a `scope` (`profile` or `run`) and a `weight`.

- **Tier 1, vetoes** (`VETO_KEYS`): `role.party`, `scope.weighting`, `independence.auditor`,
  `data.held`. A veto without a usable answer blocks ratios, the scoring rate, generation and
  the stance, and readiness shows no score at all rather than a low one.
- **Tier 2, asked with the consequence stated in advance.** An option may carry a
  `consequence`, shown before the customer answers, and `emits`, the text the stance carries
  (`limitation`, `scope_note`, `blank_field`, `metric_forced`). Weights are `high` (2),
  `standard` (1) and `low` (0.5). Every tier-2 question applies unless the tool is out of
  scope: it applies while `scope.weighting` is unanswered or answered with anything other than
  `one_of_several`. `cutoff.planned` and `threshold.operational` also need
  `cutoff.applied_by` to be `person`.

A "don't know" is not a usable answer. For four questions it emits a "not established"
limitation in place of an option's text.

## Answer gates and readiness

`runAnswerGates` separates a gate on one deliverable from a gate on everything:

| Unanswered, when it applies | Blocks                                   |
| --------------------------- | ---------------------------------------- |
| any veto                    | ratios, scoring rate, generation, stance |
| `data.basis`                | the stance only                          |
| `threshold.operational`     | the scoring rate only                    |
| `pipeline.input_form`       | generation only                          |

A question that does not apply never blocks. An `audio` input form also blocks generation. The
stance is withheld when every applicable non-veto answer given is a "don't know". The chosen
cutoff option's `metric_forced` consequence sets the run's metric.

`computeReadiness` scores earned weight over possible weight for the applicable non-veto
questions, as a whole percentage. Measured impact ratios are not an input. Every applicable
non-veto question without a usable answer is an open item. `one_of_several` makes the scope
`out_of_scope`, with no score.

## Runs and the basis-derived expiry

A run needs an attested profile for the project and framework, and takes the profile and
question-set versions from it. It is refused (409) when that profile is out of scope or its
cutoff answer does not establish the metric. When the answers withhold ratios or the scoring
rate, the run is stored with a `stop` finding and no result. The upload is hashed (SHA-256)
and not retained.

The upload may name the job description tested (`jobDescription`). `jobDescription.ts` stores
it in `job_description_key` as typed, apart from Unicode normalisation (NFC) and runs of
whitespace. A title over 64 characters (the column's width) or with no letter or digit is
refused (400), never cut; a blank one stores null. The stance prints it verbatim as the
customer's words, and leaves a field to complete when it is null.

`deriveBasis` combines `data.held` (per characteristic) with `data.basis` (for the run) into a
basis for sex, for race and ethnicity, and for the intersectional categories; the intersection
is historical only when both halves are. Each test-data basis carries an expiry trigger that
names only its own category; a historical or not-applicable basis carries none. A basis is
derived only when `data.held` and `data.basis` both have usable answers; otherwise the run
stores no basis and no expiry trigger, and confirming it answers 409. The derived basis is our
reading of the answers, so it is stored with `confirmed: false` until confirmed through
`POST /runs/:id/derived-basis/confirm`, which records who confirmed it and when.

Each run stores `expiry_date`, one year from the day it was recorded (UTC, § 5-301(a)), and
`expiry_trigger`, the distinct non-empty triggers joined, or null when there are none.

## The stance

A stance is generated from a run or, for a profile attested as out of scope, from the profile
alone. Generation needs the answer gates to allow a stance; a run stance also needs the run's
stored findings to be notes only (`mayExportStoredRun`). `persistStance` applies that export
gate before any database read. Each generation stores a new immutable version with the PDF's
SHA-256. Customer-authored text is quoted verbatim inside a marker the vocabulary lint skips;
every other rendered word is linted.

The section list is fixed by scope, and `compose.ts` builds the sections in this order. Before
the PDF is filed, `sectionChecker.ts` checks that every required section is present in the
rendered HTML; it does not check their order.

| Scope        | Sections, in order                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| in scope     | scope, party, readiness, basis, what_was_tested, results, open_items, independence, expiry, data_relied_on |
| out of scope | scope ("Scope determination"), party, open_items, expiry                                                   |
| undetermined | scope, party, open_items                                                                                   |

An in-scope stance's expiry section prints the run's expiry date and trigger. A scope
determination states that no basis expiry applies.

## The trend series

`buildTrendSeries` takes runs oldest first and plots, per run, the lowest impact ratio of any
non-excluded group, the category holding it, and whether any non-excluded group was flagged.

- **No point:** a run with no stored result, and a `fairness_metrics` run (it produces no
  impact ratio). Neither opens nor closes a segment, so the runs either side are compared
  directly.
- **A null-ratio point:** a selection or scoring run with no usable ratio. It shows as a gap
  inside its segment.
- **A caveat point:** a run whose stored findings would not allow export. Its ratio is shown
  with that caveat.
- **A break**, labelled with every reason, between consecutive plotted runs whose profile
  version, question-set version, job description (`job_description_key`, compared ignoring
  case, null counting as one value) or metric differ.

`GET /runs/trend` returns only the series, not the stored results. `GET /runs/:id` does return
the whole run row, `result_json` included.

## Endpoints

Mounted at `/api/bias-audit`, all behind `authenticateJWT`. Project-scoped calls check project
membership (`projectAccess.ts`) and answer 404 to a non-member. An organization Admin skips
the membership check and reaches every project in the organization. SuperAdmin gets no such
bypass, unlike project files (`canUserAccessFile`). `GET /stances/:id/download` applies the
same rule in its own query (`getStanceDownloadQuery`), so having generated a stance gives no
access once the user leaves the project.

| Method and path                                 | Permission         |
| ----------------------------------------------- | ------------------ |
| `GET /questions/:frameworkId`                   | `biasAudit.read`   |
| `GET /profiles/:projectId/:frameworkId`         | `biasAudit.read`   |
| `PUT /profiles/:projectId/:frameworkId`         | `biasAudit.edit`   |
| `POST /profiles/:projectId/:frameworkId/attest` | `biasAudit.attest` |
| `POST /profiles/:projectId/:frameworkId/stance` | `biasAudit.edit`   |
| `POST /runs` (CSV upload)                       | `biasAudit.edit`   |
| `GET /runs?projectId=&frameworkId=`             | `biasAudit.read`   |
| `GET /runs/trend?projectId=&frameworkId=`       | `biasAudit.read`   |
| `GET /runs/:id`                                 | `biasAudit.read`   |
| `POST /runs/:id/derived-basis/confirm`          | `biasAudit.attest` |
| `POST /runs/:id/stance`                         | `biasAudit.edit`   |
| `GET /stances/:id/download`                     | `biasAudit.read`   |

## The oracle

`engine/__fixtures__/expected.json` holds EvalServer's Python output for twelve cases,
generated once on 2026-10-14. Every ported function is asserted against it. Nothing at
runtime or in CI touches Python; see the fixtures README before regenerating.

## Two behaviours worth knowing before you read the code

**0.80 is the EEOC four-fifths convention and LL 144 does not adopt it.** It is a parameter
with provenance. § 5-301(d)'s 2% exclusion is the statutory rule. The module computes both and
labels neither as a pass mark.

**A clean ratio is not reassurance.** Two checks exist for that reason: the degenerate-median
detector, because a score output with few levels can put the median on the modal value and
give every group a scoring rate of zero; and the ID-order check, because demographics assigned
in contiguous blocks can produce a finding that reflects how the data was assembled rather
than the tool.

## Verification

Every test command below must report a non-zero test count; a path that matches nothing is a
failure, not a success.

```bash
cd Servers
npm run test:unit -- services/biasAudit structures/NYC-Local-Law-144 \
  utils/biasAudit.utils.test.ts routes/__tests__/biasAudit.route.test.ts \
  controllers/__tests__/biasAudit.ctrl.test.ts
# Tenant-isolation registry coverage, no database. It sits under tests/integration/, which
# test:unit ignores, so run it by exact path after checking that --listTests lists only it.
npx jest tests/integration/tenant-isolation/tenantIsolation.coverage.test.ts \
  --testPathIgnorePatterns=/helpers/
npm run build && npm run lint && npm run check:api-drift && npm run format-check

cd ../Clients
npx vitest run src/presentation/pages/BiasAudit \
  src/infrastructure/api/__tests__/aedtBiasAuditService.test.ts
npm run typecheck && npm run lint && npm run i18n:audit:strict && npm run format-check
```

`npm run lint` must report no errors; existing warnings are not counted.
`__tests__/moduleRules.test.ts`, in the first command, also checks that the template literal
of every `sequelize.query` in `utils/biasAudit.utils.ts`, as written in the source, contains
`organization_id`. It is a substring test on unexpanded source: interpolated fragments such as
`${CITED_PROFILE_SQL}` count by name, not by the SQL they expand to, and a mention outside a
`WHERE` clause passes. The database-backed tenant checks
(`tests/integration/tenant-isolation/` under `npm run test:integration`, and
`scripts/auditTenantIsolationCoverage.ts`) need a database and are not in this list.

Independence from EvalServer: move `EvalServer/` out of the checkout, run
`npm run test:unit -- services/biasAudit` in `Servers`, and move it back whatever the result.
The suite must run a non-zero number of tests with no failures.
