/**
 * A project-scoped run must be classified as belonging to that project.
 *
 * canViewRunQuery / listRunsQuery decide visibility from a single field,
 * COALESCE(config_snapshot->>'project_id', scheduled_reports.project_id), and
 * treat NULL as "organization-scoped, visible to everyone in the org". The
 * manual generate path stored the id one level deeper, under
 * config_snapshot.request.projectId, and sets scheduled_report_id to NULL — so
 * the COALESCE resolved to NULL and every project report generated through it
 * was listed and downloadable by any authenticated member of the organization,
 * including Auditors who are not on the project.
 *
 * The branch states this rule in three other places (reportTemplate.ctrl.ts's
 * non-numeric projectId guard, the 20260728180000 backfill's
 * jsonb_build_object, and reportRunOrchestrator); only the manual path omitted
 * it.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { canViewRunQuery, listRunsQuery } from "../../utils/reportRun.utils";
import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

async function seedProject(orgId: number, ownerId: number, name: string): Promise<number> {
  const rows = (await sequelize.query(
    `INSERT INTO projects
       (project_title, owner, start_date, ai_risk_classification, type_of_high_risk_role,
        goal, last_updated, last_updated_by, organization_id)
     VALUES (:name, :ownerId, NOW(), 'High risk', 'Deployer', 'goal', NOW(), :ownerId, :orgId)
     RETURNING id`,
    { replacements: { name, ownerId, orgId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  return rows[0].id;
}

describe("manual report run visibility", () => {
  let orgId: number;
  let adminId: number;
  let memberId: number;
  let outsiderId: number;
  let projectId: number;

  beforeEach(async () => {
    await cleanupDatabase();
    orgId = await createTestOrganization("Visibility org");
    // roleId 1 = Admin (bypasses the membership rule and owns the generate
    // route), 3 = Editor, 4 = Auditor — the latter two are subject to it.
    const stamp = Date.now();
    adminId = await createTestUser(orgId, 1, `admin-${stamp}@test.com`, "Password123!");
    memberId = await createTestUser(orgId, 3, `member-${stamp}@test.com`, "Password123!");
    outsiderId = await createTestUser(orgId, 4, `outsider-${stamp}@test.com`, "Password123!");
    projectId = await seedProject(orgId, memberId, "Members only");
  });

  afterAll(async () => {
    await cleanupDatabase();
    await sequelize.close();
  });

  /**
   * Drive the real endpoint rather than reproducing its snapshot shape here —
   * the defect *is* the shape, so a hand-written fixture would assert the fix
   * into existence. The route is Admin-only; the run it creates is what the
   * membership rule then has to classify. BullMQ is mocked in ./setup.
   */
  async function generateManualRun(scopedToProject: number): Promise<number> {
    const adminApp = createTestApp({
      bypassAuth: true,
      mockUser: { userId: adminId, role: "Admin", organizationId: orgId },
    });

    const res = await testRequest(adminApp).post("/api/reporting/v2/generate-report").send({
      projectId: scopedToProject,
      frameworkId: 1,
      projectFrameworkId: 1,
      reportType: "Project risks report",
      reportName: "Probe",
      format: "pdf",
    });

    expect(res.status).toBe(202);
    return (res.body?.data ?? res.body).runId;
  }

  it("records the project id where the visibility rule reads it", async () => {
    const runId = await generateManualRun(projectId);

    const rows = (await sequelize.query(
      `SELECT config_snapshot->>'project_id' AS project_id FROM report_runs WHERE id = :id`,
      { replacements: { id: runId }, type: QueryTypes.SELECT },
    )) as Array<{ project_id: string | null }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].project_id).toBe(String(projectId));
  });

  it("hides a project-scoped manual run from a non-member in the same organization", async () => {
    const runId = await generateManualRun(projectId);

    const asOwner = await canViewRunQuery(runId, orgId, {
      role: "Editor",
      userId: memberId,
    });
    expect(asOwner).toBe(true);

    const asOutsider = await canViewRunQuery(runId, orgId, {
      role: "Auditor",
      userId: outsiderId,
    });
    expect(asOutsider).toBe(false);
  });

  it("omits a project-scoped manual run from a non-member's run list", async () => {
    const runId = await generateManualRun(projectId);

    const ownerList = await listRunsQuery(orgId, {}, { role: "Editor", userId: memberId });
    expect(ownerList.rows.map((r: any) => r.id)).toContain(runId);

    const outsiderList = await listRunsQuery(orgId, {}, { role: "Auditor", userId: outsiderId });
    expect(outsiderList.rows.map((r: any) => r.id)).not.toContain(runId);
  });

  it("still shows an organization-scoped run to every member of the organization", async () => {
    // The other half of the rule: a run with no project is org-wide by design,
    // so the fix must not make those invisible.
    const rows = (await sequelize.query(
      `INSERT INTO report_runs (organization_id, triggered_by, status, config_snapshot, created_at)
       VALUES (:orgId, 'manual', 'success', '{}'::jsonb, NOW())
       RETURNING id`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    )) as Array<{ id: number }>;

    const asOutsider = await canViewRunQuery(rows[0].id, orgId, {
      role: "Auditor",
      userId: outsiderId,
    });
    expect(asOutsider).toBe(true);
  });
});
