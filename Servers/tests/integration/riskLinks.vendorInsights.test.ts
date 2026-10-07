jest.setTimeout(60000);

import { cleanupDatabase, seedFrameworks } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import {
  createTestProject,
  createTestProjectFramework,
  createTestRisk,
  createTestVendor,
  createTestVendorRisk,
  linkRiskToProject,
  linkVendorToProject,
} from "../factories";

beforeAll(async () => {
  await seedFrameworks();
});

afterEach(async () => {
  await cleanupDatabase();
});

/** A project risk inheriting from a vendor risk, written straight to the table. */
async function inheritFromVendorRisk(
  orgId: number,
  child: number,
  vendorRisk: number,
  status: "suggested" | "confirmed" | "dismissed" = "confirmed",
): Promise<void> {
  await sequelize.query(
    `INSERT INTO risk_links (organization_id, source_risk_id, target_vendor_risk_id, relation_type, status, source)
     VALUES (:orgId, :child, :vendorRisk, 'inherits_from', :status, 'user')`,
    { replacements: { orgId, child, vendorRisk, status } },
  );
}

const softDelete = (table: "risks" | "vendorrisks", id: number) =>
  sequelize.query(`UPDATE ${table} SET is_deleted = true WHERE id = :id`, {
    replacements: { id },
  });

describe("GET /api/riskLinks/vendor-exposure", () => {
  it("counts confirmed children per vendor risk and rolls them up per vendor", async () => {
    const { owner } = await seedTwoTenantContexts();
    const lending = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Lending",
    });
    const claims = await createTestProject(owner.orgId, owner.userId, { project_title: "Claims" });
    const acme = await createTestVendor(owner.orgId, { vendor_name: "Acme Cloud" });
    const zeta = await createTestVendor(owner.orgId, { vendor_name: "Zeta Labs" });
    const outage = await createTestVendorRisk(owner.orgId, { vendor_id: acme });
    const leak = await createTestVendorRisk(owner.orgId, { vendor_id: acme });
    const quiet = await createTestVendorRisk(owner.orgId, { vendor_id: zeta });

    const inLending = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, inLending, lending);
    const inBoth = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, inBoth, lending);
    await linkRiskToProject(owner.orgId, inBoth, claims);
    const suggested = await createTestRisk(owner.orgId, {});
    const dismissed = await createTestRisk(owner.orgId, {});
    const deleted = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, deleted, claims);

    await inheritFromVendorRisk(owner.orgId, inLending, outage);
    await inheritFromVendorRisk(owner.orgId, inBoth, leak);
    await inheritFromVendorRisk(owner.orgId, suggested, outage, "suggested");
    await inheritFromVendorRisk(owner.orgId, dismissed, outage, "dismissed");
    await inheritFromVendorRisk(owner.orgId, deleted, leak);
    await softDelete("risks", deleted);

    const res = await owner.request.get("/api/riskLinks/vendor-exposure");

    expect(res.status).toBe(200);
    const byRisk = new Map(res.body.data.risks.map((r: any) => [r.vendor_risk_id, r]));
    expect(byRisk.get(outage)).toEqual({
      vendor_risk_id: outage,
      children: 1,
      suggested: 1,
      use_cases: [{ id: lending, name: "Lending" }],
    });
    expect(byRisk.get(leak)).toEqual({
      vendor_risk_id: leak,
      children: 1,
      suggested: 0,
      use_cases: [
        { id: claims, name: "Claims" },
        { id: lending, name: "Lending" },
      ],
    });
    expect(byRisk.get(quiet)).toMatchObject({ children: 0, suggested: 0, use_cases: [] });

    expect(res.body.data.vendors).toEqual([
      {
        vendor_id: acme,
        vendor_name: "Acme Cloud",
        vendor_risks: 2,
        linked_vendor_risks: 2,
        inheriting_risks: 2,
        suggested: 1,
        use_cases: [
          { id: claims, name: "Claims" },
          { id: lending, name: "Lending" },
        ],
      },
      {
        vendor_id: zeta,
        vendor_name: "Zeta Labs",
        vendor_risks: 1,
        linked_vendor_risks: 0,
        inheriting_risks: 0,
        suggested: 0,
        use_cases: [],
      },
    ]);
  });

  it("leaves out a soft-deleted vendor risk", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendor = await createTestVendor(owner.orgId, {});
    const gone = await createTestVendorRisk(owner.orgId, { vendor_id: vendor });
    await softDelete("vendorrisks", gone);

    const res = await owner.request.get("/api/riskLinks/vendor-exposure");

    expect(res.body.data).toEqual({ risks: [], vendors: [] });
  });

  it("shows another organization nothing", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const vendor = await createTestVendor(owner.orgId, {});
    const vendorRisk = await createTestVendorRisk(owner.orgId, { vendor_id: vendor });
    await inheritFromVendorRisk(owner.orgId, await createTestRisk(owner.orgId, {}), vendorRisk);

    const res = await attacker.request.get("/api/riskLinks/vendor-exposure");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ risks: [], vendors: [] });
  });
});

describe("GET /api/riskLinks/vendor-duplicates", () => {
  it("pairs one vendor's look-alike risks, never two vendors' risks", async () => {
    const { owner } = await seedTwoTenantContexts();
    const acme = await createTestVendor(owner.orgId, { vendor_name: "Acme Cloud" });
    const zeta = await createTestVendor(owner.orgId, {});
    const first = await createTestVendorRisk(owner.orgId, {
      vendor_id: acme,
      risk_description: "Customer data leaked through the support portal",
    });
    const second = await createTestVendorRisk(owner.orgId, {
      vendor_id: acme,
      risk_description: "Support portal leaked customer data",
    });
    // Same words at another vendor: a pattern across suppliers, not a duplicate.
    await createTestVendorRisk(owner.orgId, {
      vendor_id: zeta,
      risk_description: "Customer data leaked through the support portal",
    });

    const res = await owner.request.get("/api/riskLinks/vendor-duplicates");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ scanned: 3, compared: 1, matched: 1, truncated: false });
    expect(res.body.data.candidates).toHaveLength(1);
    expect(res.body.data.candidates[0]).toMatchObject({
      vendor: { id: acme, name: "Acme Cloud" },
      risk_a: { id: first },
      risk_b: { id: second },
    });
  });

  it("reads the impact description too, and skips soft-deleted risks", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendor = await createTestVendor(owner.orgId, {});
    const first = await createTestVendorRisk(owner.orgId, {
      vendor_id: vendor,
      risk_description: "Outage",
    });
    const second = await createTestVendorRisk(owner.orgId, {
      vendor_id: vendor,
      risk_description: "Outage",
    });
    await sequelize.query(
      `UPDATE vendorrisks SET impact_description = 'Loan approvals stop for every branch'
        WHERE id IN (:ids)`,
      { replacements: { ids: [first, second] } },
    );
    const deleted = await createTestVendorRisk(owner.orgId, {
      vendor_id: vendor,
      risk_description: "Outage",
    });
    await softDelete("vendorrisks", deleted);

    const res = await owner.request.get("/api/riskLinks/vendor-duplicates");

    expect(res.body.data.scanned).toBe(2);
    expect(res.body.data.candidates[0].shared_tokens).toEqual(
      expect.arrayContaining(["approvals", "branch", "loan", "outage"]),
    );
  });

  it("shows another organization nothing", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const vendor = await createTestVendor(owner.orgId, {});
    await createTestVendorRisk(owner.orgId, { vendor_id: vendor, risk_description: "Data leak" });
    await createTestVendorRisk(owner.orgId, { vendor_id: vendor, risk_description: "Data leak" });

    const res = await attacker.request.get("/api/riskLinks/vendor-duplicates");

    expect(res.body.data).toMatchObject({ scanned: 0, candidates: [] });
  });
});

describe("GET /api/riskLinks/vendor-coverage", () => {
  it("splits vendor risks into mapped, gaps and no framework to map to", async () => {
    const { owner } = await seedTwoTenantContexts();
    const framed = await createTestProject(owner.orgId, owner.userId, {});
    await createTestProjectFramework(owner.orgId, framed, 1);
    await createTestProjectFramework(owner.orgId, framed, 2);
    const bare = await createTestProject(owner.orgId, owner.userId, {});
    const served = await createTestVendor(owner.orgId, { vendor_name: "Acme Cloud" });
    await linkVendorToProject(owner.orgId, served, framed);
    const unserved = await createTestVendor(owner.orgId, {});
    await linkVendorToProject(owner.orgId, unserved, bare);

    const mapped = await createTestVendorRisk(owner.orgId, { vendor_id: served });
    await sequelize.query(
      `INSERT INTO frameworks_vendorrisks (organization_id, vendorrisk_id, framework_id)
       VALUES (:orgId, :mapped, 2)`,
      { replacements: { orgId: owner.orgId, mapped } },
    );
    const lowGap = await createTestVendorRisk(owner.orgId, {
      vendor_id: served,
      risk_level: "Low",
    });
    const highGap = await createTestVendorRisk(owner.orgId, {
      vendor_id: served,
      risk_level: "Very high",
    });
    const nothingToMap = await createTestVendorRisk(owner.orgId, { vendor_id: unserved });

    const res = await owner.request.get("/api/riskLinks/vendor-coverage");

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({
      total_active_risks: 4,
      mapped: 1,
      gap: 2,
      no_framework: 1,
    });
    expect(res.body.data.gaps.map((r: any) => r.id)).toEqual([highGap, lowGap]);
    expect(res.body.data.gaps[0]).toMatchObject({
      vendor: { id: served, name: "Acme Cloud" },
      available_frameworks: ["EU AI Act", "ISO 42001"],
    });
    expect(res.body.data.no_framework.map((r: any) => r.id)).toEqual([nothingToMap]);
    expect(res.body.data.truncated).toBe(false);
  });

  it("shows another organization nothing", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const vendor = await createTestVendor(owner.orgId, {});
    await createTestVendorRisk(owner.orgId, { vendor_id: vendor });

    const res = await attacker.request.get("/api/riskLinks/vendor-coverage");

    expect(res.body.data.summary.total_active_risks).toBe(0);
  });
});

describe("POST /api/riskLinks/vendor-risks/:vendorRiskId/suggest-hierarchy", () => {
  it("refuses a non-administrator", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    const res = await owner.request.post(
      `/api/riskLinks/vendor-risks/${vendorRisk}/suggest-hierarchy`,
    );

    expect(res.status).toBe(403);
  });

  it("says an LLM key is needed before queueing anything", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorRisk = await createTestVendorRisk(owner.orgId, {});

    const res = await owner.request.post(
      `/api/riskLinks/vendor-risks/${vendorRisk}/suggest-hierarchy`,
    );

    expect(res.status).toBe(400);
  });

  it("rejects an id that is not a number", async () => {
    const { owner } = await seedTwoTenantContexts();

    const res = await owner.request.post("/api/riskLinks/vendor-risks/abc/suggest-hierarchy");

    expect(res.status).toBe(400);
  });
});
