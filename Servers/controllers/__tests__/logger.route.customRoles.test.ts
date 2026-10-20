import request from "supertest";
import express from "express";

// Only the two SQL reads are stubbed. roleMap (name → role, with org-scoped
// roles shadowing built-ins) and roleHasPermission (built-in matrix vs the
// role_permissions table) run for real, so this covers how a custom role's
// grant decides access to GET /api/logger/logs.
const ROLES = [
  { id: 1, name: "Admin", organization_id: null },
  { id: 3, name: "Editor", organization_id: null },
  { id: 10, name: "Log reader", organization_id: 42 },
  { id: 11, name: "Log denied", organization_id: 42 },
  { id: 12, name: "No grants", organization_id: 42 },
  // A custom role reusing the built-in name. role.ctrl refuses to create
  // one, but if a row existed it would shadow the built-in in its org.
  { id: 20, name: "Admin", organization_id: 43 },
  { id: 30, name: "Admin", organization_id: 44 },
];
const ROLE_PERMISSIONS: Record<number, Array<{ permission_key: string; allowed: boolean }>> = {
  10: [{ permission_key: "logs.admin", allowed: true }],
  11: [{ permission_key: "logs.admin", allowed: false }],
  12: [],
  20: [{ permission_key: "organization.admin", allowed: true }],
  30: [{ permission_key: "logs.admin", allowed: true }],
};

jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(async (sql: string, options?: { replacements?: { roleId?: number } }) => {
      if (sql.includes("FROM roles")) return ROLES;
      if (sql.includes("FROM role_permissions")) {
        return ROLE_PERMISSIONS[options?.replacements?.roleId ?? -1] ?? [];
      }
      throw new Error(`unexpected query: ${sql}`);
    }),
  },
}));

jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    req.userId = 9;
    req.organizationId = Number(req.headers["x-test-org"]);
    req.role = req.headers["x-test-role"];
    req.t = (key: string) => key;
    next();
  },
}));

jest.mock("../logger.ctrl", () => ({
  getEvents: (_req: any, res: any) => res.status(200).json({ ok: true }),
  getLogs: (_req: any, res: any) => res.status(200).json({ ok: true }),
}));

import loggerRoutes from "../../routes/logger.route";

const app = express();
app.use("/api/logger", loggerRoutes);

const getLogs = (org: number, role: string) =>
  request(app).get("/api/logger/logs").set("x-test-org", String(org)).set("x-test-role", role);

describe("GET /api/logger/logs with organization roles", () => {
  it.each([
    [42, "Admin", 200, "built-in Admin"],
    [42, "Editor", 403, "built-in Editor"],
    [42, "Log reader", 200, "custom role granted logs.admin"],
    [42, "Log denied", 403, "custom role with logs.admin denied"],
    [42, "No grants", 403, "custom role with no logs.admin row"],
    [43, "Admin", 403, "custom role named Admin without logs.admin"],
    [44, "Admin", 200, "custom role named Admin granted logs.admin"],
  ])("org %s role %s → %s (%s)", async (org, role, status) => {
    const res = await getLogs(org, role);
    expect(res.status).toBe(status);
  });

  it("does not let a custom role from another organization resolve", async () => {
    // "Log reader" exists only in org 42; in org 50 the name is unknown.
    const res = await getLogs(50, "Log reader");
    expect(res.status).toBe(403);
  });
});
