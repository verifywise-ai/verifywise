import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/project.utils", () => ({
  getProjectAccessQuery: jest.fn(),
  getProjectReadAccessQuery: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logFailure: jest.fn(),
}));

import { checkedUseCaseId, requireUseCaseAccessVia } from "../projectAccess.middleware";
import { getProjectAccessQuery, getProjectReadAccessQuery } from "../../utils/project.utils";
import { logFailure } from "../../utils/logger/logHelper";

type AsyncMock = jest.Mock<(...args: any[]) => Promise<any>>;
const accessQuery = getProjectAccessQuery as unknown as AsyncMock;
const readAccessQuery = getProjectReadAccessQuery as unknown as AsyncMock;
const logged = logFailure as unknown as AsyncMock;

function createReq(overrides: Record<string, unknown> = {}): Request {
  return {
    userId: 7,
    role: "Editor",
    organizationId: 3,
    method: "GET",
    params: { id: "40" },
    query: {},
    t: (key: string) => key,
    ...overrides,
  } as unknown as Request;
}

function createRes(): Response {
  const res: Partial<Response> = { locals: {} };
  res.status = jest.fn().mockReturnValue(res) as unknown as Response["status"];
  res.json = jest.fn().mockReturnValue(res) as unknown as Response["json"];
  return res as Response;
}

describe("requireUseCaseAccessVia", () => {
  let next: jest.Mock;
  let resolve: AsyncMock;

  beforeEach(() => {
    jest.clearAllMocks();
    logged.mockResolvedValue(undefined);
    next = jest.fn();
    resolve = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(12);
  });

  it("resolves the use case from the child id in the caller's organization", async () => {
    readAccessQuery.mockResolvedValue("allowed");
    const req = createReq();

    await requireUseCaseAccessVia(resolve)(req, createRes(), next);

    expect(resolve).toHaveBeenCalledWith(40, 3, req);
    expect(readAccessQuery).toHaveBeenCalledWith(12, { userId: 7, role: "Editor" }, 3);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("records the use case it checked for the handler", async () => {
    readAccessQuery.mockResolvedValue("allowed");
    const res = createRes();

    await requireUseCaseAccessVia(resolve)(createReq(), res, next);

    expect(checkedUseCaseId(res)).toBe(12);
  });

  it("records nothing for a child that is not found", async () => {
    resolve.mockResolvedValue(null);
    const res = createRes();

    await requireUseCaseAccessVia(resolve)(createReq(), res, next);

    expect(checkedUseCaseId(res)).toBeUndefined();
  });

  it("applies the write rule to a write", async () => {
    accessQuery.mockResolvedValue("allowed");

    await requireUseCaseAccessVia(resolve)(createReq({ method: "PATCH" }), createRes(), next);

    expect(accessQuery).toHaveBeenCalledWith(12, { userId: 7, role: "Editor" }, 3);
    expect(readAccessQuery).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("answers 403 and logs when the caller cannot see the use case", async () => {
    accessQuery.mockResolvedValue("denied");
    const res = createRes();

    await requireUseCaseAccessVia(resolve)(createReq({ method: "DELETE" }), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: "Access denied" }));
    expect(next).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ eventType: "Delete" }));
  });

  it("passes a read of a child that is not in the organization on to the handler", async () => {
    resolve.mockResolvedValue(null);

    await requireUseCaseAccessVia(resolve)(createReq(), createRes(), next);

    expect(readAccessQuery).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("answers 404 to a write naming a child that is not in the organization", async () => {
    resolve.mockResolvedValue(null);
    const res = createRes();

    await requireUseCaseAccessVia(resolve)(createReq({ method: "POST" }), res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes such a write on with missing: "pass"', async () => {
    resolve.mockResolvedValue(null);

    await requireUseCaseAccessVia(resolve, { missing: "pass" })(
      createReq({ method: "POST" }),
      createRes(),
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("reads the id from the query when asked", async () => {
    readAccessQuery.mockResolvedValue("allowed");
    const req = createReq({ params: {}, query: { projectFrameworkId: "41" } });

    await requireUseCaseAccessVia(resolve, { param: "projectFrameworkId", source: "query" })(
      req,
      createRes(),
      next,
    );

    expect(resolve).toHaveBeenCalledWith(41, 3, req);
  });

  it("refuses a repeated query field with 400", async () => {
    const res = createRes();

    await requireUseCaseAccessVia(resolve, { param: "projectFrameworkId", source: "query" })(
      createReq({ params: {}, query: { projectFrameworkId: ["41", "42"] } }),
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("lets an absent optional field through without a check", async () => {
    await requireUseCaseAccessVia(resolve, {
      param: "projectFrameworkId",
      source: "query",
      optional: true,
    })(createReq({ params: {}, query: {} }), createRes(), next);

    expect(resolve).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("checks a present optional field", async () => {
    readAccessQuery.mockResolvedValue("denied");
    const res = createRes();

    await requireUseCaseAccessVia(resolve, {
      param: "projectFrameworkId",
      source: "query",
      optional: true,
    })(createReq({ params: {}, query: { projectFrameworkId: "41" } }), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("answers 400 for an id that is not a positive integer", async () => {
    const res = createRes();

    await requireUseCaseAccessVia(resolve)(createReq({ params: { id: "abc" } }), res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("refuses a caller with no organization", async () => {
    const res = createRes();

    await requireUseCaseAccessVia(resolve)(createReq({ organizationId: undefined }), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("answers 500 when the check fails, never allowing", async () => {
    resolve.mockRejectedValue(new Error("db down"));
    const res = createRes();

    await requireUseCaseAccessVia(resolve)(createReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it("reads the id from the body when asked", async () => {
    readAccessQuery.mockResolvedValue("allowed");
    accessQuery.mockResolvedValue("allowed");
    const req = createReq({ method: "POST", params: {}, body: { project_id: 41 } });

    await requireUseCaseAccessVia(resolve, { param: "project_id", source: "body" })(
      req,
      createRes(),
      next,
    );

    expect(resolve).toHaveBeenCalledWith(41, 3, req);
    expect(next).toHaveBeenCalledTimes(1);
  });

  describe("orAllow", () => {
    it("lets a caller the use case rule refuses through when orAllow says so", async () => {
      accessQuery.mockResolvedValue("denied");
      const orAllow = jest.fn<(...args: any[]) => Promise<boolean>>().mockResolvedValue(true);
      const req = createReq({ method: "POST" });
      const res = createRes();

      await requireUseCaseAccessVia(resolve, { orAllow })(req, res, next);

      expect(orAllow).toHaveBeenCalledWith(40, 3, req);
      expect(next).toHaveBeenCalledTimes(1);
      expect(checkedUseCaseId(res)).toBe(12);
    });

    it("still refuses when orAllow says no", async () => {
      accessQuery.mockResolvedValue("denied");
      const res = createRes();

      await requireUseCaseAccessVia(resolve, {
        orAllow: async () => false,
      })(createReq({ method: "POST" }), res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("is not asked when the use case rule allows", async () => {
      readAccessQuery.mockResolvedValue("allowed");
      const orAllow = jest.fn<(...args: any[]) => Promise<boolean>>();

      await requireUseCaseAccessVia(resolve, { orAllow })(createReq(), createRes(), next);

      expect(orAllow).not.toHaveBeenCalled();
    });
  });

  describe('missing: "seesAll"', () => {
    const options = { missing: "seesAll" as const };

    it("refuses a missing use case to a role that does not see every use case", async () => {
      readAccessQuery.mockResolvedValue("not_found");
      const res = createRes();

      await requireUseCaseAccessVia(resolve, options)(createReq(), res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("lets an Admin through for a missing use case", async () => {
      readAccessQuery.mockResolvedValue("not_found");

      await requireUseCaseAccessVia(resolve, options)(
        createReq({ role: "Admin" }),
        createRes(),
        next,
      );

      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
