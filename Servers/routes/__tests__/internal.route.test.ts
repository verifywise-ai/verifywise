/**
 * Authentication tests for the internal API router (internal.route.ts).
 *
 * These routes are called only by the Python services (AIGateway, EvalServer)
 * using the shared instance-wide secret in AI_GATEWAY_INTERNAL_KEY, sent as the
 * `x-internal-key` header. The guard (`verifyInternalKey`) lives inside the
 * router file itself, so we mount the REAL router unmocked — these tests fail
 * if the guard is removed — and mock only the downstream service/DB boundaries
 * (notification dispatch, monitoring config lookup).
 *
 * Tenant note: `organization_id` is caller-supplied body input by design. The
 * internal key is a single instance-wide secret and the gateway is a trusted
 * internal caller; these tests document that contract.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

jest.mock("../../services/aiGateway/aiGatewayNotifications", () => ({
  __esModule: true,
  notifyConfigChange: jest.fn(async () => {}),
  notifyBudgetWarning: jest.fn(async () => {}),
  notifyBudgetExhausted: jest.fn(async () => {}),
  notifyGuardrailSpike: jest.fn(async () => {}),
  notifyVirtualKeyBudgetExhausted: jest.fn(async () => {}),
  notifyApprovalPending: jest.fn(async () => {}),
}));

jest.mock("../../utils/monitoringConfig.utils", () => ({
  __esModule: true,
  getMonitoringConfig: jest.fn(async () => ({
    enabled: true,
    otlp_endpoint: "http://otel-collector:4318",
    deployment_name: "test-deployment",
    auth_header: "Authorization: Basic secret-value",
  })),
}));

import internalRouter from "../internal.route";
import { notifyConfigChange } from "../../services/aiGateway/aiGatewayNotifications";
import { getMonitoringConfig } from "../../utils/monitoringConfig.utils";

const INTERNAL_KEY = "test-internal-key";
let savedKey: string | undefined;

const app = () => {
  const a = express();
  a.use(express.json());
  a.use("/api/internal", internalRouter);
  return a;
};

beforeAll(() => {
  savedKey = process.env.AI_GATEWAY_INTERNAL_KEY;
  process.env.AI_GATEWAY_INTERNAL_KEY = INTERNAL_KEY;
});

afterAll(() => {
  if (savedKey === undefined) {
    delete process.env.AI_GATEWAY_INTERNAL_KEY;
  } else {
    process.env.AI_GATEWAY_INTERNAL_KEY = savedKey;
  }
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/internal/ai-gateway/notify — x-internal-key guard", () => {
  it("rejects a request with no x-internal-key header with 401", async () => {
    const res = await request(app())
      .post("/api/internal/ai-gateway/notify")
      .send({ type: "config_change", organization_id: 1 });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(notifyConfigChange).not.toHaveBeenCalled();
  });

  it("rejects a wrong key with 401", async () => {
    const res = await request(app())
      .post("/api/internal/ai-gateway/notify")
      .set("x-internal-key", "wrong-key!!!!!!!!") // same length as the expected key
      .send({ type: "config_change", organization_id: 1 });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  it("rejects a key of a different length with 401 (length-guard branch)", async () => {
    const res = await request(app())
      .post("/api/internal/ai-gateway/notify")
      .set("x-internal-key", "short")
      .send({ type: "config_change", organization_id: 1 });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  it("fails closed when AI_GATEWAY_INTERNAL_KEY is unset: 401 even with a header sent", async () => {
    delete process.env.AI_GATEWAY_INTERNAL_KEY;
    try {
      const res = await request(app())
        .post("/api/internal/ai-gateway/notify")
        .set("x-internal-key", INTERNAL_KEY)
        .send({ type: "config_change", organization_id: 1 });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
    } finally {
      process.env.AI_GATEWAY_INTERNAL_KEY = INTERNAL_KEY;
    }
  });

  it("accepts the valid key and dispatches the notification with the body's organization_id", async () => {
    const res = await request(app())
      .post("/api/internal/ai-gateway/notify")
      .set("x-internal-key", INTERNAL_KEY)
      .send({
        type: "config_change",
        organization_id: 42,
        changed_by_user_id: 7,
        event: { entityType: "Endpoint", action: "updated" },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(notifyConfigChange).toHaveBeenCalledWith(42, 7, {
      entityType: "Endpoint",
      action: "updated",
    });
  });

  it("rejects a valid-key request missing type/organization_id with 400", async () => {
    const res = await request(app())
      .post("/api/internal/ai-gateway/notify")
      .set("x-internal-key", INTERNAL_KEY)
      .send({ type: "config_change" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "type and organization_id required" });
    expect(notifyConfigChange).not.toHaveBeenCalled();
  });
});

describe("GET /api/internal/observability-config — x-internal-key guard", () => {
  it("rejects a request with no key with 401 and never leaks auth_header", async () => {
    const res = await request(app()).get("/api/internal/observability-config");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(res.body).not.toHaveProperty("auth_header");
    expect(getMonitoringConfig).not.toHaveBeenCalled();
  });

  it("returns the observability config (including auth_header) to the internal caller", async () => {
    const res = await request(app())
      .get("/api/internal/observability-config")
      .set("x-internal-key", INTERNAL_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      enabled: true,
      otlp_endpoint: "http://otel-collector:4318",
      deployment_name: "test-deployment",
      auth_header: "Authorization: Basic secret-value",
    });
  });
});
