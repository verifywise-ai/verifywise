# Reporting AI insights: depth rework

**Date:** 2026-07-22
**Status:** Approved design, ready for implementation planning
**Area:** `Servers/services/reporting/analyzers/`, `Servers/services/reporting/dataCollector.ts`, `Servers/advisor/llmSelfCorrect.ts`, PDF/DOCX renderers

---

## Problem

The AI insight blocks in generated reports read as generic and repetitive. Four distinct
complaints, all confirmed against live data:

1. The prose restates data that already appears in the report tables.
2. The prose is boilerplate that would fit any organization on any framework.
3. Insights never connect one section to another.
4. Insights are short and stop before reaching a root cause or a justification.

### Evidence

From `verifywise.report_run_analyses` on the development database (17 rows, 3 report runs,
model `deepseek-v4-flash`):

- Run 2's `executiveSummary` (id=8) shares **86.8% of its characters** with
  `sectionSummaries.policyManager` (id=7), including one contiguous **791-character identical
  block**. The only edit within the first 40 characters is `comprises` → `consists of`.
- The source section summary was truncated mid-sentence at 997 characters; the executive
  summary silently finished the sentence for it.
- In run 2 exactly one section summary existed, so the entire report narrative — one executive
  summary, five findings, four actions — is a rewrite of a single truncated 135-word paragraph
  about policies. `clausesAndAnnexes`, the core of an ISO 42001 report, never reached any
  headline block.
- Across all 17 rows there is **not one percentage, not one date, not one score and not one
  control identifier**. Only counts copied verbatim from the input.
- Severity is uncalibrated: run 3 rates "20 of 22 training records are demo-seed" as
  **critical** while "all 25 models are owned by one person" is **medium**, in the same run
  whose executive summary calls the latter a single point of failure.
- All nine recommended actions across the corpus have `suggestedOwner: null`.
- `riskAnalysis` and `vendorRisk` abstained in both runs that requested them, with
  `attempts: 0` and the canned reason `"insufficient data for this section"`.

### Root causes, ranked

| # | Cause | Share of symptom |
|---|-------|------------------|
| 1 | Stage 2 never sees data. `executiveSummary`, `keyFindings` and `recommendedActions` share one `buildUserPrompt` that passes only Stage-1 prose (`registry.ts:80-119`). With no number, identifier, date, owner or status left in the input, the only available operation is re-wording. | ~45% |
| 2 | The one analytic prompt in the product asks for a summary, not an analysis. `sectionSummaries.ts:40-53` is a single generic instruction reused verbatim for all 12 section types, capped at `maxOutputTokens: 500` against a "150-250 words" ask. | ~20% |
| 3 | `GROUNDING_RULES` reads as a ban on arithmetic: "Never introduce a fact, name, number … that does not appear in it" (`prompts.ts:158-165`). Taken literally this forbids ratios, percentages and date comparisons. The corpus confirms the model obeyed. | ~10% |
| 4 | No rubric, no calibration anchors, no counterfactual, no worked example. The severity enum carries a vocabulary note and nothing else (`schemas.ts:19-23`). | ~8% |
| 5 | The executive-summary prompt is itself the boilerplate: a fixed four-part outline (`registry.ts:92`) that both live runs reproduce in order. The framework name never reaches the instruction, only the header. | ~7% |
| 6 | No temporal frame. `metadata.generatedAt` exists but reaches no analyzer, so surviving dates are inert. No code reads a prior run's analyses back. Every report is written as if it were the first. | ~5% |
| 7 | The collector strips specificity, and four column reads are wrong. `dataCollector.ts:829` reads `mr.mitigation_status`, a column that does not exist on `verifywise.model_risks` — every model risk in every report is literally `"Unknown"`. | ~5% |
| 8 | Nothing detects shallow output. Self-correction fires only on `ZodError`; the 791-character duplication passed every gate. | ~4% |
| 9 | Sections are analysed as islands. No prompt in the pipeline holds two sections' data at once, and none asks for a relationship. | ~4% |
| 10 | Output caps force one-sentence assertions: finding text, action, rationale, gap and concern are all `max(300)`. | ~2% |

For contrast, `Servers/advisor/evidenceAnalyzer/prompts.ts:21-216` in this same repository is a
9,571-character prompt with a 5×5 rubric, 25 written grade anchors, explicit anti-inflation
discipline, three worked examples and a counterfactual requirement. The reporting analyzers get
`GROUNDING_RULES` (760 characters) plus one to three sentences each.

---

## Goals

- Insights cite specific values: counts, ratios, dates, identifiers, owners.
- Insights are recognisably about *this* organization and *this* framework.
- At least the executive summary and key findings can relate one section to another.
- Depth is visible to the reader, not merely present in the stored payload.
- Shallowness is detectable in code, so "deeper" is measurable rather than a matter of taste.

## Non-goals

- Loosening the anti-fabrication guarantee. This is a regulator-facing artifact.
- Reducing LLM cost. Quality is the priority; cost is not a constraint for this work.
- A new AI block, a new report section, or any change to the seven-block template contract.
- Changes to the readiness calculator, the evidence-gap query, or any other upstream producer.

## Decisions taken during design

- **Approach:** deterministic facts substrate plus cross-section correlation, rather than either
  prompt-only tuning or a collapse of the pipeline into one wide synthesis call. Collapsing was
  rejected because it makes one LLM call a single point of failure against the standing invariant
  that analyzers must not become ways to lose a report.
- **No new analyzer block.** Correlation requires one prompt to hold every section at once; it
  does not require a new block. The facts substrate is whole-estate by construction, so feeding
  it to the existing `executiveSummary` and `keyFindings` analyzers achieves the same thing with
  no migration, no eighth `ai_block`, and no change to the frontend block count (pinned at 7 in
  three test files).
- **Inference is permitted but labelled.** The model may reason beyond what the data literally
  states, provided every claim declares its basis. The verbatim provenance guard is unchanged.

---

## Design

### §1 Facts substrate

New file: `Servers/services/reporting/analyzers/facts.ts`. A pure function, no LLM, no database.

```
buildFacts(reportData: ReportData): string
```

Renders a compact, whole-estate block containing:

- The reference date, from `reportData.metadata.generatedAt` (interface line 22; the field
  already exists and is currently unused by every analyzer).
- The framework name and subject, as today's `header()` provides.
- Per-section aggregates that already sit on the section objects: `totalRisks`,
  `overallProgress`, `totalControls`, `completedControls`, and the equivalents on each other
  section.
- The three rollups in `reportData.charts` — `riskDistribution`, `complianceProgress`,
  `assessmentStatus` — which `dataCollector.collectChartData` already computes (line 111) and
  which are currently discarded before any analyzer runs. No recomputation.
- Per-section top-N items ranked by materiality (severity, then due date), with the ranking
  applied *before* truncation.
- Explicit truncation counts for every array that was cut.

Budget: approximately 1,000–2,000 characters against the existing `MAX_PROMPT_CHARS` budget of
60,000. This is an order of magnitude cheaper than passing raw sections, which is the cost
argument the two-stage design exists to satisfy.

Because the block is deterministic it cannot be hallucinated, and because it names identifiers it
*strengthens* `sanitizeProvenance`: control ids and vendor names the model cites are now present
in the prompt it is checked against, where today they are dropped for being absent.

### §2 Cross-section correlation

`AnalyzerExtras` (`registry.ts:39-53`) gains a `facts?: string` field, populated by
`collectAnalyzerInputs.ts`.

`executiveSummary` and `keyFindings` change their `buildUserPrompt` from
`header + renderSummaries(summaries)` to `header + facts + renderSummaries(summaries)`.
`recommendedActions` receives the same. Since the facts block covers every section at once, a
single prompt now holds the whole estate and a relationship between sections becomes expressible.

`keyFindingsSchema` gains `related_sections: string[]` (may be empty) on each finding, so a
finding that spans sections can say which ones.

The three raw-section analyzers (`riskAnalysis`, `complianceGap`, `vendorRisk`) also receive the
facts block, since aggregates are exactly what they currently lack.

### §3 Prompt rewrite

**`GROUNDING_RULES` (`prompts.ts:158-165`)** gains an arithmetic carve-out, stated positively:
computing ratios, percentages, counts and differences over supplied values is permitted and
encouraged, as is comparing supplied dates against the supplied reference date. Introducing a
value that is neither supplied nor derivable from supplied values remains a serious defect.

**Section-type instruction bodies.** A `Record<string, string>` beside `SECTION_LABELS` giving
each of the 12 section keys its own analytic questions in place of today's shared four moves.
All 12 keys get one; three are given here as the pattern, and the implementation plan must
enumerate the remaining nine.

- `projectRisks` / `vendorRisks` / `modelRisks`: unmitigated high and critical items, ownerless
  rows, level distribution against raw count.
- `policyManager`: draft-versus-approved ratio, review dates against the reference date.
- `compliance`: the weakest control family, by completion rate within category.

A key with no body falls back to the current generic text rather than failing, so an unmapped
section degrades to today's behaviour instead of losing its summary.

**Executive summary instruction (`registry.ts:92`).** The fixed four-part outline is replaced by
a required lead — open with the single most consequential finding and the evidence supporting it
— letting structure follow content. The framework name moves into the instruction body, not just
the header, so the output stops saying "the framework's requirements".

### §4 Provenance labelling

Each row-level object in `keyFindings.findings`, `recommendedActions.actions`,
`complianceGap.gaps` and `vendorRisk.concerns` gains:

```
basis: "observed" | "inferred" | "absent"
```

- `observed` — the claim is stated directly by the supplied data.
- `inferred` — the claim follows from supplied data by reasoning the data does not state.
- `absent` — the claim is that something required is missing from the data.

**`sanitizeProvenance` is unchanged.** The label describes the *claim*; it does not relax the
requirement that the row's *subject* (`gaps[].control`, `concerns[].vendor`,
`top_risks[].name`) appear verbatim in that analyzer's own prompt. `sanitizeOwners` is likewise
unchanged, and any new person-valued field would need the same treatment.

### §5 Calibration and counterfactual

- Written severity and priority anchors in the `.describe()` text of `schemas.ts`, in the style
  of `evidenceAnalyzer/prompts.ts` but smaller: one sentence per level saying what distinguishes
  it from the level below, plus an anti-inflation rule (when between two levels, choose the
  lower).
- A `what_would_close_this: string` field on findings and gaps: what specifically would have to
  be true for this item to no longer be a finding. This is the counterfactual requirement that
  the evidence analyzer already uses to force analysis over description.

### §6 Shallowness gate

In `runAnalyzers.ts`, after a payload validates and before it is returned: compute the trigram
Jaccard similarity between the analyzer's prose output and its own prompt input. Above a
threshold, re-issue the call once with an explicit directive stating that the previous attempt
restated its input.

- Initial threshold: **0.5**. Run 2's failure sat at 86.8% character overlap, so 0.5 catches it
  with margin. The constant is exported and commented as a calibration knob; it is expected to
  need tuning against real corpora, and it is the one number in this design that cannot be
  derived from first principles.
- Applies to the prose fields only (`summary`, `narrative`), not to structured arrays.
- On a second failure the payload is kept as-is. The gate must never convert a produced analysis
  into a lost one.

This gate is the measurable definition of "deeper" for this work, and doubles as the regression
test for every other section of this design.

### §7 Per-attempt timeout

`runAnalyzers.ts:212` constructs `AbortSignal.timeout(30_000)` once and passes it through
`params.extra`, which `llmSelfCorrect.ts:253` spreads inside the retry loop. The same signal
object therefore covers the first attempt and every self-correction attempt, so a deeper call
that takes longer aborts and degrades into a generic abstention: depth silently converts to data
loss.

Fix at the shared function, not the caller. `SelfCorrectingParams` gains an optional
`timeoutMs: number`; `generateObjectWithSelfCorrection` constructs a fresh
`AbortSignal.timeout(timeoutMs)` inside the loop for each attempt. Reporting passes
`timeoutMs: 60_000` instead of `extra.abortSignal`, doubling today's shared 30-second budget and
giving each attempt its own. When `timeoutMs` is absent the behaviour is unchanged, so the
evidence analyzer, control matcher and planner keep working untouched and gain the per-attempt
correction only when they opt in.

### §8 Output caps

- `sectionSummaries.ts:58`: `maxOutputTokens` 500 → 900, and the "150-250 words" ask raised to
  match. Add a `finishReason === "length"` check that logs a warning — this is what truncated
  run 2 mid-sentence, unnoticed.
- Structured analyzers currently pass no `maxOutputTokens` at all; pass `2000` explicitly so the
  budget is stated rather than inherited from whatever the provider defaults to.
- Raise the `max(300)` caps on finding text, action, rationale, gap and concern to `600`. A
  300-character action cannot carry a mechanism, an owner, a date and an expected effect at once,
  which is precisely the shape that produces "review and update the X policy" every run. The
  prose caps (`summary` 3500, the three `narrative` fields 2500) stay as they are — those are not
  what is binding.

### §9 Collector corrections

In `Servers/services/reporting/dataCollector.ts`:

- Line 829: `mr.mitigation_status` does not exist on `verifywise.model_risks`. Read `status`, and
  surface `mitigation_plan`, `target_date`, `impact` and `likelihood` — all four are already
  fetched by the `SELECT mr.*` on lines 796 and 806 and then discarded in the map.
- Line 622: `c.owner_name` against a control object that carries a numeric `owner`. Resolve or
  drop the field rather than emitting `undefined` for every control.
- Line 604: `categoryName` is computed and then dropped at lines 616-623. Keep it — control
  family is exactly the grouping the compliance analysis needs.
- Add control `due_date` to the compliance mapping.

In `Servers/services/reporting/analyzers/prompts.ts`:

- `truncateArray` (lines 34-37) drops items silently while its sibling `truncateWithStamp` stamps
  a `showing N of M` marker. Give `truncateArray` the same stamp; silent truncation reads to the
  model as a complete set.
- Rank before truncating. The underlying queries order by `id ASC` or `name ASC`, so today the
  model reviews the oldest 50 rows and writes confident prose about "the inventory".

### §10 Prior-run comparison

Write the facts block into `report_run_analyses.audit_metadata` (unconstrained JSONB, no
migration needed). On the next run for the same schedule, read the most recent prior facts block
and compute a numeric diff in TypeScript. Hand the diff to the analyzers as part of the facts
substrate.

One extra query, zero extra LLM calls. This is the only fix for the case where two monthly
reports on a stable organization are obliged to say the same thing.

### §11 Render

`mapAnalysesToSummaries` already forwards `riskAnalysis` whole, including `top_risks`; the loss
is in the renderers, which ignore it. Both renderers must be changed together or the two output
formats diverge.

- `Servers/domain.layer/interfaces/i.reportGeneration.ts` — extend `AISummaries` with the new
  fields. All additions optional, so hand-built fixtures keep compiling.
- `mapToSummaries.ts:37-52` — stop flattening findings to bare strings; carry `severity`,
  `section`, `related_sections`, `basis` and `what_would_close_this`.
- `report-pdf.ejs` and `docxGenerator.ts` — render the `top_risks` table (currently rendered
  nowhere), severity on findings, rationale on actions, the `basis` label, the counterfactual,
  and `abstain_reason`, which today has no document surface at all so an abstention is silent.
- No markdown renderer exists on any surface; asterisks render literally. Keep prose plain.
- `page-break-inside: avoid` wraps whole AI blocks. Substantially longer prose repaginates badly;
  the wrapping needs to move to a finer granularity.

### §12 Versioning and documentation

- `ANALYZER_VERSION` in `prompts.ts:9`: `report-analyzer-v1` → `report-analyzer-v2`. It is
  stamped into `audit_metadata` and must be bumped on any prompt or schema change, so stored
  analyses stay traceable to the prompt that produced them.
- Update `docs/technical/domains/reporting.md` (the AI analyzer section, lines 200-241).
- Update `Servers/CLAUDE.md` and root `CLAUDE.md` "Last Updated" if either is touched.

---

## Invariants that must not break

1. **Anti-fabrication.** `sanitizeProvenance` continues to drop any `gaps[].control`,
   `concerns[].vendor` or `top_risks[].name` that is not a case-insensitive substring of that
   analyzer's own prompt. Guarded fields stay non-nullable strings. A synthesized cross-section
   theme carrying a newly-invented label would be dropped by this guard, which is why themes are
   expressed through `related_sections` (section keys, which are always present in the prompt)
   rather than through free-text labels.
2. **Owner sanitisation.** `sanitizeOwners` continues to null any `suggestedOwner` outside
   `allowedOwners`. Additionally, `collectAllowedOwners` must start harvesting `sections.models`,
   which it currently omits — the reason every action in the live corpus has a null owner.
3. **Failure isolation.** `Promise.allSettled` per stage; a failing analyzer abstains rather than
   failing the run. The shallowness gate must degrade to keeping the original payload.
4. **Honest abstention.** Making analyzers try harder must not convert an honest abstention into
   padding. Abstention stays cheap and reachable.
5. **No database migration.** `report_run_analyses.payload` and `audit_metadata` are unconstrained
   JSONB. `section_key` stays within `VARCHAR(50)`, and `(report_run_id, section_key,
   organization_id)` stays unique — one payload row per section per run.

---

## Test tripwires

These will fire by design. Each must be updated deliberately, not silenced.

| File | What it pins |
|------|--------------|
| `analyzers/__tests__/payloadShape.test.ts:20-27` | Exact sorted top-level key set of all six schemas. Any field addition fails it. |
| `analyzers/__tests__/registry.test.ts` | Exactly 6 analyzers; `ANALYZER_VERSION` matching `/^report-analyzer-v\d+$/`; `SECTION_LABELS` exactly 12 entries; the full truncation contract including exact `showing N of M` stamps and body under 60,200 characters. |
| `analyzers/__tests__/sectionSummaries.test.ts:45-54` | Five literal prompt substrings, including `'150-250 words'`. |
| `analyzers/__tests__/runAnalyzers.test.ts` | Three abstain strings, verbatim. |
| `analyzers/__tests__/schemas.test.ts:12-71` | Literal fixtures. Zod `.nullable()` is not `.optional()`, so a required-but-nullable new field breaks every fixture here and in both renderer suites. |

Frontend files pinning **7** `ai_blocks` — `ConfigureReportWizard.test.tsx`,
`TemplateBuilder.test.tsx`, `reportTemplateResolver.test.ts` — are **not** touched by this design.
If any of them fails, a new block has crept in and the change is out of scope.

---

## Success criteria

Verifiable, in order:

1. `cd Servers && npm run build` succeeds.
2. `cd Servers && npm run test:unit` passes, with every tripwire above updated deliberately.
3. A new report run against the development database produces analyses that contain at least one
   percentage or ratio, at least one date comparison against the reference date, and at least one
   verbatim control or vendor identifier — none of which appear anywhere in the current 17-row
   corpus.
4. The shallowness gate reports below-threshold overlap for the executive summary against its
   input on that run.
5. `riskAnalysis` and `vendorRisk` produce prose rather than abstaining, on a run where the
   corresponding sections carry data.
6. The generated PDF and DOCX both show the `top_risks` table, finding severities, action
   rationales and any abstention reason.

---

## Phasing

Each phase is independently shippable and leaves the system working.

| Phase | Contents | Rationale |
|-------|----------|-----------|
| 1 | §9 collector corrections, §7 per-attempt timeout | Bug fixes. Everything downstream reasons over this data, and a shared timeout that eats retries will mask later work. |
| 2 | §1 facts substrate, §2 correlation wiring, §3 prompt rewrite | The 45% + 20% + 10% causes. Largest single quality gain. |
| 3 | §4 provenance labels, §5 calibration and counterfactual, §8 output caps | Schema changes. Grouped so the payload shape moves once. |
| 4 | §6 shallowness gate | Needs phases 2 and 3 in place to calibrate its threshold against real output. |
| 5 | §11 render, §12 version and docs | Makes the depth visible. Last because the payload shape must be settled first. |
| 6 | §10 prior-run comparison | Independent, and the only phase whose value cannot be observed on a single run. |
