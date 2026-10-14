import { describe, it, expect, jest } from "@jest/globals";

jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: jest.fn((_req: any, _res: any, next: any) => next()),
}));
jest.mock("../../middleware/accessControl.middleware", () => ({
  __esModule: true,
  default: jest.fn((permission: string) => {
    const mw: any = (_req: any, _res: any, next: any) => next();
    mw.permissionKey = permission;
    return mw;
  }),
}));
jest.mock("../../controllers/dataRetention.ctrl", () => ({
  getDataRetention: jest.fn(),
  previewAuditRetention: jest.fn(),
  updateAuditRetention: jest.fn(),
}));

import authenticateJWT from "../../middleware/auth.middleware";
import router from "../dataRetention.route";
import {
  getDataRetention,
  previewAuditRetention,
  updateAuditRetention,
} from "../../controllers/dataRetention.ctrl";

describe("dataRetention routes", () => {
  it.each([
    ["get", "/", getDataRetention],
    ["get", "/audit-records/preview", previewAuditRetention],
    ["put", "/audit-records", updateAuditRetention],
  ])("guards %s %s with authentication and organization.admin", (method, path, handler) => {
    const layer = (router as any).stack.find(
      (l: any) => l.route?.path === path && l.route.methods[method],
    );
    expect(layer).toBeDefined();
    const handlers = layer.route.stack.map((s: any) => s.handle);
    expect(handlers[0]).toBe(authenticateJWT);
    expect(handlers[1].permissionKey).toBe("organization.admin");
    expect(handlers[handlers.length - 1]).toBe(handler);
  });
});
