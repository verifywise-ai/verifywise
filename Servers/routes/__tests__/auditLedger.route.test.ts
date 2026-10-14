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
jest.mock("../../controllers/auditLedger.ctrl", () => ({
  getAuditLedger: jest.fn(),
  verifyAuditLedger: jest.fn(),
  exportAuditLedger: jest.fn(),
}));

import router from "../auditLedger.route";
import { exportAuditLedger } from "../../controllers/auditLedger.ctrl";

describe("auditLedger routes", () => {
  it("guards GET /export with auditLedger.admin and ends at exportAuditLedger", () => {
    const layer = (router as any).stack.find(
      (l: any) => l.route?.path === "/export" && l.route.methods.get,
    );
    expect(layer).toBeDefined();
    const handlers = layer.route.stack.map((s: any) => s.handle);
    expect(handlers[0].permissionKey).toBe("auditLedger.admin");
    expect(handlers[handlers.length - 1]).toBe(exportAuditLedger);
  });
});
