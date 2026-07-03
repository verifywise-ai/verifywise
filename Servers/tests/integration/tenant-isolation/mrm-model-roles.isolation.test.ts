jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestModelInventory, createTestMrmModelRole } from "../../factories";

/**
 * MRM model-roles tenant isolation.
 *
 * NOTE: MRM has no REST endpoints yet (Branch 1 is the database layer only).
 * These tests assert the isolation contract at the query layer — the same
 * `WHERE organization_id = :orgId` scoping every MRM controller/util will use.
 * Add route-level isolation tests here once the MRM routes exist.
 */
describe("MRM model roles tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("scopes role rows to the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await createTestMrmModelRole(owner.orgId, modelId, owner.userId, { role: "owner" });

    const ownerRows = await sequelize.query(
      `SELECT id FROM mrm_model_roles WHERE organization_id = :orgId`,
      { replacements: { orgId: owner.orgId }, type: QueryTypes.SELECT },
    );
    expect(ownerRows.length).toBeGreaterThan(0);

    const attackerRows = await sequelize.query(
      `SELECT id FROM mrm_model_roles WHERE organization_id = :orgId`,
      { replacements: { orgId: attacker.orgId }, type: QueryTypes.SELECT },
    );
    expect(attackerRows.length).toBe(0);
  });

  it("stamps organization_id on the role row", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const roleId = await createTestMrmModelRole(owner.orgId, modelId, owner.userId, {
      role: "validator",
    });

    const [row] = (await sequelize.query(
      `SELECT organization_id FROM mrm_model_roles WHERE id = :id`,
      { replacements: { id: roleId }, type: QueryTypes.SELECT },
    )) as [{ organization_id: number }];

    expect(row.organization_id).toBe(owner.orgId);
  });

  it("enforces the unique (org, model, role, user) constraint", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await createTestMrmModelRole(owner.orgId, modelId, owner.userId, { role: "owner" });

    await expect(
      createTestMrmModelRole(owner.orgId, modelId, owner.userId, { role: "owner" }),
    ).rejects.toThrow();
  });

  it("preserves the role row (user_id SET NULL) when the assigned user is deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const roleId = await createTestMrmModelRole(owner.orgId, modelId, owner.userId, {
      role: "validator",
    });

    // Deleting the user must NOT delete the role assignment — it keeps the
    // audit record and blanks the user (ON DELETE SET NULL).
    await sequelize.query(`DELETE FROM users WHERE id = :userId`, {
      replacements: { userId: owner.userId },
    });

    const [row] = (await sequelize.query(
      `SELECT user_id FROM mrm_model_roles WHERE id = :id`,
      { replacements: { id: roleId }, type: QueryTypes.SELECT },
    )) as [{ user_id: number | null } | undefined];

    expect(row).toBeDefined();
    expect(row?.user_id).toBeNull();
  });
});
