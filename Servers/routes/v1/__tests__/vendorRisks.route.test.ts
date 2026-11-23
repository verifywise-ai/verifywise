import request from "supertest";
import express from "express";

// x-role / x-org stand in for the token's claims; no Authorization header is a
// 401, as with the real middleware.
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
jest.mock("../../../utils/roleMap", () => ({
  getRoleByName: jest.fn(async (_orgId: number | null, name: string) =>
    ["Admin", "Editor", "Reviewer", "Auditor"].includes(name)
      ? { id: 1, name, organizationId: null }
      : undefined,
  ),
}));
jest.mock("../../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(async () => ({ commit: jest.fn(), rollback: jest.fn() })),
  },
}));
jest.mock("../../../utils/vendorRisk.utils", () => ({
  ...jest.requireActual("../../../utils/vendorRisk.utils"),
  getVendorRiskByIdQuery: jest.fn(),
  restoreVendorRiskByIdQuery: jest.fn(),
}));
jest.mock("../../../services/automations/automationProducer", () => ({
  enqueueVendorRiskLinkRecompute: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
}));

import routes from "../vendorRisks.route";
import {
  getVendorRiskByIdQuery,
  restoreVendorRiskByIdQuery,
} from "../../../utils/vendorRisk.utils";

const getQuery = getVendorRiskByIdQuery as jest.Mock;
const restoreQuery = restoreVendorRiskByIdQuery as jest.Mock;

const app = express();
app.use(express.json());
app.use("/api/v1/vendor-risks", routes);

describe("/api/v1/vendor-risks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getQuery.mockResolvedValue({ id: 7, is_deleted: true });
    restoreQuery.mockResolvedValue({ id: 7 });
  });

  describe("GET /:id", () => {
    it("answers 401 without a token", async () => {
      expect((await request(app).get("/api/v1/vendor-risks/7")).status).toBe(401);
      expect(getQuery).not.toHaveBeenCalled();
    });

    it("reads deleted risks too, within the caller's organization", async () => {
      const res = await request(app)
        .get("/api/v1/vendor-risks/7")
        .set("Authorization", "Bearer t")
        .set("x-role", "Auditor")
        .set("x-org", "5");
      expect(res.status).toBe(200);
      expect(res.body.data.is_deleted).toBe(true);
      expect(getQuery).toHaveBeenCalledWith(7, 5, true);
    });

    it("answers 404 for another organization's risk", async () => {
      getQuery.mockResolvedValue(null);
      const res = await request(app)
        .get("/api/v1/vendor-risks/7")
        .set("Authorization", "Bearer t")
        .set("x-org", "6");
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /:id/restore", () => {
    it("answers 401 without a token", async () => {
      expect((await request(app).patch("/api/v1/vendor-risks/7/restore")).status).toBe(401);
      expect(restoreQuery).not.toHaveBeenCalled();
    });

    it.each(["Reviewer", "Auditor"])("refuses a %s, who lacks vendor.edit", async (role) => {
      const res = await request(app)
        .patch("/api/v1/vendor-risks/7/restore")
        .set("Authorization", "Bearer t")
        .set("x-role", role);
      expect(res.status).toBe(403);
      expect(restoreQuery).not.toHaveBeenCalled();
    });

    it("restores within the caller's organization, as the caller", async () => {
      getQuery.mockResolvedValue({ id: 7, is_deleted: false });
      const res = await request(app)
        .patch("/api/v1/vendor-risks/7/restore")
        .set("Authorization", "Bearer t")
        .set("x-role", "Editor")
        .set("x-org", "5");
      expect(res.status).toBe(200);
      expect(restoreQuery).toHaveBeenCalledWith(7, 5, expect.anything(), 9);
      expect(res.body.data.is_deleted).toBe(false);
    });

    it("answers 404 when another organization holds the risk", async () => {
      restoreQuery.mockResolvedValue(null);
      const res = await request(app)
        .patch("/api/v1/vendor-risks/7/restore")
        .set("Authorization", "Bearer t")
        .set("x-org", "6");
      expect(res.status).toBe(404);
    });
  });
});
