jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import {
  attachRiskToEuControl,
  createTestProject,
  createTestProjectFramework,
  createTestRisk,
  linkRiskToProject,
} from "../factories";

afterEach(async () => {
  await cleanupDatabase();
});

// Mounted at /api/riskLinks (app.ts) — the route is /coverage on that router.
const COVERAGE_URL = "/api/riskLinks/coverage";

const linkCount = async (): Promise<number> => {
  const rows = (await sequelize.query(`SELECT count(*) AS count FROM risk_links`, {
    type: QueryTypes.SELECT,
  })) as { count: string }[];
  return Number(rows[0].count);
};

describe("GET /api/riskLinks/coverage", () => {
  it("lists a gap risk in gaps and omits a mapped risk", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {});
    await createTestProjectFramework(owner.orgId, project, 1);
    const gap = await createTestRisk(owner.orgId, {
      risk_name: "Unmapped risk",
      risk_owner: owner.userId,
    });
    const mapped = await createTestRisk(owner.orgId, {
      risk_name: "Mapped risk",
      risk_owner: owner.userId,
    });
    await linkRiskToProject(owner.orgId, gap, project);
    await linkRiskToProject(owner.orgId, mapped, project);
    // controls_eu__risks has no FK on control_id: the control need not exist.
    await attachRiskToEuControl(owner.orgId, mapped, 1);

    const res = await owner.request.get(COVERAGE_URL);

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({
      total_active_risks: 2,
      covered: 1,
      gap: 1,
      no_framework: 0,
    });
    expect(res.body.data.gaps.map((r: { id: number }) => r.id)).toEqual([gap]);
  });

  it("puts a risk whose project has no framework in no_framework, not gaps", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {});
    const risk = await createTestRisk(owner.orgId, {
      risk_name: "Framework-less risk",
      risk_owner: owner.userId,
    });
    await linkRiskToProject(owner.orgId, risk, project);

    const res = await owner.request.get(COVERAGE_URL);

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({
      total_active_risks: 1,
      covered: 0,
      gap: 0,
      no_framework: 1,
    });
    expect(res.body.data.gaps).toHaveLength(0);
    expect(res.body.data.no_framework.map((r: { id: number }) => r.id)).toEqual([risk]);
  });

  it("writes nothing, not even with a link row present", async () => {
    const { owner } = await seedTwoTenantContexts();
    const project = await createTestProject(owner.orgId, owner.userId, {});
    const a = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
    const b = await createTestRisk(owner.orgId, { risk_owner: owner.userId });
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
    const res = await owner.request.get(COVERAGE_URL);
    expect(res.status).toBe(200);
    expect(await linkCount()).toBe(before);
  });

  it("never returns another organization's gap risks", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectA = await createTestProject(owner.orgId, owner.userId, {});
    await createTestProjectFramework(owner.orgId, projectA, 1);
    const riskA = await createTestRisk(owner.orgId, {
      risk_name: "Org A gap",
      risk_owner: owner.userId,
    });
    await linkRiskToProject(owner.orgId, riskA, projectA);

    const projectB = await createTestProject(attacker.orgId, attacker.userId, {});
    await createTestProjectFramework(attacker.orgId, projectB, 1);
    const riskB = await createTestRisk(attacker.orgId, {
      risk_name: "Org B gap",
      risk_owner: attacker.userId,
    });
    await linkRiskToProject(attacker.orgId, riskB, projectB);

    const res = await owner.request.get(COVERAGE_URL);

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({
      total_active_risks: 1,
      gap: 1,
    });
    expect(res.body.data.gaps.map((r: { id: number }) => r.id)).toEqual([riskA]);
  });
});
