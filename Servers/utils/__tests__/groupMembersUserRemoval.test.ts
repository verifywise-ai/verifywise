import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn(async (..._args: any[]): Promise<any> => []);
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));
jest.mock("../fileUpload.utils", () => ({ deleteFileById: jest.fn() }));

import { removeUserFromOrganizationQuery } from "../user.utils";

const ORG_ID = 7;
const tx = { id: "tx" } as any;

const sqlOf = (call: any[]) => String(call[0]).replace(/\s+/g, " ");
const indexOfCall = (pattern: RegExp) =>
  mockQuery.mock.calls.findIndex((c) => pattern.test(sqlOf(c)));

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: any) =>
    /DELETE FROM organization_members/.test(String(sql)) ? [{ user_id: 5 }] : [],
  );
});

describe("removing a user from an organization (#5253 groups)", () => {
  it("deletes their group memberships in that organization, inside the transaction", async () => {
    await removeUserFromOrganizationQuery(5, ORG_ID, tx);
    const groups = indexOfCall(/DELETE FROM group_members/);
    const membership = indexOfCall(/DELETE FROM organization_members/);
    expect(groups).toBeGreaterThanOrEqual(0);
    expect(membership).toBeGreaterThan(groups);
    expect(sqlOf(mockQuery.mock.calls[groups])).toContain(
      "WHERE organization_id = :organizationId AND user_id = :user_id",
    );
    const options = mockQuery.mock.calls[groups][1] as any;
    expect(options.replacements).toEqual({ user_id: 5, organizationId: ORG_ID });
    expect(options.transaction).toBe(tx);
  });
});
