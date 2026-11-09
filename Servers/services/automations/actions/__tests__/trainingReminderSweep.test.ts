import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn<any>(),
}));
jest.mock("../../../../utils/trainingAssignment.utils", () => ({
  computeOverdueAssignmentsQuery: jest.fn<any>(),
  assignmentsDueForReminderQuery: jest.fn<any>(),
  emptyGroupAssignmentsQuery: jest.fn<any>(),
  stampAssignmentRemindedQuery: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../../inAppNotification.service", () => ({
  notifyTrainingAssigned: jest.fn<any>(),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  runTrainingReminderSweep,
  runTrainingReminderSweepAllOrgs,
} from "../trainingReminderSweep";
import {
  computeOverdueAssignmentsQuery,
  assignmentsDueForReminderQuery,
  emptyGroupAssignmentsQuery,
  stampAssignmentRemindedQuery,
} from "../../../../utils/trainingAssignment.utils";
import { notifyTrainingAssigned } from "../../../inAppNotification.service";
import { getAllOrganizationsQuery } from "../../../../utils/organization.utils";

const m = (fn: unknown) => fn as jest.MockedFunction<any>;

beforeEach(() => {
  jest.clearAllMocks();
  m(computeOverdueAssignmentsQuery).mockResolvedValue([]);
  m(assignmentsDueForReminderQuery).mockResolvedValue([]);
  m(emptyGroupAssignmentsQuery).mockResolvedValue([]);
  m(notifyTrainingAssigned).mockResolvedValue(undefined);
});

describe("runTrainingReminderSweep", () => {
  it("marks overdue, emails each recipient once and stamps successful sends", async () => {
    m(computeOverdueAssignmentsQuery).mockResolvedValue([11]);
    m(assignmentsDueForReminderQuery).mockResolvedValue([
      {
        assignment_id: 1,
        user_id: 4,
        assigned_by: 8,
        training_id: 5,
        training_name: "AI Literacy",
        training_description: "Basics",
        training_duration: "2 hours",
        due_date: new Date("2026-12-01T00:00:00Z"),
        status: "pending",
      },
      {
        assignment_id: 2,
        user_id: 4,
        assigned_by: 8,
        training_id: 5,
        training_name: "AI Literacy",
        training_description: "Basics",
        training_duration: "2 hours",
        due_date: new Date("2026-12-01T00:00:00Z"),
        status: "overdue",
      },
    ]);

    const summary = await runTrainingReminderSweep(3);

    // Same user + training through two assignments: one email, one stamp.
    expect(m(notifyTrainingAssigned)).toHaveBeenCalledTimes(1);
    expect(m(notifyTrainingAssigned).mock.calls[0]).toEqual([
      3,
      4,
      expect.objectContaining({ id: 5, name: "AI Literacy", dueDate: "2026-12-01" }),
      expect.any(String),
      expect.any(String),
    ]);
    expect(m(stampAssignmentRemindedQuery)).toHaveBeenCalledTimes(1);
    expect(m(stampAssignmentRemindedQuery)).toHaveBeenCalledWith(1);
    expect(summary).toEqual({
      organization_id: 3,
      overdue_marked: 1,
      candidates: 1,
      notified: 1,
      skipped_empty_groups: 0,
    });
  });

  it("does not stamp a failed send, so the next sweep retries", async () => {
    m(assignmentsDueForReminderQuery).mockResolvedValue([
      {
        assignment_id: 7,
        user_id: 4,
        assigned_by: null,
        training_id: 5,
        training_name: "AI Literacy",
        training_description: null,
        training_duration: null,
        due_date: null,
        status: "overdue",
      },
    ]);
    m(notifyTrainingAssigned).mockRejectedValue(new Error("smtp down"));

    const summary = await runTrainingReminderSweep(3);

    expect(m(stampAssignmentRemindedQuery)).not.toHaveBeenCalled();
    expect(summary.notified).toBe(0);
    expect(summary.candidates).toBe(1);
  });

  it("counts group assignments with no members as skipped", async () => {
    m(emptyGroupAssignmentsQuery).mockResolvedValue([
      { assignment_id: 9, training_id: 5, subject_id: 4 },
    ]);

    const summary = await runTrainingReminderSweep(3);

    expect(summary.skipped_empty_groups).toBe(1);
    expect(m(notifyTrainingAssigned)).not.toHaveBeenCalled();
  });
});

describe("runTrainingReminderSweepAllOrgs", () => {
  it("sweeps every org and keeps going when one fails", async () => {
    m(getAllOrganizationsQuery).mockResolvedValue([{ id: 1 }, { id: 2 }]);
    m(computeOverdueAssignmentsQuery).mockImplementation(async (orgId: number) => {
      if (orgId === 1) throw new Error("boom");
      return [];
    });
    m(assignmentsDueForReminderQuery).mockResolvedValue([]);

    await runTrainingReminderSweepAllOrgs();

    // Org 2 is still swept after org 1's failure.
    expect(m(assignmentsDueForReminderQuery)).toHaveBeenCalledWith(2);
  });
});
