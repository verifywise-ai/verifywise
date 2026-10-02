jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import { createTestVendor, createTestVendorRisk } from "../factories";

afterEach(async () => {
  await cleanupDatabase();
});

// Mounted at /api/vendors (app.ts).
const suggestionsUrl = (vendorId: number) => `/api/vendors/${vendorId}/riskSuggestions`;

const setQuestionnaire = async (
  vendorId: number,
  values: {
    data_sensitivity: string | null;
    business_criticality: string | null;
    past_issues: string | null;
    regulatory_exposure: string | null;
  },
): Promise<void> => {
  await sequelize.query(
    `UPDATE vendors
       SET data_sensitivity = :data_sensitivity,
           business_criticality = :business_criticality,
           past_issues = :past_issues,
           regulatory_exposure = :regulatory_exposure
     WHERE id = :vendorId`,
    { replacements: { vendorId, ...values } },
  );
};

const vendorRiskCount = async (): Promise<number> => {
  const rows = (await sequelize.query(`SELECT count(*) AS count FROM vendorrisks`, {
    type: QueryTypes.SELECT,
  })) as { count: string }[];
  return Number(rows[0].count);
};

describe("GET /api/vendors/:id/riskSuggestions", () => {
  it("returns suggestions for a vendor with questionnaire exposure", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId, { vendor_name: "Exposed Vendor" });
    await setQuestionnaire(vendorId, {
      data_sensitivity: "Health data (e.g. HIPAA)",
      business_criticality: "High (critical to core services or products)",
      past_issues: "Major incident (e.g. data breach, legal issue)",
      regulatory_exposure: "HIPAA (US)",
    });

    const res = await owner.request.get(suggestionsUrl(vendorId));

    expect(res.status).toBe(200);
    expect(res.body.data.vendor_id).toBe(vendorId);
    expect(res.body.data.questionnaire_complete).toBe(true);
    expect(res.body.data.suggestions).toHaveLength(4);
  });

  it("suppresses an archetype the vendor's existing risk already covers", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId, { vendor_name: "Covered Vendor" });
    await setQuestionnaire(vendorId, {
      data_sensitivity: "Health data (e.g. HIPAA)",
      business_criticality: "Low (vendor supports non-core functions)",
      past_issues: "None",
      regulatory_exposure: "None",
    });
    const riskId = await createTestVendorRisk(owner.orgId, {
      vendor_id: vendorId,
      risk_description: "Health data processed by this vendor lacks documented safeguards",
    });

    const res = await owner.request.get(suggestionsUrl(vendorId));

    expect(res.status).toBe(200);
    expect(res.body.data.suggestions.map((s: any) => s.archetype)).not.toContain(
      "data_sensitivity",
    );
    expect(res.body.data.suppressed).toEqual([
      { archetype: "data_sensitivity", matched_vendor_risk_id: riskId },
    ]);
  });

  it("writes nothing, with at least one vendor risk already present", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId, { vendor_name: "Read-only Vendor" });
    await setQuestionnaire(vendorId, {
      data_sensitivity: "Personally identifiable information (PII)",
      business_criticality: "Low (vendor supports non-core functions)",
      past_issues: "None",
      regulatory_exposure: "None",
    });
    await createTestVendorRisk(owner.orgId, {
      vendor_id: vendorId,
      risk_description: "Unrelated existing vendor risk wording",
    });

    const before = await vendorRiskCount();
    expect(before).toBeGreaterThanOrEqual(1);

    const res = await owner.request.get(suggestionsUrl(vendorId));

    expect(res.status).toBe(200);
    expect(await vendorRiskCount()).toBe(before);
  });

  it("returns 404 for a vendor in another organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const foreignVendorId = await createTestVendor(attacker.orgId, {
      vendor_name: "Foreign Vendor",
    });

    const res = await owner.request.get(suggestionsUrl(foreignVendorId));

    expect(res.status).toBe(404);
  });
});
