import request from "supertest";
import express from "express";
import { BUILTIN_ROLE_PERMISSIONS } from "../../../config/rolePermissions.config";

jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.userId = 9;
    req.organizationId = Number(req.headers["x-org"] ?? 42);
    req.role = req.headers["x-role"] ?? "Admin";
    next();
  },
}));
jest.mock("../../../middleware/requireExtensionEnabled.middleware", () => ({
  requireExtensionEnabled: jest.fn(
    (key: string) => (req: any, res: any, next: any) =>
      key === "risk-import" && req.headers["x-extension-off"]
        ? res.status(403).json({ message: "Extension disabled" })
        : next(),
  ),
}));
jest.mock("../../../utils/rolePermissions.utils", () => {
  const roleHasPermission = async (_org: number | null, role: string, key: string) =>
    BUILTIN_ROLE_PERMISSIONS[role]?.has(key as never) ?? false;
  return {
    roleHasPermission,
    requestHasPermission: async (req: any, key: string) =>
      roleHasPermission(req.organizationId ?? null, req.role, key),
  };
});
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../../extensions/risk-import/riskImport.service", () => ({
  ...jest.requireActual("../../../extensions/risk-import/riskImport.service"),
  buildExcelTemplate: jest.fn(),
  importRisks: jest.fn(),
}));

import { i18nMiddleware } from "../../../middleware/i18n.middleware";
import v1Routes from "../risk-import.route";
import legacyRoutes from "../../../extensions/risk-import/riskImport.route";
import { importRisks } from "../../../extensions/risk-import/riskImport.service";

const app = express();
app.use(express.json());
app.use(i18nMiddleware);
app.use("/api/v1/risk-import", v1Routes);
app.use("/api/extensions/risk-import", legacyRoutes);

const V1 = "/api/v1/risk-import/import";
const LEGACY = "/api/extensions/risk-import/import";
const result = { success: true, imported: 1, failed: 0, errors: [], importedAt: "now" };

describe("POST /api/v1/risk-import/import", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (importRisks as jest.Mock).mockResolvedValue(result);
  });

  it("answers 401 without a token", async () => {
    expect(
      (
        await request(app)
          .post(V1)
          .send({ csvData: [{}] })
      ).status,
    ).toBe(401);
    expect(importRisks).not.toHaveBeenCalled();
  });

  it("answers 403 when the extension is off for the organization", async () => {
    const res = await request(app)
      .post(V1)
      .set("Authorization", "Bearer t")
      .set("x-extension-off", "1")
      .send({ csvData: [{}] });
    expect(res.status).toBe(403);
    expect(importRisks).not.toHaveBeenCalled();
  });

  it.each(["Reviewer", "Auditor"])("answers 403 for a %s", async (role) => {
    const res = await request(app)
      .post(V1)
      .set("Authorization", "Bearer t")
      .set("x-role", role)
      .send({ csvData: [{}] });
    expect(res.status).toBe(403);
    expect(importRisks).not.toHaveBeenCalled();
  });

  it("imports strictly into the organization of the token, never one in the body", async () => {
    const res = await request(app)
      .post(V1)
      .set("Authorization", "Bearer t")
      .set("x-role", "Editor")
      .set("x-org", "7")
      .send({ csvData: [{ risk_name: "A" }], organization_id: 99 });
    expect(res.status).toBe(200);
    expect(importRisks).toHaveBeenCalledWith([{ risk_name: "A" }], 7, 9, { strict: true });
  });

  it("answers 400 with the row errors of a rejected import", async () => {
    const rejected = { ...result, success: false, errors: [{ row: 2, field: "x", message: "m" }] };
    (importRisks as jest.Mock).mockResolvedValue(rejected);
    const res = await request(app)
      .post(V1)
      .set("Authorization", "Bearer t")
      .send({ csvData: [{}] });
    expect(res.status).toBe(400);
    expect(res.body.data.errors).toHaveLength(1);
  });

  it("leaves the legacy path on its old accept rules (strict: false)", async () => {
    const res = await request(app)
      .post(LEGACY)
      .set("Authorization", "Bearer t")
      .send({ csvData: [{ risk_name: "A" }] });
    expect(res.status).toBe(200);
    expect(importRisks).toHaveBeenCalledWith([{ risk_name: "A" }], 42, 9, { strict: false });
  });

  describe("row error messages", () => {
    const keyed = {
      ...result,
      success: false,
      errors: [
        {
          row: 3,
          field: "likelihood",
          message: "Likelihood is required",
          messageKey: "Likelihood is required",
        },
        {
          row: 4,
          field: "risk_name",
          message: 'A risk named "A" already exists',
          messageKey: 'A risk named "{name}" already exists',
          params: { name: "A" },
        },
        {
          row: 5,
          field: "general",
          message: "This row could not be saved.",
          messageKey: "This row could not be saved.",
        },
      ],
    };

    it("translates the message and adds key and params on the v1 route", async () => {
      (importRisks as jest.Mock).mockResolvedValue(keyed);
      const res = await request(app)
        .post(V1)
        .set("Authorization", "Bearer t")
        .set("Accept-Language", "de")
        .send({ csvData: [{}] });
      expect(res.status).toBe(400);
      const [first, second] = res.body.data.errors;
      expect(first.message).not.toBe("Likelihood is required");
      expect(first).toMatchObject({ row: 3, field: "likelihood", key: "Likelihood is required" });
      expect(second.params).toEqual({ name: "A" });
      expect(second.message).toBe("Ein Risiko mit dem Namen „A“ existiert bereits");
      expect(first).not.toHaveProperty("messageKey");
    });

    it("keeps the legacy contract: English validation messages, no key or params", async () => {
      (importRisks as jest.Mock).mockResolvedValue(keyed);
      const res = await request(app)
        .post(LEGACY)
        .set("Authorization", "Bearer t")
        .set("Accept-Language", "de")
        .send({ csvData: [{}] });
      expect(res.status).toBe(400);
      for (const error of res.body.data.errors) {
        expect(Object.keys(error).sort()).toEqual(["field", "message", "row"]);
      }
      expect(res.body.data.errors[0].message).toBe("Likelihood is required");
      expect(res.body.data.errors[1].message).toBe('A risk named "A" already exists');
      // Messages the import itself words (row cap, refused inserts) are translated there too.
      expect(res.body.data.errors[2].message).toBe("Diese Zeile konnte nicht gespeichert werden.");
    });
  });
});
