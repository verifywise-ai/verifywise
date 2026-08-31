jest.setTimeout(60000);

import { cleanupDatabase } from "./helpers";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import {
  createTestProject,
  createTestRisk,
  createTestVendor,
  createTestVendorRisk,
  createTestModelInventory,
  createTestModelRisk,
  linkRiskToProject,
  linkVendorToProject,
  linkModelToProject,
} from "../factories";
import { getSharedProjectCandidatesQuery } from "../../utils/riskLink.utils";
import { sequelize } from "../../database/db";

afterEach(async () => {
  await cleanupDatabase();
});

describe("getSharedProjectCandidatesQuery", () => {
  it("returns a vendor risk whose vendor is attached to the subject's project", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, project);

    const vendor = await createTestVendor(owner.orgId, {});
    await linkVendorToProject(owner.orgId, vendor, project);
    const vendorRisk = await createTestVendorRisk(owner.orgId, { vendor_id: vendor });

    const result = await getSharedProjectCandidatesQuery(owner.orgId, subject);

    expect(result).toEqual([
      { entityType: "vendor_risk", id: vendorRisk, projects: ["Fraud Detection"] },
    ]);
  });

  it("omits a vendor risk whose vendor shares no project with the subject", async () => {
    const { owner } = await seedTwoTenantContexts();
    const subjectProject = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const otherProject = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Unrelated",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, subjectProject);

    const vendor = await createTestVendor(owner.orgId, {});
    await linkVendorToProject(owner.orgId, vendor, otherProject);
    await createTestVendorRisk(owner.orgId, { vendor_id: vendor });

    expect(await getSharedProjectCandidatesQuery(owner.orgId, subject)).toEqual([]);
  });

  it("returns a model attached under two frameworks exactly once", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, project);

    const model = await createTestModelInventory(owner.orgId, {});
    await linkModelToProject(owner.orgId, model, project, 1);
    await linkModelToProject(owner.orgId, model, project, 2);
    const modelRisk = await createTestModelRisk(owner.orgId, { model_id: model });

    const result = await getSharedProjectCandidatesQuery(owner.orgId, subject);

    expect(result).toEqual([
      { entityType: "model_risk", id: modelRisk, projects: ["Fraud Detection"] },
    ]);
  });

  it("collects both titles when the subject sits in two shared projects", async () => {
    const { owner } = await seedTwoTenantContexts();
    const kyc = await createTestProject(owner.orgId, owner.userId, { project_title: "KYC" });
    const fraud = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, kyc);
    await linkRiskToProject(owner.orgId, subject, fraud);

    const vendor = await createTestVendor(owner.orgId, {});
    await linkVendorToProject(owner.orgId, vendor, kyc);
    await linkVendorToProject(owner.orgId, vendor, fraud);
    const vendorRisk = await createTestVendorRisk(owner.orgId, { vendor_id: vendor });

    const result = await getSharedProjectCandidatesQuery(owner.orgId, subject);

    // ORDER BY project_title puts "Fraud Detection" before "KYC".
    expect(result).toEqual([
      { entityType: "vendor_risk", id: vendorRisk, projects: ["Fraud Detection", "KYC"] },
    ]);
  });

  it("never returns another org's vendor risk, even from a same-named project", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerProject = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, ownerProject);

    const attackerProject = await createTestProject(attacker.orgId, attacker.userId, {
      project_title: "Fraud Detection",
    });
    const attackerVendor = await createTestVendor(attacker.orgId, {});
    await linkVendorToProject(attacker.orgId, attackerVendor, attackerProject);
    await createTestVendorRisk(attacker.orgId, { vendor_id: attackerVendor });

    expect(await getSharedProjectCandidatesQuery(owner.orgId, subject)).toEqual([]);
  });

  it("omits a model risk with no model, without erroring", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, project);

    await createTestModelRisk(owner.orgId, {});

    expect(await getSharedProjectCandidatesQuery(owner.orgId, subject)).toEqual([]);
  });

  it("returns an empty list for a risk that belongs to no project", async () => {
    const { owner } = await seedTwoTenantContexts();
    const subject = await createTestRisk(owner.orgId, {});

    expect(await getSharedProjectCandidatesQuery(owner.orgId, subject)).toEqual([]);
  });

  it("omits a soft-deleted vendor risk", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {
      project_title: "Fraud Detection",
    });
    const subject = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, subject, project);

    const vendor = await createTestVendor(owner.orgId, {});
    await linkVendorToProject(owner.orgId, vendor, project);
    const vendorRisk = await createTestVendorRisk(owner.orgId, { vendor_id: vendor });
    await sequelize.query(
      `UPDATE vendorrisks SET is_deleted = true
        WHERE id = :vendorRisk AND organization_id = :orgId`,
      { replacements: { vendorRisk, orgId: owner.orgId } },
    );

    expect(await getSharedProjectCandidatesQuery(owner.orgId, subject)).toEqual([]);
  });
});
