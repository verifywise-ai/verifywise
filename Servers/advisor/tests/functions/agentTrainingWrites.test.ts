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

import { sequelize } from "../../../database/db";
import { userHasPermission } from "../../../utils/userPermission.utils";
import * as assignments from "../../../utils/trainingAssignment.utils";
import { notifyTrainingAssigned } from "../../../services/inAppNotification.service";
import { recordMultipleFieldChanges } from "../../../utils/changeHistory.base.utils";
import "../../functions/trainingFunctions";
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

describe("training record writes never put a date in duration", () => {
  it("has no due date in the record schemas: records have none, assignments do", () => {
    expect(schemaOf("agent_update_training_record").properties).not.toHaveProperty("due_date");
    expect(schemaOf("agent_create_training_record").properties).not.toHaveProperty("due_date");
  });

  it("does not write a due date into duration on update", async () => {
    const result = await run("agent_update_training_record", {
      training_id: 3,
      due_date: "2026-12-31",
      _userId: APPROVER,
    });
    expect(result).toEqual({ success: false, message: "No fields to update" });
    expect(sqlSent()).toEqual([]);
  });

  it("updates duration as text when asked to", async () => {
    await run("agent_update_training_record", {
      training_id: 3,
      duration: "2 hours",
      due_date: "2026-12-31",
      _userId: APPROVER,
    });
    const [sql, options] = mockQuery.mock.calls[0] as [string, any];
    expect(sql).toContain("duration = :duration");
    expect(options.replacements).toMatchObject({ duration: "2 hours", organizationId: ORG, id: 3 });
    expect(Object.values(options.replacements)).not.toContain("2026-12-31");
  });

  it("does not write a due date into duration on create", async () => {
    await run("agent_create_training_record", {
      title: "AI literacy",
      due_date: "2026-12-31",
      _userId: APPROVER,
    });
    const [, options] = mockQuery.mock.calls[0] as [string, any];
    expect(options.replacements.duration).toBeNull();
    expect(Object.values(options.replacements)).not.toContain("2026-12-31");
  });

  it("creates with a duration when one is given", async () => {
    await run("agent_create_training_record", {
      title: "AI literacy",
      duration: "45 minutes",
      _userId: APPROVER,
    });
    const [, options] = mockQuery.mock.calls[0] as [string, any];
    expect(options.replacements.duration).toBe("45 minutes");
  });
});
