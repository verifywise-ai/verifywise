# C6 Cross-Entity Suggested Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the existing "Suggest hierarchy" pass propose a vendor risk or model risk as the parent of a project risk, using shared project as the signal and the model already being called as the judge.

**Architecture:** No new endpoint, job, button, migration, or model call. `suggestDirectionForComponent` gathers the vendor/model risks that share a project with the component's risks, puts them in the same prompt as candidate parents, and the model picks from the union. Three supporting pieces are widened to reach the cross-entity target columns: the dedupe query, the agent writer, and the candidate query.

**Tech Stack:** Node 22, TypeScript, Sequelize 6 raw SQL, PostgreSQL, Zod, Vercel AI SDK (`generateObject`), Jest (`ts-jest`).

**Spec:** `docs/superpowers/specs/2026-09-05-risk-links-c6-cross-entity-suggestions-design.md`

## Global Constraints

- **Schema:** application SQL uses **unqualified** table names (`search_path = verifywise`). Never write `verifywise.risk_links` in `utils/` or `services/`.
- **Tenant isolation:** every query filters `organization_id = :organizationId`. Every join to `vendorrisks` / `model_risks` / `risks` also filters `is_deleted = false`.
- **Column name:** the relation column is `relation_type`. There is no `link_type` column.
- **`source` and `relation_type` for every row this plan writes:** `'agent'` and `'inherits_from'`. Never `'derived'`, never `'related_to'`.
- **Reason signal:** `"cross_entity_hierarchy"` when the parent is a `model_risk` or `vendor_risk`; `"hierarchy"` when the parent is a plain `risk`. Both with `weight: 0`.
- **`HierarchyEdge.parentEntityType` stays absent for plain-risk parents.** It is optional and documented as "absent means `risks`", and existing C2 tests assert exact edge objects. Setting it to `"risk"` breaks them.
- **Caps:** `MAX_COMPONENT_SIZE = 25` (existing, in `services/riskLinks/direction/components.ts`), `MAX_CROSS_ENTITY_CANDIDATES = 25` (new, same file).
- **Unit tests:** `cd Servers && ./node_modules/.bin/jest <path>`. Do **not** use `npm run test` — it is an alias for `test:unit` that swallows `--` flags and exits 0 regardless.
- **Integration tests:** `cd Servers && npm run test:integration -- --testPathPatterns=<name>`. These need PostgreSQL running and are excluded from `test:unit`.
- **No `console.log`.** Use `utils/logger/fileLogger`.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `Servers/utils/riskLink.utils.ts` | All raw SQL for `risk_links` | Modify 3 queries: `getHierarchyPairsQuery`, `createAgentHierarchyLinkQuery`, `getSharedProjectCandidatesQuery` |
| `Servers/services/riskLinks/direction/schema.ts` | Zod contract for the model's answer | Add `parent_entity_type` |
| `Servers/services/riskLinks/direction/prompts.ts` | Prompt text | Add the candidate block and two rules |
| `Servers/services/riskLinks/direction/components.ts` | Size caps | Add `MAX_CROSS_ENTITY_CANDIDATES` |
| `Servers/services/riskLinks/direction/candidates.ts` | The candidate type, its key, and gathering it | **Create** (Task 4, extended in Task 6) |
| `Servers/services/riskLinks/direction/direction.service.ts` | Orchestration + the pure filter | Entity-aware `hierarchyPairKey` and `filterProposedGroups`; candidate gathering in `suggestDirectionForComponent` |
| `Servers/tests/integration/riskLinks.agentLink.test.ts` | DB behaviour of the two agent-path queries | Extend |
| `Servers/tests/integration/riskLinks.sharedProjects.test.ts` | DB behaviour of the candidate query | Extend |
| `Servers/services/riskLinks/tests/directionFilter.spec.ts` | The pure filter's rules | Extend (and mechanically update its `group()` helper) |
| `Servers/services/riskLinks/tests/directionSchema.spec.ts` | The Zod contract | Extend |
| `Servers/services/riskLinks/tests/directionPrompt.spec.ts` | Prompt text | **Create** |
| `Servers/services/riskLinks/tests/directionCandidates.spec.ts` | Candidate gathering and the cap | **Create** |
| `docs/technical/domains/risk-link-precision.sql` | The precision metric | Add query 4b, narrow query 4 |
| `docs/technical/domains/risk-management.md` | Domain reference | Note that hierarchy suggestions can now be cross-entity |

`candidates.ts` is its own module rather than a block in `direction.service.ts`
because `prompts.ts` needs the type too, and `direction.service.ts` already
imports `prompts.ts`.

Tasks 1–3 are independent of each other. Task 4 needs Task 3. Task 6 needs 1, 2, 4 and 5.

---

## Task 1: `getHierarchyPairsQuery` sees cross-entity rows

Today it selects only `target_risk_id`, so `toNumber(null)` on a cross-entity row produces a junk parent id. Two live consequences: rule 4 of the filter cannot see a cross-entity pair the human already dismissed, and `blockingEdges` gains an edge pointing at an id that does not exist.

**Files:**
- Modify: `Servers/utils/riskLink.utils.ts` — `HierarchyPairRow` (line ~454) and `getHierarchyPairsQuery` (line ~471)
- Test: `Servers/tests/integration/riskLinks.agentLink.test.ts`

**Interfaces:**
- Produces: `HierarchyPairRow { childRiskId: number; parentRiskId: number; parentEntityType: ParentEntityType; status: RiskLinkStatus }` — `parentEntityType` is **required** here (unlike on `HierarchyEdge`), because a stored row always knows which column held its parent.

- [ ] **Step 1: Write the failing test**

Append to the existing `describe("getHierarchyPairsQuery", ...)` block in `Servers/tests/integration/riskLinks.agentLink.test.ts`. Add `createTestVendorRisk` to the `../factories` import at the top of the file if it is not already there.

```ts
  it("returns a cross-entity parent with its entity type, not a null id", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id,
                               relation_type, status, source)
       VALUES (:orgId, :child, :vendorRisk, 'inherits_from', 'dismissed', 'agent')`,
      { replacements: { orgId: owner.orgId, child, vendorRisk } },
    );

    expect(await getHierarchyPairsQuery(owner.orgId, [child])).toEqual([
      {
        childRiskId: child,
        parentRiskId: vendorRisk,
        parentEntityType: "vendor_risk",
        status: "dismissed",
      },
    ]);
  });

  it("still reports a plain risk parent as entity type risk", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id,
                               relation_type, status, source)
       VALUES (:orgId, :child, :parent, 'inherits_from', 'suggested', 'agent')`,
      { replacements: { orgId: owner.orgId, child, parent } },
    );

    expect(await getHierarchyPairsQuery(owner.orgId, [child])).toEqual([
      {
        childRiskId: child,
        parentRiskId: parent,
        parentEntityType: "risk",
        status: "suggested",
      },
    ]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.agentLink
```

Expected: FAIL. The cross-entity case returns `parentEntityType: undefined` and a `parentRiskId` of `NaN` or `null`; the plain case returns no `parentEntityType` at all.

- [ ] **Step 3: Widen the interface**

In `Servers/utils/riskLink.utils.ts`, replace the `HierarchyPairRow` interface:

```ts
/** One stored `inherits_from` edge, in the child/parent terms the rules use. */
export interface HierarchyPairRow {
  childRiskId: number;
  parentRiskId: number;
  /**
   * Which table `parentRiskId` points at. Required here, unlike on
   * `HierarchyEdge`: a stored row always knows which of the three target
   * columns held its parent, and defaulting would let a vendor risk's id be
   * compared against a project risk's.
   */
  parentEntityType: ParentEntityType;
  status: RiskLinkStatus;
}
```

- [ ] **Step 4: Widen the query**

Replace the body of `getHierarchyPairsQuery`:

```ts
export async function getHierarchyPairsQuery(
  organizationId: number,
  riskIds: number[],
): Promise<HierarchyPairRow[]> {
  if (riskIds.length === 0) return [];
  const rows = await sequelize.query(
    `SELECT source_risk_id, target_risk_id, target_model_risk_id,
            target_vendor_risk_id, status
       FROM risk_links
      WHERE organization_id = :organizationId
        AND relation_type = 'inherits_from'
        AND (source_risk_id IN (:riskIds) OR target_risk_id IN (:riskIds))`,
    { replacements: { organizationId, riskIds }, type: QueryTypes.SELECT },
  );

  // The `risk_links_one_target` CHECK guarantees exactly one of the three is
  // non-null, so the first match is the only match.
  return (rows as any[]).map((row) => {
    const [parentRiskId, parentEntityType]: [unknown, ParentEntityType] =
      row.target_model_risk_id != null
        ? [row.target_model_risk_id, "model_risk"]
        : row.target_vendor_risk_id != null
          ? [row.target_vendor_risk_id, "vendor_risk"]
          : [row.target_risk_id, "risk"];

    return {
      childRiskId: toNumber(row.source_risk_id),
      parentRiskId: toNumber(parentRiskId),
      parentEntityType,
      status: row.status as RiskLinkStatus,
    };
  });
}
```

Note what the `WHERE` clause deliberately does **not** gain: a cross-entity row is found through `source_risk_id`, which is always the project risk. Adding `target_vendor_risk_id IN (:riskIds)` would match a vendor risk whose id happens to equal a project risk's.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.agentLink
```

Expected: PASS, including the pre-existing cases in that describe block.

- [ ] **Step 6: Fix the two call sites the new required field breaks**

`getHierarchyPairsQuery`'s result is consumed in `Servers/services/riskLinks/direction/direction.service.ts` at `blockingEdges` and `confirmedEdges`. Carry the field through so a cross-entity row stops being mistaken for a project-risk one:

```ts
  const blockingEdges = storedPairs
    .filter((pair) => pair.status === "confirmed" || pair.status === "suggested")
    .map((pair) => toHierarchyEdge(pair));
  const confirmedEdges = storedPairs
    .filter((pair) => pair.status === "confirmed")
    .map((pair) => toHierarchyEdge(pair));
```

with this helper above `suggestDirectionForComponent`:

```ts
/**
 * A stored pair as a rule input. `parentEntityType` is dropped for plain risk
 * parents rather than passed as "risk": `HierarchyEdge` documents absent as
 * meaning `risks`, and every C1-C3 caller compares edges by exact shape.
 */
const toHierarchyEdge = (pair: HierarchyPairRow): HierarchyEdge =>
  pair.parentEntityType === "risk"
    ? { childRiskId: pair.childRiskId, parentRiskId: pair.parentRiskId }
    : {
        childRiskId: pair.childRiskId,
        parentRiskId: pair.parentRiskId,
        parentEntityType: pair.parentEntityType,
      };
```

Add `HierarchyPairRow` to the `../../../utils/riskLink.utils` import and `HierarchyEdge` is already imported from `../hierarchy`.

Leave `pairsWithExistingHierarchy` alone for now — Task 4 rewrites it.

- [ ] **Step 7: Typecheck and run the unit suite**

```bash
cd Servers && npx tsc --noEmit && ./node_modules/.bin/jest services/riskLinks
```

Expected: no type errors, all existing risk-link unit tests pass.

- [ ] **Step 8: Commit**

```bash
git add Servers/utils/riskLink.utils.ts Servers/services/riskLinks/direction/direction.service.ts Servers/tests/integration/riskLinks.agentLink.test.ts
git commit -m "fix(risk-links): read cross-entity parents in getHierarchyPairsQuery"
```

---

## Task 2: The agent writer reaches the cross-entity target columns

`createAgentHierarchyLinkQuery` hardcodes `target_risk_id` in the column list and the `ON CONFLICT`. `createUserRiskLinkQuery` already has the branching this needs; copy it rather than inventing a second shape.

**Files:**
- Modify: `Servers/utils/riskLink.utils.ts` — `CreateAgentHierarchyLinkInput` and `createAgentHierarchyLinkQuery` (line ~519)
- Test: `Servers/tests/integration/riskLinks.agentLink.test.ts`

**Interfaces:**
- Consumes: `HierarchyParent { id: number; entityType: ParentEntityType }` — already exported from this file at line 37.
- Produces: `createAgentHierarchyLinkQuery({ organizationId, childRiskId, parent, reason }): Promise<number | null>` — note `parent`, replacing the old `parentRiskId: number`.

- [ ] **Step 1: Write the failing test**

Add a new describe block to `Servers/tests/integration/riskLinks.agentLink.test.ts`. Add `createTestModelRisk` and `createAgentHierarchyLinkQuery` to the imports if absent.

```ts
describe("createAgentHierarchyLinkQuery cross-entity parents", () => {
  it("writes a model risk parent to target_model_risk_id with its own signal", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const modelRisk = await createTestModelRisk(owner.orgId, {});

    const id = await createAgentHierarchyLinkQuery({
      organizationId: owner.orgId,
      childRiskId: child,
      parent: { id: modelRisk, entityType: "model_risk" },
      reason: "The model risk is the upstream cause of this project risk.",
    });

    const [row]: any[] = await sequelize.query(
      `SELECT target_risk_id, target_model_risk_id, target_vendor_risk_id,
              relation_type, status, source, reasons
         FROM risk_links WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    expect(row).toMatchObject({
      target_risk_id: null,
      target_model_risk_id: modelRisk,
      target_vendor_risk_id: null,
      relation_type: "inherits_from",
      status: "suggested",
      source: "agent",
    });
    expect(row.reasons).toEqual([
      {
        signal: "cross_entity_hierarchy",
        weight: 0,
        detail: "The model risk is the upstream cause of this project risk.",
      },
    ]);
  });

  it("writes a vendor risk parent to target_vendor_risk_id", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    const id = await createAgentHierarchyLinkQuery({
      organizationId: owner.orgId,
      childRiskId: child,
      parent: { id: vendorRisk, entityType: "vendor_risk" },
      reason: "The vendor's own risk is the umbrella over this one.",
    });

    const [row]: any[] = await sequelize.query(
      `SELECT target_vendor_risk_id FROM risk_links WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    expect(row.target_vendor_risk_id).toBe(vendorRisk);
  });

  // The C2 regression guard: a plain risk parent must be untouched by this change.
  it("still writes a plain risk parent under the hierarchy signal", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});

    const id = await createAgentHierarchyLinkQuery({
      organizationId: owner.orgId,
      childRiskId: child,
      parent: { id: parent, entityType: "risk" },
      reason: "Both are instances of the same underlying failure.",
    });

    const [row]: any[] = await sequelize.query(
      `SELECT target_risk_id, target_model_risk_id, target_vendor_risk_id, reasons
         FROM risk_links WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    expect(row).toMatchObject({
      target_risk_id: parent,
      target_model_risk_id: null,
      target_vendor_risk_id: null,
    });
    expect(row.reasons[0].signal).toBe("hierarchy");
  });

  it("returns null rather than raising when the same pair is written twice", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});
    const input = {
      organizationId: owner.orgId,
      childRiskId: child,
      parent: { id: vendorRisk, entityType: "vendor_risk" as const },
      reason: "The vendor's own risk is the umbrella over this one.",
    };

    expect(await createAgentHierarchyLinkQuery(input)).not.toBeNull();
    expect(await createAgentHierarchyLinkQuery(input)).toBeNull();
  });
});
```

Add `QueryTypes` to the `sequelize` import line if the file does not already import it: `import { QueryTypes } from "sequelize";`

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.agentLink
```

Expected: FAIL at compile time — `parent` is not a property of `CreateAgentHierarchyLinkInput`.

- [ ] **Step 3: Rewrite the input and the query**

In `Servers/utils/riskLink.utils.ts`:

```ts
export interface CreateAgentHierarchyLinkInput {
  organizationId: number;
  childRiskId: number;
  /** C4 made parents polymorphic; C6 made the agent path able to write one. */
  parent: HierarchyParent;
  /** The model's own one-line justification, 15-120 chars by schema. */
  reason: string;
}
```

and the body — the `targetColumn` / `conflictTarget` pair is lifted verbatim from `createUserRiskLinkQuery`, which the partial unique indexes were built for:

```ts
export async function createAgentHierarchyLinkQuery(
  input: CreateAgentHierarchyLinkInput,
): Promise<number | null> {
  const targetColumn =
    input.parent.entityType === "model_risk"
      ? "target_model_risk_id"
      : input.parent.entityType === "vendor_risk"
        ? "target_vendor_risk_id"
        : "target_risk_id";
  const conflictTarget =
    input.parent.entityType === "risk"
      ? "(source_risk_id, target_risk_id, relation_type)"
      : `(source_risk_id, ${targetColumn}, relation_type) WHERE ${targetColumn} IS NOT NULL`;

  // C6 §4.3: the signal is what lets the precision report tell a cross-entity
  // suggestion from a project-risk one. Both land in the same source/relation
  // bucket, so without it neither can be measured.
  const reasons: LinkSignal[] = [
    {
      signal: input.parent.entityType === "risk" ? "hierarchy" : "cross_entity_hierarchy",
      weight: 0,
      detail: input.reason,
    },
  ];

  const rows = await sequelize.query(
    `INSERT INTO risk_links (organization_id, source_risk_id, ${targetColumn},
                             relation_type, status, source, reasons, created_at)
     VALUES (:organizationId, :childRiskId, :parentId,
             'inherits_from', 'suggested', 'agent', CAST(:reasons AS JSONB), NOW())
     ON CONFLICT ${conflictTarget} DO NOTHING
     RETURNING id`,
    {
      replacements: {
        organizationId: input.organizationId,
        childRiskId: input.childRiskId,
        parentId: input.parent.id,
        reasons: JSON.stringify(reasons),
      },
      type: QueryTypes.SELECT,
    },
  );

  const row = (rows as { id: number }[])[0];
  return row ? toNumber(row.id) : null;
}
```

Leave the existing doc comment above the function in place and add one line to it: that a cross-entity parent goes to its own column and carries its own signal.

- [ ] **Step 4: Update the one existing call site**

In `Servers/services/riskLinks/direction/direction.service.ts`, the write loop currently passes `parentRiskId: edge.parentRiskId`. Change it to:

```ts
      parent: {
        id: edge.parentRiskId,
        entityType: edge.parentEntityType ?? "risk",
      },
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.agentLink
```

Expected: PASS.

- [ ] **Step 6: Typecheck and run the unit suite**

```bash
cd Servers && npx tsc --noEmit && ./node_modules/.bin/jest services/riskLinks
```

- [ ] **Step 7: Commit**

```bash
git add Servers/utils/riskLink.utils.ts Servers/services/riskLinks/direction/direction.service.ts Servers/tests/integration/riskLinks.agentLink.test.ts
git commit -m "feat(risk-links): let the agent writer target vendor and model risks"
```

---

## Task 3: The model must say which table its parent lives in

**Files:**
- Modify: `Servers/services/riskLinks/direction/schema.ts`
- Modify: `Servers/services/riskLinks/tests/directionFilter.spec.ts` (its `group()` helper only)
- Test: `Servers/services/riskLinks/tests/directionSchema.spec.ts`

**Interfaces:**
- Produces: `HierarchyGroup { parent_risk_id: number; parent_entity_type: "risk" | "model_risk" | "vendor_risk"; child_risk_ids: number[]; reason: string }`

- [ ] **Step 1: Write the failing test**

Append to `Servers/services/riskLinks/tests/directionSchema.spec.ts`:

```ts
describe("parent_entity_type", () => {
  const base = {
    parent_risk_id: 1,
    child_risk_ids: [2],
    reason: "They are instances of the same underlying problem.",
  };

  it("accepts each of the three parent tables", () => {
    for (const parent_entity_type of ["risk", "model_risk", "vendor_risk"] as const) {
      expect(
        hierarchyOutputSchema.safeParse({ groups: [{ ...base, parent_entity_type }] }).success,
      ).toBe(true);
    }
  });

  // risks.id = 7, model_risks.id = 7 and vendorrisks.id = 7 all exist. A
  // default would send the row to the wrong table with no error anywhere.
  it("rejects a group that omits it, rather than defaulting to risk", () => {
    expect(hierarchyOutputSchema.safeParse({ groups: [base] }).success).toBe(false);
  });

  it("rejects a table name it invented", () => {
    expect(
      hierarchyOutputSchema.safeParse({
        groups: [{ ...base, parent_entity_type: "incident" }],
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd Servers && ./node_modules/.bin/jest services/riskLinks/tests/directionSchema.spec.ts
```

Expected: FAIL — the omission case passes today because `.strict()` rejects extra keys but does not require absent ones, and the three-table case fails because the key is unknown.

- [ ] **Step 3: Add the field**

In `Servers/services/riskLinks/direction/schema.ts`, inside `hierarchyGroupSchema`, between `parent_risk_id` and `child_risk_ids`:

```ts
    /**
     * Which table `parent_risk_id` points at. Required, with no default:
     * `risks.id = 7`, `model_risks.id = 7` and `vendorrisks.id = 7` all exist,
     * so a default would silently write the link to the wrong table. A missing
     * field becomes a Zod issue instead, which the self-correction loop feeds
     * back for a second attempt.
     */
    parent_entity_type: z.enum(["risk", "model_risk", "vendor_risk"]),
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd Servers && ./node_modules/.bin/jest services/riskLinks/tests/directionSchema.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Update the filter spec's group helper**

`Servers/services/riskLinks/tests/directionFilter.spec.ts` builds groups with a helper that no longer typechecks. Replace it:

```ts
const group = (
  parent: number,
  children: number[],
  parentEntityType: HierarchyGroup["parent_entity_type"] = "risk",
): HierarchyGroup => ({
  parent_risk_id: parent,
  parent_entity_type: parentEntityType,
  child_risk_ids: children,
  reason: "They are instances of the same underlying problem.",
});
```

The default keeps all sixteen existing call sites unchanged.

- [ ] **Step 6: Typecheck and run the risk-link unit suite**

```bash
cd Servers && npx tsc --noEmit && ./node_modules/.bin/jest services/riskLinks
```

Expected: PASS. `filterProposedGroups` ignores the new field until Task 4, which is correct — this task only widens the contract.

- [ ] **Step 7: Commit**

```bash
git add Servers/services/riskLinks/direction/schema.ts Servers/services/riskLinks/tests/directionSchema.spec.ts Servers/services/riskLinks/tests/directionFilter.spec.ts
git commit -m "feat(risk-links): require the parent's entity type in the direction schema"
```

---

## Task 4: The filter enforces the cross-entity rules

**Depends on Task 3.**

**Files:**
- Create: `Servers/services/riskLinks/direction/candidates.ts`
- Modify: `Servers/services/riskLinks/direction/direction.service.ts` — `hierarchyPairKey` (line ~104) and `filterProposedGroups` (line ~143)
- Test: `Servers/services/riskLinks/tests/directionFilter.spec.ts`

**Interfaces:**
- Consumes: `HierarchyParent` from `utils/riskLink.utils`, `HierarchyGroup` from `./schema`.
- Produces:
  - `hierarchyPairKey(childRiskId: number, parent: HierarchyParent): string` — **signature change**, was `(a: number, b: number)`.
  - `CrossEntityCandidate { parent: HierarchyParent; name: string; childRiskIds: Set<number>; projects: string[] }` and `candidateKey(parent): string`, both from the new `direction/candidates.ts` (re-exported by `direction.service.ts`).
  - `filterProposedGroups(groups, componentRiskIds, blockingEdges, pairsWithExistingHierarchy, candidates: Map<string, CrossEntityCandidate>): HierarchyEdge[]` — **one new trailing parameter**, keyed `entityType:id`.

- [ ] **Step 1: Write the failing tests**

Append to `Servers/services/riskLinks/tests/directionFilter.spec.ts`. Add to its imports:

```ts
import { filterProposedGroups, hierarchyPairKey } from "../direction/direction.service";
import { CrossEntityCandidate } from "../direction/candidates";
import { HierarchyParent } from "../../../utils/riskLink.utils";
```

and the tests:

```ts
const candidateMap = (
  ...entries: Array<{ parent: HierarchyParent; children: number[] }>
): Map<string, CrossEntityCandidate> =>
  new Map(
    entries.map((entry) => [
      `${entry.parent.entityType}:${entry.parent.id}`,
      {
        parent: entry.parent,
        name: "Third-party model drift",
        childRiskIds: new Set(entry.children),
        projects: ["Acme Onboarding"],
      },
    ]),
  );

const VENDOR_9: HierarchyParent = { id: 9, entityType: "vendor_risk" };

describe("filterProposedGroups cross-entity parents", () => {
  it("accepts a candidate parent and carries its entity type onto the edge", () => {
    expect(
      filterProposedGroups(
        [group(9, [2, 3], "vendor_risk")],
        COMPONENT,
        [],
        new Set(),
        candidateMap({ parent: VENDOR_9, children: [2, 3] }),
      ),
    ).toEqual([
      { childRiskId: 2, parentRiskId: 9, parentEntityType: "vendor_risk" },
      { childRiskId: 3, parentRiskId: 9, parentEntityType: "vendor_risk" },
    ]);
  });

  // The justification rule. A vendor risk that shares a project with risk 2 has
  // no relationship at all with risk 4, and a link with no justification is the
  // noise this whole design exists to avoid.
  it("drops a child the candidate shares no project with", () => {
    expect(
      filterProposedGroups(
        [group(9, [2, 4], "vendor_risk")],
        COMPONENT,
        [],
        new Set(),
        candidateMap({ parent: VENDOR_9, children: [2] }),
      ),
    ).toEqual([{ childRiskId: 2, parentRiskId: 9, parentEntityType: "vendor_risk" }]);
  });

  it("drops a cross-entity parent that is not a candidate at all", () => {
    expect(
      filterProposedGroups(
        [group(77, [2], "vendor_risk")],
        COMPONENT,
        [],
        new Set(),
        candidateMap({ parent: VENDOR_9, children: [2] }),
      ),
    ).toEqual([]);
  });

  // vendorrisks.id = 1 and risks.id = 1 are different rows. Keying
  // `usedAsParent` on the bare number would make the second group collide with
  // the first and silently vanish.
  it("does not let a vendor parent's id block the same id as a risk parent", () => {
    expect(
      filterProposedGroups(
        [group(1, [2], "vendor_risk"), group(1, [3])],
        COMPONENT,
        [],
        new Set(),
        candidateMap({ parent: { id: 1, entityType: "vendor_risk" }, children: [2] }),
      ),
    ).toEqual([
      { childRiskId: 2, parentRiskId: 1, parentEntityType: "vendor_risk" },
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  it("drops a pair that already has a cross-entity row in any status", () => {
    const existing = new Set([hierarchyPairKey(2, VENDOR_9)]);
    expect(
      filterProposedGroups(
        [group(9, [2], "vendor_risk")],
        COMPONENT,
        [],
        existing,
        candidateMap({ parent: VENDOR_9, children: [2] }),
      ),
    ).toEqual([]);
  });

  it("keeps a project-risk pair that only collides by number with a stored cross-entity one", () => {
    const existing = new Set([hierarchyPairKey(2, { id: 1, entityType: "vendor_risk" })]);
    expect(
      filterProposedGroups([group(1, [2])], COMPONENT, [], existing, new Map()),
    ).toEqual([{ childRiskId: 2, parentRiskId: 1 }]);
  });
});
```

The two pre-existing `hierarchyPairKey` uses at lines ~99 and ~106 must become `hierarchyPairKey(2, { id: 1, entityType: "risk" })` and `hierarchyPairKey(1, { id: 2, entityType: "risk" })`. They are asserting direction-blindness for project risks, which still holds.

Every other existing call of `filterProposedGroups` in this file gains a trailing `new Map()`.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Servers && ./node_modules/.bin/jest services/riskLinks/tests/directionFilter.spec.ts
```

Expected: FAIL at compile time — `filterProposedGroups` takes four arguments and `hierarchyPairKey` takes two numbers.

- [ ] **Step 3: Rewrite `hierarchyPairKey`**

In `Servers/services/riskLinks/direction/direction.service.ts`:

```ts
/**
 * The key rule 4 dedupes on.
 *
 * Between two project risks it is direction-blind, because rule 4 is: a stored
 * `inherits_from` row in either direction means the pair has been proposed
 * already. Across tables it cannot be — `canonicalPair` orders two numbers, and
 * a project risk's id and a vendor risk's id are not from the same space. A
 * cross-entity edge has exactly one legal direction anyway (C4 §3.3), so the
 * child-first key loses nothing.
 */
export function hierarchyPairKey(childRiskId: number, parent: HierarchyParent): string {
  if (parent.entityType === "risk") {
    const [low, high] = canonicalPair(childRiskId, parent.id);
    return `risk:${low}:${high}`;
  }
  return `${parent.entityType}:${childRiskId}:${parent.id}`;
}
```

The `risk:` prefix on the project-risk branch is what stops `hierarchyPairKey(2, vendor 1)` and `hierarchyPairKey(2, risk 1)` producing the same string.

Add `HierarchyParent` to the `../../../utils/riskLink.utils` import.

- [ ] **Step 4: Create the candidate module**

Create `Servers/services/riskLinks/direction/candidates.ts`. Its own file rather
than a block in `direction.service.ts`, because `prompts.ts` needs the type too
and `direction.service.ts` already imports `prompts.ts` — putting it there is a
module cycle.

```ts
import { HierarchyParent } from "../../../utils/riskLink.utils";

/** One vendor or model risk offered to the model as a possible parent. */
export interface CrossEntityCandidate {
  parent: HierarchyParent;
  /** What the panel would show for it. Without it the model sees only an id. */
  name: string;
  /** The component risks that reach it through a shared project. C6 §4.2. */
  childRiskIds: Set<number>;
  /** Shared project titles, for the prompt's justification line. */
  projects: string[];
}

/** How a candidate is addressed in the map and in `usedAsParent`. */
export const candidateKey = (parent: HierarchyParent): string =>
  `${parent.entityType}:${parent.id}`;
```

`direction.service.ts` re-exports both so its existing consumers have one import
to reach for:

```ts
export { candidateKey } from "./candidates";
export type { CrossEntityCandidate } from "./candidates";
```

- [ ] **Step 5: Rewrite the filter**

Replace `filterProposedGroups`. Keep the existing five-rule doc comment and extend it; the body becomes:

```ts
export function filterProposedGroups(
  groups: HierarchyGroup[],
  componentRiskIds: number[],
  blockingEdges: HierarchyEdge[],
  pairsWithExistingHierarchy: Set<string>,
  candidates: Map<string, CrossEntityCandidate>,
): HierarchyEdge[] {
  const inComponent = new Set(componentRiskIds);
  // Children are always project risks, so this set stays numeric. Parents are
  // not, so theirs is keyed by table — `vendor_risk:7` and `risk:7` are two
  // different rows and must not collide.
  const claimedAsChild = new Set<number>();
  const usedAsParent = new Set<string>();
  const accepted: HierarchyEdge[] = [];

  for (const group of groups) {
    const parent: HierarchyParent = {
      id: group.parent_risk_id,
      entityType: group.parent_entity_type,
    };
    const candidate = parent.entityType === "risk" ? null : candidates.get(candidateKey(parent));

    // 1. A project-risk parent must be in the component; a cross-entity parent
    //    must be one we actually offered. Either way the model cannot name a
    //    row it was never shown.
    if (parent.entityType === "risk" && !inComponent.has(parent.id)) continue;
    if (parent.entityType !== "risk" && !candidate) continue;
    if (group.child_risk_ids.some((id) => !inComponent.has(id))) continue;

    // 2. Only a project-risk parent can appear among its own children; a
    //    cross-entity id in that list is a different row entirely.
    if (parent.entityType === "risk" && group.child_risk_ids.includes(parent.id)) continue;

    // 3
    if (parent.entityType === "risk" && claimedAsChild.has(parent.id)) continue;
    if (group.child_risk_ids.some((id) => claimedAsChild.has(id))) continue;
    if (group.child_risk_ids.some((id) => usedAsParent.has(candidateKey({ id, entityType: "risk" }))))
      continue;
    if (new Set(group.child_risk_ids).size !== group.child_risk_ids.length) continue;

    const groupEdges: HierarchyEdge[] = [];
    for (const childRiskId of group.child_risk_ids) {
      // C6 §4.2. The shared project is the whole justification for a
      // cross-entity link; without it the link says nothing.
      if (candidate && !candidate.childRiskIds.has(childRiskId)) continue;
      // 4
      if (pairsWithExistingHierarchy.has(hierarchyPairKey(childRiskId, parent))) continue;

      const edge: HierarchyEdge =
        parent.entityType === "risk"
          ? { childRiskId, parentRiskId: parent.id }
          : { childRiskId, parentRiskId: parent.id, parentEntityType: parent.entityType };
      // 5
      if (validateTwoLevel(edge, [...blockingEdges, ...accepted, ...groupEdges])) continue;
      groupEdges.push(edge);
    }

    if (groupEdges.length === 0) continue;

    accepted.push(...groupEdges);
    for (const edge of groupEdges) claimedAsChild.add(edge.childRiskId);
    usedAsParent.add(candidateKey(parent));
  }

  return accepted;
}
```

Two behaviour notes to record in the doc comment above it:

- Rule 2's duplicate-id check moved from `[parent, ...children]` to `children` alone. A cross-entity parent's id appearing in `child_risk_ids` is not a duplicate; it is a different table's row that happens to share a number.
- The old rule-3 clause `usedAsParent.has(id)` for children now compares `risk:<id>`, so a child is only rejected for being a *project-risk* parent elsewhere. A child whose number matches a vendor parent's is untouched.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd Servers && ./node_modules/.bin/jest services/riskLinks/tests/directionFilter.spec.ts
```

Expected: PASS, including all sixteen pre-existing cases.

- [ ] **Step 7: Fix the caller and typecheck**

In `suggestDirectionForComponent`, `pairsWithExistingHierarchy` and the `filterProposedGroups` call both need updating:

```ts
  const pairsWithExistingHierarchy = new Set(
    storedPairs.map((pair) =>
      hierarchyPairKey(pair.childRiskId, {
        id: pair.parentRiskId,
        entityType: pair.parentEntityType,
      }),
    ),
  );
```

and the call gains a trailing `new Map()` for now — Task 6 fills it.

The `reasonByEdge` map keys on the pair too; update it the same way, using each group's own `parent_entity_type`.

```bash
cd Servers && npx tsc --noEmit && ./node_modules/.bin/jest services/riskLinks
```

- [ ] **Step 8: Commit**

```bash
git add Servers/services/riskLinks/direction/candidates.ts Servers/services/riskLinks/direction/direction.service.ts Servers/services/riskLinks/tests/directionFilter.spec.ts
git commit -m "feat(risk-links): enforce the cross-entity rules in the direction filter"
```

---

## Task 5: The candidate query returns a name, and the prompt shows the candidates

**Files:**
- Modify: `Servers/utils/riskLink.utils.ts` — `SharedProjectCandidate` (line ~748) and `getSharedProjectCandidatesQuery` (line ~769)
- Modify: `Servers/services/riskLinks/direction/prompts.ts`
- Test: `Servers/tests/integration/riskLinks.sharedProjects.test.ts`
- Test: `Servers/services/riskLinks/tests/directionPrompt.spec.ts` (**create**)

**Interfaces:**
- Produces: `SharedProjectCandidate { entityType; id; name: string; projects: string[] }` — `name` is new and additive.
- Produces: `buildDirectionUserPrompt(risks, confirmedEdges, candidates: CrossEntityCandidate[])` — one new trailing parameter, defaulting to `[]` so no existing caller breaks.

- [ ] **Step 1: Write the failing query test**

Append to `Servers/tests/integration/riskLinks.sharedProjects.test.ts`, following the seeding pattern already in that file:

```ts
  it("carries a display name for each candidate", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, project);

    const model = await createTestModelInventory(owner.orgId, {});
    await linkModelToProject(owner.orgId, model, project);
    const modelRisk = await createTestModelRisk(owner.orgId, {
      model_id: model,
      risk_name: "Fairness degradation in production",
    });

    const vendor = await createTestVendor(owner.orgId, {});
    await linkVendorToProject(owner.orgId, vendor, project);
    const vendorRisk = await createTestVendorRisk(owner.orgId, {
      vendor_id: vendor,
      risk_description: "The vendor cannot evidence its own model validation.",
    });

    const candidates = await getSharedProjectCandidatesQuery(owner.orgId, subject);

    expect(candidates.find((c) => c.id === modelRisk)?.name).toBe(
      "Fairness degradation in production",
    );
    expect(candidates.find((c) => c.id === vendorRisk)?.name).toBe(
      "The vendor cannot evidence its own model validation.",
    );
  });
```

`createTestProject` takes `(orgId, userId, overrides)` — three arguments, matching
the calls already in that file. Copy their shape rather than these if they drift.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.sharedProjects
```

Expected: FAIL — `name` is undefined.

- [ ] **Step 3: Add the name to the interface and both SELECT branches**

```ts
export interface SharedProjectCandidate {
  entityType: Exclude<ParentEntityType, "risk">;
  id: number;
  /**
   * What to show for it. C5's consumer already held the names it was
   * decorating; C6's prompt does not, and an id alone is not something a model
   * can judge. Same display expressions getRiskLinksForRiskQuery settled on —
   * `vendorrisks` has no name column.
   */
  name: string;
  projects: string[];
}
```

In the SQL, add the column to both branches and to the `ORDER BY`-safe projection:

```sql
     SELECT DISTINCT 'vendor_risk' AS entity_type, vr.id AS id,
            LEFT(vr.risk_description, 80) AS name, p.project_title AS project_title
```

```sql
     SELECT DISTINCT 'model_risk', mr.id, mr.risk_name, p.project_title
```

and in the grouping loop, `name: row.name` alongside `projects: [row.project_title]`.

`ORDER BY entity_type, id, project_title` is unchanged — `name` is functionally dependent on `id`, so it does not affect `DISTINCT` grouping or row count.

- [ ] **Step 4: Update the four existing assertions the new field breaks**

`riskLinks.sharedProjects.test.ts` asserts the candidate shape with `toEqual`, at
lines ~40, ~78, ~101 and ~183. Each gains `name`. The factories decide the value,
so read what they seed rather than guessing — for a vendor risk it is
`LEFT(risk_description, 80)` and for a model risk it is `risk_name`. If a factory
leaves the column at a default, assert with `expect.any(String)` there rather than
hardcoding a fixture's text into four places:

```ts
    expect(result).toEqual([
      {
        entityType: "vendor_risk",
        id: vendorRisk,
        name: expect.any(String),
        projects: ["Fraud Detection"],
      },
    ]);
```

- [ ] **Step 5: Run it to verify it passes**

```bash
cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.sharedProjects
```

Expected: PASS, all cases in the file.

- [ ] **Step 6: Write the failing prompt tests**

Create `Servers/services/riskLinks/tests/directionPrompt.spec.ts`:

```ts
import {
  buildDirectionSystemPrompt,
  buildDirectionUserPrompt,
} from "../direction/prompts";
import { CrossEntityCandidate } from "../direction/candidates";

const risks = [
  {
    id: 3,
    risk_name: "Biased scoring",
    risk_description: null,
    risk_category: null,
    ai_lifecycle_phase: null,
  },
  {
    id: 4,
    risk_name: "Unexplained rejections",
    risk_description: null,
    risk_category: null,
    ai_lifecycle_phase: null,
  },
];

const candidate: CrossEntityCandidate = {
  parent: { id: 9, entityType: "vendor_risk" },
  name: "Third-party model drift",
  childRiskIds: new Set([3, 4]),
  projects: ["Acme Onboarding"],
};

describe("buildDirectionUserPrompt", () => {
  it("lists a candidate with its table, id, name, reachable risks and projects", () => {
    const prompt = buildDirectionUserPrompt(risks, [], [candidate]);

    expect(prompt).toContain("vendor_risk 9: Third-party model drift");
    expect(prompt).toContain("shares a project with risks: 3, 4");
    expect(prompt).toContain("projects: Acme Onboarding");
  });

  // A C2-only component must produce exactly the prompt it produces today, or
  // this change silently re-tunes grouping for every existing user.
  it("is byte-identical to the two-argument form when there are no candidates", () => {
    expect(buildDirectionUserPrompt(risks, [], [])).toBe(buildDirectionUserPrompt(risks, []));
    expect(buildDirectionUserPrompt(risks, [], [])).not.toContain("shares a project");
  });
});

describe("buildDirectionSystemPrompt", () => {
  it("tells the model candidates are parents only and bounded by their risk list", () => {
    const prompt = buildDirectionSystemPrompt();
    expect(prompt).toContain("never children");
    expect(prompt).toContain("only take the risks listed beside it");
  });
});
```

- [ ] **Step 7: Run them to verify they fail**

```bash
cd Servers && ./node_modules/.bin/jest services/riskLinks/tests/directionPrompt.spec.ts
```

Expected: FAIL at compile time — `buildDirectionUserPrompt` takes two arguments.

- [ ] **Step 8: Extend the prompts**

In `Servers/services/riskLinks/direction/prompts.ts`, add to the system prompt's rule list, after the "Only use the risk ids given to you" line:

```ts
    "- Some clusters also list candidate parents from the vendor and model risk",
    "  tables. They may be parents; they are never children, and they must never",
    "  appear in child_risk_ids.",
    "- A candidate parent may only take the risks listed beside it as children.",
    "  Sharing a project is the whole justification for the link.",
    "- Say which table each parent comes from in parent_entity_type: \"risk\" for",
    "  the risks above, or \"model_risk\" / \"vendor_risk\" for a candidate.",
```

and extend the user prompt:

```ts
export function buildDirectionUserPrompt(
  risks: RiskPromptRow[],
  confirmedEdges: HierarchyEdge[],
  candidates: CrossEntityCandidate[] = [],
): string {
  // ... existing `described` and `hierarchy` blocks unchanged ...

  const sections = [
    "These risks are all related to each other:",
    "",
    described.join("\n"),
  ];

  // Omitted entirely rather than rendered as "- none": a C2-only component's
  // prompt must stay exactly what it is today, or this change re-tunes grouping
  // for every existing user.
  if (candidates.length > 0) {
    const listed = candidates.map((candidate) => {
      const reachable = [...candidate.childRiskIds].sort((a, b) => a - b).join(", ");
      return [
        `- ${candidate.parent.entityType} ${candidate.parent.id}: ${candidate.name}`,
        `  shares a project with risks: ${reachable}`,
        `  projects: ${candidate.projects.join(", ")}`,
      ].join("\n");
    });
    sections.push(
      "",
      "These vendor and model risks share a project with the risks above and may",
      "be umbrellas over them:",
      "",
      listed.join("\n"),
    );
  }

  sections.push(
    "",
    "Hierarchy decisions a human has already made about them, which you must not",
    "contradict:",
    "",
    hierarchy,
  );

  return sections.join("\n");
}
```

Import `CrossEntityCandidate` from `./candidates` — not from `./direction.service`, which imports this file.

- [ ] **Step 9: Run them to verify they pass**

```bash
cd Servers && npx tsc --noEmit && ./node_modules/.bin/jest services/riskLinks
```

- [ ] **Step 10: Commit**

```bash
git add Servers/utils/riskLink.utils.ts Servers/services/riskLinks/direction/prompts.ts Servers/services/riskLinks/tests/directionPrompt.spec.ts Servers/tests/integration/riskLinks.sharedProjects.test.ts
git commit -m "feat(risk-links): show cross-entity candidates to the direction model"
```

---

## Task 6: The service gathers candidates and applies the cap

**Depends on Tasks 1, 2, 4 and 5.**

**Files:**
- Modify: `Servers/services/riskLinks/direction/components.ts`
- Modify: `Servers/services/riskLinks/direction/candidates.ts` — add `gatherCrossEntityCandidates`
- Modify: `Servers/services/riskLinks/direction/direction.service.ts` — `suggestDirectionForComponent`
- Test: `Servers/services/riskLinks/tests/directionCandidates.spec.ts` (**create**)

**Interfaces:**
- Consumes: `getSharedProjectCandidatesQuery(organizationId, riskId)` per component member.
- Produces: `MAX_CROSS_ENTITY_CANDIDATES = 25` exported from `components.ts`.

- [ ] **Step 1: Write the failing tests**

Create `Servers/services/riskLinks/tests/directionCandidates.spec.ts`. It mocks the same trio as `directionFilter.spec.ts` plus the AI SDK, so no network or database is touched.

```ts
jest.mock("../../../utils/riskLink.utils");
jest.mock("../../../database/db", () => ({ sequelize: { transaction: jest.fn() } }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("../../../utils/llmKey.utils");
jest.mock("../../../advisor/llmSelfCorrect");

import { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import { getLLMKeysWithKeyQuery } from "../../../utils/llmKey.utils";
import * as utils from "../../../utils/riskLink.utils";
import { suggestDirectionForComponent } from "../direction/direction.service";

const risk = (id: number) => ({
  id,
  risk_name: `Risk ${id}`,
  risk_description: null,
  risk_category: null,
  ai_lifecycle_phase: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  (getLLMKeysWithKeyQuery as jest.Mock).mockResolvedValue([
    { name: "openai", key: "sk-test", model: "gpt-4o-mini", url: null },
  ]);
  (utils.getRiskPromptRowsQuery as jest.Mock).mockResolvedValue([risk(3), risk(4)]);
  (utils.getHierarchyPairsQuery as jest.Mock).mockResolvedValue([]);
  (utils.createAgentHierarchyLinkQuery as jest.Mock).mockResolvedValue(1);
  (generateObjectWithSelfCorrection as jest.Mock).mockResolvedValue({
    object: { groups: [] },
  });
});

const promptSentToModel = () =>
  (generateObjectWithSelfCorrection as jest.Mock).mock.calls[0][0].prompt;

describe("suggestDirectionForComponent candidate gathering", () => {
  it("offers a candidate only to the risks it shares a project with", async () => {
    (utils.getSharedProjectCandidatesQuery as jest.Mock).mockImplementation(
      async (_org: number, riskId: number) =>
        riskId === 3
          ? [{ entityType: "vendor_risk", id: 9, name: "Drift", projects: ["Acme"] }]
          : [],
    );

    await suggestDirectionForComponent(1, [3, 4]);

    expect(promptSentToModel()).toContain("shares a project with risks: 3");
    expect(promptSentToModel()).not.toContain("shares a project with risks: 3, 4");
  });

  it("merges the same candidate reached from two risks into one entry", async () => {
    (utils.getSharedProjectCandidatesQuery as jest.Mock).mockResolvedValue([
      { entityType: "vendor_risk", id: 9, name: "Drift", projects: ["Acme"] },
    ]);

    await suggestDirectionForComponent(1, [3, 4]);

    const prompt = promptSentToModel();
    expect(prompt).toContain("shares a project with risks: 3, 4");
    expect(prompt.match(/vendor_risk 9:/g)).toHaveLength(1);
  });

  // Every candidate shares a project by construction, so there is no ranking to
  // truncate on. Cutting at 25 by id order would pick winners for no reason.
  it("drops the whole candidate block past the cap and still groups the risks", async () => {
    (utils.getSharedProjectCandidatesQuery as jest.Mock).mockResolvedValue(
      Array.from({ length: 26 }, (_, i) => ({
        entityType: "vendor_risk",
        id: i + 1,
        name: `Candidate ${i + 1}`,
        projects: ["Acme"],
      })),
    );
    (generateObjectWithSelfCorrection as jest.Mock).mockResolvedValue({
      object: {
        groups: [
          {
            parent_risk_id: 3,
            parent_entity_type: "risk",
            child_risk_ids: [4],
            reason: "Both describe the same scoring failure.",
          },
        ],
      },
    });

    const written = await suggestDirectionForComponent(1, [3, 4]);

    expect(promptSentToModel()).not.toContain("shares a project");
    expect(written).toBe(1);
  });

  it("writes a vendor parent to the cross-entity column", async () => {
    (utils.getSharedProjectCandidatesQuery as jest.Mock).mockImplementation(
      async (_org: number, riskId: number) =>
        riskId === 4
          ? [{ entityType: "vendor_risk", id: 9, name: "Drift", projects: ["Acme"] }]
          : [],
    );
    (generateObjectWithSelfCorrection as jest.Mock).mockResolvedValue({
      object: {
        groups: [
          {
            parent_risk_id: 9,
            parent_entity_type: "vendor_risk",
            child_risk_ids: [4],
            reason: "The vendor's drift is the umbrella over this rejection risk.",
          },
        ],
      },
    });

    expect(await suggestDirectionForComponent(1, [3, 4])).toBe(1);
    expect(utils.createAgentHierarchyLinkQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        childRiskId: 4,
        parent: { id: 9, entityType: "vendor_risk" },
      }),
    );
  });
});
```


- [ ] **Step 2: Run them to verify they fail**

```bash
cd Servers && ./node_modules/.bin/jest services/riskLinks/tests/directionCandidates.spec.ts
```

Expected: FAIL — no candidate text reaches the prompt, and the vendor group is dropped by rule 1 because the candidate map is still `new Map()`.

- [ ] **Step 3: Add the cap**

In `Servers/services/riskLinks/direction/components.ts`, below `MAX_COMPONENT_SIZE`:

```ts
/**
 * How many distinct vendor / model risks one component may offer the model.
 *
 * Past this the cross-entity half is skipped entirely rather than truncated:
 * every candidate shares a project by construction, so they are all equally
 * justified and cutting by id order picks winners for no reason. Same
 * fail-closed choice the controller makes for oversized components.
 */
export const MAX_CROSS_ENTITY_CANDIDATES = 25;
```

- [ ] **Step 4: Gather the candidates**

In `suggestDirectionForComponent`, after `getHierarchyPairsQuery` and before the model call:

```ts
  const candidates = await gatherCrossEntityCandidates(organizationId, liveIds);
```

with this added to `Servers/services/riskLinks/direction/candidates.ts` (created
in Task 4), so the gathering lives beside the type it builds:

```ts
/**
 * Every vendor / model risk reachable from any risk in the component, each
 * carrying the risks that reached it.
 *
 * One query per member rather than a component-wide one: `getSharedProjectCandidatesQuery`
 * is per-risk by design, and which risk reached a candidate is the rule (C6
 * §4.2), not a detail. These are plain SQL against an indexed join and the
 * component is capped at 25, so the loop is not the cost here — the model call
 * that follows is.
 */
export async function gatherCrossEntityCandidates(
  organizationId: number,
  riskIds: number[],
): Promise<Map<string, CrossEntityCandidate>> {
  const merged = new Map<string, CrossEntityCandidate>();

  for (const riskId of riskIds) {
    for (const row of await getSharedProjectCandidatesQuery(organizationId, riskId)) {
      const parent: HierarchyParent = { id: row.id, entityType: row.entityType };
      const key = candidateKey(parent);
      const existing = merged.get(key);
      if (existing) {
        existing.childRiskIds.add(riskId);
        for (const project of row.projects) {
          if (!existing.projects.includes(project)) existing.projects.push(project);
        }
      } else {
        merged.set(key, {
          parent,
          name: row.name,
          childRiskIds: new Set([riskId]),
          projects: [...row.projects],
        });
      }
    }
  }

  return merged;
}
```

Then apply the cap, immediately after the call:

```ts
  if (candidates.size > MAX_CROSS_ENTITY_CANDIDATES) {
    logger.info(
      `risk link direction: org ${organizationId}, component [${liveIds.join(",")}] reaches ` +
        `${candidates.size} cross-entity candidates, over the cap of ` +
        `${MAX_CROSS_ENTITY_CANDIDATES} — grouping project risks only`,
    );
    candidates.clear();
  }
```

`candidates.ts` imports `getSharedProjectCandidatesQuery` and `HierarchyParent`
from `../../../utils/riskLink.utils`. `direction.service.ts` imports
`gatherCrossEntityCandidates` from `./candidates` and `MAX_CROSS_ENTITY_CANDIDATES`
from `./components`.

- [ ] **Step 5: Pass them to the prompt, the filter, and the writer**

```ts
      prompt: buildDirectionUserPrompt(risks, confirmedEdges, [...candidates.values()]),
```

```ts
  const edges = filterProposedGroups(
    groups,
    liveIds,
    blockingEdges,
    pairsWithExistingHierarchy,
    candidates,
  );
```

The write loop already passes `parent` (Task 2, Step 4) and `reasonByEdge` already keys on the entity-aware pair (Task 4, Step 6). Nothing further changes there.

- [ ] **Step 6: Run them to verify they pass**

```bash
cd Servers && ./node_modules/.bin/jest services/riskLinks/tests/directionCandidates.spec.ts
```

- [ ] **Step 7: Run everything and typecheck**

```bash
cd Servers && npx tsc --noEmit && ./node_modules/.bin/jest && npm run build
```

Expected: all unit tests pass, no type errors, build succeeds.

```bash
cd Servers && npm run test:integration -- --testPathPatterns=riskLinks
```

Expected: every risk-link integration test passes.

- [ ] **Step 8: Commit**

```bash
git add Servers/services/riskLinks/direction/components.ts Servers/services/riskLinks/direction/candidates.ts Servers/services/riskLinks/direction/direction.service.ts Servers/services/riskLinks/tests/directionCandidates.spec.ts
git commit -m "feat(risk-links): suggest vendor and model risks as parents"
```

---

## Task 7: Make the suggestions measurable

Without this the feature ships unmeasurable and takes C2's metric down with it: `risk-link-precision.sql` query 4 filters `source = 'agent' AND relation_type = 'inherits_from'`, which from Task 6 onward matches both features at once.

**Files:**
- Modify: `docs/technical/domains/risk-link-precision.sql`
- Modify: `docs/technical/domains/risk-management.md`

- [ ] **Step 1: Narrow query 4 and add 4b**

In `docs/technical/domains/risk-link-precision.sql`, add one line to query 4's `WHERE`:

```sql
   AND target_risk_id IS NOT NULL
```

and add immediately after it:

```sql
\echo ''
\echo '--- 4b. Cross-entity agent hierarchy (C6) ---'
\echo 'Vendor and model risks the direction pass proposed as parents.'
\echo 'Kept separate from query 4 because both land in the same source and'
\echo 'relation_type; without the split neither feature can be measured.'
SELECT count(*) FILTER (WHERE status = 'confirmed') AS confirmed,
       count(*) FILTER (WHERE status = 'dismissed') AS dismissed,
       count(*) FILTER (WHERE status = 'suggested') AS undecided
  FROM risk_links
 WHERE source = 'agent'
   AND relation_type = 'inherits_from'
   AND (target_model_risk_id IS NOT NULL OR target_vendor_risk_id IS NOT NULL);
```

- [ ] **Step 2: Split query 6's dismissal breakdown**

Query 6 groups dismissals by `relation_type` and would merge the two features the same way. Add a column rather than a filter, so its existing rows keep reading the same:

```sql
       count(*) FILTER (
         WHERE reasons @> '[{"signal":"cross_entity_hierarchy"}]'::jsonb
       ) AS cross_entity,
```

- [ ] **Step 3: Verify the file still runs**

```bash
cd Servers && PGPASSWORD=$(grep '^DB_PASSWORD=' .env | cut -d= -f2-) psql -h localhost -U postgres -d verifywise -f ../docs/technical/domains/risk-link-precision.sql
```

Expected: every query returns, with zeros where there is no data yet. No syntax errors.

- [ ] **Step 4: Update the domain doc**

In `docs/technical/domains/risk-management.md`, the "Value-chain inheritance"
section ends with a sentence that C6 makes false — "Cross-entity links are
created as confirmed user links and appear in the project risk's Parent risk
…". Replace "are created as confirmed user links" with "are created either as
confirmed user links or as agent suggestions", and add this paragraph below it:

> Since C6 the direction pass (`POST /api/riskLinks/suggest-hierarchy`) also
> proposes vendor and model risks as parents, when they share a project with a
> risk in the cluster. They arrive as `suggested` / `agent` rows and are
> confirmed or dismissed like any other suggestion. They carry the
> `cross_entity_hierarchy` reason signal rather than `hierarchy`, which is how
> query 4b of `risk-link-precision.sql` reports them apart from project-risk
> suggestions.

Update the file's "Last Updated" line (line 3) from `2026-08-30` to `2026-09-05`.

- [ ] **Step 5: Commit**

```bash
git add docs/technical/domains/risk-link-precision.sql docs/technical/domains/risk-management.md
git commit -m "docs(risk-links): measure cross-entity suggestions separately"
```

---

## Done when

- `cd Servers && npx tsc --noEmit && ./node_modules/.bin/jest && npm run build` is clean.
- `cd Servers && npm run test:integration -- --testPathPatterns=riskLinks` is green.
- A component whose risks share a project with a vendor risk produces a
  `suggested` / `agent` row with `target_vendor_risk_id` set, and the panel shows
  it with Confirm and Dismiss.
- A component with no cross-entity candidates sends the model a prompt byte-identical to today's.
- `risk-link-precision.sql` queries 4 and 4b report the two features separately.
