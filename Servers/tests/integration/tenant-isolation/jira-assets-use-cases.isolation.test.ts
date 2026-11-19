jest.setTimeout(60000);
// Saving a Jira Assets connection encrypts the API token, and
// tools/createSecureValue reads the algorithm when it loads. Every deployment
// sets it; the integration environment does not, so use the same default.
process.env.ENCRYPTION_ALGORITHM ??= "aes-256-cbc";

// No test here may reach Jira: the client sends every call through safeFetch.
// Both outbound helpers are stubbed to fail, and the cross-organization cases
// check that neither was called.
jest.mock("../../../utils/safeOutboundUrl", () => ({
  ...jest.requireActual("../../../utils/safeOutboundUrl"),
  safeFetch: jest.fn().mockRejectedValue(new Error("no outbound calls in this suite")),
  safeFetchWithBase: jest.fn().mockRejectedValue(new Error("no outbound calls in this suite")),
}));

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { safeFetch, safeFetchWithBase } from "../../../utils/safeOutboundUrl";
import { cleanupDatabase, createTestOrganization, createTestUser } from "../helpers";
import { createTestApp, testRequest } from "../setup";
import { createTestProject } from "../../factories";
import { seedTwoTenantContexts, TenantContext } from "./tenantIsolation.harness";

/**
 * Jira Assets use case reads (E-M5) follow use case visibility, the rule of
 * the core use case list: an Admin sees every Jira-linked use case in the
 * organization, anyone else only those they own, are a member of or reach
 * through a group. Another organization sees none of them.
 *
 * The second block covers the writes across organizations (jira_assets_config,
 * jira_assets_use_cases): another organization's config, schedule and
 * selection saves and its use case removals never change the owner's rows.
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

/** Links the use case to a Jira object; `missing` flags it as missing in Jira. Returns the link id. */
async function linkToJira(
  orgId: number,
  projectId: number,
  objectId: string,
  missing = false,
): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO jira_assets_use_cases
       (organization_id, jira_object_id, project_id, data, last_synced_at, sync_status,
        missing_in_jira_since)
     VALUES (:orgId, :objectId, :projectId, CAST(:data AS JSONB), now(), 'synced',
             CASE WHEN :missing THEN now() - interval '1 day' END)
     RETURNING id;`,
    {
      replacements: {
        orgId,
        objectId,
        projectId,
        missing,
        data: JSON.stringify({ label: `Object ${objectId}`, objectType: { id: "7" } }),
      },
    },
  );
  return (rows as Array<{ id: number }>)[0].id;
}

async function addMember(orgId: number, projectId: number, userId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO projects_members (organization_id, project_id, user_id)
     VALUES (:orgId, :projectId, :userId)`,
    { replacements: { orgId, projectId, userId } },
  );
}

/** A group in the organization with `userId` in it, attached to the use case. */
async function shareThroughGroup(
  orgId: number,
  projectId: number,
  userId: number,
  createdBy: number,
): Promise<void> {
  const [rows] = await sequelize.query(
    `INSERT INTO verifywise.groups (organization_id, name, created_by)
     VALUES (:orgId, :name, :createdBy) RETURNING id`,
    { replacements: { orgId, name: `Jira group ${Date.now()}`, createdBy } },
  );
  const groupId = (rows as Array<{ id: number }>)[0].id;
  await sequelize.query(
    `INSERT INTO group_members (group_id, user_id, organization_id)
     VALUES (:groupId, :userId, :orgId)`,
    { replacements: { groupId, userId, orgId } },
  );
  await sequelize.query(
    `INSERT INTO project_groups (project_id, group_id, organization_id)
     VALUES (:projectId, :groupId, :orgId)`,
    { replacements: { projectId, groupId, orgId } },
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
      orgId,
      adminId,
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

  it("lets an Editor who reaches a use case only through a group list and open it", async () => {
    const { orgId, adminId, adminOnly } = await seed();
    const groupUserId = await user(orgId, "Editor");
    await shareThroughGroup(orgId, adminOnly, groupUserId, adminId);
    const groupUser = await apiAs(orgId, groupUserId, "Editor");

    const list = await groupUser.get("/api/extensions/jira-assets/use-cases");
    expect(list.status).toBe(200);
    expect(listedProjects(list.body)).toEqual([adminOnly]);

    const useCase = await groupUser.get(`/api/extensions/jira-assets/use-cases/${adminOnly}`);
    expect(useCase.status).toBe(200);
    expect(useCase.body.data.id).toBe(adminOnly);
  });

  it("answers 404 to another organization's Admin for the use case", async () => {
    const { shared, otherAdmin } = await seed();

    const res = await otherAdmin.get(`/api/extensions/jira-assets/use-cases/${shared}`);
    expect(res.status).toBe(404);
  });
});

const outboundFetch = safeFetch as jest.MockedFunction<typeof safeFetch>;
const outboundFetchWithBase = safeFetchWithBase as jest.MockedFunction<typeof safeFetchWithBase>;

/** Saves a cloud connection for the caller's organization through the API. */
async function saveConnection(ctx: TenantContext, name: string): Promise<void> {
  const res = await ctx.request.post("/api/extensions/jira-assets/config").send({
    jira_base_url: `https://${name}.atlassian.net`,
    workspace_id: `${name}-workspace`,
    email: `${name}@example.com`,
    api_token: `${name}-token`,
    deployment_type: "cloud",
  });
  expect(res.status).toBe(200);
}

/** Every row the Jira Assets routes can write for one organization. */
async function jiraState(orgId: number) {
  const select = (sql: string) =>
    sequelize.query<Record<string, unknown>>(sql, {
      replacements: { orgId },
      type: QueryTypes.SELECT,
    });
  return {
    config: await select(`SELECT * FROM jira_assets_config WHERE organization_id = :orgId`),
    links: await select(
      `SELECT * FROM jira_assets_use_cases WHERE organization_id = :orgId ORDER BY id`,
    ),
    projects: await select(`SELECT id FROM projects WHERE organization_id = :orgId ORDER BY id`),
    schedule: await select(
      `SELECT * FROM extension_sync_settings
        WHERE organization_id = :orgId AND extension_key = 'jira-assets'`,
    ),
    runs: await select(
      `SELECT * FROM extension_sync_runs
        WHERE organization_id = :orgId AND extension_key = 'jira-assets' ORDER BY id`,
    ),
  };
}

describe("Jira Assets writes across organizations", () => {
  afterEach(async () => {
    outboundFetch.mockClear();
    outboundFetchWithBase.mockClear();
    await cleanupDatabase();
  });

  /**
   * Both organizations connected. The owner has a use case flagged missing in
   * Jira and one that is not; the attacker has its own flagged use case.
   */
  async function seedTwoConnected() {
    const { owner, attacker } = await seedTwoTenantContexts();
    await enableJiraAssets(owner.orgId, owner.userId);
    await enableJiraAssets(attacker.orgId, attacker.userId);
    await saveConnection(owner, "owner");
    await saveConnection(attacker, "attacker");

    const ownerMissingProject = await createTestProject(owner.orgId, owner.userId);
    const ownerMissingLink = await linkToJira(owner.orgId, ownerMissingProject, "201", true);
    const ownerLiveProject = await createTestProject(owner.orgId, owner.userId);
    await linkToJira(owner.orgId, ownerLiveProject, "202");

    const attackerProject = await createTestProject(attacker.orgId, attacker.userId);
    const attackerMissingLink = await linkToJira(attacker.orgId, attackerProject, "301", true);

    return {
      owner,
      attacker,
      ownerMissingProject,
      ownerMissingLink,
      ownerLiveProject,
      attackerProject,
      attackerMissingLink,
      ownerBefore: await jiraState(owner.orgId),
    };
  }

  function expectNoOutboundCalls() {
    expect(outboundFetch).not.toHaveBeenCalled();
    expect(outboundFetchWithBase).not.toHaveBeenCalled();
  }

  it("saves another organization's config, schedule and selection to its own row only", async () => {
    const { owner, attacker, ownerBefore } = await seedTwoConnected();
    expect(ownerBefore.config).toHaveLength(1);

    await saveConnection(attacker, "attacker-two");

    const schedule = await attacker.request
      .patch("/api/extensions/jira-assets/config/sync")
      .send({ sync_enabled: true, sync_interval_hours: 6 });
    expect(schedule.status).toBe(200);
    expect(schedule.body.data).toEqual({ sync_enabled: true, sync_interval_hours: 6 });

    const selection = await attacker.request
      .patch("/api/extensions/jira-assets/config/selection")
      .send({ selected_schema_id: "9", selected_object_type_id: "42" });
    expect(selection.status).toBe(200);

    const attackerAfter = await jiraState(attacker.orgId);
    expect(attackerAfter.config).toHaveLength(1);
    expect(attackerAfter.config[0]).toMatchObject({
      jira_base_url: "https://attacker-two.atlassian.net",
      workspace_id: "attacker-two-workspace",
      selected_schema_id: "9",
      selected_object_type_id: "42",
    });
    expect(attackerAfter.schedule).toHaveLength(1);
    expect(attackerAfter.schedule[0]).toMatchObject({ enabled: true, interval_hours: 6 });

    expect(await jiraState(owner.orgId)).toEqual(ownerBefore);
    expectNoOutboundCalls();
  });

  it("never removes the owner's use cases flagged missing in Jira", async () => {
    const { owner, attacker, ownerMissingLink, attackerMissingLink, attackerProject, ownerBefore } =
      await seedTwoConnected();

    // The owner's link next to the attacker's own: only the attacker's goes.
    const res = await attacker.request
      .post("/api/extensions/jira-assets/use-cases/remove-missing")
      .send({ use_case_ids: [ownerMissingLink, attackerMissingLink] });
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(1);
    expect(res.body.data.unlinked).toBe(0);
    expect(res.body.data.skipped_items).toEqual([{ id: ownerMissingLink, reason: "not_found" }]);

    const attackerAfter = await jiraState(attacker.orgId);
    expect(attackerAfter.links).toEqual([]);
    expect(attackerAfter.projects.map((p) => p.id)).not.toContain(attackerProject);

    expect(await jiraState(owner.orgId)).toEqual(ownerBefore);
    expectNoOutboundCalls();
  });

  it("answers 404 to another organization deleting or reading the owner's use case", async () => {
    const { owner, attacker, ownerMissingProject, ownerLiveProject, ownerBefore } =
      await seedTwoConnected();

    for (const projectId of [ownerMissingProject, ownerLiveProject]) {
      const del = await attacker.request.delete(
        `/api/extensions/jira-assets/use-cases/${projectId}`,
      );
      expect(del.status).toBe(404);

      const read = await attacker.request.get(`/api/extensions/jira-assets/use-cases/${projectId}`);
      expect(read.status).toBe(404);
    }

    expect(await jiraState(owner.orgId)).toEqual(ownerBefore);
    expectNoOutboundCalls();
  });
});
