# Risk links C1 — two-level grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Constrain `inherits_from` risk links to a strict two-level parent/child grouping — a risk is either a parent, or a child, or unattached, never both; a child has exactly one parent.

**Architecture:** Single-parent is guaranteed by a partial unique index in Postgres (atomic, free). The two-level rule is not expressible as a constraint, so it lives in a pure function `validateTwoLevel` called from the two endpoints that can create a confirmed `inherits_from` row. The rule applies to `confirmed` rows only, so competing *suggestions* stay legal — that is what C2's agent will need. The new rule subsumes the existing reciprocal-pair check, which is deleted.

**Tech Stack:** Node 22, TypeScript, Express 4, Sequelize 6 (raw SQL via `sequelize.query`), PostgreSQL, Jest (backend), React 19 + MUI 7 + React Query, Vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-08-27-risk-links-c1-two-level-grouping-design.md`

---

## Global Constraints

- **Direction convention, everywhere:** in storage `source_risk_id` is the **child** and `target_risk_id` is the **parent**. The `risk_links_canonical` CHECK exempts `inherits_from` from smaller-id-first reordering, so this survives as written. Never reorder an `inherits_from` pair.
- **The rule applies to `confirmed` rows only.** Suggested and dismissed rows are invisible to it. This is deliberate: two proposed parents for one risk must be allowed to coexist so a human can choose.
- **Nothing writes to a linked risk's fields.** Ever, in any phase. This subsystem surfaces; the human decides.
- **Exact 409 message strings** (copy verbatim, they are asserted in tests):
  - `child_already_has_parent` → `This risk already has a parent. Remove it first.`
  - `parent_is_a_child` → `That risk is already a child of another risk, so it cannot be a parent.`
  - `child_has_children` → `This risk has child risks, so it cannot become a child.`
- **Exact index name:** `risk_links_single_parent_idx`. It is matched by string in the controller's error handling.
- **`organization_id` travels in `:replacements`** on every raw query in `Servers/utils/`. No exceptions — it is the tenant-isolation boundary.
- **Backend test file convention:** `Servers/services/riskLinks/tests/` uses `.spec.ts`; `Servers/controllers/__tests__/` and `Servers/utils/__tests__/` use `.test.ts`. Match the folder you are in.
- **Frontend typecheck is separate from build.** `npm run build` uses esbuild and never runs `tsc`. Run `npm run typecheck` — it is the only thing that typechecks.
- **Do not touch** the recompute engine, the signal providers, `related_to` scoring, or `swagger.yaml`. No field is added or removed; only a new 409 condition on two existing endpoints.
- **Do not commit to a remote, open a PR, or merge.** Local commits only.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx` | Repair the three assertions the uncommitted `Relates to` rename left stale. | 0 |
| `Servers/database/migrations/20260828090000-risk-links-single-parent.js` | Demote pre-existing duplicate parents, create the partial unique index. | 1 |
| `Servers/tests/integration/riskLinks.hierarchy.test.ts` | Prove the *index* — not the application check — rejects a second confirmed parent. | 1 |
| `Servers/services/riskLinks/hierarchy.ts` | `validateTwoLevel` — the rule, pure. No DB, no request, no ORM. | 2 |
| `Servers/services/riskLinks/tests/hierarchy.spec.ts` | Unit tests for the rule. | 2 |
| `Servers/utils/riskLink.utils.ts` | `getConfirmedHierarchyEdgesQuery` — load the confirmed edges touching either endpoint. Also: correct one now-false doc comment. | 3 |
| `Servers/utils/__tests__/riskLink.utils.test.ts` | Assert the SQL text, replacements, and row mapping. | 3 |
| `Servers/controllers/riskLinks.ctrl.ts` | Wire the rule into `createRiskLink` (Task 4) and `updateRiskLinkStatus` (Task 5); translate a lost race into 409 instead of 500. | 4, 5 |
| `Servers/controllers/__tests__/riskLinks.ctrl.test.ts` | Endpoint behaviour for both paths. | 4, 5 |
| `Clients/src/presentation/components/LinkedRisksPanel/index.tsx` | Two group headings become position nouns. | 6 |
| `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx` | Heading assertions. | 6 |
| `Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx` | Disable the choices the rule already forbids; explain why. | 7 |
| `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkRiskForm.test.tsx` | Disabled-choice behaviour. | 7 |

**Dependency order:** Task 0 first — it clears an inherited red suite. Then 1 and 2 are independent. 3 depends on 2 (imports its type). 4 depends on 2 and 3. 5 depends on 4 (imports helpers it introduces). 6 and 7 are independent of everything.

---

### Task 0: Land the pending copy rename and repair its tests

**Do this first.** The working tree already carries an uncommitted rename — `Related risks` → `Relates to` in the panel and `Related to` → `Relates to` in the form radios — and its tests were never updated. Three tests in `LinkedRisksPanel.test.tsx` are red right now. Starting C1 on a red suite means you cannot tell your own breakage from the inherited kind.

**Files:**
- Already modified, uncommitted: `Clients/src/presentation/components/LinkedRisksPanel/index.tsx`, `Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx`
- Modify: `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx:82`, `:90`, `:215`

**Interfaces:** none. Copy and its assertions only.

- [ ] **Step 1: Confirm the three failures**

```bash
cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel
```

Expected: `Tests 3 failed | 23 passed` — `puts each relation and direction under its own heading`, `hides a group with no links`, and `opens the form for a non-admin with no links`.

- [ ] **Step 2: Update the three stale strings**

In `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx`, three assertions still name the old copy. Change:

- line 82: `expect(screen.getByText("Related risks")).toBeInTheDocument();` → `expect(screen.getByText("Relates to")).toBeInTheDocument();`
- line 90: the same substitution
- line 215: `expect(screen.getByRole("radio", { name: "Related to" })).toBeInTheDocument();` → `expect(screen.getByRole("radio", { name: "Relates to" })).toBeInTheDocument();`

Change nothing else — Task 6 rewrites the two heading tests properly.

- [ ] **Step 3: Verify green**

```bash
cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel
```

Expected: `Tests 26 passed`.

- [ ] **Step 4: Commit**

```bash
git add Clients/src/presentation/components/LinkedRisksPanel
git commit -m "fix(risk-links): update the panel tests for the Relates to rename"
```

---

### Task 1: Single-parent partial unique index

The database half of the rule. Independent of every other task — no TypeScript involved.

**Files:**
- Create: `Servers/database/migrations/20260828090000-risk-links-single-parent.js`
- Create: `Servers/tests/integration/riskLinks.hierarchy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a unique index literally named `risk_links_single_parent_idx`. Task 4 matches that exact string against `error.constraint`.

**Background you need:** `verifywise.risk_links` was created by `Servers/database/migrations/20260812185522-create-risk-links.js`. Do **not** edit that file — it has already run in teammates' local databases. Migrations here are plain `sequelize-cli` files run by `npm run migrate-db`, and every one of them uses raw `queryInterface.sequelize.query` rather than the builder API. Follow that.

- [ ] **Step 1: Write the failing integration test**

Create `Servers/tests/integration/riskLinks.hierarchy.test.ts`:

```ts
jest.setTimeout(60000);

import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestRisk } from "../factories";

afterEach(async () => {
  await cleanupDatabase();
});

/**
 * The application check in riskLinks.ctrl.ts is deliberately bypassed here:
 * these INSERTs go straight to the table. This is the only test that proves the
 * INDEX, rather than validateTwoLevel, is doing the work.
 */
const insertConfirmedInheritance = (orgId: number, childId: number, parentId: number) =>
  sequelize.query(
    `INSERT INTO risk_links
       (organization_id, source_risk_id, target_risk_id, relation_type, status, source)
     VALUES (:orgId, :childId, :parentId, 'inherits_from', 'confirmed', 'user')`,
    { replacements: { orgId, childId, parentId } },
  );

describe("risk_links_single_parent_idx", () => {
  it("rejects a second confirmed parent for the same child", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parentA = await createTestRisk(owner.orgId, {});
    const parentB = await createTestRisk(owner.orgId, {});

    await insertConfirmedInheritance(owner.orgId, child, parentA);

    // Asserted on `original.code` / `original.constraint` rather than on the
    // message text, because those are the two fields Task 4's
    // isSingleParentViolation reads. Matching the message instead would let the
    // controller and this test drift apart on a Sequelize error-format change.
    await expect(
      insertConfirmedInheritance(owner.orgId, child, parentB),
    ).rejects.toMatchObject({
      original: { code: "23505", constraint: "risk_links_single_parent_idx" },
    });
  });

  it("allows a second parent while the first is dismissed", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parentA = await createTestRisk(owner.orgId, {});
    const parentB = await createTestRisk(owner.orgId, {});

    await sequelize.query(
      `INSERT INTO risk_links
         (organization_id, source_risk_id, target_risk_id, relation_type, status, source)
       VALUES (:orgId, :childId, :parentId, 'inherits_from', 'dismissed', 'user')`,
      { replacements: { orgId: owner.orgId, childId: child, parentId: parentA } },
    );

    // The index is partial on status = 'confirmed', so a dismissed row does not
    // occupy the slot. Without WHERE status = 'confirmed' this would throw.
    await expect(
      insertConfirmedInheritance(owner.orgId, child, parentB),
    ).resolves.toBeDefined();
  });

  it("allows one parent to have many children (fan-out is unlimited)", async () => {
    const { owner } = await seedTwoTenantContexts();
    const parent = await createTestRisk(owner.orgId, {});
    const childA = await createTestRisk(owner.orgId, {});
    const childB = await createTestRisk(owner.orgId, {});

    await insertConfirmedInheritance(owner.orgId, childA, parent);

    // The index is on source_risk_id (the child) only — a second child under
    // the same parent is a different source id and must be allowed.
    await expect(
      insertConfirmedInheritance(owner.orgId, childB, parent),
    ).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Requires PostgreSQL running (port 5432).

```bash
cd Servers && npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --testMatch="**/tests/integration/riskLinks.hierarchy.test.ts" --runInBand
```

**Which database this touches:** not your dev one. `Servers/tests/integration/globalSetup.js` loads `Servers/.env.test`, creates `DB_NAME` (default `verifywise_test`) if it is missing, then runs `npm run build` and `npx sequelize db:migrate` against it with `NODE_ENV=test`. So the integration suite migrates itself on every run — you never migrate by hand to make these tests see a new migration, and the run is slow (a full `tsc` build) by design.

Expected: the first test FAILS — the second insert succeeds because the migration does not exist yet, so `db:migrate` had no index to create. The other two pass vacuously.

- [ ] **Step 3: Write the migration**

Create `Servers/database/migrations/20260828090000-risk-links-single-parent.js`:

```js
"use strict";

module.exports = {
  async up(queryInterface) {
    // Demote before indexing. risk_links has never shipped, but this migration
    // has run in local dev databases that may already hold two confirmed
    // parents for one child — a hard index failure there breaks a teammate's
    // `migrate` for no gain. Keep the most recently decided parent per child.
    // Demotion, not deletion: a dismissed row is restorable from the panel's
    // "Show dismissed" view, so nobody loses a judgement.
    await queryInterface.sequelize.query(`
      UPDATE verifywise.risk_links
         SET status = 'dismissed'
       WHERE relation_type = 'inherits_from'
         AND status = 'confirmed'
         AND id NOT IN (
           SELECT DISTINCT ON (source_risk_id) id
             FROM verifywise.risk_links
            WHERE relation_type = 'inherits_from' AND status = 'confirmed'
            ORDER BY source_risk_id, decided_at DESC NULLS LAST, id DESC
         );
    `);

    // source_risk_id is the child, so uniqueness on it IS "one parent per
    // child". Not scoped by organization_id: a risk id belongs to exactly one
    // organization, so adding it would only weaken the key.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS risk_links_single_parent_idx
        ON verifywise.risk_links (source_risk_id)
        WHERE relation_type = 'inherits_from' AND status = 'confirmed';
    `);
  },

  async down(queryInterface) {
    // Does not restore demoted rows — which row was demoted is not recorded,
    // and the rows are still present and visible under "Show dismissed".
    await queryInterface.sequelize.query(
      "DROP INDEX IF EXISTS verifywise.risk_links_single_parent_idx;",
    );
  },
};
```

- [ ] **Step 4: Run the migration against your dev database**

```bash
cd Servers && npm run migrate-db
```

Expected: the new migration runs without error. This is for the dev database behind `npm run watch` — Tasks 6 and 7 check the UI against it. It is **not** what makes Step 5 pass: globalSetup migrates the test database on its own.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd Servers && npx jest --config jest.config.js --globalSetup="<rootDir>/tests/integration/globalSetup.js" --testMatch="**/tests/integration/riskLinks.hierarchy.test.ts" --runInBand
```

Expected: all three PASS.

- [ ] **Step 6: Verify `down` is reversible**

```bash
cd Servers && npx sequelize db:migrate:undo && npm run migrate-db
```

Expected: both complete without error. (A migration whose `down` throws is a migration a teammate cannot back out of.)

- [ ] **Step 7: Commit**

```bash
git add Servers/database/migrations/20260828090000-risk-links-single-parent.js Servers/tests/integration/riskLinks.hierarchy.test.ts
git commit -m "feat(risk-links): enforce one confirmed parent per risk in the database"
```

---

### Task 2: `validateTwoLevel` — the rule as a pure function

**Files:**
- Create: `Servers/services/riskLinks/hierarchy.ts`
- Create: `Servers/services/riskLinks/tests/hierarchy.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface HierarchyEdge { childRiskId: number; parentRiskId: number }
  export type HierarchyViolation =
    | "child_already_has_parent" | "parent_is_a_child" | "child_has_children";
  export function validateTwoLevel(
    proposed: HierarchyEdge, confirmed: HierarchyEdge[],
  ): HierarchyViolation | null;
  ```
  Tasks 3, 4 and 5 all import from this module.

**The rule, restated:** given confirmed edges as `(child, parent)` pairs, a proposed edge `(c, p)` is rejected when — in this order, first match wins —

1. an edge `(c, _)` exists → `child_already_has_parent`
2. an edge `(p, _)` exists → `parent_is_a_child`
3. an edge `(_, c)` exists → `child_has_children`

Rules 2 and 3 together are the two-level guarantee: no risk appears in both columns, so every edge runs leaf → root and no path of length two exists. Cycles of every length become impossible as a consequence — which is why this replaces the old reciprocal-pair check rather than joining it.

- [ ] **Step 1: Write the failing tests**

Create `Servers/services/riskLinks/tests/hierarchy.spec.ts`:

```ts
import { HierarchyEdge, validateTwoLevel } from "../hierarchy";

const edge = (childRiskId: number, parentRiskId: number): HierarchyEdge => ({
  childRiskId,
  parentRiskId,
});

describe("validateTwoLevel", () => {
  it("allows an edge into an empty set", () => {
    expect(validateTwoLevel(edge(1, 2), [])).toBeNull();
  });

  it("allows an edge when the confirmed edges touch neither risk", () => {
    expect(validateTwoLevel(edge(1, 2), [edge(3, 4)])).toBeNull();
  });

  it("rejects a second parent for a risk that already has one", () => {
    expect(validateTwoLevel(edge(1, 2), [edge(1, 9)])).toBe("child_already_has_parent");
  });

  it("rejects a parent that is already someone else's child", () => {
    expect(validateTwoLevel(edge(1, 2), [edge(2, 9)])).toBe("parent_is_a_child");
  });

  it("rejects making a risk a child when it already has children", () => {
    expect(validateTwoLevel(edge(1, 2), [edge(9, 1)])).toBe("child_has_children");
  });

  it("returns child_already_has_parent when rules 1 and 2 both apply", () => {
    // Order is load-bearing: without a fixed order the message would depend on
    // row ordering from the database.
    expect(validateTwoLevel(edge(1, 2), [edge(1, 8), edge(2, 9)])).toBe(
      "child_already_has_parent",
    );
  });

  it("allows a second child under the same parent (fan-out is unlimited)", () => {
    expect(validateTwoLevel(edge(1, 5), [edge(2, 5)])).toBeNull();
  });

  it("rejects the reciprocal edge, which the old two-cycle check handled", () => {
    // A(1) -> B(2) confirmed; proposing B(2) -> A(1). Risk 1 is the proposed
    // parent and is already a child, so rule 2 fires. Rule 3 also applies —
    // risk 2 already has a child — but rule 2 is checked first, and spec §9
    // names parent_is_a_child as this case's answer.
    expect(validateTwoLevel(edge(2, 1), [edge(1, 2)])).toBe("parent_is_a_child");
  });

  it("rejects a grandchild, which nothing checked before", () => {
    // A -> B confirmed; proposing C -> A would make A both parent and child.
    expect(validateTwoLevel(edge(3, 1), [edge(1, 2)])).toBe("parent_is_a_child");
  });

  it("does not treat an identical existing edge as a violation", () => {
    // On POST this is a duplicate, and createUserRiskLinkQuery's ON CONFLICT
    // gives it a truer message ("These risks are already linked"). Reporting
    // child_already_has_parent here would name, as the blocker, the very parent
    // the user just tried to add.
    expect(validateTwoLevel(edge(1, 2), [edge(1, 2)])).toBeNull();
  });

  it("still rejects when an identical edge sits alongside a real violation", () => {
    expect(validateTwoLevel(edge(1, 2), [edge(1, 2), edge(2, 9)])).toBe("parent_is_a_child");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Servers && npx jest services/riskLinks/tests/hierarchy.spec.ts
```

Expected: FAIL — `Cannot find module '../hierarchy'`.

- [ ] **Step 3: Write the implementation**

Create `Servers/services/riskLinks/hierarchy.ts`:

```ts
/**
 * The two-level grouping rule (C1):
 *
 *   A risk is either a parent, or a child, or unattached — never both.
 *   A child has exactly one parent.
 *
 * Rules 2 and 3 below are what make it two levels: no risk appears in both
 * columns, so every edge runs leaf -> root and no path of length two exists.
 * Cycles of every length become impossible as a consequence, which is why this
 * REPLACES the old reciprocal-pair check rather than joining it.
 *
 * Pure by design — no database, no request, no ORM. Same reason
 * `Clients/src/application/tools/relatedRisks.ts` is a standalone module: the
 * rule is the part worth testing, and it should be testable in isolation.
 *
 * Single-parent (rule 1) is ALSO enforced by `risk_links_single_parent_idx`.
 * That is not redundancy: the index is atomic and this function is not, so the
 * index closes the race and this function produces the readable message.
 */

/** In storage, `source_risk_id` is the child and `target_risk_id` is the parent. */
export interface HierarchyEdge {
  childRiskId: number;
  parentRiskId: number;
}

export type HierarchyViolation =
  | "child_already_has_parent"
  | "parent_is_a_child"
  | "child_has_children";

/**
 * @param proposed the edge about to become confirmed
 * @param confirmed every CONFIRMED `inherits_from` edge touching either
 *   endpoint. A superset is fine — the checks filter. Suggested and dismissed
 *   rows must NOT be included: competing suggestions are legal by design.
 * @returns null when the proposed edge keeps the grouping two levels deep
 */
export function validateTwoLevel(
  proposed: HierarchyEdge,
  confirmed: HierarchyEdge[],
): HierarchyViolation | null {
  const { childRiskId, parentRiskId } = proposed;

  // An edge identical to the proposed one is not a violation. On POST it is a
  // duplicate, and createUserRiskLinkQuery's ON CONFLICT answers that with a
  // truer message ("These risks are already linked"); reporting
  // child_already_has_parent would name the very parent the user just added.
  const others = confirmed.filter(
    (e) => !(e.childRiskId === childRiskId && e.parentRiskId === parentRiskId),
  );

  // Order is load-bearing: first match wins, so the message is deterministic
  // when more than one rule applies.
  if (others.some((e) => e.childRiskId === childRiskId)) return "child_already_has_parent";
  if (others.some((e) => e.childRiskId === parentRiskId)) return "parent_is_a_child";
  if (others.some((e) => e.parentRiskId === childRiskId)) return "child_has_children";
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd Servers && npx jest services/riskLinks/tests/hierarchy.spec.ts
```

Expected: all 11 PASS.

- [ ] **Step 5: Commit**

```bash
git add Servers/services/riskLinks/hierarchy.ts Servers/services/riskLinks/tests/hierarchy.spec.ts
git commit -m "feat(risk-links): add the two-level grouping rule as a pure function"
```

---

### Task 3: Load the confirmed hierarchy edges

**Files:**
- Modify: `Servers/utils/riskLink.utils.ts` — add one query after `riskLinkPairExistsQuery` (currently around line 252-272), and fix one doc comment on `createUserRiskLinkQuery` (around line 281-288).
- Modify: `Servers/utils/__tests__/riskLink.utils.test.ts` — add cases to the existing `describe("riskLink.utils")`.

**Interfaces:**
- Consumes: `HierarchyEdge` from `../services/riskLinks/hierarchy` (Task 2).
- Produces:
  ```ts
  export function getConfirmedHierarchyEdgesQuery(
    organizationId: number, childRiskId: number, parentRiskId: number,
  ): Promise<HierarchyEdge[]>;
  ```
  Tasks 4 and 5 call it.

**Conventions in this file you must follow:** every query is raw SQL through `sequelize.query`, `organization_id` always arrives via `:replacements`, and `type: QueryTypes.SELECT` is set explicitly on reads. `riskLink.utils.ts` already imports from `../services/riskLinks/types`, so importing from `../services/riskLinks/hierarchy` introduces no new dependency direction. The existing unit test file mocks `../../database/db` and asserts against the SQL string — that is the convention, not a workaround.

- [ ] **Step 1: Write the failing tests**

Append to the existing `describe("riskLink.utils", ...)` block in `Servers/utils/__tests__/riskLink.utils.test.ts`:

```ts
  it("loads only confirmed inherits_from edges touching either endpoint", async () => {
    await getConfirmedHierarchyEdgesQuery(7, 4, 9);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("organization_id = :organizationId");
    expect(sql).toContain("relation_type = 'inherits_from'");
    expect(sql).toContain("status = 'confirmed'");
    expect(sql).toContain("source_risk_id IN (:childRiskId, :parentRiskId)");
    expect(sql).toContain("target_risk_id IN (:childRiskId, :parentRiskId)");
    expect(options.replacements).toEqual({ organizationId: 7, childRiskId: 4, parentRiskId: 9 });
    expect(options.type).toBe(QueryTypes.SELECT);
  });

  it("maps source to child and target to parent, not the other way round", async () => {
    // Getting this backwards inverts every hierarchy check silently, so it is
    // asserted rather than left to the column names.
    mockQuery.mockResolvedValue([{ source_risk_id: 4, target_risk_id: 9 }]);
    const edges = await getConfirmedHierarchyEdgesQuery(7, 4, 9);
    expect(edges).toEqual([{ childRiskId: 4, parentRiskId: 9 }]);
  });
```

Add `getConfirmedHierarchyEdgesQuery` to the existing import list at the top of that test file:

```ts
import {
  getRiskLinksForRiskQuery,
  getRiskScoringRowsQuery,
  getIncidentLinksQuery,
  getStructuralNeighboursQuery,
  getConfirmedHierarchyEdgesQuery,
} from "../riskLink.utils";
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Servers && npx jest utils/__tests__/riskLink.utils.test.ts
```

Expected: FAIL — `getConfirmedHierarchyEdgesQuery is not a function`.

- [ ] **Step 3: Write the query**

In `Servers/utils/riskLink.utils.ts`, add the import at the top alongside the existing `../services/riskLinks/types` import:

```ts
import { HierarchyEdge } from "../services/riskLinks/hierarchy";
```

Then add the function immediately after `riskLinkPairExistsQuery`:

```ts
/**
 * Every CONFIRMED `inherits_from` edge touching either endpoint of a proposed
 * edge — the input to `validateTwoLevel`.
 *
 * A superset of what the three rules need. Narrowing it would mean three
 * queries or a UNION; both existing indexes
 * (`risk_links_org_source_status_idx`, `risk_links_org_target_status_idx`)
 * serve this one, and the surplus keeps the SQL and the rule simple.
 *
 * `status = 'confirmed'` is load-bearing, not a filter for tidiness: competing
 * SUGGESTED parents are legal by design, so including them would reject
 * proposals the product is supposed to offer.
 */
export async function getConfirmedHierarchyEdgesQuery(
  organizationId: number,
  childRiskId: number,
  parentRiskId: number,
): Promise<HierarchyEdge[]> {
  const rows = await sequelize.query(
    `SELECT source_risk_id, target_risk_id
       FROM risk_links
      WHERE organization_id = :organizationId
        AND relation_type = 'inherits_from'
        AND status = 'confirmed'
        AND (source_risk_id IN (:childRiskId, :parentRiskId)
             OR target_risk_id IN (:childRiskId, :parentRiskId))`,
    {
      replacements: { organizationId, childRiskId, parentRiskId },
      type: QueryTypes.SELECT,
    },
  );
  // source is the child, target is the parent — see risk_links_canonical, which
  // exempts inherits_from from id reordering precisely so this holds.
  return (rows as { source_risk_id: number; target_risk_id: number }[]).map((row) => ({
    childRiskId: row.source_risk_id,
    parentRiskId: row.target_risk_id,
  }));
}
```

- [ ] **Step 4: Correct the doc comment that Task 4 will falsify**

Still in `Servers/utils/riskLink.utils.ts`, the comment on `createUserRiskLinkQuery` currently ends:

```
 * Returns null when the pair already exists: ON CONFLICT DO NOTHING rather than
 * catching a driver error code, so the controller never sniffs SQLSTATE.
```

That was true when `risk_links_unique` was the only unique constraint. Replace those two lines with:

```
 * Returns null when the pair already exists: the ON CONFLICT names
 * `risk_links_unique`, so a duplicate pair is absorbed here rather than raised.
 *
 * It does NOT absorb `risk_links_single_parent_idx` — a different constraint,
 * which raises. The controller catches that one by name; see
 * `isSingleParentViolation` in riskLinks.ctrl.ts.
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd Servers && npx jest utils/__tests__/riskLink.utils.test.ts
```

Expected: all PASS, including the pre-existing cases.

- [ ] **Step 6: Typecheck**

```bash
cd Servers && npm run build
```

Expected: exits 0. (Unlike the frontend, the backend `build` is `tsc`, so this does typecheck.)

- [ ] **Step 7: Commit**

```bash
git add Servers/utils/riskLink.utils.ts Servers/utils/__tests__/riskLink.utils.test.ts
git commit -m "feat(risk-links): load the confirmed hierarchy edges around a proposed link"
```

---

### Task 4: Enforce the rule on `POST /riskLinks`

**Files:**
- Modify: `Servers/controllers/riskLinks.ctrl.ts` — imports (lines 1-21), new module constants after `toResponse` (around line 71), the block at lines 211-227, and the `createRiskLink` catch block (around lines 262-275).
- Modify: `Servers/controllers/__tests__/riskLinks.ctrl.test.ts` — the `describe("createRiskLink")` block starting at line 187.

**Interfaces:**
- Consumes: `validateTwoLevel`, `HierarchyViolation` (Task 2); `getConfirmedHierarchyEdgesQuery` (Task 3).
- Produces, for Task 5 to import from the same module scope:
  ```ts
  const HIERARCHY_MESSAGES: Record<HierarchyViolation, string>;
  const isSingleParentViolation: (error: unknown) => boolean;
  ```

**What you are replacing.** `riskLinks.ctrl.ts:211-227` currently holds:

```ts
    // ponytail: application-level cycle check. Two admins asserting opposite
    // inheritance in the same instant both pass here and both rows land. ...
    if (relationType === "inherits_from") {
      const reverseExists = await riskLinkPairExistsQuery(
        req.organizationId!, targetRiskId, sourceRiskId, "inherits_from");
      if (reverseExists) {
        return res.status(409).json(STATUS_CODE[409]("These risks would inherit from each other"));
      }
    }
```

Delete that whole block. `riskLinkPairExistsQuery` loses its only production caller but the **function stays** — `Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts` imports it at three call sites to assert cross-tenant invisibility, a legitimate second use. Only the controller's import and call go.

**Why the catch block matters.** `createUserRiskLinkQuery` ends in `ON CONFLICT (source_risk_id, target_risk_id, relation_type) DO NOTHING`. That names the *pair* constraint, so it absorbs a duplicate pair and returns `null` — but a `risk_links_single_parent_idx` violation is a different constraint and **raises**. Today's catch block turns any raise into a 500. Losing the race documented in spec §5.4 must be a 409, not a 500. The handler runs outside a transaction, so no `SAVEPOINT` is needed (contrast `ingestPointQuery` in `mrmMonitoring.utils.ts`, whose insert sits inside one).

- [ ] **Step 1: Write the failing tests**

In `Servers/controllers/__tests__/riskLinks.ctrl.test.ts`, **delete** these two existing tests inside `describe("createRiskLink")` — they assert the behaviour being replaced:

- `it("409s when the reverse inherits_from already exists", ...)` (line 243)
- `it("does not look for a reverse row on related_to", ...)` (line 260)

Add in their place:

```ts
  it("409s with the parent message when the child already has a parent", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([
      { childRiskId: 4, parentRiskId: 12 },
    ]);
    const r = res();
    await createRiskLink(req({ body: body({ relationType: "inherits_from" }) }) as any, r as any);
    // source is the child, target is the parent — {source: 4, target: 9}
    expect(mockUtils.getConfirmedHierarchyEdgesQuery).toHaveBeenCalledWith(7, 4, 9);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "This risk already has a parent. Remove it first." }),
    );
    expect(mockUtils.createUserRiskLinkQuery).not.toHaveBeenCalled();
  });

  it("409s when the proposed parent is already someone else's child", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([
      { childRiskId: 9, parentRiskId: 12 },
    ]);
    const r = res();
    await createRiskLink(req({ body: body({ relationType: "inherits_from" }) }) as any, r as any);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: "That risk is already a child of another risk, so it cannot be a parent.",
      }),
    );
  });

  it("409s when the proposed child already has children", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([
      { childRiskId: 12, parentRiskId: 4 },
    ]);
    const r = res();
    await createRiskLink(req({ body: body({ relationType: "inherits_from" }) }) as any, r as any);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "This risk has child risks, so it cannot become a child." }),
    );
  });

  it("refuses the reciprocal edge that the old two-cycle check caught", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    // 4 -> 9 already confirmed; the caller proposes 9 -> 4.
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([
      { childRiskId: 4, parentRiskId: 9 },
    ]);
    const r = res();
    await createRiskLink(
      req({ body: { sourceRiskId: 9, targetRiskId: 4, relationType: "inherits_from" } }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(409);
  });

  it("does not load hierarchy edges for related_to", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.createUserRiskLinkQuery.mockResolvedValue(77);
    await createRiskLink(req({ body: body() }) as any, res() as any);
    expect(mockUtils.getConfirmedHierarchyEdgesQuery).not.toHaveBeenCalled();
  });

  it("lets a duplicate inherits_from pair reach the store for its own message", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    // The identical edge must not be reported as child_already_has_parent — it
    // would name the very parent the user just tried to add.
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([
      { childRiskId: 4, parentRiskId: 9 },
    ]);
    mockUtils.createUserRiskLinkQuery.mockResolvedValue(null);
    const r = res();
    await createRiskLink(req({ body: body({ relationType: "inherits_from" }) }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: 'These risks are already linked. If the link was dismissed, use "Show dismissed" to restore it.',
      }),
    );
  });

  it("turns a lost single-parent race into 409, not 500", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([]);
    // What node-postgres raises when the partial unique index fires, as
    // Sequelize wraps it for a raw query.
    mockUtils.createUserRiskLinkQuery.mockRejectedValue({
      original: { code: "23505", constraint: "risk_links_single_parent_idx" },
    });
    const r = res();
    await createRiskLink(req({ body: body({ relationType: "inherits_from" }) }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "This risk already has a parent. Remove it first." }),
    );
  });

  it("still 500s on an unrelated store failure", async () => {
    mockUtils.getLiveRiskIdsQuery.mockResolvedValue([4, 9]);
    mockUtils.createUserRiskLinkQuery.mockRejectedValue(new Error("connection lost"));
    const r = res();
    await createRiskLink(req({ body: body() }) as any, r as any);
    expect(r.status).toHaveBeenCalledWith(500);
  });
```

The existing `it("checks both ids against the caller's org in one query")`, `it("canonicalises related_to to smaller-id-first")` and `it("leaves inherits_from in the order the caller sent")` tests use `relationType: "inherits_from"` in one case. Add `mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([]);` to `it("leaves inherits_from in the order the caller sent")` so it does not fall over on an undefined mock return — `jest.resetAllMocks()` in `beforeEach` leaves auto-mocks returning `undefined`.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Servers && npx jest controllers/__tests__/riskLinks.ctrl.test.ts
```

Expected: the new tests FAIL — `getConfirmedHierarchyEdgesQuery` is not called and the old 409 message is still produced.

- [ ] **Step 3: Update the imports**

In `Servers/controllers/riskLinks.ctrl.ts`, remove `riskLinkPairExistsQuery` from the `../utils/riskLink.utils` import and add `getConfirmedHierarchyEdgesQuery`; add a new import for the rule:

```ts
import {
  createUserRiskLinkQuery,
  getActiveRiskIdsQuery,
  getConfirmedHierarchyEdgesQuery,
  getLiveRiskIdsQuery,
  getRiskLinkByIdQuery,
  getRiskLinksForRiskQuery,
  RiskLinkWithRelated,
  updateRiskLinkStatusQuery,
} from "../utils/riskLink.utils";
import { HierarchyViolation, validateTwoLevel } from "../services/riskLinks/hierarchy";
```

- [ ] **Step 4: Add the module-level constants**

In `Servers/controllers/riskLinks.ctrl.ts`, immediately after the `toResponse` helper (around line 71), add:

```ts
const HIERARCHY_MESSAGES: Record<HierarchyViolation, string> = {
  child_already_has_parent: "This risk already has a parent. Remove it first.",
  parent_is_a_child: "That risk is already a child of another risk, so it cannot be a parent.",
  child_has_children: "This risk has child risks, so it cannot become a child.",
};

const SINGLE_PARENT_INDEX = "risk_links_single_parent_idx";

type PgError = { code?: string; constraint?: string };

/**
 * `createUserRiskLinkQuery`'s ON CONFLICT names the PAIR constraint, so a
 * single-parent violation raises instead of returning null — and the PATCH path
 * has no ON CONFLICT at all. The index is on `source_risk_id`, and source is the
 * child, so this violation means exactly one thing: that child already has a
 * confirmed parent. Losing the race is a 409, not a 500.
 *
 * Matching the constraint name rather than a bare 23505 keeps the check honest
 * if a third unique constraint is ever added to the table.
 */
const isSingleParentViolation = (error: unknown): boolean => {
  const pg =
    (error as { parent?: PgError; original?: PgError })?.parent ??
    (error as { original?: PgError })?.original;
  return pg?.code === "23505" && pg?.constraint === SINGLE_PARENT_INDEX;
};
```

- [ ] **Step 5: Replace the reciprocal-cycle block**

In `createRiskLink`, delete lines 211-227 (the `ponytail:` comment through the closing brace of the `reverseExists` check) and put this in their place, keeping it above the `canonicalPair` block:

```ts
    // Two-level grouping (C1): a risk is either a parent, or a child, or
    // unattached. Subsumes the old reciprocal-pair check — if no risk is both,
    // no cycle of any length can exist.
    //
    // ponytail: application-level, so two admins confirming opposite ends of a
    // chain in the same instant can both pass. The single-parent half is closed
    // by risk_links_single_parent_idx, which is atomic; the two-level outcome is
    // displayable rather than corrupting and either row can be dismissed.
    if (relationType === "inherits_from") {
      const violation = validateTwoLevel(
        { childRiskId: sourceRiskId, parentRiskId: targetRiskId },
        await getConfirmedHierarchyEdgesQuery(req.organizationId!, sourceRiskId, targetRiskId),
      );
      if (violation) {
        return res.status(409).json(STATUS_CODE[409](HIERARCHY_MESSAGES[violation]));
      }
    }
```

- [ ] **Step 6: Guard the catch block**

In `createRiskLink`'s `catch (error)`, insert before `logFailure`:

```ts
  } catch (error) {
    // A lost race is a user-facing conflict, not a system failure — and the
    // endpoint's other 409s do not log either.
    if (isSingleParentViolation(error)) {
      return res
        .status(409)
        .json(STATUS_CODE[409](HIERARCHY_MESSAGES.child_already_has_parent));
    }
    logFailure({
```

Leave the rest of the catch block exactly as it is.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd Servers && npx jest controllers/__tests__/riskLinks.ctrl.test.ts
```

Expected: all PASS.

- [ ] **Step 8: Confirm nothing else called the deleted function**

```bash
grep -rn "riskLinkPairExistsQuery" Servers --include="*.ts" | grep -v node_modules
```

Expected: exactly two files — its definition in `Servers/utils/riskLink.utils.ts` and the three call sites in `Servers/tests/integration/tenant-isolation/riskLinks.isolation.test.ts`. No controller hit.

- [ ] **Step 9: Typecheck**

```bash
cd Servers && npm run build
```

Expected: exits 0.

- [ ] **Step 10: Commit**

```bash
git add Servers/controllers/riskLinks.ctrl.ts Servers/controllers/__tests__/riskLinks.ctrl.test.ts
git commit -m "feat(risk-links): enforce two-level grouping when a link is created"
```

---

### Task 5: Enforce the rule on `PATCH /riskLinks/:id`

Confirming a *suggested* or restoring a *dismissed* `inherits_from` link creates a confirmed edge just as POST does, so it must run the same rule. Without this, the whole check is bypassable through the panel's Confirm button.

**Files:**
- Modify: `Servers/controllers/riskLinks.ctrl.ts` — inside `updateRiskLinkStatus` (lines 120-179).
- Modify: `Servers/controllers/__tests__/riskLinks.ctrl.test.ts` — the `describe("updateRiskLinkStatus")` block at line 115.

**Interfaces:**
- Consumes: `HIERARCHY_MESSAGES`, `isSingleParentViolation` (module constants added in Task 4); `validateTwoLevel` (Task 2); `getConfirmedHierarchyEdgesQuery` (Task 3). No new imports are needed — Task 4 added them all.
- Produces: nothing new.

**Where it goes.** Between the existing `ALLOWED_TRANSITIONS` guard and the `updateRiskLinkStatusQuery` call. Running it *after* the transition guard matters: `confirmed → confirmed` is already a 400, so the row being checked is never itself in the confirmed set.

`getRiskLinkByIdQuery` returns the full row, including `source_risk_id`, `target_risk_id` and `relation_type` — you do not need a second read.

- [ ] **Step 1: Write the failing tests**

Add inside `describe("updateRiskLinkStatus", ...)` in `Servers/controllers/__tests__/riskLinks.ctrl.test.ts`. Note the existing `suggested` fixture in that block is `relation_type: "related_to"`; define an inheritance variant beside it:

```ts
  const suggestedInheritance = {
    ...suggested,
    relation_type: "inherits_from" as const,
    source_risk_id: 3,
    target_risk_id: 42,
  };

  it("409s when confirming a suggestion whose child already has a parent", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggestedInheritance);
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([
      { childRiskId: 3, parentRiskId: 99 },
    ]);
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "confirmed" } }) as any,
      r as any,
    );
    expect(mockUtils.getConfirmedHierarchyEdgesQuery).toHaveBeenCalledWith(7, 3, 42);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "This risk already has a parent. Remove it first." }),
    );
    expect(mockUtils.updateRiskLinkStatusQuery).not.toHaveBeenCalled();
  });

  it("runs the rule when restoring a dismissed inheritance link", async () => {
    // dismissed -> confirmed reaches the same end state as a fresh POST, so it
    // must be refusable the same way.
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue({
      ...suggestedInheritance,
      status: "dismissed" as const,
    });
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([
      { childRiskId: 42, parentRiskId: 99 },
    ]);
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "confirmed" } }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: "That risk is already a child of another risk, so it cannot be a parent.",
      }),
    );
  });

  it("confirms an inheritance link when the grouping stays two levels deep", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggestedInheritance);
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([]);
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "confirmed" } }) as any,
      r as any,
    );
    expect(mockUtils.updateRiskLinkStatusQuery).toHaveBeenCalledWith(100, 7, "confirmed", 5);
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it("does not run the rule on a related_to row", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggested);
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "confirmed" } }) as any,
      res() as any,
    );
    expect(mockUtils.getConfirmedHierarchyEdgesQuery).not.toHaveBeenCalled();
  });

  it("does not run the rule when dismissing an inheritance link", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue({
      ...suggestedInheritance,
      status: "confirmed" as const,
    });
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "dismissed" } }) as any,
      res() as any,
    );
    expect(mockUtils.getConfirmedHierarchyEdgesQuery).not.toHaveBeenCalled();
  });

  it("turns a lost single-parent race into 409, not 500", async () => {
    mockUtils.getRiskLinkByIdQuery.mockResolvedValue(suggestedInheritance);
    mockUtils.getConfirmedHierarchyEdgesQuery.mockResolvedValue([]);
    mockUtils.updateRiskLinkStatusQuery.mockRejectedValue({
      original: { code: "23505", constraint: "risk_links_single_parent_idx" },
    });
    const r = res();
    await updateRiskLinkStatus(
      req({ params: { id: "100" }, body: { status: "confirmed" } }) as any,
      r as any,
    );
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "This risk already has a parent. Remove it first." }),
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Servers && npx jest controllers/__tests__/riskLinks.ctrl.test.ts -t "updateRiskLinkStatus"
```

Expected: the new tests FAIL — the rule is not called and the race produces a 500.

- [ ] **Step 3: Add the check**

In `updateRiskLinkStatus`, between the `ALLOWED_TRANSITIONS` guard and the `const decidedByUserId = ...` line, insert:

```ts
    // Confirming a suggestion, or restoring a dismissed link, reaches the same
    // end state as a fresh POST — so it runs the same rule. Placed after the
    // transition guard: confirmed -> confirmed is already a 400, so this row is
    // never itself in the confirmed set it is checked against.
    if (next === "confirmed" && link.relation_type === "inherits_from") {
      const violation = validateTwoLevel(
        { childRiskId: link.source_risk_id, parentRiskId: link.target_risk_id },
        await getConfirmedHierarchyEdgesQuery(
          req.organizationId!,
          link.source_risk_id,
          link.target_risk_id,
        ),
      );
      if (violation) {
        return res.status(409).json(STATUS_CODE[409](HIERARCHY_MESSAGES[violation]));
      }
    }
```

- [ ] **Step 4: Guard the catch block**

In `updateRiskLinkStatus`'s `catch (error)`, insert before `logFailure`:

```ts
  } catch (error) {
    if (isSingleParentViolation(error)) {
      return res
        .status(409)
        .json(STATUS_CODE[409](HIERARCHY_MESSAGES.child_already_has_parent));
    }
    logFailure({
```

- [ ] **Step 5: Run the whole backend unit suite**

```bash
cd Servers && npm run test
```

Expected: PASS. Watch specifically for regressions in `services/riskLinks/tests/recompute.spec.ts` — the recompute engine only ever writes `related_to`, so it should be untouched; a failure there means something leaked out of scope.

- [ ] **Step 6: Typecheck**

```bash
cd Servers && npm run build
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add Servers/controllers/riskLinks.ctrl.ts Servers/controllers/__tests__/riskLinks.ctrl.test.ts
git commit -m "feat(risk-links): enforce two-level grouping when a link is confirmed"
```

---

### Task 6: Panel group headings

**Files:**
- Modify: `Clients/src/presentation/components/LinkedRisksPanel/index.tsx:16-26`
- Modify: `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx:80-93`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Copy only.

**Why nouns.** These two headings now name a *position in a group*, not a relation, and parent/child is the vocabulary the grouping model is borrowed from. `Relates to` stays a verb phrase — it is still a relation, and it is the string that resolved the earlier "Related versus Linked" collision. Singular `Parent risk` because the rule permits at most one confirmed parent. Do not touch the `match` predicates; the `direction` semantics are unchanged.

**A name collision you must handle.** The existing test at line 71 gives one of its fixtures `relatedRisk: { name: "Parent risk" }` — a *risk literally named* "Parent risk". Once the heading is also `Parent risk`, `getByText("Parent risk")` matches two nodes and throws. Rename the fixture risk to `Upstream risk`; renaming the heading instead would defeat the task.

**Helpers already in that file** (read the top of it before writing): `link(overrides)` builds a `RiskLink` defaulting to `status: "suggested"`, `queryResult(links)` wraps them for the hook mock, `mockUseRiskLinks` is the hook mock, and tests call `render(<LinkedRisksPanel riskId={42} />)` directly — there is no `wrap` helper in this file (unlike `LinkRiskForm.test.tsx`).

- [ ] **Step 1: Update the existing heading test**

Replace the body of `it("puts each relation and direction under its own heading")` in `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx`:

```tsx
  it("puts each relation and direction under its own heading", () => {
    mockUseRiskLinks.mockReturnValue(
      queryResult([
        link({ id: 1, relationType: "inherits_from", direction: "outgoing",
               relatedRisk: { id: 9, name: "Upstream risk", riskLevel: null, ownerId: null } }),
        link({ id: 2, relationType: "inherits_from", direction: "incoming",
               relatedRisk: { id: 10, name: "Downstream risk", riskLevel: null, ownerId: null } }),
        link({ id: 3, relationType: "related_to", direction: "undirected",
               relatedRisk: { id: 11, name: "Sibling risk", riskLevel: null, ownerId: null } }),
      ]),
    );
    render(<LinkedRisksPanel riskId={42} />);

    // Headings name a position in the grouping, not a relation. The fixtures are
    // named Upstream/Downstream on purpose: a risk called "Parent risk" would
    // collide with the heading and make getByText ambiguous.
    expect(screen.getByText("Parent risk")).toBeInTheDocument();
    expect(screen.getByText("Child risks")).toBeInTheDocument();
    expect(screen.getByText("Relates to")).toBeInTheDocument();
    expect(screen.queryByText("Inherits from")).not.toBeInTheDocument();
    expect(screen.queryByText("Inherited by")).not.toBeInTheDocument();
    expect(screen.getByText("Upstream risk")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Update the hidden-group test**

Replace the body of `it("hides a group with no links")` in the same file:

```tsx
  it("hides a group with no links", () => {
    mockUseRiskLinks.mockReturnValue(queryResult([link()]));
    render(<LinkedRisksPanel riskId={42} />);

    expect(screen.getByText("Relates to")).toBeInTheDocument();
    expect(screen.queryByText("Parent risk")).not.toBeInTheDocument();
    expect(screen.queryByText("Child risks")).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx
```

Expected: both updated tests FAIL — `Unable to find an element with the text: Parent risk`.

- [ ] **Step 4: Change the two titles**

In `Clients/src/presentation/components/LinkedRisksPanel/index.tsx`:

```tsx
const GROUPS: { title: string; match: (link: RiskLink) => boolean }[] = [
  {
    // Position in the grouping, not a relation — and singular, because the rule
    // permits at most one confirmed parent. See the C1 design doc.
    title: "Parent risk",
    match: (l) => l.relationType === "inherits_from" && l.direction === "outgoing",
  },
  {
    title: "Child risks",
    match: (l) => l.relationType === "inherits_from" && l.direction === "incoming",
  },
  { title: "Relates to", match: (l) => l.relationType === "related_to" },
];
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel
```

Expected: all PASS, both files.

- [ ] **Step 6: Commit**

```bash
git add Clients/src/presentation/components/LinkedRisksPanel/index.tsx Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkedRisksPanel.test.tsx
git commit -m "feat(risk-links): name the hierarchy groups by position"
```

---

### Task 7: Disable the choices the rule already forbids

**Files:**
- Modify: `Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx`
- Modify: `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkRiskForm.test.tsx`

**Interfaces:**
- Consumes: the `existingLinks: RiskLink[]` prop the form already receives.
- Produces: nothing outside the component.

**Direction mapping — get this right.** In a `RiskLink` as the panel sees it, `direction: "outgoing"` means *this* risk is the source, i.e. **this risk is the child, so it has a parent**. `direction: "incoming"` means this risk is the target, i.e. **this risk is the parent, so it has children**. Only `status === "confirmed"` counts, matching the server rule exactly.

**What can and cannot be checked here.** Two of the three rules are evaluable from `existingLinks`. The third — the chosen *partner* is already someone else's child — cannot be: the candidate list comes from `getAllProjectRisks({ filter: "active" })`, which carries no link data. Leave it to the server's 409. That matches the exclusion policy already documented in this file: a partner the client cannot evaluate stays selectable rather than vanishing unexplained.

**Deliberate simplification vs the spec.** The spec's §7 table gives a per-choice reason string. One combined line above the radios says the same thing in a third of the code, and only one restriction can be active at a time anyway. Implemented as a single `Alert severity="info"`, using the `Alert` already imported.

**Derive, do not reset.** The spec asks for a reset when the selected choice becomes disabled (possible if the panel refetches while the form is open). Deriving the effective choice from the raw state removes the whole class of state bug rather than patching it — no effect, no cleanup.

- [ ] **Step 1: Write the failing tests**

Add to `Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkRiskForm.test.tsx`. The existing `link()` helper defaults to `status: "confirmed"`, and `wrap`, `pick` and `risksResponse` are already defined at the top of that file, as are the `render` / `QueryClient` / `QueryClientProvider` / `ThemeProvider` / `light` imports the last test below needs:

```tsx
  const parentLink = link({ relationType: "inherits_from", direction: "outgoing" });
  const childLink = link({ relationType: "inherits_from", direction: "incoming" });

  it("disables both hierarchy choices when the risk already has a parent", async () => {
    mockGetAllProjectRisks.mockResolvedValue(risksResponse([{ id: 9, risk_name: "Model drift" }]));
    wrap(<LinkRiskForm riskId={1} existingLinks={[parentLink]} onClose={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Inherits from" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Is inherited by" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Relates to" })).toBeEnabled();
  });

  it("disables only 'Inherits from' when the risk has children", async () => {
    // A parent may still gain more children, so "Is inherited by" stays open.
    mockGetAllProjectRisks.mockResolvedValue(risksResponse([{ id: 9, risk_name: "Model drift" }]));
    wrap(<LinkRiskForm riskId={1} existingLinks={[childLink]} onClose={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Inherits from" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Is inherited by" })).toBeEnabled();
  });

  it("explains why a choice is unavailable", async () => {
    mockGetAllProjectRisks.mockResolvedValue(risksResponse([{ id: 9, risk_name: "Model drift" }]));
    wrap(<LinkRiskForm riskId={1} existingLinks={[parentLink]} onClose={vi.fn()} />);
    expect(
      screen.getByText("This risk already has a parent, so it can only relate to other risks."),
    ).toBeInTheDocument();
  });

  it("disables nothing when the only inheritance link is a suggestion", async () => {
    // Suggestions are allowed to conflict — that is what lets a future agent
    // offer a choice between candidate parents.
    mockGetAllProjectRisks.mockResolvedValue(risksResponse([{ id: 9, risk_name: "Model drift" }]));
    wrap(
      <LinkRiskForm
        riskId={1}
        existingLinks={[{ ...parentLink, status: "suggested" }]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: "Inherits from" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Is inherited by" })).toBeEnabled();
  });

  it("falls back to 'Relates to' when the selected choice becomes disabled", async () => {
    mockGetAllProjectRisks.mockResolvedValue(risksResponse([{ id: 9, risk_name: "Model drift" }]));
    // Not using `wrap` here: it builds its QueryClient internally, and rerendering
    // with a fresh client remounts the provider and refetches. Hold one client so
    // the rerender is a prop change and nothing else.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (links: RiskLink[]) => (
      <ThemeProvider theme={light}>
        <QueryClientProvider client={client}>
          <LinkRiskForm riskId={1} existingLinks={links} onClose={vi.fn()} />
        </QueryClientProvider>
      </ThemeProvider>
    );

    const { rerender } = render(tree([]));
    await userEvent.click(screen.getByRole("radio", { name: "Inherits from" }));
    expect(screen.getByRole("radio", { name: "Inherits from" })).toBeChecked();

    // The panel refetched while the form was open and a parent appeared.
    rerender(tree([parentLink]));
    expect(screen.getByRole("radio", { name: "Relates to" })).toBeChecked();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel/__tests__/LinkRiskForm.test.tsx
```

Expected: FAIL — every radio is enabled and the explanation text does not exist.

- [ ] **Step 3: Implement**

In `Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx`, rename the choice state to `rawChoice` and derive the rest. Replace the `const [choice, setChoice] = useState<Choice>("related_to");` line and add the derivation below the other hooks:

```tsx
  const [rawChoice, setRawChoice] = useState<Choice>("related_to");

  /**
   * `direction: "outgoing"` means this risk is the source of the edge, and the
   * source is the child — so it has a parent. `"incoming"` means it is the
   * target, i.e. the parent, so it has children. Confirmed rows only: competing
   * SUGGESTED parents are legal, which is what lets a future agent offer a
   * choice between candidates.
   */
  const { hasParent, hasChildren } = useMemo(() => {
    const inheritance = existingLinks.filter(
      (l) => l.status === "confirmed" && l.relationType === "inherits_from",
    );
    return {
      hasParent: inheritance.some((l) => l.direction === "outgoing"),
      hasChildren: inheritance.some((l) => l.direction === "incoming"),
    };
  }, [existingLinks]);

  const disabled: Record<Choice, boolean> = {
    related_to: false,
    inherits_from: hasParent || hasChildren,
    inherited_by: hasParent,
  };

  /**
   * The third server rule — the chosen partner is already someone else's child
   * — cannot be evaluated here: the candidate list is getAllProjectRisks, which
   * carries no link data. The server's 409 explains that case, matching the
   * exclusion policy documented above.
   */
  const restriction = hasParent
    ? "This risk already has a parent, so it can only relate to other risks."
    : hasChildren
      ? "This risk has child risks, so it cannot become a child of another risk."
      : null;

  // Derived rather than reset in an effect: existingLinks can change under an
  // open form when the panel refetches, and deriving removes the stale-state
  // class of bug instead of patching one instance of it.
  const choice = disabled[rawChoice] ? "related_to" : rawChoice;
```

Point `handleChoice` at the raw setter:

```tsx
  const handleChoice = (next: Choice) => {
    setRawChoice(next);
    setError(null);
    // The chosen partner may be excluded under the new relation type.
    setPartner(null);
  };
```

Render the disabled state and the explanation:

```tsx
      <RadioGroup row value={choice} onChange={(event) => handleChoice(event.target.value as Choice)}>
        {CHOICES.map(({ value, label }) => (
          <FormControlLabel
            key={value}
            value={value}
            control={<Radio disabled={disabled[value]} />}
            label={label}
            disabled={disabled[value]}
          />
        ))}
      </RadioGroup>

      {restriction && <Alert severity="info">{restriction}</Alert>}
```

Leave `excludedIds`, `options`, `handleSubmit` and the buttons untouched — `choice` is still a `Choice`, so `handleSubmit`'s `inherited_by` branch keeps working unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd Clients && npx vitest run src/presentation/components/LinkedRisksPanel
```

Expected: all PASS, including the pre-existing `LinkRiskForm` and `LinkedRisksPanel` cases.

- [ ] **Step 5: Typecheck**

```bash
cd Clients && npm run typecheck
```

Expected: exits 0. This is required and separate — `npm run build` uses esbuild and never runs `tsc`, so type errors survive a green build.

- [ ] **Step 6: Build**

```bash
cd Clients && npm run build
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add Clients/src/presentation/components/LinkedRisksPanel/LinkRiskForm.tsx Clients/src/presentation/components/LinkedRisksPanel/__tests__/LinkRiskForm.test.tsx
git commit -m "feat(risk-links): disable the link choices the grouping rule forbids"
```

---

## Final verification

Run after Task 7. Every command must pass before the branch is considered done.

- [ ] **Backend unit suite**

```bash
cd Servers && npm run test
```

- [ ] **Backend typecheck**

```bash
cd Servers && npm run build
```

- [ ] **Backend integration suite** (needs PostgreSQL on 5432)

```bash
cd Servers && npm run test:integration
```

`tests/integration/tenant-isolation/riskLinks.isolation.test.ts` was read against this plan and the new index does not collide with it: its one `inherits_from` test inserts a single edge, and `cleanupDatabase()` runs `afterEach`. Expect it green and unmodified. If it does go red, the cause is the controller edits in Tasks 4-5, not the migration — it imports `createUserRiskLinkQuery` and `riskLinkPairExistsQuery` directly.

- [ ] **Frontend tests**

```bash
cd Clients && npx vitest run
```

- [ ] **Frontend typecheck** — not optional, see Global Constraints

```bash
cd Clients && npm run typecheck
```

- [ ] **Frontend build**

```bash
cd Clients && npm run build
```

- [ ] **Lint the touched files only.** `npm run lint` carries a large pre-existing backlog (574 errors, 3075 warnings as of 2026-08-13), so a non-zero exit does not mean this work broke something. Compare against the baseline for the files in the File Structure table.

```bash
cd Clients && npx eslint src/presentation/components/LinkedRisksPanel
```

- [ ] **Manual check in the running app.** Open a project risk, go to the Linked risks tab, and confirm: the headings read `Parent risk` / `Child risks` / `Relates to`; adding a parent to a risk that already has one is refused with `This risk already has a parent. Remove it first.` rather than a generic error; and after a parent exists, the `Inherits from` radio is disabled with the explanation shown.

```bash
cd Servers && npm run watch
```

```bash
cd Clients && npm run dev
```

> Port 3000 was occupied by an unrelated Next.js process during planning. If the backend refuses to start, check what holds the port before killing anything: `lsof -nP -iTCP:3000 -sTCP:LISTEN`.

---

## Out of scope — do not build

Straight from the spec. If a task seems to need one of these, stop and raise it rather than expanding scope:

- Any agent, LLM call, or automatic parent proposal. That is C2.
- Any change to the recompute engine, the providers, or `related_to` scoring. The engine only ever emits `related_to`, so it never meets this rule.
- Cross-entity inheritance. `model_risks` and `vendorrisks` are separate tables; `risk_links` foreign-keys to `risks(id)` only. That is C4.
- A grouped view in the Risk Management table, or a standalone "risk groups" page. The grouping is visible in the risk modal panel only.
- Creating an umbrella/theme risk to serve as a parent. A parent is an ordinary existing risk.
- Auto-dismissing a `related_to` row when the same pair becomes parent/child. `risk_links_unique` is `(source, target, relation_type)`, so one pair can hold both rows and appear in two groups. Redundant but harmless, and auto-dismissing would be a write the user did not ask for.
- Moving inheritance out of `risk_links` into a `risks.parent_risk_id` column. A column has no `suggested` state, and C2's entire output is proposals awaiting confirmation.
- Backfilling or repairing rows that violate the *two-level* rule (a risk in both columns). The migration leaves them alone: the index does not see them, they render correctly, and new writes are blocked from here on.
