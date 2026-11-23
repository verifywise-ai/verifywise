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
const approveMigration = require("../../database/migrations/20261123120000-grant-incident-approve-to-custom-roles.js");

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

describe("incident edit, approve, archive and delete permissions", () => {
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

  async function memberClient(role: string, roleId: number) {
    const userId = await createTestUser(
      orgId,
      roleId,
      `${role}-${Date.now()}@test.com`,
      "Password123!",
    );
    return { userId, request: await clientFor(orgId, userId, role) };
  }

  async function storedRow(id: number) {
    const [row] = await sequelize.query<Record<string, any>>(
      `SELECT status, description, archived, approval_status, approved_by, approval_date,
              approval_notes
         FROM ai_incident_managements WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    return row;
  }

  async function displayName(userId: number): Promise<string> {
    const [row] = await sequelize.query<{ name: string; surname: string }>(
      `SELECT name, surname FROM users WHERE id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT },
    );
    return `${row.name} ${row.surname}`;
  }

  it("lets an Editor edit and archive, but not approve or delete", async () => {
    const { request } = await memberClient("Editor", 3);
    const id = await createTestIncident(orgId, adminId);

    expect((await request.patch(`${ROUTE}/${id}`).send({ status: "Investigating" })).status).toBe(
      200,
    );
    const approve = await request.patch(`${ROUTE}/${id}`).send({ approval_status: "Approved" });
    expect(approve.status).toBe(403);
    expect(approve.body.data).toBe("Your role does not allow approving or rejecting incidents.");
    expect((await request.patch(`${ROUTE}/${id}`).send({ approval_notes: "Fine" })).status).toBe(
      403,
    );
    expect(await storedRow(id)).toMatchObject({
      status: "Investigating",
      approval_status: "Pending",
      approval_notes: null,
    });

    expect((await request.delete(`${ROUTE}/${id}`)).status).toBe(403);
    expect(await stillExists(id)).toBe(true);
    expect((await request.patch(`${ROUTE}/${id}/archive`).send({})).status).toBe(200);
  });

  it("lets a Reviewer record approval, but not edit details or archive", async () => {
    const { userId, request } = await memberClient("Reviewer", 2);
    const id = await createTestIncident(orgId, adminId);

    const approve = await request
      .patch(`${ROUTE}/${id}`)
      .send({ approval_status: "Approved", approval_notes: "Signed off" });
    expect(approve.status).toBe(200);
    expect(approve.body.data).toMatchObject({
      approval_status: "Approved",
      approved_by: await displayName(userId),
      approval_notes: "Signed off",
    });

    const edit = await request.patch(`${ROUTE}/${id}`).send({ description: "Rewritten by them" });
    expect(edit.status).toBe(403);
    expect(edit.body.data).toBe("Your role does not allow editing this incident's details.");
    // The drawer's whole-form save: unchanged details do not count as edits.
    expect(
      (
        await request
          .patch(`${ROUTE}/${id}`)
          .send({ description: "Test incident description", approval_status: "Rejected" })
      ).status,
    ).toBe(200);

    expect((await request.patch(`${ROUTE}/${id}`).send({ archived: true })).status).toBe(403);
    expect((await request.patch(`${ROUTE}/${id}/archive`).send({})).status).toBe(403);
    expect((await request.delete(`${ROUTE}/${id}`)).status).toBe(403);
    expect(await storedRow(id)).toMatchObject({
      description: "Test incident description",
      archived: false,
      approval_status: "Rejected",
    });
  });

  it("sets the approver and date on the server and ignores spoofed values", async () => {
    const request = await clientFor(orgId, adminId, "Admin");
    const id = await createTestIncident(orgId, adminId);

    const res = await request.patch(`${ROUTE}/${id}`).send({
      status: "Mitigated",
      approval_status: "Approved",
      approved_by: "Somebody Else",
      approval_date: "2020-01-01",
    });
    expect(res.status).toBe(200);
    let row = await storedRow(id);
    expect(row.status).toBe("Mitigated");
    expect(row.approved_by).toBe(await displayName(adminId));
    expect(new Date(row.approval_date).getFullYear()).toBeGreaterThanOrEqual(2026);

    // Sending only a spoofed approver changes nothing.
    await request.patch(`${ROUTE}/${id}`).send({ approved_by: "Mallory" });
    expect((await storedRow(id)).approved_by).toBe(await displayName(adminId));

    // Back to Pending clears both.
    await request.patch(`${ROUTE}/${id}`).send({ approval_status: "Pending" });
    row = await storedRow(id);
    expect(row).toMatchObject({
      approval_status: "Pending",
      approved_by: null,
      approval_date: null,
    });
  });

  it("starts an Editor's new incident Pending with no approver, whatever is sent", async () => {
    const { request } = await memberClient("Editor", 3);

    const res = await request.post(ROUTE).send({
      ai_project: "Support chatbot",
      type: "Malfunction",
      severity: "Minor",
      status: "Open",
      occurred_date: "2026-06-23",
      date_detected: "2026-06-23",
      reporter: "Ada Lovelace",
      categories_of_harm: ["Safety"],
      description: "The chatbot gave unsafe advice",
      approval_status: "Approved",
      approved_by: "Somebody Else",
      approval_date: "2020-01-01",
      approval_notes: "Self-approved",
    });

    expect(res.status).toBe(201);
    expect(await storedRow(res.body.data.id)).toMatchObject({
      approval_status: "Pending",
      approved_by: null,
      approval_date: null,
      approval_notes: null,
    });
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
    const reviewerLike = await customRole(orgId, "Compliance reviewer", ["riskLinks.review"]);
    const reader = await customRole(orgId, "Reader", ["framework.audit"]);

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
    expect(await grantedKeys(orgId, reviewerLike)).toEqual(["incident.edit", "riskLinks.review"]);
    expect(await grantedKeys(orgId, reader)).toEqual(["framework.audit"]);

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

  it("grants incident.approve to every custom role holding incident.edit", async () => {
    const editorLike = await customRole(orgId, "Incident editor", ["incident.edit"]);
    const reporter = await customRole(orgId, "Incident reporter only", ["incident.create"]);
    const denied = await customRole(orgId, "Denied editor", []);
    await sequelize.query(
      `INSERT INTO role_permissions (organization_id, role_id, permission_key, allowed)
       VALUES (:orgId, :denied, 'incident.edit', FALSE)`,
      { replacements: { orgId, denied } },
    );

    await approveMigration.up({ sequelize });
    await approveMigration.up({ sequelize }); // idempotent
    invalidateRoleMapCache();
    invalidateRolePermissionsCache();

    expect(await grantedKeys(orgId, editorLike)).toEqual(["incident.approve", "incident.edit"]);
    expect(await grantedKeys(orgId, reporter)).toEqual(["incident.create"]);
    expect(await grantedKeys(orgId, denied)).toEqual([]);

    // The custom role keeps both what it could do before: edit and approve.
    const userId = await createTestUser(
      orgId,
      editorLike,
      `editor-like-${Date.now()}@test.com`,
      "Password123!",
    );
    const request = await clientFor(orgId, userId, "Incident editor");
    const id = await createTestIncident(orgId, adminId);
    expect(
      (
        await request
          .patch(`${ROUTE}/${id}`)
          .send({ status: "Investigating", approval_status: "Approved" })
      ).status,
    ).toBe(200);
  });
});
