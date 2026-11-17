jest.setTimeout(120000);

import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import {
  createTestAssessment,
  createTestControlEU,
  createTestProject,
  createTestProjectFramework,
} from "../factories";
import { getConfigById } from "../../utils/frameworkRegistry.utils";

/**
 * U-H4: routes keyed by something that belongs to a use case (a
 * projects_frameworks row, a requirement row, a FRIA) run the use case access
 * rule of requireProjectAccess. A caller who cannot see the use case gets
 * 403; its team and Admins get the handler's usual answer; another
 * organization's Admin still gets the handler's usual answer for a row it
 * cannot see (usually 404 or an empty list).
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
type RoleName = keyof typeof ROLE;
type Api = ReturnType<typeof testRequest>;
type Ctx = Record<string, number>;

/** The first bundled framework (ids 5–25) the registry knows. */
const BUNDLED_FRAMEWORK_ID = (() => {
  for (let id = 5; id <= 25; id++) if (getConfigById(id)) return id;
  throw new Error("no bundled framework in the registry");
})();

let counter = 0;
async function user(orgId: number, role: RoleName): Promise<number> {
  counter += 1;
  return createTestUser(orgId, ROLE[role], `uc-child-${Date.now()}-${counter}@test.com`, "Pw1!x");
}

async function apiAs(orgId: number, userId: number, role: RoleName): Promise<Api> {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role },
  });
  return testRequest(app);
}

async function insertId(sql: string, replacements: Record<string, unknown>): Promise<number> {
  const [rows] = await sequelize.query(sql, { replacements });
  return (rows as any[])[0].id;
}

const count = async (sql: string, replacements: Record<string, unknown>): Promise<number> => {
  const [rows] = await sequelize.query(sql, { replacements });
  return Number((rows as any[])[0].n);
};

// ---- fixtures: each returns the ids the route needs ----

const euFramework = async (orgId: number, projectId: number): Promise<Ctx> => {
  const pf = await createTestProjectFramework(orgId, projectId, 1);
  const control = await createTestControlEU(orgId, { projects_frameworks_id: pf });
  const [[meta]] = (await sequelize.query(
    `UPDATE controls_eu SET control_meta_id = (SELECT id FROM controls_struct_eu ORDER BY id LIMIT 1)
      WHERE id = :control RETURNING control_meta_id AS id`,
    { replacements: { control } },
  )) as any;
  const assessment = await createTestAssessment(orgId, {
    project_id: projectId,
    projects_frameworks_id: pf,
  });
  const answer = await insertId(
    `INSERT INTO answers_eu (organization_id, assessment_id) VALUES (:orgId, :assessment) RETURNING id`,
    { orgId, assessment },
  );
  const subcontrol = await insertId(
    `INSERT INTO subcontrols_eu (organization_id, control_id) VALUES (:orgId, :control) RETURNING id`,
    { orgId, control },
  );
  return { pf, control, answer, controlMeta: meta.id, subcontrol };
};

interface IsoTables {
  frameworkId: 2 | 3;
  subclause: string;
  subclauseMeta: string;
  subclauseStruct: string;
  annex: string;
  annexMeta: string;
  annexStruct: string;
}

/** One requirement row of each kind, pointing at the first catalogue row. */
const isoFramework =
  (t: IsoTables) =>
  async (orgId: number, projectId: number): Promise<Ctx> => {
    const pf = await createTestProjectFramework(orgId, projectId, t.frameworkId);
    const [[sub]] = (await sequelize.query(
      `INSERT INTO ${t.subclause} (organization_id, projects_frameworks_id, ${t.subclauseMeta})
       SELECT :orgId, :pf, MIN(id) FROM ${t.subclauseStruct}
       RETURNING id, ${t.subclauseMeta} AS meta`,
      { replacements: { orgId, pf } },
    )) as any;
    const [[annex]] = (await sequelize.query(
      `INSERT INTO ${t.annex} (organization_id, projects_frameworks_id, ${t.annexMeta})
       SELECT :orgId, :pf, MIN(id) FROM ${t.annexStruct}
       RETURNING id, ${t.annexMeta} AS meta`,
      { replacements: { orgId, pf } },
    )) as any;
    return { pf, subclause: sub.id, annex: annex.id, annexMeta: annex.meta };
  };
const iso42001 = isoFramework({
  frameworkId: 2,
  subclause: "subclauses_iso",
  subclauseMeta: "subclause_meta_id",
  subclauseStruct: "subclauses_struct_iso",
  annex: "annexcategories_iso",
  annexMeta: "annexcategory_meta_id",
  annexStruct: "annexcategories_struct_iso",
});
const iso27001 = isoFramework({
  frameworkId: 3,
  subclause: "subclauses_iso27001",
  subclauseMeta: "subclause_meta_id",
  subclauseStruct: "subclauses_struct_iso27001",
  annex: "annexcontrols_iso27001",
  annexMeta: "annexcontrol_meta_id",
  annexStruct: "annexcontrols_struct_iso27001",
});

const nist = async (orgId: number, projectId: number): Promise<Ctx> => {
  const pf = await createTestProjectFramework(orgId, projectId, 4);
  const subcategory = await insertId(
    `INSERT INTO nist_ai_rmf_subcategories (organization_id, projects_frameworks_id)
     VALUES (:orgId, :pf) RETURNING id`,
    { orgId, pf },
  );
  return { pf, subcategory };
};

const bundled = async (orgId: number, projectId: number): Promise<Ctx> => {
  const cfg = getConfigById(BUNDLED_FRAMEWORK_ID)!;
  const pf = await createTestProjectFramework(orgId, projectId, BUNDLED_FRAMEWORK_ID);
  const impl = await insertId(
    `INSERT INTO ${cfg.tables.l2_impl} (organization_id, projects_frameworks_id, ${cfg.cols.l2_impl_meta})
     VALUES (:orgId, :pf, (SELECT id FROM ${cfg.tables.l2_struct} ORDER BY id LIMIT 1)) RETURNING id`,
    { orgId, pf },
  );
  return { pf, impl, project: projectId };
};

const fria = async (orgId: number, projectId: number): Promise<Ctx> => {
  const id = await insertId(
    `INSERT INTO fria_assessments (organization_id, project_id, version, status, created_by)
     SELECT :orgId, :projectId, 1, 'draft', p.owner FROM projects p WHERE p.id = :projectId
     RETURNING id`,
    { orgId, projectId },
  );
  return { fria: id, project: projectId };
};

const ceMarking = async (orgId: number, projectId: number): Promise<Ctx> => {
  await sequelize.query(
    `INSERT INTO ce_markings (project_id, organization_id) VALUES (:projectId, :orgId)`,
    { replacements: { orgId, projectId } },
  );
  return { project: projectId };
};

const history = async (orgId: number, projectId: number): Promise<Ctx> => {
  await sequelize.query(
    `INSERT INTO use_case_change_history (organization_id, use_case_id, action, field_name)
     VALUES (:orgId, :projectId, 'created', 'project_title')`,
    { replacements: { orgId, projectId } },
  );
  return { project: projectId };
};

interface Route {
  name: string;
  prepare: (orgId: number, projectId: number) => Promise<Ctx>;
  call: (api: Api, ctx: Ctx) => any;
  /** The handler's answer once past the guard. */
  success: number;
  /** The handler's answer to another organization's Admin; default 404. */
  missing?: number;
  /** Rows a refused write must leave as they were. */
  unchanged?: (ctx: Ctx) => Promise<number>;
}

const euRows = (ctx: Ctx) =>
  count(
    `SELECT (SELECT COUNT(*) FROM controls_eu WHERE projects_frameworks_id = :pf)
          + (SELECT COUNT(*) FROM answers_eu WHERE id = :answer) AS n`,
    ctx,
  );

const ROUTES: Route[] = [
  // ---- EU AI Act ----
  {
    name: "GET /api/eu-ai-act/compliances/byProjectId/:pf",
    prepare: euFramework,
    call: (api, c) => api.get(`/api/eu-ai-act/compliances/byProjectId/${c.pf}`),
    success: 200,
    missing: 200,
  },
  {
    name: "GET /api/eu-ai-act/assessments/byProjectId/:pf",
    prepare: euFramework,
    call: (api, c) => api.get(`/api/eu-ai-act/assessments/byProjectId/${c.pf}`),
    success: 200,
    missing: 500,
  },
  {
    name: "GET /api/eu-ai-act/compliances/progress/:pf",
    prepare: euFramework,
    call: (api, c) => api.get(`/api/eu-ai-act/compliances/progress/${c.pf}`),
    success: 200,
    missing: 200,
  },
  {
    name: "GET /api/eu-ai-act/assessments/progress/:pf",
    prepare: euFramework,
    call: (api, c) => api.get(`/api/eu-ai-act/assessments/progress/${c.pf}`),
    success: 200,
    missing: 200,
  },
  {
    name: "GET /api/eu-ai-act/controlById?projectFrameworkId",
    prepare: euFramework,
    call: (api, c) =>
      api.get(`/api/eu-ai-act/controlById?controlId=${c.controlMeta}&projectFrameworkId=${c.pf}`),
    success: 200,
    missing: 500,
  },
  {
    name: "GET /api/eu-ai-act/topicById?projectFrameworkId",
    prepare: euFramework,
    call: (api, c) => api.get(`/api/eu-ai-act/topicById?topicId=1&projectFrameworkId=${c.pf}`),
    success: 200,
  },
  {
    name: "GET /api/eu-ai-act/controls/byControlCategoryId/:id?projectFrameworkId",
    prepare: euFramework,
    call: (api, c) =>
      api.get(`/api/eu-ai-act/controls/byControlCategoryId/1?projectFrameworkId=${c.pf}`),
    success: 200,
    missing: 200,
  },
  {
    name: "GET /api/eu-ai-act/controlCategories?projectFrameworkId",
    prepare: euFramework,
    call: (api, c) => api.get(`/api/eu-ai-act/controlCategories?projectFrameworkId=${c.pf}`),
    success: 200,
    missing: 200,
  },
  {
    name: "PATCH /api/eu-ai-act/saveControls/:controlId",
    prepare: euFramework,
    call: (api, c) => api.patch(`/api/eu-ai-act/saveControls/${c.control}`).send({}),
    success: 200,
    unchanged: euRows,
  },
  {
    name: "PATCH /api/eu-ai-act/saveAnswer/:answerId",
    prepare: euFramework,
    call: (api, c) => api.patch(`/api/eu-ai-act/saveAnswer/${c.answer}`).send({}),
    success: 202,
    unchanged: euRows,
  },
  {
    name: "DELETE /api/eu-ai-act/compliances/byProjectId/:pf",
    prepare: euFramework,
    call: (api, c) => api.delete(`/api/eu-ai-act/compliances/byProjectId/${c.pf}`),
    success: 200,
    unchanged: euRows,
  },
  {
    name: "DELETE /api/eu-ai-act/assessments/byProjectId/:pf",
    prepare: euFramework,
    call: (api, c) => api.delete(`/api/eu-ai-act/assessments/byProjectId/${c.pf}`),
    success: 200,
    unchanged: euRows,
  },
  // ---- change history of requirement rows ----
  {
    name: "GET /api/v1/control-eu-change-history/:id",
    prepare: euFramework,
    call: (api, c) => api.get(`/api/v1/control-eu-change-history/${c.control}`),
    success: 200,
    missing: 200,
  },
  {
    name: "GET /api/v1/subcontrol-eu-change-history/:id",
    prepare: euFramework,
    call: (api, c) => api.get(`/api/v1/subcontrol-eu-change-history/${c.subcontrol}`),
    success: 200,
    missing: 200,
  },
  {
    name: "GET /api/v1/annex-category-change-history/:id",
    prepare: iso42001,
    call: (api, c) => api.get(`/api/v1/annex-category-change-history/${c.annex}`),
    success: 200,
    missing: 200,
  },
  // ---- bundled frameworks (frameworkImpl) ----
  {
    name: "GET /api/frameworks/:fw/tree/:projectId",
    prepare: bundled,
    call: (api, c) => api.get(`/api/frameworks/${BUNDLED_FRAMEWORK_ID}/tree/${c.project}`),
    success: 200,
  },
  {
    name: "GET /api/frameworks/:fw/dashboard/:pf",
    prepare: bundled,
    call: (api, c) => api.get(`/api/frameworks/${BUNDLED_FRAMEWORK_ID}/dashboard/${c.pf}`),
    success: 200,
  },
  {
    name: "GET /api/frameworks/:fw/impl/l2/:id",
    prepare: bundled,
    call: (api, c) => api.get(`/api/frameworks/${BUNDLED_FRAMEWORK_ID}/impl/l2/${c.impl}`),
    success: 200,
  },
  {
    name: "GET /api/frameworks/:fw/impl/l2/:id/risks",
    prepare: bundled,
    call: (api, c) => api.get(`/api/frameworks/${BUNDLED_FRAMEWORK_ID}/impl/l2/${c.impl}/risks`),
    success: 200,
    missing: 200,
  },
  {
    name: "PATCH /api/frameworks/:fw/impl/l2/:id",
    prepare: bundled,
    call: (api, c) =>
      api
        .patch(`/api/frameworks/${BUNDLED_FRAMEWORK_ID}/impl/l2/${c.impl}`)
        .field("implementation_description", "Changed"),
    success: 200,
    unchanged: (c) => {
      const cfg = getConfigById(BUNDLED_FRAMEWORK_ID)!;
      return count(
        `SELECT COUNT(*) AS n FROM ${cfg.tables.l2_impl}
          WHERE id = :impl AND implementation_description IS NULL`,
        c,
      );
    },
  },
  // ---- ISO 42001 ----
  ...isoRoutes("iso-42001", iso42001, "annexCategory", "saveAnnexes", true),
  // ---- ISO 27001 ----
  ...isoRoutes("iso-27001", iso27001, "annexControl", "saveAnnexes", false),
  // ---- NIST AI RMF ----
  {
    name: "GET /api/nist-ai-rmf/subcategories/byId/:id",
    prepare: nist,
    call: (api, c) => api.get(`/api/nist-ai-rmf/subcategories/byId/${c.subcategory}`),
    success: 200,
  },
  {
    name: "GET /api/nist-ai-rmf/subcategories/:id/risks",
    prepare: nist,
    call: (api, c) => api.get(`/api/nist-ai-rmf/subcategories/${c.subcategory}/risks`),
    success: 200,
    missing: 200,
  },
  {
    name: "PATCH /api/nist-ai-rmf/subcategories/:id",
    prepare: nist,
    call: (api, c) =>
      api
        .patch(`/api/nist-ai-rmf/subcategories/${c.subcategory}`)
        .field("implementation_description", "Changed"),
    success: 200,
    unchanged: (c) =>
      count(
        `SELECT COUNT(*) AS n FROM nist_ai_rmf_subcategories
          WHERE id = :subcategory AND implementation_description IS NULL`,
        c,
      ),
  },
  {
    name: "PATCH /api/nist-ai-rmf/subcategories/:id/status",
    prepare: nist,
    call: (api, c) =>
      api.patch(`/api/nist-ai-rmf/subcategories/${c.subcategory}/status`).send({
        status: "In progress",
      }),
    success: 200,
    unchanged: (c) =>
      count(
        `SELECT COUNT(*) AS n FROM nist_ai_rmf_subcategories
          WHERE id = :subcategory AND status IS DISTINCT FROM 'In progress'`,
        c,
      ),
  },
  // ---- FRIA ----
  {
    name: "GET /api/fria/:projectId",
    prepare: fria,
    call: (api, c) => api.get(`/api/fria/${c.project}`),
    success: 200,
  },
  ...["risk-items", "models", "evidence", "versions", "versions/1"].map<Route>((path) => ({
    name: `GET /api/fria/:friaId/${path}`,
    prepare: fria,
    call: (api, c) => api.get(`/api/fria/${c.fria}/${path}`),
    // No version 1 has been submitted; another organization's FRIA has no evidence.
    success: path === "versions/1" ? 404 : 200,
    missing: path === "versions/1" || path === "evidence" ? 404 : 200,
  })),
  {
    name: "POST /api/fria/:friaId/risk-items",
    prepare: fria,
    call: (api, c) =>
      api.post(`/api/fria/${c.fria}/risk-items`).send({ risk_description: "New risk" }),
    success: 201,
    unchanged: (c) => count(`SELECT COUNT(*) AS n FROM fria_risk_items WHERE fria_id = :fria`, c),
  },
  {
    name: "PUT /api/fria/:friaId/rights",
    prepare: fria,
    call: (api, c) => api.put(`/api/fria/${c.fria}/rights`).send({ rights: [] }),
    success: 200,
  },
  {
    name: "POST /api/fria/:friaId/submit",
    prepare: fria,
    call: (api, c) => api.post(`/api/fria/${c.fria}/submit`).send({}),
    success: 200,
    unchanged: (c) =>
      count(`SELECT COUNT(*) AS n FROM fria_assessments WHERE id = :fria AND status = 'draft'`, c),
  },
  // ---- CE marking ----
  {
    name: "GET /api/ce-marking/:projectId",
    prepare: ceMarking,
    call: (api, c) => api.get(`/api/ce-marking/${c.project}`),
    success: 200,
  },
  // ---- use case change history ----
  {
    name: "GET /api/use-case-change-history/:useCaseId",
    prepare: history,
    call: (api, c) => api.get(`/api/use-case-change-history/${c.project}`),
    success: 200,
    missing: 200,
  },
];

function isoRoutes(
  base: string,
  prepare: (orgId: number, projectId: number) => Promise<Ctx>,
  annexById: string,
  saveAnnex: string,
  withRisks: boolean,
): Route[] {
  const reads: Array<[string, (c: Ctx) => string, number, number?]> = [
    ["clauses/byProjectId/:pf", (c) => `clauses/byProjectId/${c.pf}`, 200, 200],
    ["annexes/byProjectId/:pf", (c) => `annexes/byProjectId/${c.pf}`, 200, 200],
    ["clauses/struct/byProjectId/:pf", (c) => `clauses/struct/byProjectId/${c.pf}`, 200, 200],
    ["annexes/struct/byProjectId/:pf", (c) => `annexes/struct/byProjectId/${c.pf}`, 200, 200],
    ["clauses/progress/:pf", (c) => `clauses/progress/${c.pf}`, 200, 200],
    ["annexes/progress/:pf", (c) => `annexes/progress/${c.pf}`, 200, 200],
    ["clauses/assignments/:pf", (c) => `clauses/assignments/${c.pf}`, 200, 200],
    ["annexes/assignments/:pf", (c) => `annexes/assignments/${c.pf}`, 200, 200],
    [
      "subClauses/byClauseId/:id?projectFrameworkId",
      (c) => `subClauses/byClauseId/1?projectFrameworkId=${c.pf}`,
      200,
      200,
    ],
    [
      "subClause/byId/:id",
      (c) => `subClause/byId/${c.subclause}?projectFrameworkId=${c.pf}`,
      200,
      400, // the handler's answer for a subclause it does not find
    ],
    [
      `${annexById}/byId/:metaId?projectFrameworkId`,
      (c) => `${annexById}/byId/${c.annexMeta}?projectFrameworkId=${c.pf}`,
      200,
      500,
    ],
  ];
  if (withRisks) {
    reads.push(
      ["subclauses/:id/risks", (c) => `subclauses/${c.subclause}/risks`, 200, 200],
      ["annexCategories/:id/risks", (c) => `annexCategories/${c.annex}/risks`, 200, 200],
    );
  }
  const subclauseUnchanged = (table: string) => (c: Ctx) =>
    count(
      `SELECT COUNT(*) AS n FROM ${table} WHERE id = :subclause AND implementation_description IS NULL`,
      c,
    );
  const subclauseTable = base === "iso-42001" ? "subclauses_iso" : "subclauses_iso27001";
  const annexTable = base === "iso-42001" ? "annexcategories_iso" : "annexcontrols_iso27001";
  return [
    ...reads.map<Route>(([label, path, success, missing]) => ({
      name: `GET /api/${base}/${label}`,
      prepare,
      call: (api, c) => api.get(`/api/${base}/${path(c)}`),
      success,
      missing,
    })),
    {
      name: `PATCH /api/${base}/saveClauses/:subclauseId`,
      prepare,
      call: (api, c) =>
        api
          .patch(`/api/${base}/saveClauses/${c.subclause}`)
          .field("implementation_description", "Changed"),
      success: 200,
      unchanged: subclauseUnchanged(subclauseTable),
    },
    {
      name: `PATCH /api/${base}/${saveAnnex}/:annexId`,
      prepare,
      call: (api, c) =>
        api
          .patch(`/api/${base}/${saveAnnex}/${c.annex}`)
          .field("implementation_description", "Changed"),
      success: 200,
      unchanged: (c) =>
        count(
          `SELECT COUNT(*) AS n FROM ${annexTable} WHERE id = :annex AND implementation_description IS NULL`,
          c,
        ),
    },
    {
      name: `DELETE /api/${base}/clauses/byProjectId/:pf`,
      prepare,
      call: (api, c) => api.delete(`/api/${base}/clauses/byProjectId/${c.pf}`),
      success: 200,
      unchanged: (c) =>
        count(`SELECT COUNT(*) AS n FROM ${subclauseTable} WHERE projects_frameworks_id = :pf`, c),
    },
    {
      name: `DELETE /api/${base}/annexes/byProjectId/:pf`,
      prepare,
      call: (api, c) => api.delete(`/api/${base}/annexes/byProjectId/${c.pf}`),
      success: 200,
      unchanged: (c) =>
        count(`SELECT COUNT(*) AS n FROM ${annexTable} WHERE projects_frameworks_id = :pf`, c),
    },
  ];
}

describe("use case access on routes keyed by a child id (U-H4)", () => {
  let orgId: number;
  let ownerId: number;
  let adminId: number;

  beforeAll(async () => {
    await cleanupDatabase();
    await seedFrameworks();
    orgId = await createTestOrganization();
    ownerId = await user(orgId, "Editor");
    adminId = await user(orgId, "Admin");
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  const setUp = async (route: Route) => {
    const projectId = await createTestProject(orgId, ownerId);
    return { projectId, ctx: await route.prepare(orgId, projectId) };
  };

  describe.each(ROUTES)("$name", (route) => {
    it.each(["Editor", "Auditor"] as const)(
      "refuses a %s who is not on the use case and changes nothing",
      async (role) => {
        const { ctx } = await setUp(route);
        const before = await route.unchanged?.(ctx);
        const api = await apiAs(orgId, await user(orgId, role), role);

        const res = await route.call(api, ctx);

        expect(res.status).toBe(403);
        if (route.unchanged) expect(await route.unchanged(ctx)).toBe(before);
      },
    );

    it("lets a member of the use case through", async () => {
      const { projectId, ctx } = await setUp(route);
      const memberId = await user(orgId, "Editor");
      await sequelize.query(
        `INSERT INTO projects_members (organization_id, project_id, user_id)
         VALUES (:orgId, :projectId, :memberId)`,
        { replacements: { orgId, projectId, memberId } },
      );
      const res = await route.call(await apiAs(orgId, memberId, "Editor"), ctx);
      expect(res.status).toBe(route.success);
    });

    it("lets the owner through", async () => {
      const { ctx } = await setUp(route);
      const res = await route.call(await apiAs(orgId, ownerId, "Editor"), ctx);
      expect(res.status).toBe(route.success);
    });

    it("lets an Admin who is not on the use case through", async () => {
      const { ctx } = await setUp(route);
      const res = await route.call(await apiAs(orgId, adminId, "Admin"), ctx);
      expect(res.status).toBe(route.success);
    });

    it("gives another organization's Admin the handler's usual answer", async () => {
      const { ctx } = await setUp(route);
      const before = await route.unchanged?.(ctx);
      const otherOrg = await createTestOrganization();
      const api = await apiAs(otherOrg, await user(otherOrg, "Admin"), "Admin");

      const res = await route.call(api, ctx);

      expect(res.status).toBe(route.missing ?? 404);
      if (route.unchanged) expect(await route.unchanged(ctx)).toBe(before);
    });
  });

  describe("requirement change history outlives its row", () => {
    it("is refused to a non-Admin once the control is deleted, and still open to an Admin", async () => {
      const projectId = await createTestProject(orgId, ownerId);
      const ctx = await euFramework(orgId, projectId);
      await sequelize.query(`DELETE FROM controls_eu WHERE id = :id`, {
        replacements: { id: ctx.control },
      });
      const owner = await apiAs(orgId, ownerId, "Editor");
      expect((await owner.get(`/api/v1/control-eu-change-history/${ctx.control}`)).status).toBe(
        403,
      );
      const admin = await apiAs(orgId, adminId, "Admin");
      expect((await admin.get(`/api/v1/control-eu-change-history/${ctx.control}`)).status).toBe(
        200,
      );
    });
  });

  describe("use case change history", () => {
    it("is refused to a non-Admin once the use case is deleted", async () => {
      const { projectId } = await setUp(ROUTES[ROUTES.length - 1]);
      await sequelize.query(`DELETE FROM projects WHERE id = :projectId`, {
        replacements: { projectId },
      });
      const api = await apiAs(orgId, ownerId, "Editor");
      expect((await api.get(`/api/use-case-change-history/${projectId}`)).status).toBe(403);
      const admin = await apiAs(orgId, adminId, "Admin");
      expect((await admin.get(`/api/use-case-change-history/${projectId}`)).status).toBe(200);
    });

    it.each(["0", "101", "abc", "-5"])("refuses limit=%s with 400", async (limit) => {
      const { ctx } = await setUp(ROUTES[ROUTES.length - 1]);
      const api = await apiAs(orgId, adminId, "Admin");
      const res = await api.get(`/api/use-case-change-history/${ctx.project}?limit=${limit}`);
      expect(res.status).toBe(400);
    });

    it("accepts limit=100 and returns the history", async () => {
      const { ctx } = await setUp(ROUTES[ROUTES.length - 1]);
      const api = await apiAs(orgId, ownerId, "Editor");
      const res = await api.get(`/api/use-case-change-history/${ctx.project}?limit=100`);
      expect(res.status).toBe(200);
      expect(res.body.data.data).toHaveLength(1);
    });
  });
});
