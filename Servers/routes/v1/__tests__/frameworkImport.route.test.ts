import request from "supertest";
import express from "express";
import { BUILTIN_ROLE_PERMISSIONS } from "../../../config/rolePermissions.config";

// The token decides who and which organization: x-role / x-org stand in for
// its claims; no Authorization header is a 401, as with the real middleware.
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.userId = 9;
    req.organizationId = Number(req.headers["x-org"] ?? 42);
    req.role = req.headers["x-role"] ?? "Admin";
    req.t = (key: string) => key;
    next();
  },
}));
// The real middleware answers 403 when the org has the extension off.
jest.mock("../../../middleware/requireExtensionEnabled.middleware", () => ({
  requireExtensionEnabled: jest.fn(
    (key: string) => (req: any, res: any, next: any) =>
      key === "framework-import" && req.headers["x-extension-off"]
        ? res.status(403).json({ message: "Extension disabled" })
        : next(),
  ),
}));
// Permissions resolve against the real built-in role matrix, so a route
// guarded by the wrong key fails the role tests.
jest.mock("../../../utils/rolePermissions.utils", () => {
  const roleHasPermission = async (_org: number | null, role: string, key: string) =>
    BUILTIN_ROLE_PERMISSIONS[role]?.has(key as never) ?? false;
  return {
    roleHasPermission,
    // authorize() resolves through the request (#5314); same answer here.
    requestHasPermission: async (req: any, key: string) =>
      roleHasPermission(req.organizationId ?? null, req.role, key),
  };
});
jest.mock("../../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
}));
jest.mock("../../../extensions/framework-import/frameworkImport.service", () => {
  const actual = jest.requireActual("../../../extensions/framework-import/frameworkImport.service");
  return {
    ...actual,
    buildExcelTemplate: jest.fn(async () => ({ buffer: Buffer.from("x"), filename: "t.xlsx" })),
    importFramework: jest.fn(),
    listImportedFrameworksQuery: jest.fn(async () => []),
    updateImportedFrameworkQuery: jest.fn(async () => undefined),
    deleteImportedFrameworkQuery: jest.fn(async () => undefined),
  };
});

import routes from "../frameworkImport.route";
import {
  deleteImportedFrameworkQuery,
  importFramework,
  listImportedFrameworksQuery,
  updateImportedFrameworkQuery,
} from "../../../extensions/framework-import/frameworkImport.service";
import { NotFoundException } from "../../../domain.layer/exceptions/custom.exception";

const app = express();
app.use(express.json());
app.use("/api/v1/framework-import", routes);

const ROUTE = "/api/v1/framework-import";
const row = { framework_name: "Policy", topic_number: "1", topic_name: "Gov" };

describe("/api/v1/framework-import", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers 401 without a token", async () => {
    expect((await request(app).get(`${ROUTE}/imported`)).status).toBe(401);
    expect(
      (
        await request(app)
          .post(`${ROUTE}/import`)
          .send({ csvData: [row] })
      ).status,
    ).toBe(401);
    expect((await request(app).delete(`${ROUTE}/imported/1`)).status).toBe(401);
    expect(importFramework).not.toHaveBeenCalled();
  });

  it("answers 403 when the organization has the extension off", async () => {
    const res = await request(app)
      .get(`${ROUTE}/imported`)
      .set("Authorization", "Bearer t")
      .set("x-extension-off", "1");
    expect(res.status).toBe(403);
    expect(listImportedFrameworksQuery).not.toHaveBeenCalled();
  });

  it.each(["Reviewer", "Auditor"])(
    "answers 403 when an %s imports, renames or deletes",
    async (role) => {
      const auth = (r: request.Test) => r.set("Authorization", "Bearer t").set("x-role", role);
      expect(
        (await auth(request(app).post(`${ROUTE}/import`)).send({ csvData: [row] })).status,
      ).toBe(403);
      expect(
        (await auth(request(app).patch(`${ROUTE}/imported/3`)).send({ name: "New" })).status,
      ).toBe(403);
      expect((await auth(request(app).delete(`${ROUTE}/imported/3`))).status).toBe(403);
      expect((await auth(request(app).get(`${ROUTE}/template`))).status).toBe(403);
      expect(importFramework).not.toHaveBeenCalled();
      expect(updateImportedFrameworkQuery).not.toHaveBeenCalled();
      expect(deleteImportedFrameworkQuery).not.toHaveBeenCalled();
    },
  );

  it("lets every member list, scoped to the organization of the token", async () => {
    const res = await request(app)
      .get(`${ROUTE}/imported`)
      .set("Authorization", "Bearer t")
      .set("x-role", "Auditor")
      .set("x-org", "7");
    expect(res.status).toBe(200);
    expect(listImportedFrameworksQuery).toHaveBeenCalledWith(7);
  });

  it("imports into the organization of the token, never one named in the body", async () => {
    (importFramework as jest.Mock).mockResolvedValue({
      success: true,
      imported_framework_id: 5,
      imported_topics: 1,
      imported_subtopics: 0,
      failed: 0,
      errors: [],
      importedAt: "now",
    });
    const res = await request(app)
      .post(`${ROUTE}/import`)
      .set("Authorization", "Bearer t")
      .set("x-role", "Editor")
      .set("x-org", "7")
      .send({ csvData: [row], organization_id: 99 });
    expect(res.status).toBe(200);
    expect(importFramework).toHaveBeenCalledWith([row], 7, 9);
    expect(res.body.data.imported_framework_id).toBe(5);
  });

  it("answers 400 with the per-row errors in data when validation fails", async () => {
    const errors = [{ row: 2, field: "topic_name", message: "Topic name is required" }];
    (importFramework as jest.Mock).mockResolvedValue({
      success: false,
      imported_topics: 0,
      imported_subtopics: 0,
      failed: 1,
      errors,
      importedAt: "now",
    });
    const res = await request(app)
      .post(`${ROUTE}/import`)
      .set("Authorization", "Bearer t")
      .send({ csvData: [row] });
    expect(res.status).toBe(400);
    expect(res.body.data.errors).toEqual(errors);
  });

  it("treats another organization's framework id as not found", async () => {
    (deleteImportedFrameworkQuery as jest.Mock).mockRejectedValue(
      new NotFoundException("Imported framework not found", "Framework", 3),
    );
    const res = await request(app)
      .delete(`${ROUTE}/imported/3`)
      .set("Authorization", "Bearer t")
      .set("x-org", "8");
    expect(res.status).toBe(404);
    expect(deleteImportedFrameworkQuery).toHaveBeenCalledWith(3, 8);
  });

  it.each(["abc", "0", "-1", "1.5", "99999999999999999999"])(
    "answers 400 for the id %s instead of reaching the database",
    async (id) => {
      const auth = (r: request.Test) => r.set("Authorization", "Bearer t");
      expect((await auth(request(app).delete(`${ROUTE}/imported/${id}`))).status).toBe(400);
      expect((await auth(request(app).patch(`${ROUTE}/imported/${id}`)).send({})).status).toBe(400);
      expect(deleteImportedFrameworkQuery).not.toHaveBeenCalled();
      expect(updateImportedFrameworkQuery).not.toHaveBeenCalled();
    },
  );

  it("answers 400, not 500, when a rename sends a non-text name", async () => {
    (updateImportedFrameworkQuery as jest.Mock).mockImplementation(async (_id, _org, patch) => {
      // Real validation, so the controller's status mapping is what is under test.
      jest
        .requireActual("../../../extensions/framework-import/frameworkImport.service")
        .normalizePatch(patch);
    });
    const res = await request(app)
      .patch(`${ROUTE}/imported/3`)
      .set("Authorization", "Bearer t")
      .send({ name: 42 });
    expect(res.status).toBe(400);
  });
});
