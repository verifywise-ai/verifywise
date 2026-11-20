# OSFI E-23 as a bundled framework — design

> Date: 2026-11-18 · Branch: `feature/osfi-e23-framework` (worktree `~/verifywise-e23`)
> Status: draft for approval

## Why

OSFI Guideline E-23 – Model Risk Management (2027) applies to Canadian
federally regulated financial institutions from May 1, 2027. VerifyWise already
has the per-model machinery E-23 asks for (the MRM tab in Model inventory:
tiering, validation, findings, monitoring, revalidation, attestation), but
nothing that shows an institution, principle by principle, how ready its MRM
programme is. The other major frameworks have that checklist; E-23 does not.

This is phase 1: the checklist. Phase 2 (later, separate design) links
checklist items to live MRM records so status and evidence fill themselves in.

## Goals

- E-23 appears as a bundled, **organization-level** framework under
  Frameworks → Manage frameworks, for every customer.
- Each item can be assessed with the standard drawer: status, owner, reviewer,
  approver, due date, implementation details, evidence, linked risks, notes.
- The structure follows OSFI's own numbering so an examiner can trace every
  item to the guideline.
- Stable framework id and item positions (see *Item keys*) so phase 2 can
  attach MRM links to them.

## Non-goals

- No links to MRM records, no auto-status (phase 2).
- No French, German or Spanish content: bundled framework content is English
  only today (none of the 25 is translated).
- No change to the reporting service: registry frameworks are not covered by
  reports yet (`compliance-frameworks.md#reporting-limitation`); E-23 inherits
  that limitation.
- No changes to the MRM module or Model inventory.

## Anti-goals

- Copying OSFI's text verbatim. OSFI's terms forbid reproducing its material
  for commercial redistribution without written permission. All descriptions
  are paraphrased in our own words; only principle numbers, section letters and
  short headings ("Model monitoring") are used as references.
- Claims about VerifyWise features inside the content. Questions and evidence
  examples name documents an examiner asks for, not product screens.
- An item list so fine it forces users to attach the same evidence many
  times (the rejected three-level option).

## Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| **Bundled registry framework, id 26, organizational** | Code change + release; full drawer incl. Notes; every customer gets it; stable ids for phase 2 | **Chosen** |
| Excel file for the `framework-import` extension | No code, but imported frameworks attach to use cases only (not the organizational project), no Notes tab, per-org ids so phase 2 can't build on it, work doesn't migrate to a bundled version | Rejected |
| Use-case-level bundled framework | E-23 is enterprise-wide; every use case would repeat the same answers; per-model obligations are per model, not per use case | Rejected |

Granularity options: coarse (~15 items, one per principle — hides which
expectation is missing), **expectation-level two-level (~80 items — chosen)**,
three-level (~120 items, overwhelming, repeated evidence — rejected by user).

## Decisions (user-approved, 2026-11-18)

- Built-in registry framework, organizational (`is_organizational: true`).
- Two-level: level 1 = one group per principle / lifecycle section, level 2 =
  one item per distinct expectation. Sub-bullets inside an expectation become
  that item's `questions[]`.
- Paraphrased wording, OSFI numbering kept, source note in the framework
  description.
- UI name **"OSFI E-23 Model Risk Management"**, version **"2027"**.
- English only.
- Questions and evidence examples are generic examiner documents.
- Also in scope: badge SVG, user guide page (mirrored to the website), MRM
  guide page points to the new framework.

## Structure

Source: OSFI, *Guideline E-23 – Model Risk Management (2027)*, published
2025-09-11, effective 2027-05-01,
<https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/guideline-e-23-model-risk-management-2027>.
A local plain-text copy for the builder:
`/private/tmp/claude-501/-Users-gorkemcetin-verifywise/aab8cf63-9813-49e3-8c5a-048cba71b722/scratchpad/e23-guideline.md`
(re-download from the URL if the scratchpad was cleared).

16 groups, 83 items. Group titles carry the OSFI reference; item numbers
(`3.6.1`, …) are ours, sub-numbering the principle.

1. **Principle 1.1 – Organizational enablement (B.1)** — 1.1.1 MRM roles,
   accountabilities and expectations set by senior management · 1.1.2 MRM
   staff with the needed skills, including for AI · 1.1.3 Model risk reporting
   to the board · 1.1.4 Multi-disciplinary MRM team, including legal or ethics
   · 1.1.5 Adequate, evidenced MRM resourcing
2. **Principle 1.2 – Model risk management framework (B.2)** — 1.2.1 Fits the
   broader risk and governance framework · 1.2.2 Reflects risk appetite for
   model risk · 1.2.3 Processes to identify, assess, manage, monitor and report
   · 1.2.4 Guidelines for identification, inventory, ratings and lifecycle
   governance · 1.2.5 Consistent reporting at each level of the enterprise ·
   1.2.6 Periodic review of the framework, including for new technology ·
   1.2.7 Covers externally sourced models and data (B-10)
3. **Principle 1.3 – Use of models (B.3)** — 1.3.1 Models used only where they
   add value and are reliable · 1.3.2 Clear purpose backed by adequate data,
   systems and technology · 1.3.3 Unfit models modified, replaced or
   decommissioned
4. **Principle 2.1 – Model identification (C.1)** — 2.1.1 Periodic
   enterprise-wide identification, including vendor and third-party models ·
   2.1.2 Triage for non-negligible inherent risk · 2.1.3 Provisional rating for
   new models and re-rating on material change · 2.1.4 Enterprise-level model
   inventory as system of record · 2.1.5 Accurate, controlled, timely inventory
   updates · 2.1.6 Decommissioned models kept in the inventory
5. **Principle 2.2 – Model risk rating (C.2)** — 2.2.1 Rating approach based on
   inherent risk · 2.2.2 Measurable quantitative and qualitative criteria ·
   2.2.3 Every model rated through a defined process · 2.2.4 Regular and
   trigger-based rating review · 2.2.5 Approved and tracked negligible-risk
   exemptions · 2.2.6 Standalone rating of external models · 2.2.7 Inherent and
   residual risk visible to senior management · 2.2.8 Remediation when model
   risk exceeds appetite
6. **Principle 2.3 – Risk management intensity (C.3)** — 2.3.1 Rating drives
   review, documentation, approval authority, monitoring and re-rating
   interval · 2.3.2 Rating and review drive usage limits, monitoring intensity
   and residual-risk controls · 2.3.3 Extra criteria (e.g. by model type) and
   governance maturity matching AI/ML use
7. **Principle 3.1 – Policies, procedures and controls (D.1)** — 3.1.1
   Lifecycle policies applied to all models in proportion to risk · 3.1.2
   Consistent governance across the enterprise · 3.1.3 Explicit stakeholder
   responsibilities · 3.1.4 Key stakeholders involved early · 3.1.5
   Independence and objectivity · 3.1.6 Flexible for new technologies and
   model types · 3.1.7 Policies and procedures fully documented
8. **Model design – rationale (D.2)** — 3.1.8 Defined purpose, scope, coverage
   and output use · 3.1.9 Business use case and intended-use risk · 3.1.10
   AI/ML considerations: explainability, alternative controls, bias, ethics,
   privacy
9. **Principle 3.2 – Model data (D.2)** — 3.2.1 Data governance integrated
   with enterprise data governance · 3.2.2 Development data accurate,
   relevant, compliant, traceable and timely · 3.2.3 Data bias identified and
   managed · 3.2.4 Regular data quality checks · 3.2.5 Controls and provenance
   for synthetic and proxy data · 3.2.6 Data cleansing controls
10. **Principle 3.3 – Model development (D.2)** — 3.3.1 Model documentation
    standards · 3.3.2 Methodology, data and algorithm selection guidelines ·
    3.3.3 Explainability requirements · 3.3.4 Model selection criteria · 3.3.5
    Standards for output use and reporting · 3.3.6 Monitoring criteria set at
    development
11. **Principle 3.4 – Model review (D.2)** — 3.4.1 Review independent of
    development · 3.4.2 Review depth and frequency set by rating · 3.4.3
    Review triggers · 3.4.4 Review scope · 3.4.5 Review of third-party models,
    platforms and components · 3.4.6 Documented results and recommendation to
    the approver
12. **Model approval (D.2)** — 3.4.7 Suitability approval throughout the
    lifecycle · 3.4.8 Rating and residual risk affirmed at approval · 3.4.9
    Approval with known limitations backed by mitigants or justification
13. **Principle 3.5 – Model deployment (D.2)** — 3.5.1 Collaboration across
    stakeholders and technology teams · 3.5.2 Development and production data
    consistency · 3.5.3 Production testing · 3.5.4 Documented deployment
    procedures (approvals, change control, exceptions, overlays) · 3.5.5
    Pre-deployment assessment of related risks (B-13, E-21) · 3.5.6
    Explainability reviewed and communicated
14. **Principle 3.6 – Model monitoring (D.2)** — 3.6.1 Monitoring standards by
    rating and model type · 3.6.2 Quantitative and qualitative criteria ·
    3.6.3 Tracking operational factors · 3.6.4 Breach thresholds and
    material-modification criteria · 3.6.5 Contingency plans and escalation ·
    3.6.6 Controls for AI/ML autonomy, re-parametrization and drift · 3.6.7
    Issues shared promptly with stakeholders
15. **Model decommission (D.2)** — 3.6.8 Decommission criteria · 3.6.9
    Disciplined process with stakeholder notice · 3.6.10 Retired model and
    documentation retained · 3.6.11 Third-party decommission actions · 3.6.12
    Downstream effects monitored
16. **Appendix 1 – Model information tracking** — A.1 Minimum information for
    every identified model · A.2 Additional information for inventoried models

Each item: `title`, `description` (1–3 sentences, paraphrased), `summary`
(one line), `questions[]` (2–6, covering the sub-bullets), `evidence_examples[]`
(2–5 documents). Items 2.1.4, 2.2.x, 3.4.x and A.x are the ones phase 2 will
link to MRM records.

**Item keys (my call, builder check).** The registry has no per-item key
column, only serial ids, titles and `order_no`. Phase 1 adds no schema change.
The stable key for an item is its position: (group `order_no`, item
`order_no`), set explicitly in the seed. Phase 2 keys on that pair (never on
the serial id or the title text); if it needs a real code column it adds one
then and backfills from the pair. Consequence for phase 1: every group and
item sets `order_no` explicitly, and future content edits append rather than
renumber.

Framework description (seed): one sentence on what E-23 covers, then
"Based on OSFI Guideline E-23 – Model Risk Management (2027), published
September 11, 2025, effective May 1, 2027. Requirements are paraphrased; see
<URL> for the official text."

## Implementation (per `docs/technical/guides/adding-new-framework.md`)

- `Servers/structures/OSFI-E-23/osfi-e23.structure.ts`: id **26**, key
  `osfi-e23`, `framework_type` `osfi_e23`, two-level. Tables
  `osfi_e23_principles_struct`, `osfi_e23_requirements_struct`,
  `osfi_e23_requirements`, `osfi_e23_requirements__risks`; entity type
  `requirement`; source label "OSFI E-23 requirements".
- Register in `FRAMEWORK_STRUCTURES`; `makeCreate` / `makeDelete` wrappers;
  `frameworkAdditionMap` / `frameworkDeletionMap` /
  `frameworkFilesDeletionSourceMap`; `FileSource` union + column ENUM;
  `NotesAttachedToEnum` `OSFI_E23_REQUIREMENT`; tenant-isolation audit
  entries (and `tenantIsolation.registry.ts` if bundled impl tables are listed
  there).
- New idempotent migration (`date`-generated timestamp): frameworks row,
  struct tables + seed, status enum, impl and `__risks` tables, guarded by
  `SELECT 1 FROM verifywise.frameworks WHERE id = 26`.
- **Upgrade-path fix:** `20261117140851-build-empty-bundled-frameworks.js`
  (added after v2.6.8, unreleased) loops over every registry entry and queries
  its `l2_impl` table. On a database upgrading from v2.6.8 it runs before the
  E-23 migration and would hit "relation does not exist" for
  `osfi_e23_requirements`. Add a `to_regclass('verifywise.<l2_impl>') IS NULL
  → continue` guard to that loop. Databases that already ran it are not
  affected (sequelize does not re-run it).
- Client: badge `Clients/public/assets/badges/osfi_e23.svg` in the style of the
  existing badges; `frameworkBadge.ts` entry keyed by the exact seed name.
- Docs: `CLAUDE.md` (21→22 bundled, ids 5–26), `Servers/CLAUDE.md`,
  `compliance-frameworks.md` catalog table, `adding-new-framework.md` (next id
  27), the route doc comment behind swagger's "ids 5-25" text then
  `generate:swagger` / `generate:endpoints`. Update "Last Updated" dates.
- User guide: add E-23 to the frameworks guide
  (`shared/user-guide-content/content/compliance/adding-frameworks.ts` and any
  framework list), mention it from the MRM guide page, mirror changed files to
  `~/website/verifywise/content/user-guide/`, run the humanizer on new copy.

## Verification

- `cd Servers && npm run build && npm run test` (unit, never bare `npx jest`).
- Migration on the dev DB, and on a scratch DB restored to the v2.6.8 schema
  to prove the upgrade path (both 20261117 and the new migration succeed).
- `cd Clients && npm run typecheck && npm run i18n:audit:strict &&
  npm run format-check && npm run build`; `format-check` in Servers too.
- Semgrep PR gate locally.
- Browser: add E-23 under Manage frameworks, open items, save status, evidence,
  a risk link and a note; remove the framework and confirm impl rows go.
- `/code-review` before the PR.

## Left to the builder

- Exact item descriptions, questions and evidence examples, within the rules
  above (paraphrase, no product claims, trace to the guideline).
- Whether an existing structure test asserts the registry size or shape and
  needs updating.
- Badge artwork details.
