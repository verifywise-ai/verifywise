import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn(async (..._args: any[]): Promise<any> => []);
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

import { inviteeRefusalQuery } from "../organizationMember.utils";

beforeEach(() => {
  mockQuery.mockReset();
});

describe("inviteeRefusalQuery", () => {
  it("lets a new address be invited", async () => {
    mockQuery.mockResolvedValue([]);
    expect(await inviteeRefusalQuery(4, "new@x.io")).toBeNull();
  });

  it("lets an account of other organizations be invited", async () => {
    mockQuery.mockResolvedValue([{ has_membership: true, in_organization: false }]);
    expect(await inviteeRefusalQuery(4, "priya@x.io")).toBeNull();
  });

  it("refuses an account that is already a member", async () => {
    mockQuery.mockResolvedValue([{ has_membership: true, in_organization: true }]);
    expect(await inviteeRefusalQuery(4, "priya@x.io")).toBe("already_member");
  });

  it("refuses an account with no membership, which is a pure super admin", async () => {
    mockQuery.mockResolvedValue([{ has_membership: false, in_organization: false }]);
    expect(await inviteeRefusalQuery(4, "root@x.io")).toBe("super_admin");
  });

  it("asks the RLS-safe helper whether the account has any membership", async () => {
    mockQuery.mockResolvedValue([]);
    await inviteeRefusalQuery(4, "priya@x.io");
    const [sql] = mockQuery.mock.calls[0] as [string, any];
    expect(sql).toContain("verifywise.user_has_organization_membership(u.id)");
  });

  it("matches the address case- and whitespace-insensitively", async () => {
    mockQuery.mockResolvedValue([]);
    await inviteeRefusalQuery(4, " Priya@X.io ");
    const [sql, options] = mockQuery.mock.calls[0] as [string, any];
    expect(sql).toContain("LOWER(TRIM(u.email)) = LOWER(TRIM(:email))");
    expect(options.replacements).toEqual({ email: " Priya@X.io ", organizationId: 4 });
  });
});
