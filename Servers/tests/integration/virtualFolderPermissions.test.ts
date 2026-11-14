jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestFile } from "../factories";
import { invalidateRolePermissionsCache } from "../../utils/rolePermissions.utils";
import { invalidateRoleMapCache } from "../../utils/roleMap";

afterEach(async () => {
  await cleanupDatabase();
});

const BUILTIN_ROLE_IDS = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;

async function seedOrg() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const orgId = await createTestOrganization(`Folders ${suffix}`);
  const adminId = await createTestUser(
    orgId,
    BUILTIN_ROLE_IDS.Admin,
    `folders-admin-${suffix}@test.com`,
    "Password123!",
  );
  return { orgId, adminId, suffix };
}

async function customRole(orgId: number, name: string, permissions: string[]): Promise<string> {
  const [{ id }] = await sequelize.query<{ id: number }>(
    `INSERT INTO roles (name, description, organization_id, created_at)
     VALUES (:name, 'Custom', :orgId, NOW()) RETURNING id`,
    { replacements: { name, orgId }, type: QueryTypes.SELECT },
  );
  for (const key of permissions) {
    await sequelize.query(
      `INSERT INTO role_permissions (organization_id, role_id, permission_key, allowed)
       VALUES (:orgId, :id, :key, TRUE)`,
      { replacements: { orgId, id, key } },
    );
  }
  // The role API clears both caches when it creates a role; inserting by SQL
  // has to do the same. cleanupDatabase also restarts the id sequences, so an
  // earlier test's role can share this role's ids in the permission cache.
  invalidateRoleMapCache();
  invalidateRolePermissionsCache();
  return name;
}

async function as(orgId: number, userId: number, role: string) {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role },
  });
  return testRequest(app);
}

async function folderAndFile(orgId: number, adminId: number) {
  const admin = await as(orgId, adminId, "Admin");
  const res = await admin.post("/api/virtual-folders").send({ name: `Seed ${Date.now()}` });
  expect(res.status).toBe(201);
  const fileId = await createTestFile(orgId, adminId);
  return { folderId: res.body.data.id as number, fileId };
}

/** Status of each folder action for one caller. */
async function folderActions(
  api: Awaited<ReturnType<typeof as>>,
  folderId: number,
  fileId: number,
) {
  const create = (await api.post("/api/virtual-folders").send({ name: `New ${Date.now()}` }))
    .status;
  const rename = (await api.patch(`/api/virtual-folders/${folderId}`).send({ name: "Renamed" }))
    .status;
  const assign = (
    await api.post(`/api/virtual-folders/${folderId}/files`).send({ file_ids: [fileId] })
  ).status;
  const remove = (await api.delete(`/api/virtual-folders/${folderId}/files/${fileId}`)).status;
  const setFolders = (await api.patch(`/api/files/${fileId}/folders`).send({ folder_ids: [] }))
    .status;
  return { create, rename, assign, remove, setFolders };
}

describe("virtual folder permissions", () => {
  it("lets a custom role with policy.edit manage folders, but not put files in them", async () => {
    const { orgId, adminId, suffix } = await seedOrg();
    const role = await customRole(orgId, `Policy writer ${suffix}`, ["policy.edit"]);
    const userId = await createTestUser(orgId, 1, `pw-${suffix}@test.com`, "Password123!");
    const { folderId, fileId } = await folderAndFile(orgId, adminId);

    const statuses = await folderActions(await as(orgId, userId, role), folderId, fileId);

    expect(statuses).toEqual({
      create: 201,
      rename: 200,
      assign: 403,
      remove: 403,
      setFolders: 403,
    });
  });

  it("lets a custom role with file.edit manage folders and the files in them", async () => {
    const { orgId, adminId, suffix } = await seedOrg();
    const role = await customRole(orgId, `File clerk ${suffix}`, ["file.edit"]);
    const userId = await createTestUser(orgId, 1, `fc-${suffix}@test.com`, "Password123!");
    const { folderId, fileId } = await folderAndFile(orgId, adminId);

    const statuses = await folderActions(await as(orgId, userId, role), folderId, fileId);

    expect(statuses).toEqual({
      create: 201,
      rename: 200,
      assign: 200,
      remove: 200,
      setFolders: 200,
    });
  });

  it("refuses a custom role with neither key", async () => {
    const { orgId, adminId, suffix } = await seedOrg();
    const role = await customRole(orgId, `Reader ${suffix}`, ["risk.read"]);
    const userId = await createTestUser(orgId, 1, `rd-${suffix}@test.com`, "Password123!");
    const { folderId, fileId } = await folderAndFile(orgId, adminId);

    const statuses = await folderActions(await as(orgId, userId, role), folderId, fileId);

    expect(Object.values(statuses)).toEqual([403, 403, 403, 403, 403]);
    const del = await (await as(orgId, userId, role)).delete(`/api/virtual-folders/${folderId}`);
    expect(del.status).toBe(403);
  });

  it("keeps the built-in roles as before: Admin and Editor manage, Reviewer and Auditor do not", async () => {
    const { orgId, adminId } = await seedOrg();
    for (const [role, allowed] of [
      ["Admin", true],
      ["Editor", true],
      ["Reviewer", false],
      ["Auditor", false],
    ] as const) {
      const api = await as(orgId, adminId, role);
      const res = await api.post("/api/virtual-folders").send({ name: `${role} ${Date.now()}` });
      expect([role, res.status]).toEqual([role, allowed ? 201 : 403]);
    }
  });
});
