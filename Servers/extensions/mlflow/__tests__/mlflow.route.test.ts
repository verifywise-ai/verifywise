import request from "supertest";
import express from "express";
import { BUILTIN_ROLE_PERMISSIONS } from "../../../config/rolePermissions.config";

// The real authorize middleware runs. Permission lookups answer from the
// built-in role matrix (no database), the login and the extension gate are
// stubbed, and the role comes from a header so each case picks its own.
jest.mock("../../../utils/rolePermissions.utils", () => {
  const roleHasPermission = async (_orgId: number | null, role: string, key: string) =>
    BUILTIN_ROLE_PERMISSIONS[role]?.has(key as never) ?? false;
  return {
    roleHasPermission,
    requestHasPermission: async (req: any, key: string) =>
      roleHasPermission(req.organizationId ?? null, req.role, key),
  };
});
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    req.userId = 9;
    req.organizationId = 42;
    req.role = req.headers["x-test-role"];
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../../middleware/requireExtensionEnabled.middleware", () => ({
  requireExtensionEnabled: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock("../mlflow.ctrl", () => {
  const ok = (_req: any, res: any) => res.status(200).json({ ok: true });
  return {
    listModels: jest.fn(ok),
    getModelById: jest.fn(ok),
    syncFromMlflow: jest.fn(ok),
  };
});

import * as ctrl from "../mlflow.ctrl";
import mlflowRoutes from "../mlflow.route";

const app = express();
app.use(express.json());
app.use("/api/extensions/mlflow", mlflowRoutes);

describe("MLflow extension routes", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(["Auditor", "Reviewer"])("refuses a sync from an %s with 403", async (role) => {
    const res = await request(app).post("/api/extensions/mlflow/sync").set("x-test-role", role);

    expect(res.status).toBe(403);
    expect(ctrl.syncFromMlflow).not.toHaveBeenCalled();
  });

  it.each(["Editor", "Admin"])("lets an %s start a sync", async (role) => {
    const res = await request(app).post("/api/extensions/mlflow/sync").set("x-test-role", role);

    expect(res.status).toBe(200);
    expect(ctrl.syncFromMlflow).toHaveBeenCalledTimes(1);
  });

  it.each(["Auditor", "Reviewer", "Editor", "Admin"])(
    "keeps the model list and detail open to an %s",
    async (role) => {
      const list = await request(app).get("/api/extensions/mlflow/models").set("x-test-role", role);
      const detail = await request(app)
        .get("/api/extensions/mlflow/models/1")
        .set("x-test-role", role);

      expect(list.status).toBe(200);
      expect(detail.status).toBe(200);
    },
  );
});
