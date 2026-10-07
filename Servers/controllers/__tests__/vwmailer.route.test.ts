import request from "supertest";
import express from "express";
import { BUILTIN_ROLE_PERMISSIONS } from "../../config/rolePermissions.config";

// Back the route guard with the real built-in matrix (no DB), as in
// aiConfirmation.route.test.ts.
jest.mock("../../utils/rolePermissions.utils", () => ({
  roleHasPermission: async (_orgId: number | null, role: string, key: string) =>
    BUILTIN_ROLE_PERMISSIONS[role]?.has(key as never) ?? false,
}));

jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    req.userId = 9;
    req.organizationId = 42;
    req.role = req.headers["x-test-role"] || "Editor";
    req.t = (key: string) => key;
    next();
  },
}));

jest.mock("../../middleware/rateLimit.middleware", () => ({
  inviteEmailLimiter: (_req: any, _res: any, next: any) => next(),
  passwordResetEmailLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../vwmailer.ctrl", () => ({
  invite: (_req: any, res: any) => res.status(200).json({ ok: true }),
}));

import mailRoutes from "../../routes/vwmailer.route";

const app = express();
app.use(express.json());
app.use("/api/mail", mailRoutes);

const body = { to: "new@example.com", name: "New", roleId: 1, organizationId: 42 };

describe("POST /api/mail/invite guard", () => {
  it.each(["Editor", "Reviewer", "Auditor"])("refuses a %s", async (role) => {
    const res = await request(app).post("/api/mail/invite").set("x-test-role", role).send(body);
    expect(res.status).toBe(403);
  });

  it("allows an Admin", async () => {
    const res = await request(app).post("/api/mail/invite").set("x-test-role", "Admin").send(body);
    expect(res.status).toBe(200);
  });
});
