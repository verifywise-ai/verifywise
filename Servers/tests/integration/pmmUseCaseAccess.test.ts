jest.setTimeout(120000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { createTestProject } from "../factories";

/**
 * Post-market monitoring routes keyed by a config, cycle or report id run the
 * access rule of the use case the config monitors. The stakeholder assigned to
 * a cycle may open, fill in, flag and submit that cycle without being on the
 * use case, as the monitoring email asks them to.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;
type Api = ReturnType<typeof testRequest>;
interface Ctx {
  project: number;
  config: number;
  question: number;
  cycle: number;
  report: number;
}

let counter = 0;
async function user(orgId: number, role: RoleName): Promise<number> {
  counter += 1;
  return createTestUser(orgId, ROLE[role], `pmm-${Date.now()}-${counter}@test.com`, "Pw1!x");
}

async function apiAs(orgId: number, userId: number, role: RoleName): Promise<Api> {
  return testRequest(
    await createTestApp({ bypassAuth: true, mockUser: { userId, organizationId: orgId, role } }),
  );
}

const insertId = async (sql: string, replacements: Record<string, unknown>) =>
  (await sequelize.query<{ id: number }>(sql, { replacements, type: QueryTypes.SELECT }))[0].id;

const count = async (sql: string, replacements: Record<string, unknown>) =>
  Number(
    (await sequelize.query<{ n: number }>(sql, { replacements, type: QueryTypes.SELECT }))[0].n,
  );

async function seedMonitoring(orgId: number, ownerId: number, stakeholder?: number): Promise<Ctx> {
  const project = await createTestProject(orgId, ownerId);
  const config = await insertId(
    `INSERT INTO post_market_monitoring_configs (organization_id, project_id, is_active)
     VALUES (:orgId, :project, TRUE) RETURNING id`,
    { orgId, project },
  );
  const question = await insertId(
    `INSERT INTO post_market_monitoring_questions
       (organization_id, config_id, question_text, question_type, is_required)
     VALUES (:orgId, :config, 'Any incidents?', 'yes_no', FALSE) RETURNING id`,
    { orgId, config },
  );
  const cycle = await insertId(
    `INSERT INTO post_market_monitoring_cycles
       (organization_id, config_id, cycle_number, due_at, assigned_stakeholder_id)
     VALUES (:orgId, :config, 1, NOW() + INTERVAL '7 days', :stakeholder) RETURNING id`,
    { orgId, config, stakeholder: stakeholder ?? null },
  );
  const report = await insertId(
    `INSERT INTO post_market_monitoring_reports (organization_id, cycle_id)
     VALUES (:orgId, :cycle) RETURNING id`,
    { orgId, cycle },
  );
  return { project, config, question, cycle, report };
}

/** Everything a refused write could have changed. */
const snapshot = async (c: Ctx) =>
  count(
    `SELECT (SELECT COUNT(*) FROM post_market_monitoring_configs
              WHERE id = :config AND reminder_days = 3)
          + (SELECT COUNT(*) FROM post_market_monitoring_questions WHERE config_id = :config)
          + (SELECT COUNT(*) FROM post_market_monitoring_responses WHERE cycle_id = :cycle)
          + (SELECT COUNT(*) FROM post_market_monitoring_cycles
              WHERE id = :cycle AND status = 'pending' AND assigned_stakeholder_id IS NULL)
          + (SELECT COUNT(*) FROM post_market_monitoring_configs WHERE project_id = :project) AS n`,
    c as unknown as Record<string, unknown>,
  );

interface Route {
  name: string;
  call: (api: Api, c: Ctx, users: { other: number }) => any;
  success: number;
  /** Another organization's Admin; default 404. */
  missing?: number;
  /** The cycle's stakeholder may use it without use case access. */
  stakeholder?: boolean;
  write?: boolean;
}

const ROUTES: Route[] = [
  {
    name: "GET /api/pmm/config/:projectId",
    call: (a, c) => a.get(`/api/pmm/config/${c.project}`),
    success: 200,
  },
  {
    name: "PUT /api/pmm/config/:configId",
    call: (a, c) => a.put(`/api/pmm/config/${c.config}`).send({ reminder_days: 5 }),
    success: 200,
    write: true,
  },
  {
    name: "DELETE /api/pmm/config/:configId",
    call: (a, c) => a.delete(`/api/pmm/config/${c.config}`),
    // The handler misreads the DELETE row count and answers 404 even when it deletes.
    success: 404,
    write: true,
  },
  {
    name: "GET /api/pmm/config/:configId/questions",
    call: (a, c) => a.get(`/api/pmm/config/${c.config}/questions`),
    success: 200,
    missing: 200,
    stakeholder: true,
  },
  {
    name: "POST /api/pmm/config/:configId/questions",
    call: (a, c) =>
      a
        .post(`/api/pmm/config/${c.config}/questions`)
        .send({ question_text: "New?", question_type: "yes_no" }),
    success: 201,
    write: true,
  },
  {
    name: "GET /api/pmm/active-cycle/:projectId",
    call: (a, c) => a.get(`/api/pmm/active-cycle/${c.project}`),
    success: 200,
  },
  {
    name: "GET /api/pmm/cycles/:cycleId",
    call: (a, c) => a.get(`/api/pmm/cycles/${c.cycle}`),
    success: 200,
    stakeholder: true,
  },
  {
    name: "GET /api/pmm/cycles/:cycleId/responses",
    call: (a, c) => a.get(`/api/pmm/cycles/${c.cycle}/responses`),
    success: 200,
    stakeholder: true,
  },
  {
    name: "POST /api/pmm/cycles/:cycleId/responses",
    call: (a, c) =>
      a
        .post(`/api/pmm/cycles/${c.cycle}/responses`)
        .send({ responses: [{ question_id: c.question, response_value: true }] }),
    // The response upsert's ON CONFLICT has no matching constraint: past the
    // guard the handler fails with 500 for everyone.
    success: 500,
    stakeholder: true,
    write: true,
  },
  {
    name: "POST /api/pmm/cycles/:cycleId/flag",
    call: (a, c) =>
      a
        .post(`/api/pmm/cycles/${c.cycle}/flag`)
        .send({ question_id: c.question, response_value: true }),
    // The response upsert's ON CONFLICT has no matching constraint: past the
    // guard the handler fails with 500 for everyone.
    success: 500,
    stakeholder: true,
    write: true,
  },
  {
    name: "POST /api/pmm/cycles/:cycleId/submit",
    call: (a, c) =>
      a
        .post(`/api/pmm/cycles/${c.cycle}/submit`)
        .send({ responses: [{ question_id: c.question, response_value: true }] }),
    // The response upsert's ON CONFLICT has no matching constraint: past the
    // guard the handler fails with 500 for everyone.
    success: 500,
    stakeholder: true,
    write: true,
  },
  {
    name: "POST /api/pmm/cycles/:cycleId/reassign",
    call: (a, c, u) =>
      a.post(`/api/pmm/cycles/${c.cycle}/reassign`).send({ stakeholder_id: u.other }),
    success: 200,
    write: true,
  },
  {
    name: "GET /api/pmm/reports/:reportId/download",
    call: (a, c) => a.get(`/api/pmm/reports/${c.report}/download`),
    success: 404,
    stakeholder: true,
  },
  {
    name: "POST /api/pmm/config (project_id in the body)",
    call: (a, c) => a.post(`/api/pmm/config`).send({ project_id: c.project }),
    success: 409,
    write: true,
  },
];

describe("post-market monitoring routes run the use case access rule", () => {
  let orgId: number;
  let ownerId: number;
  let adminId: number;
  let otherId: number;

  beforeAll(async () => {
    await cleanupDatabase();
    orgId = await createTestOrganization();
    ownerId = await user(orgId, "Editor");
    adminId = await user(orgId, "Admin");
    otherId = await user(orgId, "Editor");
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  describe.each(ROUTES)("$name", (route) => {
    it.each(["Editor", "Auditor"] as const)(
      "refuses a %s who is not on the use case and changes nothing",
      async (role) => {
        const c = await seedMonitoring(orgId, ownerId);
        const before = await snapshot(c);
        const res = await route.call(await apiAs(orgId, await user(orgId, role), role), c, {
          other: otherId,
        });
        expect(res.status).toBe(403);
        expect(await snapshot(c)).toBe(before);
      },
    );

    it("lets a member of the use case through", async () => {
      const c = await seedMonitoring(orgId, ownerId);
      const member = await user(orgId, "Editor");
      await sequelize.query(
        `INSERT INTO projects_members (organization_id, project_id, user_id)
         VALUES (:orgId, :project, :member)`,
        { replacements: { orgId, project: c.project, member } },
      );
      const res = await route.call(await apiAs(orgId, member, "Editor"), c, { other: otherId });
      expect(res.status).toBe(route.success);
    });

    it("lets an Admin who is not on the use case through", async () => {
      const c = await seedMonitoring(orgId, ownerId);
      const res = await route.call(await apiAs(orgId, adminId, "Admin"), c, { other: otherId });
      expect(res.status).toBe(route.success);
    });

    it("gives another organization's Admin the handler's usual answer", async () => {
      const c = await seedMonitoring(orgId, ownerId);
      const before = await snapshot(c);
      const otherOrg = await createTestOrganization();
      const api = await apiAs(otherOrg, await user(otherOrg, "Admin"), "Admin");
      const res = await route.call(api, c, { other: otherId });
      expect(res.status).toBe(route.missing ?? 404);
      expect(await snapshot(c)).toBe(before);
    });

    it(`${route.stakeholder ? "lets" : "does not let"} the cycle's stakeholder who is not on the use case use it`, async () => {
      const stakeholder = await user(orgId, "Editor");
      const c = await seedMonitoring(orgId, ownerId, stakeholder);
      const res = await route.call(await apiAs(orgId, stakeholder, "Editor"), c, {
        other: otherId,
      });
      expect(res.status).toBe(route.stakeholder ? route.success : 403);
    });
  });
});
