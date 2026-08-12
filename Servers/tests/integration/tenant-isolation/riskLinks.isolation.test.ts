jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestRisk } from "../../factories";
import { recomputeRiskLinks } from "../../../services/riskLinks/recompute";
import {
  getRiskLinksForRiskQuery,
  getRiskLinkByIdQuery,
} from "../../../utils/riskLink.utils";

afterEach(async () => {
  await cleanupDatabase();
});

const CATEGORY = ["Strategic risk"];

describe("risk_links tenant isolation", () => {
  it("never links two risks from different orgs, even with identical fields", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerRiskA = await createTestRisk(owner.orgId, {
      risk_category: CATEGORY,
      ai_lifecycle_phase: "Deployment & integration",
    });
    const ownerRiskB = await createTestRisk(owner.orgId, {
      risk_category: CATEGORY,
      ai_lifecycle_phase: "Deployment & integration",
    });
    const attackerRisk = await createTestRisk(attacker.orgId, {
      risk_category: CATEGORY,
      ai_lifecycle_phase: "Deployment & integration",
    });

    await recomputeRiskLinks(owner.orgId, ownerRiskA);

    const [rows] = await sequelize.query(
      `SELECT source_risk_id, target_risk_id, organization_id FROM risk_links`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization_id: owner.orgId,
      source_risk_id: Math.min(ownerRiskA, ownerRiskB),
      target_risk_id: Math.max(ownerRiskA, ownerRiskB),
    });
    const ids = [(rows[0] as any).source_risk_id, (rows[0] as any).target_risk_id];
    expect(ids).not.toContain(attackerRisk);
  });

  it("hides the owner's links from the attacker org", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const riskA = await createTestRisk(owner.orgId, { risk_category: CATEGORY, ai_lifecycle_phase: "Deployment & integration" });
    await createTestRisk(owner.orgId, { risk_category: CATEGORY, ai_lifecycle_phase: "Deployment & integration" });
    await recomputeRiskLinks(owner.orgId, riskA);

    expect(await getRiskLinksForRiskQuery(owner.orgId, riskA, ["suggested"])).toHaveLength(1);
    expect(await getRiskLinksForRiskQuery(attacker.orgId, riskA, ["suggested"])).toHaveLength(0);

    const [rows] = await sequelize.query(`SELECT id FROM risk_links LIMIT 1`);
    const linkId = (rows as any[])[0].id;
    expect(await getRiskLinkByIdQuery(linkId, attacker.orgId)).toBeNull();
    expect(await getRiskLinkByIdQuery(linkId, owner.orgId)).not.toBeNull();
  });

  it("keeps the edge but hides it once the partner risk is soft-deleted (R7)", async () => {
    const { owner } = await seedTwoTenantContexts();
    const riskA = await createTestRisk(owner.orgId, { risk_category: CATEGORY, ai_lifecycle_phase: "Deployment & integration" });
    const riskB = await createTestRisk(owner.orgId, { risk_category: CATEGORY, ai_lifecycle_phase: "Deployment & integration" });
    await recomputeRiskLinks(owner.orgId, riskA);

    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :id`, {
      replacements: { id: riskB },
    });

    expect(await getRiskLinksForRiskQuery(owner.orgId, riskA, ["suggested"])).toHaveLength(0);
    const [rows] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM risk_links`);
    expect((rows as any[])[0].n).toBe(1);
  });

  it("is idempotent: running twice leaves exactly one row", async () => {
    const { owner } = await seedTwoTenantContexts();
    const riskA = await createTestRisk(owner.orgId, { risk_category: CATEGORY });
    const riskB = await createTestRisk(owner.orgId, { risk_category: CATEGORY });
    await recomputeRiskLinks(owner.orgId, riskA);
    await recomputeRiskLinks(owner.orgId, riskB);
    await recomputeRiskLinks(owner.orgId, riskA);

    const [rows] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM risk_links`);
    expect((rows as any[])[0].n).toBe(1);
  });
});
