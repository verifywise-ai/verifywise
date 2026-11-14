import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { sequelize } from "../../database/db";
import { parseReferencedIds } from "../user.utils";
import { assertRiskReferencesInOrganization } from "../risk.utils";
import { assertPolicyUsersInOrganization } from "../policyManager.utils";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

describe("parseReferencedIds", () => {
  it("treats null, undefined and 0 as no reference", () => {
    expect(parseReferencedIds([null, undefined, 0])).toEqual([]);
  });

  it("accepts positive integers and digit strings, de-duplicated", () => {
    expect(parseReferencedIds([5, "5", 7])).toEqual([5, 7]);
  });

  it.each([5.5, -1, "5x", "5.0", "", NaN, {}, true])("fails closed on %p", (value) => {
    expect(parseReferencedIds([3, value])).toBeNull();
  });
});

describe("assertRiskReferencesInOrganization", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("rejects a non-integer owner without querying, so it cannot round into another user", async () => {
    await expect(assertRiskReferencesInOrganization({ risk_owner: 5.5 }, 1)).rejects.toBeInstanceOf(
      ValidationException,
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects a malformed project id without querying", async () => {
    await expect(
      assertRiskReferencesInOrganization({ projects: [2, 2.5] }, 1),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects an owner who is not a member", async () => {
    mockQuery.mockResolvedValueOnce([] as any);
    await expect(assertRiskReferencesInOrganization({ risk_owner: 9 }, 1)).rejects.toThrow(
      "The risk owner must be a member of this organization",
    );
  });

  it("passes members, own use cases and existing frameworks", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 9 }] as any) // owner membership
      .mockResolvedValueOnce([{ id: 3 }] as any) // projects
      .mockResolvedValueOnce([{ id: 1 }] as any); // frameworks
    await expect(
      assertRiskReferencesInOrganization({ risk_owner: 9, projects: [3], frameworks: [1] }, 1),
    ).resolves.toBeUndefined();
  });
});

describe("assertPolicyUsersInOrganization", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("ignores an empty or cleared owner", async () => {
    await expect(
      assertPolicyUsersInOrganization([null], "policy_owner_id", 1),
    ).resolves.toBeUndefined();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects a non-integer reviewer id without querying", async () => {
    await expect(
      assertPolicyUsersInOrganization([4, 5.5], "assigned_reviewer_ids", 1),
    ).rejects.toThrow("Reviewers must be members of this organization");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects an owner who is not a member", async () => {
    mockQuery.mockResolvedValueOnce([] as any);
    await expect(assertPolicyUsersInOrganization([9], "policy_owner_id", 1)).rejects.toThrow(
      "The policy owner must be a member of this organization",
    );
  });
});
