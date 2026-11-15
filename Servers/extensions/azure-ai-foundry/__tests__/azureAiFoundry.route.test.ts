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
jest.mock("../azureAiFoundry.ctrl", () => {
  const ok = (_req: any, res: any) => res.status(200).json({ ok: true });
  return {
    listDeployments: jest.fn(ok),
    getDeploymentById: jest.fn(ok),
    syncFromAzure: jest.fn(ok),
    discoverAiAgents: jest.fn(ok),
  };
});

import * as ctrl from "../azureAiFoundry.ctrl";
import azureRoutes from "../azureAiFoundry.route";

const app = express();
app.use(express.json());
app.use("/api/extensions/azure-ai-foundry", azureRoutes);

const base = "/api/extensions/azure-ai-foundry";

describe("Azure AI Foundry extension routes", () => {
  beforeEach(() => jest.clearAllMocks());

  const gated = [
    ["sync", "post", `${base}/sync`, "syncFromAzure"],
    ["discovery", "get", `${base}/discover`, "discoverAiAgents"],
  ] as const;

  describe.each(gated)("%s", (_label, method, path, handler) => {
    it.each(["Auditor", "Reviewer"])("refuses an %s with 403", async (role) => {
      const res = await request(app)[method](path).set("x-test-role", role);

      expect(res.status).toBe(403);
      expect(ctrl[handler]).not.toHaveBeenCalled();
    });

    it.each(["Editor", "Admin"])("lets an %s through", async (role) => {
      const res = await request(app)[method](path).set("x-test-role", role);

      expect(res.status).toBe(200);
      expect(ctrl[handler]).toHaveBeenCalledTimes(1);
    });
  });

  it.each(["Auditor", "Reviewer", "Editor", "Admin"])(
    "keeps the deployment list and detail open to an %s",
    async (role) => {
      const list = await request(app).get(`${base}/models`).set("x-test-role", role);
      const detail = await request(app).get(`${base}/models/1`).set("x-test-role", role);

      expect(list.status).toBe(200);
      expect(detail.status).toBe(200);
    },
  );
});
