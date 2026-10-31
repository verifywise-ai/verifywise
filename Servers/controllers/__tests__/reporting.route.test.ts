import request from "supertest";
import express from "express";
import reportingRoutes from "../../routes/reporting.route";
import { BUILTIN_ROLE_PERMISSIONS } from "../../config/rolePermissions.config";

// Back the route guard with the real static built-in matrix (no DB).
jest.mock("../../utils/rolePermissions.utils", () => ({
  roleHasPermission: async (_orgId: number | null, role: string, key: string) =>
    BUILTIN_ROLE_PERMISSIONS[role]?.has(key as never) ?? false,
}));

// x-test-role sets req.role.
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

jest.mock("../reporting.ctrl", () => ({
  generateReports: (_req: any, res: any) => res.status(202).json({ ok: true }),
  generateReportsV2: (_req: any, res: any) => res.status(202).json({ ok: true }),
  getAllGeneratedReports: (_req: any, res: any) => res.status(200).json({ ok: true }),
  deleteGeneratedReportById: jest.fn((_req: any, res: any) => res.status(200).json({ ok: true })),
}));
jest.mock("../reportTemplate.ctrl", () => ({
  listSections: (_req: any, res: any) => res.status(200).json({ ok: true }),
}));

import { deleteGeneratedReportById } from "../reporting.ctrl";

const app = express();
app.use("/api/reporting", reportingRoutes);

describe("DELETE /reporting/:id guard", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(["Editor", "Reviewer", "Auditor"])("refuses an %s", async (role) => {
    const res = await request(app).delete("/api/reporting/12").set("x-test-role", role);
    expect(res.status).toBe(403);
    expect(res.body.data).toBe("Access denied");
    expect(deleteGeneratedReportById).not.toHaveBeenCalled();
  });

  it("allows an Admin", async () => {
    const res = await request(app).delete("/api/reporting/12").set("x-test-role", "Admin");
    expect(res.status).toBe(200);
    expect(deleteGeneratedReportById).toHaveBeenCalledTimes(1);
  });

  it.each(["abc", "0", "2147483648", "99999999999999999999"])(
    "answers 400 for id %s, which no INTEGER row can have",
    async (id) => {
      const res = await request(app).delete(`/api/reporting/${id}`).set("x-test-role", "Admin");
      expect(res.status).toBe(400);
      expect(deleteGeneratedReportById).not.toHaveBeenCalled();
    },
  );

  it("passes the largest INTEGER id through", async () => {
    const res = await request(app).delete("/api/reporting/2147483647").set("x-test-role", "Admin");
    expect(res.status).toBe(200);
    expect(deleteGeneratedReportById).toHaveBeenCalledTimes(1);
  });
});
