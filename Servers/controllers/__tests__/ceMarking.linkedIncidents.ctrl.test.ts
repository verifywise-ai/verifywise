import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn(async () => mockTransaction), query: jest.fn() },
}));
jest.mock("../../utils/logger/dbLogger", () => ({ logEvent: jest.fn() }));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import {
  LINKED_INCIDENTS_NOT_A_LIST_MESSAGE,
  LINKED_INCIDENTS_NOT_FOUND_MESSAGE,
  parseLinkedIncidentIds,
  updateCEMarking,
} from "../ceMarking.ctrl";
import { sequelize } from "../../database/db";

const mockQuery = sequelize.query as unknown as jest.Mock<(...a: any[]) => any>;

describe("parseLinkedIncidentIds", () => {
  it.each([
    [
      [1, 2, 3],
      [1, 2, 3],
    ],
    [
      ["4", " 5 "],
      [4, 5],
    ],
    [[6, 6, "6"], [6]],
    [[], []],
  ])("accepts %j as %j", (input, expected) => {
    expect(parseLinkedIncidentIds(input)).toEqual(expected);
  });

  it.each([["abc"], [[1, "abc"]], [[1.5]], [[0]], [[-2]], [[null]], [["12abc"]], [{ 0: 1 }]])(
    "refuses %j",
    (input) => {
      expect(parseLinkedIncidentIds(input)).toBeNull();
    },
  );
});

describe("updateCEMarking linked incidents", () => {
  const t = (key: string) => `T:${key}`;
  const makeReq = (linkedIncidents: unknown) =>
    ({
      params: { projectId: "3" },
      body: { linkedIncidents },
      userId: 5,
      organizationId: 7,
      t,
    }) as any;
  const makeRes = () => {
    const res: any = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM projects")) return [{ id: 3 }];
      if (sql.includes("FROM ce_markings")) return [{ id: 11, total_incidents: 0 }];
      // Only incident 21 is in the organization.
      if (sql.includes("FROM ai_incident_managements")) return [{ id: 21 }];
      return [];
    });
  });

  it("answers 400 for a non-numeric id and writes nothing", async () => {
    const res = makeRes();

    await updateCEMarking(makeReq([21, "abc"]), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].data).toBe(`T:${LINKED_INCIDENTS_NOT_A_LIST_MESSAGE}`);
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT"))).toBe(false);
  });

  it("answers 400 for an incident outside the organization and writes nothing", async () => {
    const res = makeRes();

    await updateCEMarking(makeReq([21, 99]), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].data).toBe(`T:${LINKED_INCIDENTS_NOT_FOUND_MESSAGE}`);
    const lookup = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("FROM ai_incident_managements"),
    )!;
    expect(lookup[1]).toEqual(
      expect.objectContaining({ replacements: { organizationId: 7, ids: [21, 99] } }),
    );
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT"))).toBe(false);
    expect(mockTransaction.commit).not.toHaveBeenCalled();
  });
});
