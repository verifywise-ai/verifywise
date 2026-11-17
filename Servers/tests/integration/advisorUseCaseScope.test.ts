jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { createTestProject } from "../factories";
import { availableUseCaseTools } from "../../advisor/functions/useCaseFunctions";
import { writeToolExecutors } from "../../advisor/confirmation/createWriteTool";

/**
 * U-H1: the advisor sees the use cases the user's list shows, and its use
 * case writes need useCase.edit and write access to the use case.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
let counter = 0;
const user = (orgId: number, role: keyof typeof ROLE) => {
  counter += 1;
  return createTestUser(orgId, ROLE[role], `adv-uc-${Date.now()}-${counter}@test.com`, "Pw1!x");
};

const members = async (projectId: number): Promise<number[]> => {
  const rows = await sequelize.query<{ user_id: number }>(
    `SELECT user_id FROM projects_members WHERE project_id = :projectId ORDER BY user_id`,
    { replacements: { projectId }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.user_id);
};

describe("advisor use case tools run as the user", () => {
  let orgId: number;
  let owner: number;
  let stranger: number;
  let admin: number;
  let auditor: number;
  let mine: number;
  let theirs: number;

  beforeAll(async () => {
    await cleanupDatabase();
    orgId = await createTestOrganization();
    owner = await user(orgId, "Editor");
    stranger = await user(orgId, "Editor");
    admin = await user(orgId, "Admin");
    auditor = await user(orgId, "Auditor");
    mine = await createTestProject(orgId, owner);
    theirs = await createTestProject(orgId, stranger);
    await sequelize.query(
      `INSERT INTO projects_members (organization_id, project_id, user_id)
       VALUES (:orgId, :mine, :auditor)`,
      { replacements: { orgId, mine, auditor } },
    );
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  const ids = (rows: any[]) => rows.map((r) => r.id).sort((a, b) => a - b);

  it("fetch_use_cases lists only the use cases a non-Admin can see", async () => {
    const rows = (await availableUseCaseTools.fetch_use_cases({ _userId: owner }, orgId)) as any[];
    expect(ids(rows)).toEqual([mine]);
  });

  it("fetch_use_cases lists every use case for an Admin", async () => {
    const rows = (await availableUseCaseTools.fetch_use_cases({ _userId: admin }, orgId)) as any[];
    expect(ids(rows)).toEqual([mine, theirs].sort((a, b) => a - b));
  });

  it("analytics and the executive summary count only visible use cases", async () => {
    const analytics = (await availableUseCaseTools.get_use_case_analytics(
      { _userId: owner },
      orgId,
    )) as any;
    const summary = (await availableUseCaseTools.get_use_case_executive_summary(
      { _userId: owner },
      orgId,
    )) as any;
    expect(analytics.totalUseCases).toBe(1);
    expect(summary.totalUseCases).toBe(1);
  });

  it("another organization's user sees none of these use cases", async () => {
    const otherOrg = await createTestOrganization();
    const outsider = await user(otherOrg, "Admin");
    const rows = (await availableUseCaseTools.fetch_use_cases(
      { _userId: outsider },
      orgId,
    )) as any[];
    expect(rows).toEqual([]);
  });

  describe("agent_add_member_to_use_case", () => {
    const add = writeToolExecutors.get("agent_add_member_to_use_case")!;

    it("refuses a use case the requester cannot see and adds nobody", async () => {
      const result = (await add(
        { use_case_id: theirs, user_id: owner, _userId: owner },
        orgId,
      )) as any;
      expect(result).toEqual({
        success: false,
        message: `You do not have access to use case #${theirs}`,
      });
      expect(await members(theirs)).toEqual([]);
    });

    it("refuses a member without useCase.edit (Auditor) and adds nobody", async () => {
      const result = (await add(
        { use_case_id: mine, user_id: stranger, _userId: auditor },
        orgId,
      )) as any;
      expect(result.success).toBe(false);
      expect(await members(mine)).toEqual([auditor]);
    });

    it("lets the owner add a member of the organization", async () => {
      const result = (await add(
        { use_case_id: mine, user_id: stranger, _userId: owner },
        orgId,
      )) as any;
      expect(result.success).toBe(true);
      expect(await members(mine)).toEqual([auditor, stranger].sort((a, b) => a - b));
    });
  });
});
