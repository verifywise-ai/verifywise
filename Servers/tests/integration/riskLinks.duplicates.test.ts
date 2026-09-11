jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import {
  createTestProject,
  createTestRisk,
  linkRiskToProject,
} from "../factories";

afterEach(async () => {
  await cleanupDatabase();
});

// Mounted at /api/riskLinks (app.ts) — the route is /duplicates on that router.
const DUPLICATES_URL = "/api/riskLinks/duplicates";

const OPERATIONAL = ["Operational risk"];

const duplicateA = (orgId: number, owner: number) =>
  createTestRisk(orgId, {
    risk_name: "Vendor assessment overdue",
    risk_description:
      "Vendor security assessments stay incomplete past the review deadline for production data.",
    risk_category: OPERATIONAL,
    risk_owner: owner,
  });

const duplicateB = (orgId: number, owner: number) =>
  createTestRisk(orgId, {
    risk_name: "Late vendor security review",
    risk_description:
      "Production data vendor reviews miss the assessment deadline and remain incomplete.",
    risk_category: OPERATIONAL,
    risk_owner: owner,
  });

const linkCount = async (): Promise<number> => {
  const rows = (await sequelize.query(`SELECT count(*) AS count FROM risk_links`, {
    type: QueryTypes.SELECT,
  })) as { count: string }[];
  return Number(rows[0].count);
};

describe("GET /api/riskLinks/duplicates", () => {
  it("returns a seeded duplicate pair", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {});
    const a = await duplicateA(owner.orgId, owner.userId);
    const b = await duplicateB(owner.orgId, owner.userId);
    await linkRiskToProject(owner.orgId, a, project);
    await linkRiskToProject(owner.orgId, b, project);

    const res = await owner.request.get(DUPLICATES_URL);

    expect(res.status).toBe(200);
    // 9 shared of 19 union = 0.47.
    expect(res.body.data.candidates).toEqual([
      expect.objectContaining({
        risk_a: expect.objectContaining({ id: Math.min(a, b) }),
        risk_b: expect.objectContaining({ id: Math.max(a, b) }),
        similarity: 0.47,
      }),
    ]);
  });

  it("omits a non-duplicate pair sharing category and project", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {});
    const a = await duplicateA(owner.orgId, owner.userId);
    const d = await createTestRisk(owner.orgId, {
      risk_name: "On-call rota gaps",
      risk_description: "Night shifts lack coverage when engineers swap rotations informally.",
      risk_category: OPERATIONAL,
      risk_owner: owner.userId,
    });
    await linkRiskToProject(owner.orgId, a, project);
    await linkRiskToProject(owner.orgId, d, project);

    const res = await owner.request.get(DUPLICATES_URL);

    expect(res.status).toBe(200);
    expect(res.body.data.scanned).toBe(2);
    expect(res.body.data.candidates).toHaveLength(0);
  });

  it("writes nothing, not even with a link row present", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {});
    const a = await createTestRisk(owner.orgId, {
      risk_name: "Vendor assessment overdue",
      risk_category: ["Compliance risk"],
      risk_owner: owner.userId,
    });
    const b = await createTestRisk(owner.orgId, {
      risk_name: "Late vendor security review",
      risk_category: ["Data privacy risk"],
      risk_owner: owner.userId,
    });
    await linkRiskToProject(owner.orgId, a, project);
    await linkRiskToProject(owner.orgId, b, project);
    // The one deliberate risk_links seed in this feature's diff: without a
    // pre-existing row, `0 === 0` would prove only that the table was empty.
    // risk_links_canonical demands source < target for related_to.
    const [s, t] = a < b ? [a, b] : [b, a];
    await sequelize.query(
      `INSERT INTO risk_links
         (organization_id, source_risk_id, target_risk_id, relation_type, status, source)
       VALUES (:orgId, :s, :t, 'related_to', 'confirmed', 'user')`,
      { replacements: { orgId: owner.orgId, s, t } },
    );

    const before = await linkCount();
    expect(before).toBe(1);
    const res = await owner.request.get(DUPLICATES_URL);
    expect(res.status).toBe(200);
    expect(await linkCount()).toBe(before);
  });

  it("never returns another organization's duplicate pair", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectA = await createTestProject(owner.orgId, owner.userId, {});
    const aA = await duplicateA(owner.orgId, owner.userId);
    const bA = await duplicateB(owner.orgId, owner.userId);
    await linkRiskToProject(owner.orgId, aA, projectA);
    await linkRiskToProject(owner.orgId, bA, projectA);

    const projectB = await createTestProject(attacker.orgId, attacker.userId, {});
    const aB = await duplicateA(attacker.orgId, attacker.userId);
    const bB = await duplicateB(attacker.orgId, attacker.userId);
    await linkRiskToProject(attacker.orgId, aB, projectB);
    await linkRiskToProject(attacker.orgId, bB, projectB);

    const res = await owner.request.get(DUPLICATES_URL);

    expect(res.status).toBe(200);
    expect(res.body.data.candidates).toHaveLength(1);
    const ids = [
      res.body.data.candidates[0].risk_a.id,
      res.body.data.candidates[0].risk_b.id,
    ];
    expect(new Set(ids)).toEqual(new Set([aA, bA]));
  });
});
