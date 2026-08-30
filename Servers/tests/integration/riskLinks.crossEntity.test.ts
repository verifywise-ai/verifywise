jest.setTimeout(60000);

import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestRisk, createTestModelRisk, createTestVendorRisk } from "../factories";
import {
  getConfirmedHierarchyEdgesQuery,
  getRiskLinksForRiskQuery,
} from "../../utils/riskLink.utils";

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

describe("getRiskLinksForRiskQuery with cross-entity parents", () => {
  it("uses the specified fallback for a blank model-risk name", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const modelRisk = await createTestModelRisk(owner.orgId, { risk_name: "" });

    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_model_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :modelRisk, 'inherits_from', 'suggested', 'user')`,
      { replacements: { orgId: owner.orgId, child, modelRisk } },
    );

    const rows = await getRiskLinksForRiskQuery(owner.orgId, child, ["suggested"]);

    expect(rows).toHaveLength(1);
    expect(rows[0].related_risk_name).toBe("Untitled model risk");
  });

  it("uses the specified fallback for a blank vendor-risk description", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, { risk_description: "" });

    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :vendorRisk, 'inherits_from', 'suggested', 'user')`,
      { replacements: { orgId: owner.orgId, child, vendorRisk } },
    );

    const rows = await getRiskLinksForRiskQuery(owner.orgId, child, ["suggested"]);

    expect(rows).toHaveLength(1);
    expect(rows[0].related_risk_name).toBe("Untitled vendor risk");
  });

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

    const rows = await getRiskLinksForRiskQuery(owner.orgId, child, ["confirmed"]);

    // Assert the row arrived before reading fields off it: today it does not,
    // and `rows[0].related_entity_type` would crash instead of failing.
    expect(rows).toHaveLength(1);
    expect(rows[0].related_entity_type).toBe("vendor_risk");
    expect(rows[0].related_id).toBe(vendorRisk);
    expect(rows[0].related_risk_name).toBe("A".repeat(80));
    expect(rows[0].related_risk_level).toBe("High");
  });

  it("hides a parent that belongs to another tenant", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const foreignModelRisk = await createTestModelRisk(attacker.orgId, {});

    // The link row itself is in the owner's org; only the parent is foreign.
    // Without the per-table tenant guard this renders as a blank panel row.
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_model_risk_id, relation_type, status, source)
       VALUES (:orgId, :child, :foreignModelRisk, 'inherits_from', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, child, foreignModelRisk } },
    );

    expect(await getRiskLinksForRiskQuery(owner.orgId, child, ["confirmed"])).toEqual([]);
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

    expect(await getRiskLinksForRiskQuery(owner.orgId, child, ["confirmed"])).toEqual([]);
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

    const rows = await getRiskLinksForRiskQuery(owner.orgId, child, ["confirmed"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].related_entity_type).toBe("risk");
    expect(rows[0].related_id).toBe(parent);
  });
});

describe("POST /api/riskLinks with a cross-entity parent", () => {
  it("creates an inheritance link to a vendor risk", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    const res = await owner.request.post("/api/riskLinks").send({
      sourceRiskId: child,
      targetVendorRiskId: vendorRisk,
      relationType: "inherits_from",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.relatedRisk.entityType).toBe("vendor_risk");
    expect(res.body.data.relatedRisk.id).toBe(vendorRisk);
  });

  it("rejects two target fields", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    const res = await owner.request.post("/api/riskLinks").send({
      sourceRiskId: child,
      targetRiskId: parent,
      targetVendorRiskId: vendorRisk,
      relationType: "inherits_from",
    });

    expect(res.status).toBe(400);
    expect(res.body.data).toMatch(/exactly one parent/i);
  });

  it("rejects related_to across entity types", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const modelRisk = await createTestModelRisk(owner.orgId, {});

    const res = await owner.request.post("/api/riskLinks").send({
      sourceRiskId: child,
      targetModelRiskId: modelRisk,
      relationType: "related_to",
    });

    expect(res.status).toBe(400);
    expect(res.body.data).toMatch(/only inheritance links/i);
  });

  it("404s on another tenant's model risk", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const foreign = await createTestModelRisk(attacker.orgId, {});

    const res = await owner.request.post("/api/riskLinks").send({
      sourceRiskId: child,
      targetModelRiskId: foreign,
      relationType: "inherits_from",
    });

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

    const res = await owner.request.post("/api/riskLinks").send({
      sourceRiskId: child,
      targetVendorRiskId: vendorRisk,
      relationType: "inherits_from",
    });

    expect(res.status).toBe(409);
  });
});
