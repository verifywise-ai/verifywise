# C4: Value-chain inheritance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a vendor risk or a model risk be the parent of a project risk, reusing the `risk_links` table and the whole C1–C3 confirm/dismiss lifecycle.

**Architecture:** `risk_links.target_risk_id` becomes nullable and gains two sibling typed FK columns, one per foreign risk table. The child column `source_risk_id` is untouched — it carries `risk_links_single_parent_idx`, so C1's one-parent rule extends across entity types with no constraint migration. Links are created by a human only; no suggestion engine.

**Tech Stack:** PostgreSQL, Sequelize 6 raw queries, Express 4, TypeScript, Jest (backend), React 19 + MUI 7, Vitest (frontend)

**Spec:** `docs/superpowers/specs/2026-08-30-risk-links-c4-value-chain-inheritance-design.md`

## Global Constraints

- **Migrations qualify the schema** (`verifywise.risk_links`). **Application and test SQL must NOT** — `search_path` is already `verifywise`.
- **Direction convention:** on every `inherits_from` row, `source_risk_id` is the **child** and the target is the **parent**. Never reversed.
- **Cross-entity links are `inherits_from` only.** `related_to` across tables is rejected at the API and by a CHECK.
- **One direction only:** vendor and model risks are parents, never children. No panel is added to `VendorRisksDialog` or `NewModelRisk`.
- **Tenant scoping is mandatory** on every new query: `mr.organization_id = :organizationId`, `vr.organization_id = :organizationId`. `model_risks.organization_id` is nullable in the schema; matching on equality makes a NULL row invisible, which is the correct fail-closed direction.
- **No suggestion engine in C4.** Every new row is `status = 'confirmed', source = 'user'`.
- No `console.log`. No hardcoded values. UI uses theme references.

### Test commands — read this before running anything

| What | Command |
|------|---------|
| Backend unit | `cd Servers && npm run test` |
| Backend **integration** | `cd Servers && npm run test:integration -- --testPathPatterns=riskLinks` |
| Frontend | `cd Clients && npx vitest run` |
| Frontend types | `cd Clients && npm run typecheck` |

`npm run test` is `test:unit` and **excludes** `tests/integration/`. Running `npx jest riskLinks` fails four suites because integration tests need their own config and `globalSetup`. That is not a bug in your code.

---

## File Structure

| File | Responsibility |
|------|----------------|
| Create `Servers/database/migrations/20260830120000-risk-links-cross-entity-parent.js` | the two columns, two CHECKs, two partial unique indexes |
| Modify `Servers/tests/factories/test-entities.factory.ts` | `createTestModelRisk`, `createTestVendorRisk` |
| Modify `Servers/tests/factories/index.ts` | re-export the two factories |
| Create `Servers/tests/integration/riskLinks.crossEntity.test.ts` | every constraint and read-path test |
| Modify `Servers/services/riskLinks/hierarchy.ts` | `ParentEntityType`, pair comparison |
| Modify `Servers/services/riskLinks/types.ts` | `RiskLinkRow` gains the two columns |
| Modify `Servers/utils/riskLink.utils.ts` | `getConfirmedHierarchyEdgesQuery`, `getRiskLinksForRiskQuery`, `getLiveCrossEntityParentQuery`, `createUserRiskLinkQuery` |
| Modify `Servers/controllers/riskLinks.ctrl.ts` | target resolution, `toResponse` entity type |
| Modify `Clients/src/domain/interfaces/i.riskLink.ts` | `entityType` on `relatedRisk`, on `CreateRiskLinkInput` |
| Modify `Clients/src/presentation/components/LinkedRisksPanel/index.tsx` | type chip |
| Modify `Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx` | parent-source selector |
| Modify `docs/technical/domains/risk-management.md` | document the feature |

---

## Task 1: Migration, factories, and the constraints

**Files:**
- Create: `Servers/database/migrations/20260830120000-risk-links-cross-entity-parent.js`
- Modify: `Servers/tests/factories/test-entities.factory.ts`
- Modify: `Servers/tests/factories/index.ts`
- Test: `Servers/tests/integration/riskLinks.crossEntity.test.ts`

**Interfaces:**
- Produces: columns `risk_links.target_model_risk_id`, `risk_links.target_vendor_risk_id`; constraints `risk_links_one_target`, `risk_links_cross_entity_inherits`; indexes `risk_links_unique_model_target`, `risk_links_unique_vendor_target`; factories `createTestModelRisk(orgId, options?) => Promise<number>` and `createTestVendorRisk(orgId, options?) => Promise<number>`.

- [ ] **Step 1: Add the two factories**

Append to `Servers/tests/factories/test-entities.factory.ts`. Every `model_risks` column except `id` is nullable, and `vendorrisks` requires only `organization_id`, so both inserts stay minimal.

```ts
export interface CreateTestModelRiskOptions {
  model_id?: number;
  risk_name?: string | null;
  risk_level?: "Low" | "Medium" | "High" | "Critical";
  owner?: number | null;
}

export async function createTestModelRisk(
  orgId: number,
  options: CreateTestModelRiskOptions = {},
): Promise<number> {
  const suffix = Date.now();
  const [result] = await sequelize.query(
    `INSERT INTO model_risks (organization_id, model_id, risk_name, risk_level, owner, created_at, updated_at, is_deleted)
     VALUES (:orgId, :modelId, :name, :level, :owner, NOW(), NOW(), false) RETURNING id`,
    {
      replacements: {
        orgId,
        modelId: options.model_id ?? null,
        name: options.risk_name === undefined ? `Model risk ${suffix}` : options.risk_name,
        level: options.risk_level ?? "High",
        owner: options.owner ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}

export interface CreateTestVendorRiskOptions {
  vendor_id?: number;
  risk_description?: string;
  risk_level?: string;
  action_owner?: number | null;
}

export async function createTestVendorRisk(
  orgId: number,
  options: CreateTestVendorRiskOptions = {},
): Promise<number> {
  const suffix = Date.now();
  const [result] = await sequelize.query(
    `INSERT INTO vendorrisks (organization_id, vendor_id, risk_description, risk_level, action_owner, is_demo, created_at, updated_at, is_deleted)
     VALUES (:orgId, :vendorId, :description, :level, :owner, false, NOW(), NOW(), false) RETURNING id`,
    {
      replacements: {
        orgId,
        vendorId: options.vendor_id ?? null,
        description: options.risk_description ?? `Vendor risk ${suffix}`,
        level: options.risk_level ?? "High",
        owner: options.action_owner ?? null,
      },
    },
  );
  return (result as any[])[0].id;
}
```

Re-export both from `Servers/tests/factories/index.ts`, alongside `createTestModelInventory`.

- [ ] **Step 2: Write the failing constraint tests**

Create `Servers/tests/integration/riskLinks.crossEntity.test.ts`.

```ts
jest.setTimeout(60000);

import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestRisk, createTestModelRisk, createTestVendorRisk } from "../factories";

afterEach(async () => {
  await cleanupDatabase();
});

/*
 * Every test below writes a straight INSERT, bypassing the controller on
 * purpose: they prove the CONSTRAINTS do the work, not the application
 * validation layered above them.
 */

describe("risk_links_one_target", () => {
  it("rejects a row with no parent at all", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});

    await expect(
      sequelize.query(
        `INSERT INTO risk_links (organization_id, source_risk_id, relation_type, status, source)
         VALUES (:orgId, :child, 'inherits_from', 'confirmed', 'user')`,
        { replacements: { orgId: owner.orgId, child } },
      ),
    ).rejects.toMatchObject({
      original: { code: "23514", constraint: "risk_links_one_target" },
    });
  });

  it("rejects a row with two parents of different kinds", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    const modelRisk = await createTestModelRisk(owner.orgId, {});

    await expect(
      sequelize.query(
        `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id, target_model_risk_id, relation_type, status, source)
         VALUES (:orgId, :child, :parent, :modelRisk, 'inherits_from', 'confirmed', 'user')`,
        { replacements: { orgId: owner.orgId, child, parent, modelRisk } },
      ),
    ).rejects.toMatchObject({
      original: { code: "23514", constraint: "risk_links_one_target" },
    });
  });
});

describe("risk_links_cross_entity_inherits", () => {
  it("rejects a related_to link to a vendor risk", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    await expect(
      sequelize.query(
        `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id, relation_type, status, source)
         VALUES (:orgId, :child, :vendorRisk, 'related_to', 'confirmed', 'user')`,
        { replacements: { orgId: owner.orgId, child, vendorRisk } },
      ),
    ).rejects.toMatchObject({
      original: { code: "23514", constraint: "risk_links_cross_entity_inherits" },
    });
  });
});

describe("cross-entity uniqueness", () => {
  it("rejects the same model risk as parent twice", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const modelRisk = await createTestModelRisk(owner.orgId, {});
    const add = () =>
      sequelize.query(
        `INSERT INTO risk_links (organization_id, source_risk_id, target_model_risk_id, relation_type, status, source)
         VALUES (:orgId, :child, :modelRisk, 'inherits_from', 'suggested', 'user')`,
        { replacements: { orgId: owner.orgId, child, modelRisk } },
      );

    await add();
    await expect(add()).rejects.toMatchObject({
      original: { code: "23505", constraint: "risk_links_unique_model_target" },
    });
  });
});

/**
 * The claim this whole design rests on (spec §2.4): risk_links_single_parent_idx
 * is keyed on source_risk_id ALONE, so it already covers a parent that lives in
 * another table. If this test fails, the storage shape was the wrong choice and
 * the constraint needs a migration after all.
 */
describe("risk_links_single_parent_idx across entity types", () => {
  it("refuses a confirmed vendor-risk parent when a project-risk parent is confirmed", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const projectParent = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :projectParent, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, child, projectParent } },
    );

    await expect(
      sequelize.query(
        `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id, relation_type, status, source)
         VALUES (:orgId, :child, :vendorRisk, 'inherits_from', 'confirmed', 'user')`,
        { replacements: { orgId: owner.orgId, child, vendorRisk } },
      ),
    ).rejects.toMatchObject({
      original: { code: "23505", constraint: "risk_links_single_parent_idx" },
    });
  });
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.crossEntity`

Expected: every test fails with `column "target_model_risk_id" of relation "risk_links" does not exist`. If instead you get `relation "model_risks" does not exist`, your test database is behind on migrations generally — run `npm run migrate` against it first.

- [ ] **Step 4: Write the migration**

Create `Servers/database/migrations/20260830120000-risk-links-cross-entity-parent.js`:

```js
"use strict";

module.exports = {
  async up(queryInterface) {
    // The child column (source_risk_id) is deliberately untouched. It carries
    // risk_links_single_parent_idx, and in value-chain inheritance the child is
    // always a project risk — so C1's one-parent rule extends across entity
    // types for free. See the C4 design, §2.4.
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        ALTER COLUMN target_risk_id DROP NOT NULL,
        ADD COLUMN IF NOT EXISTS target_model_risk_id  INTEGER REFERENCES verifywise.model_risks(id)  ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS target_vendor_risk_id INTEGER REFERENCES verifywise.vendorrisks(id) ON DELETE CASCADE;
    `);

    // Exactly one parent, of exactly one kind.
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        ADD CONSTRAINT risk_links_one_target CHECK (
            (target_risk_id        IS NOT NULL)::int
          + (target_model_risk_id  IS NOT NULL)::int
          + (target_vendor_risk_id IS NOT NULL)::int = 1
        );
    `);

    // risk_links_canonical orders related_to edges smaller-id-first by comparing
    // bare integers. Across tables those integers come from different sequences,
    // and with a NULL target_risk_id the comparison yields NULL and the CHECK
    // PASSES silently. Forbidding the combination closes that hole.
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.risk_links
        ADD CONSTRAINT risk_links_cross_entity_inherits CHECK (
          target_risk_id IS NOT NULL OR relation_type = 'inherits_from'
        );
    `);

    // risk_links_unique stops protecting cross-entity rows once target_risk_id
    // is NULL: Postgres treats each NULL as distinct. These restore it.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS risk_links_unique_model_target
        ON verifywise.risk_links (source_risk_id, target_model_risk_id, relation_type)
        WHERE target_model_risk_id IS NOT NULL;
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS risk_links_unique_vendor_target
        ON verifywise.risk_links (source_risk_id, target_vendor_risk_id, relation_type)
        WHERE target_vendor_risk_id IS NOT NULL;
    `);
  },

  async down(queryInterface) {
    // Drops cross-entity rows: target_risk_id cannot go back to NOT NULL while
    // they exist, and there is no project risk to point them at.
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.risk_links WHERE target_risk_id IS NULL;
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.risk_links_unique_vendor_target;
      DROP INDEX IF EXISTS verifywise.risk_links_unique_model_target;
      ALTER TABLE verifywise.risk_links
        DROP CONSTRAINT IF EXISTS risk_links_cross_entity_inherits,
        DROP CONSTRAINT IF EXISTS risk_links_one_target,
        DROP COLUMN IF EXISTS target_vendor_risk_id,
        DROP COLUMN IF EXISTS target_model_risk_id,
        ALTER COLUMN target_risk_id SET NOT NULL;
    `);
  },
};
```

- [ ] **Step 5: Run the migration and the tests**

```bash
cd Servers && npm run migrate && npm run test:integration -- --testPathPatterns=riskLinks.crossEntity
```

Expected: PASS. The single-parent test passing is the design's central claim confirmed — if it fails, **stop and report it** rather than adding a constraint.

- [ ] **Step 6: Commit**

```bash
git add Servers/database/migrations/20260830120000-risk-links-cross-entity-parent.js Servers/tests/factories Servers/tests/integration/riskLinks.crossEntity.test.ts
git commit -m "feat(risk-links): let a link point at a vendor or model risk"
```

---

## Task 2: Teach the hierarchy rule about entity types

**Files:**
- Modify: `Servers/services/riskLinks/hierarchy.ts`
- Test: `Servers/services/riskLinks/tests/hierarchy.test.ts`

**Interfaces:**
- Produces: `export type ParentEntityType = "risk" | "model_risk" | "vendor_risk"`; `HierarchyEdge` gains optional `parentEntityType?: ParentEntityType`. `validateTwoLevel`'s signature is otherwise unchanged.

- [ ] **Step 1: Write the failing test**

Append to `Servers/services/riskLinks/tests/hierarchy.test.ts`:

```ts
describe("cross-entity parents (C4)", () => {
  it("does not mistake a model risk for the project risk of the same id", () => {
    // risks(7) is already the child of risks(9). Proposing model_risks(7) as a
    // parent must NOT report parent_is_a_child: the ids come from different
    // sequences and refer to unrelated rows.
    const confirmed = [{ childRiskId: 7, parentRiskId: 9 }];

    expect(
      validateTwoLevel(
        { childRiskId: 41, parentRiskId: 7, parentEntityType: "model_risk" },
        confirmed,
      ),
    ).toBeNull();
  });

  it("still refuses a second parent when one is cross-entity", () => {
    const confirmed = [
      { childRiskId: 41, parentRiskId: 3, parentEntityType: "vendor_risk" as const },
    ];

    expect(
      validateTwoLevel({ childRiskId: 41, parentRiskId: 9 }, confirmed),
    ).toBe("child_already_has_parent");
  });

  it("treats the same cross-entity parent as a duplicate, not a violation", () => {
    const confirmed = [
      { childRiskId: 41, parentRiskId: 3, parentEntityType: "vendor_risk" as const },
    ];

    expect(
      validateTwoLevel(
        { childRiskId: 41, parentRiskId: 3, parentEntityType: "vendor_risk" },
        confirmed,
      ),
    ).toBeNull();
  });

  it("does not confuse a vendor-risk parent with a model-risk parent of the same id", () => {
    const confirmed = [
      { childRiskId: 41, parentRiskId: 3, parentEntityType: "vendor_risk" as const },
    ];

    expect(
      validateTwoLevel(
        { childRiskId: 41, parentRiskId: 3, parentEntityType: "model_risk" },
        confirmed,
      ),
    ).toBe("child_already_has_parent");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd Servers && npm run test -- --testPathPatterns=hierarchy`

Expected: a TypeScript compile failure — `Object literal may only specify known properties, and 'parentEntityType' does not exist in type 'HierarchyEdge'`. That is the red step. Do not add the field and re-run before writing the logic in Step 3; add both together.

- [ ] **Step 3: Implement**

In `Servers/services/riskLinks/hierarchy.ts`, add the type, extend the interface, and switch the three comparisons to a key:

```ts
/** Which table a parent id points at. C4: vendor and model risks are parents only. */
export type ParentEntityType = "risk" | "model_risk" | "vendor_risk";

/** In storage, `source_risk_id` is the child and the target column is the parent. */
export interface HierarchyEdge {
  childRiskId: number;
  parentRiskId: number;
  /**
   * Which table `parentRiskId` points at. Absent means `risks`, so every C1–C3
   * caller keeps working untouched. Without it, `model_risks.id = 7` and
   * `risks.id = 7` compare equal and the validator reports a violation about a
   * row the user never mentioned.
   */
  parentEntityType?: ParentEntityType;
}

const parentKey = (e: HierarchyEdge): string =>
  `${e.parentEntityType ?? "risk"}:${e.parentRiskId}`;

export function validateTwoLevel(
  proposed: HierarchyEdge,
  confirmed: HierarchyEdge[],
): HierarchyViolation | null {
  const { childRiskId } = proposed;
  const proposedParent = parentKey(proposed);

  const others = confirmed.filter(
    (e) => !(e.childRiskId === childRiskId && parentKey(e) === proposedParent),
  );

  // Order is load-bearing: first match wins, so the message is deterministic
  // when more than one rule applies.
  if (others.some((e) => e.childRiskId === childRiskId)) return "child_already_has_parent";

  // A cross-entity parent can never itself be a child (C4 §3.3), and childRiskId
  // only ever holds a risks(id) — so this check is meaningful only for a plain
  // risk parent. Guarding it is what stops the id collision.
  if ((proposed.parentEntityType ?? "risk") === "risk") {
    if (others.some((e) => e.childRiskId === proposed.parentRiskId)) return "parent_is_a_child";
  }

  if (others.some((e) => parentKey(e) === `risk:${childRiskId}`)) return "child_has_children";
  return null;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd Servers && npm run test -- --testPathPatterns=hierarchy`

Expected: PASS, including every pre-existing test — none of them pass `parentEntityType`, so all of them exercise the `?? "risk"` default.

- [ ] **Step 5: Commit**

```bash
git add Servers/services/riskLinks/hierarchy.ts Servers/services/riskLinks/tests/hierarchy.test.ts
git commit -m "fix(risk-links): stop a model risk id colliding with a project risk id"
```

---

## Task 3: Fetch the right confirmed edges for a cross-entity parent

**Files:**
- Modify: `Servers/utils/riskLink.utils.ts:291-315`
- Modify: `Servers/controllers/riskLinks.ctrl.ts` (the one call site, ~line 393)
- Test: `Servers/tests/integration/riskLinks.crossEntity.test.ts`

**Interfaces:**
- Consumes: `ParentEntityType` from Task 2.
- Produces: `export interface HierarchyParent { id: number; entityType: ParentEntityType }` and the new signature `getConfirmedHierarchyEdgesQuery(organizationId: number, childRiskId: number, parent: HierarchyParent): Promise<HierarchyEdge[]>`.

Task 2 fixed the validator. This is the layer below it: the query that feeds the validator has the same id collision in its WHERE clause, so fixing only one leaves the validator receiving edges it should never have been handed.

- [ ] **Step 1: Write the failing test**

Append to `Servers/tests/integration/riskLinks.crossEntity.test.ts`:

```ts
import { getConfirmedHierarchyEdgesQuery } from "../../utils/riskLink.utils";

describe("getConfirmedHierarchyEdgesQuery with a cross-entity parent", () => {
  it("ignores the project risk that happens to share the model risk's id", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const decoyChild = await createTestRisk(owner.orgId, {});
    const decoyParent = await createTestRisk(owner.orgId, {});

    // decoyChild is a confirmed child of decoyParent. It is unrelated to
    // anything we are about to propose.
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id, relation_type, status, source)
       VALUES (:orgId, :decoyChild, :decoyParent, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, decoyChild, decoyParent } },
    );

    // Ask about a MODEL risk whose id equals decoyChild's id. Nothing about
    // decoyChild should come back.
    const edges = await getConfirmedHierarchyEdgesQuery(owner.orgId, child, {
      id: decoyChild,
      entityType: "model_risk",
    });

    expect(edges).toEqual([]);
  });

  it("returns the child's existing cross-entity parent, labelled", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :vendorRisk, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, child, vendorRisk } },
    );

    const edges = await getConfirmedHierarchyEdgesQuery(owner.orgId, child, {
      id: vendorRisk,
      entityType: "vendor_risk",
    });

    expect(edges).toEqual([
      { childRiskId: child, parentRiskId: vendorRisk, parentEntityType: "vendor_risk" },
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.crossEntity`

Expected: a TypeScript compile failure on the third argument — the current signature takes `parentRiskId: number`.

- [ ] **Step 3: Implement the query**

Replace `getConfirmedHierarchyEdgesQuery` in `Servers/utils/riskLink.utils.ts`:

```ts
/** Which parent the caller is proposing, and which table it lives in. */
export interface HierarchyParent {
  id: number;
  entityType: ParentEntityType;
}

export async function getConfirmedHierarchyEdgesQuery(
  organizationId: number,
  childRiskId: number,
  parent: HierarchyParent,
): Promise<HierarchyEdge[]> {
  // Only one of the three parent bindings is ever non-null. `IN` and `=`
  // against NULL yield NULL, so the unused branches match nothing rather than
  // matching everything — the same fail-closed property the tenant filters use.
  const rows = await sequelize.query(
    `SELECT source_risk_id, target_risk_id, target_model_risk_id, target_vendor_risk_id
       FROM risk_links
      WHERE organization_id = :organizationId
        AND relation_type = 'inherits_from'
        AND status = 'confirmed'
        AND (source_risk_id IN (:childRiskId, :parentRiskId)
             OR target_risk_id IN (:childRiskId, :parentRiskId)
             OR target_model_risk_id = :parentModelRiskId
             OR target_vendor_risk_id = :parentVendorRiskId)`,
    {
      replacements: {
        organizationId,
        childRiskId,
        parentRiskId: parent.entityType === "risk" ? parent.id : null,
        parentModelRiskId: parent.entityType === "model_risk" ? parent.id : null,
        parentVendorRiskId: parent.entityType === "vendor_risk" ? parent.id : null,
      },
      type: QueryTypes.SELECT,
    },
  );

  // source is the child, target is the parent — see risk_links_canonical, which
  // exempts inherits_from from id reordering precisely so this holds.
  return (
    rows as {
      source_risk_id: number;
      target_risk_id: number | null;
      target_model_risk_id: number | null;
      target_vendor_risk_id: number | null;
    }[]
  ).map((row) => ({
    childRiskId: row.source_risk_id,
    parentRiskId: (row.target_model_risk_id ??
      row.target_vendor_risk_id ??
      row.target_risk_id) as number,
    parentEntityType:
      row.target_model_risk_id != null
        ? ("model_risk" as const)
        : row.target_vendor_risk_id != null
          ? ("vendor_risk" as const)
          : ("risk" as const),
  }));
}
```

Import `ParentEntityType` alongside the existing `HierarchyEdge` import.

- [ ] **Step 4: Update the one call site**

In `Servers/controllers/riskLinks.ctrl.ts`, the `inherits_from` branch currently passes a bare number. Make it pass the pair (Task 5 replaces `targetRiskId` with a resolved target; for now keep it a plain risk):

```ts
await getConfirmedHierarchyEdgesQuery(req.organizationId!, sourceRiskId, {
  id: targetRiskId,
  entityType: "risk",
}),
```

- [ ] **Step 5: Run the tests**

```bash
cd Servers && npm run test:integration -- --testPathPatterns=riskLinks
```

Expected: PASS, all suites — `riskLinks.hierarchy` included, since a plain-risk parent behaves exactly as before.

- [ ] **Step 6: Commit**

```bash
git add Servers/utils/riskLink.utils.ts Servers/controllers/riskLinks.ctrl.ts Servers/tests/integration/riskLinks.crossEntity.test.ts
git commit -m "fix(risk-links): scope the hierarchy fetch to the parent's own table"
```

---

## Task 4: Read cross-entity parents into the panel

**Files:**
- Modify: `Servers/services/riskLinks/types.ts:64-79`
- Modify: `Servers/utils/riskLink.utils.ts:599-650` (`getRiskLinksForRiskQuery`)
- Modify: `Servers/controllers/riskLinks.ctrl.ts` (`toResponse`, ~line 60-80)
- Test: `Servers/tests/integration/riskLinks.crossEntity.test.ts`

**Interfaces:**
- Produces: `RiskLinkRow` gains `target_model_risk_id: number | null` and `target_vendor_risk_id: number | null`; `target_risk_id` becomes `number | null`. The query's row shape gains `related_entity_type: ParentEntityType`. `toResponse` emits `relatedRisk.entityType`.

- [ ] **Step 1: Write the failing tests**

Append to `Servers/tests/integration/riskLinks.crossEntity.test.ts`:

```ts
import { getRiskLinksForRiskQuery } from "../../utils/riskLink.utils";

describe("getRiskLinksForRiskQuery with cross-entity parents", () => {
  it("names a vendor risk from its truncated description", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {
      risk_description: "A".repeat(120),
      risk_level: "High",
    });

    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :vendorRisk, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, child, vendorRisk } },
    );

    const [row] = await getRiskLinksForRiskQuery(child, owner.orgId, ["confirmed"]);

    expect(row.related_entity_type).toBe("vendor_risk");
    expect(row.related_id).toBe(vendorRisk);
    expect(row.related_risk_name).toBe("A".repeat(80));
    expect(row.related_risk_level).toBe("High");
  });

  it("hides a parent that belongs to another tenant", async () => {
    const { owner, other } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const foreignModelRisk = await createTestModelRisk(other.orgId, {});

    // The link row itself is in the owner's org; only the parent is foreign.
    // Without the per-table tenant guard this renders as a blank panel row.
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_model_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :foreignModelRisk, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, child, foreignModelRisk } },
    );

    expect(await getRiskLinksForRiskQuery(child, owner.orgId, ["confirmed"])).toEqual([]);
  });

  it("hides a soft-deleted parent", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const modelRisk = await createTestModelRisk(owner.orgId, {});

    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_model_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :modelRisk, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, child, modelRisk } },
    );
    await sequelize.query(`UPDATE model_risks SET is_deleted = true WHERE id = :modelRisk`, {
      replacements: { modelRisk },
    });

    expect(await getRiskLinksForRiskQuery(child, owner.orgId, ["confirmed"])).toEqual([]);
  });

  it("still returns plain project-risk parents", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});

    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :parent, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, child, parent } },
    );

    const [row] = await getRiskLinksForRiskQuery(child, owner.orgId, ["confirmed"]);
    expect(row.related_entity_type).toBe("risk");
    expect(row.related_id).toBe(parent);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.crossEntity`

Expected: the three cross-entity cases fail because the inner `JOIN risks related` drops any row with a NULL `target_risk_id` — you get `[]` where a row was expected, and a TypeScript error on `related_entity_type`. The fourth ("still returns plain project-risk parents") passes already; that is the regression guard, and it is meant to be green throughout.

Two things that look like they should also be dropping these rows, and do not — check them off rather than chasing them:

- `AND (l.source_risk_id = :riskId OR l.target_risk_id = :riskId)` survives untouched. `target_risk_id = :riskId` is NULL on a cross-entity row, but the subject of this query is always the **child**, and the child is always `source_risk_id`, so the first disjunct is TRUE. Leave this line exactly as it is.
- `AND related.organization_id = :organizationId AND related.is_deleted = false` **would** re-drop every cross-entity row the moment the join goes `LEFT` — a NULL `related` fails both. That is why Step 3 moves them into the `ON` clause. This is the one place where turning an inner join into a `LEFT JOIN` is not sufficient on its own.

- [ ] **Step 3: Rewrite the query**

Replace the query body inside `getRiskLinksForRiskQuery`:

```sql
SELECT l.*,
       COALESCE(mr.id, vr.id, related.id) AS related_id,
       CASE
         WHEN l.target_model_risk_id  IS NOT NULL THEN 'model_risk'
         WHEN l.target_vendor_risk_id IS NOT NULL THEN 'vendor_risk'
         ELSE 'risk'
       END AS related_entity_type,
       COALESCE(
         related.risk_name,
         NULLIF(mr.risk_name, ''),
         NULLIF(LEFT(vr.risk_description, 80), '')
       ) AS related_risk_name,
       COALESCE(
         related.risk_level_autocalculated::text,
         mr.risk_level::text,
         vr.risk_level
       ) AS related_risk_level,
       COALESCE(related.risk_owner, mr.owner, vr.action_owner) AS related_risk_owner
  FROM risk_links l
  -- LEFT, and the tenant/soft-delete guards live in ON rather than WHERE: in
  -- WHERE they would re-drop every cross-entity row, which is exactly the bug
  -- the inner join had.
  LEFT JOIN risks related
         ON related.id = CASE WHEN l.source_risk_id = :riskId
                              THEN l.target_risk_id ELSE l.source_risk_id END
        AND related.organization_id = :organizationId
        AND related.is_deleted = false
  LEFT JOIN model_risks mr
         ON mr.id = l.target_model_risk_id
        AND mr.organization_id = :organizationId
        AND mr.is_deleted = false
  LEFT JOIN vendorrisks vr
         ON vr.id = l.target_vendor_risk_id
        AND vr.organization_id = :organizationId
        AND vr.is_deleted = false
  JOIN risks subject ON subject.id = :riskId
 WHERE l.organization_id = :organizationId
   AND (l.source_risk_id = :riskId OR l.target_risk_id = :riskId)
   AND subject.organization_id = :organizationId
   AND subject.is_deleted = false
   AND l.status IN (:statuses)
   -- The tenant boundary. A parent that is deleted or belongs to another org
   -- resolved to NULL in all three joins; drop the row rather than render it blank.
   AND COALESCE(related.id, mr.id, vr.id) IS NOT NULL
 ORDER BY l.score DESC, COALESCE(mr.id, vr.id, related.id) ASC
```

Widen the row type the function returns with `related_entity_type: ParentEntityType`.

`vendorrisks.risk_level` is a plain VARCHAR while the other two are enums, hence the `::text` casts on those two only.

- [ ] **Step 4: Update the types and `toResponse`**

In `Servers/services/riskLinks/types.ts`, `RiskLinkRow`:

```ts
  source_risk_id: number;
  /** Null when the parent lives in another table — see the two columns below. */
  target_risk_id: number | null;
  target_model_risk_id: number | null;
  target_vendor_risk_id: number | null;
```

In `Servers/controllers/riskLinks.ctrl.ts`, `toResponse`'s `relatedRisk` object gains one field:

```ts
    relatedRisk: {
      id: link.related_id,
      entityType: link.related_entity_type,
      name: link.related_risk_name,
      riskLevel: link.related_risk_level,
      ownerId: link.related_risk_owner,
    },
```

`direction` needs no change. It reads `link.source_risk_id === riskId ? "outgoing" : "incoming"`, and on a cross-entity row the subject is the child, i.e. `source_risk_id` — so it computes `"outgoing"`, which is what puts the row under the panel's **Inherits from** heading. Verify that in the test rather than trusting this note; if a cross-entity parent ever renders under "Is inherited by", this is the line to look at.

- [ ] **Step 5: Run the tests**

```bash
cd Servers && npm run test && npm run test:integration -- --testPathPatterns=riskLinks
```

Expected: PASS everywhere. `npm run test` must stay green — `RiskLinkRow.target_risk_id` becoming nullable will surface anywhere a unit test or helper assumed it was not.

- [ ] **Step 6: Commit**

```bash
git add Servers/services/riskLinks/types.ts Servers/utils/riskLink.utils.ts Servers/controllers/riskLinks.ctrl.ts Servers/tests/integration/riskLinks.crossEntity.test.ts
git commit -m "feat(risk-links): show vendor and model risk parents in the panel"
```

---

## Task 5: Accept a cross-entity parent on POST

**Files:**
- Modify: `Servers/controllers/riskLinks.ctrl.ts:355-430`
- Modify: `Servers/utils/riskLink.utils.ts` (`getLiveCrossEntityParentQuery`, `createUserRiskLinkQuery`)
- Test: `Servers/tests/integration/riskLinks.crossEntity.test.ts`

**Interfaces:**
- Consumes: `HierarchyParent` (Task 3), `ParentEntityType` (Task 2).
- Produces: `getLiveCrossEntityParentQuery(parent: HierarchyParent, organizationId: number): Promise<boolean>`; `createUserRiskLinkQuery` gains a `target: HierarchyParent` parameter in place of `targetRiskId`.

- [ ] **Step 1: Write the failing tests**

These go through the HTTP layer. Follow the request-building style already in `Servers/tests/integration/riskLinks.dismissReason.test.ts` — reuse its app/token helpers rather than inventing new ones.

```ts
describe("POST /api/risk-links with a cross-entity parent", () => {
  it("creates an inheritance link to a vendor risk", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    const res = await request(app)
      .post("/api/risk-links")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ sourceRiskId: child, targetVendorRiskId: vendorRisk, relationType: "inherits_from" });

    expect(res.status).toBe(201);
    expect(res.body.data.relatedRisk.entityType).toBe("vendor_risk");
    expect(res.body.data.relatedRisk.id).toBe(vendorRisk);
  });

  it("rejects two target fields", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    const res = await request(app)
      .post("/api/risk-links")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        sourceRiskId: child,
        targetRiskId: parent,
        targetVendorRiskId: vendorRisk,
        relationType: "inherits_from",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/exactly one parent/i);
  });

  it("rejects related_to across entity types", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const modelRisk = await createTestModelRisk(owner.orgId, {});

    const res = await request(app)
      .post("/api/risk-links")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ sourceRiskId: child, targetModelRiskId: modelRisk, relationType: "related_to" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/only inheritance links/i);
  });

  it("404s on another tenant's model risk", async () => {
    const { owner, other } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const foreign = await createTestModelRisk(other.orgId, {});

    const res = await request(app)
      .post("/api/risk-links")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ sourceRiskId: child, targetModelRiskId: foreign, relationType: "inherits_from" });

    expect(res.status).toBe(404);
  });

  it("409s when the child already has a confirmed project-risk parent", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :parent, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, child, parent } },
    );

    const res = await request(app)
      .post("/api/risk-links")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ sourceRiskId: child, targetVendorRiskId: vendorRisk, relationType: "inherits_from" });

    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd Servers && npm run test:integration -- --testPathPatterns=riskLinks.crossEntity`

Expected: 400 "Invalid link payload" on every one of them — `parseInt(String(undefined))` is `NaN` and the existing guard rejects it.

- [ ] **Step 3: Resolve the target in the controller**

Add above the handler in `Servers/controllers/riskLinks.ctrl.ts`:

```ts
type TargetRejection = "not_exactly_one" | "cross_entity_related_to";

const TARGET_MESSAGES: Record<TargetRejection, string> = {
  not_exactly_one: "Provide exactly one parent risk.",
  cross_entity_related_to: "Only inheritance links are supported across risk types.",
};

/**
 * Exactly one of the three target fields must be present. The CHECK constraint
 * `risk_links_one_target` says the same thing at the table; this is the layer
 * that produces a readable message instead of a 500.
 */
function resolveTarget(
  body: any,
  relationType: RiskLinkRelationType,
): { parent: HierarchyParent } | { rejection: TargetRejection } {
  const candidates: [ParentEntityType, unknown][] = [
    ["risk", body?.targetRiskId],
    ["model_risk", body?.targetModelRiskId],
    ["vendor_risk", body?.targetVendorRiskId],
  ];
  const given = candidates
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([entityType, v]) => ({ entityType, id: parseInt(String(v), 10) }));

  if (given.length !== 1 || isNaN(given[0].id)) return { rejection: "not_exactly_one" };
  if (given[0].entityType !== "risk" && relationType !== "inherits_from") {
    return { rejection: "cross_entity_related_to" };
  }
  return { parent: given[0] };
}
```

Rework the handler's opening. The self-link and liveness checks branch on entity type; everything from the hierarchy check down is shared.

```ts
  const sourceRiskId = parseInt(String(req.body?.sourceRiskId), 10);
  const relationType = req.body?.relationType;

  if (isNaN(sourceRiskId) || !isRelationType(relationType)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid link payload"));
  }

  const resolved = resolveTarget(req.body, relationType);
  if ("rejection" in resolved) {
    return res.status(400).json(STATUS_CODE[400](TARGET_MESSAGES[resolved.rejection]));
  }
  const { parent } = resolved;

  // Self-linking is only expressible within one table.
  if (parent.entityType === "risk" && sourceRiskId === parent.id) {
    return res.status(400).json(STATUS_CODE[400]("A risk cannot link to itself"));
  }

  if (parent.entityType === "risk") {
    const live = await getLiveRiskIdsQuery([sourceRiskId, parent.id], req.organizationId!);
    if (live.length !== 2) {
      return res.status(404).json(STATUS_CODE[404]("Risk not found"));
    }
  } else {
    const childLive = await getLiveRiskIdsQuery([sourceRiskId], req.organizationId!);
    if (childLive.length !== 1) {
      return res.status(404).json(STATUS_CODE[404]("Risk not found"));
    }
    if (!(await getLiveCrossEntityParentQuery(parent, req.organizationId!))) {
      return res.status(404).json(STATUS_CODE[404]("Risk not found"));
    }
  }

  if (relationType === "inherits_from") {
    const violation = validateTwoLevel(
      { childRiskId: sourceRiskId, parentRiskId: parent.id, parentEntityType: parent.entityType },
      await getConfirmedHierarchyEdgesQuery(req.organizationId!, sourceRiskId, parent),
    );
    if (violation) {
      return res.status(409).json(STATUS_CODE[409](HIERARCHY_MESSAGES[violation]));
    }
  }
```

The canonicalisation block below stays, but only ever runs for a plain-risk `related_to` — a cross-entity target cannot reach it, because `resolveTarget` rejects that combination.

- [ ] **Step 4: Add the liveness query**

In `Servers/utils/riskLink.utils.ts`:

```ts
/**
 * Whether a cross-entity parent exists, is not soft-deleted, and belongs to
 * this org. `model_risks.organization_id` is nullable in the schema; matching on
 * equality makes such a row invisible, which is the correct fail-closed answer.
 */
export async function getLiveCrossEntityParentQuery(
  parent: HierarchyParent,
  organizationId: number,
): Promise<boolean> {
  const table = parent.entityType === "model_risk" ? "model_risks" : "vendorrisks";
  const rows = await sequelize.query(
    `SELECT 1 FROM ${table}
      WHERE id = :id AND organization_id = :organizationId AND is_deleted = false`,
    { replacements: { id: parent.id, organizationId }, type: QueryTypes.SELECT },
  );
  return rows.length === 1;
}
```

`table` is chosen from a closed two-value union, never from request data — there is no interpolation of user input here.

Then widen `createUserRiskLinkQuery` to take `target: HierarchyParent` and write the matching column:

```ts
  const targetColumn =
    target.entityType === "model_risk"
      ? "target_model_risk_id"
      : target.entityType === "vendor_risk"
        ? "target_vendor_risk_id"
        : "target_risk_id";
```

and use `${targetColumn}` in the INSERT's column list. The `ON CONFLICT` target needs more than the column swap: Postgres only matches a **partial** index when the clause repeats its predicate, so the three cases are not interchangeable.

```ts
  const conflictTarget =
    target.entityType === "risk"
      ? "(source_risk_id, target_risk_id, relation_type)"
      : `(source_risk_id, ${targetColumn}, relation_type) WHERE ${targetColumn} IS NOT NULL`;
```

Without the `WHERE`, Postgres answers `there is no unique or exclusion constraint matching the ON CONFLICT specification` — a 500, not a duplicate-friendly no-op. Both `targetColumn` and `conflictTarget` come from the closed `ParentEntityType` union, never from request data.

**Leave `createAgentHierarchyLinkQuery` alone.** It carries the same `ON CONFLICT (source_risk_id, target_risk_id, relation_type)` clause, and that stays correct: C4 is manual-only (spec §3.1), so the agent path only ever writes `target_risk_id`, and the plain `risk_links_unique` constraint still covers every row it produces. Widening it would be dead code for a suggester that does not exist.

- [ ] **Step 5: Run everything**

```bash
cd Servers && npm run test && npm run test:integration -- --testPathPatterns=riskLinks && npx tsx scripts/checkApiDrift.ts
```

Expected: PASS. API drift reports **no drift** — it compares path, method and `security.bearerAuth` only, and a request-body change touches none of those. That is expected, not a miss.

- [ ] **Step 6: Commit**

```bash
git add Servers/controllers/riskLinks.ctrl.ts Servers/utils/riskLink.utils.ts Servers/tests/integration/riskLinks.crossEntity.test.ts
git commit -m "feat(risk-links): link a project risk to a vendor or model risk parent"
```

---

## Task 6: Show the parent's type in the panel

**Files:**
- Modify: `Clients/src/domain/interfaces/i.riskLink.ts`
- Modify: `Clients/src/presentation/components/LinkedRisksPanel/index.tsx:224`
- Modify: `Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx`
- Test: `Clients/src/presentation/components/LinkedRisksPanel/__tests__/index.test.tsx`

**Interfaces:**
- Consumes: the API shape from Tasks 4 and 5.
- Produces: `RiskLinkEntityType`; `RiskLink["relatedRisk"]` gains `entityType`; `CreateRiskLinkInput` becomes a union over the three target fields.

- [ ] **Step 1: Write the failing test**

Append to the panel's test file, matching its existing render helper:

```tsx
it("labels a vendor risk parent", async () => {
  renderPanel([
    makeLink({
      relationType: "inherits_from",
      direction: "outgoing",
      status: "confirmed",
      relatedRisk: {
        id: 3,
        entityType: "vendor_risk",
        name: "Subprocessor has no SOC 2 report",
        riskLevel: "High",
        ownerId: null,
      },
    }),
  ]);

  expect(await screen.findByText("Vendor risk")).toBeInTheDocument();
});

it("does not label a plain project risk parent", async () => {
  renderPanel([
    makeLink({
      relationType: "inherits_from",
      direction: "outgoing",
      status: "confirmed",
      relatedRisk: { id: 3, entityType: "risk", name: "Model drift", riskLevel: "High", ownerId: null },
    }),
  ]);

  expect(await screen.findByText("Model drift")).toBeInTheDocument();
  expect(screen.queryByText("Project risk")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd Clients && npx vitest run LinkedRisksPanel`

Expected: a TypeScript error on `entityType`, then `Unable to find an element with the text: Vendor risk`.

- [ ] **Step 3: Extend the interface**

In `Clients/src/domain/interfaces/i.riskLink.ts`:

```ts
/** Mirrors `ParentEntityType` in Servers/services/riskLinks/hierarchy.ts. */
export type RiskLinkEntityType = "risk" | "model_risk" | "vendor_risk";

/** Empty for "risk": a project risk in a panel of project risks needs no label. */
export const ENTITY_TYPE_LABELS: Record<RiskLinkEntityType, string> = {
  risk: "",
  model_risk: "Model risk",
  vendor_risk: "Vendor risk",
};
```

`relatedRisk` gains `entityType: RiskLinkEntityType`.

`CreateRiskLinkInput` becomes a union, so the compiler enforces what
`risk_links_one_target` enforces at the table:

```ts
export type CreateRiskLinkInput = {
  sourceRiskId: number;
  relationType: RiskLinkRelationType;
} & (
  | { targetRiskId: number }
  | { targetModelRiskId: number }
  | { targetVendorRiskId: number }
);
```

- [ ] **Step 4: Render the chip**

In `LinkedRisksPanel/index.tsx`, beside the existing level chip at line 224:

```tsx
{ENTITY_TYPE_LABELS[link.relatedRisk.entityType] && (
  <Chip
    size="small"
    variant="outlined"
    label={ENTITY_TYPE_LABELS[link.relatedRisk.entityType]}
  />
)}
{link.relatedRisk.riskLevel && (
  <Chip size="small" label={link.relatedRisk.riskLevel} />
)}
```

- [ ] **Step 5: Add the source selector to `LinkRiskForm`**

The selector renders **only** under `inherits_from`. That is not a shortcut: a vendor or model risk can only ever be a parent (spec §3.3) and a cross-entity link can only ever be `inherits_from` (§3.4), so under the other two choices every cross-entity option would be disabled. Rendering nothing beats rendering two dead radios with a tooltip apologising for them.

Add the imports:

```tsx
import { getAllVendorRisks } from "../../../application/repository/vendorRisk.repository";
import { getAllEntities } from "../../../application/repository/entity.repository";
```

Add the source type above the component, next to `CHOICES`:

```tsx
type ParentSource = "risk" | "model_risk" | "vendor_risk";

const PARENT_SOURCES: { value: ParentSource; label: string }[] = [
  { value: "risk", label: "Project risk" },
  { value: "model_risk", label: "Model risk" },
  { value: "vendor_risk", label: "Vendor risk" },
];
```

Add the state next to `rawChoice`, and derive `source` the same way `choice` is derived — for the same reason, so a relation-type change cannot leave a stale cross-entity source behind:

```tsx
  const [rawSource, setRawSource] = useState<ParentSource>("risk");
  const source: ParentSource = choice === "inherits_from" ? rawSource : "risk";
```

Fetch the cross-entity candidates. Both branches project down to the same `Candidate` shape the autocomplete already renders, and the vendor-risk truncation matches the server's `LEFT(risk_description, 80)` from spec §5.2 — the same string, so the option the user picks reads identically to the chip they get back:

```tsx
  const { data: crossEntityCandidates = [] } = useQuery<Candidate[]>({
    queryKey: ["riskLinkParents", source],
    enabled: source !== "risk",
    queryFn: async () => {
      const response: any =
        source === "vendor_risk"
          ? await getAllVendorRisks({ filter: "active" })
          : await getAllEntities({ routeUrl: "/modelRisks" });
      const rows = (response?.data ?? []) as any[];
      return rows.map((row) => ({
        id: row.id,
        risk_name:
          source === "vendor_risk"
            ? (row.risk_description ?? "").slice(0, 80) || "Untitled vendor risk"
            : row.risk_name || "Untitled model risk",
      }));
    },
  });
```

`excludedIds` must become key-based. A `model_risks` row and a `risks` row share id space — this is the same collision the backend hits in Tasks 2 and 3, and here it would silently hide an unrelated model risk because a project risk with that id is already linked:

```tsx
  const excludedKeys = useMemo(() => {
    const keys = new Set<string>([`risk:${riskId}`]);
    for (const link of existingLinks) {
      const blocks =
        choice === "related_to"
          ? link.relationType === "related_to"
          : link.relationType === "inherits_from";
      if (blocks) keys.add(`${link.relatedRisk.entityType}:${link.relatedRisk.id}`);
    }
    return keys;
  }, [existingLinks, choice, riskId]);

  const options = useMemo(() => {
    const pool = source === "risk" ? candidates : crossEntityCandidates;
    return pool.filter((candidate) => !excludedKeys.has(`${source}:${candidate.id}`));
  }, [candidates, crossEntityCandidates, source, excludedKeys]);
```

Reset the partner when the source changes, exactly as `handleChoice` already does:

```tsx
  const handleSource = (next: ParentSource) => {
    setRawSource(next);
    setError(null);
    setPartner(null);
  };
```

Send the right target field:

```tsx
    const input: CreateRiskLinkInput =
      choice === "inherited_by"
        ? { sourceRiskId: partner.id, targetRiskId: riskId, relationType: "inherits_from" }
        : source === "model_risk"
          ? { sourceRiskId: riskId, targetModelRiskId: partner.id, relationType: "inherits_from" }
          : source === "vendor_risk"
            ? { sourceRiskId: riskId, targetVendorRiskId: partner.id, relationType: "inherits_from" }
            : { sourceRiskId: riskId, targetRiskId: partner.id, relationType: choice };
```

Render the selector directly under the existing `RadioGroup`, and label the autocomplete for what it is now listing:

```tsx
      {choice === "inherits_from" && (
        <RadioGroup
          row
          value={source}
          onChange={(event) => handleSource(event.target.value as ParentSource)}
        >
          {PARENT_SOURCES.map(({ value, label }) => (
            <FormControlLabel key={value} value={value} control={<Radio />} label={label} />
          ))}
        </RadioGroup>
      )}
```

and change the `AutoCompleteField` label from the hard-coded `"Risk"`:

```tsx
        label={PARENT_SOURCES.find((s) => s.value === source)!.label}
```

- [ ] **Step 6: Run the frontend checks**

```bash
cd Clients && npm run typecheck && npx vitest run
```

Expected: PASS both. `typecheck` is not optional — `npm run build` does not run `tsc`, so a type error passes a green build.

- [ ] **Step 7: Commit**

```bash
git add Clients/src/domain/interfaces/i.riskLink.ts Clients/src/presentation/components/LinkedRisksPanel
git commit -m "feat(risk-links): label vendor and model risk parents in the panel"
```

---

## Task 7: Document it and verify the whole branch

**Files:**
- Modify: `docs/technical/domains/risk-management.md`
- Modify: `CLAUDE.md` (Last Updated date only, if you touched any CLAUDE.md)

- [ ] **Step 1: Document the feature**

Add a "Value-chain inheritance" section to `docs/technical/domains/risk-management.md` covering: the two legs that exist and the one that does not (`model_inventories` has no `vendor_id`), the storage shape and why the child column was left alone, the `inherits_from`-only rule, and the POST body's three mutually exclusive target fields.

- [ ] **Step 2: Full verification**

```bash
cd Servers && npm run build && npm run test && npm run test:integration && npx tsx scripts/checkApiDrift.ts
```

```bash
cd Clients && npm run typecheck && npm run build && npx vitest run
```

Pre-existing failures you did not cause: `deadline-summary.test.ts` is date-dependent and already failing on `develop`. Anything else that fails is yours.

- [ ] **Step 3: Confirm no console.log**

```bash
git diff develop...HEAD -- Servers Clients | grep -n "^+.*console\.log"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add docs/technical/domains/risk-management.md
git commit -m "docs(risk-links): document value-chain inheritance"
```

---

## Self-review notes

**Spec coverage.** §2.4 → Task 1 Step 2's fourth describe block. §3.2/§4.1/§4.2 → Task 1. §5.2/§5.3 → Task 4. §6 → Task 2. §6.1 → Task 3. §7.1 → Task 5. §7.2 → Task 6. §9's ten tests map onto Tasks 1, 2, 3, 4 and 5; test 5b is Task 3 Step 1's first case.

**Not covered by a task, deliberately.** §3.1 (no suggestion engine) and §8 (the C5 seam) are decisions about what *not* to build — nothing to implement.

**Type consistency.** `ParentEntityType` is defined once in `hierarchy.ts` (Task 2) and imported everywhere. `HierarchyParent` is defined once in `riskLink.utils.ts` (Task 3). The client mirrors the union as `RiskLinkEntityType` (Task 6) because the client cannot import from `Servers/` — the comment on it names the source of truth, matching how `DismissReason` is already mirrored.
