jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../../utils/aiGatewayInternal.utils", () => ({ aiGatewayRequest: jest.fn() }));
jest.mock("../../../utils/aiGatewayConfig", () => ({ isGatewayInternalKeyConfigured: jest.fn() }));
jest.mock("../../../utils/agentDiscovery.utils", () => ({ getAgentStatsQuery: jest.fn() }));

import logger from "../../../utils/logger/fileLogger";
import { sequelize } from "../../../database/db";
import { aiGatewayRequest } from "../../../utils/aiGatewayInternal.utils";
import { isGatewayInternalKeyConfigured } from "../../../utils/aiGatewayConfig";
import { getAgentStatsQuery } from "../../../utils/agentDiscovery.utils";
import { loadHomeCounts, GATEWAY_COUNT_TIMEOUT_MS } from "../counts";
import type { HomeQueueContext } from "../../../domain.layer/interfaces/i.homeQueue";

const query = sequelize.query as jest.Mock;
const gateway = aiGatewayRequest as jest.Mock;
const keyConfigured = isGatewayInternalKeyConfigured as jest.Mock;
const agentStats = getAgentStatsQuery as jest.Mock;

const ctxWith = (allowed: string[]): HomeQueueContext => ({
  organizationId: 7,
  userId: 5,
  can: (key) => allowed.includes(key),
  isAdmin: false,
  today: "2026-11-14",
});

/** Answers each count's SQL by the table it reads, so one test can fail one count. */
const answerSql = (overrides: Record<string, number | Error> = {}) => {
  const answers: Record<string, number | Error> = {
    intake_submissions: 3,
    "FROM risks": 4,
    "FROM vendors": 5,
    policy_manager: 6,
    "FROM projects": 10,
    ...overrides,
  };
  query.mockImplementation(async (sql: string) => {
    const key = Object.keys(answers).find((k) => sql.includes(k));
    if (!key) throw new Error(`unexpected sql: ${sql}`);
    const value = answers[key];
    if (value instanceof Error) throw value;
    // aiOnRecord reads four sub-counts in one row; the rest read `total`.
    return [{ total: String(value), use_cases: "1", models: "2", ai_apps: "3", agents: "4" }];
  });
};

beforeEach(() => {
  jest.resetAllMocks();
  answerSql();
  agentStats.mockResolvedValue({ total: 9, unreviewed: 2, confirmed: 0, rejected: 0, stale: 0 });
  gateway.mockResolvedValue({ summary: { blocked: 7, masked: 11 } });
  keyConfigured.mockReturnValue(true);
});

describe("loadHomeCounts", () => {
  it("computes every count for a user who may see them all", async () => {
    const counts = await loadHomeCounts(ctxWith(["intakeForm.edit"]));

    expect(counts).toEqual({
      intakeWaiting: 3,
      agentsToReview: 2,
      aiOnRecord: 10,
      untreatedRisks: 4,
      vendorReviewsDue: 5,
      policyReviewsDue: 6,
      promptsBlockedMasked24h: 18,
    });
    expect(counts).not.toHaveProperty("aiApprovalsWaiting");
  });

  it("omits intakeWaiting, not zeroes it, without intakeForm.edit", async () => {
    const counts = await loadHomeCounts(ctxWith([]));
    expect(counts).not.toHaveProperty("intakeWaiting");
    expect(counts.untreatedRisks).toBe(4);
  });

  it("asks the gateway for the last 24 hours of the caller's organization with a timeout", async () => {
    await loadHomeCounts(ctxWith([]));

    expect(gateway).toHaveBeenCalledTimes(1);
    const [method, path, options] = gateway.mock.calls[0];
    expect(method).toBe("GET");
    expect(path).toBe("/internal/guardrails/stats?period=24h");
    expect(options).toMatchObject({
      organizationId: 7,
      timeoutMs: GATEWAY_COUNT_TIMEOUT_MS,
    });
    expect(options).not.toHaveProperty("userId");
    expect(GATEWAY_COUNT_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });

  it("omits the count without calling or logging when the gateway key is not configured", async () => {
    keyConfigured.mockReturnValue(false);
    const counts = await loadHomeCounts(ctxWith([]));

    expect(counts).not.toHaveProperty("promptsBlockedMasked24h");
    expect(gateway).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(counts.untreatedRisks).toBe(4);
  });

  it("reports null for a count whose gateway call rejects, leaving the others intact", async () => {
    gateway.mockRejectedValue(new Error("timed out"));
    const counts = await loadHomeCounts(ctxWith(["intakeForm.edit"]));

    expect(counts.promptsBlockedMasked24h).toBeNull();
    expect(counts.untreatedRisks).toBe(4);
    expect(counts.agentsToReview).toBe(2);
  });

  it("reports null, never 0, when the gateway answers without a usable summary", async () => {
    gateway.mockResolvedValue({});
    const counts = await loadHomeCounts(ctxWith([]));
    expect(counts.promptsBlockedMasked24h).toBeNull();
  });

  it("reports null for a failing SQL count and still returns the rest", async () => {
    answerSql({ "FROM vendors": new Error("boom") });
    const counts = await loadHomeCounts(ctxWith(["intakeForm.edit"]));

    expect(counts.vendorReviewsDue).toBeNull();
    expect(counts.policyReviewsDue).toBe(6);
    expect(counts.intakeWaiting).toBe(3);
  });

  it("reports null when the agent stats query fails", async () => {
    agentStats.mockRejectedValue(new Error("boom"));
    const counts = await loadHomeCounts(ctxWith([]));
    expect(counts.agentsToReview).toBeNull();
    expect(counts.aiOnRecord).toBe(10);
  });

  it("scopes every SQL count to the caller's organization", async () => {
    await loadHomeCounts(ctxWith(["intakeForm.edit"]));

    expect(query).toHaveBeenCalled();
    for (const [, options] of query.mock.calls) {
      expect(options.replacements.organizationId).toBe(7);
    }
    expect(agentStats).toHaveBeenCalledWith(7);
  });
});
