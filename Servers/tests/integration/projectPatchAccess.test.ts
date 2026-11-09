jest.setTimeout(60000);

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestProject } from "../factories/test-entities.factory";

/**
 * PATCH /api/projects/:id needs more than the useCase.edit permission: the
 * caller must be able to see the use case, the rule that scopes the list.
 */

const ADMIN_ROLE_ID = 1;
const EDITOR_ROLE_ID = 3;

let counter = 0;
async function user(orgId: number, roleId: number): Promise<number> {
  counter += 1;
  return createTestUser(
    orgId,
    roleId,
    `patch-access-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
}

async function apiAs(orgId: number, userId: number, role: string) {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role },
  });
  return testRequest(app);
}

async function addMember(orgId: number, projectId: number, userId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO projects_members (organization_id, project_id, user_id)
     VALUES (:orgId, :projectId, :userId)`,
    { replacements: { orgId, projectId, userId } },
  );
}

async function row(projectId: number): Promise<{ owner: number; project_title: string }> {
  const [rows] = await sequelize.query(
    `SELECT owner, project_title FROM projects WHERE id = :projectId`,
    { replacements: { projectId } },
  );
  return (rows as any[])[0];
}

async function memberIds(projectId: number): Promise<number[]> {
  const [rows] = await sequelize.query(
    `SELECT user_id FROM projects_members WHERE project_id = :projectId ORDER BY user_id`,
    { replacements: { projectId } },
  );
  return (rows as any[]).map((r) => r.user_id);
}

describe("PATCH /api/projects/:id access", () => {
  let orgId: number;
  let ownerId: number;
  let projectId: number;

  beforeEach(async () => {
    await cleanupDatabase();
    orgId = await createTestOrganization();
    ownerId = await user(orgId, EDITOR_ROLE_ID);
    projectId = await createTestProject(orgId, ownerId);
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  it("refuses an unrelated Editor adding themselves as a member", async () => {
    const strangerId = await user(orgId, EDITOR_ROLE_ID);
    const api = await apiAs(orgId, strangerId, "Editor");

    await api
      .patch(`/api/projects/${projectId}`)
      .send({ members: [strangerId] })
      .expect(403);

    expect(await memberIds(projectId)).toEqual([]);
  });

  it("refuses an unrelated Editor taking ownership or editing fields", async () => {
    const strangerId = await user(orgId, EDITOR_ROLE_ID);
    const before = await row(projectId);
    const api = await apiAs(orgId, strangerId, "Editor");

    await api.patch(`/api/projects/${projectId}`).send({ owner: strangerId }).expect(403);
    await api.patch(`/api/projects/${projectId}`).send({ project_title: "Taken" }).expect(403);

    expect(await row(projectId)).toEqual(before);
  });

  it("lets the owner edit", async () => {
    const api = await apiAs(orgId, ownerId, "Editor");
    await api.patch(`/api/projects/${projectId}`).send({ project_title: "By owner" }).expect(202);
    expect((await row(projectId)).project_title).toBe("By owner");
  });

  it("lets a member edit", async () => {
    const memberId = await user(orgId, EDITOR_ROLE_ID);
    await addMember(orgId, projectId, memberId);
    const api = await apiAs(orgId, memberId, "Editor");
    await api.patch(`/api/projects/${projectId}`).send({ project_title: "By member" }).expect(202);
    expect((await row(projectId)).project_title).toBe("By member");
  });

  it("lets an Admin edit a use case they are not part of", async () => {
    const adminId = await user(orgId, ADMIN_ROLE_ID);
    const api = await apiAs(orgId, adminId, "Admin");
    await api.patch(`/api/projects/${projectId}`).send({ project_title: "By admin" }).expect(202);
    expect((await row(projectId)).project_title).toBe("By admin");
  });

  it("still returns 404 for a use case in another organization", async () => {
    const otherOrg = await createTestOrganization();
    const otherAdmin = await user(otherOrg, ADMIN_ROLE_ID);
    const api = await apiAs(otherOrg, otherAdmin, "Admin");
    await api.patch(`/api/projects/${projectId}`).send({ project_title: "Cross org" }).expect(404);
  });
});
