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

type Api = Awaited<ReturnType<typeof as>>;

async function newFolder(api: Api, name = `Folder ${Date.now()}-${Math.random()}`) {
  const res = await api.post("/api/virtual-folders").send({ name });
  expect(res.status).toBe(201);
  return res.body.data.id as number;
}

/** An Admin-made folder holding one file, a second file outside it, and an empty folder. */
async function seedFolders(orgId: number, adminId: number) {
  const admin = await as(orgId, adminId, "Admin");
  const folderId = await newFolder(admin);
  const emptyFolderId = await newFolder(admin);
  const filedId = await createTestFile(orgId, adminId);
  const looseId = await createTestFile(orgId, adminId);
  const filed = await admin.post(`/api/virtual-folders/${folderId}/files`).send({
    file_ids: [filedId],
  });
  expect(filed.status).toBe(200);
  return { admin, folderId, emptyFolderId, filedId, looseId };
}

/** Status of each folder action for one caller. */
async function folderActions(api: Api, seed: Awaited<ReturnType<typeof seedFolders>>) {
  const create = (await api.post("/api/virtual-folders").send({ name: `New ${Date.now()}` }))
    .status;
  const rename = (
    await api.patch(`/api/virtual-folders/${seed.folderId}`).send({ name: "Renamed" })
  ).status;
  const assign = (
    await api.post(`/api/virtual-folders/${seed.folderId}/files`).send({ file_ids: [seed.looseId] })
  ).status;
  const remove = (await api.delete(`/api/virtual-folders/${seed.folderId}/files/${seed.filedId}`))
    .status;
  const setFolders = (
    await api.patch(`/api/files/${seed.looseId}/folders`).send({ folder_ids: [seed.folderId] })
  ).status;
  const deleteEmpty = (await api.delete(`/api/virtual-folders/${seed.emptyFolderId}`)).status;
  return { create, rename, assign, remove, setFolders, deleteEmpty };
}

const policyPayload = () => ({
  title: `Folder policy ${Date.now()}`,
  content_html: "<p>Body</p>",
  status: "Draft",
  tags: ["Privacy"],
  next_review_date: "2030-01-01",
});

describe("virtual folder permissions", () => {
  it("lets a custom role with policy.edit manage folders, but not file documents", async () => {
    const { orgId, adminId, suffix } = await seedOrg();
    const role = await customRole(orgId, `Policy writer ${suffix}`, ["policy.edit"]);
    const userId = await createTestUser(orgId, 1, `pw-${suffix}@test.com`, "Password123!");
    const seed = await seedFolders(orgId, adminId);
    const api = await as(orgId, userId, role);

    expect(await folderActions(api, seed)).toEqual({
      create: 201,
      rename: 200,
      assign: 403,
      remove: 403,
      setFolders: 403,
      deleteEmpty: 200,
    });
    // Deleting a folder that holds a file would unfile it: file.edit only.
    expect((await api.delete(`/api/virtual-folders/${seed.folderId}`)).status).toBe(403);
    expect((await seed.admin.get(`/api/virtual-folders/${seed.folderId}`)).status).toBe(200);
  });

  it("lets a custom role with file.edit manage folders and file documents", async () => {
    const { orgId, adminId, suffix } = await seedOrg();
    const role = await customRole(orgId, `File clerk ${suffix}`, ["file.edit"]);
    const userId = await createTestUser(orgId, 1, `fc-${suffix}@test.com`, "Password123!");
    const seed = await seedFolders(orgId, adminId);
    const api = await as(orgId, userId, role);

    expect(await folderActions(api, seed)).toEqual({
      create: 201,
      rename: 200,
      assign: 200,
      remove: 200,
      setFolders: 200,
      deleteEmpty: 200,
    });
    expect((await api.delete(`/api/virtual-folders/${seed.folderId}`)).status).toBe(200);
  });

  it("needs policy.edit to delete a folder that holds a policy, even in a subfolder", async () => {
    const { orgId, adminId, suffix } = await seedOrg();
    const role = await customRole(orgId, `File clerk ${suffix}`, ["file.edit"]);
    const userId = await createTestUser(orgId, 1, `fc-${suffix}@test.com`, "Password123!");
    const admin = await as(orgId, adminId, "Admin");
    const parentId = await newFolder(admin);
    const child = await admin
      .post("/api/virtual-folders")
      .send({ name: `Child ${suffix}`, parent_id: parentId });
    expect(child.status).toBe(201);
    const policy = await admin.post("/api/policies").send(policyPayload());
    expect(policy.status).toBe(201);
    const filed = await admin
      .patch(`/api/policies/${policy.body.data.id}/folders`)
      .send({ folder_ids: [child.body.data.id] });
    expect(filed.status).toBe(200);

    const api = await as(orgId, userId, role);
    expect((await api.delete(`/api/virtual-folders/${parentId}`)).status).toBe(403);
    expect((await admin.delete(`/api/virtual-folders/${parentId}`)).status).toBe(200);
  });

  it("refuses a custom role with neither key", async () => {
    const { orgId, adminId, suffix } = await seedOrg();
    const role = await customRole(orgId, `Reader ${suffix}`, ["risk.read"]);
    const userId = await createTestUser(orgId, 1, `rd-${suffix}@test.com`, "Password123!");
    const seed = await seedFolders(orgId, adminId);

    const statuses = await folderActions(await as(orgId, userId, role), seed);

    expect(Object.values(statuses)).toEqual([403, 403, 403, 403, 403, 403]);
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
