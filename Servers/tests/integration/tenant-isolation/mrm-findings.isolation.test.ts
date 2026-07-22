jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import {
  createTestModelInventory,
  createTestMrmValidation,
  createTestMrmFinding,
} from "../../factories";

/**
 * MRM findings tenant isolation.
 *
 * NOTE: MRM has no REST endpoints yet (Branch 1 is the database layer only).
 * These tests assert the isolation contract at the query layer — the same
 * `WHERE organization_id = :orgId` scoping every MRM controller/util will use.
 * Add route-level isolation tests here once the MRM routes exist.
 */
describe("MRM findings tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("scopes finding rows to the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const validationId = await createTestMrmValidation(owner.orgId, modelId);
    await createTestMrmFinding(owner.orgId, modelId, { validation_id: validationId });

    const ownerRows = await sequelize.query(
      `SELECT id FROM mrm_findings WHERE organization_id = :orgId`,
      { replacements: { orgId: owner.orgId }, type: QueryTypes.SELECT },
    );
    expect(ownerRows.length).toBeGreaterThan(0);

    const attackerRows = await sequelize.query(
      `SELECT id FROM mrm_findings WHERE organization_id = :orgId`,
      { replacements: { orgId: attacker.orgId }, type: QueryTypes.SELECT },
    );
    expect(attackerRows.length).toBe(0);
  });

  it("stamps organization_id on the finding row", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const findingId = await createTestMrmFinding(owner.orgId, modelId);

    const [row] = (await sequelize.query(
      `SELECT organization_id FROM mrm_findings WHERE id = :id`,
      { replacements: { id: findingId }, type: QueryTypes.SELECT },
    )) as [{ organization_id: number }];

    expect(row.organization_id).toBe(owner.orgId);
  });

  it("nulls validation_id but keeps the finding when its validation is deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const validationId = await createTestMrmValidation(owner.orgId, modelId);
    const findingId = await createTestMrmFinding(owner.orgId, modelId, {
      validation_id: validationId,
    });

    await sequelize.query(`DELETE FROM mrm_validations WHERE id = :id`, {
      replacements: { id: validationId },
    });

    const [row] = (await sequelize.query(`SELECT validation_id FROM mrm_findings WHERE id = :id`, {
      replacements: { id: findingId },
      type: QueryTypes.SELECT,
    })) as [{ validation_id: number | null }];

    expect(row.validation_id).toBeNull();
  });
});
