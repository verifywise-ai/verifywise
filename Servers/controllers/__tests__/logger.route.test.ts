import request from "supertest";
import express from "express";
import loggerRoutes from "../../routes/logger.route";
import { BUILTIN_ROLE_PERMISSIONS } from "../../config/rolePermissions.config";

// Back the route guard with the real static built-in matrix (no DB) so these
// tests assert the actual RBAC semantics for built-in roles.
jest.mock("../../utils/rolePermissions.utils", () => ({
  roleHasPermission: async (_orgId: number | null, role: string, key: string) =>
    BUILTIN_ROLE_PERMISSIONS[role]?.has(key as never) ?? false,
}));

// x-test-role sets req.role. x-test-super marks an elected SuperAdmin (an org
// member with the SuperAdmin overlay). x-test-pure-super models a pure
// SuperAdmin: role "SuperAdmin", no organization.
jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    req.userId = 9;
    if (req.headers["x-test-pure-super"]) {
      req.role = "SuperAdmin";
      req.isSuperAdmin = true;
    } else {
      req.organizationId = 42;
      req.role = req.headers["x-test-role"] || "Editor";
      req.isSuperAdmin = Boolean(req.headers["x-test-super"]);
    }
    // i18nMiddleware runs before accessControl.middleware in the real stack.
    req.t = (key: string) => key;
    next();
  },
}));

jest.mock("../logger.ctrl", () => ({
  getEvents: (_req: any, res: any) => res.status(200).json({ ok: true }),
  getLogs: (_req: any, res: any) => res.status(200).json({ ok: true }),
}));

const app = express();
app.use("/api/logger", loggerRoutes);

describe("logger route guards", () => {
  it.each(["Editor", "Reviewer", "Auditor"])("refuses GET /logs for an %s", async (role) => {
    const res = await request(app).get("/api/logger/logs").set("x-test-role", role);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Forbidden");
    expect(res.body.data).toBe("Access denied");
  });

  it("allows an Admin on GET /logs", async () => {
    const res = await request(app).get("/api/logger/logs").set("x-test-role", "Admin");
    expect(res.status).toBe(200);
  });

  it("refuses GET /logs for a pure SuperAdmin (no organization role)", async () => {
    const res = await request(app).get("/api/logger/logs").set("x-test-pure-super", "1");
    expect(res.status).toBe(403);
  });

  it("refuses GET /logs for an elected SuperAdmin whose org role is Editor", async () => {
    const res = await request(app)
      .get("/api/logger/logs")
      .set("x-test-role", "Editor")
      .set("x-test-super", "1");
    expect(res.status).toBe(403);
  });

  it("allows an elected SuperAdmin whose org role is Admin on GET /logs", async () => {
    const res = await request(app)
      .get("/api/logger/logs")
      .set("x-test-role", "Admin")
      .set("x-test-super", "1");
    expect(res.status).toBe(200);
  });

  it.each(["Editor", "Reviewer", "Auditor", "Admin"])(
    "leaves GET /events open to an %s",
    async (role) => {
      const res = await request(app).get("/api/logger/events").set("x-test-role", role);
      expect(res.status).toBe(200);
    },
  );
});
