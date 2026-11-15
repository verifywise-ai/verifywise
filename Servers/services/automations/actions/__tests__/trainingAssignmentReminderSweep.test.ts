import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn<any>(),
}));
jest.mock("../../../../utils/trainingAssignment.utils", () => ({
  findTrainingRemindersDueQuery: jest.fn<any>(),
  markTrainingReminderSentQuery: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../../inAppNotification.service", () => ({
  notifyTrainingReminder: jest.fn<any>(),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  runTrainingAssignmentReminderSweep,
  runTrainingAssignmentReminderSweepAllOrgs,
} from "../trainingAssignmentReminderSweep";
import {
  findTrainingRemindersDueQuery,
  markTrainingReminderSentQuery,
} from "../../../../utils/trainingAssignment.utils";
import { notifyTrainingReminder } from "../../../inAppNotification.service";
import { getAllOrganizationsQuery } from "../../../../utils/organization.utils";
import logger from "../../../../utils/logger/fileLogger";

const m = (fn: unknown) => fn as jest.MockedFunction<any>;

const reminder = (id: number, kind: "due_soon" | "overdue", userId = id + 100) => ({
  id,
  user_id: userId,
  training_id: 7,
  training_name: "AI literacy",
  due_date: "2026-11-12",
  kind,
});

beforeEach(() => {
  jest.clearAllMocks();
  m(notifyTrainingReminder).mockResolvedValue(undefined);
});

describe("runTrainingAssignmentReminderSweep", () => {
  it("notifies each reminder with its kind and stamps that kind", async () => {
    m(findTrainingRemindersDueQuery).mockResolvedValue([
      reminder(1, "due_soon"),
      reminder(2, "overdue"),
    ]);

    const summary = await runTrainingAssignmentReminderSweep(3);

    expect(m(notifyTrainingReminder).mock.calls[0]).toEqual([
      3,
      101,
      { id: 7, name: "AI literacy", dueDate: "2026-11-12" },
      "due_soon",
      expect.any(String),
    ]);
    expect(m(notifyTrainingReminder).mock.calls[1][3]).toBe("overdue");
    expect(markTrainingReminderSentQuery).toHaveBeenCalledWith(1, "due_soon", 3);
    expect(markTrainingReminderSentQuery).toHaveBeenCalledWith(2, "overdue", 3);
    expect(summary).toEqual({ organization_id: 3, candidates: 2, notified: 2 });
  });

  it("leaves a failed send unstamped so it retries, and still does the others", async () => {
    m(findTrainingRemindersDueQuery).mockResolvedValue([
      reminder(1, "overdue"),
      reminder(2, "overdue"),
      reminder(3, "due_soon"),
    ]);
    m(notifyTrainingReminder)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("smtp down"))
      .mockResolvedValueOnce(undefined);

    const summary = await runTrainingAssignmentReminderSweep(3);

    expect(notifyTrainingReminder).toHaveBeenCalledTimes(3);
    expect(markTrainingReminderSentQuery).toHaveBeenCalledTimes(2);
    expect(markTrainingReminderSentQuery).not.toHaveBeenCalledWith(2, "overdue", 3);
    expect(summary).toEqual({ organization_id: 3, candidates: 3, notified: 2 });
  });

  it("sends nothing when no reminder is due, which is the dedupe path", async () => {
    m(findTrainingRemindersDueQuery).mockResolvedValue([]);

    const summary = await runTrainingAssignmentReminderSweep(3);

    expect(notifyTrainingReminder).not.toHaveBeenCalled();
    expect(markTrainingReminderSentQuery).not.toHaveBeenCalled();
    expect(summary).toEqual({ organization_id: 3, candidates: 0, notified: 0 });
  });
});

describe("runTrainingAssignmentReminderSweepAllOrgs", () => {
  it("keeps going after one organization fails", async () => {
    m(getAllOrganizationsQuery).mockResolvedValue([{ id: 1 }, { id: undefined }, { id: 2 }]);
    m(findTrainingRemindersDueQuery)
      .mockRejectedValueOnce(new Error("db hiccup"))
      .mockResolvedValueOnce([reminder(9, "overdue")]);

    await runTrainingAssignmentReminderSweepAllOrgs();

    expect(findTrainingRemindersDueQuery).toHaveBeenCalledTimes(2);
    expect(findTrainingRemindersDueQuery).toHaveBeenLastCalledWith(2);
    expect(markTrainingReminderSentQuery).toHaveBeenCalledWith(9, "overdue", 2);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
