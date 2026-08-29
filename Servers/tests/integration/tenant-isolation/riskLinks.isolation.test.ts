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
  getLiveRiskIdsQuery,
  createUserRiskLinkQuery,
  riskLinkPairExistsQuery,
  getRelatedPairsQuery,
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

  it("reads related_to pairs only from the caller's own org, and only live ones", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const riskA = await createTestRisk(owner.orgId, { risk_category: CATEGORY });
    const riskB = await createTestRisk(owner.orgId, { risk_category: CATEGORY });
    const riskC = await createTestRisk(owner.orgId, { risk_category: CATEGORY });
    const deleted = await createTestRisk(owner.orgId, { risk_category: CATEGORY });
    const attackerA = await createTestRisk(attacker.orgId, { risk_category: CATEGORY });
    const attackerB = await createTestRisk(attacker.orgId, { risk_category: CATEGORY });

    const insert = async (
      orgId: number,
      source: number,
      target: number,
      status: string,
    ) => {
      await sequelize.query(
        `INSERT INTO risk_links (organization_id, source_risk_id, target_risk_id,
                                 relation_type, status, source, created_at)
         VALUES (:orgId, :source, :target, 'related_to', :status, 'derived', NOW())`,
        { replacements: { orgId, source, target, status } },
      );
    };

    await insert(owner.orgId, Math.min(riskA, riskB), Math.max(riskA, riskB), "suggested");
    await insert(owner.orgId, Math.min(riskB, riskC), Math.max(riskB, riskC), "confirmed");
    // Dismissed says these two are NOT related; letting it through would pull
    // two clusters into one and hand the model a group the user rejected.
    await insert(owner.orgId, Math.min(riskA, riskC), Math.max(riskA, riskC), "dismissed");
    // A live edge whose partner is gone. The pair would otherwise reach the
    // prompt as an id with no risk row behind it.
    await insert(owner.orgId, Math.min(riskA, deleted), Math.max(riskA, deleted), "suggested");
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :id`, {
      replacements: { id: deleted },
    });
    await insert(
      attacker.orgId,
      Math.min(attackerA, attackerB),
      Math.max(attackerA, attackerB),
      "confirmed",
    );

    const pairs = await getRelatedPairsQuery(owner.orgId);

    expect(pairs).toHaveLength(2);
    const flat = pairs.flatMap((pair: { a: number; b: number }) => [pair.a, pair.b]);
    expect(flat).not.toContain(attackerA);
    expect(flat).not.toContain(attackerB);
    expect(flat).not.toContain(deleted);
    expect(new Set(flat)).toEqual(new Set([riskA, riskB, riskC]));
  });
});

describe("manual risk links respect the tenant boundary", () => {
  it("does not treat another org's live risk as linkable", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const ownerRisk = await createTestRisk(owner.orgId);
    // A real row in the other org. A fabricated id would prove nothing: the FK on
    // target_risk_id rejects it with or without the organization_id clause, so the
    // test would pass against a query that has no tenant scoping at all.
    const attackerRisk = await createTestRisk(attacker.orgId);

    const live = await getLiveRiskIdsQuery([ownerRisk, attackerRisk], owner.orgId);

    expect(live).toEqual([ownerRisk]);
  });

  it("does not treat this org's soft-deleted risk as linkable", async () => {
    const { owner } = await seedTwoTenantContexts();
    const ownerRisk = await createTestRisk(owner.orgId);
    const deletedRisk = await createTestRisk(owner.orgId);
    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :id`, {
      replacements: { id: deletedRisk },
    });

    const live = await getLiveRiskIdsQuery([ownerRisk, deletedRisk], owner.orgId);

    expect(live).toEqual([ownerRisk]);
  });

  it("stores a manual link as confirmed/user and refuses the pair twice", async () => {
    const { owner } = await seedTwoTenantContexts();
    const riskA = await createTestRisk(owner.orgId);
    const riskB = await createTestRisk(owner.orgId);
    const input = {
      organizationId: owner.orgId,
      sourceRiskId: Math.min(riskA, riskB),
      targetRiskId: Math.max(riskA, riskB),
      relationType: "related_to" as const,
      userId: owner.userId,
    };

    const id = await createUserRiskLinkQuery(input);
    expect(id).not.toBeNull();
    expect(await createUserRiskLinkQuery(input)).toBeNull();

    const [rows] = await sequelize.query(
      `SELECT status, source, score::float8 AS score, decided_at FROM risk_links WHERE id = :id`,
      { replacements: { id } },
    );
    expect(rows[0]).toMatchObject({ status: "confirmed", source: "user", score: 0 });
    expect((rows[0] as any).decided_at).not.toBeNull();
  });

  it("keeps both directions of inherits_from distinguishable", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const child = await createTestRisk(owner.orgId);
    const parent = await createTestRisk(owner.orgId);

    // Deliberately non-canonical order — the CHECK constraint exempts
    // inherits_from, so the database must accept it exactly as given.
    await createUserRiskLinkQuery({
      organizationId: owner.orgId,
      sourceRiskId: Math.max(child, parent),
      targetRiskId: Math.min(child, parent),
      relationType: "inherits_from",
      userId: owner.userId,
    });

    expect(
      await riskLinkPairExistsQuery(
        owner.orgId,
        Math.max(child, parent),
        Math.min(child, parent),
        "inherits_from",
      ),
    ).toBe(true);
    expect(
      await riskLinkPairExistsQuery(
        owner.orgId,
        Math.min(child, parent),
        Math.max(child, parent),
        "inherits_from",
      ),
    ).toBe(false);

    // The controller's two-cycle refusal routes through this query. Unscoped, it
    // would answer "yes" for another org's pair — a 409 on a link the caller may
    // legitimately make, which also discloses that the other org has it linked.
    expect(
      await riskLinkPairExistsQuery(
        attacker.orgId,
        Math.max(child, parent),
        Math.min(child, parent),
        "inherits_from",
      ),
    ).toBe(false);
  });
});
