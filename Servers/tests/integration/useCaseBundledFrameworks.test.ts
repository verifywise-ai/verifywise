jest.setTimeout(60000);

import path from "path";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { createTestApp, testRequest } from "./setup";
import { getStructureById } from "../../structures";

/**
 * A bundled framework picked when a use case or organizational project is
 * created is built, not only attached: its control rows exist and can be
 * edited. The same holds after an approval workflow approves the use case, and
 * the backfill migration builds links created before the fix.
 */

const HIPAA = 24; // use case scoped, three levels
const SOC2 = 5; // organization wide

let counter = 0;
async function adminApi() {
  const orgId = await createTestOrganization();
  counter += 1;
  const adminId = await createTestUser(
    orgId,
    1,
    `bf-${Date.now()}-${counter}@test.com`,
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

async function count(sql: string, replacements: Record<string, unknown>): Promise<number> {
  const [rows] = await sequelize.query(sql, { replacements });
  return Number((rows as Array<{ n: string }>)[0].n);
}

const structCount = (l2Struct: string, l1Struct: string, parent: string, frameworkId: number) =>
  count(
    `SELECT COUNT(*) AS n FROM ${l2Struct} l2 JOIN ${l1Struct} l1 ON l2.${parent} = l1.id
      WHERE l1.framework_id = :frameworkId`,
    { frameworkId },
  );

const hipaaStandards = (projectId: number) =>
  count(
    `SELECT COUNT(*) AS n FROM hipaa_standards s
       JOIN projects_frameworks pf ON pf.id = s.projects_frameworks_id
      WHERE pf.project_id = :projectId AND pf.framework_id = ${HIPAA}`,
    { projectId },
  );

const hipaaSpecifications = (projectId: number) =>
  count(
    `SELECT COUNT(*) AS n FROM hipaa_implementation_specifications s
       JOIN projects_frameworks pf ON pf.id = s.projects_frameworks_id
      WHERE pf.project_id = :projectId AND pf.framework_id = ${HIPAA}`,
    { projectId },
  );

const projectIdOf = (res: { body: any }) => Number(res.body.data.project?.id ?? res.body.data.id);

describe("bundled frameworks picked at creation are built", () => {
  let expectedStandards: number;
  let expectedSpecifications: number;

  beforeAll(async () => {
    await seedFrameworks();
    expectedStandards = await structCount(
      "hipaa_standards_struct",
      "hipaa_safeguard_categories_struct",
      "safeguard_category_id",
      HIPAA,
    );
    expectedSpecifications = await count(
      `SELECT COUNT(*) AS n FROM hipaa_implementation_specifications_struct sp
         JOIN hipaa_standards_struct st ON sp.standard_id = st.id
         JOIN hipaa_safeguard_categories_struct c ON st.safeguard_category_id = c.id
        WHERE c.framework_id = :frameworkId`,
      { frameworkId: HIPAA },
    );
    expect(expectedStandards).toBeGreaterThan(0);
    expect(expectedSpecifications).toBeGreaterThan(0);
  });

  afterEach(async () => {
    await cleanupDatabase();
    await seedFrameworks();
  });

  it("POST /api/projects builds HIPAA, and its controls can be edited", async () => {
    const { adminId, api } = await adminApi();

    const res = await api.post("/api/projects").send(body(adminId, { framework: [1, HIPAA] }));

    expect(res.status).toBe(201);
    expect(Object.keys(res.body.data.frameworks).sort()).toEqual(["eu", "hipaa"]);
    const projectId = projectIdOf(res);
    expect(await hipaaStandards(projectId)).toBe(expectedStandards);
    expect(await hipaaSpecifications(projectId)).toBe(expectedSpecifications);

    const tree = await api.get(`/api/frameworks/${HIPAA}/tree/${projectId}`);
    expect(tree.status).toBe(200);

    const [[standard]] = (await sequelize.query(
      `SELECT s.id FROM hipaa_standards s
         JOIN projects_frameworks pf ON pf.id = s.projects_frameworks_id
        WHERE pf.project_id = :projectId ORDER BY s.id LIMIT 1`,
      { replacements: { projectId } },
    )) as [Array<{ id: number }>, unknown];
    const patch = await api
      .patch(`/api/frameworks/${HIPAA}/impl/l2/${standard.id}`)
      .field("status", "In progress");
    expect(patch.status).toBeLessThan(300);
    const [[saved]] = (await sequelize.query(`SELECT status FROM hipaa_standards WHERE id = :id`, {
      replacements: { id: standard.id },
    })) as [Array<{ status: string }>, unknown];
    expect(saved.status).toBe("In progress");
  });

  it("POST /api/v1/projects builds an organization-wide SOC 2", async () => {
    const { adminId, api } = await adminApi();

    const res = await api
      .post("/api/v1/projects")
      .send(body(adminId, { framework: [SOC2], is_organizational: true }));

    expect(res.status).toBe(201);
    expect(Object.keys(res.body.data.frameworks)).toEqual(["soc2"]);
    const projectId = projectIdOf(res);
    const soc2 = getStructureById(SOC2)!;
    const l2Rows = await count(
      `SELECT COUNT(*) AS n FROM ${soc2.tables.l2_impl} i
         JOIN projects_frameworks pf ON pf.id = i.projects_frameworks_id
        WHERE pf.project_id = :projectId`,
      { projectId },
    );
    expect(l2Rows).toBeGreaterThan(0);
    expect(l2Rows).toBe(
      await structCount(
        soc2.tables.l2_struct,
        soc2.tables.l1_struct,
        soc2.cols.l2_struct_parent,
        SOC2,
      ),
    );
  });

  it("refuses a framework id with no builder with 400 and writes nothing", async () => {
    const { adminId, api } = await adminApi();

    const res = await api.post("/api/projects").send(body(adminId, { framework: [999] }));

    expect(res.status).toBe(400);
    expect(await count(`SELECT COUNT(*) AS n FROM projects`, {})).toBe(0);
  });

  it("builds a bundled framework when the approval workflow approves the use case", async () => {
    const { adminId, api } = await adminApi();
    const workflow = await api.post("/api/approval-workflows").send({
      workflow_title: "Use case sign-off",
      entity_type: "use_case",
      steps: [{ step_name: "Review", approver_ids: [adminId], requires_all_approvers: false }],
    });
    expect(workflow.status).toBe(201);

    const res = await api
      .post("/api/projects")
      .send(body(adminId, { framework: [HIPAA], approval_workflow_id: workflow.body.data.id }));
    expect(res.status).toBe(201);
    const projectId = projectIdOf(res);
    expect(await hipaaStandards(projectId)).toBe(0);

    const [[request]] = (await sequelize.query(
      `SELECT id FROM approval_requests
        WHERE entity_type = 'use_case' AND entity_id = :projectId AND status = 'Pending'`,
      { replacements: { projectId } },
    )) as [Array<{ id: number }>, unknown];
    const approved = await api
      .post(`/api/approval-requests/${request.id}/approve`)
      .send({ comments: "Fine" });
    expect(approved.status).toBe(200);

    expect(await hipaaStandards(projectId)).toBe(expectedStandards);
    expect(await hipaaSpecifications(projectId)).toBe(expectedSpecifications);
  });

  describe("backfill migration", () => {
    const migration = require(
      path.join(
        __dirname,
        "../../database/migrations/20261117140851-build-empty-bundled-frameworks.js",
      ),
    );
    const runMigration = () => migration.up({ sequelize });

    it("builds links left empty by the old creation path, once, in each link's organization", async () => {
      const a = await adminApi();
      const b = await adminApi();
      const emptyRes = await a.api
        .post("/api/projects")
        .send(body(a.adminId, { framework: [HIPAA] }));
      const builtRes = await b.api
        .post("/api/projects")
        .send(body(b.adminId, { framework: [HIPAA] }));
      const emptyId = projectIdOf(emptyRes);
      const builtId = projectIdOf(builtRes);

      // The state a use case created before the fix is in: the link, no rows.
      await sequelize.query(
        `DELETE FROM hipaa_implementation_specifications WHERE projects_frameworks_id IN
           (SELECT id FROM projects_frameworks WHERE project_id = :emptyId)`,
        { replacements: { emptyId } },
      );
      await sequelize.query(
        `DELETE FROM hipaa_standards WHERE projects_frameworks_id IN
           (SELECT id FROM projects_frameworks WHERE project_id = :emptyId)`,
        { replacements: { emptyId } },
      );
      expect(await hipaaStandards(emptyId)).toBe(0);
      expect(await hipaaSpecifications(emptyId)).toBe(0);

      // Work already done on the built use case must survive.
      await sequelize.query(
        `UPDATE hipaa_standards SET status = 'In progress' WHERE projects_frameworks_id IN
           (SELECT id FROM projects_frameworks WHERE project_id = :builtId)`,
        { replacements: { builtId } },
      );

      await runMigration();
      await runMigration();

      expect(await hipaaStandards(emptyId)).toBe(expectedStandards);
      expect(await hipaaSpecifications(emptyId)).toBe(expectedSpecifications);
      expect(await hipaaStandards(builtId)).toBe(expectedStandards);
      expect(await hipaaSpecifications(builtId)).toBe(expectedSpecifications);

      expect(
        await count(
          `SELECT COUNT(*) AS n FROM hipaa_standards s
             JOIN projects_frameworks pf ON pf.id = s.projects_frameworks_id
            WHERE pf.project_id = :emptyId
              AND (s.organization_id <> :orgId OR s.status <> 'Not started')`,
          { emptyId, orgId: a.orgId },
        ),
      ).toBe(0);
      expect(
        await count(
          `SELECT COUNT(*) AS n FROM hipaa_implementation_specifications s
             JOIN projects_frameworks pf ON pf.id = s.projects_frameworks_id
            WHERE pf.project_id = :emptyId AND s.organization_id <> :orgId`,
          { emptyId, orgId: a.orgId },
        ),
      ).toBe(0);
      expect(
        await count(
          `SELECT COUNT(*) AS n FROM hipaa_standards s
             JOIN projects_frameworks pf ON pf.id = s.projects_frameworks_id
            WHERE pf.project_id = :builtId AND s.status = 'In progress'`,
          { builtId },
        ),
      ).toBe(expectedStandards);
    });
  });
});
