// Integration suites share one Postgres instance and truncate between tests;
// the default 5s hook timeout is not enough once several suites run in the same
// --runInBand pass. Same value as the isolation matrix.
jest.setTimeout(60000);

/**
 * The membership half of assertReportScopeAllowed, against the real schema.
 * The unit tests stub isMember, so only this file proves the predicate.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { assertReportScopeAllowed } from "../../services/reporting/reportAuthorization";
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

async function addMember(orgId: number, projectId: number, userId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO projects_members (organization_id, project_id, user_id)
     VALUES (:orgId, :projectId, :userId)`,
    { replacements: { orgId, projectId, userId }, type: QueryTypes.INSERT },
  );
}

describe("assertReportScopeAllowed membership resolution", () => {
  let orgId: number;
  let otherOrgId: number;
  let ownerId: number;
  let memberId: number;
  let outsiderId: number;
  let projectId: number;

  beforeEach(async () => {
    await cleanupDatabase();
    const stamp = Date.now();
    orgId = await createTestOrganization("Scope org");
    otherOrgId = await createTestOrganization("Other org");
    ownerId = await createTestUser(orgId, 3, `owner-${stamp}@test.com`, "Password123!");
    memberId = await createTestUser(orgId, 3, `member-${stamp}@test.com`, "Password123!");
    outsiderId = await createTestUser(orgId, 4, `outsider-${stamp}@test.com`, "Password123!");
    projectId = await seedProject(orgId, ownerId, "Members only");
    await addMember(orgId, projectId, memberId);
  });

  afterAll(async () => {
    await cleanupDatabase();
    // Release the pool: each test file has its own sequelize instance, and an
    // open one makes the next file's cleanupDatabase() TRUNCATE time out.
    await sequelize.close();
  });

  it("allows the project owner", async () => {
    const errors = await assertReportScopeAllowed({
      role: "Editor",
      userId: ownerId,
      organizationId: orgId,
      scope: "project",
      projectId,
    });
    expect(errors).toEqual([]);
  });

  it("allows an explicit project member", async () => {
    const errors = await assertReportScopeAllowed({
      role: "Editor",
      userId: memberId,
      organizationId: orgId,
      scope: "project",
      projectId,
    });
    expect(errors).toEqual([]);
  });

  it("refuses a non-member in the same organization", async () => {
    const errors = await assertReportScopeAllowed({
      role: "Auditor",
      userId: outsiderId,
      organizationId: orgId,
      scope: "project",
      projectId,
    });
    expect(errors).toEqual(["you are not a member of this project"]);
  });

  it("refuses a project belonging to another organization without confirming it exists", async () => {
    const errors = await assertReportScopeAllowed({
      role: "Editor",
      userId: ownerId,
      organizationId: otherOrgId,
      scope: "project",
      projectId,
    });
    expect(errors).toEqual(["you are not a member of this project"]);
  });

  it("does not query membership for an Admin", async () => {
    const errors = await assertReportScopeAllowed({
      role: "Admin",
      userId: outsiderId,
      organizationId: orgId,
      scope: "project",
      projectId,
    });
    expect(errors).toEqual([]);
  });
});
