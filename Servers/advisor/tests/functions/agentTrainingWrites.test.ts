import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));
jest.mock("../../../utils/userPermission.utils", () => ({
  userHasPermission: jest.fn(),
}));
jest.mock("../../../utils/trainingAssignment.utils", () => ({
  createTrainingAssignmentsQuery: jest.fn(),
  getAssignableTrainingQuery: jest.fn(),
  getNonMemberUserIdsQuery: jest.fn(),
  getUserFullNameQuery: jest.fn(),
}));
jest.mock("../../../services/inAppNotification.service", () => ({
  notifyTrainingAssigned: jest.fn(),
}));
jest.mock("../../../utils/changeHistory.base.utils", () => ({
  recordMultipleFieldChanges: jest.fn(),
}));
jest.mock("../../approval/approvalGateway", () => ({
  submitForApproval: jest.fn(),
}));
jest.mock("../../../services/trainingRecord.service", () => ({
  createTrainingRecord: jest.fn(),
  updateTrainingRecord: jest.fn(),
  deleteTrainingRecord: jest.fn(),
}));
jest.mock("../../../utils/user.utils", () => ({
  getUserByIdQuery: jest.fn(),
}));
jest.mock("../../../utils/trainingRegistar.utils", () => ({
  getAllTrainingRegistarQuery: jest.fn(),
  getTrainingRegistarByIdQuery: jest.fn(),
}));

import { sequelize } from "../../../database/db";
import { userHasPermission } from "../../../utils/userPermission.utils";
import * as assignments from "../../../utils/trainingAssignment.utils";
import { notifyTrainingAssigned } from "../../../services/inAppNotification.service";
import { recordMultipleFieldChanges } from "../../../utils/changeHistory.base.utils";
import { submitForApproval } from "../../approval/approvalGateway";
import * as records from "../../../services/trainingRecord.service";
import { getUserByIdQuery } from "../../../utils/user.utils";
import { getTrainingRegistarByIdQuery } from "../../../utils/trainingRegistar.utils";
import { availableTrainingTools } from "../../functions/trainingFunctions";
import { writeToolExecutors } from "../../confirmation/createWriteTool";
import { toolsDefinition } from "../../tools/trainingTools";

const ORG = 4;
const APPROVER = 9;
const REQUESTER = 5;
const TRAINING = { id: 3, training_name: "AI literacy", duration: "2 hours", description: null };

const run = (tool: string, params: Record<string, unknown>) =>
  writeToolExecutors.get(tool)!(params, ORG) as Promise<any>;

const mockQuery = sequelize.query as unknown as jest.Mock<any>;
const mockHas = userHasPermission as unknown as jest.Mock<any>;
const mockTraining = assignments.getAssignableTrainingQuery as unknown as jest.Mock<any>;
const mockNonMembers = assignments.getNonMemberUserIdsQuery as unknown as jest.Mock<any>;
const mockCreate = assignments.createTrainingAssignmentsQuery as unknown as jest.Mock<any>;
const mockSubmit = submitForApproval as unknown as jest.Mock<any>;
const mockRecordCreate = records.createTrainingRecord as unknown as jest.Mock<any>;
const mockRecordUpdate = records.updateTrainingRecord as unknown as jest.Mock<any>;
const mockRecordDelete = records.deleteTrainingRecord as unknown as jest.Mock<any>;
const mockUser = getUserByIdQuery as unknown as jest.Mock<any>;
const mockRecordById = getTrainingRegistarByIdQuery as unknown as jest.Mock<any>;

/** The tool as the model calls it: checks, then the approval step. */
const call = (tool: string, params: Record<string, unknown>) =>
  availableTrainingTools[tool](params, ORG) as Promise<any>;

const dateIn = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const schemaOf = (name: string) =>
  toolsDefinition.find((tool) => tool.function.name === name)!.function.parameters;

/** Every SQL statement the tool sent straight to the database. */
const sqlSent = (): string[] => mockQuery.mock.calls.map((call) => String(call[0]));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([[{ id: 3 }]]);
  mockHas.mockResolvedValue(true);
  mockTraining.mockResolvedValue(TRAINING);
  mockNonMembers.mockResolvedValue([]);
  mockCreate.mockResolvedValue({
    created: [
      {
        id: 40,
        training_id: 3,
        user_id: 7,
        user_name: "Ada",
        user_surname: "Lovelace",
        due_date: dateIn(30),
        status: "pending",
      },
    ],
    skippedUserIds: [],
  });
  (assignments.getUserFullNameQuery as unknown as jest.Mock<any>).mockResolvedValue("Grace Hopper");
  mockUser.mockResolvedValue({ name: "Ada", surname: "Lovelace", email: "ada@example.com" });
  mockSubmit.mockResolvedValue({ outcome: "pending", confirmationResult: { pending: true } });
  mockRecordCreate.mockResolvedValue({ id: 3 });
  mockRecordUpdate.mockResolvedValue({ ok: true, record: { id: 3 } });
  mockRecordDelete.mockResolvedValue({ id: 3, training_name: "AI literacy" });
  mockRecordById.mockResolvedValue({ id: 3, training_name: "AI literacy" });
});

describe("agent_assign_training_to_user", () => {
  const params = (extra: Record<string, unknown> = {}) => ({
    training_id: 3,
    user_id: 7,
    due_date: dateIn(30),
    _userId: APPROVER,
    _requesterId: REQUESTER,
    ...extra,
  });

  it("waits for a person to confirm it, since it emails the assignee", async () => {
    const pending = { requiresConfirmation: true };
    mockSubmit.mockResolvedValue({ outcome: "pending", confirmationResult: pending });
    const result = await call("agent_assign_training_to_user", params());
    expect(submitForApproval).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "agent_assign_training_to_user", riskLevel: "warning" }),
    );
    expect(result).toBe(pending);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("describes the approval with the training's and the person's names", async () => {
    await call("agent_assign_training_to_user", params({ due_date: "2099-01-31" }));
    expect(mockUser).toHaveBeenCalledWith(7, null, ORG);
    expect(mockSubmit.mock.calls[0][0]).toMatchObject({
      description: 'Assign "AI literacy" to Ada Lovelace (ada@example.com), due 2099-01-31',
    });
  });

  it.each([
    ["a past due date", { due_date: "2020-01-01" }, "Due date must be today or later"],
    ["no due date", { due_date: undefined }, "Due date must be a valid date in YYYY-MM-DD format"],
    ["a person outside the organization", {}, "Every person must be a member of this organization"],
    ["a training outside the organization", {}, "Training not found"],
    [
      "a requester without training.edit",
      {},
      "Training #3 was not assigned: your role does not allow editing training.",
    ],
  ])("refuses %s before asking anyone to approve", async (what, extra, message) => {
    if (what === "a person outside the organization") mockNonMembers.mockResolvedValue([7]);
    if (what === "a training outside the organization") mockTraining.mockResolvedValue(null);
    if (what === "a requester without training.edit") mockHas.mockResolvedValue(false);
    const result = await call("agent_assign_training_to_user", params(extra));
    expect(result).toEqual({ success: false, message });
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("takes ids given as digits", async () => {
    await run("agent_assign_training_to_user", params({ training_id: "3", user_id: " 7 " }));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ trainingId: 3, userIds: [7] }),
      ORG,
    );
  });

  it.each([
    ["training_id", "three", "Training ID must be a positive integer"],
    ["user_id", "-7", "User ID must be a positive integer"],
    ["user_id", [7], "User ID must be a positive integer"],
  ])("refuses a bad %s with a message about that id", async (field, value, message) => {
    const result = await run("agent_assign_training_to_user", params({ [field]: value }));
    expect(result).toEqual({ success: false, message });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("takes a required due date in its schema", () => {
    const schema = schemaOf("agent_assign_training_to_user");
    expect(schema.properties.due_date).toMatchObject({ type: "string" });
    expect(schema.required).toEqual(expect.arrayContaining(["training_id", "user_id", "due_date"]));
  });

  it("never inserts an assignment without a due date", async () => {
    // Any lookup finds nothing yet, so a raw write would reach its INSERT.
    mockQuery.mockImplementation(async (sql: any) =>
      /^\s*SELECT/i.test(String(sql)) ? [] : [[{ id: 40 }]],
    );
    await run("agent_assign_training_to_user", params());
    for (const sql of sqlSent()) {
      if (/INSERT INTO training_assignments/i.test(sql)) expect(sql).toContain("due_date");
    }
  });

  it("assigns through the console's path, as the requester, with the due date", async () => {
    const dueDate = dateIn(30);
    const result = await run("agent_assign_training_to_user", params({ due_date: dueDate }));

    expect(mockHas).toHaveBeenCalledWith(ORG, REQUESTER, "training.edit");
    expect(mockTraining).toHaveBeenCalledWith(3, ORG);
    expect(mockNonMembers).toHaveBeenCalledWith([7], ORG);
    expect(mockCreate).toHaveBeenCalledWith(
      { trainingId: 3, userIds: [7], dueDate, assignedBy: REQUESTER },
      ORG,
    );
    expect(recordMultipleFieldChanges).toHaveBeenCalledWith(
      "training",
      3,
      REQUESTER,
      ORG,
      [
        {
          fieldName: "Assignment: Ada Lovelace",
          oldValue: "-",
          newValue: `Assigned, due ${dueDate}`,
        },
      ],
      undefined,
      false,
      expect.any(Function),
    );
    expect(notifyTrainingAssigned).toHaveBeenCalledWith(
      ORG,
      7,
      expect.objectContaining({ id: 3, name: "AI literacy", dueDate }),
      "Grace Hopper",
      expect.any(String),
    );
    expect(result).toMatchObject({ success: true, assignment: { id: 40, user_id: 7 } });
    // No write of its own: the shared service made it.
    expect(sqlSent()).toEqual([]);
  });

  it("finishes the audit ledger appends before it returns", async () => {
    const appended: number[] = [];
    (recordMultipleFieldChanges as unknown as jest.Mock<any>).mockImplementation(
      async (...args: any[]) => {
        const defer = args[7] as (append: () => Promise<void>) => void;
        for (const n of [1, 2]) {
          defer(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            appended.push(n);
          });
        }
      },
    );
    await run("agent_assign_training_to_user", params());
    expect(appended).toEqual([1, 2]);
  });

  it("runs as the approver when no requester is recorded", async () => {
    await run("agent_assign_training_to_user", params({ _requesterId: undefined }));
    expect(mockHas).toHaveBeenCalledWith(ORG, APPROVER, "training.edit");
    expect((mockCreate.mock.calls[0][0] as any).assignedBy).toBe(APPROVER);
  });

  it.each([
    ["missing", undefined, "Due date must be a valid date in YYYY-MM-DD format"],
    ["not a date", "next Friday", "Due date must be a valid date in YYYY-MM-DD format"],
    ["impossible", "2099-02-30", "Due date must be a valid date in YYYY-MM-DD format"],
    ["in the past", "2020-01-01", "Due date must be today or later"],
  ])("refuses a due date that is %s and assigns nobody", async (_case, dueDate, message) => {
    const result = await run("agent_assign_training_to_user", params({ due_date: dueDate }));
    expect(result).toEqual({ success: false, message });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(sqlSent()).toEqual([]);
  });

  it("refuses a requester without training.edit", async () => {
    mockHas.mockResolvedValue(false);
    const result = await run("agent_assign_training_to_user", params());
    expect(result).toEqual({
      success: false,
      message: "Training #3 was not assigned: your role does not allow editing training.",
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses without an acting user", async () => {
    mockHas.mockResolvedValue(false);
    const result = await run(
      "agent_assign_training_to_user",
      params({ _userId: undefined, _requesterId: undefined }),
    );
    expect(result.success).toBe(false);
    expect(mockHas).toHaveBeenCalledWith(ORG, undefined, "training.edit");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses a training outside the organization", async () => {
    mockTraining.mockResolvedValue(null);
    const result = await run("agent_assign_training_to_user", params());
    expect(result).toEqual({ success: false, message: "Training not found" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses someone who is not a member of the organization", async () => {
    mockNonMembers.mockResolvedValue([7]);
    const result = await run("agent_assign_training_to_user", params());
    expect(result).toEqual({
      success: false,
      message: "Every person must be a member of this organization",
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("reports someone already assigned, keeping their due date", async () => {
    mockCreate.mockResolvedValue({ created: [], skippedUserIds: [7] });
    const result = await run("agent_assign_training_to_user", params());
    expect(result).toEqual({
      success: false,
      message: "User #7 is already assigned to training #3",
    });
    expect(notifyTrainingAssigned).not.toHaveBeenCalled();
  });
});

describe("training record writes", () => {
  const NO_DUE_DATE =
    "Training records have no due date; set it on the assignment (agent_assign_training_to_user)";

  it("has no due date in the record schemas: records have none, assignments do", () => {
    expect(schemaOf("agent_update_training_record").properties).not.toHaveProperty("due_date");
    expect(schemaOf("agent_create_training_record").properties).not.toHaveProperty("due_date");
  });

  it.each([
    [
      "agent_update_training_record",
      { training_id: 3 },
      `Training record #3 was not updated: ${NO_DUE_DATE}`,
    ],
    [
      "agent_update_training_record",
      { training_id: 3, duration: "2 hours" },
      `Training record #3 was not updated: ${NO_DUE_DATE}`,
    ],
    [
      "agent_create_training_record",
      { title: "AI literacy" },
      `Training record was not created: ${NO_DUE_DATE}`,
    ],
  ])("%s refuses a stored due date instead of dropping it", async (tool, extra, message) => {
    const result = await run(tool, { ...extra, due_date: "2026-12-31", _userId: APPROVER });
    expect(result).toEqual({ success: false, message });
    expect(mockRecordUpdate).not.toHaveBeenCalled();
    expect(mockRecordCreate).not.toHaveBeenCalled();
    expect(sqlSent()).toEqual([]);
  });

  it("refuses a due date before asking anyone to approve", async () => {
    const result = await call("agent_update_training_record", {
      training_id: 3,
      due_date: "2026-12-31",
      _userId: REQUESTER,
    });
    expect(result.success).toBe(false);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("creates through the console's service, as the requester, with duration as text", async () => {
    const result = await run("agent_create_training_record", {
      title: "AI literacy",
      duration: "45 minutes",
      _userId: APPROVER,
      _requesterId: REQUESTER,
    });
    expect(mockHas).toHaveBeenCalledWith(ORG, REQUESTER, "training.edit");
    expect(mockRecordCreate).toHaveBeenCalledWith(
      { status: "Planned", training_name: "AI literacy", duration: "45 minutes" },
      { userId: REQUESTER, organizationId: ORG },
    );
    expect(result).toEqual({ success: true, training_record: { id: 3 } });
    expect(sqlSent()).toEqual([]);
  });

  it("updates through the console's service", async () => {
    const result = await run("agent_update_training_record", {
      training_id: "3",
      duration: "2 hours",
      status: "Completed",
      _userId: APPROVER,
    });
    expect(mockHas).toHaveBeenCalledWith(ORG, APPROVER, "training.edit");
    expect(mockRecordUpdate).toHaveBeenCalledWith(
      3,
      { duration: "2 hours", status: "Completed" },
      { userId: APPROVER, organizationId: ORG },
    );
    expect(result).toEqual({ success: true, training_record: { id: 3 } });
  });

  it("answers no fields and not found", async () => {
    expect(
      await run("agent_update_training_record", { training_id: 3, _userId: APPROVER }),
    ).toEqual({ success: false, message: "No fields to update" });
    mockRecordUpdate.mockResolvedValue({ ok: false, reason: "not_found" });
    expect(
      await run("agent_update_training_record", { training_id: 3, title: "X", _userId: APPROVER }),
    ).toEqual({ success: false, message: "Training record #3 not found" });
  });

  it.each([
    [
      "an update with a bad id",
      "agent_update_training_record",
      { training_id: "three", title: "X" },
      "Training ID must be a positive integer",
    ],
    [
      "an update with no fields",
      "agent_update_training_record",
      { training_id: 3 },
      "No fields to update",
    ],
    [
      "an update of a record outside the organization",
      "agent_update_training_record",
      { training_id: 3, title: "X" },
      "Training record #3 not found",
    ],
    [
      "a delete with no id",
      "agent_delete_training_record",
      {},
      "Training ID must be a positive integer",
    ],
    [
      "a delete of a record outside the organization",
      "agent_delete_training_record",
      { training_id: "3" },
      "Training record #3 not found",
    ],
    [
      "a create without a title",
      "agent_create_training_record",
      { duration: "1 hour" },
      "Training record was not created: a title is required",
    ],
    [
      "a create with a blank title",
      "agent_create_training_record",
      { title: "   " },
      "Training record was not created: a title is required",
    ],
  ])("refuses %s before asking anyone to approve", async (what, tool, extra, message) => {
    if (what.includes("outside the organization")) mockRecordById.mockResolvedValue(null);
    expect(await call(tool, { ...extra, _userId: APPROVER })).toEqual({ success: false, message });
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(await run(tool, { ...extra, _userId: APPROVER })).toEqual({ success: false, message });
    expect(mockRecordCreate).not.toHaveBeenCalled();
    expect(mockRecordUpdate).not.toHaveBeenCalled();
    expect(mockRecordDelete).not.toHaveBeenCalled();
  });

  it("names the parsed id in a refusal, never #undefined", async () => {
    const padded = await run("agent_update_training_record", {
      training_id: " 3",
      due_date: "2026-12-31",
      _userId: APPROVER,
    });
    expect(padded.message).toMatch(/^Training record #3 was not updated: /);
    const missing = await run("agent_delete_training_record", {
      due_date: "2026-12-31",
      _userId: APPROVER,
    });
    expect(missing).toEqual({ success: false, message: "Training ID must be a positive integer" });
  });

  it("runs the pre-approval checks as the caller, never a _requesterId from the params", async () => {
    await call("agent_update_training_record", {
      training_id: 3,
      title: "X",
      _userId: APPROVER,
      _requesterId: REQUESTER,
    });
    expect(mockHas).toHaveBeenCalledTimes(1);
    expect(mockHas).toHaveBeenCalledWith(ORG, APPROVER, "training.edit");
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: APPROVER, inputParams: { training_id: 3, title: "X" } }),
    );
  });

  it("deletes through the console's service with training.admin", async () => {
    const result = await run("agent_delete_training_record", {
      training_id: 3,
      _userId: APPROVER,
      _requesterId: REQUESTER,
    });
    expect(mockHas).toHaveBeenCalledWith(ORG, REQUESTER, "training.admin");
    expect(mockRecordDelete).toHaveBeenCalledWith(3, { userId: REQUESTER, organizationId: ORG });
    expect(result).toEqual({
      success: true,
      deleted_training_record: { id: 3, training_name: "AI literacy" },
    });
  });

  it.each([
    [
      "agent_create_training_record",
      { title: "X" },
      "Training record was not created: your role does not allow editing training.",
    ],
    [
      "agent_update_training_record",
      { training_id: 3, title: "X" },
      "Training record #3 was not updated: your role does not allow editing training.",
    ],
    [
      "agent_delete_training_record",
      { training_id: 3 },
      "Training record #3 was not deleted: your role does not allow deleting training.",
    ],
  ])("%s refuses a role without the console's permission", async (tool, extra, message) => {
    mockHas.mockResolvedValue(false);
    expect(await run(tool, { ...extra, _userId: APPROVER })).toEqual({ success: false, message });
    expect(await call(tool, { ...extra, _userId: APPROVER })).toEqual({ success: false, message });
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockRecordCreate).not.toHaveBeenCalled();
    expect(mockRecordUpdate).not.toHaveBeenCalled();
    expect(mockRecordDelete).not.toHaveBeenCalled();
  });
});
