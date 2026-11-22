# OSFI E-23 and model risk completeness report: design

> Date: 2026-11-22 · Status: draft for approval · Branch: `feature/e23-mrm-completeness-report`

## 1. Intent

OSFI Guideline E-23 expects a federally regulated financial institution to show how complete its model risk management program is. An institution using VerifyWise generates this report and hands it to an OSFI examiner or to its board.

VerifyWise already holds both halves of the answer, but nothing puts them side by side:

- **What the institution says it does.** Bundled framework 26 (`Servers/structures/OSFI-E-23/`) is a self-assessed checklist: 83 requirements in 16 groups (12 principles, plus "Model design", "Model approval", "Model decommission" and "Appendix 1"), each with a status, owner, reviewer, approver, due date, evidence files and linked risks.
- **What the institution actually does.** The MRM module (Model inventory → Model risk management) holds tiers, validations, findings, roles, thresholds and monitoring results per model.

The report puts them together, flags where the checklist claims something the model data contradicts, and ends with a fix-it list the MRM lead can work from.

## 2. Readers and what success looks like

- **Primary readers:** an OSFI examiner, or the institution's board. The report must read as formal and evidence-led: every number traceable to a record, every AI statement labelled, no claim VerifyWise cannot back.
- **Secondary reader:** the institution's MRM lead, who uses the fix-it list to close gaps before the report goes out.
- **Success:** a customer can generate the report from the Reporting page in a few minutes, a quarterly schedule produces it unattended with "what changed since last quarter", and an examiner reading it can see per principle what is claimed, what the data shows, and where the two disagree.

## 3. Goals, non-goals, anti-goals

**Goals**

1. Reports cover bundled frameworks (ids 5–28), not only ids 1–4. This lands first, as its own PR, and is useful on its own.
2. An "OSFI E-23 completeness" report on the Reporting page with: cover and scope, executive summary, E-23 program completeness by principle, MRM fleet status, contradictions, an E-23 gap analysis, a fix-it list, an optional model inventory appendix, limitations, and a sign-off page.
3. The wizard asks the customer for the details the database cannot know (period, institution, accountable executive, and so on) and remembers them for the next run.
4. An E-23-aware AI analysis that uses the organization's existing LLM key when one exists. Without a key the report still generates in full.
5. PDF and DOCX, run now or on a schedule, through the existing `report_runs` pipeline. Schedules today offer daily, weekly and monthly only; this work adds **quarterly** (see 8.1).

**Non-goals**

- French or other languages for report content (reports are English only today; wizard UI strings still get de/fr/es as usual).
- New model inventory fields (deployment date, data sources, approved uses, dependencies, third-party flag). The report states these are not tracked; adding them is a separate PR.
- Imported (Excel) frameworks in reports. They stay uncovered.
- A CSV export of the fix-it list.
- Replacing the existing MRM attestation DOCX (`GET /api/mrm/attestation/report`). It stays as is.
- Historical reconstruction. The report shows the state at generation time.

**Anti-goals (would make this a failure even if it works)**

- Any sentence that reads as an OSFI opinion, a certification or a compliance verdict. This is a self-assessment with supporting data.
- A gap or contradiction that the data does not support, or a missing field presented as a failure of the institution (a field VerifyWise does not track is "not tracked", never "missing").
- An empty section that looks like a clean result. Every empty section says why (existing `sectionNotices` mechanism).
- AI text that is not labelled as AI, or that names a requirement or model not present in the data.
- Operational failures (no LLM key, provider error) printed as findings about the institution.

## 4. Constraints

- House rules in `CLAUDE.md`, `Servers/CLAUDE.md`, `Clients/CLAUDE.md`, and `docs/technical/domains/reporting.md`, especially:
  - Both renderers (`templates/reports/report-pdf.ejs`, `services/reporting/docxGenerator.ts`) change together. Label maps are shared, not copied (`ANALYSIS_LABELS` precedent).
  - Report collectors are flat queries, never the screen loaders; no N+1 (reporting.md "Query cost").
  - Array predicates use `= ANY(ARRAY[:ids]::INTEGER[])` or `IN (:ids)`, never bare `ANY(:ids)`.
  - Every query is `organization_id`-scoped; tenant-isolation integration tests for new collectors.
  - New endpoints and changed contracts go under `/api/v1` (ADR 0001).
  - Bump `ANALYZER_VERSION` and `FACTS_SCHEMA_VERSION` when prompts, schemas or facts aggregates change.
- Screen text: sentence case, theme tokens, house components (`StandardModal`, `Field`, `Select`, `CustomizableButton`), new UI strings in de/fr/es.
- In-app user guide updated in the same PR and mirrored to the website.

## 5. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | Extend the MRM attestation DOCX in the MRM tab | Quick, but Word only, no templates, schedules, AI analysis or PDF, and it stays outside the Reporting page |
| **B (chosen)** | Build it inside the main Reporting pipeline | More work (two renderers, analyzer, wizard step), but PDF/DOCX, templates, schedules, run history, change-since-last-run and AI analysis come for free, and the bundled-framework fix helps 24 frameworks |
| C | Let the AI find contradictions with no fixed rules | Cheaper to build, but the results change run to run and are hard to defend to an examiner. Rejected in favour of fixed rules that the AI explains |

The user chose B.

## 6. Delivery: two PRs

**PR 1: bundled frameworks in reports.** Generic `frameworkRequirements` section. Fixes the limitation in `docs/technical/domains/compliance-frameworks.md#reporting-limitation`.

**PR 2: the E-23 report.** Everything else in this document, built on PR 1.

## 7. PR 1: `frameworkRequirements` section

**Data.** For every resolved target (`resolveFrameworkTargets`) whose `frameworkId` is a bundled framework in `Servers/structures` (ids 5–28), collect:

- the tree: L1 groups → L2 requirements (→ L3 where the structure has one), with `title`, `order_no`, and the impl row's `status`, `owner`, `reviewer`, `approver`, `due_date`;
- per impl row: evidence file count and file names (`file_entity_links` with the structure's `framework_type`, `entity_type`, `link_type = 'evidence'`, joined to `files` for the name), and linked risk count (the structure's `l2_risks`/`l3_risks` table, excluding deleted risks);
- owner/reviewer/approver display names (reuse `resolveUserNames`);
- rollups per group and per framework: total, done (`Implemented` or `Audited`, matching `addStatusCounts`), status breakdown, unassigned count, no-evidence count, overdue count (due date before generation date and not done).

Use flat queries per framework table set (struct join impl, one evidence aggregate, one risk aggregate), not `getFrameworkTreeQuery` per row. Pairings merge like the existing framework sections: a `useCase` label only when more than one pairing contributed.

**Catalog.** Add `{ key: "frameworkRequirements", label: "Framework requirements", group: "Compliance and governance" }`. It is framework-gated like `compliance`: with a framework selection, only selected bundled frameworks; with no selection, every bundled framework in scope. No matching target produces the existing `no_framework_target` notice.

**Render (PDF and DOCX).** Per framework: heading, one-line progress ("41 of 83 requirements implemented or audited"), the completeness-by-group bar chart (reuse `generateComplianceProgressChart`), then per group a table: requirement, status chip, owner, due date, evidence count. Evidence file names appear in a compact line under the row when present.

**Templates.** Existing system templates are unchanged. The section becomes selectable in templates and the wizard; the builder decides whether any existing system template should default it on.

**Analyzers.** `prepareSectionData` and `facts.ts` learn the new section so the existing summary, findings and compliance-gap analyzers can use it. Bump both version constants.

**Docs.** Update `reporting.md` (catalog, data sources, framework mapping), remove the limitation in `compliance-frameworks.md`.

## 8. PR 2: the E-23 report

### 8.0 How a run is recognised as an E-23 report

A template version declares `parameters_config.kind = "osfi_e23"` (see 8.1). That key, not the slug, drives everything specific to this report: the cover wording, Scope and method, limitations text, and which E-23 sections are offered. Duplicating a template must copy `parameters_config` along with the other version configs, so a copy of the E-23 template stays an E-23 report (the builder checks the duplicate path in `TemplatesTab.tsx` and its endpoint).

Catalog entries gain an optional `kinds` list. `mrmFleet`, `e23Contradictions`, `e23FixItList`, `mrmInventoryAppendix` and `signOff` carry `kinds: ["osfi_e23"]`: they are offered only in templates of that kind, and the server rejects them in any other request (including the legacy Generate page). `frameworkRequirements` has no `kinds` and is available everywhere.

### 8.1 Report details step (wizard)

A new "Report details" step in `ConfigureReportWizard`, shown only when the template version declares parameters. Fields for the E-23 template:

| Field | Type | Required | Default |
|---|---|---|---|
| Reporting period start | date | yes | day after the previous run's period end, else 3 months before end |
| Reporting period end (as-of date) | date | yes | today; must be ≥ start and ≤ today |
| Institution name | text, ≤ 200 | yes | organization name |
| Accountable executive: name, title | text, ≤ 200 each | yes | previous run |
| Head of model validation: name, title | text, ≤ 200 each | no | previous run |
| Prepared by: name, title | text, ≤ 200 each | yes | signed-in user's name |
| Audience | select: OSFI supervisory review / Board of directors | yes | OSFI supervisory review |
| Scope note | textarea, ≤ 1000 | no | previous run |

**Scheduled runs and the period.** A schedule never stores period dates. At run time the period ends the day before the run date and is one schedule interval long (quarterly: three months; monthly: one month; weekly: seven days; daily: one day). A customer whose fiscal quarter ends on 31 October schedules the quarterly run for 1 November, so no fiscal-calendar setting is needed. The schedule stores every other answer as fixed text, including "Prepared by" (defaulting to the schedule creator). Run now asks for the dates as in the table above.

**Quarterly frequency.** Add `quarterly` to `ReportFrequency` (`domain.layer/interfaces/i.reportTemplate.ts`), `scheduleCalculator.ts` (same day-of-month as monthly, every three months, same month-end clamping), server validation, and both frontend frequency lists (`ConfigureReportWizard.tsx`, `ScheduledReportsTab.tsx`), with a migration if the column is constrained. It is available to every template, not only E-23.

**Storage.**

- `report_template_versions.parameters_config JSONB NOT NULL DEFAULT '{}'` holds `kind` (8.0) and declares the fields (key, label, type, required, max length, select options). Generic, so later templates can use it; field types limited to text, textarea, date, select.
- `scheduled_reports.report_parameters JSONB` holds a schedule's answers.
- `report_runs.config_snapshot.report_parameters` records what each run used.
- "Remember for next time": the wizard prefills from the organization's most recent run of the same template (new endpoint under `/api/v1`, e.g. `GET /api/v1/report-templates/:id/last-parameters`, org-scoped).

**Validation.** Server-side against the declared config: required fields, lengths, date order, no future end date, select values from the list. Unknown keys rejected with 400 (same "reject, don't drop" rule as framework selection). Messages through `req.t`.

**Flow.** Controller → `sched` → `resolveReportRequest` → `ReportGenerationRequest.reportParameters` → `ReportData.metadata.reportParameters` → renderers.

### 8.2 What the period means

Data is a snapshot at generation time. The period only bounds activity counts: validations signed off, findings opened and closed, threshold breaches, and revalidation events within the period. The cover states both: "Position as at <generation date>. Activity counts cover <start> to <end>."

### 8.3 Report structure

In order. "Section key" is the catalog key where the part is a selectable section.

1. **Cover.** Institution name, "OSFI E-23 model risk management: completeness report", audience line ("Prepared for OSFI supervisory review" or "Prepared for the Board of directors"), period, as-of, prepared by, accountable executive. Branding as today.
2. **Scope and method.** Fixed text plus parameters: self-assessment statement, the two data sources and how each is collected, the scope note, the period rule from 8.2, how AI content is labelled, and the limitations (below). Always present in this template.
3. **At a glance** (always present in this template, no AI). Fixed figures: E-23 requirements implemented or audited (n of 83), groups checked against MRM data, contradiction rules fired (n of 13), models in scope, untiered, overdue validations, open critical/high findings, fix-it items by severity, and, when a previous run exists, the change since it. Gives the board a summary even without an LLM key.
4. **Executive summary** (existing AI block). Gets E-23 sections and facts as input. Absent without an LLM key, with the neutral "not produced" line.
5. **E-23 program completeness** (`frameworkRequirements`, selection `native:26`). From PR 1, with E-23 group titles as written in the structure. In this template each group also shows its **data coverage**: "Checked against MRM data" when at least one contradiction rule targets a requirement in the group, otherwise "Self-assessment only". The coverage comes from the rule table in 8.4, so it cannot drift from the rules.
6. **Model risk management status** (new section `mrmFleet`). Fleet totals, models by tier, untiered, validation coverage (validated / in review / not started / overdue), open findings by severity, monitoring coverage (models with active thresholds, models with a metric received in the last 90 days), activity in period (validations signed off, findings opened/closed, breaches, revalidation events), and a per-tier table (models, tiering current, validated, monitoring active, open findings, critical/high findings). Lists only models with an exception; counts for the rest.

This section uses a **report-only** collector, not `getAttestationSummary` as is. That function counts retired models and prints a per-tier `ok`/`blocked` attestation status. Here every count excludes retired models, so the MRM status, contradictions and fix-it sections agree, and no per-tier verdict is printed. `getAttestationSummary` stays unchanged for the MRM tab and its DOCX. Shared SQL fragments may be factored out if that does not change the existing function's output.
7. **Where the checklist and the data disagree** (new section `e23Contradictions`). The fixed rules in 8.4. Table: requirement, claimed status, what the data shows, affected count, examples (up to 5 model names, then "and N more"). When no rule fires: "No contradictions found by the rules in this report", plus the list of rules checked, so an empty table is never mistaken for an unchecked one.
8. **E-23 gap analysis** (new AI block `e23Gap`, see 8.5).
9. **Fix-it list** (new section `e23FixItList`, see 8.6).
10. **Model inventory appendix** (new section `mrmInventoryAppendix`, off by default).
11. **Sections with no data / Analyses not produced** (existing blocks).
12. **Sign-off** (new section `signOff`, on by default in this template). Statement that the report is a self-assessment prepared from VerifyWise records and is not an OSFI assessment, followed by signature lines (name, title, signature, date) for the accountable executive and, when given, the head of model validation.

**Limitations text** (in Scope and method) always lists: VerifyWise does not compute model performance metrics (the institution supplies them); these E-23 Appendix 1 fields are not tracked in VerifyWise: production deployment date, data sources, approved uses and exceptions, dependencies, third-party designation; statuses are self-assessed.

### 8.4 Contradiction rules

A rule fires only when the named requirement's status is `Implemented` or `Audited` **and** the data condition holds. "Model" means a model inventory row in the organization that is not `Retired`. Rules are one pure function over collected data, each with a stable id, so results are reproducible and unit-testable.

| Rule | Requirement | Data condition |
|---|---|---|
| C1 | 2.1.4 Enterprise-level model inventory as system of record | No models in the inventory |
| C2 | 2.2.3 Every model rated through a defined process | Any model with no MRM tier |
| C3 | 2.2.4 Regular and trigger-based rating review | Any tiered model whose rating was last set or affirmed more than 12 months before generation (the later of `mrm_tiered_at` and its latest validation sign-off, since sign-off affirms the tier per 3.4.8), or flagged for revalidation with no open validation |
| C4 | 3.1.3 Explicit stakeholder responsibilities | Any model with no `owner` MRM role |
| C5 | 3.4.1 Review independent of development | Any model whose latest validation's validator currently also holds the `developer` role on that model (latest only: role history is not kept, so older validations cannot be judged fairly) |
| C6 | 3.4.2 Review depth and frequency set by rating | Any model with an overdue validation (`next_due` before generation, not validated) |
| C7 | 3.4.6 Documented results and recommendation to the approver | Any model whose latest signed-off validation has one or more of its six report sections (`purpose_scope`, `conceptual_soundness`, `data_review`, `outcomes_analysis`, `findings_limitations`, `conclusion_signoff`) missing or with empty text after trimming |
| C8 | 3.4.7 Suitability approval throughout the lifecycle | Any model with neither an `approver` MRM role nor an inventory approver |
| C9 | 3.4.9 Approval with known limitations backed by mitigants or justification | Any `Approved` model with a critical or high finding still at stage `open` and with an empty remediation plan (E-23 allows approval with known limitations when mitigants exist, so a planned or in-progress remediation does not fire) |
| C10 | 3.6.4 Breach thresholds and material-modification criteria | Any tier 1 or tier 2 model with no active threshold |
| C11 | 3.6.1 Monitoring standards by rating and model type | Any model with active thresholds but no metric received in the last 90 days |
| C12 | 2.2.8 Remediation when model risk exceeds appetite | Any open critical or high finding past its due date |
| C13 | 3.4.7 Suitability approval throughout the lifecycle | Any `Approved` model whose latest signed-off validation outcome is `not_validated` |

"Open" findings use the attestation definition: stage open, remediation planned, in progress or resolved.

If the E-23 framework is not on file, the section shows the `no_framework_target` notice and no rule runs.

**Finding a rule's requirement.** The structure has no requirement id; the number exists only as the title prefix ("2.1.4 Enterprise-level ..."). Each rule names its requirement by that number (the one hard-coded key). At run time the collector reads the organization's E-23 requirement rows from the database and matches the number against the title prefix (text before the first space). A rule whose number matches no row is not run and is listed under "Rules not run" in the section with the reason "requirement 2.1.4 not found in this organization's E-23 checklist". It never counts as clean and never fails the run. A unit test pins every rule number against the structure file, so a renumbering fails CI first.

The 12-month and 90-day windows are named constants.

### 8.5 AI: `e23Gap` analyzer

A new analyzer in `services/reporting/analyzers/`, registered like `complianceGap`.

- **Input:** E-23 rows of `frameworkRequirements`, `mrmFleet`, `e23Contradictions`, the facts block, and the audience parameter (formal register for both audiences; the board version leads with consequences, the examiner version with evidence).
- **Output (zod, `.strict()`):**
  - `narrative` (overall position, 40–2500 chars);
  - `principles[]`: `group` (verbatim E-23 group title), `position` (`consistent` / `partly consistent` / `inconsistent` / `not assessable`, meaning how far the MRM data is consistent with the self-assessed statuses; rendered as "Data consistent with self-assessment" and so on, never as a compliance rating), `explanation`, `basis` (`observed` / `inferred` / `absent`), `what_would_close_this`. Groups marked "Self-assessment only" (8.3) must be `not assessable`;
  - `abstain_reason`.
- **Provenance:** add `{ list: "principles", field: "group" }` to `VERBATIM_FIELDS`; add the narrative to `PROSE_FIELD` for the shallowness gate.
- **Prompt rules:** existing `GROUNDING_RULES`, plus: never state or imply OSFI's view or compliance; explain contradictions, never invent new ones. The two position constraints (no `consistent` for a group with a fired rule; `not assessable` for a self-assessment-only group) are enforced in code after parsing, not only asked for in the prompt: a violating row is corrected to the allowed value and the correction is recorded in `audit_metadata`.
- **Gating:** new `e23Gap` flag in `AiBlocksConfig`, request `aiBlocks`, resolver, `LEGACY_BLOCKS`/`NO_BLOCKS` (off for manual legacy runs) and the wizard's AI step.
- **Existing analyzers:** `executiveSummary`, `keyFindings` and `recommendedActions` receive the new sections through `prepareSectionData` and facts. `recommendedActions` takes the fix-it list as input so its actions point at real items.
- **No key / failure:** existing abstention behaviour. The fixed sections (at a glance, completeness, MRM status, contradictions, fix-it list) never depend on the LLM.

### 8.6 Fix-it list (`e23FixItList`)

Deterministic. The AI does not rank or edit it.

Item sources:

1. A fired contradiction rule (one item per rule, listing affected models).
2. An E-23 requirement that is not done, with no owner.
3. An E-23 requirement that is not done and past its due date.
4. An E-23 requirement marked `Needs rework`.
5. An E-23 requirement marked done with no evidence attached.
6. Any other E-23 requirement that is not done.
7. Model-level gaps: untiered model, overdue validation, missing owner or approver role, tier 1/2 model with no active threshold, open critical or high finding (one item per model, listing its gaps).

Each item: severity, what is wrong, where (requirement number and title, or model name), owner (requirement owner, or the model's `owner` role; "Unassigned" when none), due date when one exists, and "Closes when" (fixed text per item type).

Severity:

- **High:** every source 1 and source 3 item; a source 7 item when the model is tier 1 or has an open critical or high finding.
- **Medium:** every source 2, 4 and 5 item; every other source 7 item.
- **Low:** every source 6 item.

 Sorted by severity, then overdue first, then requirement order or model name.

### 8.7 Model inventory appendix (`mrmInventoryAppendix`)

One row per non-retired model, plus retired models in a second table (2.1.6 keeps decommissioned models in the inventory): name, version, provider, type, tier, status, owner, approver, intended use, limitations (first 300 chars), latest validation outcome and sign-off date, next review due, active thresholds (yes/no), open findings count. Landscape table in PDF; the builder may split columns across two tables if one does not fit.

### 8.8 System template

Seed a system template, slug `osfi-e23-completeness`, category compliance, organization scope only (`supportedScopes: ["organization"]`), framework selection `native:26`, format PDF, with:

- sections on: `frameworkRequirements`, `mrmFleet`, `e23Contradictions`, `e23FixItList`, `signOff`; off: `mrmInventoryAppendix` and every other catalog section;
- AI blocks on: `executiveSummary`, `keyFindings`, `recommendedActions`, `e23Gap`; others off;
- `parameters_config` with the fields in 8.1.

Follow the idempotent per-slug pattern of `20260729221814-seed-system-report-template-library.js`, except that this seed writes `supported_scopes = ["organization"]` (the library seed hard-codes both scopes). It must seed even when no organization has added E-23 (the report then shows notices).

### 8.9 Permissions

No new gate is needed. Organization-scope reports already require Admin (`services/reporting/reportAuthorization.ts`), running a template requires `reportTemplate.edit`, and MRM read endpoints are open to every signed-in member of the organization. So everyone who can run this report can already see the MRM data in the app.

### 8.10 Change since last run

Scheduled runs already diff facts against the previous run of the same schedule; manual runs get no comparison today. Many customers will run this report by hand each quarter, so for templates of kind `osfi_e23` a manual run compares against the organization's previous successful run of the same template (any trigger), and a scheduled run keeps comparing against its own schedule. Other templates are unchanged. Add the new aggregates (requirements done, contradictions fired, fix-it items by severity, overdue validations, untiered models) to facts so the change block covers them. Bump `FACTS_SCHEMA_VERSION`.

### 8.11 Docs and guide

- `docs/technical/domains/reporting.md`: new sections, parameters, the E-23 template, contradiction rules.
- `docs/technical/domains/mrm.md`: point to the report.
- User guide page under `shared/user-guide-content/` on generating the E-23 report, mirrored to `~/website/verifywise/content/user-guide/`.
- A "What's new" entry at release time (feature, so it qualifies).

## 9. Testing

- **Unit:** each contradiction rule fires and stays silent at its boundary (status not done, exactly 12 months, exactly 90 days, retired models ignored); every rule number exists as a title prefix in the E-23 structure file; an unmatched rule is reported as not run; quarterly next-run dates (including month-end clamping) and rolling period computation; E-23-only sections rejected outside an `osfi_e23` template; fix-it severity and ordering; parameter validation (each field, unknown keys, date rules); `e23Gap` schema, provenance filtering and the "no `supported` with a fired rule" check; facts aggregates; catalog keys.
- **Integration (live Postgres):** `frameworkRequirements` collector on a bundled framework with evidence and risks; `mrmFleet` and contradiction inputs; cross-organization isolation for every new collector and the last-parameters endpoint.
- **Renderers:** both formats render every new section, including empty and notice states; label maps shared, not duplicated.
- **Frontend:** wizard step appears only when the template declares parameters, prefill, validation messages, AI step shows the new block.
- **Gates:** `Servers` build, unit tests; `Clients` typecheck, build, `i18n:audit:strict`, format-check; Semgrep; swagger and endpoints regenerated.

## 10. Decisions on record

**Made by the user:** option B; readers are an OSFI examiner or the board, and the report also carries a fix-it list; the wizard asks the report details in 8.1 and remembers them; English only; sign-off page included; model listing shows exceptions with the full inventory as an optional appendix; fix-it list inside the report, no CSV; fixed contradiction rules explained by AI; missing inventory fields reported as "not tracked"; remaining defaults accepted.

**Made by me (open to correction):** two PRs; adding a quarterly schedule frequency for every template; scheduled periods roll (one interval ending the day before the run), aligned to fiscal quarters through the run date; `parameters_config.kind` marks an E-23 template and E-23 sections are offered only there; the MRM status section counts exclude retired models and print no per-tier verdict; rules match requirements by title number and list unmatched rules as "not run"; the specific contradiction rules (C7 reworked to empty validation report sections, C13 added) and their 12-month and 90-day windows; C3 counts a validation sign-off as affirming the tier; C5 checks only the latest validation; C9 fires only for unmitigated critical/high findings (E-23 allows approval with mitigated limitations); per-group data coverage label derived from the rules; a fixed "at a glance" summary that needs no AI; E-23 manual runs compare against the previous run of the same template; gap-analysis positions phrased as data consistency, enforced in code; fix-it severity scheme; the AI does not rank the fix-it list (deterministic for an examiner); `e23Gap` position scale; prefill from the organization's last run rather than a stored per-org template copy; generic `parameters_config` rather than E-23-only fields; period bounds activity counts only.

## 11. Left to the builder

Exact SQL and module layout; chart styling; PDF table layout for wide tables; whether any existing system template should default `frameworkRequirements` on; whether the run-now request's new optional field needs a `/api/v1` route under ADR 0001 (if so, a thin v1 route reusing the controller).
