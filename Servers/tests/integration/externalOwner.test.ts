jest.setTimeout(60000);

jest.mock("../../services/notificationService", () => ({
  notificationService: { sendEmailWithTemplate: jest.fn().mockResolvedValue(undefined) },
}));

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestProject } from "../factories/test-entities.factory";
import { createNewProjectQuery } from "../../utils/project.utils";
import { LIFECYCLE_ENTITIES, findConfirmationsDue } from "../../utils/lifecycle.utils";
import { projectVisibilitySql } from "../../utils/projectVisibility.utils";
import { notificationService } from "../../services/notificationService";

/**
 * External use case owners (#5256): the columns exist, the owner kinds stay
 * exclusive through the API, deleting a user still works, the sweep sees external
 * owners, and an external owner never matches a user's access check.
 */

const send = notificationService.sendEmailWithTemplate as unknown as jest.Mock;

let counter = 0;
async function admin(orgId: number): Promise<number> {
  counter += 1;
  return createTestUser(orgId, 1, `ext-owner-${Date.now()}-${counter}@test.com`, "Pw123456!");
}

async function ownerRow(id: number): Promise<Record<string, any>> {
  const [rows] = await sequelize.query(
    `SELECT owner, external_owner_name, external_owner_email FROM projects WHERE id = :id`,
    { replacements: { id } },
  );
  return (rows as any[])[0];
}

async function apiAs(orgId: number, userId: number) {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role: "Admin" },
  });
  return testRequest(app);
}

/** The notice is fire-and-forget after the response: wait for it to land. */
async function waitForSends(count: number): Promise<void> {
  for (let i = 0; i < 40 && send.mock.calls.length < count; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function createExternal(orgId: number, userId: number): Promise<number> {
  const created = await sequelize.transaction((transaction) =>
    createNewProjectQuery(
      {
        project_title: "External use case",
        external_owner_name: "Ada Lovelace",
        external_owner_email: "ADA@Example.com",
        start_date: new Date(),
        geography: 1,
      } as any,
      [],
      [],
      orgId,
      userId,
      transaction,
    ),
  );
  return created.id!;
}

describe("external use case owners", () => {
  afterEach(async () => {
    await cleanupDatabase();
    send.mockClear();
  });

  it("stores an external owner with no user owner and a lowercased email", async () => {
    const orgId = await createTestOrganization();
    const adminId = await admin(orgId);
    const projectId = await createExternal(orgId, adminId);

    expect(await ownerRow(projectId)).toEqual({
      owner: null,
      external_owner_name: "Ada Lovelace",
      external_owner_email: "ada@example.com",
    });
  });

  it("clears the other kind of owner on update, in both directions", async () => {
    const orgId = await createTestOrganization();
    const adminId = await admin(orgId);
    const projectId = await createTestProject(orgId, adminId);
    const api = await apiAs(orgId, adminId);

    await api
      .patch(`/api/projects/${projectId}`)
      .send({ external_owner_name: "Ada", external_owner_email: "ada@example.com" })
      .expect(202);
    expect(await ownerRow(projectId)).toEqual({
      owner: null,
      external_owner_name: "Ada",
      external_owner_email: "ada@example.com",
    });

    await api.patch(`/api/projects/${projectId}`).send({ owner: adminId }).expect(202);
    expect(await ownerRow(projectId)).toEqual({
      owner: adminId,
      external_owner_name: null,
      external_owner_email: null,
    });
  });

  it("emails a newly named external owner once, not again for the same person", async () => {
    const orgId = await createTestOrganization();
    const adminId = await admin(orgId);
    const projectId = await createTestProject(orgId, adminId);
    const api = await apiAs(orgId, adminId);

    await api
      .patch(`/api/projects/${projectId}`)
      .send({ external_owner_name: "Ada", external_owner_email: "ada@example.com" })
      .expect(202);
    await waitForSends(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe("ada@example.com");

    await api
      .patch(`/api/projects/${projectId}`)
      .send({ external_owner_name: "Ada L.", external_owner_email: "ADA@example.com" })
      .expect(202);
    // Give a wrongly fired notice the time it would need to arrive.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("refuses an update that would leave no owner, and one naming both", async () => {
    const orgId = await createTestOrganization();
    const adminId = await admin(orgId);
    const projectId = await createExternal(orgId, adminId);
    const api = await apiAs(orgId, adminId);

    await api
      .patch(`/api/projects/${projectId}`)
      .send({ external_owner_name: null, external_owner_email: null })
      .expect(400);
    await api
      .patch(`/api/projects/${projectId}`)
      .send({ owner: adminId, external_owner_name: "B", external_owner_email: "b@example.com" })
      .expect(400);
    expect((await ownerRow(projectId)).external_owner_email).toBe("ada@example.com");
  });

  it("does not block deleting a user who owned a use case", async () => {
    const orgId = await createTestOrganization();
    const adminId = await admin(orgId);
    const ownerId = await admin(orgId);
    const projectId = await createTestProject(orgId, ownerId);

    await sequelize.query(`DELETE FROM users WHERE id = :id`, { replacements: { id: ownerId } });

    const row = await ownerRow(projectId);
    expect(row.owner).toBeNull();
    expect(row.external_owner_email).toBeNull();
    expect(adminId).toBeGreaterThan(0);
  });

  it("includes externally owned entries in the still-live sweep with a contact", async () => {
    const orgId = await createTestOrganization();
    const adminId = await admin(orgId);
    const projectId = await createExternal(orgId, adminId);
    await sequelize.query(
      `UPDATE projects
          SET lifecycle_stage = 'live', go_live_date = CURRENT_DATE - 100, last_updated_by = :adminId
        WHERE id = :id`,
      { replacements: { id: projectId, adminId } },
    );

    const due = await findConfirmationsDue(LIFECYCLE_ENTITIES.use_case, orgId, 90);

    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      owner: null,
      external_owner_name: "Ada Lovelace",
      external_owner_email: "ada@example.com",
    });
    expect(Number(due[0].contact_user_id)).toBe(adminId);
  });

  it("never lets an external owner match a user's visibility check", async () => {
    const orgId = await createTestOrganization();
    const adminId = await admin(orgId);
    const reviewerId = await createTestUser(
      orgId,
      2,
      `ext-owner-rev-${Date.now()}@test.com`,
      "Pw123456!",
    );
    const projectId = await createExternal(orgId, adminId);

    const visibility = projectVisibilitySql("p", { userId: reviewerId, role: "Reviewer" });
    const [rows] = await sequelize.query(
      `SELECT p.id FROM projects p WHERE p.organization_id = :organizationId${visibility.sql}`,
      { replacements: { organizationId: orgId, ...visibility.replacements } },
    );

    expect((rows as any[]).map((r) => r.id)).not.toContain(projectId);
  });
});
