jest.setTimeout(120000);

/**
 * The recompute engine against a real database.
 *
 * `services/riskLinks/tests/recompute.spec.ts` mocks every query and
 * `database/db` itself, so it proves the merge/threshold/prune ARITHMETIC and
 * nothing about the SQL underneath. This is the engine that creates every
 * suggestion the feature displays, and the ON CONFLICT / partial-index
 * behaviour it depends on only exists in Postgres — so it is exercised here
 * end to end instead.
 */

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import {
  createTestRisk,
  createTestModelRisk,
  createTestProject,
  linkRiskToProject,
} from "../factories";
import {
  recomputeRiskLinks,
  LINK_SCORE_THRESHOLD,
  MAX_LINKS_PER_RISK,
} from "../../services/riskLinks/recompute";

afterEach(async () => {
  await cleanupDatabase();
});

const CATEGORY = "Cybersecurity risk";
const PHASE = "Model development & training";

const links = async (): Promise<any[]> =>
  (await sequelize.query(
    `SELECT id, source_risk_id, target_risk_id, target_model_risk_id, relation_type, status,
            source, score::float AS score, reasons, last_computed_at
       FROM risk_links ORDER BY id`,
    { type: QueryTypes.SELECT },
  )) as any[];

const setStatus = (id: number, status: string, source = "user") =>
  sequelize.query(
    `UPDATE risk_links SET status = :status, source = :source, decided_at = NOW() WHERE id = :id`,
    { replacements: { id, status, source } },
  );

describe("recomputeRiskLinks against Postgres", () => {
  it("creates a canonical related_to suggestion for a shared category", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });
    const b = await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });

    await recomputeRiskLinks(owner.orgId, a);

    const rows = await links();
    expect(rows).toHaveLength(1);
    expect(rows[0].source_risk_id).toBe(Math.min(a, b));
    expect(rows[0].target_risk_id).toBe(Math.max(a, b));
    expect(rows[0].relation_type).toBe("related_to");
    expect(rows[0].status).toBe("suggested");
    expect(rows[0].source).toBe("derived");
    expect(rows[0].score).toBe(3); // exactly the threshold
    expect(rows[0].reasons.map((r: any) => r.signal)).toEqual(["shared_category"]);
    expect(rows[0].reasons[0].detail).toBe(CATEGORY);
    expect(rows[0].last_computed_at).not.toBeNull();
  });

  it("sums overlapping signals", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, {
      risk_category: [CATEGORY],
      ai_lifecycle_phase: PHASE,
      controls_mapping: "CTRL-7",
    });
    await createTestRisk(owner.orgId, {
      risk_category: [CATEGORY],
      ai_lifecycle_phase: PHASE,
      controls_mapping: "CTRL-7",
    });

    await recomputeRiskLinks(owner.orgId, a);

    const rows = await links();
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(7); // 3 category + 2 lifecycle + 2 control
    expect(rows[0].reasons.map((r: any) => r.signal).sort()).toEqual([
      "same_lifecycle_phase",
      "shared_category",
      "shared_control",
    ]);
  });

  it("does not suggest a pair that scores below the threshold", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {});
    const a = await createTestRisk(owner.orgId, {});
    const b = await createTestRisk(owner.orgId, {});
    await linkRiskToProject(owner.orgId, a, project);
    await linkRiskToProject(owner.orgId, b, project);

    await recomputeRiskLinks(owner.orgId, a);

    // A shared project alone is worth 1.
    expect(LINK_SCORE_THRESHOLD).toBe(3);
    expect(await links()).toEqual([]);
  });

  it('treats an unmapped control (the form\'s literal "0") as nothing shared', async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, { controls_mapping: "0", assessment_mapping: "0" });
    await createTestRisk(owner.orgId, { controls_mapping: "0", assessment_mapping: "0" });

    await recomputeRiskLinks(owner.orgId, a);
    expect(await links()).toEqual([]);
  });

  it("is idempotent: a second pass refreshes rather than duplicates", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });
    await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });

    await recomputeRiskLinks(owner.orgId, a);
    const first = (await links())[0];
    await recomputeRiskLinks(owner.orgId, a);
    const second = await links();

    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first.id);
    expect(new Date(second[0].last_computed_at).getTime()).toBeGreaterThanOrEqual(
      new Date(first.last_computed_at).getTime(),
    );
  });

  it("reaches the same row from either endpoint without creating a second one", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });
    const b = await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });

    await recomputeRiskLinks(owner.orgId, a);
    await recomputeRiskLinks(owner.orgId, b);
    expect(await links()).toHaveLength(1);
  });

  it("keeps a confirmed decision, and tells the truth about its new score", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });
    await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });

    await recomputeRiskLinks(owner.orgId, a);
    const id = (await links())[0].id;
    await setStatus(id, "confirmed");

    // The overlap disappears; the human decision must not.
    await sequelize.query(`UPDATE risks SET risk_category = NULL WHERE id = :a`, {
      replacements: { a },
    });
    await recomputeRiskLinks(owner.orgId, a);

    const rows = await links();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].status).toBe("confirmed");
    expect(rows[0].source).toBe("user");
    expect(rows[0].score).toBe(0);
    expect(rows[0].reasons).toEqual([]);
  });

  it("never resurrects a dismissed suggestion, even when it still scores well", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });
    await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });

    await recomputeRiskLinks(owner.orgId, a);
    const id = (await links())[0].id;
    await setStatus(id, "dismissed");

    await recomputeRiskLinks(owner.orgId, a);
    const rows = await links();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("dismissed");
    expect(rows[0].score).toBe(3); // score refreshed, decision untouched
  });

  it("prunes a derived suggestion that fell below the threshold", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });
    await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });

    await recomputeRiskLinks(owner.orgId, a);
    expect(await links()).toHaveLength(1);

    await sequelize.query(`UPDATE risks SET risk_category = NULL WHERE id = :a`, {
      replacements: { a },
    });
    await recomputeRiskLinks(owner.orgId, a);
    expect(await links()).toEqual([]);
  });

  it("leaves a soft-deleted subject's edges alone (R7)", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });
    await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });
    await recomputeRiskLinks(owner.orgId, a);
    const before = await links();

    await sequelize.query(`UPDATE risks SET is_deleted = true WHERE id = :a`, {
      replacements: { a },
    });
    await recomputeRiskLinks(owner.orgId, a);

    expect(await links()).toEqual(before);
  });

  it("does not touch a cross-entity inheritance row", async () => {
    const { owner } = await seedTwoTenantContexts();
    const a = await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });
    await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });
    const modelRisk = await createTestModelRisk(owner.orgId, {});
    await sequelize.query(
      `INSERT INTO risk_links (organization_id, source_risk_id, target_model_risk_id,
                               relation_type, status, source, score)
       VALUES (:orgId, :a, :modelRisk, 'inherits_from', 'confirmed', 'user', 9)`,
      { replacements: { orgId: owner.orgId, a, modelRisk } },
    );

    await recomputeRiskLinks(owner.orgId, a);

    const cross = (await links()).find((r) => r.target_model_risk_id === modelRisk);
    expect(cross.status).toBe("confirmed");
    expect(cross.source).toBe("user");
    expect(cross.score).toBe(9); // untouched — recompute owns related_to only
  });

  it("never links across organizations", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const mine = await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });
    await createTestRisk(attacker.orgId, { risk_category: [CATEGORY] });

    await recomputeRiskLinks(owner.orgId, mine);
    expect(await links()).toEqual([]);
  });

  it("caps how many suggestions one pass creates", async () => {
    const { owner } = await seedTwoTenantContexts();
    const subject = await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });
    for (let i = 0; i < MAX_LINKS_PER_RISK + 5; i++) {
      await createTestRisk(owner.orgId, { risk_category: [CATEGORY] });
    }

    await recomputeRiskLinks(owner.orgId, subject);
    expect(await links()).toHaveLength(MAX_LINKS_PER_RISK);
  });

  it("is a no-op for a risk id that does not exist", async () => {
    const { owner } = await seedTwoTenantContexts();
    await expect(recomputeRiskLinks(owner.orgId, 999999)).resolves.toBeUndefined();
    expect(await links()).toEqual([]);
  });
});
