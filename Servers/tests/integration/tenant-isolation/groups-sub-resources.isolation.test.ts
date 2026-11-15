jest.setTimeout(60000);

import { sequelize } from "../../../database/db";
import { createTestProject } from "../../factories/test-entities.factory";
import { cleanupDatabase } from "../helpers";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import type { TenantContext } from "./tenantIsolation.harness";

/**
 * Group sub-resources (#5253): a group's members (/api/v1/groups/:id/members)
 * and the groups attached to a use case (/api/v1/groups/projects/:projectId/groups).
 * Registry entries `group_members` and `project_groups`.
 */
describe("Group members and use case groups tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  const seedGroup = async (ctx: TenantContext, name: string): Promise<number> => {
    const [rows] = await sequelize.query(
      `INSERT INTO verifywise.groups (organization_id, name, created_by)
       VALUES (:orgId, :name, :userId) RETURNING id`,
      { replacements: { orgId: ctx.orgId, name, userId: ctx.userId } },
    );
    return (rows as Array<{ id: number }>)[0].id;
  };

  const membersOf = async (groupId: number) => {
    const [rows] = await sequelize.query(
      `SELECT organization_id, user_id FROM group_members WHERE group_id = :groupId ORDER BY user_id`,
      { replacements: { groupId } },
    );
    return rows as Array<Record<string, unknown>>;
  };

  const groupsOf = async (projectId: number) => {
    const [rows] = await sequelize.query(
      `SELECT organization_id, group_id FROM project_groups WHERE project_id = :projectId ORDER BY group_id`,
      { replacements: { projectId } },
    );
    return rows as Array<Record<string, unknown>>;
  };

  it("keeps a group's members away from another organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const groupId = await seedGroup(owner, "Owner team");
    const url = `/api/v1/groups/${groupId}/members`;

    const write = await owner.request.put(url).send({ userIds: [owner.userId] });
    expect(write.status).toBe(200);
    const stored = await membersOf(groupId);
    expect(stored).toEqual([{ organization_id: owner.orgId, user_id: owner.userId }]);

    const ownerRead = await owner.request.get(url);
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body.data.length).toBe(1);

    expect((await attacker.request.get(url)).status).toBe(404);
    expect([403, 404]).toContain(
      (await attacker.request.put(url).send({ userIds: [attacker.userId] })).status,
    );
    expect([403, 404]).toContain(
      (await attacker.request.post(url).send({ userIds: [attacker.userId] })).status,
    );
    expect([403, 404]).toContain((await attacker.request.delete(`${url}/${owner.userId}`)).status);
    expect(await membersOf(groupId)).toEqual(stored);
  });

  it("cannot add another organization's user to the caller's group", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const groupId = await seedGroup(owner, "Owner team");

    const res = await owner.request
      .post(`/api/v1/groups/${groupId}/members`)
      .send({ userIds: [attacker.userId] });

    expect(res.status).toBe(400);
    expect(await membersOf(groupId)).toEqual([]);
  });

  it("keeps a use case's groups away from another organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const ownerGroup = await seedGroup(owner, "Owner team");
    const attackerGroup = await seedGroup(attacker, "Attacker team");
    const url = `/api/v1/groups/projects/${projectId}/groups`;

    const write = await owner.request.put(url).send({ groupIds: [ownerGroup] });
    expect(write.status).toBe(200);
    const stored = await groupsOf(projectId);
    expect(stored).toEqual([{ organization_id: owner.orgId, group_id: ownerGroup }]);

    const ownerRead = await owner.request.get(url);
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body.data.length).toBe(1);

    expect((await attacker.request.get(url)).status).toBe(404);
    expect([403, 404]).toContain(
      (await attacker.request.put(url).send({ groupIds: [attackerGroup] })).status,
    );
    expect(await groupsOf(projectId)).toEqual(stored);
  });

  it("cannot attach another organization's group to the caller's use case", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const projectId = await createTestProject(owner.orgId, owner.userId);
    const attackerGroup = await seedGroup(attacker, "Attacker team");

    const res = await owner.request
      .put(`/api/v1/groups/projects/${projectId}/groups`)
      .send({ groupIds: [attackerGroup] });

    expect(res.status).toBe(404);
    expect(await groupsOf(projectId)).toEqual([]);
  });
});
