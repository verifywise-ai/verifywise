jest.setTimeout(60000);

import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import {
  createTestRisk,
  createTestModelRisk,
  createTestVendor,
  createTestVendorRisk,
} from "../factories";

afterEach(async () => {
  await cleanupDatabase();
});

/*
 * Every link below is a straight INSERT, bypassing the controller on purpose:
 * they prove the ENDPOINT shapes the payload, not application validation.
 */
const linkProjectParent = (orgId: number, child: number, parent: number, status = "confirmed") =>
  sequelize.query(
    `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id, relation_type, status, source, reasons)
     VALUES (:orgId, :child, :parent, 'inherits_from', :status, 'user', '[]'::jsonb)`,
    { replacements: { orgId, child, parent, status } },
  );

describe("GET /riskLinks (graph)", () => {
  it("returns confirmed and suggested by default, and omits dismissed", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    const other = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent, "confirmed");
    await linkProjectParent(owner.orgId, other, parent, "suggested");
    await linkProjectParent(owner.orgId, child, other, "dismissed");

    const res = await owner.request.get("/riskLinks");

    expect(res.status).toBe(200);
    const statuses = (res.body.data.edges as any[]).map((e) => e.status).sort();
    expect(statuses).toEqual(["confirmed", "suggested"]);
    expect(res.body.data.truncated).toBe(false);
  });

  it("filters to one status with ?status=", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    const other = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent, "confirmed");
    await linkProjectParent(owner.orgId, other, parent, "suggested");

    const res = await owner.request.get("/riskLinks?status=confirmed");

    expect(res.status).toBe(200);
    expect(res.body.data.edges).toHaveLength(1);
    expect(res.body.data.edges[0].status).toBe("confirmed");
  });

  it("rejects a bogus status with 400", async () => {
    const { owner } = await seedTwoTenantContexts();

    const res = await owner.request.get("/riskLinks?status=bogus");

    expect(res.status).toBe(400);
  });

  it("does not return another org's links", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const child = await createTestRisk(attacker.orgId, {});
    const parent = await createTestRisk(attacker.orgId, {});
    await linkProjectParent(attacker.orgId, child, parent, "confirmed");

    const res = await owner.request.get("/riskLinks");

    expect(res.status).toBe(200);
    expect(res.body.data.edges).toEqual([]);
    expect(res.body.data.nodes).toEqual([]);
  });

  it("hides an edge whose target risk was soft-deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent, "confirmed");
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :parent`, {
      replacements: { parent },
    });

    const res = await owner.request.get("/riskLinks");

    expect(res.status).toBe(200);
    expect(res.body.data.edges).toEqual([]);
  });

  it("hides an edge whose source risk was soft-deleted", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, child, parent, "confirmed");
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :child`, {
      replacements: { child },
    });

    const res = await owner.request.get("/riskLinks");

    expect(res.status).toBe(200);
    expect(res.body.data.edges).toEqual([]);
  });

  it("names cross-entity parents with their table, name and level", async () => {
    const { owner } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId, {});
    const modelRisk = await createTestModelRisk(owner.orgId, {
      risk_name: "Fairness degradation",
      risk_level: "High",
    });
    const vendor = await createTestVendor(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, {
      vendor_id: vendor,
      risk_description: "The vendor cannot evidence its own model validation.",
      risk_level: "Critical",
    });

    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_model_risk_id, relation_type, status, source, reasons)
       VALUES (:orgId, :child, :modelRisk, 'inherits_from', 'confirmed', 'user', '[]'::jsonb)`,
      { replacements: { orgId: owner.orgId, child, modelRisk } },
    );
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id, relation_type, status, source, reasons)
       VALUES (:orgId, :child, :vendorRisk, 'inherits_from', 'suggested', 'user', '[]'::jsonb)`,
      { replacements: { orgId: owner.orgId, child, vendorRisk } },
    );

    const res = await owner.request.get("/riskLinks");

    expect(res.status).toBe(200);
    const nodes = res.body.data.nodes as any[];
    const model = nodes.find((n) => n.key === `model_risk:${modelRisk}`);
    const vendorNode = nodes.find((n) => n.key === `vendor_risk:${vendorRisk}`);
    expect(model).toMatchObject({
      entityType: "model_risk",
      id: modelRisk,
      name: "Fairness degradation",
      riskLevel: "High",
    });
    expect(vendorNode).toMatchObject({
      entityType: "vendor_risk",
      id: vendorRisk,
      name: "The vendor cannot evidence its own model validation.",
      riskLevel: "Critical",
    });
  });

  it("dedupes nodes shared by two edges", async () => {
    const { owner } = await seedTwoTenantContexts();
    const childA = await createTestRisk(owner.orgId, {});
    const childB = await createTestRisk(owner.orgId, {});
    const parent = await createTestRisk(owner.orgId, {});
    await linkProjectParent(owner.orgId, childA, parent, "confirmed");
    await linkProjectParent(owner.orgId, childB, parent, "confirmed");

    const res = await owner.request.get("/riskLinks");

    expect(res.status).toBe(200);
    expect(res.body.data.edges).toHaveLength(2);
    expect(res.body.data.nodes).toHaveLength(3);
    expect(
      (res.body.data.nodes as any[]).filter((n) => n.key === `risk:${parent}`),
    ).toHaveLength(1);
  });
});
