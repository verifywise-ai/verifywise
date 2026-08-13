jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { attachRiskToEuControl, createTestRisk } from "../../factories";
import { recomputeRiskLinks } from "../../../services/riskLinks/recompute";
import {
  getRiskLinksForRiskQuery,
  getRiskLinkByIdQuery,
  getStructuralNeighboursQuery,
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

  // Three controls, not one: a single element of degree 2 scores 1.26 and never
  // reaches the threshold, so a leak would leave risk_links empty either way and
  // this test could not fail. Three at degree 2 score 3.79 and do get written.
  it("never links across orgs through the same framework element id", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerRisk = await createTestRisk(owner.orgId);
    const attackerRisk = await createTestRisk(attacker.orgId);

    for (const controlId of [90001, 90002, 90003]) {
      await attachRiskToEuControl(owner.orgId, ownerRisk, controlId);
      await attachRiskToEuControl(attacker.orgId, attackerRisk, controlId);
    }

    // Assert at the query first. recompute.ts also filters merged targets to the
    // org's candidate ids (§6), and that guard alone would keep risk_links empty
    // even if this SQL leaked — so the end-to-end assertion below cannot fail on
    // an SQL mutation by itself. This line can, and is the one that pins the
    // organization filters against a real database.
    expect(await getStructuralNeighboursQuery(owner.orgId, ownerRisk)).toEqual([]);

    await recomputeRiskLinks(owner.orgId, ownerRisk);

    const [rows] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM risk_links`);
    expect((rows as any[])[0].n).toBe(0);
    expect(await getRiskLinksForRiskQuery(owner.orgId, ownerRisk, ["suggested"])).toHaveLength(0);
  });

  it("scores on this org's own element degrees, ignoring another org's volume", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const subject = await createTestRisk(owner.orgId);
    const partner = await createTestRisk(owner.orgId);
    const softDeleted = await createTestRisk(owner.orgId);
    const controls = [90010, 90011, 90012];

    for (const controlId of controls) {
      await attachRiskToEuControl(owner.orgId, subject, controlId);
      await attachRiskToEuControl(owner.orgId, partner, controlId);
      await attachRiskToEuControl(owner.orgId, softDeleted, controlId);
    }
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :id`, {
      replacements: { id: softDeleted },
    });

    // An orphan join row. `controls_eu__risks` has no FK on projects_risks_id
    // (its only FK is organization_id), so 999999 is insertable and names no risk
    // at all. It passes the arm's organization filter and is removed only by the
    // join to `risks` — dropping `is_deleted = false` does not remove it. This is
    // what makes Step 3's mutations 1 and 2 produce two different failures instead
    // of the same one twice.
    for (const controlId of controls) {
      await attachRiskToEuControl(owner.orgId, 999999, controlId);
    }

    for (let i = 0; i < 5; i++) {
      const noisy = await createTestRisk(attacker.orgId);
      for (const controlId of controls) {
        await attachRiskToEuControl(attacker.orgId, noisy, controlId);
      }
    }

    await recomputeRiskLinks(owner.orgId, subject);

    // Three elements at the owner org's own live degree of 2: 3 x 1.26 = 3.79.
    // Each mutation in Step 3 fails this differently, which is why all three are
    // worth running. Computing degrees FROM element_links counts the soft-deleted
    // risk AND the orphan row: degree 4, score 2.58, under the threshold, no row
    // at all. Dropping is_deleted = false counts only the soft-deleted risk:
    // degree 3, a row stored at 3.00. Losing both org filters lets the second
    // org's five risks in: degree 8, score 1.89, again no row.
    const [rows] = await sequelize.query(
      `SELECT source_risk_id, target_risk_id, score::float8 AS score FROM risk_links`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_risk_id: Math.min(subject, partner),
      target_risk_id: Math.max(subject, partner),
      score: 3.79,
    });
  });
});
