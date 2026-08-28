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
