# Feature 8 — Control coverage gap detector

> Roadmap item 9, verbatim:
> *"Control coverage gap detector — controlsMapping / assessmentMapping var ama 'hangi risk hiçbir controle bağlı değil' sorusunun cevabı yok. governanceOs ve controlEU tabloları üzerinden gap listesi. Compliance audit öncesi en değerli rapor."*

**Status:** approved 2026-09-10. Read-only report. No migration, no writes, no new `relation_type`.

---

## 1. What ships

A single read-only endpoint:

```
GET /api/riskLinks/coverage
```

It answers one question per risk: **is this risk mitigated by at least one control?** — and, when the answer is no, whether that is a finding or merely a project that has not been set up yet.

No rows are written. No migration. No frontend. No LLM call.

---

## 2. Why the obvious two-state report is wrong

### 2.1 The measurement that decides the design

The naive version of this feature is `risks LEFT JOIN <control join tables> WHERE link IS NULL`. Run against the live dev org, that version reports:

```
risks_with_no_control = 37
risks_with_control    =  0
total_active_risks    = 37
```

"All 37 of your risks are uncontrolled" is a maximally alarming audit finding and it is **false**. The reason is one join further out:

```
projects_frameworks_total = 0
controls_eu_total         = 0
```

Not one of the five demo projects has a framework attached, so there are no controls in the organization at all. There is nothing for a risk to be mapped *to*. A report that cannot tell "you forgot to map this risk" from "there is no control catalogue in this project yet" produces 37 false findings on day one and is worse than no report.

### 2.2 Framework attachment is a real flow, not a missing one

Confirmed, so nobody re-opens this:

- `controllers/project.ctrl.ts:250-263` — on project create, when `newProject.framework` is non-empty and no approval workflow is assigned, it calls `createEUFrameworkQuery` (and the ISO/NIST siblings).
- `utils/eu.utils.ts:947` — `createEUFrameworkQuery` runs `createNewAssessmentEUQuery` + `createNewControlsQuery`.
- `utils/eu.utils.ts:844-880` — `createNewControlsQuery` loops `controls_struct_eu` and INSERTs one `controls_eu` row per struct row, then subcontrols.
- The struct catalogue is fully populated: `controls_struct_eu = 103`, `subcontrols_struct_eu = 184`, `frameworks = 4`.

So the demo org is empty because `seed_risk_links_demo.sql` creates projects with raw SQL and never goes through that path — **a demo-data artifact, not the shape of a real install.** §6 fixes it.

### 2.3 Mapping a risk to a control is manual editorial work

This is what makes the report valuable rather than redundant. There is no automatic risk→control mapping anywhere in the codebase. The rows appear only when a person edits a control-side element and picks which risks it mitigates — e.g. `utils/eu.utils.ts:1131-1160`, which reads `risksMitigated` off a subcontrol update, DELETEs the element's existing rows and re-INSERTs the new set.

Manual, per-element, across four frameworks. Risks get missed. That miss is exactly the audit finding, and nothing in the product currently surfaces it.

### 2.4 The risk's own `controls_mapping` / `assessment_mapping` columns are not the answer

The roadmap line names them. They are free-text columns on `risks`, and they are **NULL on all 33 original risks in the dev org** (measured during F7 — the `fieldOverlap` scorer's `shared_control` and `shared_assessment` signals score 0/33 because of it). They are a note field, not a link. Do not "improve" this feature by reading them.

---

## 3. The three states

Every active risk lands in exactly one bucket:

| State | Rule | Meaning |
|---|---|---|
| `covered` | ≥ 1 control-side link | Fine. |
| `gap` | 0 control-side links, **and** at least one of its projects has a framework attached | **The finding.** Someone can fix this today. |
| `no_framework` | 0 control-side links, and no project of this risk has any `projects_frameworks` row | Not a finding. Nothing to map to yet. |

Measured on the live dev org right now:

```
no_framework = 37
gap          =  0
covered      =  0
```

That is the correct answer, and it is the opposite of what the two-state report says.

**A risk can belong to several projects**, so the `no_framework` test is `NOT EXISTS (… over all of its projects …)` — one framework anywhere is enough to make an unmapped risk a real gap.

**`projects_risks` is joined INNER, deliberately.** A risk with no project row cannot reach a framework, so it would fall into `no_framework`. That is the right bucket, but state it explicitly rather than inheriting it from an outer join's NULL handling. (Today `risks_with_no_project = 0`, so this is a correctness guard, not a live case.)

---

## 4. Which tables count as "a control"

`getStructuralNeighboursQuery` (`utils/riskLink.utils.ts:124-175`) already contains the complete, correct, tenant-scoped 10-table UNION over every risk↔element join table. **Copy its `element_links` CTE — do not re-derive it.** It is the source of truth for the column-name split described in §4.1.

F8's delta from that CTE is exactly **one dropped arm**:

**Control-side — 9 arms, these decide `covered` vs `gap`:**

| Table | Column |
|---|---|
| `subcontrols_eu__risks` | `projects_risks_id` |
| `controls_eu__risks` | `projects_risks_id` |
| `subclauses_iso__risks` | `projects_risks_id` |
| `subclauses_iso27001__risks` | `projects_risks_id` |
| `annexcategories_iso__risks` | `projects_risks_id` |
| `annexcontrols_iso27001__risks` | `projects_risks_id` |
| `nist_ai_rmf_subcategories__risks` | `projects_risks_id` |
| `custom_framework_level2_risks` | `risk_id` |
| `custom_framework_level3_risks` | `risk_id` |

**Assessment-side — 1 arm, reported but never counted as coverage:**

| Table | Column |
|---|---|
| `answers_eu__risks` | `projects_risks_id` |

`answers_eu` hangs off `assessments` → `projects_frameworks` via `createNewAssessmentEUQuery`, a tree entirely separate from `createNewControlsQuery`. A risk linked only to a questionnaire answer is **still an audit finding** — "which risk has no control" does not accept a questionnaire response as a control.

It is still reported, as a separate `assessment_link_count` column, because "0 controls but 3 assessment answers" is a materially different conversation from "0 of everything". It costs one CTE branch and prevents the "but it *is* linked to something" objection. It must never affect the state.

Three of the nine control-side tables — `controls_eu__risks`, `custom_framework_level2_risks`, `custom_framework_level3_risks` — have **no INSERT path in the application** (only DELETEs, one test factory, and `scripts/migrateToSharedSchema.ts`). Keep them in the union anyway: they are control-side semantically, a migrated install can legitimately carry rows, and excluding them buys one saved UNION line at the cost of a correctness bug.

### 4.1 The `projects_risks_id` naming trap — read this before writing the SQL

Eight of these tables name the column `projects_risks_id`. **It holds a `risks.id`, not a `projects_risks.id`.** Two independent proofs:

- `utils/risk.utils.ts:266` — `LEFT JOIN controls_eu__risks cr ON r.id = cr.projects_risks_id`
- the foreign key `subcontrols_eu__risks.projects_risks_id REFERENCES risks(id)`

Joining it to `projects_risks.id` compiles, runs, returns rows, and is wrong. The other two tables use `risk_id` and mean the same thing.

### 4.2 Two more SQL traps

- **`risk_level_autocalculated` is a Postgres enum** (`enum_projectrisks_risk_level_autocalculated`), declared in severity order: `No risk < Very low risk < Low risk < Medium risk < High risk < Very high risk`. So `ORDER BY risk_level_autocalculated DESC` puts "Very high risk" first with **no CASE expression**. Casting it `::text` for the sort gives alphabetical garbage (`High < Low < Medium < No < Very high`) — cast `::text` only in the SELECT list, never in the ORDER BY.
- **`ai_lifecycle_phase` is also an enum.** `trim()` / `lower()` on it fail with `function pg_catalog.btrim(enum_...) does not exist`. Cast `::text`. (Not needed by this query, but it is one column over and has bitten this feature chain before.)

Application SQL uses **unqualified** table names (`risks`, not `verifywise.risks`) — `search_path` handles it.

---

## 5. The response

```ts
export interface CoverageGapRisk {
  id: number;
  risk_name: string;
  risk_owner: number | null;
  risk_level: string | null;          // risk_level_autocalculated::text
  mitigation_status: string | null;
  projects: { id: number; name: string; has_framework: boolean }[];
  assessment_link_count: number;      // §4 — context only, never affects state
}

export interface CoverageReport {
  summary: {
    total_active_risks: number;
    covered: number;
    gap: number;
    no_framework: number;
  };
  gaps: CoverageGapRisk[];            // state = 'gap', worst first
  no_framework: CoverageGapRisk[];    // state = 'no_framework', worst first
  truncated: boolean;
}
```

`summary` is computed over **all** active risks, not over the truncated lists — the counts must stay honest when the lists are capped.

Both lists sort by `risk_level_autocalculated DESC, id ASC` (see §4.2: no CASE needed, and `id ASC` makes repeated calls return a stable order).

`covered` risks are counted but never listed. The report exists to show what is missing.

```ts
export const MAX_COVERAGE_ROWS = 500;   // per list
```

`truncated: true` if either list hit the cap. Coarse on purpose — it means "you are not seeing everything", not which list overflowed.

### 5.1 Endpoint

```ts
router.get("/coverage", authenticateJWT, getControlCoverage);
```

**The param-route trap.** `routes/riskLinks.route.ts:34` is `router.get("/:riskId", …)`. Anything registered after it is swallowed — `/coverage` would parse as `riskId = "coverage"`. Register it next to `/dismissals` (line 30) and `/duplicates` (line 33), **above** line 34.

`authenticateJWT` only, no `authorize(["Admin"])` — it matches its two read-only siblings.

**The mount is camelCase.** `app.ts:224` is `app.use("/api/riskLinks", riskLinksRoutes)`, so the real path is `/api/riskLinks/coverage`, not `/api/risk-links/coverage`. The project CLAUDE.md says API endpoints are kebab-case; 12 of the app's mounts contradict it. Pre-existing, out of scope.

---

## 6. Seed data — one framework, one project

The report cannot be demonstrated or validated against an org with no controls. The seed's job is to make **all three states visible at once**.

Attach a framework to **exactly one** demo project. Then:

- that project's risks split into `gap` and `covered`
- the other four projects' risks stay `no_framework`

One attachment gives the full demo and keeps the seed small.

**Raw SQL, not a `ts-node` call into `createEUFrameworkQuery`** — that generates ~300 rows in a loop with no fixed ids, so it cannot be made idempotent the way this repo's seeds are.

### 6.1 The id-block hazard

`seed_risk_links_demo.sql` is idempotent by DELETEing fixed id blocks and re-inserting. Its blocks: 9000-9099 projects, 9100-9199 model inventories, 9200-9299 model risks, 9300-9399 vendors, 9400-9499 vendor risks, 9500-9599 risks, 9600-9699 risk links, 9700-9799 evidence hub. `seed_risk_duplicates_demo.sql` (F7) owns 9560-9579 inside the risks block.

**F8 takes 9800-9899**, subdivided:

| Block | Table |
|---|---|
| 9800-9809 | `projects_frameworks` |
| 9810-9829 | `controls_eu` |
| 9830-9879 | `subcontrols_eu` |

All three tables are currently empty (`max(id) = 0` on each), so the block is free.

### 6.2 Every FK in this subtree is `ON DELETE CASCADE`

Verified against `pg_constraint`:

```
subcontrols_eu__risks.subcontrol_id  -> subcontrols_eu(id)       ON DELETE CASCADE
subcontrols_eu__risks.projects_risks_id -> risks(id)             ON DELETE CASCADE
subcontrols_eu.control_id            -> controls_eu(id)          ON DELETE CASCADE
controls_eu.projects_frameworks_id   -> projects_frameworks(id)  ON DELETE CASCADE
projects_frameworks.project_id       -> projects(id)             ON DELETE CASCADE
```

Two consequences, one good and one dangerous.

**Good:** the clean-slate is a *single* statement. `DELETE FROM projects_frameworks WHERE id BETWEEN 9800 AND 9809` cascades down through `controls_eu` → `subcontrols_eu` → `subcontrols_eu__risks`. There is no DELETE-ordering hazard, because there is only one DELETE. Do not write four.

**Dangerous:** for the same reason, an over-wide DELETE on `projects_frameworks` silently destroys a real tenant's entire control tree, evidence links and all — with no error and no row count that looks alarming. The `WHERE id BETWEEN 9800 AND 9809` is the only thing standing between the seed and that outcome.

**Never widen any DELETE to 9500-9599, and never write an unqualified `DELETE FROM projects_frameworks` or `DELETE FROM controls_eu`.** The first wipes the Feature 1-7 demo data the user tests against; the second is the cascade above.

### 6.3 Contents

Framework 1 is EU AI Act (confirmed against the `frameworks` table; `eu.utils.ts:851` hardcodes `framework_id = 1`).

- one `projects_frameworks` row: project **9001** (Loan Approval Copilot), framework 1
- three `controls_eu` rows pointing at real `control_meta_id` values from `controls_struct_eu`
- five or six `subcontrols_eu` rows under them, real `subcontrol_meta_id` values from `subcontrols_struct_eu`
- `subcontrols_eu__risks` rows mapping exactly three of project 9001's fourteen risks

**Pin the mapped ids** so the demo is reproducible and the verification can assert on it. Project 9001 holds risks 9501-9506, 9526-9528, 9530 and F7's duplicate block 9561-9564. Map these three:

| Risk | Level | Why this one |
|---|---|---|
| 9501 | High risk | Discriminatory lending outcomes — the headline risk of the project |
| 9505 | Very high risk | Training data retention — proves a Very high risk *can* be covered |
| 9561 | Medium risk | Vendor assessment overdue — one half of F7's duplicate pair |

Everything else in 9001 stays unmapped, which puts **9530 (Very high risk, third-party sub-processor unvetted)** at the top of the gap list. That is the report's whole pitch in one row: your worst uncontrolled risk, named, before the auditor names it.

Mapping 9561 but not its twin 9562 is deliberate — the demo then shows F7 and F8 together: one of a duplicate pair is controlled, the other is not, which is itself a finding.

The point of the seed is the risks it leaves unmapped. After it runs, the report must show all three states non-zero, with 9530 first in `gaps` and 9501 absent from it.

`created_at` has a `now()` default on both `controls_eu` and `subcontrols_eu` — the INSERTs need not supply it. Follow the existing conventions otherwise: `SET search_path TO verifywise, public;`, wrapped in `BEGIN; … COMMIT;`, org 1 / user 1, every row `is_demo = true`.

---

## 7. Out of scope

- Any write. No `risk_links` row, no `governance_coverage_cache` row, no migration.
- Frontend.
- `governance_coverage_cache` — it exists but answers a different question (control→framework coverage per project, not risk→control). Do not read it, do not write it, do not "unify" the two.
- Vendor risks and model risks. `risk_links` reaches them; control mappings do not.
- Suggesting *which* control a gap risk should map to. That is F1's job, and it is already shipped.
- Any change to `getStructuralNeighboursQuery`, `getRiskGraphQuery` or `getDismissalAnalyticsQuery`.

---

## 8. Deferred: the orphan-mapping audit

The same 10 join tables have a second, uglier question behind them: **rows pointing at risks that no longer exist.**

Eighteen tables reference `risks(id)`. Only five have a foreign key — `projects_risks`, `frameworks_risks`, `subcontrols_eu__risks`, and both `risk_links` columns. The other thirteen have no FK and therefore no CASCADE, including seven of the nine control-side tables in §4:

`controls_eu__risks`, `answers_eu__risks`, `annexcategories_iso__risks`, `annexcontrols_iso27001__risks`, `nist_ai_rmf_subcategories__risks`, `subclauses_iso__risks`, `subclauses_iso27001__risks`, `custom_framework_level2_risks`, `custom_framework_level3_risks`, `fria_risk_items`, `project_risk_change_history`.

`autoDriver.driver.ts:631` and `risk.utils.ts:1010` clean some of these by hand on delete. Anything they miss is a silent orphan.

In a compliance product an orphaned control-to-risk mapping is an audit finding, not a bug report: the control claims to mitigate a risk that is gone. But it is a different report with a different audience, and it needs a decision about whether to repair or merely list. Deferred.

---

## 9. Tests

**Unit — `Servers/services/riskLinks/__tests__/coverage.test.ts`** (mock the query):

1. A risk with a control-side link → `covered`, absent from both lists.
2. A risk with no links whose project has a framework → `gap`.
3. A risk with no links and no framework anywhere → `no_framework`, **not** `gap`.
4. A risk linked **only** via `answers_eu__risks` → still `gap`, with `assessment_link_count = 1`. This is §4's rule and the one most likely to be "fixed" by a future reader.
5. A risk in two projects, one with a framework and one without → `gap`, not `no_framework`.
6. `summary` counts every active risk even when the lists are capped, and `truncated` is true.

**Integration — `Servers/tests/integration/riskLinks.coverage.test.ts`:**

1. Seeded gap risk appears in `gaps`; seeded mapped risk does not.
2. A risk whose project has no framework appears in `no_framework`, not in `gaps`.
3. **The endpoint writes nothing.** Seed one unrelated `risk_links` row first, then assert `SELECT count(*) FROM risk_links` is identical before and after. Without the seeded row the assertion is `0 === 0` and proves only that the table was empty.
4. Tenant isolation: a second org's gap risks never appear in org 1's response.
