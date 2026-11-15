import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../user.utils", () => ({
  ...(jest.requireActual("../user.utils") as object),
  findUsersNotInOrganization: (jest.fn() as any).mockResolvedValue([]),
}));

import { sequelize } from "../../database/db";
import { bulkSetPoliciesReviewerQuery } from "../policyManager.utils";
import { findUsersNotInOrganization } from "../user.utils";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const tx = { id: "tx" } as any;

describe("bulkSetPoliciesReviewerQuery", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([] as any);
  });

  it("replaces the team members with the one user and leaves review_status alone", async () => {
    await bulkSetPoliciesReviewerQuery(4, [10, 11], 7, 9, tx);

    const sqls = mockQuery.mock.calls.map((c) => String(c[0]));
    // snapshot, delete, insert
    expect(sqls).toHaveLength(3);
    expect(sqls[1]).toContain("DELETE FROM policy_manager__assigned_reviewer_ids");
    expect(sqls[2]).toContain("INSERT INTO policy_manager__assigned_reviewer_ids");
    expect(sqls.some((s) => s.includes("review_status"))).toBe(false);
    for (const call of mockQuery.mock.calls) {
      expect((call[1] as any).transaction).toBe(tx);
      expect((call[1] as any).replacements.organizationId).toBe(4);
    }
  });

  it("skips a policy the user owns, as create and update do", async () => {
    await bulkSetPoliciesReviewerQuery(4, [10, 11], 7, 9, tx);

    const [sql, options] = mockQuery.mock.calls[2] as [string, any];
    expect(sql).toContain("pm.organization_id = :organizationId");
    expect(sql).toContain("pm.policy_owner_id IS DISTINCT FROM :reviewerId");
    expect(options.replacements).toEqual({ organizationId: 4, ids: [10, 11], reviewerId: 7 });
  });

  it("rejects a user outside the organization before writing", async () => {
    (findUsersNotInOrganization as any).mockResolvedValueOnce([7]);
    await expect(bulkSetPoliciesReviewerQuery(4, [10], 7, 9, tx)).rejects.toThrow(
      "Reviewers must be members of this organization",
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("does nothing for no ids", async () => {
    await bulkSetPoliciesReviewerQuery(4, [], 7, 9, tx);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
