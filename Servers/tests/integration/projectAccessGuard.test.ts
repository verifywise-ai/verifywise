jest.setTimeout(60000);

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import {
  assignTaskToUser,
  createTestControlEU,
  createTestProject,
  createTestProjectFramework,
  createTestTask,
  createTestVendor,
} from "../factories";
import { EU_AI_ACT_FRAMEWORK_ID } from "../../utils/validations/projectValidation.utils";
import { addFrameworkToProjectQuery } from "../../utils/framework.utils";

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

/** Everything a guarded route could change: the row and what hangs off it. */
async function snapshot(projectId: number) {
  const [rows] = await sequelize.query(
    `SELECT (SELECT to_jsonb(p) FROM projects p WHERE p.id = :projectId) AS project,
            (SELECT COUNT(*)::int FROM eu_ai_act_classifications WHERE use_case_id = :projectId) AS runs,
            (SELECT to_jsonb(c) FROM ce_markings c WHERE c.project_id = :projectId) AS ce_marking,
            (SELECT to_jsonb(f) FROM fria_assessments f WHERE f.project_id = :projectId) AS fria,
            (SELECT COUNT(*)::int FROM post_market_monitoring_cycles cy
               JOIN post_market_monitoring_configs co ON co.id = cy.config_id
              WHERE co.project_id = :projectId) AS cycles,
            (SELECT COALESCE(array_agg(framework_id ORDER BY framework_id), '{}')
               FROM projects_frameworks WHERE project_id = :projectId) AS frameworks`,
    { replacements: { projectId } },
  );
  const row = (rows as any[])[0];
  return {
    project: row.project ?? undefined,
    runs: row.runs as number,
    ceMarking: row.ce_marking,
    fria: row.fria,
    cycles: row.cycles as number,
    frameworks: row.frameworks as number[],
  };
}

interface GuardedRoute {
  name: string;
  call: (api: Api, id: number | string) => any;
  /**
   * Status once past the guard. 500 marks a route whose own query is already
   * broken (a dropped legacy table or column): past the guard is all it can show.
   */
  success: number;
  /** Status for a use case that is missing or in another organization; default 404. */
  missing?: number;
  prepare?: (orgId: number, projectId: number) => Promise<void>;
  /** What a successful call changed; absent for reads. */
  verify?: (after: Awaited<ReturnType<typeof snapshot>>) => void;
}

/** A framework the guarded framework routes can add and remove. */
const NEW_FRAMEWORK_ID = EU_AI_ACT_FRAMEWORK_ID;

/** The controller only reads; its CE marking row is what the PUT changes. */
const addCeMarking = async (orgId: number, projectId: number) => {
  await sequelize.query(
    `INSERT INTO ce_markings (project_id, organization_id) VALUES (:projectId, :orgId)`,
    { replacements: { orgId, projectId } },
  );
};

const addFria = async (orgId: number, projectId: number) => {
  await sequelize.query(
    `INSERT INTO fria_assessments (organization_id, project_id, version, status, created_by)
     SELECT :orgId, :projectId, 1, 'draft', p.owner FROM projects p WHERE p.id = :projectId`,
    { replacements: { orgId, projectId } },
  );
};

const addPmmConfig = async (orgId: number, projectId: number) => {
  await sequelize.query(
    `INSERT INTO post_market_monitoring_configs (organization_id, project_id, is_active)
     VALUES (:orgId, :projectId, TRUE)`,
    { replacements: { orgId, projectId } },
  );
};

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
  {
    name: "GET /api/projects/calculateProjectRisks/:id",
    call: (api, id) => api.get(`/api/projects/calculateProjectRisks/${id}`),
    success: 200,
    missing: 200,
  },
  {
    name: "GET /api/projects/calculateVendorRisks/:id",
    call: (api, id) => api.get(`/api/projects/calculateVendorRisks/${id}`),
    success: 500,
    missing: 500,
  },
  {
    name: "GET /api/projects/compliance/progress/:id",
    call: (api, id) => api.get(`/api/projects/compliance/progress/${id}`),
    success: 500,
  },
  {
    name: "GET /api/projects/assessment/progress/:id",
    call: (api, id) => api.get(`/api/projects/assessment/progress/${id}`),
    success: 500,
  },
  {
    name: "GET /api/projects/complainces/:projid",
    call: (api, id) => api.get(`/api/projects/complainces/${id}`),
    success: 500,
  },
  {
    name: "GET /api/projects/:id/eu-ai-act-classification",
    call: (api, id) => api.get(`/api/projects/${id}/eu-ai-act-classification`),
    success: 200,
  },
  {
    name: "PUT /api/ce-marking/:projectId",
    call: (api, id) => api.put(`/api/ce-marking/${id}`).send({ isHighRiskAISystem: true }),
    success: 200,
    prepare: addCeMarking,
    verify: (after) => expect(after.ceMarking.is_high_risk_ai_system).toBe(true),
  },
  {
    name: "PUT /api/fria/:projectId",
    call: (api, id) => api.put(`/api/fria/${id}`).send({ operational_context: "Updated" }),
    success: 200,
    prepare: addFria,
    verify: (after) => expect(after.fria.operational_context).toBe("Updated"),
  },
  {
    name: "POST /api/pmm/projects/:projectId/start-cycle",
    call: (api, id) => api.post(`/api/pmm/projects/${id}/start-cycle`),
    success: 500,
    prepare: addPmmConfig,
  },
  {
    name: "POST /api/frameworks/toProject",
    call: (api, id) =>
      api.post(`/api/frameworks/toProject?frameworkId=${NEW_FRAMEWORK_ID}&projectId=${id}`),
    success: 200,
    verify: (after) => expect(after.frameworks).toEqual([NEW_FRAMEWORK_ID]),
  },
  {
    name: "DELETE /api/frameworks/fromProject",
    call: (api, id) =>
      api.delete(`/api/frameworks/fromProject?frameworkId=${NEW_FRAMEWORK_ID}&projectId=${id}`),
    success: 200,
    prepare: (orgId, projectId) =>
      sequelize.transaction(async (transaction) => {
        await addFrameworkToProjectQuery(NEW_FRAMEWORK_ID, projectId, orgId, transaction);
      }),
    verify: (after) => expect(after.frameworks).toEqual([]),
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

      expect(res.status).toBe(route.missing ?? 404);
      expect(await snapshot(projectId)).toEqual(before);
    });

    it("still returns its usual answer for a use case that does not exist", async () => {
      const api = await apiAs(orgId, await user(orgId, "Editor"), "Editor");
      const res = await route.call(api, 2147483000);
      expect(res.status).toBe(route.missing ?? 404);
    });
  });

  describe("assignees of a task linked to the use case", () => {
    const READS = GUARDED_ROUTES.filter((route) => route.name.startsWith("GET "));
    const WRITES = GUARDED_ROUTES.filter((route) => !route.name.startsWith("GET "));

    async function linkedTask(
      entityId: number,
      entityType: string,
      assignee: number,
      status = "Open",
    ): Promise<number> {
      const taskId = await createTestTask(orgId, { status });
      await assignTaskToUser(orgId, taskId, assignee);
      await sequelize.query(
        `INSERT INTO task_entity_links (organization_id, task_id, entity_id, entity_type)
         VALUES (:orgId, :taskId, :entityId, :entityType)`,
        { replacements: { orgId, taskId, entityId, entityType } },
      );
      return taskId;
    }

    async function euControlOf(projectId: number): Promise<number> {
      const [existing] = await sequelize.query(
        `SELECT id FROM projects_frameworks WHERE project_id = :projectId AND framework_id = :id`,
        { replacements: { projectId, id: EU_AI_ACT_FRAMEWORK_ID } },
      );
      const projectFrameworkId =
        (existing as any[])[0]?.id ??
        (await createTestProjectFramework(orgId, projectId, EU_AI_ACT_FRAMEWORK_ID));
      return createTestControlEU(orgId, { projects_frameworks_id: projectFrameworkId });
    }

    async function assigneeOf(projectId: number): Promise<number> {
      const assignee = await user(orgId, "Editor");
      await linkedTask(await euControlOf(projectId), "eu_control", assignee);
      return assignee;
    }

    it.each(READS)("lets the assignee read $name", async (route) => {
      const projectId = await createTestProject(orgId, ownerId);
      await route.prepare?.(orgId, projectId);
      const assignee = await assigneeOf(projectId);

      const res = await route.call(await apiAs(orgId, assignee, "Editor"), projectId);

      expect(res.status).toBe(route.success);
    });

    it.each(WRITES)("does not let the assignee use $name", async (route) => {
      const projectId = await createTestProject(orgId, ownerId);
      await route.prepare?.(orgId, projectId);
      const assignee = await assigneeOf(projectId);
      const before = await snapshot(projectId);

      const res = await route.call(await apiAs(orgId, assignee, "Editor"), projectId);

      expect(res.status).toBe(403);
      expect(await snapshot(projectId)).toEqual(before);
    });

    const readProgress = (api: Api, id: number) =>
      api.get(`/api/projects/calculateProjectRisks/${id}`);

    it("follows a subcontrol link through its parent control", async () => {
      const projectId = await createTestProject(orgId, ownerId);
      const controlId = await euControlOf(projectId);
      const [subcontrol] = await sequelize.query(
        `INSERT INTO subcontrols_eu (organization_id, control_id) VALUES (:orgId, :controlId)
         RETURNING id`,
        { replacements: { orgId, controlId } },
      );
      const assignee = await user(orgId, "Editor");
      await linkedTask((subcontrol as any[])[0].id, "eu_subcontrol", assignee);

      const res = await readProgress(await apiAs(orgId, assignee, "Editor"), projectId);

      expect(res.status).toBe(200);
    });

    it("follows an ISO 42001 requirement link", async () => {
      const projectId = await createTestProject(orgId, ownerId);
      const projectFrameworkId = await createTestProjectFramework(orgId, projectId, 2);
      const [subclause] = await sequelize.query(
        `INSERT INTO subclauses_iso (organization_id, projects_frameworks_id)
         VALUES (:orgId, :projectFrameworkId) RETURNING id`,
        { replacements: { orgId, projectFrameworkId } },
      );
      const assignee = await user(orgId, "Editor");
      await linkedTask((subclause as any[])[0].id, "iso42001_subclause", assignee);

      const res = await readProgress(await apiAs(orgId, assignee, "Editor"), projectId);

      expect(res.status).toBe(200);
    });

    it("refuses the assignee of a task linked to another use case", async () => {
      const projectId = await createTestProject(orgId, ownerId);
      const other = await createTestProject(orgId, ownerId);
      const assignee = await assigneeOf(other);

      const res = await readProgress(await apiAs(orgId, assignee, "Editor"), projectId);

      expect(res.status).toBe(403);
    });

    it("refuses someone whose task link is organization-wide", async () => {
      const projectId = await createTestProject(orgId, ownerId);
      const vendorId = await createTestVendor(orgId);
      const assignee = await user(orgId, "Editor");
      await linkedTask(vendorId, "vendor", assignee);

      const res = await readProgress(await apiAs(orgId, assignee, "Editor"), projectId);

      expect(res.status).toBe(403);
    });

    it("refuses the assignee of a deleted task", async () => {
      const projectId = await createTestProject(orgId, ownerId);
      const assignee = await user(orgId, "Editor");
      await linkedTask(await euControlOf(projectId), "eu_control", assignee, "Deleted");

      const res = await readProgress(await apiAs(orgId, assignee, "Editor"), projectId);

      expect(res.status).toBe(403);
    });

    it("refuses someone else on the same control's task", async () => {
      const projectId = await createTestProject(orgId, ownerId);
      await assigneeOf(projectId);
      const stranger = await user(orgId, "Editor");

      const res = await readProgress(await apiAs(orgId, stranger, "Editor"), projectId);

      expect(res.status).toBe(403);
    });

    it("does not add the use case to the assignee's list", async () => {
      const projectId = await createTestProject(orgId, ownerId);
      const assignee = await assigneeOf(projectId);

      const res = await (await apiAs(orgId, assignee, "Editor")).get("/api/projects");

      const ids = (res.body.data ?? []).map((project: { id: number }) => project.id);
      expect(ids).not.toContain(projectId);
    });
  });

  describe("framework routes take the id from the query", () => {
    const toProject = (api: Api, query: string, body: object = {}) =>
      api.post(`/api/frameworks/toProject?${query}`).send(body);

    it("checks the query's id, not one placed in the body", async () => {
      const projectId = await createTestProject(orgId, ownerId);
      const before = await snapshot(projectId);
      const stranger = await user(orgId, "Editor");
      const theirs = await createTestProject(orgId, stranger);

      const res = await toProject(
        await apiAs(orgId, stranger, "Editor"),
        `frameworkId=${NEW_FRAMEWORK_ID}&projectId=${projectId}`,
        { projectId: theirs },
      );

      expect(res.status).toBe(403);
      expect(await snapshot(projectId)).toEqual(before);
    });

    it("refuses a repeated projectId rather than picking one", async () => {
      const projectId = await createTestProject(orgId, ownerId);
      const before = await snapshot(projectId);
      const stranger = await user(orgId, "Editor");
      const theirs = await createTestProject(orgId, stranger);

      const res = await toProject(
        await apiAs(orgId, stranger, "Editor"),
        `frameworkId=${NEW_FRAMEWORK_ID}&projectId=${theirs}&projectId=${projectId}`,
      );

      expect(res.status).toBe(400);
      expect(await snapshot(projectId)).toEqual(before);
    });

    it("refuses an id only given in the body", async () => {
      const projectId = await createTestProject(orgId, ownerId);

      const res = await toProject(
        await apiAs(orgId, ownerId, "Editor"),
        `frameworkId=${NEW_FRAMEWORK_ID}`,
        { projectId },
      );

      expect(res.status).toBe(400);
      expect((await snapshot(projectId)).frameworks).toEqual([]);
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

    it("answers an unparsable id with the guard's 400", async () => {
      const api = await apiAs(orgId, ownerId, "Editor");
      const res = await goLive(api, "abc");
      expect(res.status).toBe(400);
      expect(res.body.data).toBe("Invalid project ID");
    });
  });

  it("leaves GET /api/projects/:id open to a non-member, whom approval links reach", async () => {
    const projectId = await createTestProject(orgId, ownerId);
    const approver = await user(orgId, "Reviewer");

    const res = await (await apiAs(orgId, approver, "Reviewer")).get(`/api/projects/${projectId}`);

    expect(res.status).toBe(200);
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
