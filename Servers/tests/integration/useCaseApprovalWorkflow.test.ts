jest.setTimeout(120000);

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";

/**
 * A use case's approval workflow and its approval state (#5187 lifecycle,
 * audit U-H2, U-M2, U-L1):
 *
 * - while a request is pending or rejected, only an approval workflow admin
 *   may clear or replace the workflow, on the legacy and the v1 PATCH;
 * - clearing the workflow of a rejected use case never attaches the parked
 *   frameworks;
 * - a workflow change is recorded in the use case's change history;
 * - a use case goes live only once approved, or when it has no workflow and
 *   no decision;
 * - two saves attaching a workflow at once open one request;
 * - a workflow that is missing, from another organization, inactive, not a
 *   use case workflow, or has a step without approvers is a 400 on create
 *   and update, and nothing is written;
 * - a framework of the wrong scope and an over-long title are 400s, not 500s.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;

let counter = 0;
async function userIn(orgId: number, role: RoleName): Promise<number> {
  counter += 1;
  return createTestUser(
    orgId,
    ROLE[role],
    `ucwf-${role}-${Date.now()}-${counter}@test.com`,
    "Pw123456!",
  );
}

async function as(orgId: number, userId: number, role: RoleName) {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role },
  });
  return testRequest(app);
}

async function select<T = any>(sql: string, replacements: Record<string, unknown>): Promise<T[]> {
  const [rows] = await sequelize.query(sql, { replacements });
  return rows as T[];
}

async function useCaseFrameworkId(organizational: boolean): Promise<number> {
  const rows = await select<{ id: number }>(
    `SELECT id FROM frameworks WHERE is_organizational = :organizational ORDER BY id LIMIT 1`,
    { organizational },
  );
  return Number(rows[0].id);
}

/** A use case workflow written straight to the tables, so broken ones can be built too. */
async function insertWorkflow(
  orgId: number,
  opts: {
    entityType?: string;
    active?: boolean;
    steps?: number[][];
    title?: string;
  } = {},
): Promise<number> {
  const [wf] = await select<{ id: number }>(
    `INSERT INTO approval_workflows (organization_id, workflow_title, entity_type, is_active)
     VALUES (:orgId, :title, :entityType, :active) RETURNING id`,
    {
      orgId,
      title: opts.title ?? `Workflow ${Date.now()}-${(counter += 1)}`,
      entityType: opts.entityType ?? "use_case",
      active: opts.active ?? true,
    },
  );
  const steps = opts.steps ?? [];
  for (let i = 0; i < steps.length; i += 1) {
    const [step] = await select<{ id: number }>(
      `INSERT INTO approval_workflow_steps
         (organization_id, workflow_id, step_number, step_name, requires_all_approvers)
       VALUES (:orgId, :workflowId, :stepNumber, :name, false) RETURNING id`,
      { orgId, workflowId: wf.id, stepNumber: i + 1, name: `Step ${i + 1}` },
    );
    for (const approverId of steps[i]) {
      await sequelize.query(
        `INSERT INTO approval_step_approvers (organization_id, workflow_step_id, approver_id)
         VALUES (:orgId, :stepId, :approverId)`,
        { replacements: { orgId, stepId: step.id, approverId } },
      );
    }
  }
  return Number(wf.id);
}

async function project(projectId: number) {
  const [row] = await select(
    `SELECT approval_workflow_id, pending_frameworks, lifecycle_stage
       FROM projects WHERE id = :projectId`,
    { projectId },
  );
  return row;
}

async function requests(projectId: number): Promise<string[]> {
  const rows = await select<{ status: string }>(
    `SELECT status FROM approval_requests
      WHERE entity_type = 'use_case' AND entity_id = :projectId ORDER BY id`,
    { projectId },
  );
  return rows.map((r) => r.status);
}

async function attachedFrameworks(projectId: number): Promise<number[]> {
  const rows = await select<{ framework_id: number }>(
    `SELECT framework_id FROM projects_frameworks WHERE project_id = :projectId ORDER BY framework_id`,
    { projectId },
  );
  return rows.map((r) => Number(r.framework_id));
}

async function projectCount(orgId: number): Promise<number> {
  const [row] = await select<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM projects WHERE organization_id = :orgId`,
    { orgId },
  );
  return Number(row.n);
}

const useCaseBody = (owner: number, extra: Record<string, unknown> = {}) => ({
  project_title: "Credit scoring",
  owner,
  start_date: "2026-06-01",
  geography: 1,
  members: [],
  ...extra,
});

/**
 * The 400 for an unusable workflow. The legacy /api/projects contract is
 * frozen, so it answers with the plain message; /api/v1 names the field.
 */
function expectWorkflowError(base: string, body: any) {
  if (base === "/api/projects") {
    expect(typeof body.data).toBe("string");
    expect(body.data).toMatch(/approval workflow/);
  } else {
    expect(body.data.errors).toEqual([
      expect.objectContaining({ field: "approval_workflow_id", location: "body" }),
    ]);
  }
}

describe("use case approval workflow", () => {
  let orgId: number;
  let adminId: number;
  let editorId: number;
  let admin: Awaited<ReturnType<typeof as>>;
  let editor: Awaited<ReturnType<typeof as>>;
  let frameworkId: number;
  let workflowId: number;

  beforeEach(async () => {
    await cleanupDatabase();
    orgId = await createTestOrganization();
    adminId = await userIn(orgId, "Admin");
    editorId = await userIn(orgId, "Editor");
    admin = await as(orgId, adminId, "Admin");
    editor = await as(orgId, editorId, "Editor");
    frameworkId = await useCaseFrameworkId(false);
    workflowId = await insertWorkflow(orgId, { steps: [[adminId]] });
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  /** The Editor creates (and owns) a use case under review, with one parked framework. */
  async function useCaseUnderReview(): Promise<{ projectId: number; requestId: number }> {
    const created = await editor
      .post("/api/projects")
      .send(useCaseBody(editorId, { framework: [frameworkId], approval_workflow_id: workflowId }));
    expect(created.status).toBe(201);
    const projectId = Number(created.body.data.project.id);
    const [req] = await select<{ id: number }>(
      `SELECT id FROM approval_requests
        WHERE entity_type = 'use_case' AND entity_id = :projectId AND status = 'Pending'`,
      { projectId },
    );
    return { projectId, requestId: Number(req.id) };
  }

  async function reject(requestId: number) {
    const res = await admin
      .post(`/api/approval-requests/${requestId}/reject`)
      .send({ comments: "Not yet" });
    expect(res.status).toBe(200);
  }

  describe("changing the workflow while a request is pending", () => {
    it.each([
      ["legacy", "/api/projects"],
      ["v1", "/api/v1/projects"],
    ])("refuses the owner clearing it (%s) and changes nothing", async (_label, base) => {
      const { projectId } = await useCaseUnderReview();
      const before = await project(projectId);

      const res = await editor.patch(`${base}/${projectId}`).send({ approval_workflow_id: null });

      expect(res.status).toBe(403);
      expect(await requests(projectId)).toEqual(["Pending"]);
      expect(await project(projectId)).toEqual(before);
      expect(before.approval_workflow_id).toBe(workflowId);
      expect(before.lifecycle_stage).toBe("in_review");
      expect(await attachedFrameworks(projectId)).toEqual([]);
    });

    it.each([
      ["legacy", "/api/projects"],
      ["v1", "/api/v1/projects"],
    ])("refuses the owner replacing it (%s)", async (_label, base) => {
      const { projectId } = await useCaseUnderReview();
      const lenient = await insertWorkflow(orgId, { steps: [[editorId]] });

      const res = await editor
        .patch(`${base}/${projectId}`)
        .send({ approval_workflow_id: lenient });

      expect(res.status).toBe(403);
      expect(await requests(projectId)).toEqual(["Pending"]);
      expect((await project(projectId)).approval_workflow_id).toBe(workflowId);
    });

    it("refuses it in the same request as other edits, and keeps those too", async () => {
      const { projectId } = await useCaseUnderReview();
      const res = await editor
        .patch(`/api/projects/${projectId}`)
        .send({ project_title: "Renamed", approval_workflow_id: null });
      expect(res.status).toBe(403);
      const [row] = await select(`SELECT project_title FROM projects WHERE id = :projectId`, {
        projectId,
      });
      expect(row.project_title).toBe("Credit scoring");
    });

    it("lets the owner save the form with the same workflow, sent as a string", async () => {
      const { projectId } = await useCaseUnderReview();
      const res = await editor
        .patch(`/api/projects/${projectId}`)
        .send({ project_title: "Renamed", approval_workflow_id: String(workflowId) });
      expect(res.status).toBe(202);
      expect(await requests(projectId)).toEqual(["Pending"]);
    });

    it("lets an approval workflow admin clear it: withdrawn, frameworks attached, history kept", async () => {
      const { projectId } = await useCaseUnderReview();

      const res = await admin
        .patch(`/api/v1/projects/${projectId}`)
        .send({ approval_workflow_id: null });

      expect(res.status).toBe(202);
      expect(await requests(projectId)).toEqual(["Withdrawn"]);
      expect(await attachedFrameworks(projectId)).toEqual([frameworkId]);
      expect((await project(projectId)).approval_workflow_id).toBeNull();

      const history = await select<{ old_value: string; new_value: string }>(
        `SELECT old_value, new_value FROM use_case_change_history
          WHERE use_case_id = :projectId AND field_name = 'Approval workflow'`,
        { projectId },
      );
      expect(history).toHaveLength(1);
      expect(history[0].new_value).toBe("-");
      expect(history[0].old_value).toMatch(/^Workflow /);
    });

    it("lets an approval workflow admin replace it: a new request under the new workflow", async () => {
      const { projectId } = await useCaseUnderReview();
      const other = await insertWorkflow(orgId, { steps: [[adminId]], title: "Second review" });

      const res = await admin.patch(`/api/projects/${projectId}`).send({
        approval_workflow_id: other,
      });

      expect(res.status).toBe(202);
      expect(await requests(projectId)).toEqual(["Withdrawn", "Pending"]);
      const history = await select<{ old_value: string; new_value: string }>(
        `SELECT old_value, new_value FROM use_case_change_history
          WHERE use_case_id = :projectId AND field_name = 'Approval workflow'`,
        { projectId },
      );
      expect(history.map((h) => h.new_value)).toEqual(["Second review"]);
    });

    it("still lets the requester withdraw through the approval request route", async () => {
      const { projectId, requestId } = await useCaseUnderReview();
      const res = await editor.post(`/api/approval-requests/${requestId}/withdraw`);
      expect(res.status).toBe(200);
      expect(await requests(projectId)).toEqual(["Withdrawn"]);
    });
    // History compares the workflow by id: the same title on both sides is
    // still a change.
    it("records replacing it with another workflow of the same title", async () => {
      const first = await insertWorkflow(orgId, { steps: [[adminId]], title: "Sign-off" });
      const second = await insertWorkflow(orgId, { steps: [[adminId]], title: "Sign-off" });
      const created = await editor
        .post("/api/v1/projects")
        .send(useCaseBody(editorId, { approval_workflow_id: first }));
      expect(created.status).toBe(201);
      const projectId = Number(created.body.data.project.id);

      const res = await admin
        .patch(`/api/v1/projects/${projectId}`)
        .send({ approval_workflow_id: second });

      expect(res.status).toBe(202);
      const history = await select<{ old_value: string; new_value: string }>(
        `SELECT old_value, new_value FROM use_case_change_history
          WHERE use_case_id = :projectId AND field_name = 'Approval workflow'`,
        { projectId },
      );
      expect(history).toEqual([{ old_value: "Sign-off", new_value: "Sign-off" }]);
    });
  });

  // Two saves that attach a workflow at the same time each read "no workflow"
  // and each opened a pending request. The workflow is now read under a row
  // lock, so the second save sees the first one's workflow.
  describe("attaching a workflow from two saves at once", () => {
    it("opens one pending request when both send the same workflow", async () => {
      const created = await editor
        .post("/api/v1/projects")
        .send(useCaseBody(editorId, { framework: [frameworkId] }));
      expect(created.status).toBe(201);
      const projectId = Number(created.body.data.project.id);

      const results = await Promise.all([
        editor.patch(`/api/v1/projects/${projectId}`).send({ approval_workflow_id: workflowId }),
        editor.patch(`/api/v1/projects/${projectId}`).send({ approval_workflow_id: workflowId }),
      ]);

      expect(results.map((r) => r.status)).toEqual([202, 202]);
      expect(await requests(projectId)).toEqual(["Pending"]);
    });

    it("refuses the second of two different workflows once the first is under review", async () => {
      const created = await editor
        .post("/api/v1/projects")
        .send(useCaseBody(editorId, { framework: [frameworkId] }));
      const projectId = Number(created.body.data.project.id);
      const other = await insertWorkflow(orgId, { steps: [[adminId]] });

      const results = await Promise.all([
        editor.patch(`/api/v1/projects/${projectId}`).send({ approval_workflow_id: workflowId }),
        editor.patch(`/api/v1/projects/${projectId}`).send({ approval_workflow_id: other }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([202, 403]);
      expect(await requests(projectId)).toEqual(["Pending"]);
    });
  });

  describe("a rejected use case", () => {
    it("refuses the owner clearing or replacing the workflow", async () => {
      const { projectId, requestId } = await useCaseUnderReview();
      await reject(requestId);
      const lenient = await insertWorkflow(orgId, { steps: [[editorId]] });

      const cleared = await editor
        .patch(`/api/projects/${projectId}`)
        .send({ approval_workflow_id: null });
      const replaced = await editor
        .patch(`/api/v1/projects/${projectId}`)
        .send({ approval_workflow_id: lenient });

      expect(cleared.status).toBe(403);
      expect(replaced.status).toBe(403);
      expect(await requests(projectId)).toEqual(["Rejected"]);
      expect(await attachedFrameworks(projectId)).toEqual([]);
    });

    it("never attaches the parked frameworks when an admin clears the workflow", async () => {
      const { projectId, requestId } = await useCaseUnderReview();
      await reject(requestId);

      const res = await admin
        .patch(`/api/projects/${projectId}`)
        .send({ approval_workflow_id: null });

      expect(res.status).toBe(202);
      expect(await attachedFrameworks(projectId)).toEqual([]);
      const row = await project(projectId);
      expect(row.approval_workflow_id).toBeNull();
      expect(row.pending_frameworks).toEqual([frameworkId]);
      expect(await requests(projectId)).toEqual(["Rejected"]);
    });

    it("cannot go live, and can once a new review approves it", async () => {
      const { projectId, requestId } = await useCaseUnderReview();
      await reject(requestId);
      expect((await project(projectId)).lifecycle_stage).toBe("planned");

      const refused = await editor.post(`/api/v1/use-case-lifecycle/${projectId}/go-live`).send({});
      expect(refused.status).toBe(409);
      expect(refused.body.data).toBe("Approve this use case before marking it as live");
      expect((await project(projectId)).lifecycle_stage).toBe("planned");

      const got = await editor.get(`/api/projects/${projectId}`);
      expect(got.body.data.approval_status).toBe("rejected");

      // A new review under another workflow, approved: no longer rejected.
      const other = await insertWorkflow(orgId, { steps: [[adminId]] });
      const replaced = await admin
        .patch(`/api/projects/${projectId}`)
        .send({ approval_workflow_id: other });
      expect(replaced.status).toBe(202);
      const [pending] = await select<{ id: number }>(
        `SELECT id FROM approval_requests
          WHERE entity_type = 'use_case' AND entity_id = :projectId AND status = 'Pending'`,
        { projectId },
      );
      const approved = await admin
        .post(`/api/approval-requests/${pending.id}/approve`)
        .send({ comments: "Fine" });
      expect(approved.status).toBe(200);
      expect(await attachedFrameworks(projectId)).toEqual([frameworkId]);
      expect((await editor.get(`/api/projects/${projectId}`)).body.data.approval_status).toBeNull();

      const live = await editor.post(`/api/v1/use-case-lifecycle/${projectId}/go-live`).send({});
      expect(live.status).toBe(200);
    });
  });

  // Live needs an approval: the latest decision is Approved, or the use case
  // has no workflow and no decision at all.
  describe("going live", () => {
    it("is refused while a workflow is attached and its request was withdrawn", async () => {
      const { projectId, requestId } = await useCaseUnderReview();
      const withdrawn = await editor.post(`/api/approval-requests/${requestId}/withdraw`);
      expect(withdrawn.status).toBe(200);
      const row = await project(projectId);
      expect(row.lifecycle_stage).toBe("planned");
      expect(row.approval_workflow_id).toBe(workflowId);

      const res = await editor.post(`/api/v1/use-case-lifecycle/${projectId}/go-live`).send({});

      expect(res.status).toBe(409);
      expect(res.body.data).toBe("Approve this use case before marking it as live");
      expect((await project(projectId)).lifecycle_stage).toBe("planned");
    });

    it("is allowed for a use case with no workflow that was never reviewed", async () => {
      const created = await editor.post("/api/v1/projects").send(useCaseBody(editorId));
      expect(created.status).toBe(201);
      const projectId = Number(created.body.data.project.id);

      const res = await editor.post(`/api/v1/use-case-lifecycle/${projectId}/go-live`).send({});

      expect(res.status).toBe(200);
      expect((await project(projectId)).lifecycle_stage).toBe("live");
    });
  });

  describe("workflows that cannot review a use case", () => {
    type Bad = [string, () => Promise<number>];
    const badWorkflows: Bad[] = [
      ["missing", async () => 99999999],
      [
        "from another organization",
        async () => {
          const otherOrg = await createTestOrganization();
          const otherAdmin = await userIn(otherOrg, "Admin");
          return insertWorkflow(otherOrg, { steps: [[otherAdmin]] });
        },
      ],
      ["inactive", async () => insertWorkflow(orgId, { active: false, steps: [[adminId]] })],
      [
        "for another entity type",
        async () => insertWorkflow(orgId, { entityType: "file", steps: [[adminId]] }),
      ],
      ["without steps", async () => insertWorkflow(orgId, { steps: [] })],
      [
        "with a step without approvers",
        async () => insertWorkflow(orgId, { steps: [[adminId], []] }),
      ],
    ];

    for (const base of ["/api/projects", "/api/v1/projects"]) {
      it.each(badWorkflows)(
        `create on ${base}: %s is a 400 and creates nothing`,
        async (_l, make) => {
          const bad = await make();
          const before = await projectCount(orgId);

          const res = await editor
            .post(base)
            .send(useCaseBody(editorId, { framework: [frameworkId], approval_workflow_id: bad }));

          expect(res.status).toBe(400);
          expectWorkflowError(base, res.body);
          expect(await projectCount(orgId)).toBe(before);
        },
      );

      it.each(badWorkflows)(
        `update on ${base}: %s is a 400 and changes nothing`,
        async (_l, make) => {
          const created = await editor
            .post("/api/projects")
            .send(useCaseBody(editorId, { framework: [frameworkId] }));
          expect(created.status).toBe(201);
          const projectId = Number(created.body.data.project.id);
          const bad = await make();

          const res = await editor
            .patch(`${base}/${projectId}`)
            .send({ approval_workflow_id: bad });

          expect(res.status).toBe(400);
          expectWorkflowError(base, res.body);
          expect((await project(projectId)).approval_workflow_id).toBeNull();
          expect(await requests(projectId)).toEqual([]);
        },
      );
    }

    it("still lets the owner attach a usable workflow to a use case with no request", async () => {
      const created = await editor
        .post("/api/projects")
        .send(useCaseBody(editorId, { framework: [frameworkId] }));
      const projectId = Number(created.body.data.project.id);
      const res = await editor
        .patch(`/api/projects/${projectId}`)
        .send({ approval_workflow_id: workflowId });
      expect(res.status).toBe(202);
      expect(await requests(projectId)).toEqual(["Pending"]);
    });
  });

  describe("bad inputs that used to be 500s", () => {
    it.each(["/api/projects", "/api/v1/projects"])(
      "a framework of the wrong scope is a 400 on %s",
      async (base) => {
        const organizationalFramework = await useCaseFrameworkId(true);
        const before = await projectCount(orgId);
        const res = await editor
          .post(base)
          .send(useCaseBody(editorId, { framework: [organizationalFramework] }));
        expect(res.status).toBe(400);
        if (base === "/api/projects") {
          // Frozen legacy contract: the plain message.
          expect(res.body.data).toBe(
            `Framework ${organizationalFramework} can't be used for this kind of use case`,
          );
        } else {
          expect(res.body.data.errors).toEqual([
            expect.objectContaining({ field: "framework", location: "body" }),
          ]);
        }
        expect(await projectCount(orgId)).toBe(before);
      },
    );

    it.each(["/api/projects", "/api/v1/projects"])(
      "a title over 255 characters is a 400 on create and update (%s)",
      async (base) => {
        const long = "x".repeat(256);
        const create = await editor.post(base).send(useCaseBody(editorId, { project_title: long }));
        expect(create.status).toBe(400);
        expect(JSON.stringify(create.body)).toContain("project_title");

        const created = await editor.post(base).send(useCaseBody(editorId));
        expect(created.status).toBe(201);
        const projectId = Number(created.body.data.project.id);
        const update = await editor.patch(`${base}/${projectId}`).send({ project_title: long });
        expect(update.status).toBe(400);
        expect(JSON.stringify(update.body)).toContain("project_title");

        const exact = await editor
          .patch(`${base}/${projectId}`)
          .send({ project_title: "y".repeat(255) });
        expect(exact.status).toBe(202);
      },
    );
  });
});
