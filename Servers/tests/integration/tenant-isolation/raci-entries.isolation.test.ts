jest.setTimeout(60000);

import { sequelize } from "../../../database/db";
import { createTestProject } from "../../factories/test-entities.factory";
import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";

describe("RACI entries tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  const entries = async (projectId: number) => {
    const [rows] = await sequelize.query(
      `SELECT organization_id, user_id, raci_role, state FROM raci_entries
        WHERE project_id = :projectId ORDER BY raci_role`,
      { replacements: { projectId } },
    );
    return rows as Array<Record<string, unknown>>;
  };

  it("keeps one organization's RACI matrix away from another", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const url = `/api/v1/projects/${projectId}/raci`;

    const write = await owner.request
      .put(`${url}/users/${owner.userId}`)
      .send({ roles: ["A", "C"] });
    expect(write.status).toBe(200);
    const stored = await entries(projectId);
    expect(stored).toEqual([
      { organization_id: owner.orgId, user_id: owner.userId, raci_role: "C", state: "assigned" },
    ]);

    const ownerRead = await owner.request.get(url);
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body.data.rows.length).toBeGreaterThan(0);

    const attackerRead = await attacker.request.get(url);
    expect(attackerRead.status).toBe(404);

    const attackerWrite = await attacker.request
      .put(`${url}/users/${owner.userId}`)
      .send({ roles: [] });
    expect(attackerWrite.status).toBe(404);
    expect(await entries(projectId)).toEqual(stored);
  });

  it("cannot give another organization's user a role on the caller's use case", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);

    const res = await owner.request
      .put(`/api/v1/projects/${projectId}/raci/users/${attacker.userId}`)
      .send({ roles: ["R"] });

    expect(res.status).toBe(404);
    expect(await entries(projectId)).toEqual([]);
  });
});
