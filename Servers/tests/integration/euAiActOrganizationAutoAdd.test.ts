jest.setTimeout(60000);

import path from "path";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestProjectFramework } from "../factories";
import { notifyEuAiActOrganizationAdded } from "../../services/inAppNotification.service";

/**
 * EU AI Act (organization) is never added by hand. Enabling EU AI Act on a use
 * case attaches it to the organizational project once (creating that project
 * when there is none), and it can't be removed while a use case has EU AI Act.
 * The backfill migration does the same for organizations that had EU AI Act on
 * a use case before.
 */

const EU_AI_ACT = 1;
const EU_AI_ACT_ORGANIZATION = 29;
const ISO_42001 = 2;
const HIPAA = 24;
const CONTROLS = 18;
const SUBCONTROLS = 42;
/** EU AI Act assessment questions moved to framework 29. */
const QUESTIONS = 5;

let counter = 0;
async function adminApi() {
  const orgId = await createTestOrganization();
  counter += 1;
  const adminId = await createTestUser(
    orgId,
    1,
    `eu-org-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId: adminId, organizationId: orgId, role: "Admin" },
  });
  return { orgId, adminId, api: testRequest(app) };
}

const body = (owner: number, extra: Record<string, unknown> = {}) => ({
  project_title: "Claims triage",
  owner,
  start_date: "2026-06-01",
  geography: 1,
  members: [],
  ...extra,
});

const select = <T>(sql: string, replacements: Record<string, unknown> = {}) =>
  sequelize.query(sql, { replacements, type: QueryTypes.SELECT }) as Promise<T[]>;

/** Organizational projects of the org, with whether each has framework 29 and its row counts. */
async function organizationalProjects(orgId: number) {
  return select<{
    id: number;
    project_title: string;
    owner: number | null;
    has_framework: boolean;
    controls: number;
    subcontrols: number;
    answers: number;
  }>(
    `SELECT p.id, p.project_title, p.owner,
            pf.id IS NOT NULL AS has_framework,
            (SELECT COUNT(*)::int FROM controls_eu c
              WHERE c.projects_frameworks_id = pf.id) AS controls,
            (SELECT COUNT(*)::int FROM subcontrols_eu s
               JOIN controls_eu c ON c.id = s.control_id
              WHERE c.projects_frameworks_id = pf.id) AS subcontrols,
            (SELECT COUNT(*)::int FROM answers_eu ans
               JOIN assessments a ON a.id = ans.assessment_id
              WHERE a.projects_frameworks_id = pf.id) AS answers
       FROM projects p
       LEFT JOIN projects_frameworks pf
         ON pf.project_id = p.id AND pf.framework_id = :frameworkId
      WHERE p.organization_id = :orgId AND p.is_organizational = true
      ORDER BY p.id`,
    { orgId, frameworkId: EU_AI_ACT_ORGANIZATION },
  );
}

/** The recipients and details of each EU AI Act (organization) alert sent. */
const mockNotify = notifyEuAiActOrganizationAdded as jest.Mock;
const alerts = () =>
  mockNotify.mock.calls.map(([organizationId, recipientIds, added]) => ({
    organizationId,
    recipientIds: [...recipientIds].sort((x: number, y: number) => x - y),
    added,
  }));

const projectIdOf = (res: { body: any }) => Number(res.body.data.project?.id ?? res.body.data.id);

beforeAll(async () => {
  await seedFrameworks();
});

afterEach(async () => {
  mockNotify.mockClear();
  await cleanupDatabase();
  await seedFrameworks();
});

describe("EU AI Act (organization) is added when a use case gets EU AI Act", () => {
  it("creates the organizational project with it on the first EU AI Act use case, once", async () => {
    const { orgId, adminId, api } = await adminApi();

    const first = await api.post("/api/projects").send(body(adminId, { framework: [EU_AI_ACT] }));
    expect(first.status).toBe(201);
    expect(first.body.data.frameworks.eu.organization_framework_added).toBe(true);

    const [organization] = await select<{ name: string }>(
      `SELECT name FROM organizations WHERE id = :orgId`,
      { orgId },
    );
    expect(await organizationalProjects(orgId)).toEqual([
      {
        id: expect.any(Number),
        project_title: organization.name,
        owner: adminId,
        has_framework: true,
        controls: CONTROLS,
        subcontrols: SUBCONTROLS,
        answers: QUESTIONS,
      },
    ]);

    // The Admin (here also the user who enabled it and the owner) is told once.
    const [organizationalProject] = await organizationalProjects(orgId);
    const expectedAlert = {
      organizationId: orgId,
      recipientIds: [adminId],
      added: {
        projectId: organizationalProject.id,
        projectTitle: organization.name,
        useCaseTitle: "Claims triage",
        projectCreated: true,
      },
    };
    expect(alerts()).toEqual([expectedAlert]);

    const second = await api.post("/api/projects").send(body(adminId, { framework: [EU_AI_ACT] }));
    expect(second.status).toBe(201);
    expect(second.body.data.frameworks.eu.organization_framework_added).toBe(false);
    expect(await organizationalProjects(orgId)).toHaveLength(1);
    // Nothing was added, so nobody is told again.
    expect(alerts()).toEqual([expectedAlert]);
  });

  it("tells every Admin and the Editor who enabled it, and no one else", async () => {
    const { orgId, adminId } = await adminApi();
    const secondAdminId = await createTestUser(
      orgId,
      1,
      `eu-org-a2-${Date.now()}@test.com`,
      "Pw123456!",
    );
    const editorId = await createTestUser(
      orgId,
      3,
      `eu-org-ed-${Date.now()}@test.com`,
      "Pw123456!",
    );
    const reviewerId = await createTestUser(
      orgId,
      2,
      `eu-org-rv-${Date.now()}@test.com`,
      "Pw123456!",
    );
    const editorApi = testRequest(
      await createTestApp({
        bypassAuth: true,
        mockUser: { userId: editorId, organizationId: orgId, role: "Editor" },
      }),
    );

    const res = await editorApi
      .post("/api/projects")
      .send(body(editorId, { framework: [EU_AI_ACT] }));
    expect(res.status).toBe(201);

    const [organizationalProject] = await organizationalProjects(orgId);
    // The organization's first Admin owns it, not the Editor who caused it.
    expect(organizationalProject.owner).toBe(adminId);
    const [alert] = alerts();
    expect(alerts()).toHaveLength(1);
    expect(alert.recipientIds).toEqual([adminId, secondAdminId, editorId].sort((x, y) => x - y));
    expect(alert.recipientIds).not.toContain(reviewerId);
  });

  it("adds it to the existing organizational project through 'add framework'", async () => {
    const { orgId, adminId, api } = await adminApi();
    const org = await api
      .post("/api/projects")
      .send(body(adminId, { framework: [ISO_42001], is_organizational: true }));
    expect(org.status).toBe(201);
    const useCase = await api.post("/api/projects").send(body(adminId, { framework: [HIPAA] }));
    const useCaseId = projectIdOf(useCase);

    const added = await api.post(
      `/api/frameworks/toProject?frameworkId=${EU_AI_ACT}&projectId=${useCaseId}`,
    );
    expect(added.status).toBe(200);
    expect(added.body.data).toEqual({ organization_framework_added: true });

    const projects = await organizationalProjects(orgId);
    expect(projects).toHaveLength(1);
    expect(alerts()).toEqual([
      {
        organizationId: orgId,
        recipientIds: [adminId],
        added: expect.objectContaining({ projectId: projectIdOf(org), projectCreated: false }),
      },
    ]);
    expect(projects[0]).toMatchObject({
      id: projectIdOf(org),
      has_framework: true,
      controls: CONTROLS,
      subcontrols: SUBCONTROLS,
      answers: QUESTIONS,
    });
  });

  it("is not triggered by a demo use case", async () => {
    const { orgId, adminId, api } = await adminApi();
    const useCase = await api.post("/api/projects").send(body(adminId, { framework: [HIPAA] }));
    const useCaseId = projectIdOf(useCase);
    await sequelize.query(`UPDATE projects SET is_demo = true WHERE id = :useCaseId`, {
      replacements: { useCaseId },
    });

    const added = await api.post(
      `/api/frameworks/toProject?frameworkId=${EU_AI_ACT}&projectId=${useCaseId}`,
    );
    expect(added.status).toBe(200);
    expect(added.body.data).toEqual({ organization_framework_added: false });
    expect(await organizationalProjects(orgId)).toEqual([]);
    expect(alerts()).toEqual([]);
  });

  it("refuses adding it by hand", async () => {
    const { adminId, api } = await adminApi();
    const atCreation = await api
      .post("/api/projects")
      .send(body(adminId, { framework: [EU_AI_ACT_ORGANIZATION], is_organizational: true }));
    expect(atCreation.status).toBe(400);

    const org = await api
      .post("/api/projects")
      .send(body(adminId, { framework: [ISO_42001], is_organizational: true }));
    const added = await api.post(
      `/api/frameworks/toProject?frameworkId=${EU_AI_ACT_ORGANIZATION}&projectId=${projectIdOf(org)}`,
    );
    expect(added.status).toBe(400);
  });

  it("can't be removed while a use case has EU AI Act", async () => {
    const { orgId, adminId, api } = await adminApi();
    const useCase = await api.post("/api/projects").send(body(adminId, { framework: [EU_AI_ACT] }));
    const useCaseId = projectIdOf(useCase);
    const [organizationalProject] = await organizationalProjects(orgId);
    const remove = () =>
      api.delete(
        `/api/frameworks/fromProject?frameworkId=${EU_AI_ACT_ORGANIZATION}&projectId=${organizationalProject.id}`,
      );

    const refused = await remove();
    expect(refused.status).toBe(400);
    expect((await organizationalProjects(orgId))[0].has_framework).toBe(true);

    const euRemoved = await api.delete(
      `/api/frameworks/fromProject?frameworkId=${EU_AI_ACT}&projectId=${useCaseId}`,
    );
    expect(euRemoved.status).toBe(200);
    const [{ id: projectFrameworkId }] = await select<{ id: number }>(
      `SELECT id FROM projects_frameworks WHERE project_id = :projectId AND framework_id = :frameworkId`,
      { projectId: organizationalProject.id, frameworkId: EU_AI_ACT_ORGANIZATION },
    );
    expect((await remove()).status).toBe(200);
    expect((await organizationalProjects(orgId))[0].has_framework).toBe(false);
    // Its assessment goes with it.
    const [{ assessments }] = await select<{ assessments: number }>(
      `SELECT COUNT(*)::int AS assessments FROM assessments WHERE projects_frameworks_id = :projectFrameworkId`,
      { projectFrameworkId },
    );
    expect(assessments).toBe(0);
  });

  it("can't delete the organizational project holding it while a use case has EU AI Act", async () => {
    const { orgId, adminId, api } = await adminApi();
    const useCase = await api.post("/api/projects").send(body(adminId, { framework: [EU_AI_ACT] }));
    const useCaseId = projectIdOf(useCase);
    const [organizationalProject] = await organizationalProjects(orgId);
    const deleteProject = (id: number) =>
      api.delete(`/api/v1/projects/${id}`).query({ archive_risks_linked_only_here: "false" });

    const refused = await deleteProject(organizationalProject.id);
    expect(refused.status).toBe(400);
    expect(await organizationalProjects(orgId)).toHaveLength(1);

    expect((await deleteProject(useCaseId)).status).toBe(202);
    expect((await deleteProject(organizationalProject.id)).status).toBe(202);
    expect(await organizationalProjects(orgId)).toEqual([]);
  });

  it("deletes an organizational project without it while a use case has EU AI Act", async () => {
    const { orgId, adminId, api } = await adminApi();
    await api.post("/api/projects").send(body(adminId, { framework: [EU_AI_ACT] }));
    const other = await api
      .post("/api/projects")
      .send(body(adminId, { framework: [ISO_42001], is_organizational: true }));

    const deleted = await api
      .delete(`/api/v1/projects/${projectIdOf(other)}`)
      .query({ archive_risks_linked_only_here: "false" });
    expect(deleted.status).toBe(202);
    expect(await organizationalProjects(orgId)).toEqual([
      expect.objectContaining({ has_framework: true }),
    ]);
  });

  it("skips a demo organizational project", async () => {
    const { orgId, adminId, api } = await adminApi();
    const [{ id: demoProject }] = await select<{ id: number }>(
      `INSERT INTO projects (organization_id, project_title, start_date, is_organizational, is_demo)
       VALUES (:orgId, 'Demo org', NOW(), true, true) RETURNING id`,
      { orgId },
    );

    await api.post("/api/projects").send(body(adminId, { framework: [EU_AI_ACT] }));

    const projects = await organizationalProjects(orgId);
    expect(projects).toHaveLength(2);
    expect(projects.find((p) => p.id === demoProject)?.has_framework).toBe(false);
    expect(projects.find((p) => p.id !== demoProject)?.has_framework).toBe(true);
  });
});

describe("migration", () => {
  const migration = require(
    path.resolve(
      __dirname,
      "../../database/migrations/20261119235846-add-eu-ai-act-organization-framework.js",
    ),
  );
  const runMigration = () => migration.up({ sequelize });

  /** A use case with EU AI Act linked the way it was before the auto-add. */
  async function euUseCase(orgId: number, owner: number | null, isDemo = false) {
    const [{ id }] = await select<{ id: number }>(
      `INSERT INTO projects (organization_id, project_title, owner, start_date, is_demo)
       VALUES (:orgId, 'Legacy EU use case', :owner, NOW(), :isDemo) RETURNING id`,
      { orgId, owner, isDemo },
    );
    await createTestProjectFramework(orgId, id, EU_AI_ACT);
    return id;
  }

  it("attaches it once, with its controls and assessment, to every organization with an EU AI Act use case", async () => {
    // No organizational project: one is created, owned by the first Admin,
    // not by the Editor who owns the first EU use case.
    const orgA = await createTestOrganization();
    const editorA = await createTestUser(orgA, 3, `bf-ed-${Date.now()}@test.com`, "Pw123456!");
    const ownerA = await createTestUser(orgA, 1, `bf-a-${Date.now()}@test.com`, "Pw123456!");
    await createTestUser(orgA, 1, `bf-a2-${Date.now()}@test.com`, "Pw123456!");
    await euUseCase(orgA, editorA);
    await euUseCase(orgA, null);

    // No Admin: the owner of the first EU use case owns it.
    const orgD = await createTestOrganization();
    const editorD = await createTestUser(orgD, 3, `bf-d-${Date.now()}@test.com`, "Pw123456!");
    await euUseCase(orgD, editorD);

    // An organizational project already exists: it gets the framework.
    const orgB = await createTestOrganization();
    const [{ id: orgBProject }] = await select<{ id: number }>(
      `INSERT INTO projects (organization_id, project_title, start_date, is_organizational)
       VALUES (:orgB, 'Org B', NOW(), true) RETURNING id`,
      { orgB },
    );
    await euUseCase(orgB, null);

    // Only a demo EU use case: untouched.
    const orgC = await createTestOrganization();
    await euUseCase(orgC, null, true);

    await runMigration();
    await runMigration();

    const a = await organizationalProjects(orgA);
    expect(a).toEqual([
      expect.objectContaining({
        owner: ownerA,
        has_framework: true,
        controls: CONTROLS,
        subcontrols: SUBCONTROLS,
        answers: QUESTIONS,
      }),
    ]);
    expect(await organizationalProjects(orgB)).toEqual([
      expect.objectContaining({
        id: orgBProject,
        has_framework: true,
        controls: CONTROLS,
        subcontrols: SUBCONTROLS,
        answers: QUESTIONS,
      }),
    ]);
    expect(await organizationalProjects(orgC)).toEqual([]);
    expect(await organizationalProjects(orgD)).toEqual([
      expect.objectContaining({ owner: editorD, has_framework: true }),
    ]);

    const [{ links }] = await select<{ links: number }>(
      `SELECT COUNT(*)::int AS links FROM projects_frameworks
        WHERE framework_id = :frameworkId AND organization_id IN (:orgs)`,
      { frameworkId: EU_AI_ACT_ORGANIZATION, orgs: [orgA, orgB, orgC, orgD] },
    );
    expect(links).toBe(3);
  });
});
