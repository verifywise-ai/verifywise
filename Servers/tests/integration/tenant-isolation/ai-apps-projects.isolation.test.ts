jest.setTimeout(60000);

import { sequelize } from "../../../database/db";
import { createTestProject } from "../../factories/test-entities.factory";
import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts, TenantContext } from "./tenantIsolation.harness";

async function aiAppIn(ctx: TenantContext, name: string): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO ai_apps (organization_id, name, owner_id, status)
     VALUES (:orgId, :name, :userId, 'approved') RETURNING id`,
    { replacements: { orgId: ctx.orgId, userId: ctx.userId, name } },
  );
  return Number((rows as any[])[0].id);
}

const projectIn = (ctx: TenantContext): Promise<number> => createTestProject(ctx.orgId, ctx.userId);

async function linkCount(appId: number): Promise<number> {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*)::int AS total FROM ai_apps_projects WHERE ai_app_id = :appId`,
    { replacements: { appId } },
  );
  return (rows as any[])[0].total;
}

describe("AI app and use case link tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("keeps each side's links and refuses the other organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const appId = await aiAppIn(owner, `App ${Date.now()}`);
    const projectId = await projectIn(owner);

    const created = await owner.request
      .post(`/api/v1/ai-apps/${appId}/use-cases`)
      .send({ project_id: projectId });
    expect(created.status).toBe(201);
    expect(await linkCount(appId)).toBe(1);

    const [row] = await sequelize.query(
      `SELECT organization_id FROM ai_apps_projects WHERE ai_app_id = :appId`,
      { replacements: { appId } },
    );
    expect((row as any[])[0].organization_id).toBe(owner.orgId);

    const ownerList = await owner.request.get(`/api/v1/ai-apps/${appId}/use-cases`);
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.data.use_cases).toHaveLength(1);

    const ownerApps = await owner.request.get(`/api/v1/projects/${projectId}/ai-apps`);
    expect(ownerApps.status).toBe(200);
    expect(ownerApps.body.data).toHaveLength(1);

    expect((await attacker.request.get(`/api/v1/ai-apps/${appId}/use-cases`)).status).toBe(404);
    expect((await attacker.request.get(`/api/v1/projects/${projectId}/ai-apps`)).status).toBe(404);
    expect((await attacker.request.get(`/api/v1/projects/${projectId}/create-ai-app`)).status).toBe(
      404,
    );

    const attackerApp = await aiAppIn(attacker, `Attacker app ${Date.now()}`);
    const attackerProject = await projectIn(attacker);
    expect(
      (
        await attacker.request
          .post(`/api/v1/ai-apps/${appId}/use-cases`)
          .send({ project_id: attackerProject })
      ).status,
    ).toBe(404);
    expect(
      (
        await attacker.request
          .post(`/api/v1/ai-apps/${attackerApp}/use-cases`)
          .send({ project_id: projectId })
      ).status,
    ).toBe(404);
    expect(
      (await attacker.request.post(`/api/v1/projects/${projectId}/create-ai-app`).send({})).status,
    ).toBe(404);
    expect(
      (await attacker.request.delete(`/api/v1/ai-apps/${appId}/use-cases/${projectId}`)).status,
    ).toBe(404);

    expect(await linkCount(appId)).toBe(1);
    expect(await linkCount(attackerApp)).toBe(0);

    const removed = await owner.request.delete(`/api/v1/ai-apps/${appId}/use-cases/${projectId}`);
    expect(removed.status).toBe(200);
    expect(await linkCount(appId)).toBe(0);
  });
});
