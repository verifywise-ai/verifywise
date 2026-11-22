jest.setTimeout(60000);

// Automations would enqueue to Redis after commit; nothing here needs them.
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestIncident } from "../factories";
import { invalidateRoleMapCache } from "../../utils/roleMap";
import { invalidateRolePermissionsCache } from "../../utils/rolePermissions.utils";

const migration = require("../../database/migrations/20261122180000-grant-incident-edit-delete-to-custom-roles.js");

const ROUTE = "/api/ai-incident-managements";

async function clientFor(orgId: number, userId: number, role: string) {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role },
  });
  return testRequest(app);
}

async function stillExists(id: number): Promise<boolean> {
  const rows = await sequelize.query(`SELECT 1 FROM ai_incident_managements WHERE id = :id`, {
    replacements: { id },
    type: QueryTypes.SELECT,
  });
  return rows.length === 1;
}

async function customRole(orgId: number, name: string, keys: string[]): Promise<number> {
  const [{ id }] = await sequelize.query<{ id: number }>(
    `INSERT INTO roles (name, description, organization_id, created_at)
     VALUES (:name, 'Custom', :orgId, NOW()) RETURNING id`,
    { replacements: { name, orgId }, type: QueryTypes.SELECT },
  );
  for (const key of keys) {
    await sequelize.query(
      `INSERT INTO role_permissions (organization_id, role_id, permission_key, allowed)
       VALUES (:orgId, :id, :key, TRUE)`,
      { replacements: { orgId, id, key } },
    );
  }
  return id;
}

async function grantedKeys(orgId: number, roleId: number): Promise<string[]> {
  const rows = await sequelize.query<{ permission_key: string }>(
    `SELECT permission_key FROM role_permissions
      WHERE organization_id = :orgId AND role_id = :roleId AND allowed
      ORDER BY permission_key`,
    { replacements: { orgId, roleId }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.permission_key);
}

describe("incident edit, archive and delete permissions", () => {
  let orgId: number;
  let adminId: number;

  beforeEach(async () => {
    const suffix = Date.now();
    orgId = await createTestOrganization(`Incident perms ${suffix}`);
    adminId = await createTestUser(orgId, 1, `admin-${suffix}@test.com`, "Password123!");
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("refuses edit, archive and delete to an Auditor", async () => {
    const userId = await createTestUser(orgId, 4, `auditor-${Date.now()}@test.com`, "Password123!");
    const request = await clientFor(orgId, userId, "Auditor");
    const id = await createTestIncident(orgId, adminId);

    const edit = await request.patch(`${ROUTE}/${id}`).send({ status: "Closed" });
    const archive = await request.patch(`${ROUTE}/${id}/archive`).send({});
    const remove = await request.delete(`${ROUTE}/${id}`);

    expect([edit.status, archive.status, remove.status]).toEqual([403, 403, 403]);
    const [row] = await sequelize.query<{ status: string; archived: boolean }>(
      `SELECT status, archived FROM ai_incident_managements WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    expect(row).toEqual({ status: "Open", archived: false });
  });

  it.each([
    ["Editor", 3],
    ["Reviewer", 2],
  ])("lets a %s edit and archive but not delete", async (role, roleId) => {
    const userId = await createTestUser(
      orgId,
      roleId,
      `${role}-${Date.now()}@test.com`,
      "Password123!",
    );
    const request = await clientFor(orgId, userId, role);
    const id = await createTestIncident(orgId, adminId);

    expect((await request.patch(`${ROUTE}/${id}`).send({ status: "Investigating" })).status).toBe(
      200,
    );
    expect((await request.delete(`${ROUTE}/${id}`)).status).toBe(403);
    expect(await stillExists(id)).toBe(true);
    expect((await request.patch(`${ROUTE}/${id}/archive`).send({})).status).toBe(200);
  });

  it("lets an Admin delete", async () => {
    const request = await clientFor(orgId, adminId, "Admin");
    const id = await createTestIncident(orgId, adminId);

    expect((await request.delete(`${ROUTE}/${id}`)).status).toBe(200);
    expect(await stillExists(id)).toBe(false);
  });

  it("grants the new keys to existing custom roles the way the migration describes", async () => {
    const reporter = await customRole(orgId, "Incident reporter", ["incident.create"]);
    const orgAdmin = await customRole(orgId, "Org admin", ["organization.admin"]);
    const reader = await customRole(orgId, "Reader", ["risks.edit"]);

    await migration.up({ sequelize });
    await migration.up({ sequelize }); // idempotent
    // Roles were inserted directly, so drop the cached role list and permission sets.
    invalidateRoleMapCache();
    invalidateRolePermissionsCache();

    expect(await grantedKeys(orgId, reporter)).toEqual(["incident.create", "incident.edit"]);
    expect(await grantedKeys(orgId, orgAdmin)).toEqual([
      "incident.delete",
      "incident.edit",
      "organization.admin",
    ]);
    expect(await grantedKeys(orgId, reader)).toEqual(["risks.edit"]);

    const userId = await createTestUser(
      orgId,
      reporter,
      `reporter-${Date.now()}@test.com`,
      "Password123!",
    );
    const request = await clientFor(orgId, userId, "Incident reporter");
    const id = await createTestIncident(orgId, adminId);
    expect((await request.patch(`${ROUTE}/${id}`).send({ status: "Investigating" })).status).toBe(
      200,
    );
    expect((await request.delete(`${ROUTE}/${id}`)).status).toBe(403);
  });
});
