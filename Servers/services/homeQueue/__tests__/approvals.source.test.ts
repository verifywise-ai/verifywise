jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
// approvalRequest.utils loads the advisor actions, which keep handles open.
jest.mock("../../../advisor/aiActions", () => ({ executeAiAction: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import { sequelize } from "../../../database/db";
import { approvalsSource } from "../sources/approvals.source";
import type { HomeQueueContext } from "../../../domain.layer/interfaces/i.homeQueue";

const query = sequelize.query as unknown as jest.Mock;

const ctx: HomeQueueContext = {
  organizationId: 7,
  userId: 5,
  can: () => false,
  isAdmin: false,
  today: "2026-11-14",
};

describe("approvalsSource", () => {
  beforeEach(() => query.mockReset());

  it("is visible to anyone in the organization, whatever their permissions", () => {
    expect(approvalsSource.isVisible(ctx)).toBe(true);
    expect(approvalsSource.id).toBe("approvals");
    expect(approvalsSource.part).toBe("enforce");
  });

  it("returns pending steps where I am the approver of the current step only", async () => {
    query
      .mockResolvedValueOnce([
        {
          id: 31,
          request_name: "Deploy CV screener",
          current_step: 2,
          status: "Pending",
          created_at: new Date("2026-11-10T08:30:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([{ request_id: 31, step_count: 3 }]);

    const items = await approvalsSource.load(ctx);

    const [pendingSql, pendingOptions] = query.mock.calls[0];
    expect(pendingOptions.replacements).toEqual(
      expect.objectContaining({ organizationId: 7, userId: 5, status: "Pending" }),
    );
    expect(pendingSql).toContain("ar.organization_id = :organizationId");
    expect(pendingSql).toContain("arsa.approver_id = :userId");
    expect(pendingSql).toContain("ars.step_number = ar.current_step");
    expect(pendingSql).toContain("arsa.approval_result = :pendingResult");

    const [countSql, countOptions] = query.mock.calls[1];
    expect(countSql).toContain("organization_id = :organizationId");
    expect(countOptions.replacements).toEqual({ organizationId: 7, requestIds: [31] });

    expect(items).toEqual([
      {
        id: "approvals:31",
        source: "approvals",
        part: "enforce",
        entityType: "approval_request",
        entityId: 31,
        name: "Deploy CV screener",
        url: "/approval-workflows?request=31",
        dueDate: null,
        waitingSince: "2026-11-10T08:30:00.000Z",
        overdue: false,
        meta: { stepNumber: 2, stepCount: 3 },
      },
    ]);
  });

  it("skips the step count query when nothing is pending", async () => {
    query.mockResolvedValueOnce([]);

    expect(await approvalsSource.load(ctx)).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("reports a missing step count as null rather than guessing", async () => {
    query
      .mockResolvedValueOnce([
        { id: 4, request_name: "Model", current_step: 1, created_at: "2026-11-01T00:00:00.000Z" },
      ])
      .mockResolvedValueOnce([]);

    const [only] = await approvalsSource.load(ctx);
    expect(only.meta).toEqual({ stepNumber: 1, stepCount: null });
  });

  it("lets a database error propagate so the runner marks the source unavailable", async () => {
    query.mockRejectedValueOnce(new Error("boom"));
    await expect(approvalsSource.load(ctx)).rejects.toThrow("boom");
  });
});
