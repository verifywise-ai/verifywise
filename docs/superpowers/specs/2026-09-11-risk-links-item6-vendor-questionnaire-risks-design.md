# Roadmap item 6 — Vendor questionnaire → vendor risk suggestions

> **Numbering note.** This is **roadmap item 6**, not a new "F10". It was skipped:
> after F5 (item 5) the chain jumped to "F6" = item 7, and item 6 fell through the
> gap. The spec filename uses `item6` deliberately so the next reader does not read
> it as an eleventh feature. The other nine items are all implemented on
> `feature/risk-inheritance`.

Roadmap text, verbatim:

> 6. Vendor questionnaire → Vendor Risk auto-create
> Vendor'a anket/atama yapılıyor ama vendorrisks hala manuel. assessment cevabına
> göre risk otomatik üret + vendor risk'i doğru projeye bağla (vendors_projects
> üzerinden). C4/C5'in join path'i hazır.

---

## 1. What the vendor questionnaire actually is

There is **no vendor questionnaire subsystem**. Do not go looking for one.

The "anket" is four enum columns on `vendors`, filled in through the vendor edit
form, plus a derived score:

| Column | Type | Values (exact, copy verbatim) |
|---|---|---|
| `data_sensitivity` | `enum_vendors_data_sensitivity` | `None` / `Internal only` / `Personally identifiable information (PII)` / `Financial data` / `Health data (e.g. HIPAA)` / `Model weights or AI assets` / `Other sensitive data` |
| `business_criticality` | `enum_vendors_business_criticality` | `Low (vendor supports non-core functions)` / `Medium (affects operations but is replaceable)` / `High (critical to core services or products)` |
| `past_issues` | `enum_vendors_past_issues` | `None` / `Minor incident (e.g. small delay, minor bug)` / `Major incident (e.g. data breach, legal issue)` |
| `regulatory_exposure` | `enum_vendors_regulatory_exposure` | `None` / `GDPR (EU)` / `HIPAA (US)` / `SOC 2` / `ISO 27001` / `EU AI act` / `CCPA (california)` / `Other` |
| `risk_score` | `integer` | 0-100, **computed by the client** — see §3 |
| `review_status` | `enum_vendors_review_status` | `Not started` / `In review` / `Reviewed` / `Requires follow-up` / `Superseded` |

Every one of these is already tracked in `vendor_change_history`
(`Servers/config/changeHistory.config.ts:290-320`, `fieldsToTrack`).

Live dev data (org 1):

```
9301 OpenAI    | PII            | High   | Minor incident | EU AI act        | score=72 | Reviewed
9302 Snowflake | Financial data | High   | None           | GDPR (EU)        | score=64 | Requires follow-up
9303 Workday   | PII            | Medium | None           | CCPA (california)| score=48 | In review
```

`assessments = 0` and `answers_eu = 0` rows. The EU-AI-Act assessment flow is
project-level and has nothing to do with vendors.

---

## 2. Three corrections to the roadmap text

### 2.1 "assessment cevabına göre" — there is no vendor assessment

See §1. The four enum columns are the whole questionnaire. This feature reads
those columns; it does not touch `assessments`, `answers_eu`, or
`questions_struct_eu`.

### 2.2 "vendor risk'i doğru projeye bağla (vendors_projects üzerinden)" — impossible

**`vendorrisks` has no project column.** Full column list:

```
id, organization_id, vendor_id, order_no, risk_description, impact_description,
likelihood, risk_severity, action_plan, action_owner, risk_level, is_demo,
created_at, updated_at, is_deleted, deleted_at
```

The only association is `vendor_id`. A vendor risk reaches a project *through* its
vendor (`vendors_projects`), so the project link is a property of the vendor and
there is nothing to bind at the risk row. `vendors_projects` stays untouched.

(The frontend form has a `project_id` field in its local `VendorRiskFormData` —
`Clients/src/presentation/components/AddNewVendorRiskForm/index.tsx:62` — but it
has no column to land in.)

### 2.3 "auto-create" — this feature suggests, it does not write

`vendorrisks` has **no status column**. There is no `suggested` / `confirmed`
state, no `source`, no `score`, no `dismiss_reason` — none of what `risk_links`
carries for exactly this purpose. An auto-inserted row would be indistinguishable
from a risk a human wrote, with only `is_deleted` to undo it.

The chain's precedent settles it: C6 writes `status='suggested', source='agent'`
into a table built for it; F7 (`/duplicates`) and F8 (`/coverage`) are read-only
reports; F9 notifies. This feature is a **read-only suggestion endpoint**. Adding a
status column to `vendorrisks` and writing rows is phase 2, deferred in §10.

---

## 3. The scoring facts that shape the design

### 3.1 `risk_score` is computed by the client and trusted by the server

`calculateVendorRiskScore` lives at
`Clients/src/domain/utils/vendorScorecard.utils.ts:54` — **frontend only**. There
is no backend equivalent. The update controller simply persists whatever arrives:

```ts
// Servers/controllers/vendor.ctrl.ts, inside updateVendorById
await vendorModel.updateVendor({
  ...
  data_sensitivity: updateData.data_sensitivity,
  business_criticality: updateData.business_criticality,
  past_issues: updateData.past_issues,
  regulatory_exposure: updateData.regulatory_exposure,
  risk_score: updateData.risk_score,     // <- client number, stored as-is
});
```

**Therefore this feature must key off the four enum columns, never off
`risk_score`.** The enums are authoritative; the score is a client-supplied
derivative.

### 3.2 The seeded scores do not match the formula

The formula is
`(sensitivity/5)*0.3 + (criticality/3)*0.3 + (pastIssues/3)*0.2 + (regulatory/1)*0.2`,
rounded to 0-100. Applied to the live rows:

| Vendor | Computed | Stored | |
|---|---|---|---|
| 9301 OpenAI | **69** | 72 | mismatch |
| 9302 Snowflake | **74** | 64 | mismatch |
| 9303 Workday | **52** | 48 | mismatch |

All three seeded scores are hand-written and disagree with the repo's own formula.
Recorded here so a reviewer who spot-checks does not conclude the formula is
broken. Nothing in this feature reads or rewrites `risk_score`.

### 3.3 `regulatory_exposure` is effectively binary

Every non-`None` value maps to 1 and the max is 1, so the dimension contributes a
flat +20 whether the vendor is under GDPR, SOC 2, or `Other`. The suggestion
engine therefore treats regulatory exposure as present/absent and names the
specific regime only in the text.

---

## 4. The feature: `GET /api/vendors/:id/riskSuggestions`

Read-only. For one vendor, derive the vendor risks its questionnaire answers imply,
suppress the ones it already has, and return the rest with the reason attached.

### 4.0 This feature needs no new query

Both data sources already exist and are already org-scoped:

- `getVendorByIdQuery(id, organizationId)` — `Servers/utils/vendor.utils.ts:70`.
  `SELECT *`, so the four questionnaire columns come back on the returned `IVendor`.
  Returns `null` for a vendor in another org, which is the 404 path.
- `getVendorRisksByVendorIdQuery(vendorId, organizationId, "active")` —
  `Servers/utils/vendorRisk.utils.ts:39`. The `"active"` filter is already
  `AND is_deleted = false`.

Do not add a query to `vendor.utils.ts` or `vendorRisk.utils.ts`. The service
composes these two.

### 4.1 The four archetypes

One per questionnaire dimension. A dimension that reads "no exposure" produces
nothing.

| # | Trigger | Suggested `risk_severity` | `likelihood` | Derived `risk_level` (§5) |
|---|---|---|---|---|
| A | `data_sensitivity` is not `None` and not `Internal only` | `Health data (e.g. HIPAA)` → `Catastrophic`; `Financial data` / `Personally identifiable information (PII)` / `Model weights or AI assets` → `Major`; `Other sensitive data` → `Moderate` | `Possible` | High / High / Medium |
| B | `business_criticality` = `High (critical to core services or products)` | `Major` | `Unlikely` | Medium |
| C | `past_issues` = `Minor incident (e.g. small delay, minor bug)` → `Minor`; = `Major incident (e.g. data breach, legal issue)` → `Major` | | `Likely` | Medium / High |
| D | `regulatory_exposure` is not `None` | `Moderate` | `Possible` | Medium |

`Internal only` is deliberately excluded from A: it scores 1 of 5 on the client
formula and does not warrant a standing risk entry. `Low` and `Medium` business
criticality are excluded from B for the same reason.

### 4.2 Text, and the display-label map

Each archetype produces a `risk_description` and an `impact_description`. The
questionnaire answer is named in the text — but through a **short display label**,
not the raw enum value. Interpolating the raw value yields nested parentheses
(`Sensitive data (Health data (e.g. HIPAA)) is processed...`) and drags the
parenthetical's words (`hipaa`) into the suppression tokens. One map, used for both
the text and the tokens:

| Raw enum value | Display label |
|---|---|
| `Personally identifiable information (PII)` | `PII` |
| `Financial data` | `financial data` |
| `Health data (e.g. HIPAA)` | `health data` |
| `Model weights or AI assets` | `model weights or AI assets` |
| `Other sensitive data` | `other sensitive data` |
| `Minor incident (e.g. small delay, minor bug)` | `a minor incident` |
| `Major incident (e.g. data breach, legal issue)` | `a major incident` |
| `GDPR (EU)` | `GDPR` |
| `HIPAA (US)` | `HIPAA` |
| `SOC 2` / `ISO 27001` | unchanged |
| `EU AI act` | `the EU AI Act` |
| `CCPA (california)` | `CCPA` |
| `Other` | `other regulations` |

- **A** — `Sensitive data ({label}) is processed by this vendor without evidenced safeguards`
- **B** — `Service continuity exposure: this vendor is critical to core services or products`
- **C** — `Recurrence of {label} previously recorded against this vendor`
- **D** — `Compliance obligations under {label} are not evidenced for this vendor`

`reasons` (§4.3) carries the **raw** enum value, not the label — it is the audit
trail, and it must say exactly what is stored in the column.

`impact_description` and `action_plan` are fixed per archetype — write plain,
specific sentences, not placeholders. These are display strings a human will paste
into a real risk, so they must read like something a GRC analyst wrote.

### 4.3 `reasons`

Every suggestion carries a `reasons: string[]` naming the field and value that
triggered it, e.g. `["data_sensitivity: Financial data"]`. Mirrors `risk_links.reasons`.
Display context — it never affects inclusion.

### 4.4 Ordering

By derived risk level, worst first, then by archetype letter for stability.
`risk_level` is a `character varying`, not an enum, so there is no free ORDER BY —
rank it in JS with an explicit map:

```ts
const LEVEL_RANK: Record<string, number> = {
  "Very High": 5, High: 4, Medium: 3, Low: 2, "Very Low": 1,
};
```

### 4.5 No caps needed

A vendor has four questionnaire dimensions, so the endpoint returns **at most four
suggestions**. Unlike F7 and F8 there is no combinatorial blowup and no
`MAX_*_RESULTS` constant.

The one bound is on the existing-risks scan used for suppression:
`MAX_EXISTING_VENDOR_RISKS = 200`. Apply it as a `.slice(0, MAX_EXISTING_VENDOR_RISKS)`
**in the service**. Do not add a `LIMIT` to `getVendorRisksByVendorIdQuery` — it is
shared with the vendor risk controllers and truncating it there would silently drop
rows from an unrelated screen.

---

## 5. Deriving `risk_level` — reuse the matrix that already exists

`Servers/utils/validations/vendorRiskValidation.utils.ts:216` already defines
`RISK_CALCULATION_MATRIX`, and line 257 exports:

```ts
export const calculateRiskLevel = (riskSeverity: string, likelihood: string): string | null
```

It returns `"Very Low" | "Low" | "Medium" | "High" | "Very High"` — **no ` Risk`
suffix**. Stored `vendorrisks.risk_level` values carry the suffix (`High Risk`,
`Very High Risk`), so the service appends `" Risk"`.

**It has zero callers.** Nothing in `Servers/` imports it today — verified by grep.
This feature becomes its first caller. That is why the hardcoded value in §10.1
has survived unchallenged.

### 5.1 Two traps

1. **Do not use `calculateRiskLevel` from `riskValidation.utils.ts`.** There are two
   functions with that name. The *project-risk* one (`riskValidation.utils.ts:473`)
   uses a weighted formula and a `LIKELIHOOD_SCALE` whose top value is
   `"Almost Certain"` — capital C. The `vendorrisks` enum is `Almost certain`,
   lowercase c, so that function's `|| 1` fallback silently scores the most likely
   vendor risk as the **least** likely. Import from
   `utils/validations/vendorRiskValidation.utils` only.

2. **The seeded vendor risks disagree with the matrix.** Running the matrix over the
   8 demo rows:

   | id | severity / likelihood | matrix says | stored | |
   |---|---|---|---|---|
   | 9401 | Major / Possible | High | High Risk | ok |
   | 9402 | Moderate / Likely | High | Medium Risk | mismatch |
   | 9403 | Catastrophic / Possible | High | Very High Risk | mismatch |
   | 9404 | Moderate / Likely | High | Medium Risk | mismatch |
   | 9405 | Major / Unlikely | Medium | Low Risk | mismatch |
   | 9406 | Major / Possible | High | High Risk | ok |
   | 9407 | Minor / Likely | Medium | Medium Risk | ok |
   | 9408 | Minor / Unlikely | Low | Low Risk | ok |

   4 of 8 disagree. The seed's levels are hand-written. This feature does not
   correct them — it only derives levels for its own suggestions.

---

## 6. Suppression: do not suggest a risk the vendor already has

Load the vendor's existing `vendorrisks` with the existing
`getVendorRisksByVendorIdQuery(vendorId, organizationId, "active")`, sliced to
`MAX_EXISTING_VENDOR_RISKS`. For each archetype, compare its `risk_description`
against each existing `risk_description` with Jaccard similarity over word tokens.
If any existing risk scores at or above `VENDOR_SUGGESTION_SUPPRESS_THRESHOLD =
0.25`, drop the archetype and do not report it.

Same tokenisation rule F7 measured and settled on: lowercase, `[^a-z0-9 ]` → space,
split on whitespace, drop tokens of length ≤ 2, into a `Set`. Empty set on either
side scores 0 — never divide by zero.

**Write a local four-line `tokenise(text: string): Set<string>`.** Do not import
`tokeniseRisk` from `services/riskLinks/duplicates.ts`: its signature is bound to
`DuplicateScanRow`, and widening it would mean editing a verified F7 file for no
gain.

The suppressed archetypes are not silently dropped from the response — see §7.

---

## 7. Response shape

```ts
export interface VendorRiskSuggestion {
  archetype: "data_sensitivity" | "business_criticality" | "past_issues" | "regulatory_exposure";
  risk_description: string;
  impact_description: string;
  action_plan: string;
  likelihood: string;      // a valid enum_vendorrisks_likelihood value
  risk_severity: string;   // a valid enum_vendorrisks_risk_severity value
  risk_level: string;      // e.g. "High Risk"
  reasons: string[];
}

export interface VendorRiskSuggestionReport {
  vendor_id: number;
  vendor_name: string;
  questionnaire_complete: boolean;   // all four columns non-null
  existing_risk_count: number;
  suggestions: VendorRiskSuggestion[];
  suppressed: { archetype: string; matched_vendor_risk_id: number }[];
}
```

`questionnaire_complete = false` with an empty `suggestions` array is the honest
answer for a vendor nobody has assessed — it is not the same as "no risks found".
The UI needs to tell those apart, which is why the flag exists rather than being
inferred from an empty list.

`suppressed` makes the report auditable: a user who expects a suggestion can see
which existing risk absorbed it.

Tenant isolation: every query filters `organization_id`. A vendor id from another
org returns 404, not an empty report.

---

## 8. Route

`Servers/routes/vendor.route.ts` currently:

```ts
router.get("/", authenticateJWT, getAllVendors);
router.get("/project-id/:id", authenticateJWT, getVendorByProjectId);
router.get("/:id", authenticateJWT, getVendorById);
```

Add:

```ts
router.get("/:id/riskSuggestions", authenticateJWT, getVendorRiskSuggestions);
```

**No ordering hazard here.** Unlike the `/coverage` vs `/:riskId` collision in F8,
`router.get("/:id")` matches a single path segment and cannot swallow
`/:id/riskSuggestions`. Placement is free; put it after `/:id` for readability.

`authenticateJWT` only, no `authorize(["Admin"])` — matches `/dismissals`,
`/duplicates` and `/coverage`, all read-only reports.

Mount point is `app.use("/api/vendors", vendorRoutes)` — camelCase segment in the
path, matching `/api/riskLinks` and `/api/vendorRisks`.

API docs are generated:

```bash
cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift
```

CI job `api-docs-drift` fails if the regenerated files are not included.

---

## 9. Seed — `Servers/seed_vendor_questionnaire_demo.sql`

### 9.1 The id-block hazard

`Servers/seed_risk_links_demo.sql` clean-slate deletes the **whole** vendor ranges:

```sql
DELETE FROM vendorrisks      WHERE id BETWEEN 9400 AND 9499;
DELETE FROM vendors_projects WHERE vendor_id BETWEEN 9300 AND 9399;
DELETE FROM vendors          WHERE id BETWEEN 9300 AND 9399;
```

So item 6's rows live inside a range the base seed wipes. That is acceptable — the
base seed is a full reset — but it fixes the run order: **`seed_risk_links_demo.sql`
first, then `seed_vendor_questionnaire_demo.sql`.** State this in a comment at the
top of the new file.

Item 6's own clean-slate must be **narrow**: `9310-9319` for vendors, `9410-9419`
for vendor risks. Never widen to 9300-9399 or 9400-9499 — that destroys the
Features 1-5 demo data the user tests against.

`vendorrisks.vendor_id → vendors(id) ON DELETE CASCADE` and
`frameworks_vendorrisks.vendorrisk_id → vendorrisks(id) ON DELETE CASCADE`, so
deleting a seeded vendor takes its risks with it. Delete vendor risks first anyway,
for the same explicitness the base seed uses.

Sequences, following `seed_risk_links_demo.sql:296-297` — the floor is the **end**
of the block, not `MAX(id)`:

```sql
SELECT setval('verifywise.vendors_id_seq',     GREATEST((SELECT COALESCE(MAX(id),0) FROM vendors),     9399));
SELECT setval('verifywise.vendorrisks_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM vendorrisks), 9499));
```

### 9.2 Contents

Existing vendors 9301-9303 already give a good spread and need no change — leave
them alone. The seed adds what they do not cover:

| id | vendor | questionnaire | expected |
|---|---|---|---|
| 9310 | `Demo Vendor - Unassessed` | all four `NULL` | `questionnaire_complete: false`, 0 suggestions |
| 9311 | `Demo Vendor - No Exposure` | `None` / `Low (...)` / `None` / `None` | complete, **0 suggestions** |
| 9312 | `Demo Vendor - Max Exposure` | `Health data (e.g. HIPAA)` / `High (...)` / `Major incident (...)` / `HIPAA (US)` | complete, **4 suggestions** |

Plus one vendor risk to prove suppression:

| id | vendor | `risk_description` |
|---|---|---|
| 9410 | 9312 | `Health data processed by this vendor lacks documented safeguards` |

9312 must then return **3** suggestions with archetype `data_sensitivity` listed
under `suppressed`, pointing at 9410. That row is the point of the seed.

**The similarity is measured, not guessed — do not re-tune the threshold to make a
test pass.** Archetype A for 9312 reads `Sensitive data (health data) is processed by
this vendor without evidenced safeguards`; tokens of length ≤ 2 drop (`is`, `by`),
leaving 9 tokens. Row 9410 leaves 8. They share `health`, `data`, `processed`,
`this`, `vendor`, `safeguards` — 6 of a 11-token union:

```
Jaccard = 6 / 11 = 0.545      (threshold 0.25 — suppressed)
```

The seed text is deliberately a paraphrase rather than a copy of the archetype. An
identical string would score 1.00 and prove nothing about the tokeniser.

The counter-case is already in the base seed and needs no new row: 9401
`Sub-processor list changes without the contractual 30-day notice` shares only
`without` with archetype A — `1 / 17 = 0.059`, far below the threshold, so a vendor's
unrelated existing risks never suppress a real suggestion.

Conventions, same as the base seed: `SET search_path TO verifywise, public;`,
wrapped in `BEGIN; ... COMMIT;`, org 1 / user 1, every row `is_demo = true`.
`vendors` requires `vendor_name`, `vendor_provides`, `website` and
`vendor_contact_person` — all `NOT NULL`.

---

## 10. Out of scope

- **Writing any `vendorrisks` row.** The endpoint is read-only. Grep the diff for
  `INSERT INTO vendorrisks`: the only permitted hit is the seed.
- Any migration. This feature adds no column and no enum value.
- Any frontend file.
- `risk_score` — neither read nor recomputed. Porting `calculateVendorRiskScore` to
  the backend is a separate decision (§10.2).
- `vendors_projects`, `frameworks_vendorrisks`, `assessments`, `answers_eu`.
- Org-wide sweep (`GET /api/vendors/riskSuggestions` across every vendor). Per-vendor
  matches where a user acts. Deferred.

### 10.1 Deferred, and worth the user's attention

**`Clients/src/presentation/components/AddNewVendorRiskForm/index.tsx:308`
hardcodes `risk_level: "High Risk", // TODO: Make this dynamic`.** Every vendor risk
a real user creates through the UI is labelled High Risk regardless of the
likelihood and severity they picked. The correct matrix is sitting unused two files
away (§5). This is a one-line frontend fix, but the chain has been backend-only
since F5, so it is flagged rather than bundled. The user decides.

**`Servers/utils/validations/vendorRiskValidation.utils.ts` is dead code** apart from
what this feature starts using. `validateRiskLevelCalculation` — which would have
rejected the hardcoded value — is never called from any controller.

### 10.2 Phase 2 — actually creating the rows

Requires a migration adding a status/source pair to `vendorrisks` so a suggested row
is distinguishable from a human's, plus a dismissal path mirroring C3. Not worth it
until the read-only report has been looked at and its precision judged, which is
exactly the sequence C5 → C6 followed.

### 10.3 `vendorrisks` has no date column

Found during F9: there is no `deadline`, `target_date` or `review_date` on
`vendorrisks`, which is why F9's deadline escalation covers `risks` and
`model_risks` but not vendor risks. Unchanged by this feature; noted so the gap is
not rediscovered a third time.

---

## 11. Tests

### Unit — `Servers/services/vendors/__tests__/riskSuggestions.test.ts`

Mock the two queries. Seven tests:

1. A vendor with all four dimensions triggering → four suggestions, correct
   archetypes.
2. A vendor with `None` / `Low (...)` / `None` / `None` → zero suggestions,
   `questionnaire_complete: true`.
3. A vendor with all four columns `NULL` → zero suggestions,
   `questionnaire_complete: false`.
4. `Internal only` produces no `data_sensitivity` suggestion; `Personally
   identifiable information (PII)` does.
5. An existing vendor risk whose text overlaps an archetype → that archetype is
   absent from `suggestions` and present in `suppressed` with the right
   `matched_vendor_risk_id`.
6. `risk_level` is derived, not hardcoded: `Health data (e.g. HIPAA)` yields
   `Catastrophic` / `Possible` / `High Risk`; assert the exact string including the
   ` Risk` suffix.
7. Ordering: worst level first, stable for equal levels.

### Integration — `Servers/tests/integration/vendors.riskSuggestions.test.ts`

Follow `Servers/tests/integration/riskLinks.duplicates.test.ts` for setup and
teardown. Four tests:

1. A seeded vendor with exposure → suggestions returned by
   `GET /api/vendors/:id/riskSuggestions`.
2. A vendor whose existing risk matches an archetype → that archetype suppressed.
3. **The endpoint writes nothing**: assert `SELECT count(*) FROM vendorrisks` is
   identical before and after the call, with at least one row already present so the
   assertion is not `0 === 0`.
4. Tenant isolation: a vendor belonging to a second org returns 404 for org 1.
