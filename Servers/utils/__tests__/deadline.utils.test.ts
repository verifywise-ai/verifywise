import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn<any>(),
  },
}));

import {
  getTaskDeadlineSummaryQuery,
  DEFAULT_DUE_SOON_THRESHOLD_DAYS,
} from "../deadline.utils";
import { sequelize } from "../../database/db";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

describe("getTaskDeadlineSummaryQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Two COUNT(*) queries fire per call (overdue + dueSoon). Default both to 0.
    mockQuery.mockResolvedValue([{ count: 0 }] as any);
  });

  it("returns parsed counts and echoes the threshold", async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: 3 }] as any) // overdue
      .mockResolvedValueOnce([{ count: 5 }] as any); // dueSoon

    const result = await getTaskDeadlineSummaryQuery({
      userId: 1,
      role: "Admin",
      organizationId: 99,
      thresholdDays: 14,
    });

    expect(result).toEqual({ overdue: 3, dueSoon: 5, threshold: 14 });
  });

  it("uses the default 14-day threshold when none is provided", async () => {
    await getTaskDeadlineSummaryQuery({
      userId: 1,
      role: "Admin",
      organizationId: 99,
    });

    const dueSoonCall = mockQuery.mock.calls[1];
    expect((dueSoonCall[1] as any).replacements.threshold).toBe(
      DEFAULT_DUE_SOON_THRESHOLD_DAYS,
    );
  });

  it("does NOT add a visibility clause for Admin", async () => {
    await getTaskDeadlineSummaryQuery({
      userId: 1,
      role: "Admin",
      organizationId: 99,
    });

    const overdueSql = mockQuery.mock.calls[0][0] as string;
    expect(overdueSql).not.toContain("creator_id = :userId");
    expect(overdueSql).not.toContain("task_assignees");
  });

  it("does NOT add a visibility clause for SuperAdmin", async () => {
    await getTaskDeadlineSummaryQuery({
      userId: 1,
      role: "SuperAdmin",
      organizationId: 99,
    });

    const overdueSql = mockQuery.mock.calls[0][0] as string;
    expect(overdueSql).not.toContain("creator_id = :userId");
  });

  it("adds creator-or-assignee visibility clause for non-admin roles", async () => {
    await getTaskDeadlineSummaryQuery({
      userId: 7,
      role: "Editor",
      organizationId: 99,
    });

    const overdueSql = mockQuery.mock.calls[0][0] as string;
    expect(overdueSql).toContain("creator_id = :userId");
    expect(overdueSql).toContain("task_assignees");
  });

  it("scopes both queries by organization_id and excludes Completed/Deleted statuses", async () => {
    await getTaskDeadlineSummaryQuery({
      userId: 1,
      role: "Admin",
      organizationId: 99,
    });

    for (const call of mockQuery.mock.calls) {
      const sql = call[0] as string;
      const reps = (call[1] as any).replacements;
      expect(sql).toContain("organization_id = :organizationId");
      expect(sql).toContain("status NOT IN (:completedStatus, :deletedStatus)");
      expect(reps.organizationId).toBe(99);
      expect(reps.completedStatus).toBe("Completed");
      expect(reps.deletedStatus).toBe("Deleted");
    }
  });
});
