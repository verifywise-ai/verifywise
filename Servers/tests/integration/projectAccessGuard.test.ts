jest.setTimeout(60000);

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestProject, createTestProjectFramework } from "../factories";
import { EU_AI_ACT_FRAMEWORK_ID } from "../../utils/validations/projectValidation.utils";

/**
 * requireProjectAccess: holding a permission such as useCase.edit is not enough
 * to act on a use case; the caller must be an Admin, its owner or a member.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;
type Api = ReturnType<typeof testRequest>;

let counter = 0;
async function user(orgId: number, role: RoleName): Promise<number> {
  counter += 1;
  return createTestUser(
    orgId,
    ROLE[role],
    `project-access-${Date.now()}-${counter}@test.com`,
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

async function addMember(orgId: number, projectId: number, userId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO projects_members (organization_id, project_id, user_id)
     VALUES (:orgId, :projectId, :userId)`,
    { replacements: { orgId, projectId, userId } },
  );
}

/** Everything a guarded route could change: the row and its classification runs. */
async function snapshot(projectId: number) {
  const [projects] = await sequelize.query(
    `SELECT to_jsonb(p) AS project FROM projects p WHERE p.id = :projectId`,
    { replacements: { projectId } },
  );
  const [runs] = await sequelize.query(
    `SELECT COUNT(*)::int AS runs FROM eu_ai_act_classifications WHERE use_case_id = :projectId`,
    { replacements: { projectId } },
  );
  return { project: (projects as any[])[0]?.project, runs: (runs as any[])[0].runs as number };
}

interface GuardedRoute {
  name: string;
  call: (api: Api, id: number | string) => any;
  success: number;
  prepare?: (orgId: number, projectId: number) => Promise<void>;
  /** What a successful call changed; absent for reads. */
  verify?: (after: Awaited<ReturnType<typeof snapshot>>) => void;
}

const goLive = (api: Api, id: number | string) =>
  api.post(`/api/v1/use-case-lifecycle/${id}/go-live`).send({});

const GUARDED_ROUTES: GuardedRoute[] = [
  {
    name: "DELETE /api/projects/:id",
    call: (api, id) => api.delete(`/api/projects/${id}`),
    success: 202,
    verify: (after) => expect(after.project).toBeUndefined(),
  },
  {
    name: "PATCH /api/projects/:id/status",
    call: (api, id) => api.patch(`/api/projects/${id}/status`).send({ status: "On hold" }),
    success: 200,
    verify: (after) => expect(after.project.status).toBe("On hold"),
  },
  {
    name: "POST /api/projects/:id/eu-ai-act-classification",
    call: (api, id) =>
      api
        .post(`/api/projects/${id}/eu-ai-act-classification`)
        .send({ answers: { scope: "research_only" } }),
    success: 200,
    prepare: async (orgId, projectId) => {
      await createTestProjectFramework(orgId, projectId, EU_AI_ACT_FRAMEWORK_ID);
    },
    verify: (after) => expect(after.runs).toBe(1),
  },
  {
    name: "GET /api/projects/stats/:id",
    call: (api, id) => api.get(`/api/projects/stats/${id}`),
    success: 202,
  },
  {
    name: "POST /api/v1/use-case-lifecycle/:id/go-live",
    call: goLive,
    success: 200,
    verify: (after) => expect(after.project.lifecycle_stage).toBe("live"),
  },
  {
    name: "POST /api/v1/use-case-lifecycle/:id/retire",
    call: (api, id) => api.post(`/api/v1/use-case-lifecycle/${id}/retire`),
    success: 200,
    verify: (after) => expect(after.project.lifecycle_stage).toBe("retired"),
  },
  {
    name: "POST /api/v1/use-case-lifecycle/:id/confirm",
    call: (api, id) => api.post(`/api/v1/use-case-lifecycle/${id}/confirm`),
    success: 200,
    prepare: async (_orgId, projectId) => {
      await sequelize.query(
        `UPDATE projects SET lifecycle_stage = 'live', go_live_date = CURRENT_DATE WHERE id = :projectId`,
        { replacements: { projectId } },
      );
    },
    verify: (after) => expect(after.project.last_confirmed_at).not.toBeNull(),
  },
  {
    name: "PATCH /api/v1/use-case-lifecycle/:id/department",
    call: (api, id) =>
      api.patch(`/api/v1/use-case-lifecycle/${id}/department`).send({ department: "Risk" }),
    success: 200,
    verify: (after) => expect(after.project.department).toBe("Risk"),
  },
];

describe("project access guard", () => {
  let orgId: number;
  let ownerId: number;

  beforeEach(async () => {
    await cleanupDatabase();
    await seedFrameworks();
    orgId = await createTestOrganization();
    ownerId = await user(orgId, "Editor");
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  async function projectFor(route: GuardedRoute): Promise<number> {
    const projectId = await createTestProject(orgId, ownerId);
    await route.prepare?.(orgId, projectId);
    return projectId;
  }

  describe.each(GUARDED_ROUTES)("$name", (route) => {
    it("refuses an unrelated Editor and changes nothing", async () => {
      const projectId = await projectFor(route);
      const before = await snapshot(projectId);
      const api = await apiAs(orgId, await user(orgId, "Editor"), "Editor");

      const res = await route.call(api, projectId);

      expect(res.status).toBe(403);
      expect(res.body.data).toBe("Access denied");
      expect(await snapshot(projectId)).toEqual(before);
    });

    it("lets the owner through", async () => {
      const projectId = await projectFor(route);
      const res = await route.call(await apiAs(orgId, ownerId, "Editor"), projectId);
      expect(res.status).toBe(route.success);
      route.verify?.(await snapshot(projectId));
    });

    it("lets a member through", async () => {
      const projectId = await projectFor(route);
      const memberId = await user(orgId, "Editor");
      await addMember(orgId, projectId, memberId);
      const res = await route.call(await apiAs(orgId, memberId, "Editor"), projectId);
      expect(res.status).toBe(route.success);
      route.verify?.(await snapshot(projectId));
    });

    it("lets an Admin who is not part of the use case through", async () => {
      const projectId = await projectFor(route);
      const res = await route.call(
        await apiAs(orgId, await user(orgId, "Admin"), "Admin"),
        projectId,
      );
      expect(res.status).toBe(route.success);
      route.verify?.(await snapshot(projectId));
    });

    it("still returns 404 for a use case in another organization", async () => {
      const projectId = await projectFor(route);
      const before = await snapshot(projectId);
      const otherOrg = await createTestOrganization();
      const api = await apiAs(otherOrg, await user(otherOrg, "Admin"), "Admin");

      const res = await route.call(api, projectId);

      expect(res.status).toBe(404);
      expect(await snapshot(projectId)).toEqual(before);
    });

    it("still returns 404 for a use case that does not exist", async () => {
      const api = await apiAs(orgId, await user(orgId, "Editor"), "Editor");
      const res = await route.call(api, 2147483000);
      expect(res.status).toBe(404);
    });
  });

  describe("the lifecycle rule stays in force on top of the guard", () => {
    it("still refuses an Auditor who owns the use case", async () => {
      const auditor = await user(orgId, "Auditor");
      const projectId = await createTestProject(orgId, auditor);
      const before = await snapshot(projectId);

      const res = await goLive(await apiAs(orgId, auditor, "Auditor"), projectId);

      expect(res.status).toBe(403);
      expect(await snapshot(projectId)).toEqual(before);
    });

    it("still refuses a member with neither useCase.edit nor ownership", async () => {
      const projectId = await createTestProject(orgId, ownerId);
      const reviewer = await user(orgId, "Reviewer");
      await addMember(orgId, projectId, reviewer);

      const res = await goLive(await apiAs(orgId, reviewer, "Reviewer"), projectId);

      expect(res.status).toBe(403);
    });

    it("still lets an owner without useCase.edit act", async () => {
      const reviewer = await user(orgId, "Reviewer");
      const projectId = await createTestProject(orgId, reviewer);

      const res = await goLive(await apiAs(orgId, reviewer, "Reviewer"), projectId);

      expect(res.status).toBe(200);
    });

    it("answers an unparsable id with the controller's 400", async () => {
      const api = await apiAs(orgId, ownerId, "Editor");
      const res = await goLive(api, "abc");
      expect(res.status).toBe(400);
      expect(res.body.data).toBe("Invalid project ID");
    });
  });

  it("does not treat a use case with no user owner as anyone's", async () => {
    const projectId = await createTestProject(orgId, ownerId);
    await sequelize.query(`UPDATE projects SET owner = NULL WHERE id = :projectId`, {
      replacements: { projectId },
    });

    const api = await apiAs(orgId, await user(orgId, "Editor"), "Editor");

    expect((await api.delete(`/api/projects/${projectId}`)).status).toBe(403);
    expect((await snapshot(projectId)).project).toBeDefined();
  });
});
