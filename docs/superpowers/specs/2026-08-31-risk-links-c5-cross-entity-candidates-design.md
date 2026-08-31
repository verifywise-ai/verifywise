# C5: Cross-entity candidate ranking (which vendor / model risk to inherit from)

> **Status:** design, awaiting review
> **Date:** 2026-08-31
> **Follows:** C4 (value-chain inheritance)
> **Roadmap line this closes:** C4 §8's first deferred item — "cross-entity
> suggestions … the honest signal is shared project"

---

## 1. Problem

C4 made a project risk linkable to a vendor risk or a model risk. It did not
make the right one easy to find. The picker in `LinkRiskForm` lists **every
active vendor risk in the organization**, unordered and unqualified. In an org
with fifty vendors the person linking has to already know the answer.

C4 §8 named this gap "cross-entity suggestions" and deferred it to C5, with a
warning attached: it "should be scored and measured with C3's dismissal report
before anyone trusts it." That warning is about a *suggester* — something that
writes `suggested` rows a human must then dismiss. This design does not build
one, so the warning does not bind it. See §3.1.

---

## 2. What the schema actually says

Every claim below was checked against the live database, not inferred.

### 2.1 The three risk tables share no comparable columns

The tier-0 scorer (`providers/fieldOverlap.ts`) compares four fields. Across the
three tables they are almost entirely absent:

| fieldOverlap signal | `risks` | `vendorrisks` | `model_risks` |
|---|---|---|---|
| `risk_category` | yes | **no** | yes, different enum |
| `ai_lifecycle_phase` | yes | **no** | **no** |
| `controls_mapping` | yes | **no** | **no** |
| `assessment_mapping` | yes | **no** | **no** |

For a vendor risk there is not one comparable column. `vendorrisks` carries
`risk_description`, `impact_description`, `likelihood`, `risk_severity`,
`risk_level`, `action_plan`, `action_owner` — and nothing the scorer reads.

### 2.2 The two category vocabularies are disjoint

The one apparent overlap does not survive inspection. The enums share zero
labels:

- `enum_projectrisks_risk_category` — Strategic risk, Operational risk,
  Compliance risk, Financial risk, Cybersecurity risk, Reputational risk, Legal
  risk, Technological risk, Third-party/vendor risk, Environmental risk, Human
  resources risk, Geopolitical risk, Fraud risk, Data privacy risk, Health and
  safety risk
- `enum_model_risks_risk_category` — Performance, Bias & Fairness, Security,
  Data Quality, Compliance

`risks.risk_category` is additionally an *array* (`_enum_projectrisks_risk_category`)
while `model_risks.risk_category` is scalar. The closest pair is "Compliance
risk" against "Compliance", and equating them is a judgement call, not a fact.

**Consequence:** the existing scoring machinery cannot be reused cross-entity,
and there is no second signal to combine with the first. C4 §3.1 was right —
shared project is the only honest signal, and it is the whole of C5.

### 2.3 The join paths exist and are short

Verified through `pg_constraint`, not assumed:

```
subject risk  ->  projects_risks (risk_id, project_id)                      -> projects
vendor risk   ->  vendorrisks.vendor_id -> vendors_projects (vendor_id, project_id) -> projects
model risk    ->  model_risks.model_id  -> model_inventories_projects_frameworks
                                            (model_inventory_id, project_id)        -> projects
```

### 2.4 The model join fans out; the vendor join does not

`model_inventories_projects_frameworks` is keyed on
`(model_inventory_id, project_id, framework_id)`. One model attached to one
project under three frameworks produces **three rows**. The query must be
`DISTINCT` or a model risk appears three times in the ranked set.
`vendors_projects` has no third dimension and does not fan out.

### 2.5 Six columns are nullable, and every one of them fails closed

Filtering a nullable column with `=` silently drops NULL rows. Every such
column here is filtered that way, deliberately and consistently with the rest
of the codebase. An implementer must not "fix" any of them with
`OR ... IS NULL`.

**On the entity tables** — a row with NULL here is simply never ranked:

- `model_risks.model_id`, `vendorrisks.vendor_id` — a risk attached to no
  model or vendor reaches no project.
- `model_risks.organization_id` — the same fail-closed choice C4 §2.3 made.
- `model_risks.is_deleted` — nullable, but `DEFAULT false`, and C4 already
  writes `mr.is_deleted = false` (`riskLink.utils.ts:704`). Match it.

**On the junction tables** — `projects_risks.organization_id`,
`vendors_projects.organization_id` and
`model_inventories_projects_frameworks.organization_id` are all nullable, yet
the codebase filters them by equality anyway; `postMarketMonitoring.utils.ts:849`
is the same join written the same way. C5 follows that convention.

The consequence worth stating out loud: a NULL `projects_risks.organization_id`
on the **subject** risk empties `subject_projects`, and the endpoint then
returns `[]` for that risk. That is the correct failure — an unranked picker,
which is exactly today's behaviour — and it is strictly safer than the
alternative, which would leak candidates across tenants.

`projects` has **no** `is_deleted` column, so the join needs no soft-delete
filter there. Its display column is `project_title`, and its
`organization_id` is `NOT NULL`.

---

## 3. Decisions taken without asking

### 3.1 Rank the picker. Do not write suggestions.

C5 writes nothing to `risk_links`. It produces no `suggested` rows, registers no
`LinkSignalProvider`, and does not participate in recompute.

**Why:** shared project alone is what C4 §3.1 called noise — every vendor risk
in a project against every project risk in it. As a written suggestion that
noise lands in the panel and costs a human a dismissal each. As an *ordering* it
costs nothing: the person is already choosing from that list, and a
badly-ranked list is no worse than today's unranked one.

This is also what releases C5 from C4's calibration gate. The gate exists
because suggestions must be measured before they are trusted; ranking a list the
user is already reading asserts nothing to trust. There is no dismissal data
today — the database is empty and C3 has not shipped — so a design that needed
calibration could not be built at all.

**Rejected:** an admin-triggered pass writing cross-entity `suggested` rows
(C2's shape). Cost-controlled, but it puts the uncalibrated noise in the panel,
which is the one thing that cannot be undone cheaply.

### 3.2 No score, no threshold, no weights

A candidate either shares a project or does not. Introducing a number would
imply a calibration that no data supports.

### 3.3 Sort, never filter

Candidates that share no project stay in the list and stay selectable. Linking
across projects is legitimate — a vendor risk may be inherited by a risk in a
project that vendor is not formally attached to — and hiding it would make C4's
manual path unreachable for that case.

### 3.4 A thin endpoint, not a replacement list endpoint

The endpoint returns identifiers and project titles only. The client keeps its
existing `getAllVendorRisks` / `/modelRisks` fetches and joins in memory.

**Why:** a fuller endpoint returning ranked, enriched candidates would duplicate
the active-filter, soft-delete and tenant logic that already lives in those list
endpoints. Two copies of that logic is the expensive kind of duplication.

**The cost of that choice, stated so nobody codes against the wrong assumption:**
the two sets are filtered independently and can diverge in both directions — a
ranked id whose candidate the picker did not fetch, and a candidate with no
ranking entry. Both are normal. Join by id and ignore whatever does not match;
never assume equal lengths and never index by position.

### 3.5 Both entity types, from the start

C4 supports vendor and model parents symmetrically; ranking only one would make
the picker inconsistent depending on which source is chosen.

---

## 4. The query

One query, one round trip:

```sql
WITH subject_projects AS (
  SELECT pr.project_id
    FROM projects_risks pr
    JOIN risks subject
      ON subject.id = pr.risk_id
     AND subject.organization_id = :organizationId
     AND subject.is_deleted = false
   WHERE pr.risk_id = :riskId
     AND pr.organization_id = :organizationId
)
SELECT DISTINCT 'vendor_risk' AS entity_type, vr.id AS id, p.project_title
  FROM vendorrisks vr
  JOIN vendors_projects vp
    ON vp.vendor_id = vr.vendor_id
   AND vp.organization_id = :organizationId
  JOIN subject_projects sp ON sp.project_id = vp.project_id
  JOIN projects p          ON p.id          = vp.project_id
 WHERE vr.organization_id = :organizationId
   AND vr.is_deleted = false

UNION ALL

SELECT DISTINCT 'model_risk', mr.id, p.project_title
  FROM model_risks mr
  JOIN model_inventories_projects_frameworks mp
    ON mp.model_inventory_id = mr.model_id
   AND mp.organization_id = :organizationId
  JOIN subject_projects sp ON sp.project_id = mp.project_id
  JOIN projects p          ON p.id          = mp.project_id
 WHERE mr.organization_id = :organizationId
   AND mr.is_deleted = false
```

The `JOIN risks subject` mirrors `getRiskLinksForRiskQuery`
(`riskLink.utils.ts:713`), and it is what anchors the tenant check to a
`NOT NULL` column: `risks.organization_id` cannot be NULL, so the subject's
ownership is verified without depending on the nullable
`projects_risks.organization_id` alone.

`DISTINCT` applies per branch and is load-bearing on the model side only (§2.4);
it is written on both for symmetry and costs nothing on the vendor side. The
trailing `ORDER BY entity_type, id, project_title` makes the grouped output
deterministic, which the tests depend on.

Application SQL is unqualified — `search_path` is already `verifywise`. Only
migrations qualify the schema, and C5 has no migration.

The row set is grouped in TypeScript into one entry per `(entity_type, id)` with
its project titles collected.

---

## 5. API

`GET /api/riskLinks/:riskId/shared-projects`

`entityType` reuses C4's shipped literals verbatim — `ParentEntityType` in
`Servers/services/riskLinks/hierarchy.ts:22` and `RiskLinkEntityType` in
`Clients/src/domain/interfaces/i.riskLink.ts:7`. Do not introduce new strings.

Two path segments, so it does not collide with the existing
`GET /api/riskLinks/:riskId`. Auth is `authenticateJWT`, matching every other
read on this router; no role restriction, because the data it exposes is
strictly less than the list endpoints the same user already calls.

```json
[
  { "entityType": "vendor_risk", "id": 12, "projects": ["Fraud Detection"] },
  { "entityType": "model_risk",  "id": 7,  "projects": ["Fraud Detection", "KYC"] }
]
```

An empty array is a valid, common answer: the subject risk belongs to no
project, or none of its projects has an attached vendor or model, or the
`riskId` is not this organization's. None of these is an error — `GET
/api/riskLinks/:riskId` already answers an unknown or foreign risk with an
empty list rather than a 404, and C5 matches it.

Route ordering in `riskLinks.route.ts` does not matter here: `GET /:riskId`
matches one path segment and cannot swallow a two-segment path.

**`swagger.yaml` must gain this operation in the same change.** The repo's
`check:api-drift` compares Express endpoints against Swagger operations and
currently balances at 707 = 707; a new route without its Swagger entry breaks
that check.

---

## 6. UI

In `LinkRiskForm`, when the parent source is `vendor_risk` or `model_risk`,
fetch this alongside the candidate list.

- Candidates sharing a project sort to the top; within each group the existing
  order is preserved, so the change is a stable partition rather than a reshuffle.
- A shared candidate carries a `Same project: <title>` chip. More than one
  shared project renders the first title plus `+N`.
- Everything else renders exactly as it does today.

The panel itself (`LinkedRisksPanel`) is untouched. This is a picker affordance,
not a new kind of link.

---

## 7. Out of scope

- **Written suggestions.** §3.1. If dismissal data ever shows people accept
  shared-project candidates at a high rate, that is the evidence a suggester
  would need — and the argument for building one then.
- **Ranking project-risk-to-project-risk candidates.** The existing tier-0/1
  engine already scores those; this endpoint is only for the cross-entity
  sources that have no scorer.
- **A category bridge between the two vocabularies.** §2.2. Mapping
  "Compliance" to "Compliance risk" is a product decision about taxonomy, not a
  ranking feature.
- **Filtering, thresholds, caps.** §3.2, §3.3.

---

## 8. Test plan

| # | Level | Proves |
|---|-------|--------|
| 1 | integration | a vendor risk whose vendor is attached to the subject's project is returned, with that project's title |
| 2 | integration | a vendor risk in the org whose vendor shares no project with the subject is **not** returned |
| 3 | integration | **§2.4**: a model attached to one project under two frameworks yields exactly one entry, not two |
| 4 | integration | a model risk reached through `model_inventories_projects_frameworks` is returned with `entityType: "model_risk"` |
| 5 | integration | a risk in two projects returns candidates from both, and an entry in both carries both titles |
| 6 | integration | **tenant isolation**: another org's vendor risk sharing a same-named project is never returned |
| 7 | integration | `model_risks.model_id IS NULL` → that risk is absent, not an error (§2.5) |
| 8 | integration | a subject risk in no project returns `[]` with status 200 |
| 9 | integration | a soft-deleted vendor risk is absent |
| 10 | unit | the grouping step collapses repeated `(entity_type, id)` rows into one entry with collected titles |
| 11 | frontend | shared candidates sort above unshared ones, and unshared ones remain present and selectable (§3.3) |
| 12 | frontend | a shared candidate renders the `Same project` chip; two shared projects render `+1` |
