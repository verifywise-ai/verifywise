jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { QueryTypes } from "sequelize";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestModelInventory, createTestMrmIngestionToken } from "../../factories";

/**
 * MRM ingestion-tokens tenant isolation.
 *
 * NOTE: MRM has no REST endpoints yet (the database layer only). These tests
 * assert the isolation contract at the query layer — the same
 * `WHERE organization_id = :orgId` scoping every MRM controller/util will use.
 */
describe("MRM ingestion tokens tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("scopes token rows to the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    await createTestMrmIngestionToken(owner.orgId, { name: "nightly-job" });

    const ownerRows = await sequelize.query(
      `SELECT id FROM mrm_ingestion_tokens WHERE organization_id = :orgId`,
      { replacements: { orgId: owner.orgId }, type: QueryTypes.SELECT },
    );
    expect(ownerRows.length).toBeGreaterThan(0);

    const attackerRows = await sequelize.query(
      `SELECT id FROM mrm_ingestion_tokens WHERE organization_id = :orgId`,
      { replacements: { orgId: attacker.orgId }, type: QueryTypes.SELECT },
    );
    expect(attackerRows.length).toBe(0);
  });

  it("stamps organization_id and stores only the hash (never plaintext)", async () => {
    const { owner } = await seedTwoTenantContexts();
    const tokenId = await createTestMrmIngestionToken(owner.orgId, {
      token_hash: "sha256-abc123",
    });

    const [row] = (await sequelize.query(
      `SELECT organization_id, token_hash FROM mrm_ingestion_tokens WHERE id = :id`,
      { replacements: { id: tokenId }, type: QueryTypes.SELECT },
    )) as [{ organization_id: number; token_hash: string }];

    expect(row.organization_id).toBe(owner.orgId);
    expect(row.token_hash).toBe("sha256-abc123");
  });

  it("cascades token deletion when its scoped model inventory is deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const modelId = await createTestModelInventory(owner.orgId);
    const tokenId = await createTestMrmIngestionToken(owner.orgId, {
      model_inventory_id: modelId,
    });

    await sequelize.query(`DELETE FROM model_inventories WHERE id = :id`, {
      replacements: { id: modelId },
    });

    const rows = await sequelize.query(`SELECT id FROM mrm_ingestion_tokens WHERE id = :id`, {
      replacements: { id: tokenId },
      type: QueryTypes.SELECT,
    });
    expect(rows.length).toBe(0);
  });

  it("preserves the token (created_by SET NULL) when the creating user is deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const tokenId = await createTestMrmIngestionToken(owner.orgId, {
      created_by: owner.userId,
    });

    // Deleting the creator must NOT delete the token — the audit record remains,
    // created_by is blanked (ON DELETE SET NULL).
    await sequelize.query(`DELETE FROM users WHERE id = :userId`, {
      replacements: { userId: owner.userId },
    });

    const [row] = (await sequelize.query(
      `SELECT created_by FROM mrm_ingestion_tokens WHERE id = :id`,
      { replacements: { id: tokenId }, type: QueryTypes.SELECT },
    )) as [{ created_by: number | null } | undefined];

    expect(row).toBeDefined();
    expect(row?.created_by).toBeNull();
  });
});
