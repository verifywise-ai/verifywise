jest.setTimeout(60000);

/**
 * Producing a report must obey the same membership rule as reading one.
 *
 * The read side (canViewRunQuery) has always applied it. Generation and
 * delivery had no equivalent, so an Editor could schedule a project report they
 * cannot open and have it emailed to themselves as an attachment, and an
 * organization-scope run — the union of every project in the tenant — was
 * producible by any role.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

const TEMPLATES = "/api/reporting/templates";
const SCHEDULES = "/api/reporting/scheduled-reports";

// createTemplateQuery/createTemplateVersionQuery (utils/reportTemplate.utils.ts)
// read default_scope and sections_config off the raw body — POST
// /api/reporting/templates is the one reporting endpoint that is NOT
// camelCase. See tenant-isolation/scheduled-reports.isolation.test.ts's
// VALID_TEMPLATE for the same shape.
const VALID_TEMPLATE = {
  name: "Scope probe",
  category: "governance",
  default_scope: "organization",
  sections_config: { sections: [{ reportSectionKey: "overview" }] },
};

function appFor(userId: number, role: string, orgId: number) {
  return createTestApp({ bypassAuth: true, mockUser: { userId, role, organizationId: orgId } });
}

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

describe("report scope authorization", () => {
  let orgId: number;
  let adminId: number;
  let editorId: number;
  let ownedProjectId: number;
  let foreignProjectId: number;
  let templateId: number;
  let versionId: number;

  beforeEach(async () => {
    await cleanupDatabase();
    const stamp = Date.now();
    orgId = await createTestOrganization("Scope authz org");
    adminId = await createTestUser(orgId, 1, `admin-${stamp}@test.com`, "Password123!");
    editorId = await createTestUser(orgId, 3, `editor-${stamp}@test.com`, "Password123!");
    ownedProjectId = await seedProject(orgId, editorId, "Editor's project");
    foreignProjectId = await seedProject(orgId, adminId, "Admin's project");

    const res = await testRequest(appFor(adminId, "Admin", orgId))
      .post(TEMPLATES)
      .send(VALID_TEMPLATE);
    expect(res.status).toBe(201);
    const body = res.body?.data ?? res.body;
    templateId = body.id;
    versionId = body.latestVersion?.id ?? body.version_id ?? body.latest_version_id;
  });

  afterAll(async () => {
    await cleanupDatabase();
    await sequelize.close();
  });

  function schedulePayload(overrides: Record<string, unknown>) {
    return {
      templateId,
      templateVersionId: versionId,
      name: "Probe schedule",
      sectionsConfig: { sections: [{ reportSectionKey: "overview" }] },
      // createScheduledReportQuery JSON.stringifies aiBlocksConfig and binds
      // format directly with no fallback — an absent value here is
      // `undefined`, not "[]" or "pdf", which Sequelize's raw query rejects as
      // an unbound named replacement before validation ever runs. See
      // tenant-isolation/scheduled-reports.isolation.test.ts's seedSchedule
      // for the same two fields.
      aiBlocksConfig: {},
      format: "pdf",
      deliveryConfig: { saveToStorage: true },
      scheduleConfig: { frequency: "daily", hour: 9, minute: 0 },
      ...overrides,
    };
  }

  it("refuses an Editor creating an organization-scope schedule", async () => {
    const res = await testRequest(appFor(editorId, "Editor", orgId))
      .post(SCHEDULES)
      .send(schedulePayload({ scope: "organization" }));
    expect(res.status).toBe(403);
  });

  it("refuses an Editor creating a schedule for a project they do not belong to", async () => {
    const res = await testRequest(appFor(editorId, "Editor", orgId))
      .post(SCHEDULES)
      .send(schedulePayload({ scope: "project", projectId: foreignProjectId }));
    expect(res.status).toBe(403);
  });

  it("allows an Editor a schedule for their own project", async () => {
    const res = await testRequest(appFor(editorId, "Editor", orgId))
      .post(SCHEDULES)
      .send(schedulePayload({ scope: "project", projectId: ownedProjectId }));
    expect(res.status).toBe(201);
  });

  it("allows an Admin an organization-scope schedule", async () => {
    const res = await testRequest(appFor(adminId, "Admin", orgId))
      .post(SCHEDULES)
      .send(schedulePayload({ scope: "organization" }));
    expect(res.status).toBe(201);
  });

  it("refuses an Editor widening their own schedule to organization scope by PATCH", async () => {
    const created = await testRequest(appFor(editorId, "Editor", orgId))
      .post(SCHEDULES)
      .send(schedulePayload({ scope: "project", projectId: ownedProjectId }));
    expect(created.status).toBe(201);
    const id = (created.body?.data ?? created.body).id;

    const res = await testRequest(appFor(editorId, "Editor", orgId))
      .patch(`${SCHEDULES}/${id}`)
      .send({ scope: "organization", projectId: null });
    expect(res.status).toBe(403);
  });

  it("refuses an Editor running a template with no scope in the body", async () => {
    // reportTemplate.ctrl defaults an omitted scope to "organization", so this
    // is the widest report in the product reachable with the least input.
    const res = await testRequest(appFor(editorId, "Editor", orgId))
      .post(`${TEMPLATES}/${templateId}/run`)
      .send({ templateVersionId: versionId });
    expect(res.status).toBe(403);
  });

  it("refuses an Editor run-now on someone else's project schedule", async () => {
    const created = await testRequest(appFor(adminId, "Admin", orgId))
      .post(SCHEDULES)
      .send(schedulePayload({ scope: "project", projectId: foreignProjectId }));
    expect(created.status).toBe(201);
    const id = (created.body?.data ?? created.body).id;

    const res = await testRequest(appFor(editorId, "Editor", orgId)).post(
      `${SCHEDULES}/${id}/run-now`,
    );
    expect(res.status).toBe(403);
  });

  // The PATCH path was ungated whenever the body carried neither `scope` nor
  // `projectId` — createScheduledReportQuery, the scope-changing PATCH, and
  // run-now all correctly refuse this Editor, but a deliveryConfig-only PATCH
  // skipped authorization entirely (the row was only fetched when scope or
  // projectId were present) and would redirect the schedule's recipients on
  // its next run, for a project canViewRunQuery already denies this Editor on
  // the read side.
  it("refuses an Editor redirecting a foreign project schedule's recipients", async () => {
    const created = await testRequest(appFor(adminId, "Admin", orgId))
      .post(SCHEDULES)
      .send(schedulePayload({ scope: "project", projectId: foreignProjectId }));
    expect(created.status).toBe(201);
    const id = (created.body?.data ?? created.body).id;

    const before = (await sequelize.query(
      `SELECT delivery_config FROM scheduled_reports WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    )) as Array<{ delivery_config: unknown }>;

    const res = await testRequest(appFor(editorId, "Editor", orgId))
      .patch(`${SCHEDULES}/${id}`)
      .send({
        deliveryConfig: {
          saveToStorage: true,
          attachFile: true,
          recipients: ["editor@external.example"],
        },
      });
    expect(res.status).toBe(403);
    // Pin the refusal to the scope rule itself, not merely to some other
    // 403-shaped branch that happens to also leave the row untouched.
    expect(JSON.stringify(res.body)).toContain("not a member");

    const after = (await sequelize.query(
      `SELECT delivery_config FROM scheduled_reports WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    )) as Array<{ delivery_config: unknown }>;
    expect(after[0].delivery_config).toEqual(before[0].delivery_config);
  });

  it("refuses an Editor resuming a foreign project schedule", async () => {
    const created = await testRequest(appFor(adminId, "Admin", orgId))
      .post(SCHEDULES)
      .send(schedulePayload({ scope: "project", projectId: foreignProjectId }));
    expect(created.status).toBe(201);
    const id = (created.body?.data ?? created.body).id;

    const res = await testRequest(appFor(editorId, "Editor", orgId)).post(
      `${SCHEDULES}/${id}/resume`,
    );
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain("not a member");
  });

  // Positive control for the two refusals above: the fix must not block a
  // member acting on their own project's schedule.
  it("allows a project member to patch their own schedule's deliveryConfig", async () => {
    const created = await testRequest(appFor(editorId, "Editor", orgId))
      .post(SCHEDULES)
      .send(schedulePayload({ scope: "project", projectId: ownedProjectId }));
    expect(created.status).toBe(201);
    const id = (created.body?.data ?? created.body).id;

    const res = await testRequest(appFor(editorId, "Editor", orgId))
      .patch(`${SCHEDULES}/${id}`)
      .send({
        deliveryConfig: { saveToStorage: true, attachFile: true, recipients: ["editor@test.com"] },
      });
    expect(res.status).toBe(200);
  });
});
