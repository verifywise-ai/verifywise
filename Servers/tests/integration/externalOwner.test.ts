jest.setTimeout(60000);

jest.mock("../../services/notificationService", () => ({
  notificationService: { sendEmailWithTemplate: jest.fn().mockResolvedValue(undefined) },
}));

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestProject } from "../factories/test-entities.factory";
import { createNewProjectQuery, resolveProjectOwnerName } from "../../utils/project.utils";
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

async function apiAs(orgId: number, userId: number, role: string = "Admin") {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role },
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
      .patch(`/api/v1/projects/${projectId}`)
      .send({ external_owner_name: "Ada", external_owner_email: "ada@example.com" })
      .expect(202);
    expect(await ownerRow(projectId)).toEqual({
      owner: null,
      external_owner_name: "Ada",
      external_owner_email: "ada@example.com",
    });

    await api.patch(`/api/v1/projects/${projectId}`).send({ owner: adminId }).expect(202);
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
      .patch(`/api/v1/projects/${projectId}`)
      .send({ external_owner_name: "Ada", external_owner_email: "ada@example.com" })
      .expect(202);
    await waitForSends(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe("ada@example.com");

    await api
      .patch(`/api/v1/projects/${projectId}`)
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
      .patch(`/api/v1/projects/${projectId}`)
      .send({ external_owner_name: null, external_owner_email: null })
      .expect(400);
    await api
      .patch(`/api/v1/projects/${projectId}`)
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

  describe("/api/v1/projects router", () => {
    const body = {
      project_title: "Vendor bot",
      start_date: "2026-01-01T00:00:00.000Z",
      external_owner_name: "Ada Lovelace",
      external_owner_email: "ADA@Example.com",
    };

    it("requires authentication", async () => {
      const app = await createTestApp();
      const noToken = await testRequest(app).post("/api/v1/projects").send(body);
      expect([400, 401]).toContain(noToken.status);
      const badToken = await testRequest(app)
        .patch("/api/v1/projects/1")
        .set("Authorization", "Bearer not-a-real-token")
        .send({ owner: 1 });
      expect([400, 401]).toContain(badToken.status);
    });

    it("denies a role without useCase.edit", async () => {
      const orgId = await createTestOrganization();
      const userId = await admin(orgId);
      const api = await apiAs(orgId, userId, "Auditor");
      await api.post("/api/v1/projects").send(body).expect(403);
      await api.patch("/api/v1/projects/1").send({ owner: userId }).expect(403);
    });

    it("never updates another organization's use case", async () => {
      const orgA = await createTestOrganization();
      const orgB = await createTestOrganization();
      const adminA = await admin(orgA);
      const adminB = await admin(orgB);
      const projectA = await createTestProject(orgA, adminA);
      const api = await apiAs(orgB, adminB);

      await api
        .patch(`/api/v1/projects/${projectA}`)
        .send({ external_owner_name: "Eve", external_owner_email: "eve@example.com" })
        .expect(404);
      expect(await ownerRow(projectA)).toEqual({
        owner: adminA,
        external_owner_name: null,
        external_owner_email: null,
      });
    });

    it("creates with an external owner", async () => {
      const orgId = await createTestOrganization();
      const adminId = await admin(orgId);
      const api = await apiAs(orgId, adminId);

      const res = await api.post("/api/v1/projects").send(body).expect(201);

      expect(await ownerRow(res.body.data.project.id)).toEqual({
        owner: null,
        external_owner_name: "Ada Lovelace",
        external_owner_email: "ada@example.com",
      });
    });

    it("rejects a create with whitespace for both owner kinds", async () => {
      const orgId = await createTestOrganization();
      const adminId = await admin(orgId);
      const api = await apiAs(orgId, adminId);
      await api
        .post("/api/v1/projects")
        .send({ ...body, external_owner_name: " ", external_owner_email: " " })
        .expect(400);
    });

    it("treats owner: null as a no-op on a row with no user owner", async () => {
      const orgId = await createTestOrganization();
      const adminId = await admin(orgId);
      const goneId = await admin(orgId);
      const orphan = await createTestProject(orgId, goneId);
      await sequelize.query(`DELETE FROM users WHERE id = :id`, { replacements: { id: goneId } });
      const external = await createExternal(orgId, adminId);
      const api = await apiAs(orgId, adminId);

      await api.patch(`/api/v1/projects/${orphan}`).send({ owner: null }).expect(202);
      await api.patch(`/api/v1/projects/${external}`).send({ owner: null }).expect(202);
      expect((await ownerRow(external)).external_owner_email).toBe("ada@example.com");
    });
  });

  describe("legacy /api/projects parity", () => {
    it("ignores external owner fields on create and keeps owner required", async () => {
      const orgId = await createTestOrganization();
      const adminId = await admin(orgId);
      const api = await apiAs(orgId, adminId);
      const body = {
        project_title: "Legacy",
        start_date: "2026-01-01T00:00:00.000Z",
        external_owner_name: "Ada",
        external_owner_email: "ada@example.com",
      };

      await api.post("/api/projects").send(body).expect(400);

      const res = await api
        .post("/api/projects")
        .send({ ...body, owner: adminId })
        .expect(201);
      expect(await ownerRow(res.body.data.project.id)).toEqual({
        owner: adminId,
        external_owner_name: null,
        external_owner_email: null,
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(send).not.toHaveBeenCalled();
    });

    it("ignores external owner fields on update", async () => {
      const orgId = await createTestOrganization();
      const adminId = await admin(orgId);
      const projectId = await createTestProject(orgId, adminId);
      const api = await apiAs(orgId, adminId);

      await api
        .patch(`/api/projects/${projectId}`)
        .send({ external_owner_name: "Ada", external_owner_email: "ada@example.com" })
        .expect(202);
      expect(await ownerRow(projectId)).toEqual({
        owner: adminId,
        external_owner_name: null,
        external_owner_email: null,
      });
    });

    it("still clears the owner with owner: null", async () => {
      const orgId = await createTestOrganization();
      const adminId = await admin(orgId);
      const projectId = await createTestProject(orgId, adminId);
      const api = await apiAs(orgId, adminId);

      await api.patch(`/api/projects/${projectId}`).send({ owner: null }).expect(202);
      expect((await ownerRow(projectId)).owner).toBeNull();
    });

    it("clears the external fields when a numeric owner is set", async () => {
      const orgId = await createTestOrganization();
      const adminId = await admin(orgId);
      const projectId = await createExternal(orgId, adminId);
      const api = await apiAs(orgId, adminId);

      await api.patch(`/api/projects/${projectId}`).send({ owner: adminId }).expect(202);
      expect(await ownerRow(projectId)).toEqual({
        owner: adminId,
        external_owner_name: null,
        external_owner_email: null,
      });
    });
  });

  describe("access for the person naming an external owner", () => {
    const isMember = async (projectId: number, userId: number, orgId: number) => {
      const [rows] = await sequelize.query(
        `SELECT 1 FROM projects_members
          WHERE project_id = :projectId AND user_id = :userId AND organization_id = :orgId`,
        { replacements: { projectId, userId, orgId } },
      );
      return (rows as unknown[]).length === 1;
    };
    const external = { external_owner_name: "Ada", external_owner_email: "ada@example.com" };

    it("keeps a non-Admin who creates one with an external owner", async () => {
      const orgId = await createTestOrganization();
      const editorId = await createTestUser(orgId, 3, `ext-ed-${Date.now()}@test.com`, "Pw123456!");
      const api = await apiAs(orgId, editorId, "Editor");

      const res = await api
        .post("/api/v1/projects")
        .send({ project_title: "P", start_date: "2026-01-01T00:00:00.000Z", ...external })
        .expect(201);

      expect(await isMember(res.body.data.project.id, editorId, orgId)).toBe(true);
      expect(res.body.data.project.members).toContain(editorId);
    });

    it("keeps a non-Admin owner who hands the use case over, without a self email", async () => {
      const orgId = await createTestOrganization();
      const editorId = await createTestUser(orgId, 3, `ext-ow-${Date.now()}@test.com`, "Pw123456!");
      const projectId = await createTestProject(orgId, editorId);
      const api = await apiAs(orgId, editorId, "Editor");

      const res = await api.patch(`/api/v1/projects/${projectId}`).send(external).expect(202);

      expect(await isMember(projectId, editorId, orgId)).toBe(true);
      expect(res.body.data.members).toContain(editorId);
      await waitForSends(1);
      expect(send.mock.calls.map((call) => call[0])).toEqual(["ada@example.com"]);
    });

    it("is idempotent for someone already on the team", async () => {
      const orgId = await createTestOrganization();
      const editorId = await createTestUser(orgId, 3, `ext-id-${Date.now()}@test.com`, "Pw123456!");
      const projectId = await createTestProject(orgId, editorId);
      await sequelize.query(
        `INSERT INTO projects_members (organization_id, project_id, user_id)
         VALUES (:orgId, :projectId, :editorId)`,
        { replacements: { orgId, projectId, editorId } },
      );
      const api = await apiAs(orgId, editorId, "Editor");

      await api.patch(`/api/v1/projects/${projectId}`).send(external).expect(202);
      expect(await isMember(projectId, editorId, orgId)).toBe(true);
    });

    it("does not add an Admin, who keeps access by role", async () => {
      const orgId = await createTestOrganization();
      const adminId = await admin(orgId);
      const projectId = await createTestProject(orgId, adminId);
      const api = await apiAs(orgId, adminId);

      await api.patch(`/api/v1/projects/${projectId}`).send(external).expect(202);
      expect(await isMember(projectId, adminId, orgId)).toBe(false);
    });
  });

  describe("who may change the external owner on v1", () => {
    const external = { external_owner_name: "Eve", external_owner_email: "eve@example.com" };
    let n = 0;
    const editor = async (orgId: number) => {
      n += 1;
      return createTestUser(orgId, 3, `ext-authz-${Date.now()}-${n}@test.com`, "Pw123456!");
    };
    const addMember = (orgId: number, projectId: number, userId: number) =>
      sequelize.query(
        `INSERT INTO projects_members (organization_id, project_id, user_id)
         VALUES (:orgId, :projectId, :userId)`,
        { replacements: { orgId, projectId, userId } },
      );

    it("denies an Editor with no relationship to the use case: no write, no email", async () => {
      const orgId = await createTestOrganization();
      const ownerId = await editor(orgId);
      const projectId = await createTestProject(orgId, ownerId);
      const stranger = await editor(orgId);
      const api = await apiAs(orgId, stranger, "Editor");

      await api.patch(`/api/v1/projects/${projectId}`).send(external).expect(403);

      expect(await ownerRow(projectId)).toEqual({
        owner: ownerId,
        external_owner_name: null,
        external_owner_email: null,
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(send).not.toHaveBeenCalled();
    });

    it("denies that Editor clearing or replacing an external owner too", async () => {
      const orgId = await createTestOrganization();
      const adminId = await admin(orgId);
      const projectId = await createExternal(orgId, adminId);
      const stranger = await editor(orgId);
      const api = await apiAs(orgId, stranger, "Editor");

      await api.patch(`/api/v1/projects/${projectId}`).send({ owner: stranger }).expect(403);
      await api.patch(`/api/v1/projects/${projectId}`).send(external).expect(403);
      expect((await ownerRow(projectId)).external_owner_email).toBe("ada@example.com");
    });

    it("still lets that Editor make edits that do not touch the external owner", async () => {
      const orgId = await createTestOrganization();
      const ownerId = await editor(orgId);
      const projectId = await createTestProject(orgId, ownerId);
      const stranger = await editor(orgId);
      const api = await apiAs(orgId, stranger, "Editor");

      await api
        .patch(`/api/v1/projects/${projectId}`)
        .send({ goal: "Updated", external_owner_name: null, external_owner_email: null })
        .expect(202);
    });

    it("allows the owner, a member and an Admin", async () => {
      const orgId = await createTestOrganization();
      const ownerId = await editor(orgId);
      const memberId = await editor(orgId);
      const adminId = await admin(orgId);

      for (const [actor, role] of [
        [ownerId, "Editor"],
        [memberId, "Editor"],
        [adminId, "Admin"],
      ] as const) {
        const projectId = await createTestProject(orgId, ownerId);
        await addMember(orgId, projectId, memberId);
        const api = await apiAs(orgId, actor, role);
        await api.patch(`/api/v1/projects/${projectId}`).send(external).expect(202);
        expect((await ownerRow(projectId)).external_owner_email).toBe("eve@example.com");
      }
    });

    it("does not gate the legacy route", async () => {
      const orgId = await createTestOrganization();
      const ownerId = await editor(orgId);
      const projectId = await createTestProject(orgId, ownerId);
      const stranger = await editor(orgId);
      const api = await apiAs(orgId, stranger, "Editor");

      await api.patch(`/api/projects/${projectId}`).send({ owner: stranger }).expect(202);
      expect((await ownerRow(projectId)).owner).toBe(stranger);
    });
  });

  describe("the previous owner keeps access", () => {
    const external = { external_owner_name: "Ada", external_owner_email: "ada@example.com" };
    const canSee = async (orgId: number, userId: number, projectId: number) => {
      const visibility = projectVisibilitySql("p", { userId, role: "Editor" });
      const [rows] = await sequelize.query(
        `SELECT p.id FROM projects p
          WHERE p.organization_id = :organizationId AND p.id = :projectId${visibility.sql}`,
        { replacements: { organizationId: orgId, projectId, ...visibility.replacements } },
      );
      return (rows as unknown[]).length === 1;
    };

    it("keeps a non-Admin owner when an Admin hands their use case over", async () => {
      const orgId = await createTestOrganization();
      const adminId = await admin(orgId);
      const editorId = await createTestUser(
        orgId,
        3,
        `ext-prev-${Date.now()}@test.com`,
        "Pw123456!",
      );
      const projectId = await createTestProject(orgId, editorId);
      const api = await apiAs(orgId, adminId);

      const res = await api.patch(`/api/v1/projects/${projectId}`).send(external).expect(202);

      expect(await canSee(orgId, editorId, projectId)).toBe(true);
      expect(res.body.data.members).toContain(editorId);
      await waitForSends(1);
      expect(send.mock.calls.map((call) => call[0])).toEqual(["ada@example.com"]);
    });

    it("does not add a previous owner who is an Admin", async () => {
      const orgId = await createTestOrganization();
      const adminId = await admin(orgId);
      const otherAdmin = await admin(orgId);
      const projectId = await createTestProject(orgId, otherAdmin);
      const api = await apiAs(orgId, adminId);

      const res = await api.patch(`/api/v1/projects/${projectId}`).send(external).expect(202);

      expect(res.body.data.members).not.toContain(otherAdmin);
    });
  });

  describe("resolveProjectOwnerName", () => {
    const withSurname = async (surname: string | null) => {
      const orgId = await createTestOrganization();
      const userId = await admin(orgId);
      await sequelize.query(
        `UPDATE users SET name = 'Ada', surname = :surname WHERE id = :userId`,
        {
          replacements: { surname, userId },
        },
      );
      return userId;
    };

    it("shows only the name for a null or empty surname", async () => {
      const nullSurname = await withSurname(null);
      expect(await resolveProjectOwnerName({ owner: nullSurname }, "Unknown")).toBe("Ada");
      const emptySurname = await withSurname("");
      expect(await resolveProjectOwnerName({ owner: emptySurname }, "Unknown")).toBe("Ada");
    });

    it("joins a full name, and labels an external owner", async () => {
      const userId = await withSurname("Lovelace");
      expect(await resolveProjectOwnerName({ owner: userId }, "Unknown")).toBe("Ada Lovelace");
      expect(
        await resolveProjectOwnerName({ owner: null, external_owner_name: "Bob" }, "Unknown"),
      ).toBe("Bob (external)");
      expect(await resolveProjectOwnerName({ owner: null }, "Unknown")).toBe("Unknown");
    });
  });
});
