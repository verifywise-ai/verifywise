import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn(async (..._args: any[]): Promise<any> => []);
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));
jest.mock("../fileUpload.utils", () => ({ deleteFileById: jest.fn() }));

import { findUserFieldOutsideOrganization } from "../user.utils";

const ORG_ID = 7;
const tx = { id: "tx" } as any;

/** Members of ORG_ID, as organization_members would return them. */
const membersAre = (...ids: number[]) =>
  mockQuery.mockImplementation(async (_sql: any, options: any) =>
    (options?.replacements?.userIds ?? [])
      .filter((id: number) => ids.includes(id))
      .map((id: number) => ({ id })),
  );

beforeEach(() => {
  mockQuery.mockReset();
  membersAre(5);
});

describe("findUserFieldOutsideOrganization", () => {
  it("passes a member and returns the first field naming someone else", async () => {
    await expect(
      findUserFieldOutsideOrganization([{ field: "assignee", value: 5 }], ORG_ID, tx),
    ).resolves.toBeNull();

    const outside = await findUserFieldOutsideOrganization(
      [
        { field: "assignee", value: 5 },
        { field: "reviewer", value: 9 },
      ],
      ORG_ID,
      tx,
    );
    expect(outside).toMatchObject({ field: "reviewer", value: 9, reason: "outside" });
  });

  it("reads organization_members on the caller's transaction", async () => {
    await findUserFieldOutsideOrganization([{ field: "assignee", value: "9" }], ORG_ID, tx);

    const [sql, options] = mockQuery.mock.calls[0] as [string, any];
    expect(sql).toContain("FROM organization_members");
    expect(options).toMatchObject({
      replacements: { organizationId: ORG_ID, userIds: [9] },
      transaction: tx,
    });
  });

  it("does not check an unchanged stored value, so a user who left does not block edits", async () => {
    await expect(
      findUserFieldOutsideOrganization([{ field: "assignee", value: 9, stored: 9 }], ORG_ID, tx),
    ).resolves.toBeNull();
    await expect(
      findUserFieldOutsideOrganization([{ field: "assignee", value: "9", stored: 9 }], ORG_ID, tx),
    ).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("checks a changed value even when the stored one was a member", async () => {
    const outside = await findUserFieldOutsideOrganization(
      [{ field: "reviewer", value: 9, stored: 5 }],
      ORG_ID,
      tx,
    );
    expect(outside).toMatchObject({ field: "reviewer", reason: "outside" });
  });

  it("treats a field not written, null, '' and 0 as no user", async () => {
    for (const value of [undefined, null, "", 0]) {
      await expect(
        findUserFieldOutsideOrganization([{ field: "reviewer", value, stored: 5 }], ORG_ID, tx),
      ).resolves.toBeNull();
    }
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("fails closed on a value that is not a positive integer, reported as invalid", async () => {
    for (const value of [5.5, "5x", "Jane Doe", -3, { id: 5 }]) {
      await expect(
        findUserFieldOutsideOrganization([{ field: "assignee", value }], ORG_ID, tx),
      ).resolves.toMatchObject({ field: "assignee", reason: "invalid" });
    }
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
