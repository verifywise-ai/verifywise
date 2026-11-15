import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../config/changeHistory.config", () => ({
  runInSavepoint: jest.fn(async (work: () => Promise<unknown>) => work()),
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("../changeHistory.base.utils", () => ({
  recordEntityDeletion: jest.fn(),
  recordUpdateChanges: jest.fn(),
}));
jest.mock("../policyApprovalDecision.utils", () => ({
  recordPolicyStatusChange: jest.fn(),
}));
jest.mock("../user.utils", () => ({
  ...(jest.requireActual("../user.utils") as object),
  findUsersNotInOrganization: (jest.fn() as any).mockResolvedValue([]),
}));

import { sequelize } from "../../database/db";
import {
  bulkArchivePoliciesQuery,
  bulkSetPoliciesReviewerQuery,
  bulkSetPoliciesTagsQuery,
} from "../policyManager.utils";
import { recordUpdateChanges } from "../changeHistory.base.utils";
import { recordPolicyStatusChange } from "../policyApprovalDecision.utils";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const mockStatus = recordPolicyStatusChange as jest.MockedFunction<any>;
const mockUpdate = recordUpdateChanges as jest.MockedFunction<any>;
const tx = { id: "tx" } as any;

/** Snapshot reads return the queued results in order; writes return []. */
const queueSnapshots = (...snapshots: unknown[][]) => {
  const queue = [...snapshots];
  mockQuery.mockImplementation((async (sql: string) =>
    String(sql).includes("SELECT pm.id") ? queue.shift() : [[], 0]) as any);
};

describe("bulk policy history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([] as any);
  });

  it("archive records one status change per policy whose status changed, as the user", async () => {
    await bulkArchivePoliciesQuery(4, [1, 2, 3], 9, tx, [
      { id: 1, status: "Draft" },
      { id: 2, status: "Archived" },
      { id: 3, status: "Published" },
    ]);
    expect(mockStatus).toHaveBeenCalledTimes(2);
    expect(mockStatus).toHaveBeenCalledWith(4, 1, 9, "Draft", "Archived", tx);
    expect(mockStatus).toHaveBeenCalledWith(4, 3, 9, "Published", "Archived", tx);
  });

  it("archive survives a failing history write", async () => {
    mockStatus.mockRejectedValueOnce(new Error("boom"));
    await expect(
      bulkArchivePoliciesQuery(4, [1, 2], 9, tx, [
        { id: 1, status: "Draft" },
        { id: 2, status: "Draft" },
      ]),
    ).resolves.toBeUndefined();
    expect(mockStatus).toHaveBeenCalledTimes(2);
  });

  it("set tags records before and after per policy as the acting user", async () => {
    queueSnapshots(
      [
        { id: 1, tags: ["Privacy"], assigned_reviewer_ids: [] },
        { id: 2, tags: ["AI ethics"], assigned_reviewer_ids: [] },
      ],
      [
        { id: 1, tags: ["AI ethics"], assigned_reviewer_ids: [] },
        { id: 2, tags: ["AI ethics"], assigned_reviewer_ids: [] },
      ],
    );
    await bulkSetPoliciesTagsQuery(4, [1, 2], ["AI ethics"] as any, 9, tx);
    expect(mockUpdate).toHaveBeenCalledWith(
      "policy",
      1,
      { tags: ["Privacy"] },
      { tags: ["AI ethics"] },
      9,
      4,
      tx,
    );
    // Unchanged policy 2 is passed through too; trackEntityChanges drops it as equal.
    expect(mockUpdate).toHaveBeenCalledWith(
      "policy",
      2,
      { tags: ["AI ethics"] },
      { tags: ["AI ethics"] },
      9,
      4,
      tx,
    );
  });

  it("set reviewer records the reviewer list read back after the write", async () => {
    queueSnapshots(
      [{ id: 1, tags: [], assigned_reviewer_ids: [3, 5] }],
      [{ id: 1, tags: [], assigned_reviewer_ids: [7] }],
    );
    await bulkSetPoliciesReviewerQuery(4, [1], 7, 9, tx);
    expect(mockUpdate).toHaveBeenCalledWith(
      "policy",
      1,
      { assigned_reviewer_ids: [3, 5] },
      { assigned_reviewer_ids: [7] },
      9,
      4,
      tx,
    );
  });

  it("snapshots are read org-scoped on the transaction", async () => {
    queueSnapshots([], []);
    await bulkSetPoliciesTagsQuery(4, [1], [] as any, 9, tx);
    const snaps = mockQuery.mock.calls.filter((c) => String(c[0]).includes("SELECT pm.id"));
    expect(snaps).toHaveLength(2);
    for (const [sql, opts] of snaps as Array<[string, any]>) {
      expect(sql).toContain("pm.organization_id = :organizationId");
      expect(opts.replacements.organizationId).toBe(4);
      expect(opts.transaction).toBe(tx);
    }
  });
});
