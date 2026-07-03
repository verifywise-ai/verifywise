jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import {
  createTestModelInventory,
  createTestMrmValidation,
  createTestMrmRevalidationEvent,
} from "../../factories";

/**
 * MRM revalidation-events (immutable trigger-firing audit log) tenant isolation.
 *
 * NOTE: MRM has no REST endpoints yet (the database layer only). These tests
 * assert the isolation contract at the query layer — the same
 * `WHERE organization_id = :orgId` scoping every MRM controller/util will use.
 */
describe("MRM revalidation events tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("scopes revalidation-event rows to the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    await createTestMrmRevalidationEvent(owner.orgId, modelId, { trigger_source: "breach" });

    const ownerRows = await sequelize.query(
      `SELECT id FROM mrm_revalidation_events WHERE organization_id = :orgId`,
      { replacements: { orgId: owner.orgId }, type: QueryTypes.SELECT },
    );
    expect(ownerRows.length).toBeGreaterThan(0);

    const attackerRows = await sequelize.query(
      `SELECT id FROM mrm_revalidation_events WHERE organization_id = :orgId`,
      { replacements: { orgId: attacker.orgId }, type: QueryTypes.SELECT },
    );
    expect(attackerRows.length).toBe(0);
  });

  it("stamps organization_id on the revalidation-event row", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const eventId = await createTestMrmRevalidationEvent(owner.orgId, modelId, {
      trigger_source: "tier_increase",
    });

    const [row] = (await sequelize.query(
      `SELECT organization_id FROM mrm_revalidation_events WHERE id = :id`,
      { replacements: { id: eventId }, type: QueryTypes.SELECT },
    )) as [{ organization_id: number }];

    expect(row.organization_id).toBe(owner.orgId);
  });

  it("cascades event deletion when the parent model is deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const eventId = await createTestMrmRevalidationEvent(owner.orgId, modelId);

    await sequelize.query(`DELETE FROM model_inventories WHERE id = :id`, {
      replacements: { id: modelId },
    });

    const rows = await sequelize.query(`SELECT id FROM mrm_revalidation_events WHERE id = :id`, {
      replacements: { id: eventId },
      type: QueryTypes.SELECT,
    });
    expect(rows.length).toBe(0);
  });

  it("cascades event deletion when the organization is removed", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const eventId = await createTestMrmRevalidationEvent(owner.orgId, modelId);

    await sequelize.query(`DELETE FROM organizations WHERE id = :id`, {
      replacements: { id: owner.orgId },
    });

    const rows = await sequelize.query(`SELECT id FROM mrm_revalidation_events WHERE id = :id`, {
      replacements: { id: eventId },
      type: QueryTypes.SELECT,
    });
    expect(rows.length).toBe(0);
  });

  it("preserves the event (resulting_validation_id SET NULL) when the validation task is deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const validationId = await createTestMrmValidation(owner.orgId, modelId);
    const eventId = await createTestMrmRevalidationEvent(owner.orgId, modelId, {
      trigger_source: "breach",
      resulting_validation_id: validationId,
      created_validation: true,
      source_ref: { evaluation_id: 42 },
    });

    // Deleting the validation task must NOT delete the audit event — the firing
    // is preserved with resulting_validation_id set to NULL (ON DELETE SET NULL).
    await sequelize.query(`DELETE FROM mrm_validations WHERE id = :id`, {
      replacements: { id: validationId },
    });

    const [row] = (await sequelize.query(
      `SELECT resulting_validation_id, source_ref FROM mrm_revalidation_events WHERE id = :id`,
      { replacements: { id: eventId }, type: QueryTypes.SELECT },
    )) as [
      { resulting_validation_id: number | null; source_ref: Record<string, unknown> } | undefined,
    ];

    expect(row).toBeDefined();
    expect(row?.resulting_validation_id).toBeNull();
    expect(row?.source_ref).toMatchObject({ evaluation_id: 42 });
  });
});
