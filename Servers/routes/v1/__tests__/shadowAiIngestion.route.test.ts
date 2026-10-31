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
  it("mounts the shadow-ai ingestion router via router.use", () => {
    // Express 5 layers expose matchers instead of a regexp.
    const layer = (v1Routes as any).stack.find(
      (l: any) =>
        !l.route &&
        Array.isArray(l.matchers) &&
        l.matchers.some((m: any) => m("/shadow-ai/events")),
    );
    expect(layer).toBeDefined();
  });
});
