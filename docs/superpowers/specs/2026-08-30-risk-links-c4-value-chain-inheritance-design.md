# C4: Value-chain inheritance (vendor risk / model risk → project risk)

> **Status:** design, awaiting review
> **Date:** 2026-08-30
> **Follows:** C1 (two-level grouping), C2 (direction job), C3 (dismissal reason)
> **Roadmap line this closes:** "Value-chain inheritance (vendor → model → project risk) | its own data model"

---

## 1. Problem

A project risk is often not original. It is inherited: the vendor you bought the
model from carries a risk, and your project carries it too. Today `risk_links`
cannot express that. Both endpoint columns foreign-key to `verifywise.risks(id)`,
so a link can only ever join two project risks. C1 said so explicitly when it
deferred this:

> Cross-entity inheritance. `model_risks` and `vendorrisks` are separate tables;
> `risk_links` foreign-keys to `risks(id)` only. That is C4.

C4 makes a vendor risk or a model risk usable as the **parent** of a project
risk, reusing every piece of machinery C1–C3 already shipped: the same table,
the same status lifecycle, the same confirm/dismiss endpoint, the same panel.

---

## 2. What the schema actually says

This section is load-bearing. Four facts from inspecting the live database
changed the design, and two of them contradict the roadmap's own wording.

### 2.1 The value chain is not in the schema

The roadmap says "vendor → model → project risk". **`model_inventories` has no
`vendor_id` column.** It has `provider`, `model` and `hosting_provider`, all
free text. There is no foreign key from a model to a vendor, so the
"vendor → model" leg cannot be traversed, joined, or trusted.

What *does* exist:

| Edge | Mechanism |
|------|-----------|
| `vendorrisks` → `vendors` | `vendorrisks.vendor_id` FK |
| `model_risks` → `model_inventories` | `model_risks.model_id` FK |
| vendors → projects | `vendors_projects` join table |
| models → projects | `model_inventories_projects_frameworks` join table |
| risks → projects | `projects_risks` join table |

So the hub is the **project**, not the vendor. C4 therefore links
*vendor risk → project risk* and *model risk → project risk* as two independent
legs. It does **not** link vendor risk → model risk: there is no relationship in
the schema that would justify one.

### 2.2 The three risk tables are structurally dissimilar

| Concept | `risks` | `model_risks` | `vendorrisks` |
|---------|---------|---------------|---------------|
| Name | `risk_name` VARCHAR **NOT NULL** | `risk_name` VARCHAR nullable | **absent** |
| Description | — | `description` TEXT | `risk_description` TEXT |
| Level | `risk_level_autocalculated` enum | `risk_level` enum | `risk_level` VARCHAR |
| Owner | `risk_owner` INTEGER | `owner` INTEGER | `action_owner` INTEGER |
| Org | `organization_id` NOT NULL | `organization_id` **nullable** | `organization_id` NOT NULL |
| Soft delete | `is_deleted` | `is_deleted` | `is_deleted` |

Two consequences the implementer must not be left to improvise:

- **`vendorrisks` has no name.** The panel needs a display fallback, specified
  exactly in §5.2 so three tasks do not invent three different truncations.
- **All three owner columns are `INTEGER`.** The owner projection is the one
  part that normalizes for free.

### 2.3 `model_risks.organization_id` is nullable — and that is safe here

Nullable is a legacy artifact; every write path in `modelRisk.utils.ts` sets it,
and every read path filters on it. C4 follows the same pattern
(`mr.organization_id = :organizationId`). A row with a NULL org fails the
equality and is therefore **invisible** to the panel. Fail-closed, which is the
correct direction for a tenant boundary.

### 2.4 The single-parent index already covers cross-entity links

`risk_links_single_parent_idx` is:

```sql
CREATE UNIQUE INDEX risk_links_single_parent_idx
  ON verifywise.risk_links (source_risk_id)
  WHERE relation_type = 'inherits_from' AND status = 'confirmed';
```

It is keyed on `source_risk_id` **alone** — the child column. In value-chain
inheritance the child is always the project risk, so the child column stays a
plain `NOT NULL` FK to `risks(id)`. **C1's "exactly one parent" guarantee
extends across entity types with no migration on the constraint.** A project
risk cannot hold a confirmed vendor-risk parent and a confirmed project-risk
parent at the same time — the existing index rejects the second one atomically.

This single fact is what makes C4 cheap, and it is why §3.2 chose the storage
shape it did.

---

## 3. Decisions taken without asking

Four decisions materially shape the work. Each is recorded here with its
rationale and the alternative rejected, so review is a yes/no rather than an
archaeology exercise. **If any is wrong, say so before the plan is executed —
each one changes task boundaries.**

### 3.1 C4 is manual-only. No suggestion engine.

Cross-entity links are created by a human and land as
`status = 'confirmed', source = 'user'` — the state C1's POST endpoint already
produces. No scoring, no `LinkSignalProvider`, no recompute participation.

**Why:** the only structural signal available is "shared project", and §2.1
shows the vendor→model leg does not exist to strengthen it. A suggester built on
shared-project alone would propose every vendor risk against every project risk
in that project — noise, and noise is what C3 was spent measuring. Manual links
reuse the entire existing machinery and add zero engine code.

**Rejected:** shipping a shared-project suggester in C4. That is a genuine seam,
not a gap — see §8.

### 3.2 Widen `risk_links` on the parent side only, with typed nullable FKs

Keep `source_risk_id` exactly as it is. Make `target_risk_id` nullable and add
two sibling columns, each a real FK.

**Why:** §2.4. The child side carries the single-parent index, the cascade, and
C1's guarantee — touching it would put a shipped constraint at risk for nothing.
Typed columns keep every foreign key and every `ON DELETE CASCADE` intact, which
a polymorphic `(entity_type, entity_id)` pair would throw away.

**Rejected — a separate `risk_entity_links` table:** it leaves `risk_links`
untouched but duplicates the status lifecycle, the dismissal columns, the
controller, and the panel data source. Two machines to keep in step.

**Rejected — polymorphic `(target_entity_type, target_entity_id)`:** one column
pair instead of two, but it deletes both FKs and the cascade, and orphan cleanup
becomes application code that someone has to remember to write.

### 3.3 One direction only: the panel lives on the project risk

A vendor risk or model risk can be a **parent**, never a child. The linked-risks
panel appears only where it appears today — `AddNewRiskForm`. `VendorRisksDialog`
and the `NewModelRisk` modal get nothing in C4.

**Why:** the value chain reads "this project risk inherits from that vendor
risk", and the user is on the project risk when they care. Symmetry would mean
mounting the panel in two more surfaces and answering "what does it mean for a
vendor risk to have a parent?" — a question C4 does not need to answer.

### 3.4 Cross-entity links are `inherits_from` only

`related_to` is rejected at the API boundary and forbidden by a CHECK constraint.

**Why:** `risk_links_canonical` enforces smaller-id-first ordering for
`related_to` by comparing bare integers. Across tables those integers come from
different sequences and the comparison is meaningless — worse, with a NULL
`target_risk_id` the CHECK evaluates to NULL and **passes silently**. Forbidding
the combination closes the hole instead of letting it rot. C4 is named
inheritance; this costs nothing.

---

## 4. Data model

### 4.1 Migration

```sql
ALTER TABLE verifywise.risk_links
  ALTER COLUMN target_risk_id DROP NOT NULL,
  ADD COLUMN target_model_risk_id  INTEGER REFERENCES verifywise.model_risks(id)  ON DELETE CASCADE,
  ADD COLUMN target_vendor_risk_id INTEGER REFERENCES verifywise.vendorrisks(id) ON DELETE CASCADE;

-- Exactly one parent, of exactly one kind.
ALTER TABLE verifywise.risk_links
  ADD CONSTRAINT risk_links_one_target CHECK (
      (target_risk_id        IS NOT NULL)::int
    + (target_model_risk_id  IS NOT NULL)::int
    + (target_vendor_risk_id IS NOT NULL)::int = 1
  );

-- §3.4: a cross-entity edge is always inheritance.
ALTER TABLE verifywise.risk_links
  ADD CONSTRAINT risk_links_cross_entity_inherits CHECK (
    target_risk_id IS NOT NULL OR relation_type = 'inherits_from'
  );
```

### 4.2 Uniqueness

`risk_links_unique UNIQUE (source_risk_id, target_risk_id, relation_type)` stops
protecting cross-entity rows the moment `target_risk_id` is NULL — Postgres
treats each NULL as distinct, so the same child could take the same vendor-risk
parent twice. Two partial indexes restore it:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS risk_links_unique_model_target
  ON verifywise.risk_links (source_risk_id, target_model_risk_id, relation_type)
  WHERE target_model_risk_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS risk_links_unique_vendor_target
  ON verifywise.risk_links (source_risk_id, target_vendor_risk_id, relation_type)
  WHERE target_vendor_risk_id IS NOT NULL;
```

### 4.3 Constraints deliberately left alone

| Constraint | Behaviour on a cross-entity row | Verdict |
|-----------|--------------------------------|---------|
| `risk_links_single_parent_idx` | keyed on `source_risk_id` only — fires normally | **works as-is, §2.4** |
| `risk_links_no_self` | `source <> NULL` → NULL → passes | harmless: a self-link across tables is not expressible |
| `risk_links_canonical` | `relation_type = 'inherits_from'` short-circuits true | harmless, and §3.4's CHECK guarantees the short-circuit |

---

## 5. Read path

### 5.1 Entity type on the wire

`RiskLinkRow` gains `target_model_risk_id` and `target_vendor_risk_id`. The API
response gains one derived field:

```ts
type RelatedEntityType = "risk" | "model_risk" | "vendor_risk";
```

derived in SQL, never inferred on the client.

### 5.2 The normalizing projection — specified once, verbatim

Three tables, one row shape. Any deviation produces a panel that renders `null`
for one entity type, so this is the exact projection:

| Output field | `risk` | `model_risk` | `vendor_risk` |
|-------------|--------|--------------|---------------|
| `related_entity_type` | `'risk'` | `'model_risk'` | `'vendor_risk'` |
| `related_id` | `related.id` | `mr.id` | `vr.id` |
| `related_risk_name` | `related.risk_name` | `COALESCE(NULLIF(mr.risk_name,''), 'Untitled model risk')` | `COALESCE(NULLIF(LEFT(vr.risk_description,80),''), 'Untitled vendor risk')` |
| `related_risk_level` | `related.risk_level_autocalculated::text` | `mr.risk_level::text` | `vr.risk_level` |
| `related_risk_owner` | `related.risk_owner` | `mr.owner` | `vr.action_owner` |

`vendorrisks` has no name column (§2.2), so the first 80 characters of
`risk_description` is the name. 80, not 60 or 100 — pick it here so nobody picks
it three times.

### 5.3 `getRiskLinksForRiskQuery`

Today it does `JOIN risks related ON related.id = CASE ... END`. A cross-entity
row has `target_risk_id IS NULL`, so that inner join **silently drops the row**.
The changes:

1. `JOIN risks related` → `LEFT JOIN risks related`.
2. Move `related.organization_id = :organizationId AND related.is_deleted = false`
   out of `WHERE` and into the `LEFT JOIN ... ON` clause — left in `WHERE` they
   would re-drop every cross-entity row.
3. Add two left joins, each carrying its own tenant and soft-delete guard:

```sql
LEFT JOIN model_risks mr
       ON mr.id = l.target_model_risk_id
      AND mr.organization_id = :organizationId
      AND mr.is_deleted = false
LEFT JOIN vendorrisks vr
       ON vr.id = l.target_vendor_risk_id
      AND vr.organization_id = :organizationId
      AND vr.is_deleted = false
```

4. Add `AND COALESCE(related.id, mr.id, vr.id) IS NOT NULL` to `WHERE`, so a link
   whose parent is deleted or belongs to another tenant disappears rather than
   rendering as a blank row.

Step 4 is the tenant boundary. It is not optional and it is not cosmetic.

---

## 6. The hierarchy rule across entity types

`validateTwoLevel` takes `{ childRiskId: number, parentRiskId: number }` and
compares bare integers. `model_risks.id = 7` and `risks.id = 7` are different
rows that compare equal — a live collision that would report
`parent_is_a_child` about an unrelated risk.

**Fix:** `HierarchyEdge` gains an optional discriminator, defaulting to the
existing behaviour so every current caller and test is untouched:

```ts
export interface HierarchyEdge {
  childRiskId: number;
  parentRiskId: number;
  /** Which table `parentRiskId` points at. Absent means `risks`. */
  parentEntityType?: RelatedEntityType;
}
```

The three comparisons in `validateTwoLevel` compare the `(type, id)` pair rather
than the id. Semantics that follow for free:

- **`child_already_has_parent`** — still fires. A project risk with a confirmed
  project-risk parent cannot also take a vendor-risk parent. Correct, and the
  database enforces it independently via §2.4.
- **`parent_is_a_child`** — can never fire for a cross-entity parent, because
  §3.3 makes vendor and model risks parent-only. The pair comparison is what
  stops it from firing *spuriously* on an id collision.
- **`child_has_children`** — unaffected; it is about the child.

### 6.1 The collision starts one layer earlier

`validateTwoLevel` is fed by `getConfirmedHierarchyEdgesQuery`, whose signature
is `(organizationId, childRiskId, parentRiskId: number)` and whose WHERE clause
is:

```sql
AND (source_risk_id IN (:childRiskId, :parentRiskId)
     OR target_risk_id IN (:childRiskId, :parentRiskId))
```

Passing a `model_risks.id` as `:parentRiskId` matches rows about a **project
risk with the same integer id**. Fixing only the validator leaves this: the
validator would receive edges that should never have been fetched. Both layers
change together, or neither is correct.

The query takes the parent as a `(type, id)` pair, matches the column that
actually holds it, and selects the two new columns so it can label each returned
edge's `parentEntityType`:

```sql
SELECT source_risk_id, target_risk_id, target_model_risk_id, target_vendor_risk_id
  FROM risk_links
 WHERE organization_id = :organizationId
   AND relation_type = 'inherits_from'
   AND status = 'confirmed'
   AND (source_risk_id      IN (:childRiskId, :parentRiskId)
        OR target_risk_id   IN (:childRiskId, :parentRiskId)
        OR target_model_risk_id  = :parentModelRiskId
        OR target_vendor_risk_id = :parentVendorRiskId)
```

`:parentRiskId` is null when the parent is cross-entity, and
`:parentModelRiskId` / `:parentVendorRiskId` are null otherwise. `IN` and `=`
against NULL yield NULL, so the unused branches contribute nothing rather than
matching everything — the same fail-closed property as §2.3.

---

## 7. API and UI

### 7.1 `POST /api/risk-links`

Body gains one optional field:

```jsonc
{
  "sourceRiskId": 41,           // the child project risk — unchanged, required
  "relationType": "inherits_from",
  "targetRiskId": 12,           // one of these three
  "targetModelRiskId": 7,       //   is required;
  "targetVendorRiskId": null    //   exactly one, never two
}
```

Rejections, each with a distinct message:

| Condition | Response |
|-----------|----------|
| zero or more than one target field | 400 "Provide exactly one parent risk." |
| cross-entity target with `relationType: "related_to"` | 400 "Only inheritance links are supported across risk types." |
| target row missing, soft-deleted, or another tenant's | 404 — same shape as `getLiveRiskIdsQuery` produces today |
| child already has a confirmed parent | 409, existing `HIERARCHY_MESSAGES` text |

`getLiveRiskIdsQuery` validates against `risks` only. Cross-entity targets need a
sibling liveness check against the right table, tenant-scoped, honouring
`is_deleted`.

`PATCH /api/risk-links/:id/status` needs **no change**. Confirm, dismiss, the
dismissal reason from C3, the undo — all operate on the row, not its endpoints.
C3's `DISMISS_REASONS_BY_RELATION` already maps `inherits_from` to
`wrong_direction / wrong_parent / not_hierarchical / other`, which reads correctly
for a cross-entity parent with no edit.

### 7.2 Panel

`LinkedRisksPanel` gains a type chip next to each parent row — `Vendor risk`,
`Model risk`, or nothing for a plain project risk. The picker that adds a parent
gains a source selector with the same three values. Nothing else moves; the
confirm/dismiss controls are the ones C1–C3 shipped.

---

## 8. Out of scope — and where the seam is

- **Cross-entity suggestions.** §3.1. The honest signal is shared project via
  `vendors_projects` / `model_inventories_projects_frameworks` / `projects_risks`.
  That is C5, and it should be scored and measured with C3's dismissal report
  before anyone trusts it.
- **vendor risk → model risk links.** §2.1: no relationship exists to justify
  one. If `model_inventories` ever gains `vendor_id`, revisit.
- **Vendor and model risks as children.** §3.3.
- **Cross-entity `related_to`.** §3.4.
- **Backfill.** No existing row changes; `target_risk_id` stays populated for
  every row already in the table.

---

## 9. Test plan

| # | Level | Proves |
|---|-------|--------|
| 1 | migration | `risk_links_one_target` rejects zero targets, two targets, three targets |
| 2 | migration | `risk_links_cross_entity_inherits` rejects a `related_to` row with a model-risk target |
| 3 | integration | **the §2.4 claim**: a child with a confirmed project-risk parent is refused a confirmed vendor-risk parent, by the *existing* index |
| 4 | integration | the two partial unique indexes reject a duplicated cross-entity parent |
| 5 | unit | `validateTwoLevel` does not report a violation when `model_risks.id` collides with an unrelated `risks.id` |
| 5b | integration | `getConfirmedHierarchyEdgesQuery` with a model-risk parent does **not** return edges about the project risk of the same id (§6.1) |
| 6 | unit | `validateTwoLevel` with no `parentEntityType` behaves exactly as before |
| 7 | integration | panel read returns a vendor-risk parent with `related_risk_name` from truncated `risk_description` |
| 8 | integration | **tenant isolation**: a link to another org's model risk returns no row, not a blank row |
| 9 | integration | a soft-deleted parent disappears from the panel |
| 10 | integration | POST rejects two target fields, and rejects `related_to` across entities |

Test 3 is the one worth writing first — it is the only test that proves the
design's central cost-saving claim rather than assuming it.
