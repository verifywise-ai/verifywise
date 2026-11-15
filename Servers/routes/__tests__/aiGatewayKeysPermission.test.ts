/**
 * The AI Gateway proxy tells the gateway when a caller holds "llmKeys.admin"
 * (x-can-manage-llm-keys), so custom roles can manage provider keys. The
 * header is resolved only for key writes and a client-supplied value never
 * passes through.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";

const proxyOptions: any[] = [];
jest.mock("http-proxy-middleware", () => ({
  createProxyMiddleware: (options: any) => {
    proxyOptions.push(options);
    return (_req: unknown, _res: unknown, next: () => void) => next();
  },
  fixRequestBody: jest.fn(),
}));
jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock("../../controllers/aiGatewaySettings.ctrl", () => ({
  updateGuardrailSettings: jest.fn(),
}));
jest.mock("../../utils/rolePermissions.utils", () => ({
  requestHasPermission: jest.fn(),
}));

import aiGatewayRoutes, {
  LLM_KEYS_ADMIN_HEADER,
  resolveLlmKeysPermission,
} from "../aiGateway.route";
import { isUnderPathPrefix } from "../../utils/proxyPermissionFlag.utils";
import { requestHasPermission } from "../../utils/rolePermissions.utils";

const mockHasPermission = requestHasPermission as jest.MockedFunction<typeof requestHasPermission>;

type FlagReq = Partial<Request> & { canManageLlmKeys?: boolean };

const run = async (method: string, path: string, role = "Key managers"): Promise<FlagReq> => {
  const req: FlagReq = { method, path, role } as FlagReq;
  const next = jest.fn();
  await resolveLlmKeysPermission(req as Request, {} as Response, next as unknown as NextFunction);
  expect(next).toHaveBeenCalledTimes(1);
  return req;
};

beforeEach(() => {
  mockHasPermission.mockReset();
  proxyOptions.length = 0;
});

describe("isUnderPathPrefix", () => {
  it.each(["/keys", "/keys/12", "/KEYS/12/verify", "//keys", "/%6Beys/3"])("matches %s", (p) => {
    expect(isUnderPathPrefix(p, "/keys")).toBe(true);
  });
  it.each([
    "/keysets",
    "/endpoints",
    "/virtual-keys/1",
    "/",
    "/keys/../endpoints",
    "/keys/%2e%2e/virtual-keys",
    "/keys/./1",
  ])("does not match %s", (p) => {
    expect(isUnderPathPrefix(p, "/keys")).toBe(false);
  });
});

describe("resolveLlmKeysPermission", () => {
  it("does not look up permissions for reads", async () => {
    const req = await run("GET", "/keys");
    expect(req.canManageLlmKeys).toBe(false);
    expect(mockHasPermission).not.toHaveBeenCalled();
  });

  it("does not look up permissions for writes outside /keys", async () => {
    const req = await run("POST", "/endpoints");
    expect(req.canManageLlmKeys).toBe(false);
    expect(mockHasPermission).not.toHaveBeenCalled();
  });

  it("checks llmKeys.admin on key writes and sets the flag when granted", async () => {
    mockHasPermission.mockResolvedValueOnce(true);
    const req = await run("DELETE", "/keys/7");
    expect(mockHasPermission).toHaveBeenCalledWith(req, "llmKeys.admin");
    expect(req.canManageLlmKeys).toBe(true);
  });

  it("skips the lookup for the Admin role, which the gateway accepts by name", async () => {
    const req = await run("DELETE", "/keys/7", "Admin");
    expect(mockHasPermission).not.toHaveBeenCalled();
    expect(req.canManageLlmKeys).toBe(false);
  });

  it("leaves the flag off when the permission is missing", async () => {
    mockHasPermission.mockResolvedValueOnce(false);
    const req = await run("POST", "/keys");
    expect(req.canManageLlmKeys).toBe(false);
  });

  it("fails closed when the lookup throws", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockHasPermission.mockRejectedValueOnce(new Error("db down"));
    const req = await run("PATCH", "/keys/7");
    expect(req.canManageLlmKeys).toBe(false);
    spy.mockRestore();
  });
});

describe("proxy header", () => {
  const forward = (flag: boolean | undefined) => {
    aiGatewayRoutes();
    const proxyReq = { setHeader: jest.fn(), removeHeader: jest.fn() };
    const req = { organizationId: 1, userId: 2, role: "Key managers", canManageLlmKeys: flag };
    proxyOptions[proxyOptions.length - 1].on.proxyReq(proxyReq, req);
    return proxyReq;
  };

  it("always strips a client-supplied value", () => {
    expect(forward(false).removeHeader).toHaveBeenCalledWith(LLM_KEYS_ADMIN_HEADER);
  });

  it("sets the header only when the permission was granted", () => {
    expect(forward(true).setHeader).toHaveBeenCalledWith(LLM_KEYS_ADMIN_HEADER, "true");
    expect(forward(false).setHeader).not.toHaveBeenCalledWith(LLM_KEYS_ADMIN_HEADER, "true");
    expect(forward(undefined).setHeader).not.toHaveBeenCalledWith(LLM_KEYS_ADMIN_HEADER, "true");
  });
});
