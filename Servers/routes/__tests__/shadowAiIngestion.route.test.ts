/**
 * Authentication tests for the Shadow AI ingestion router
 * (shadowAiIngestion.route.ts → controllers/shadowAiIngestion.ctrl.ts).
 *
 * The endpoint is PUBLIC (no JWT); security is the X-API-Key header, validated
 * by the REAL `validateApiKeyWithCache` in utils/shadowAiApiKey.utils.ts —
 * including the real format regex `^vw_sk_\d+_[a-f0-9]{48}$` (utils:184) and the
 * real SHA-256 hash + DB lookup. That module is intentionally NOT mocked; the
 * DB seam (`database/db`: sequelize.query / sequelize.transaction) is mocked
 * instead, along with the downstream service boundaries (tool matcher, model
 * extractor, alert notification, settings lookup) that would otherwise hit the
 * DB. `utils/shadowAiIngestion.utils` (normalizeEvent + insertEventsQuery) is
 * kept REAL so the INSERT path — and the organization_id it receives — is
 * exercised end to end.
 *
 * These tests fail if the header check, the regex, or the DB validation is
 * removed. The 5-minute in-memory key cache is cleared between tests via the
 * real `clearApiKeyCache()` to prevent cross-test contamination.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";

const sequelizeQuery = jest.fn(async (sql: string, _opts?: unknown): Promise<any> => {
  if (sql.includes("shadow_ai_api_keys")) {
    return [keyRows, {}];
  }
  return [[], {}];
});
const transactionCommit = jest.fn(async () => {});
const transactionRollback = jest.fn(async () => {});
const sequelizeTransaction = jest.fn(async () => ({
  commit: transactionCommit,
  rollback: transactionRollback,
}));

jest.mock("../../database/db", () => ({
  __esModule: true,
  sequelize: {
    query: (...args: unknown[]) => sequelizeQuery(...(args as [string])),
    transaction: () => sequelizeTransaction(),
  },
}));

jest.mock("../../services/shadowAiToolMatcher.service", () => ({
  __esModule: true,
  matchDomain: jest.fn(async () => null), // no registry match → no tool writes
  ensureTenantTool: jest.fn(),
  updateToolCounters: jest.fn(),
}));

jest.mock("../../services/shadowAiModelExtractor.service", () => ({
  __esModule: true,
  extractModel: jest.fn(async () => null),
}));

jest.mock("../../services/shadowAiAlertNotification.service", () => ({
  __esModule: true,
  evaluateRulesForBatch: jest.fn(async () => {}),
}));

jest.mock("../../utils/shadowAiConfig.utils", () => ({
  __esModule: true,
  getSettingsQuery: jest.fn(async () => ({ rate_limit_max_events_per_hour: 0 })), // 0 = no limit
}));

// Row the "valid key" DB lookup returns; per-test variable.
let keyRows: unknown[] = [];

import shadowAiIngestionRouter from "../shadowAiIngestion.route";
import { clearApiKeyCache } from "../../utils/shadowAiApiKey.utils";

const VALID_KEY = `vw_sk_1_${"a".repeat(48)}`;
const UNKNOWN_KEY = `vw_sk_1_${"b".repeat(48)}`;

const app = () => {
  const a = express();
  // The missing-key 401 at ctrl:78 is OUTSIDE any try/catch and uses req.t!,
  // so the identity stub is required for a clean 401 instead of a 500.
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).t = (s: string) => s;
    next();
  });
  a.use(express.json());
  a.use("/api/v1/shadow-ai", shadowAiIngestionRouter);
  return a;
};

const VALID_EVENT = {
  user_email: "jane.doe@acme.com",
  destination: "api.openai.com",
  uri_path: "/v1/chat/completions",
  http_method: "POST",
  timestamp: "2026-10-29T12:00:00.000Z",
};

beforeEach(() => {
  keyRows = [];
  sequelizeQuery.mockClear();
  sequelizeTransaction.mockClear();
  transactionCommit.mockClear();
  transactionRollback.mockClear();
  clearApiKeyCache();
});

const keyLookupCalls = () =>
  sequelizeQuery.mock.calls.filter(([sql]) => (sql as string).includes("shadow_ai_api_keys"));
const insertCalls = () =>
  sequelizeQuery.mock.calls.filter(([sql]) =>
    (sql as string).includes("INSERT INTO shadow_ai_events"),
  );

describe("POST /api/v1/shadow-ai/events — X-API-Key guard", () => {
  it("rejects a request with no X-API-Key header with 401 (real controller check)", async () => {
    const res = await request(app())
      .post("/api/v1/shadow-ai/events")
      .send({ events: [VALID_EVENT] });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Unauthorized", data: "Missing X-API-Key header" });
    expect(sequelizeQuery).not.toHaveBeenCalled();
  });

  it("rejects a malformed key with 401 via the REAL regex, with no DB lookup issued", async () => {
    const res = await request(app())
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", "not-a-key")
      .send({ events: [VALID_EVENT] });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Unauthorized", data: "Invalid or revoked API key" });
    expect(keyLookupCalls()).toHaveLength(0);
  });

  it("rejects a well-formed but unknown key with 401 after the real hash + DB lookup", async () => {
    keyRows = []; // DB returns no active row

    const res = await request(app())
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", UNKNOWN_KEY)
      .send({ events: [VALID_EVENT] });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Unauthorized", data: "Invalid or revoked API key" });
    expect(keyLookupCalls()).toHaveLength(1);
    const [, opts] = keyLookupCalls()[0] as [string, { replacements: Record<string, unknown> }];
    expect(opts.replacements.organizationId).toBe(1);
    expect(opts.replacements.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(insertCalls()).toHaveLength(0);
  });

  it("ingests valid events with a valid key: 200 and the insert receives organization_id 1", async () => {
    keyRows = [{ id: 7, key_prefix: VALID_KEY.slice(0, 15), is_active: true }];

    const res = await request(app())
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", VALID_KEY)
      .send({ events: [VALID_EVENT] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "OK",
      data: { ingested: 1, tools_matched: 0 },
    });
    expect(transactionCommit).toHaveBeenCalled();
    expect(transactionRollback).not.toHaveBeenCalled();
    expect(insertCalls()).toHaveLength(1);
    const [, opts] = insertCalls()[0] as [string, { replacements: Record<string, unknown> }];
    expect(opts.replacements.organizationId).toBe(1);
    expect(opts.replacements.user_email_0).toBe("jane.doe@acme.com");
  });

  it("ignores a smuggled organization_id in the payload — the insert always uses the key's org", async () => {
    keyRows = [{ id: 7, key_prefix: VALID_KEY.slice(0, 15), is_active: true }];

    const res = await request(app())
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", VALID_KEY)
      .send({
        organization_id: 999,
        events: [{ ...VALID_EVENT, organization_id: 999 }],
      });

    expect(res.status).toBe(200);
    expect(insertCalls()).toHaveLength(1);
    const [, opts] = insertCalls()[0] as [string, { replacements: Record<string, unknown> }];
    expect(opts.replacements.organizationId).toBe(1);
    expect(JSON.stringify(opts.replacements)).not.toContain("999");
  });

  it("returns 200 {ingested: 0} for a valid key with an empty events array", async () => {
    keyRows = [{ id: 7, key_prefix: VALID_KEY.slice(0, 15), is_active: true }];

    const res = await request(app())
      .post("/api/v1/shadow-ai/events")
      .set("X-API-Key", VALID_KEY)
      .send({ events: [] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "OK", data: { ingested: 0 } });
    expect(insertCalls()).toHaveLength(0);
  });
});
