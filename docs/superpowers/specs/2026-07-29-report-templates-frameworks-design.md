# Reporting: selectable frameworks and 29 distinct system templates

**Date:** 2026-07-29
**Status:** Approved design, ready for implementation planning

## Problem

Two asks, and they are coupled.

**There are 3 system templates; there should be at least 20, all producing genuinely different reports.** `20260619191640-seed-reporting-system-templates.js` seeds Daily Governance Pulse, Weekly Executive Brief and Compliance Evidence Gap. That is the whole shipped library.

**No template can target a framework.** `resolveFrameworkTargets` (`Servers/services/reporting/reportScope.ts:45`) takes `(scope, projectId, organizationId)` and returns *every* `projects_frameworks` pairing in scope. The wizard has no picker, so a report covering an org with EU AI Act, ISO 42001 and NIST projects always covers all three. "ISO 42001 Internal Audit Pack" is not expressible.

The coupling: `REPORT_SECTION_CATALOG` (`Servers/services/reporting/sectionCatalog.ts:28`) holds 12 section keys. Twenty templates cannot be distinct on section mix alone. The framework filter is what makes them distinct — `clausesAndAnnexes ∩ {ISO 42001}` and `clausesAndAnnexes ∩ {ISO 27001}` are the same section and genuinely different reports. Build the filter first, then the templates on top of it.

## A prior claim, retracted

An earlier draft of this design flagged the `!isOrganizationalProject` guard on `euTargets` (`dataCollector.ts:238`) as a limitation: that `compliance`/`assessment` at organization scope might silently render empty. **This is wrong and there is nothing to fix.**

`frameworks` is seeded with EU AI Act `is_organizational = false` and ISO 42001 / ISO 27001 / NIST AI RMF `true` (`20260226234301-public-schema-tables.js:207`). `createNewProjectQuery` (`Servers/utils/project.utils.ts:253`) rejects any framework whose `is_organizational` differs from the project's own. Therefore `frameworkId === 1` implies `!isOrganizationalProject` for every well-formed row, and the guard never removes a target.

The guard stays — it is cheap defense against a malformed row, and removing it buys nothing. What this design adds instead is a test pinning the invariant, so a future migration that flips `frameworks.is_organizational` for EU AI Act fails loudly rather than emptying every EU report.

## Decisions

1. `framework_ids` is a **string array with a namespace prefix**. Native and plugin framework ids collide numerically; the prefix is the only thing that keeps `frameworks.id = 2` (ISO 42001) apart from `custom_frameworks.id = 2`.
2. **Empty or NULL means all frameworks in scope.** Every existing `scheduled_reports` row and every manual run keeps its current behaviour with no backfill.
3. The legacy scalars `scheduled_reports.framework_id` and `project_framework_id` are **not touched**. `resolveReportRequest` coerces them with `?? 0`, and `reporting.md` documents the shipped bug where that `0` closed all four framework gates and produced content-free reports. A new column, dead scalars left in place.
4. **A non-empty filter narrows the project set too, not only the framework-gated sections.** Without this, "ISO 42001 Internal Audit Pack" reports the risks of every project in the org including the EU AI Act ones — wrong in exactly the templates this design exists to enable. See below for which sections this covers and which it deliberately does not.
5. **A section that finds nothing renders a notice, not silence.** This is the general fix for the whole class of failures the retracted claim was a phantom of.
6. Framework selection lives in the report wizard only. `TemplateBuilder` does not get the field.
7. Four phases, each independently shippable.

### Framework id namespace

`framework_ids` entries take one of three forms:

| Form | Resolves to | Who emits it |
|---|---|---|
| `"native:<id>"` | `frameworks.id` | Seeds and wizard, for the four built-in frameworks |
| `"plugin:<plugin_key>"` | every `custom_frameworks` row in the org with that `plugin_key` | **Seeds only.** A system template is global and cannot reference a per-org `custom_frameworks.id` |
| `"custom:<id>"` | `custom_frameworks.id` | Wizard, for an org-local framework with no `plugin_key` |

The resolver accepts all three, plus a bare number read as `native:<n>`. The wizard preserves the form it received and emits `plugin:` when the framework has a `plugin_key`, `custom:` otherwise — both resolve identically within one org.

This shape is fixed **now**, in Phase 1's migration, even though `plugin:` and `custom:` only become resolvable in Phase 3. Deciding it later means a second migration on installs that already ran the first.

### Canonical template categories

`TemplatesTab.tsx:30` hardcodes `CATEGORIES = ["governance", "compliance", "risk"]`. The seed writes `operational`, `executive`, `compliance`. The backend takes any non-empty string (`reportTemplate.utils.ts:79` checks presence only). Duplicating a system template with category `operational` therefore puts a value in the Edit dropdown that is not one of its options.

The canonical list is the **union** of both, which is why no data migration is needed:

```
executive | compliance | risk | operational | governance
```

## Phase 1 — Framework filter, empty-section notices, 21 templates

### Schema

One migration (timestamp from `date +%Y%m%d%H%M%S`, `verifywise.` prefix per `Servers/CLAUDE.md`):

```sql
ALTER TABLE verifywise.report_template_versions
  ADD COLUMN IF NOT EXISTS framework_config JSONB NOT NULL DEFAULT '{}';

ALTER TABLE verifywise.scheduled_reports
  ADD COLUMN IF NOT EXISTS framework_ids JSONB;
```

`framework_config` shape: `{"frameworkIds": ["native:2", "native:3"]}`. `{}` and `{"frameworkIds": []}` both mean all. This matches the existing per-concern-JSONB shape on that table (`sections_config`, `ai_blocks_config`, `format_config`, …).

### Backend flow

`frameworkIds?: string[]` threaded through, in order:

| File | Change |
|---|---|
| `domain.layer/interfaces/i.reportTemplate.ts` | `FrameworkConfig { frameworkIds?: string[] }`; `ScheduledReportRecord.framework_ids: string[] \| null` |
| `domain.layer/interfaces/i.reportGeneration.ts` | `ReportGenerationRequest.frameworkIds?: string[]` |
| `controllers/reportTemplate.ctrl.ts` (~315–322, `runTemplateNow` + schedule create) | Accept `frameworkIds` from the body, validate shape, persist. Reject an entry matching neither `^(native\|custom):\d+$`, `^plugin:[a-z0-9_-]+$`, nor a bare positive integer |
| `utils/scheduledReport.utils.ts` | Insert `framework_ids`; add `frameworkIds: "framework_ids"` to the update field map at :69 |
| `services/reporting/reportTemplateResolver.ts` | `frameworkIds: sched.framework_ids ?? undefined` |
| `services/reporting/index.ts` (:100 and :259) | Pass `request.frameworkIds` into both `resolveFrameworkTargets` calls |
| `services/reporting/reportScope.ts` | New param; `AND pf.framework_id = ANY(:nativeIds)` when the native subset is non-empty. Non-native entries are ignored in Phase 1 and recorded as an unresolved-target notice |
| `services/reporting/dataCollector.ts` | Derive `scopedProjectIds` from the resolved targets and apply it to the project-scoped tier (see below). Emit `sectionNotices` |

**`reportScope.ts`'s docblock must be rewritten in this change.** It currently reads: the wizard "has no framework picker, **and it should not grow one**." That rationale is against a *single* `frameworkId` that would pin a report to one framework and silently drop the project's others. A multi-valued filter where empty means all is the case the rationale does not cover. Leaving the comment as-is would put the code in contradiction with its own documentation.

### What the filter narrows

`resolveFrameworkTargets` returns `(project, framework)` pairings, and only the four framework-gated sections read them. Every other section is collected from `orgWide` or the report's own `projectId`, so filtering targets alone would leave them untouched — and an "ISO 42001 Internal Audit Pack" would list the risks of the org's EU AI Act projects beside its ISO ones.

When `frameworkIds` is non-empty, derive `scopedProjectIds` as the distinct project ids of the resolved targets and apply it in three tiers:

| Tier | Sections | Behaviour |
|---|---|---|
| Framework-gated | `compliance`, `assessment`, `clausesAndAnnexes`, `nistSubcategories` | Already per-target. Unchanged apart from the narrowed target set |
| Project-scoped | `projectRisks`, and `fria` once Phase 4 lands | Gain `AND project_id = ANY(:scopedProjectIds)` |
| Entity-scoped | `vendors`, `models`, `vendorRisks`, `modelRisks`, `incidentManagement`, `trainingRegistry`, `policyManager` | **Unaffected.** A vendor is not "an ISO 42001 vendor" — these entities carry no framework, and narrowing them by the projects that happen to hold one would drop rows for a reason the reader cannot see |

An empty `frameworkIds` skips all of this, so present-day behaviour is untouched.

An **empty `scopedProjectIds` skips the section entirely** and emits a `no_framework_target` notice — it must never build a predicate, because `= ANY(:emptyArray)` runs into Postgres empty-array type inference. This is a live path, not a hypothetical: template #21 selects `native:1` at project scope, so running it against an ISO project resolves zero targets.

This is why `use-case-onboarding-assessment` (#21) selects `native:1`: it gates `assessment` **and** narrows `projectRisks` to EU AI Act projects. On a template whose sections are all entity-scoped, a framework selection would be decorative — none of the 21 is in that position.

### Empty-section notices

Today `collectAllData` omits a section key when nothing is found, and both renderers skip what is absent. A report whose framework isn't on any project in scope is indistinguishable from one where the section was never requested.

Add to `ReportData`:

```ts
sectionNotices: Array<{
  sectionKey: string;
  reason: "no_framework_target" | "no_data" | "unresolved_framework";
}>;
```

- `no_framework_target` — the section was requested but no pairing in scope carries a framework that serves it (e.g. `nistSubcategories` with only EU AI Act projects in scope).
- `no_data` — a pairing exists, the query returned zero rows.
- `unresolved_framework` — a `plugin:`/`custom:` entry was selected but the custom-framework path is not available (Phase 1 and 2 only; Phase 3 removes this case).

Both renderers render one short block per notice — `report-pdf.ejs` and `docxGenerator.ts`. This is what converts the retracted claim's phantom, a plugin framework selected before Phase 3 lands, and a template targeting a framework no project holds, into something the reader can see.

### Frontend

`ConfigureReportWizard.tsx` — the multi-select goes on the **Scope** step, not a new stepper entry. It is scope-of-data selection, the same concept as project vs. organization, and run-now already has 4 steps against schedule's 6.

- Options from `useFrameworks({ listOfFrameworks: [] }).allFrameworks`, mapped to `native:<id>`.
- Seeded from `template.latestVersion?.framework_config?.frameworkIds ?? []`.
- Helper text: empty means every framework in scope.
- `canNext` is **not** gated on it.
- Rendered as chips on the Review step.
- `frameworkIds` added to the `base` payload, so both `runNow` and `create` carry it.

`domain/interfaces/i.reporting.ts` — `frameworkIds?: string[]` on the run and schedule payload types.

`TemplateBuilder.tsx` is deliberately untouched. Consequence, stated rather than solved: an org-authored template cannot carry a framework default, so its user selects in the wizard each time.

### The 21 templates

`FW` column `—` means empty (all frameworks).

AI block abbreviations — `RA` and `RISK` are distinct blocks and the shorthand must not conflate them:

| Short | Block | Short | Block |
|---|---|---|---|
| SS | `sectionSummaries` | RISK | `riskAnalysis` |
| ES | `executiveSummary` | CG | `complianceGap` |
| KF | `keyFindings` | VR | `vendorRisk` |
| RA | `recommendedActions` | **B** | SS + ES + KF + RA + RISK |

| # | Slug | Name | Cat | Scope | Freq | FW | Sections | AI |
|---|---|---|---|---|---|---|---|---|
| 1 | `daily-governance-pulse` | Daily Governance Pulse *(existing)* | operational | project | daily | — | projectRisks, incidentManagement, vendors, policyManager | B+VR |
| 2 | `weekly-executive-brief` | Weekly Executive Brief *(existing)* | executive | org | weekly | — | models, projectRisks, compliance, incidentManagement | B |
| 3 | `compliance-evidence-gap` | Compliance Evidence Gap *(existing)* | compliance | project | weekly | — | clausesAndAnnexes, compliance, assessment | B+CG |
| 4 | `eu-ai-act-readiness` | EU AI Act Readiness Review | compliance | project | monthly | native:1 | compliance, assessment, projectRisks | B+CG |
| 5 | `eu-ai-act-conformity-pack` | EU AI Act Conformity Evidence Pack | compliance | org | monthly | native:1 | compliance, assessment, policyManager, trainingRegistry, incidentManagement | B+CG |
| 6 | `iso-42001-audit-pack` | ISO 42001 Internal Audit Pack | compliance | org | monthly | native:2 | clausesAndAnnexes, policyManager, trainingRegistry, projectRisks | B+CG |
| 7 | `iso-27001-control-status` | ISO 27001 Control Status Report | compliance | org | monthly | native:3 | clausesAndAnnexes, incidentManagement, vendors | B |
| 8 | `iso-dual-standard-coverage` | ISO 42001 + 27001 Coverage | compliance | org | monthly | native:2, native:3 | clausesAndAnnexes, projectRisks | SS, ES, KF, CG |
| 9 | `nist-ai-rmf-profile` | NIST AI RMF Profile Report | compliance | org | monthly | native:4 | nistSubcategories, projectRisks, models | B |
| 10 | `cross-framework-scorecard` | Cross-Framework Compliance Scorecard | compliance | org | monthly | native:1, native:2, native:3, native:4 | compliance, assessment, clausesAndAnnexes, nistSubcategories | B+CG |
| 11 | `third-party-risk-review` | Third-Party and Vendor Risk Review | risk | org | monthly | — | vendors, vendorRisks | SS, ES, KF, RA, VR |
| 12 | `ai-model-inventory` | AI Model Inventory Report | governance | org | monthly | — | models | SS, ES, KF |
| 13 | `model-risk-register` | Model Risk Register | risk | org | weekly | — | modelRisks, models | B |
| 14 | `consolidated-risk-register` | Consolidated Risk Register | risk | org | weekly | — | projectRisks, vendorRisks, modelRisks | B+VR |
| 15 | `incident-monitoring-report` | Incident and Post-Market Monitoring | operational | org | weekly | — | incidentManagement, projectRisks, models | B |
| 16 | `policy-governance-review` | Policy Governance Review | governance | org | monthly | — | policyManager | SS, ES, RA |
| 17 | `training-awareness-compliance` | Training and Awareness Compliance | governance | org | monthly | — | trainingRegistry, policyManager | SS, ES, KF, RA |
| 18 | `board-governance-report` | Board Governance Report | executive | org | monthly | — | models, projectRisks, compliance, clausesAndAnnexes, incidentManagement, vendors | all 7 |
| 19 | `monthly-operations-review` | Monthly Operations Review | operational | org | monthly | — | projectRisks, incidentManagement, policyManager, trainingRegistry, vendors | B |
| 20 | `use-case-risk-deep-dive` | Use Case Risk Deep Dive | risk | project | weekly | — | projectRisks, models, modelRisks | B |
| 21 | `use-case-onboarding-assessment` | New Use Case Onboarding Assessment | compliance | project | monthly | native:1 | assessment, projectRisks, vendors | SS, ES, KF, RA |

`recommended_frequency` only accepts `daily`, `weekly`, `monthly` (`ReportFrequency`), so the quarterly-in-spirit board and audit templates carry `monthly`.

### Two mechanical checks, enforced by tests not prose

**Distinctness.** All 21 section sets are pairwise distinct, so the templates separate on sections alone — framework, scope, frequency and AI blocks only deepen the separation. A test asserts pairwise distinctness of the full tuple `(sections, frameworkIds, scope, frequency, aiBlocks)` over the seeded rows. "All different" is the user's quality bar; this is its verifiable form.

**Framework ↔ section reachability.** `collectAllData` gates framework sections on numeric ids: `compliance`/`assessment` → 1, `clausesAndAnnexes` → 2 or 3, `nistSubcategories` → 4. A template enabling a gated section whose gate no selected framework opens renders that section empty. Verified on paper for #4, 5, 6, 7, 8, 9, 10 and 21; every other template selects no framework and so reaches all gates. A test re-derives this from the seeded rows rather than trusting the table above — **the seed does not get written until it passes.** A 21-template migration with silently-empty sections is expensive to unwind once installs have run it.

### Seed migration, and why the definitions leave it

`20260619191640` keeps its three templates in a `TEMPLATES` const local to the migration file. A Jest test cannot import that, so the two checks above would have to either restate the 21-row table — drifting from the seed silently, which defeats their whole purpose — or run against a live migrated database.

The definitions therefore move to **`Servers/database/seeders/systemReportTemplates.js`**, a plain CommonJS module exporting all 21 including the three currently inlined. The seed migration requires it and inserts the 18 missing slugs; the distinctness and reachability tests require the same file. That single shared source is what turns the reachability check from a paragraph into a gate.

`.js`, not `.ts`, deliberately: migrations run from `dist/` per `Servers/CLAUDE.md`, and a TypeScript source would put the migration and the test on different paths to the same data.

Two migrations, and **migration A must sort before B** — two `date +%Y%m%d%H%M%S` calls in the same second return the same timestamp, and the `ALTER` has to precede the seed.

The seed resolves framework ids **by name** the way `20260302111132-seed-framework-struct-data.js` does, never by hardcoded integer, and tolerates a missing or inactive framework by skipping that template with a log line. It keeps the existing `SELECT id FROM report_templates WHERE slug = :slug AND is_system_template = true` idempotency guard — `slug` carries a unique index from `20260720163044-report-template-slug-unique.js`.

The three existing templates need no backfill: `framework_config` defaults to `'{}'`, which reads as all frameworks, which is what they do today.

**`down()` cannot `DELETE`.** `scheduled_reports.template_id INTEGER NOT NULL REFERENCES verifywise.report_templates(id)` carries no `ON DELETE` clause, so `NO ACTION` applies and dropping a system template any org has scheduled from raises an FK violation. Latent at 3 templates; not at 21. `down()` sets `is_active = false` on the 18 seeded slugs instead.

## Phase 2 — TemplatesTab grouping and category canonicalization

21 system cards in one flat list, ordered `is_system_template DESC, name ASC` (`reportTemplate.utils.ts:11`), is not usable.

- Extract the canonical five categories to a shared frontend constant, used by both `TemplatesTab.tsx:30` and `TemplateBuilder.tsx:53`. This closes the dropdown bug: `operational` and `executive` become selectable, and no seeded row holds a value the Edit modal cannot display.
- Group the card grid by category with headers, and add a category filter.
- Keep the existing system/custom split and the read-only rule on system templates.

No backend change. No data migration — the canonical list is a superset of both current lists.

## Phase 3 — Plugin and custom frameworks

Plugin frameworks are **not** a missing gate in `collectAllData`. They are a parallel data model:

```
custom_framework_definitions ──> custom_framework_level1_struct
                                   └─> custom_framework_level2_struct
                                         └─> custom_framework_level3_struct
custom_frameworks (per org) ──> custom_framework_projects (pairing)
                                   ├─> custom_framework_level2_impl
                                   └─> custom_framework_level3_impl
```

`resolveFrameworkTargets` reads `projects_frameworks` and can never surface any of it. Supporting them needs:

- **A second resolver**, `resolveCustomFrameworkTargets`, over `custom_framework_projects` joined to `custom_frameworks` and `projects`, scoped on `organization_id` in both, filtered by the `plugin:` / `custom:` entries.
- **One generic section**, `customFramework`. The hierarchy is not fixed: `hierarchy_type` is `two_level` or `three_level` and `level_1_name` / `level_2_name` / `level_3_name` supply the headings at runtime. The section renders level 1 → level 2 → optional level 3 with `custom_framework_level2_impl` / `level3_impl` status, owner and due date.
- **Both renderers** — `report-pdf.ejs` and `docxGenerator.ts`.
- **The wizard picker lists both namespaces**, native frameworks and the org's `custom_frameworks` rows, in one multi-select with the prefixed values Phase 1 already accepts.

Three templates, all `compliance` category, organization scope, monthly, section `customFramework` filtered to one plugin key:

| Slug | Name | FW |
|---|---|---|
| `soc2-readiness` | SOC 2 Readiness Report | `plugin:<soc2 key>` |
| `gdpr-compliance` | GDPR Compliance Report | `plugin:<gdpr key>` |
| `hipaa-safeguards` | HIPAA Safeguards Report | `plugin:<hipaa key>` |

**The `plugin_key` values are unverified.** `plugin-marketplace` is not checked out beside this repo, so the keys must be read from the plugin definitions before the seed is written. The seed creates these templates unconditionally — a plugin is installed after the fact, so gating the seed on an installed definition would mean the template never appears for an org that installs SOC 2 later. Until the plugin is installed the template produces a `no_framework_target` notice from Phase 1, which is the visible-failure behaviour this design is built around.

## Phase 4 — Catalog extension

Five new sections. Feasibility confirmed at the table level; none is speculative.

| Section key | Tables | Note |
|---|---|---|
| `datasets` | `datasets`, `dataset_projects`, `dataset_model_inventories` | Has `contains_pii`, `pii_types`, `known_biases`, `bias_mitigation` — the fields a data governance report is actually about. No `status` column; `status_date` is not a status |
| `fria` | `fria_assessments`, `fria_risk_items`, `fria_rights` | Project-scoped, EU AI Act aligned |
| `evidenceHub` | `evidence_hub`, `file_entity_links` | `expiry_date` drives an expiring-evidence view |
| `readiness` | `framework_readiness_scores` | Keyed on `framework_type` (**string**), not `framework_id`. Needs an explicit map to the framework filter; a numeric join will not work |
| `modelRiskManagement` | `mrm_validations`, `mrm_findings`, `mrm_thresholds`, `mrm_metric_evaluations`, `mrm_revalidation_events`, `model_inventories` tiering columns | Reuses the queries in `utils/mrmAttestation.utils.ts` rather than writing parallel SQL that will drift from them |

`services/reporting/mrmAttestationReport.ts` already produces a standalone board/examiner DOCX. The `modelRiskManagement` section does not replace it: that generator is self-contained and does not use `ReportData`, while this is a section inside the composite report available in both formats.

Each section touches eight places:

1. `sectionCatalog.ts` — catalog entry (key, label sentence case, group)
2. `i.reportGeneration.ts` — section data interface
3. `dataCollector.ts` — flat collector query plus wiring in `collectAllData`
4. `templates/reports/report-pdf.ejs` (1105 lines)
5. `docxGenerator.ts` (1544 lines) — the render block **and** both "has any section" guards at :289 and :1267
6. `analyzers/facts.ts` — aggregates for the facts substrate
7. `analyzers/sectionSummaries.ts` and `analyzers/prompts.ts`
8. Tests

**`FACTS_SCHEMA_VERSION` is bumped exactly once, in this phase.** `reporting.md` is explicit: the prior-run delta subtracts by name and reads a name missing from the current side as a bucket that emptied to zero. New aggregates without a bump make orphaned keys render as measured remediation — "ownerless: 0 (was 7, −7)" on an estate where nothing moved, which is worse than a static wrong label because a delta reads as evidence of progress.

Collector queries follow the existing rule: single flat reads, not the Requirements/Assessment screen loaders. Measured cost for one pairing is 604 queries for `compliance` via the loader against 18 for the whole eleven-section report. Widen a flat query when a field is missing; do not reach for the screen's loader.

Five templates:

| Slug | Name | Cat | Scope | Freq | FW | Sections |
|---|---|---|---|---|---|---|
| `dataset-governance` | Dataset Governance Report | governance | org | monthly | — | datasets, models |
| `fria-report` | Fundamental Rights Impact Assessment | compliance | project | monthly | native:1 | fria, projectRisks |
| `evidence-hub-audit` | Evidence Hub Audit Pack | compliance | org | monthly | — | evidenceHub, compliance, clausesAndAnnexes |
| `framework-readiness-scorecard` | Framework Readiness Scorecard | compliance | org | monthly | — | readiness, compliance, clausesAndAnnexes, nistSubcategories |
| `mrm-validation-pack` | Model Risk Validation Pack | risk | org | monthly | — | modelRiskManagement, modelRisks, models |

Both mechanical checks re-run over all 29 templates when this phase lands.

## Testing

| Phase | Tests |
|---|---|
| 1 | `reportScope.spec.ts` — the native filter narrows, empty does not. `reportTemplateResolver.test.ts` — `frameworkIds` carried through. Seed tests — pairwise distinctness, framework↔section reachability. A test pinning `frameworks.is_organizational` for EU AI Act to `false`. `report-templates.isolation.test.ts` — `framework_ids` does not leak across tenants. `ConfigureReportWizard.test.tsx` — default seeding, empty allowed, payload shape. Renderer tests for notices |
| 2 | `TemplatesTab.test.tsx` — grouping, filter, and that every seeded category is a selectable option |
| 3 | `resolveCustomFrameworkTargets` tenant scoping; `customFramework` section in both renderers at two and three levels |
| 4 | Per-section collector, renderer and facts tests; a `FACTS_SCHEMA_VERSION` bump test |

`npm run build` in both `Servers` and `Clients` before any PR.

If a phase touches a route file, regenerate the API surface in the same commit — `npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift`. The `api-docs-drift` CI job is the most common PR failure. Adding `frameworkIds` to a request body may not change the route files at all; check rather than assume.

## Documentation

`docs/technical/domains/reporting.md` is updated in **every** phase, not at the end: the framework filter and notices in Phase 1, the categories in Phase 2, the custom-framework data path in Phase 3, the section table and `FACTS_SCHEMA_VERSION` bump in Phase 4. The retracted `!isOrganizationalProject` claim is recorded there too, so the next reader does not re-derive it. `reportScope.ts`'s docblock is rewritten in Phase 1.

## Out of scope

- **`TemplateBuilder` framework defaults.** Org-authored templates cannot carry one; the user selects in the wizard each time.
- **Removing the `!isOrganizationalProject` guard.** Verified redundant, kept as defense, pinned by a test.
- **The legacy `framework_id` / `project_framework_id` scalars.** Left dead.
- **Framework-aware section filtering in the wizard UI.** The wizard does not hide `nistSubcategories` when only EU AI Act is selected; the reachability check covers the seeded templates, and a user-built mismatch surfaces as a `no_framework_target` notice.
