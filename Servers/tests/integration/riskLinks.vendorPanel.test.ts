jest.setTimeout(60000);

import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import {
  createTestProject,
  createTestRisk,
  createTestVendor,
  createTestVendorRisk,
  linkRiskToProject,
  linkVendorToProject,
} from "../factories";

afterEach(async () => {
  await cleanupDatabase();
});

/** A project risk inheriting from a vendor risk, written straight to the table. */
async function inheritFromVendorRisk(
  orgId: number,
  child: number,
  vendorRisk: number,
  status: "suggested" | "confirmed" | "dismissed" = "confirmed",
  source: "user" | "agent" = "user",
): Promise<void> {
  await sequelize.query(
    `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id, relation_type, status, source)
     VALUES (:orgId, :child, :vendorRisk, 'inherits_from', :status, :source)`,
    { replacements: { orgId, child, vendorRisk, status, source } },
  );
}

describe("GET /api/riskLinks/vendor-risks/:vendorRiskId", () => {
  it("lists the project risks that inherit from the vendor risk, as incoming links", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});
    const otherVendorRisk = await createTestVendorRisk(owner.orgId, {});
    const confirmed = await createTestRisk(owner.orgId, { risk_name: "Confirmed child" });
    const suggested = await createTestRisk(owner.orgId, { risk_name: "Suggested child" });
    const elsewhere = await createTestRisk(owner.orgId, { risk_name: "Someone else's child" });
    await inheritFromVendorRisk(owner.orgId, confirmed, vendorRisk, "confirmed", "user");
    await inheritFromVendorRisk(owner.orgId, suggested, vendorRisk, "suggested", "agent");
    await inheritFromVendorRisk(owner.orgId, elsewhere, otherVendorRisk);

    const res = await owner.request.get(`/api/riskLinks/vendor-risks/${vendorRisk}`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((l: any) => l.relatedRisk.id).sort()).toEqual(
      [confirmed, suggested].sort(),
    );
    for (const link of res.body.data) {
      expect(link.relationType).toBe("inherits_from");
      expect(link.direction).toBe("incoming");
      expect(link.relatedRisk.entityType).toBe("risk");
    }
    const byId = new Map(res.body.data.map((l: any) => [l.relatedRisk.id, l]));
    expect((byId.get(confirmed) as any).relatedRisk.name).toBe("Confirmed child");
    expect((byId.get(suggested) as any).status).toBe("suggested");
  });

  it("returns dismissed links only when asked for them", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});
    const kept = await createTestRisk(owner.orgId, {});
    const dropped = await createTestRisk(owner.orgId, {});
    await inheritFromVendorRisk(owner.orgId, kept, vendorRisk, "confirmed");
    await inheritFromVendorRisk(owner.orgId, dropped, vendorRisk, "dismissed");

    const active = await owner.request.get(`/api/riskLinks/vendor-risks/${vendorRisk}`);
    const dismissed = await owner.request.get(
      `/api/riskLinks/vendor-risks/${vendorRisk}?status=dismissed`,
    );

    expect(active.body.data.map((l: any) => l.relatedRisk.id)).toEqual([kept]);
    expect(dismissed.body.data.map((l: any) => l.relatedRisk.id)).toEqual([dropped]);
  });

  it("hides a soft-deleted child, and returns nothing for a soft-deleted vendor risk", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});
    const live = await createTestRisk(owner.orgId, {});
    const deleted = await createTestRisk(owner.orgId, {});
    await inheritFromVendorRisk(owner.orgId, live, vendorRisk);
    await inheritFromVendorRisk(owner.orgId, deleted, vendorRisk);
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :deleted`, {
      replacements: { deleted },
    });

    const before = await owner.request.get(`/api/riskLinks/vendor-risks/${vendorRisk}`);
    expect(before.body.data.map((l: any) => l.relatedRisk.id)).toEqual([live]);

    await sequelize.query(`UPDATE vendorrisks SET is_deleted = true WHERE id = :vendorRisk`, {
      replacements: { vendorRisk },
    });
    const after = await owner.request.get(`/api/riskLinks/vendor-risks/${vendorRisk}`);
    expect(after.body.data).toEqual([]);
  });

  // The two tables have separate sequences, so a child can carry the vendor
  // risk's own id. Deriving direction by comparing ids would call that child's
  // link "outgoing" — the vendor risk inheriting from its own child.
  it("calls the link incoming even when the child shares the vendor risk's id", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});
    const child = await createTestRisk(owner.orgId, {});
    const [[{ shared }]] = (await sequelize.query(
      `SELECT GREATEST((SELECT MAX(id) FROM risks), (SELECT MAX(id) FROM vendorrisks)) + 1000 AS shared`,
    )) as any;
    await sequelize.query(`UPDATE risks SET id = :shared WHERE id = :child`, {
      replacements: { shared, child },
    });
    await sequelize.query(`UPDATE vendorrisks SET id = :shared WHERE id = :vendorRisk`, {
      replacements: { shared, vendorRisk },
    });
    await inheritFromVendorRisk(owner.orgId, shared, shared);

    const res = await owner.request.get(`/api/riskLinks/vendor-risks/${shared}`);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].direction).toBe("incoming");
  });

  it("rejects an id that is not a number", async () => {
    const { owner } = await seedTwoTenantContexts();

    const res = await owner.request.get("/api/riskLinks/vendor-risks/abc");

    expect(res.status).toBe(400);
  });

  it("shows another organization nothing", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});
    const child = await createTestRisk(owner.orgId, {});
    await inheritFromVendorRisk(owner.orgId, child, vendorRisk);

    const res = await attacker.request.get(`/api/riskLinks/vendor-risks/${vendorRisk}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe("GET /api/riskLinks/vendor-risks/:vendorRiskId/shared-projects", () => {
  it("returns the project risks in the vendor's projects, with those project titles", async () => {
    const { owner } = await seedTwoTenantContexts();
    const first = await createTestProject(owner.orgId, owner.userId, { project_title: "Lending" });
    const second = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Onboarding",
    });
    const unrelated = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Marketing",
    });
    const vendor = await createTestVendor(owner.orgId, {});
    await linkVendorToProject(owner.orgId, vendor, first);
    await linkVendorToProject(owner.orgId, vendor, second);
    const vendorRisk = await createTestVendorRisk(owner.orgId, { vendor_id: vendor });

    const inBoth = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, inBoth, first);
    await linkRiskToProject(owner.orgId, inBoth, second);
    const inOne = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, inOne, first);
    const outside = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, outside, unrelated);
    const deleted = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, deleted, first);
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :deleted`, {
      replacements: { deleted },
    });

    const res = await owner.request.get(
      `/api/riskLinks/vendor-risks/${vendorRisk}/shared-projects`,
    );

    expect(res.status).toBe(200);
    const byId = new Map(res.body.data.map((c: any) => [c.id, c.projects]));
    expect([...byId.keys()].sort()).toEqual([inBoth, inOne].sort());
    expect(byId.get(inBoth)).toEqual(["Lending", "Onboarding"]);
    expect(byId.get(inOne)).toEqual(["Lending"]);
  });

  it("shows another organization nothing", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {});
    const vendor = await createTestVendor(owner.orgId, {});
    await linkVendorToProject(owner.orgId, vendor, project);
    const vendorRisk = await createTestVendorRisk(owner.orgId, { vendor_id: vendor });
    const risk = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, risk, project);

    const res = await attacker.request.get(
      `/api/riskLinks/vendor-risks/${vendorRisk}/shared-projects`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// The panel creates and decides links through the endpoints the project risk
// panel already uses. These pin that those accept the vendor-side calls.
describe("linking a child from the vendor side", () => {
  it("creates the link with the existing POST and shows it on both sides", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});
    const child = await createTestRisk(owner.orgId, {});

    const created = await owner.request.post("/api/riskLinks").send({
      sourceRiskId: child,
      targetVendorRiskId: vendorRisk,
      relationType: "inherits_from",
    });
    expect(created.status).toBe(201);

    const vendorSide = await owner.request.get(`/api/riskLinks/vendor-risks/${vendorRisk}`);
    expect(vendorSide.body.data).toHaveLength(1);
    expect(vendorSide.body.data[0]).toMatchObject({
      status: "confirmed",
      source: "user",
      relatedRisk: { id: child, entityType: "risk" },
    });

    const childSide = await owner.request.get(`/api/riskLinks/${child}`);
    expect(childSide.body.data).toHaveLength(1);
    expect(childSide.body.data[0]).toMatchObject({
      direction: "outgoing",
      relatedRisk: { id: vendorRisk, entityType: "vendor_risk" },
    });
  });

  it("refuses a child that already has a confirmed parent", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});
    const otherVendorRisk = await createTestVendorRisk(owner.orgId, {});
    const child = await createTestRisk(owner.orgId, {});
    await inheritFromVendorRisk(owner.orgId, child, otherVendorRisk, "confirmed");

    const res = await owner.request.post("/api/riskLinks").send({
      sourceRiskId: child,
      targetVendorRiskId: vendorRisk,
      relationType: "inherits_from",
    });

    expect(res.status).toBe(409);
  });

  it("confirms a suggested child with the existing PATCH", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});
    const child = await createTestRisk(owner.orgId, {});
    await inheritFromVendorRisk(owner.orgId, child, vendorRisk, "suggested", "agent");
    const listed = await owner.request.get(`/api/riskLinks/vendor-risks/${vendorRisk}`);

    const res = await owner.request
      .patch(`/api/riskLinks/${listed.body.data[0].id}`)
      .send({ status: "confirmed" });

    expect(res.status).toBe(200);
    const after = await owner.request.get(`/api/riskLinks/vendor-risks/${vendorRisk}`);
    expect(after.body.data[0].status).toBe("confirmed");
  });
});
