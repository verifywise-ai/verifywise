import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

// Keep the test DB-free: key validation is the only controller dependency
// reached by the auth/body-validation paths exercised here.
jest.mock("../../../utils/shadowAiApiKey.utils", () => ({
  validateApiKeyWithCache: jest.fn(),
}));
// The registry also mounts JWT routes (change history). Their auth middleware
// needs token secrets at import time; shadow-ai ingestion does not use JWT.
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (_req: unknown, res: any) => res.status(401).json({ message: "Unauthorized" }),
}));
// The registry also mounts the vendor research routes. Their controller reaches the database and the
// job queue (Redis), and authorize() reads the role permissions from the database when it runs.
// This test only reads the registered layers and the shadow-ai paths, so it stays free of both.
jest.mock("../../../controllers/vendorResearch.ctrl", () => ({
  startVendorResearchRun: jest.fn(),
  getLatestVendorResearch: jest.fn(),
  getVendorResearchRunTrace: jest.fn(),
  getResearchConfig: jest.fn(),
  getDecisionStats: jest.fn(),
  getResearchSettings: jest.fn(),
  saveResearchSettings: jest.fn(),
  listVendorRiskFindings: jest.fn(),
  acceptVendorRiskFinding: jest.fn(),
  dismissVendorRiskFinding: jest.fn(),
}));
// The registry also mounts the create and the update of a vendor. They run the vendor controller,
// which reaches the database and the queues for the same reason, and this test reads layers only.
jest.mock("../../../controllers/vendor.ctrl", () => ({
  createVendorV1: jest.fn(),
  updateVendorByIdV1: jest.fn(),
}));
jest.mock("../../../middleware/accessControl.middleware", () => ({
  __esModule: true,
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import v1Routes from "../index";
import { validateApiKeyWithCache } from "../../../utils/shadowAiApiKey.utils";

const mockValidateKey = validateApiKeyWithCache as jest.MockedFunction<
  typeof validateApiKeyWithCache
>;

// Mirror the app.ts wiring that applies to /api/v1: JSON body parsing (the
// /^\/v1/ raw-body exclusion does not match /api/v1) and i18n's req.t.
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).t = (s: string) => s;
    next();
  });
  app.use("/api/v1", v1Routes);
  return app;
}

describe("v1 registry — /api/v1/shadow-ai/events", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects requests without an X-API-Key header (401)", async () => {
    const res = await request(buildApp()).post("/api/v1/shadow-ai/events").send({ events: [] });
    expect(res.status).toBe(401);
    expect(mockValidateKey).not.toHaveBeenCalled();
  });

  it("rejects an invalid or revoked API key (401)", async () => {
    mockValidateKey.mockResolvedValue(null);
    const res = await request(buildApp())
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", "bad-key")
      .send({ events: [] });
    expect(res.status).toBe(401);
  });

  it("rejects a body without an events array (400)", async () => {
    mockValidateKey.mockResolvedValue(1);
    const res = await request(buildApp())
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", "valid-key")
      .send({});
    expect(res.status).toBe(400);
  });

  it("accepts a valid key with an empty events batch (200, ingested 0)", async () => {
    mockValidateKey.mockResolvedValue(1);
    const res = await request(buildApp())
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", "valid-key")
      .send({ events: [] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ingested: 0 });
  });

  it("does not register other methods on /events", async () => {
    const res = await request(buildApp()).get("/api/v1/shadow-ai/events");
    expect(res.status).toBe(404);
  });

  it("leaves unknown /api/v1/* paths as 404, as before the registry mount", async () => {
    const res = await request(buildApp()).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("v1 registry — registration convention", () => {
  // The router.use layer that serves `path`. Express 5 layers expose matchers instead of a regexp.
  const layerFor = (path: string) =>
    (v1Routes as any).stack.find(
      (l: any) => !l.route && Array.isArray(l.matchers) && l.matchers.some((m: any) => m(path)),
    );

  it("mounts the shadow-ai ingestion router via router.use", () => {
    expect(layerFor("/shadow-ai/events")).toBeDefined();
  });

  // Added after ADR 0001, so they are versioned. The vendor reads and the delete stay on the legacy
  // /api/vendors; the create and the update are under /api/v1/vendors too, with the research routes.
  it.each([
    ["the research routes of a vendor", "/vendors/1/research"],
    ["the research config and settings", "/vendor-research/config"],
    ["the decisions on a finding", "/vendor-risk-findings/1/accept"],
  ])("mounts %s via router.use", (_label, path) => {
    expect(layerFor(path)).toBeDefined();
  });
});
