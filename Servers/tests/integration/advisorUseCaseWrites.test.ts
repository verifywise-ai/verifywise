jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser, seedFrameworks } from "./helpers";
import { availableUseCaseTools } from "../../advisor/functions/useCaseFunctions";
import { writeToolExecutors } from "../../advisor/confirmation/createWriteTool";

/**
 * U-M6: the advisor's use case writes go through the use case service, with
 * the console's statuses, owner, members, frameworks and change history, and
 * only for a user who may change use cases.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
const EU_AI_ACT = 1; // use-case scoped

let counter = 0;
const user = (orgId: number, role: keyof typeof ROLE) => {
  counter += 1;
  return createTestUser(orgId, ROLE[role], `adv-ucw-${Date.now()}-${counter}@test.com`, "Pw1!x");
};

const create = writeToolExecutors.get("agent_create_use_case")!;
const update = writeToolExecutors.get("agent_update_use_case")!;
const updateStatus = writeToolExecutors.get("agent_update_use_case_status")!;
const addMember = writeToolExecutors.get("agent_add_member_to_use_case")!;

const row = async (id: number) => {
  const [found] = await sequelize.query<any>(`SELECT * FROM projects WHERE id = :id`, {
    replacements: { id },
    type: QueryTypes.SELECT,
  });
  return found;
};

const membersOf = async (id: number): Promise<number[]> => {
  const rows = await sequelize.query<{ user_id: number }>(
    `SELECT user_id FROM projects_members WHERE project_id = :id ORDER BY user_id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.user_id);
};

const frameworksOf = async (id: number): Promise<number[]> => {
  const rows = await sequelize.query<{ framework_id: number }>(
    `SELECT framework_id FROM projects_frameworks WHERE project_id = :id ORDER BY framework_id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.framework_id);
};

const historyOf = async (id: number) =>
  sequelize.query<{ field_name: string; new_value: string; changed_by_user_id: number }>(
    `SELECT field_name, new_value, changed_by_user_id FROM use_case_change_history
      WHERE use_case_id = :id ORDER BY id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );

describe("advisor use case writes through the use case service", () => {
  let orgId: number;
  let admin: number;
  let editor: number;
  let member: number;
  let reviewer: number;
  let auditor: number;
  let useCaseId: number;

  beforeAll(async () => {
    await cleanupDatabase();
    await seedFrameworks();
    orgId = await createTestOrganization();
    admin = await user(orgId, "Admin");
    editor = await user(orgId, "Editor");
    member = await user(orgId, "Editor");
    reviewer = await user(orgId, "Reviewer");
    auditor = await user(orgId, "Auditor");
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  it("creates a use case as the requester with a real status, owner, members, frameworks and history", async () => {
    // An approval filed before the lists: Draft and Unacceptable risk map.
    const result = (await create(
      {
        name: "Claims triage",
        description: "Sorts incoming claims",
        status: "Draft",
        risk_classification: "Unacceptable risk",
        members: [member],
        framework_ids: [EU_AI_ACT],
        _userId: admin,
        _requesterId: editor,
      },
      orgId,
    )) as any;

    expect(result.success).toBe(true);
    useCaseId = result.use_case.id;
    const stored = await row(useCaseId);
    expect(stored).toMatchObject({
      organization_id: orgId,
      project_title: "Claims triage",
      status: "Not started",
      ai_risk_classification: "Prohibited",
      owner: editor,
      last_updated_by: editor,
    });
    expect(stored.uc_id).toMatch(/^UC-/);
    expect(await membersOf(useCaseId)).toEqual([member]);
    expect(await frameworksOf(useCaseId)).toEqual([EU_AI_ACT]);
    const history = await historyOf(useCaseId);
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((h) => h.changed_by_user_id === editor)).toBe(true);
  });

  it("updates through the service and records the change in history", async () => {
    const result = (await update(
      { use_case_id: useCaseId, goal: "Faster triage", status: "In progress", _userId: editor },
      orgId,
    )) as any;

    expect(result.success).toBe(true);
    const stored = await row(useCaseId);
    expect(stored).toMatchObject({
      goal: "Faster triage",
      status: "In progress",
      last_updated_by: editor,
    });
    const history = await historyOf(useCaseId);
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field_name: expect.stringMatching(/status/i),
          new_value: "In progress",
          changed_by_user_id: editor,
        }),
      ]),
    );
  });

  it("maps a stored legacy status on a status update", async () => {
    const result = (await updateStatus(
      { use_case_id: useCaseId, status: "Archived", _userId: editor },
      orgId,
    )) as any;

    expect(result.success).toBe(true);
    expect((await row(useCaseId)).status).toBe("Closed");
  });

  it("adds a member through the service and records it", async () => {
    const before = (await historyOf(useCaseId)).length;
    const result = (await addMember(
      { use_case_id: useCaseId, user_id: reviewer, _userId: editor },
      orgId,
    )) as any;

    expect(result.success).toBe(true);
    expect(await membersOf(useCaseId)).toEqual([member, reviewer].sort((a, b) => a - b));
    expect((await historyOf(useCaseId)).length).toBeGreaterThan(before);
  });

  it("refuses an owner outside the organization and writes nothing", async () => {
    const otherOrg = await createTestOrganization();
    const outsider = await user(otherOrg, "Admin");
    const [{ count: before }] = await sequelize.query<{ count: string }>(
      `SELECT COUNT(*) FROM projects WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );

    const result = (await create(
      { name: "Stray", owner: outsider, _userId: editor },
      orgId,
    )) as any;

    expect(result.success).toBe(false);
    const [{ count: after }] = await sequelize.query<{ count: string }>(
      `SELECT COUNT(*) FROM projects WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: QueryTypes.SELECT },
    );
    expect(after).toBe(before);
  });

  it.each(["Reviewer", "Auditor"] as const)(
    "refuses a %s without write access and changes nothing",
    async (role) => {
      const actor = role === "Reviewer" ? reviewer : auditor;
      const before = await row(useCaseId);

      const created = (await create({ name: `By ${role}`, _userId: actor }, orgId)) as any;
      const updated = (await update(
        { use_case_id: useCaseId, goal: `Changed by ${role}`, _userId: actor },
        orgId,
      )) as any;

      expect(created.success).toBe(false);
      expect(updated.success).toBe(false);
      expect((await row(useCaseId)).goal).toBe(before.goal);
      const [{ count }] = await sequelize.query<{ count: string }>(
        `SELECT COUNT(*) FROM projects WHERE organization_id = :orgId AND project_title = :title`,
        { replacements: { orgId, title: `By ${role}` }, type: QueryTypes.SELECT },
      );
      expect(Number(count)).toBe(0);
    },
  );

  it("refuses an old status before an approval is filed", async () => {
    await expect(
      availableUseCaseTools.agent_create_use_case(
        { name: "X", status: "Active", _userId: editor },
        orgId,
      ),
    ).rejects.toThrow("validation failed");
  });

  it("counts the real statuses in the executive summary", async () => {
    const summary = (await availableUseCaseTools.get_use_case_executive_summary(
      { _userId: admin },
      orgId,
    )) as any;
    expect(summary.totalUseCases).toBe(1);
    expect(summary.statusCounts.Closed).toBe(1);
    expect(summary.highRiskUseCases).toBe(1);
  });
});
