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
    mockQuery.mockResolvedValue([{ organization_id: 2 }, { organization_id: 3 }]);
    expect(await inviteeRefusalQuery(4, "priya@x.io")).toBeNull();
  });

  it("refuses an account that is already a member", async () => {
    mockQuery.mockResolvedValue([{ organization_id: 2 }, { organization_id: 4 }]);
    expect(await inviteeRefusalQuery(4, "priya@x.io")).toBe("already_member");
  });

  it("refuses an account with no membership, which is a pure super admin", async () => {
    // LEFT JOIN: the account's single row carries no organization.
    mockQuery.mockResolvedValue([{ organization_id: null }]);
    expect(await inviteeRefusalQuery(4, "root@x.io")).toBe("super_admin");
  });

  it("matches the address case- and whitespace-insensitively", async () => {
    mockQuery.mockResolvedValue([]);
    await inviteeRefusalQuery(4, " Priya@X.io ");
    const [sql, options] = mockQuery.mock.calls[0] as [string, any];
    expect(sql).toContain("LOWER(TRIM(u.email)) = LOWER(TRIM(:email))");
    expect(options.replacements).toEqual({ email: " Priya@X.io " });
  });
});
