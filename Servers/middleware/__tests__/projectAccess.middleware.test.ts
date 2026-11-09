import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/project.utils", () => ({
  getProjectAccessQuery: jest.fn(),
  getProjectReadAccessQuery: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logFailure: jest.fn(),
}));

import { requireProjectAccess } from "../projectAccess.middleware";
import { getProjectAccessQuery, getProjectReadAccessQuery } from "../../utils/project.utils";
import { logFailure } from "../../utils/logger/logHelper";

const accessQuery = getProjectAccessQuery as unknown as jest.Mock<(...args: any[]) => Promise<any>>;
const readAccessQuery = getProjectReadAccessQuery as unknown as jest.Mock<
  (...args: any[]) => Promise<any>
>;
const logged = logFailure as unknown as jest.Mock<(...args: any[]) => Promise<any>>;

function createReq(overrides: Record<string, unknown> = {}): Request {
  return {
    userId: 7,
    role: "Editor",
    organizationId: 3,
    method: "DELETE",
    params: { id: "12" },
    t: (key: string) => key,
    ...overrides,
  } as unknown as Request;
}

function createRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as unknown as Response["status"];
  res.json = jest.fn().mockReturnValue(res) as unknown as Response["json"];
  return res as Response;
}

describe("requireProjectAccess", () => {
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    logged.mockResolvedValue(undefined);
    next = jest.fn();
  });

  it("calls next when the caller can see the use case", async () => {
    accessQuery.mockResolvedValue("allowed");
    const res = createRes();

    await requireProjectAccess()(createReq(), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it("scopes the check to the caller and their organization", async () => {
    accessQuery.mockResolvedValue("allowed");

    await requireProjectAccess()(createReq(), createRes(), next);

    expect(accessQuery).toHaveBeenCalledWith(12, { userId: 7, role: "Editor" }, 3);
  });

  it("answers 403 and logs when the caller has no access", async () => {
    accessQuery.mockResolvedValue("denied");
    const res = createRes();

    await requireProjectAccess()(createReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: "Access denied" }));
    expect(next).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "Delete",
        userId: 7,
        organizationId: 3,
        functionName: "requireProjectAccess",
      }),
    );
  });

  it.each([
    ["GET", "Read"],
    ["PATCH", "Update"],
    ["POST", "Update"],
    ["DELETE", "Delete"],
  ])("logs a refused %s as %s", async (method, eventType) => {
    accessQuery.mockResolvedValue("denied");
    readAccessQuery.mockResolvedValue("denied");

    await requireProjectAccess()(createReq({ method }), createRes(), next);

    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ eventType }));
  });

  it("uses the read rule, which includes task assignees, for a GET", async () => {
    readAccessQuery.mockResolvedValue("allowed");

    await requireProjectAccess()(createReq({ method: "GET" }), createRes(), next);

    expect(readAccessQuery).toHaveBeenCalledWith(12, { userId: 7, role: "Editor" }, 3);
    expect(accessQuery).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "keeps the stricter rule for a %s",
    async (method) => {
      accessQuery.mockResolvedValue("allowed");

      await requireProjectAccess()(createReq({ method }), createRes(), next);

      expect(accessQuery).toHaveBeenCalledTimes(1);
      expect(readAccessQuery).not.toHaveBeenCalled();
    },
  );

  it("leaves a missing use case to the controller's 404", async () => {
    accessQuery.mockResolvedValue("not_found");
    const res = createRes();

    await requireProjectAccess()(createReq(), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("fails closed with a 500 when the check throws", async () => {
    accessQuery.mockRejectedValue(new Error("connection lost"));
    const res = createRes();

    await requireProjectAccess()(createReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it("answers 401 without a user or role", async () => {
    for (const overrides of [{ userId: undefined }, { role: undefined }]) {
      const res = createRes();
      await requireProjectAccess()(createReq(overrides), res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    }
    expect(next).not.toHaveBeenCalled();
    expect(accessQuery).not.toHaveBeenCalled();
  });

  it("refuses a caller with no organization without querying", async () => {
    const res = createRes();

    await requireProjectAccess()(createReq({ organizationId: undefined }), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(accessQuery).not.toHaveBeenCalled();
  });

  it.each(["abc", "0", "-3", "12abc", "1.5", "", "9007199254740992", "9".repeat(400)])(
    "answers 400 for the id %j",
    async (id) => {
      const res = createRes();

      await requireProjectAccess()(createReq({ params: { id } }), res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
      expect(accessQuery).not.toHaveBeenCalled();
    },
  );

  it("reads the id from a named route parameter", async () => {
    accessQuery.mockResolvedValue("allowed");

    await requireProjectAccess("projid")(
      createReq({ params: { projid: "44" } }),
      createRes(),
      next,
    );

    expect(accessQuery).toHaveBeenCalledWith(44, expect.anything(), 3);
  });

  describe("reading the id from the query", () => {
    const fromQuery = requireProjectAccess("projectId", "query");

    it("checks the query's id and ignores params and body", async () => {
      accessQuery.mockResolvedValue("allowed");

      await fromQuery(
        createReq({
          method: "POST",
          params: { projectId: "1" },
          body: { projectId: 2 },
          query: { projectId: "44" },
        }),
        createRes(),
        next,
      );

      expect(accessQuery).toHaveBeenCalledWith(44, expect.anything(), 3);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["a repeated field", ["1", "2"]],
      ["a nested object", { id: "1" }],
      ["no value", undefined],
      ["a value parseInt would truncate", "44abc"],
    ])("answers 400 for %s", async (_name, projectId) => {
      const res = createRes();

      await fromQuery(
        createReq({ params: { projectId: "1" }, body: { projectId: 1 }, query: { projectId } }),
        res,
        next,
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
      expect(accessQuery).not.toHaveBeenCalled();
    });
  });
});
