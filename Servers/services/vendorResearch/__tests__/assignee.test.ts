/**
 * isUserOfOrganization: the one check of "is this user a user of this organization" that the
 * research agent makes for a user someone else named: the assignee of a vendor, who is told about
 * findings, and the action owner of an accepted finding.
 *
 * The lookup underneath is mocked, as in the tests of the job and of the findings service.
 */
jest.mock("../../../utils/user.utils", () => ({ findUsersNotInOrganization: jest.fn() }));

import type { Transaction } from "sequelize";
import { findUsersNotInOrganization } from "../../../utils/user.utils";
import { isUserOfOrganization } from "../assignee";

const asMock = (fn: unknown) => fn as jest.Mock;

const ORG = 7;
const USER = 42;

beforeEach(() => {
  jest.resetAllMocks();
});

describe("isUserOfOrganization", () => {
  it("is true for a user the lookup does not report as missing", async () => {
    asMock(findUsersNotInOrganization).mockResolvedValue([]);

    await expect(isUserOfOrganization(USER, ORG)).resolves.toBe(true);

    // Exactly two arguments: without a transaction, none is passed on, not even an undefined one.
    expect(findUsersNotInOrganization).toHaveBeenCalledTimes(1);
    expect(findUsersNotInOrganization).toHaveBeenCalledWith([USER], ORG);
  });

  it("is false for a user the lookup reports as missing", async () => {
    asMock(findUsersNotInOrganization).mockResolvedValue([USER]);

    await expect(isUserOfOrganization(USER, ORG)).resolves.toBe(false);

    expect(findUsersNotInOrganization).toHaveBeenCalledWith([USER], ORG);
  });

  it("runs the lookup in the transaction it is given", async () => {
    const transaction = { LOCK: "a transaction" } as unknown as Transaction;
    asMock(findUsersNotInOrganization).mockResolvedValue([]);

    await expect(isUserOfOrganization(USER, ORG, transaction)).resolves.toBe(true);

    expect(findUsersNotInOrganization).toHaveBeenCalledTimes(1);
    expect(findUsersNotInOrganization).toHaveBeenCalledWith([USER], ORG, transaction);
  });

  it.each([
    ["zero", 0],
    ["a negative number", -3],
    ["a fraction", 1.5],
    ["not a number", Number.NaN],
    ["a number above the largest safe integer", Number.MAX_SAFE_INTEGER + 1],
    ["infinity", Number.POSITIVE_INFINITY],
  ])("is false without a lookup for %s", async (_label, id) => {
    // The lookup ignores ids like these and so reports nobody missing, which would read as a yes.
    asMock(findUsersNotInOrganization).mockResolvedValue([]);
    const transaction = {} as Transaction;

    await expect(isUserOfOrganization(id, ORG)).resolves.toBe(false);
    await expect(isUserOfOrganization(id, ORG, transaction)).resolves.toBe(false);

    expect(findUsersNotInOrganization).not.toHaveBeenCalled();
  });

  it("is true for the largest safe integer, which can be a user id, when it is found", async () => {
    asMock(findUsersNotInOrganization).mockResolvedValue([]);

    await expect(isUserOfOrganization(Number.MAX_SAFE_INTEGER, ORG)).resolves.toBe(true);

    expect(findUsersNotInOrganization).toHaveBeenCalledWith([Number.MAX_SAFE_INTEGER], ORG);
  });

  it("rejects when the lookup fails, so that a caller can tell a failure from a no", async () => {
    asMock(findUsersNotInOrganization).mockRejectedValue(new Error("database is down"));

    await expect(isUserOfOrganization(USER, ORG)).rejects.toThrow("database is down");
    await expect(isUserOfOrganization(USER, ORG, {} as Transaction)).rejects.toThrow(
      "database is down",
    );
  });
});
