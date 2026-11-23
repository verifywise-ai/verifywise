jest.setTimeout(60000);

/**
 * A scheduled report carries its recipients and its stored report details, so
 * it is read under the same rule as the runs it produces
 * (utils/reportVisibility.utils.ts): a project schedule only by Admins and the
 * project's owner and members, an organization-wide schedule by every member.
 * Before this rule, the schedules list and GET /api/v1/scheduled-reports/:id
 * returned every schedule of the organization to any signed-in member.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import {
  getScheduledReportQuery,
  listScheduledReportsQuery,
} from "../../utils/scheduledReport.utils";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

async function insertOne(sql: string, replacements: Record<string, unknown>): Promise<number> {
  const rows = (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT })) as Array<{
    id: number;
  }>;
  return rows[0].id;
}

describe("scheduled report visibility", () => {
  let orgId: number;
  let adminId: number;
  let ownerId: number;
  let memberId: number;
  let outsiderId: number;
  let groupMemberId: number;
  let projectSchedule: number;
  let orgSchedule: number;

  beforeEach(async () => {
    await cleanupDatabase();
    orgId = await createTestOrganization("Schedule visibility org");
    // roleId 1 = Admin (unrestricted), 3 = Editor, 4 = Auditor.
    const stamp = Date.now();
    adminId = await createTestUser(orgId, 1, `admin-${stamp}@test.com`, "Password123!");
    ownerId = await createTestUser(orgId, 3, `owner-${stamp}@test.com`, "Password123!");
    memberId = await createTestUser(orgId, 4, `member-${stamp}@test.com`, "Password123!");
    outsiderId = await createTestUser(orgId, 3, `outsider-${stamp}@test.com`, "Password123!");
    groupMemberId = await createTestUser(orgId, 3, `group-${stamp}@test.com`, "Password123!");

    const projectId = await insertOne(
      `INSERT INTO projects
         (project_title, owner, start_date, ai_risk_classification, high_risk_roles,
          goal, last_updated, last_updated_by, organization_id)
       VALUES ('Members only', :ownerId, NOW(), 'High risk', '{Deployer}', 'goal', NOW(), :ownerId, :orgId)
       RETURNING id`,
      { ownerId, orgId },
    );
    await sequelize.query(
      `INSERT INTO projects_members (organization_id, project_id, user_id)
       VALUES (:orgId, :projectId, :memberId)`,
      { replacements: { orgId, projectId, memberId } },
    );
    // A group attached to the use case grants its members the same access as
    // team members (#5253), reports included.
    const groupId = await insertOne(
      `INSERT INTO groups (organization_id, name) VALUES (:orgId, 'Model risk') RETURNING id`,
      { orgId },
    );
    await sequelize.query(
      `INSERT INTO group_members (group_id, user_id, organization_id)
       VALUES (:groupId, :groupMemberId, :orgId)`,
      { replacements: { groupId, groupMemberId, orgId } },
    );
    await sequelize.query(
      `INSERT INTO project_groups (project_id, group_id, organization_id)
       VALUES (:projectId, :groupId, :orgId)`,
      { replacements: { projectId, groupId, orgId } },
    );

    const templateId = await insertOne(
      `INSERT INTO report_templates (organization_id, name, slug, category, default_scope)
       VALUES (:orgId, 'Board pack', 'board-pack', 'governance', 'organization')
       RETURNING id`,
      { orgId },
    );
    const versionId = await insertOne(
      `INSERT INTO report_template_versions (template_id, version) VALUES (:templateId, 1)
       RETURNING id`,
      { templateId },
    );
    const schedule = (name: string, scope: string, project: number | null) =>
      insertOne(
        `INSERT INTO scheduled_reports
           (organization_id, template_id, template_version_id, name, scope, project_id,
            delivery_config)
         VALUES (:orgId, :templateId, :versionId, :name, :scope, :project,
                 '{"recipients":["board@example.com"]}'::jsonb)
         RETURNING id`,
        { orgId, templateId, versionId, name, scope, project },
      );
    projectSchedule = await schedule("Project risks", "project", projectId);
    orgSchedule = await schedule("Organization overview", "organization", null);
  });

  afterAll(async () => {
    await cleanupDatabase();
    await sequelize.close();
  });

  const listIds = async (role: string, userId: number) =>
    (await listScheduledReportsQuery(orgId, { role, userId })).map((r: any) => r.id).sort();

  it("lists a project schedule only to Admins and the project's people", async () => {
    const both = [projectSchedule, orgSchedule].sort();
    expect(await listIds("Admin", adminId)).toEqual(both);
    expect(await listIds("Editor", ownerId)).toEqual(both);
    expect(await listIds("Auditor", memberId)).toEqual(both);
    expect(await listIds("Editor", groupMemberId)).toEqual(both);
    expect(await listIds("Editor", outsiderId)).toEqual([orgSchedule]);
  });

  it("reads a project schedule only for Admins and the project's people", async () => {
    const read = (role: string, userId: number) =>
      getScheduledReportQuery(projectSchedule, orgId, { role, userId });
    expect((await read("Admin", adminId))?.id).toBe(projectSchedule);
    expect((await read("Editor", ownerId))?.id).toBe(projectSchedule);
    expect((await read("Auditor", memberId))?.id).toBe(projectSchedule);
    expect((await read("Editor", groupMemberId))?.id).toBe(projectSchedule);
    expect(await read("Editor", outsiderId)).toBeNull();
  });

  it("reads an organization-wide schedule for every member", async () => {
    const row = await getScheduledReportQuery(orgSchedule, orgId, {
      role: "Editor",
      userId: outsiderId,
    });
    expect(row?.id).toBe(orgSchedule);
  });

  it("shows an unidentified caller organization-wide schedules only", async () => {
    expect(await listIds("Editor", null as unknown as number)).toEqual([orgSchedule]);
  });

  it("still reads any schedule of the organization without a viewer (write paths)", async () => {
    expect((await getScheduledReportQuery(projectSchedule, orgId))?.id).toBe(projectSchedule);
  });
});
