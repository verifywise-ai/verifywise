jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestRisk, createTestModelRisk, createTestVendorRisk } from "../factories";

afterEach(async () => {
  await cleanupDatabase();
});

/*
 * Every link below is a straight INSERT, bypassing the controller on purpose:
 * they prove the TRIGGER does the work, not application code.
 */
const readFlag = async (where: string, replacements: Record<string, unknown>) => {
  const rows = (await sequelize.query(
    `SELECT parent_level_changed_at FROM risk_links WHERE ${where}`,
    { replacements, type: QueryTypes.SELECT },
  )) as { parent_level_changed_at: unknown }[];
  return rows[0].parent_level_changed_at;
};

const linkProjectParent = (orgId: number, child: number, parent: number, status = "confirmed") =>
  sequelize.query(
    `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id, relation_type, status, source)
     VALUES (:orgId, :child, :parent, 'inherits_from', :status, 'user')`,
    { replacements: { orgId, child, parent, status } },
  );

describe("stale-inheritance flag", () => {
  it("flags the child when its project-risk parent's level moves", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);

    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );

    expect(
      await readFlag(`source_risk_id = :child AND target_risk_id = :parent`, { child, parent }),
    ).not.toBeNull();
  });

  it("flags the child when its model-risk parent's level moves", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const modelRisk = await createTestModelRisk(owner.orgId, {});

    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_model_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :modelRisk, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, child, modelRisk } },
    );
    await sequelize.query(`UPDATE model_risks SET risk_level = 'Critical' WHERE id = :modelRisk`, {
      replacements: { modelRisk },
    });

    expect(
      await readFlag(`source_risk_id = :child AND target_model_risk_id = :modelRisk`, {
        child,
        modelRisk,
      }),
    ).not.toBeNull();
  });

  it("flags the child when its vendor-risk parent's level moves", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :vendorRisk, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, child, vendorRisk } },
    );
    await sequelize.query(`UPDATE vendorrisks SET risk_level = 'Critical' WHERE id = :vendorRisk`, {
      replacements: { vendorRisk },
    });

    expect(
      await readFlag(`source_risk_id = :child AND target_vendor_risk_id = :vendorRisk`, {
        child,
        vendorRisk,
      }),
    ).not.toBeNull();
  });

  it("never flags a suggested link", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent, "suggested");

    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );

    expect(
      await readFlag(`source_risk_id = :child AND target_risk_id = :parent`, { child, parent }),
    ).toBeNull();
  });

  it("never flags a related_to link", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    // risk_links_canonical demands source < target for related_to.
    const [s, t] = a < b ? [a, b] : [b, a];
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id, relation_type, status, source)
       VALUES (:orgId, :s, :t, 'related_to', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, s, t } },
    );

    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :t`,
      { replacements: { t } },
    );

    expect(
      await readFlag(`source_risk_id = :s AND target_risk_id = :t`, { s, t }),
    ).toBeNull();
  });

  it("does not flag when the same level is written again", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);

    // Flag it once, then clear the column by hand so the rewrite starts clean.
    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );
    await sequelize.query(
      `UPDATE risk_links SET parent_level_changed_at = NULL
        WHERE source_risk_id = :child AND target_risk_id = :parent`,
      { replacements: { child, parent } },
    );
    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );

    expect(
      await readFlag(`source_risk_id = :child AND target_risk_id = :parent`, { child, parent }),
    ).toBeNull();
  });

  it("leaves the flag standing on a non-level edit to the parent", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);

    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );
    await sequelize.query(`UPDATE risks SET risk_name = 'x' WHERE id = :parent`, {
      replacements: { parent },
    });

    expect(
      await readFlag(`source_risk_id = :child AND target_risk_id = :parent`, { child, parent }),
    ).not.toBeNull();
  });

  it("clears the flag when the child is edited", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);

    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );
    // A non-level column on purpose: any edit to the child counts as a review.
    await sequelize.query(`UPDATE risks SET risk_name = 'x' WHERE id = :child`, {
      replacements: { child },
    });

    expect(
      await readFlag(`source_risk_id = :child AND target_risk_id = :parent`, { child, parent }),
    ).toBeNull();
  });

  it("reaches the API as parentLevelChangedAt on the child's own view", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent);

    await sequelize.query(
      `UPDATE risks SET risk_level_autocalculated = 'High risk' WHERE id = :parent`,
      { replacements: { parent } },
    );

    const res = await owner.request.get(`/api/riskLinks/${child}`);
    expect(res.status).toBe(200);
    const row = (res.body.data as any[]).find(
      (link) => link.relationType === "inherits_from" && link.direction === "outgoing",
    );
    expect(row).toBeDefined();
    expect(typeof row.parentLevelChangedAt).toBe("string");
  });
});
