import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

import {
  toPositiveId,
  assertOrganizationMember,
  assertModelInOrganization,
  resolveModelLinkTargets,
} from "../modelReferences.utils";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

const tx = { id: "tx" } as any;

beforeEach(() => {
  mockQuery.mockReset();
});

describe("toPositiveId", () => {
  it.each([
    [5, 5],
    ["12", 12],
  ])("parses %p", (v, out) => expect(toPositiveId(v)).toBe(out));

  it.each([0, -1, 1.5, "1.5", "1e3", " 3", "3abc", "", null, undefined, {}, [1], NaN, true])(
    "refuses %p",
    (v) => expect(toPositiveId(v)).toBeNull(),
  );
});

describe("assertOrganizationMember", () => {
  it("lets an empty value through without a query (clearing the field)", async () => {
    for (const v of [null, undefined, ""]) {
      await expect(assertOrganizationMember(v, 1, "approver", "msg", tx)).resolves.toBeNull();
    }
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns the id of a member, checked in the same transaction", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 7 }]);
    await expect(assertOrganizationMember("7", 1, "approver", "msg", tx)).resolves.toBe(7);
    expect(mockQuery.mock.calls[0][1]).toMatchObject({
      replacements: { organizationId: 1, userIds: [7] },
      transaction: tx,
    });
  });

  it("refuses a user of another organization", async () => {
    mockQuery.mockResolvedValueOnce([]);
    const err = await assertOrganizationMember(9, 1, "approver", "msg", tx).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationException);
    expect(err.message).toBe("msg");
  });

  it("refuses a malformed id without a query", async () => {
    const err = await assertOrganizationMember("9; drop", 1, "owner", "msg", tx).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationException);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("assertModelInOrganization", () => {
  it("passes a model of the organization", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 3 }]);
    await expect(assertModelInOrganization(3, 1, tx)).resolves.toBe(3);
    expect(mockQuery.mock.calls[0][1]).toMatchObject({
      replacements: { modelId: 3, organizationId: 1 },
      transaction: tx,
    });
  });

  it("refuses another organization's model", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(assertModelInOrganization(3, 1, tx)).rejects.toBeInstanceOf(ValidationException);
  });
});

describe("resolveModelLinkTargets", () => {
  it("returns empty lists without a query", async () => {
    await expect(resolveModelLinkTargets(undefined, undefined, 1, tx)).resolves.toEqual({
      projectIds: [],
      frameworkIds: [],
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("dedupes and keeps only ids the organization owns", async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 4 }, { id: 5 }]) // projects
      .mockResolvedValueOnce([{ id: 2 }]); // frameworks
    await expect(resolveModelLinkTargets([4, "5", 4], [2, 2], 1, tx)).resolves.toEqual({
      projectIds: [4, 5],
      frameworkIds: [2],
    });
    expect(mockQuery.mock.calls[0][1]).toMatchObject({ transaction: tx });
    expect(mockQuery.mock.calls[1][1]).toMatchObject({ transaction: tx });
  });

  it("refuses a use case of another organization", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 4 }]);
    const err = await resolveModelLinkTargets([4, 99], [], 1, tx).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationException);
    expect(err.metadata?.field).toBe("projects");
  });

  it("refuses a framework no use case of the organization uses", async () => {
    mockQuery.mockResolvedValueOnce([]);
    const err = await resolveModelLinkTargets([], [42], 1, tx).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationException);
    expect(err.metadata?.field).toBe("frameworks");
  });

  it.each([[["x"]], ["4"], [[0]], [[null]]])("refuses a malformed list %p", async (projects) => {
    await expect(resolveModelLinkTargets(projects as any, [], 1, tx)).rejects.toBeInstanceOf(
      ValidationException,
    );
  });
});
describe("resolveModelLinkTargets with frameworks already linked", () => {
  it("accepts linked frameworks without a query, checks only the added ones", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 9 }]);
    await expect(resolveModelLinkTargets([], [7, 9], 1, tx, [7])).resolves.toEqual({
      projectIds: [],
      frameworkIds: [7, 9],
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][1].replacements.ids).toEqual([9]);
  });

  it("makes no query when every framework is already linked", async () => {
    await resolveModelLinkTargets([], [7], 1, tx, [7]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
