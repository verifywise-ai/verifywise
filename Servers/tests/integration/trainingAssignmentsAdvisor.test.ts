jest.setTimeout(60000);

// Must stay the first import: setup.ts stubs inAppNotification.service, and the
// stub only applies to modules loaded after it.
import { createTestApp, testRequest } from "./setup";
import { sequelize } from "../../database/db";
import { notifyTrainingAssigned } from "../../services/inAppNotification.service";
import { writeToolExecutors } from "../../advisor/confirmation/createWriteTool";
import "../../advisor/functions/trainingFunctions";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";

/**
 * The Advisor's training writes over a real database: assigning goes through
 * the console's path (due date, membership, history, notice), and a record
 * update never writes a date into duration. Record writes from the console
 * and the Advisor share one service, so both leave the same history.
 */

const assignedNotice = notifyTrainingAssigned as jest.Mock;
const ROLE = { Admin: 1, Editor: 3, Auditor: 4 } as const;

let counter = 0;
const user = (orgId: number, roleId: number) => {
  counter += 1;
  return createTestUser(orgId, roleId, `adv-training-${Date.now()}-${counter}@test.com`, "Pw1!x");
};

const dateIn = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const ROLE_NAMES: Record<number, string> = { 1: "Admin", 3: "Editor", 4: "Auditor" };

async function apiAs(orgId: number, userId: number, roleId: number) {
  const app = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role: ROLE_NAMES[roleId] },
  });
  return testRequest(app);
}

const record = (tool: string, params: Record<string, unknown>, orgId: number) =>
  writeToolExecutors.get(tool)!(params, orgId) as Promise<any>;

async function historyOf(trainingId: number) {
  const [rows] = await sequelize.query(
    `SELECT action, field_name, new_value, changed_by_user_id
       FROM training_change_history WHERE training_id = :trainingId ORDER BY id`,
    { replacements: { trainingId } },
  );
  return rows as Array<Record<string, any>>;
}

async function trainingExists(trainingId: number): Promise<boolean> {
  const [rows] = await sequelize.query(`SELECT id FROM trainingregistar WHERE id = :trainingId`, {
    replacements: { trainingId },
  });
  return (rows as unknown[]).length > 0;
}

const assign = (params: Record<string, unknown>, orgId: number) =>
  writeToolExecutors.get("agent_assign_training_to_user")!(params, orgId) as Promise<any>;

async function createTraining(orgId: number): Promise<number> {
  const [rows] = await sequelize.query(
    `INSERT INTO trainingregistar (organization_id, training_name, duration, provider, description)
     VALUES (:orgId, 'AI literacy', '2 hours', 'Acme', 'Basics') RETURNING id`,
    { replacements: { orgId } },
  );
  return (rows as Array<{ id: number }>)[0].id;
}

async function assignmentRows(trainingId: number) {
  const [rows] = await sequelize.query(
    `SELECT user_id, to_char(due_date, 'YYYY-MM-DD') AS due_date, assigned_by
       FROM training_assignments WHERE training_id = :trainingId ORDER BY id`,
    { replacements: { trainingId } },
  );
  return rows as Array<Record<string, any>>;
}

describe("Advisor training writes", () => {
  let orgId: number;
  let adminId: number;
  let traineeId: number;
  let auditorId: number;
  let trainingId: number;

  beforeEach(async () => {
    assignedNotice.mockClear();
    orgId = await createTestOrganization("Advisor training");
    adminId = await user(orgId, ROLE.Admin);
    traineeId = await user(orgId, ROLE.Editor);
    auditorId = await user(orgId, ROLE.Auditor);
    trainingId = await createTraining(orgId);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("assigns with the due date, as the requester, with history and a notice", async () => {
    const dueDate = dateIn(30);
    const result = await assign(
      { training_id: trainingId, user_id: traineeId, due_date: dueDate, _userId: adminId },
      orgId,
    );

    expect(result).toMatchObject({
      success: true,
      assignment: { training_id: trainingId, user_id: traineeId, due_date: dueDate },
    });
    expect(await assignmentRows(trainingId)).toEqual([
      { user_id: traineeId, due_date: dueDate, assigned_by: adminId },
    ]);
    const [history] = await sequelize.query(
      `SELECT old_value, new_value, changed_by_user_id
         FROM training_change_history WHERE training_id = :trainingId`,
      { replacements: { trainingId } },
    );
    expect(history).toEqual([
      { old_value: "-", new_value: `Assigned, due ${dueDate}`, changed_by_user_id: adminId },
    ]);
    expect(assignedNotice).toHaveBeenCalledWith(
      orgId,
      traineeId,
      expect.objectContaining({ id: trainingId, dueDate }),
      expect.any(String),
      expect.any(String),
    );

    const again = await assign(
      { training_id: trainingId, user_id: traineeId, due_date: dateIn(60), _userId: adminId },
      orgId,
    );
    expect(again.success).toBe(false);
    expect((await assignmentRows(trainingId))[0].due_date).toBe(dueDate);
  });

  it("refuses a missing or past due date and a role without training.edit", async () => {
    const base = { training_id: trainingId, user_id: traineeId };
    expect(await assign({ ...base, _userId: adminId }, orgId)).toEqual({
      success: false,
      message: "Due date must be a valid date in YYYY-MM-DD format",
    });
    expect(await assign({ ...base, due_date: "2020-01-01", _userId: adminId }, orgId)).toEqual({
      success: false,
      message: "Due date must be today or later",
    });
    expect(
      (await assign({ ...base, due_date: dateIn(30), _userId: auditorId }, orgId)).success,
    ).toBe(false);
    expect(await assignmentRows(trainingId)).toEqual([]);
    expect(assignedNotice).not.toHaveBeenCalled();
  });

  it("refuses a training or a person from another organization", async () => {
    const otherOrg = await createTestOrganization("Other");
    const outsider = await user(otherOrg, ROLE.Editor);
    const foreignTraining = await createTraining(otherOrg);

    expect(
      await assign(
        {
          training_id: foreignTraining,
          user_id: traineeId,
          due_date: dateIn(30),
          _userId: adminId,
        },
        orgId,
      ),
    ).toEqual({ success: false, message: "Training not found" });
    expect(
      await assign(
        { training_id: trainingId, user_id: outsider, due_date: dateIn(30), _userId: adminId },
        orgId,
      ),
    ).toEqual({ success: false, message: "Every person must be a member of this organization" });
    expect(await assignmentRows(trainingId)).toEqual([]);
    expect(await assignmentRows(foreignTraining)).toEqual([]);
  });

  it("console create, update and delete still record history", async () => {
    const admin = await apiAs(orgId, adminId, ROLE.Admin);
    const created = await admin.post("/api/training").send({
      training_name: "Console course",
      duration: "1 hour",
      provider: "Acme",
      department: "Legal",
      status: "Planned",
      numberOfPeople: 4,
      description: "Basics",
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const updated = await admin.patch(`/api/training/${id}`).send({ duration: "2 hours" });
    expect(updated.status).toBe(202);
    expect(updated.body.data.duration).toBe("2 hours");
    expect((await admin.patch("/api/training/999999").send({ duration: "x" })).status).toBe(404);

    const history = await historyOf(id);
    expect(history.some((row) => row.action === "created")).toBe(true);
    expect(history).toContainEqual(
      expect.objectContaining({
        action: "updated",
        new_value: "2 hours",
        changed_by_user_id: adminId,
      }),
    );

    expect((await admin.delete(`/api/training/${id}`)).status).toBe(202);
    expect(await trainingExists(id)).toBe(false);
  });

  it("Advisor record writes go through the same service, with history and permissions", async () => {
    const created = await record(
      "agent_create_training_record",
      { title: "Advisor course", duration: "45 minutes", _userId: adminId },
      orgId,
    );
    expect(created).toMatchObject({ success: true });
    const id = created.training_record.id;
    expect((await historyOf(id)).some((row) => row.action === "created")).toBe(true);

    const updated = await record(
      "agent_update_training_record",
      { training_id: id, status: "Completed", _userId: auditorId, _requesterId: traineeId },
      orgId,
    );
    expect(updated).toMatchObject({ success: true });
    expect(await historyOf(id)).toContainEqual(
      expect.objectContaining({ action: "updated", changed_by_user_id: traineeId }),
    );

    // An Auditor cannot edit; an Editor cannot delete (training.admin).
    expect(
      (
        await record(
          "agent_update_training_record",
          { training_id: id, title: "X", _userId: auditorId },
          orgId,
        )
      ).success,
    ).toBe(false);
    expect(
      await record("agent_delete_training_record", { training_id: id, _userId: traineeId }, orgId),
    ).toEqual({
      success: false,
      message: `Training record #${id} was not deleted: your role does not allow deleting training.`,
    });
    expect(await trainingExists(id)).toBe(true);

    expect(
      await record("agent_delete_training_record", { training_id: id, _userId: adminId }, orgId),
    ).toEqual({
      success: true,
      deleted_training_record: { id, training_name: "Advisor course" },
    });
    expect(await trainingExists(id)).toBe(false);
  });

  it("never writes a due date into a record's duration", async () => {
    const update = writeToolExecutors.get("agent_update_training_record")!;
    const result = (await update(
      { training_id: trainingId, duration: "1 day", due_date: "2026-12-31", _userId: adminId },
      orgId,
    )) as any;
    expect(result.success).toBe(false);
    expect(result.message).toContain("Training records have no due date");

    await update({ training_id: trainingId, duration: "3 hours", _userId: adminId }, orgId);
    const [rows] = await sequelize.query(
      `SELECT duration FROM trainingregistar WHERE id = :trainingId`,
      { replacements: { trainingId } },
    );
    expect(rows).toEqual([{ duration: "3 hours" }]);
  });
});
