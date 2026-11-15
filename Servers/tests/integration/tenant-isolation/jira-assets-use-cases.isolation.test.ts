jest.setTimeout(60000);

import { sequelize } from "../../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "../helpers";
import { createTestApp, testRequest } from "../setup";
import { createTestProject } from "../../factories";

/**
 * Jira Assets use case reads (E-M5) follow use case visibility, the rule of
 * the core use case list: an Admin sees every Jira-linked use case in the
 * organization, anyone else only those they own, are a member of or reach
 * through a group. Another organization sees none of them.
 */

const ROLE = { Admin: 1, Editor: 3 } as const;
type RoleName = keyof typeof ROLE;
type Api = ReturnType<typeof testRequest>;

let counter = 0;
async function user(orgId: number, role: RoleName): Promise<number> {
  counter += 1;
  return createTestUser(
    orgId,
    ROLE[role],
    `jira-visibility-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
}

async function apiAs(orgId: number, userId: number, role: RoleName): Promise<Api> {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role },
  });
  return testRequest(app);
}

async function enableJiraAssets(orgId: number, userId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO extension_enablements (organization_id, extension_id, enabled, enabled_at, enabled_by)
     SELECT :orgId, e.id, TRUE, now(), :userId FROM extensions e WHERE e.key = 'jira-assets'
     ON CONFLICT (organization_id, extension_id) DO UPDATE SET enabled = TRUE, enabled_at = now();`,
    { replacements: { orgId, userId } },
  );
}

async function linkToJira(orgId: number, projectId: number, objectId: string): Promise<void> {
  await sequelize.query(
    `INSERT INTO jira_assets_use_cases
       (organization_id, jira_object_id, project_id, data, last_synced_at, sync_status)
     VALUES (:orgId, :objectId, :projectId, CAST(:data AS JSONB), now(), 'synced');`,
    {
      replacements: {
        orgId,
        objectId,
        projectId,
        data: JSON.stringify({ label: `Object ${objectId}`, objectType: { id: "7" } }),
      },
    },
  );
}

async function addMember(orgId: number, projectId: number, userId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO projects_members (organization_id, project_id, user_id)
     VALUES (:orgId, :projectId, :userId)`,
    { replacements: { orgId, projectId, userId } },
  );
}

const listedProjects = (body: any): number[] =>
  (body.data as Array<{ project_id: number }>).map((row) => row.project_id).sort((a, b) => a - b);

describe("Jira Assets use case visibility", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  async function seed() {
    const orgId = await createTestOrganization(`Jira visibility ${Date.now()}`);
    const adminId = await user(orgId, "Admin");
    const outsiderId = await user(orgId, "Editor");
    const memberId = await user(orgId, "Editor");
    await enableJiraAssets(orgId, adminId);

    // Owned by the Admin; the member Editor is added, the outsider is not.
    const shared = await createTestProject(orgId, adminId);
    await addMember(orgId, shared, memberId);
    await linkToJira(orgId, shared, "101");
    // Owned by the Admin, nobody else on it.
    const adminOnly = await createTestProject(orgId, adminId);
    await linkToJira(orgId, adminOnly, "102");
    // Owned by the outsider Editor.
    const outsiders = await createTestProject(orgId, outsiderId);
    await linkToJira(orgId, outsiders, "103");

    const otherOrg = await createTestOrganization(`Jira visibility other ${Date.now()}`);
    const otherAdminId = await user(otherOrg, "Admin");
    await enableJiraAssets(otherOrg, otherAdminId);

    return {
      shared,
      adminOnly,
      outsiders,
      admin: await apiAs(orgId, adminId, "Admin"),
      outsider: await apiAs(orgId, outsiderId, "Editor"),
      member: await apiAs(orgId, memberId, "Editor"),
      otherAdmin: await apiAs(otherOrg, otherAdminId, "Admin"),
    };
  }

  it("lists every linked use case for an Admin and only visible ones for an Editor", async () => {
    const { shared, adminOnly, outsiders, admin, outsider, member, otherAdmin } = await seed();

    const asAdmin = await admin.get("/api/extensions/jira-assets/use-cases");
    expect(asAdmin.status).toBe(200);
    expect(listedProjects(asAdmin.body)).toEqual(
      [shared, adminOnly, outsiders].sort((a, b) => a - b),
    );

    const asOutsider = await outsider.get("/api/extensions/jira-assets/use-cases");
    expect(asOutsider.status).toBe(200);
    expect(listedProjects(asOutsider.body)).toEqual([outsiders]);

    const asMember = await member.get("/api/extensions/jira-assets/use-cases");
    expect(asMember.status).toBe(200);
    expect(listedProjects(asMember.body)).toEqual([shared]);

    const asOtherOrg = await otherAdmin.get("/api/extensions/jira-assets/use-cases");
    expect(asOtherOrg.status).toBe(200);
    expect(asOtherOrg.body.data).toEqual([]);
  });

  it("answers 403 to a non-member Editor for a use case and its framework progress", async () => {
    const { shared, outsider, member, admin } = await seed();

    const useCase = await outsider.get(`/api/extensions/jira-assets/use-cases/${shared}`);
    expect(useCase.status).toBe(403);
    expect(JSON.stringify(useCase.body)).not.toContain("Object 101");

    const progress = await outsider.get(
      `/api/extensions/jira-assets/projects/${shared}/custom-frameworks-progress`,
    );
    expect(progress.status).toBe(403);

    for (const api of [member, admin]) {
      const allowed = await api.get(`/api/extensions/jira-assets/use-cases/${shared}`);
      expect(allowed.status).toBe(200);
      expect(allowed.body.data.id).toBe(shared);

      const allowedProgress = await api.get(
        `/api/extensions/jira-assets/projects/${shared}/custom-frameworks-progress`,
      );
      expect(allowedProgress.status).toBe(200);
    }
  });

  it("answers 404 to another organization's Admin for the use case", async () => {
    const { shared, otherAdmin } = await seed();

    const res = await otherAdmin.get(`/api/extensions/jira-assets/use-cases/${shared}`);
    expect(res.status).toBe(404);
  });
});
