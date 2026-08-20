import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { Request, Response } from "express";

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    401: (message: string) => ({ message }),
    403: (message: string) => ({ message }),
    404: (message: string) => ({ message }),
    500: (message: string) => ({ message }),
  },
}));
jest.mock("../../utils/validations/validation.utils", () => ({
  sanitizeForLog: (value: string) => value,
}));

const mockFindByKey = jest.fn();
const mockFindByExtensionId = jest.fn();

jest.mock("../../domain.layer/models/extension/extension.model", () => ({
  ExtensionModel: {
    findByKey: (...args: unknown[]) => mockFindByKey(...args),
  },
}));
jest.mock("../../domain.layer/models/extension/extensionEnablement.model", () => ({
  ExtensionEnablementModel: {
    findByExtensionId: (...args: unknown[]) => mockFindByExtensionId(...args),
  },
}));

// Import the middleware AFTER mocks are wired.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { requireExtensionEnabled } = require("../requireExtensionEnabled.middleware");

function makeReq(organizationId?: number): Partial<Request> {
  return {
    t: (key: string) => key,
    ...(organizationId !== undefined ? { organizationId } : {}),
  } as any;
}
function makeRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  return res;
}

describe("requireExtensionEnabled middleware", () => {
  beforeEach(() => {
    mockFindByKey.mockReset();
    mockFindByExtensionId.mockReset();
  });

  it("rejects with 401 when organizationId is missing", async () => {
    const mw = requireExtensionEnabled("slack");
    const req = makeReq() as Request;
    const res = makeRes() as Response;
    const next = jest.fn();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects with 404 when the extension key does not exist in the catalog", async () => {
    mockFindByKey.mockResolvedValueOnce(null as never);
    const mw = requireExtensionEnabled("nonexistent");
    const req = makeReq(1) as Request;
    const res = makeRes() as Response;
    const next = jest.fn();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects with 403 when the extension is not enabled for the caller's org", async () => {
    mockFindByKey.mockResolvedValueOnce({ id: 42 } as never);
    mockFindByExtensionId.mockResolvedValueOnce(null as never);
    const mw = requireExtensionEnabled("slack");
    const req = makeReq(7) as Request;
    const res = makeRes() as Response;
    const next = jest.fn();

    await mw(req, res, next);

    expect(mockFindByExtensionId).toHaveBeenCalledWith(42, 7);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects with 403 when the enablement row exists but enabled=false", async () => {
    mockFindByKey.mockResolvedValueOnce({ id: 42 } as never);
    mockFindByExtensionId.mockResolvedValueOnce({ enabled: false } as never);
    const mw = requireExtensionEnabled("slack");
    const req = makeReq(7) as Request;
    const res = makeRes() as Response;
    const next = jest.fn();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes through to next() when the extension is enabled for the org", async () => {
    mockFindByKey.mockResolvedValueOnce({ id: 42 } as never);
    mockFindByExtensionId.mockResolvedValueOnce({ enabled: true } as never);
    const mw = requireExtensionEnabled("slack");
    const req = makeReq(7) as Request;
    const res = makeRes() as Response;
    const next = jest.fn();

    await mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("caches the extension id lookup across calls (single DB roundtrip per key)", async () => {
    mockFindByKey.mockResolvedValueOnce({ id: 42 } as never);
    mockFindByExtensionId.mockResolvedValue({ enabled: true } as never);
    const mw = requireExtensionEnabled("mlflow-cache-test");
    const req = makeReq(7) as Request;
    const next = jest.fn();

    await mw(req, makeRes() as Response, next);
    await mw(req, makeRes() as Response, next);
    await mw(req, makeRes() as Response, next);

    // ExtensionModel.findByKey should only fire on the first call thanks
    // to the in-process cache in the middleware.
    expect(mockFindByKey).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(3);
  });

  it("returns 500 with the underlying message when the DB layer throws", async () => {
    mockFindByKey.mockRejectedValueOnce(new Error("db down") as never);
    const mw = requireExtensionEnabled("slack-crash");
    const req = makeReq(7) as Request;
    const res = makeRes() as Response;
    const next = jest.fn();

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
