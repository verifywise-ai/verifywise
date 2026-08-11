import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

// Mock dependencies
jest.mock("../../advisor/observability/langfuseConfig", () => ({
  getLangfuse: jest.fn(),
}));
jest.mock("../../advisor/observability/costTracker", () => ({
  getCostSummary: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    404: (error: any) => ({ message: "Not Found", error }),
    500: (error: any) => ({ message: "Internal Server Error", error }),
  },
}));

import {
  getTraces,
  getTraceDetail,
  getCosts,
  getPerformance,
  getMetrics,
} from "../observability.ctrl";
import { getLangfuse } from "../../advisor/observability/langfuseConfig";
import { getCostSummary } from "../../advisor/observability/costTracker";

const mockGetLangfuse = getLangfuse as jest.MockedFunction<typeof getLangfuse>;
const mockGetCostSummary = getCostSummary as jest.MockedFunction<typeof getCostSummary>;

function createReq(overrides?: Partial<Request>): Partial<Request> {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    query: {},
    params: {},
    ...overrides,
  } as any;
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

describe("observability.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── GET /api/observability/traces ─────────────────────────────────
  describe("getTraces", () => {
    it("returns 200 with traces from Langfuse when configured", async () => {
      const fakeLangfuse = {
        fetchTraces: jest.fn<any>().mockResolvedValue({
          data: [{ id: "t1", name: "agent-interaction", timestamp: "2026-01-01T00:00:00Z" }],
          meta: { totalItems: 1 },
        }),
      };
      mockGetLangfuse.mockReturnValue(fakeLangfuse as any);

      const req = createReq({ query: { limit: "10", offset: "0" } } as any);
      const res = createRes();

      await getTraces(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0].data;
      expect(Array.isArray(payload.traces)).toBe(true);
      expect(payload.traces).toHaveLength(1);
      expect(payload).toHaveProperty("total");
      expect(payload).toHaveProperty("limit");
      expect(payload).toHaveProperty("offset");
    });

    it("returns 200 with empty traces when Langfuse is not configured (does not throw)", async () => {
      mockGetLangfuse.mockReturnValue(null);

      const req = createReq();
      const res = createRes();

      await getTraces(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0].data;
      expect(payload.traces).toEqual([]);
      expect(payload.total).toBe(0);
    });

    it("returns 500 when Langfuse fetch throws", async () => {
      const fakeLangfuse = {
        fetchTraces: jest.fn<any>().mockRejectedValue(new Error("langfuse down")),
      };
      mockGetLangfuse.mockReturnValue(fakeLangfuse as any);

      const req = createReq();
      const res = createRes();

      await getTraces(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ── GET /api/observability/traces/:id ─────────────────────────────
  describe("getTraceDetail", () => {
    it("returns 200 with trace + spans from Langfuse when configured", async () => {
      const fakeLangfuse = {
        fetchTrace: jest.fn<any>().mockResolvedValue({
          data: {
            id: "t1",
            name: "agent-interaction",
            // Trace is tagged for org 1 (the caller's org) so the ownership
            // check in getTraceDetail passes.
            tags: ["org:1"],
            observations: [
              { id: "s1", type: "SPAN", name: "fetch_risks" },
              { id: "s2", type: "GENERATION", name: "llm" },
            ],
          },
        }),
      };
      mockGetLangfuse.mockReturnValue(fakeLangfuse as any);

      const req = createReq({ params: { id: "t1" } } as any);
      const res = createRes();

      await getTraceDetail(req as Request, res as Response);

      expect(fakeLangfuse.fetchTrace).toHaveBeenCalledWith("t1");
      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0].data;
      expect(payload.trace).toBeTruthy();
      expect(Array.isArray(payload.spans)).toBe(true);
      expect(payload.spans).toHaveLength(2);
    });

    it("returns 404 when the trace belongs to another org (tenant isolation)", async () => {
      const fakeLangfuse = {
        fetchTrace: jest.fn<any>().mockResolvedValue({
          data: {
            id: "t1",
            name: "agent-interaction",
            // Trace is tagged for a DIFFERENT org — must not be disclosed to org 1.
            tags: ["org:2"],
            observations: [{ id: "s1", type: "SPAN", name: "secret" }],
          },
        }),
      };
      mockGetLangfuse.mockReturnValue(fakeLangfuse as any);

      const req = createReq({ params: { id: "t1" }, organizationId: 1 } as any);
      const res = createRes();

      await getTraceDetail(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 404 when the trace carries no org tag", async () => {
      const fakeLangfuse = {
        fetchTrace: jest.fn<any>().mockResolvedValue({
          data: { id: "t1", name: "agent-interaction", observations: [] },
        }),
      };
      mockGetLangfuse.mockReturnValue(fakeLangfuse as any);

      const req = createReq({ params: { id: "t1" } } as any);
      const res = createRes();

      await getTraceDetail(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 200 with null trace + empty spans when Langfuse is not configured (does not throw)", async () => {
      mockGetLangfuse.mockReturnValue(null);

      const req = createReq({ params: { id: "t1" } } as any);
      const res = createRes();

      await getTraceDetail(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0].data;
      expect(payload.trace).toBeNull();
      expect(payload.spans).toEqual([]);
    });

    it("returns 500 when Langfuse fetch throws", async () => {
      const fakeLangfuse = {
        fetchTrace: jest.fn<any>().mockRejectedValue(new Error("boom")),
      };
      mockGetLangfuse.mockReturnValue(fakeLangfuse as any);

      const req = createReq({ params: { id: "t1" } } as any);
      const res = createRes();

      await getTraceDetail(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ── GET /api/observability/costs ──────────────────────────────────
  describe("getCosts", () => {
    it("returns 200 with cost breakdown from costTracker (Langfuse-independent)", async () => {
      mockGetLangfuse.mockReturnValue(null);
      mockGetCostSummary.mockResolvedValue({
        breakdown: [
          { agent: "a1", model: "gpt-4", total_cost: "1.50", total_calls: "3" },
          { agent: "a2", model: "claude", total_cost: "0.50", total_calls: "1" },
        ],
      } as any);

      const req = createReq({ query: { dateFrom: "2026-01-01", dateTo: "2026-02-01" } } as any);
      const res = createRes();

      await getCosts(req as Request, res as Response);

      expect(mockGetCostSummary).toHaveBeenCalledWith(1, "2026-01-01", "2026-02-01");
      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0].data;
      expect(Array.isArray(payload.breakdown)).toBe(true);
      expect(payload.breakdown).toHaveLength(2);
      expect(payload).toHaveProperty("totalCost");
      expect(payload.totalCost).toBeCloseTo(2.0);
    });

    it("returns 200 with empty breakdown + zero total when no cost data", async () => {
      mockGetLangfuse.mockReturnValue(null);
      mockGetCostSummary.mockResolvedValue({ breakdown: [] } as any);

      const req = createReq();
      const res = createRes();

      await getCosts(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0].data;
      expect(payload.breakdown).toEqual([]);
      expect(payload.totalCost).toBe(0);
    });

    it("returns 500 when costTracker throws", async () => {
      mockGetLangfuse.mockReturnValue(null);
      mockGetCostSummary.mockRejectedValue(new Error("db error"));

      const req = createReq();
      const res = createRes();

      await getCosts(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ── GET /api/observability/performance ────────────────────────────
  describe("getPerformance", () => {
    it("returns 200 with latency percentiles + error rate from this org's trace observations", async () => {
      // getPerformance resolves the org's traces via the org tag first, then
      // aggregates observations belonging to those traces.
      const fakeLangfuse = {
        fetchTraces: jest.fn<any>().mockResolvedValue({
          data: [{ id: "t1" }],
        }),
        fetchObservations: jest.fn<any>().mockResolvedValue({
          data: [
            { latency: 100, level: "DEFAULT" },
            { latency: 200, level: "DEFAULT" },
            { latency: 300, level: "ERROR" },
            { latency: 400, level: "DEFAULT" },
          ],
        }),
      };
      mockGetLangfuse.mockReturnValue(fakeLangfuse as any);

      const req = createReq();
      const res = createRes();

      await getPerformance(req as Request, res as Response);

      // Traces are queried scoped to the caller's org tag.
      expect(fakeLangfuse.fetchTraces).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ["org:1"] }),
      );
      // Observations are fetched per resolved trace id, never project-wide.
      expect(fakeLangfuse.fetchObservations).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: "t1" }),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0].data;
      expect(payload.latency).toHaveProperty("p50");
      expect(payload.latency).toHaveProperty("p95");
      expect(payload.latency).toHaveProperty("p99");
      expect(payload).toHaveProperty("errorRate");
      expect(payload).toHaveProperty("totalRequests");
      expect(payload.totalRequests).toBe(4);
      expect(payload.errorRate).toBeCloseTo(0.25);
    });

    it("returns zeroed metrics when the org has no traces (no cross-org aggregation)", async () => {
      const fakeLangfuse = {
        fetchTraces: jest.fn<any>().mockResolvedValue({ data: [] }),
        fetchObservations: jest.fn<any>(),
      };
      mockGetLangfuse.mockReturnValue(fakeLangfuse as any);

      const req = createReq();
      const res = createRes();

      await getPerformance(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0].data;
      expect(payload.totalRequests).toBe(0);
      // Never falls back to a project-wide observation fetch.
      expect(fakeLangfuse.fetchObservations).not.toHaveBeenCalled();
    });

    it("returns 200 with zeroed metrics when Langfuse is not configured (does not throw)", async () => {
      mockGetLangfuse.mockReturnValue(null);

      const req = createReq();
      const res = createRes();

      await getPerformance(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0].data;
      expect(payload.latency).toEqual({ p50: 0, p95: 0, p99: 0 });
      expect(payload.errorRate).toBe(0);
      expect(payload.totalRequests).toBe(0);
    });

    it("returns 500 when Langfuse fetch throws", async () => {
      const fakeLangfuse = {
        fetchTraces: jest.fn<any>().mockRejectedValue(new Error("nope")),
        fetchObservations: jest.fn<any>(),
      };
      mockGetLangfuse.mockReturnValue(fakeLangfuse as any);

      const req = createReq();
      const res = createRes();

      await getPerformance(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
  // ── GET /api/observability/metrics ────────────────────────────────
  describe("getMetrics", () => {
    // The AI Observability page has always called this path. Until it existed
    // every request 404'd and the page settled into four permanently-zero stat
    // cards that were indistinguishable from an org with no AI activity.
    it("rolls traces up into the summary shape the dashboard consumes", async () => {
      mockGetCostSummary.mockResolvedValue({
        breakdown: [{ total_cost: "1.25" }, { total_cost: "0.75" }],
      } as any);
      const fakeLangfuse = {
        fetchTraces: jest.fn<any>().mockResolvedValue({
          data: [
            { id: "t1", tags: ["org:1"], latency: 100, timestamp: "2026-07-01T10:00:00Z" },
            { id: "t2", tags: ["org:1"], latency: 300, timestamp: "2026-07-01T12:00:00Z" },
            {
              id: "t3",
              tags: ["org:1"],
              latency: 200,
              level: "ERROR",
              timestamp: "2026-07-02T09:00:00Z",
            },
          ],
          meta: { totalItems: 3 },
        }),
      };
      mockGetLangfuse.mockReturnValue(fakeLangfuse as any);

      const req = createReq();
      const res = createRes();

      await getMetrics(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0].data;
      expect(payload.summary.total_traces).toBe(3);
      expect(payload.summary.total_cost).toBeCloseTo(2);
      expect(payload.summary.avg_latency_ms).toBe(200);
      expect(payload.summary.error_rate_pct).toBe(33);
      // One point per day, ascending, averaged within the day.
      expect(payload.latencyTrend).toEqual([
        { date: "2026-07-01", avg_latency_ms: 200 },
        { date: "2026-07-02", avg_latency_ms: 200 },
      ]);
    });

    it("scopes the roll-up to the caller's organization", async () => {
      mockGetCostSummary.mockResolvedValue({ breakdown: [] } as any);
      const fakeLangfuse = {
        fetchTraces: jest.fn<any>().mockResolvedValue({
          data: [
            { id: "mine", tags: ["org:1"], latency: 100, timestamp: "2026-07-01T10:00:00Z" },
            // Neither of these may influence the numbers: a foreign tag, and a
            // trace with no org tag at all (fail closed, as elsewhere).
            { id: "theirs", tags: ["org:2"], latency: 9000, timestamp: "2026-07-01T10:00:00Z" },
            { id: "untagged", latency: 9000, timestamp: "2026-07-01T10:00:00Z" },
          ],
          meta: { totalItems: 3 },
        }),
      };
      mockGetLangfuse.mockReturnValue(fakeLangfuse as any);

      const res = createRes();
      await getMetrics(createReq() as Request, res as Response);

      const payload = res.json.mock.calls[0][0].data;
      expect(payload.summary.avg_latency_ms).toBe(100);
      expect(fakeLangfuse.fetchTraces).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ["org:1"] }),
      );
    });

    it("returns zeroes rather than 500 when Langfuse is unconfigured, keeping cost data", async () => {
      mockGetCostSummary.mockResolvedValue({ breakdown: [{ total_cost: "3.00" }] } as any);
      mockGetLangfuse.mockReturnValue(null as any);

      const res = createRes();
      await getMetrics(createReq() as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0].data;
      // costTracker is Langfuse-independent, so the cost is still real.
      expect(payload.summary.total_cost).toBeCloseTo(3);
      expect(payload.summary.total_traces).toBe(0);
      expect(payload.latencyTrend).toEqual([]);
    });

    it("500s when the cost source throws", async () => {
      mockGetCostSummary.mockRejectedValue(new Error("db down") as any);

      const res = createRes();
      await getMetrics(createReq() as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("limit clamping", () => {
    // Unclamped, `limit` let a caller ask for an arbitrary page size, which
    // getPerformance then fans out across up to 100 traces, and limit=0 turned
    // the offset/limit page computation into Infinity.
    it("caps an oversized limit on getTraces", async () => {
      const fakeLangfuse = {
        fetchTraces: jest.fn<any>().mockResolvedValue({ data: [], meta: { totalItems: 0 } }),
      };
      mockGetLangfuse.mockReturnValue(fakeLangfuse as any);

      const res = createRes();
      await getTraces(createReq({ query: { limit: "100000" } } as any) as Request, res as Response);

      expect(fakeLangfuse.fetchTraces).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 500 }),
      );
    });

    it("falls back to the default rather than producing a non-finite page", async () => {
      const fakeLangfuse = {
        fetchTraces: jest.fn<any>().mockResolvedValue({ data: [], meta: { totalItems: 0 } }),
      };
      mockGetLangfuse.mockReturnValue(fakeLangfuse as any);

      const res = createRes();
      await getTraces(
        createReq({ query: { limit: "0", offset: "10" } } as any) as Request,
        res as Response,
      );

      const arg = fakeLangfuse.fetchTraces.mock.calls[0][0];
      expect(arg.limit).toBe(50);
      expect(Number.isFinite(arg.page)).toBe(true);
    });
  });
});
