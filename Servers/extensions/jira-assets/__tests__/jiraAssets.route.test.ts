import request from "supertest";
import express from "express";
import { BUILTIN_ROLE_PERMISSIONS } from "../../../config/rolePermissions.config";

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
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
    req.role = req.headers["x-test-role"] || "Admin";
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../../middleware/requireExtensionEnabled.middleware", () => ({
  requireExtensionEnabled: () => (_req: any, _res: any, next: any) => next(),
}));
// Every handler answers 200 with its own name, so a test sees which one ran.
jest.mock("../jiraAssets.ctrl", () => {
  const names = [
    "deleteUseCaseCtrl",
    "getAttributes",
    "getConfig",
    "getCustomFrameworksProgressCtrl",
    "getObjects",
    "getObjectTypes",
    "getSchemas",
    "getSyncHistoryCtrl",
    "getSyncStatusCtrl",
    "getUseCaseCtrl",
    "getVwAttributes",
    "listUseCasesCtrl",
    "patchSelection",
    "patchSyncSettings",
    "postConfig",
    "postImport",
    "postSync",
    "removeMissingCtrl",
  ];
  return Object.fromEntries(
    names.map((name) => [
      name,
      jest.fn((_req: any, res: any) => res.status(200).json({ handler: name })),
    ]),
  );
});

import * as ctrl from "../jiraAssets.ctrl";
import jiraAssetsRoutes from "../jiraAssets.route";

const app = express();
app.use(express.json());
app.use("/api/extensions/jira-assets", jiraAssetsRoutes);

const base = "/api/extensions/jira-assets";
const ROLES = ["Admin", "Editor", "Reviewer", "Auditor"] as const;

beforeEach(() => jest.clearAllMocks());

describe("discovery routes used only by the admin configuration panel", () => {
  const adminOnly = [
    ["GET /schemas", `${base}/schemas`, "getSchemas"],
    ["GET /schemas/:schemaId/object-types", `${base}/schemas/7/object-types`, "getObjectTypes"],
    [
      "GET /object-types/:objectTypeId/objects",
      `${base}/object-types/12/objects?startAt=0`,
      "getObjects",
    ],
  ] as const;

  describe.each(adminOnly)("%s", (_label, path, handler) => {
    it("lets an Admin through", async () => {
      const res = await request(app).get(path).set("x-test-role", "Admin");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ handler });
    });

    it.each(["Editor", "Reviewer", "Auditor"])("answers 403 to an %s", async (role) => {
      const res = await request(app).get(path).set("x-test-role", role);

      expect(res.status).toBe(403);
      expect((ctrl as any)[handler]).not.toHaveBeenCalled();
    });
  });

  it("keeps GET /object-types/:objectTypeId/attributes open to every role", async () => {
    // The use case Settings tab (JiraUseCaseSettings) reads the attribute
    // schema for any member who can open the use case.
    for (const role of ROLES) {
      const res = await request(app)
        .get(`${base}/object-types/12/attributes`)
        .set("x-test-role", role);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ handler: "getAttributes" });
    }
  });
});

describe("Jira ids in the path", () => {
  // Express decodes %2F and %23 into the parameter, so these arrive as
  // "../../../api/2/project#" and the like.
  const badIds = [
    ["an encoded traversal", "..%2F..%2F..%2Fapi%2F2%2Fproject%23"],
    ["a dot segment with an encoded slash", "..%2F"],
    ["letters", "abc"],
    ["a negative number", "-1"],
    ["more than 18 digits", "1".repeat(19)],
    ["an encoded space", "1%20OR%201"],
  ] as const;

  describe.each([
    ["GET /schemas/:schemaId/object-types", (id: string) => `${base}/schemas/${id}/object-types`],
    [
      "GET /object-types/:objectTypeId/objects",
      (id: string) => `${base}/object-types/${id}/objects`,
    ],
    [
      "GET /object-types/:objectTypeId/attributes",
      (id: string) => `${base}/object-types/${id}/attributes`,
    ],
  ] as const)("%s", (_label, path) => {
    it.each(badIds)("answers 400 for %s and calls no handler", async (_l, id) => {
      const res = await request(app).get(path(id)).set("x-test-role", "Admin");

      expect(res.status).toBe(400);
      expect(ctrl.getObjectTypes).not.toHaveBeenCalled();
      expect(ctrl.getObjects).not.toHaveBeenCalled();
      expect(ctrl.getAttributes).not.toHaveBeenCalled();
    });

    it("accepts an 18-digit id", async () => {
      const res = await request(app).get(path("123456789012345678")).set("x-test-role", "Admin");

      expect(res.status).toBe(200);
    });
  });

  it("validates the attributes id for a non-admin too", async () => {
    const res = await request(app)
      .get(`${base}/object-types/..%2F..%2Fobject%2F1/attributes`)
      .set("x-test-role", "Auditor");

    expect(res.status).toBe(400);
    expect(ctrl.getAttributes).not.toHaveBeenCalled();
  });

  it("answers 403, not 400, to a non-admin on an admin-only route", async () => {
    const res = await request(app)
      .get(`${base}/schemas/..%2F..%2Fapi/object-types`)
      .set("x-test-role", "Auditor");

    expect(res.status).toBe(403);
  });
});
