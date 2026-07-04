jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestModelInventory, createTestMrmValidation } from "../../factories";

/**
 * MRM validations tenant isolation.
 *
 * NOTE: MRM has no REST endpoints yet (Branch 1 is the database layer only).
 * These tests assert the isolation contract at the query layer — the same
 * `WHERE organization_id = :orgId` scoping every MRM controller/util will use —
 * rather than through an HTTP route. When the MRM routes land, add
 * route-level list/read/update/delete isolation tests here too.
 */
describe("MRM validations tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("scopes validation rows to the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await createTestMrmValidation(owner.orgId, modelId);

    const ownerRows = await sequelize.query(
      `SELECT id FROM mrm_validations WHERE organization_id = :orgId`,
      { replacements: { orgId: owner.orgId }, type: QueryTypes.SELECT },
    );
    expect(ownerRows.length).toBeGreaterThan(0);

    const attackerRows = await sequelize.query(
      `SELECT id FROM mrm_validations WHERE organization_id = :orgId`,
      { replacements: { orgId: attacker.orgId }, type: QueryTypes.SELECT },
    );
    expect(attackerRows.length).toBe(0);
  });

  it("stamps organization_id on the validation row", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const validationId = await createTestMrmValidation(owner.orgId, modelId);

    const [row] = (await sequelize.query(
      `SELECT organization_id FROM mrm_validations WHERE id = :id`,
      { replacements: { id: validationId }, type: QueryTypes.SELECT },
    )) as [{ organization_id: number }];

    expect(row.organization_id).toBe(owner.orgId);
  });

  it("cascades validation deletes when the organization is removed", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const validationId = await createTestMrmValidation(owner.orgId, modelId);

    await sequelize.query(`DELETE FROM organizations WHERE id = :id`, {
      replacements: { id: owner.orgId },
    });

    const rows = await sequelize.query(`SELECT id FROM mrm_validations WHERE id = :id`, {
      replacements: { id: validationId },
      type: QueryTypes.SELECT,
    });
    expect(rows.length).toBe(0);
  });
});
