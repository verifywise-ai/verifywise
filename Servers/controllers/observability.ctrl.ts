import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { getLangfuse } from "../advisor/observability/langfuseConfig";
import { getCostSummary } from "../advisor/observability/costTracker";
import { orgTag } from "../advisor/observability/traceManager";

const fileName = "observability.ctrl.ts";

/**
 * True when a fetched trace belongs to the given organization. Langfuse traces
 * live in one shared project, so the `org:<id>` tag written by startTrace is the
 * only tenant boundary. A trace with no org tag (e.g. written before this scoping
 * existed, or without an org context) is treated as NOT belonging to any org and
 * is never disclosed through the scoped read endpoints.
 */
function traceBelongsToOrg(trace: any, organizationId: number): boolean {
  const tags: unknown = trace?.tags;
  return Array.isArray(tags) && tags.includes(orgTag(organizationId));
}

/**
 * Map over items with a bounded number of in-flight async calls. Used to fan
 * out per-trace Langfuse fetches without opening one socket per trace, which
 * would exhaust the connection pool and trip Langfuse rate limits.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Upper bound on how many of an org's most-recent traces the performance
// endpoint samples per request. Caps the per-request fan-out to Langfuse and
// keeps the metric a bounded, well-defined "recent activity" sample.
const PERFORMANCE_TRACE_SAMPLE = 100;
// Max concurrent per-trace observation fetches for one performance request.
const PERFORMANCE_FETCH_CONCURRENCY = 8;
// How many of an org's most-recent traces the dashboard roll-up summarises.
// Bounded for the same reason as PERFORMANCE_TRACE_SAMPLE: one page load must
// not fan out an unbounded fetch to Langfuse.
const METRICS_TRACE_SAMPLE = 500;

/**
 * Compute a percentile from a numeric sample.
 * Returns 0 for an empty sample.
 */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  return sortedAsc[idx];
}

/**
 * Read a caller-supplied `limit` into a sane bounded integer.
 *
 * Unclamped, `Number(limit)` let a caller ask for an arbitrary page size (which
 * getPerformance then fans out across up to 100 traces) and let `limit=0` turn
 * the `offset/limit` page computation into Infinity/NaN. Mirrors the clamping
 * reportRun.ctrl.ts already applies to its list endpoint.
 */
function boundedLimit(raw: unknown, fallback: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

/** Upper bound on any caller-supplied page size on these endpoints. */
const MAX_LIMIT = 500;

/**
 * GET /api/observability/traces
 * Recent traces with optional filters. Empty when Langfuse is unconfigured.
 */
export async function getTraces(req: Request, res: Response) {
  const functionName = "getTraces";
  const organizationId = req.organizationId!;

  try {
    const { limit, offset, userId, name } = req.query;
    const limitNum = boundedLimit(limit, 50, MAX_LIMIT);
    const parsedOffset = Number(offset);
    const offsetNum =
      Number.isFinite(parsedOffset) && parsedOffset > 0 ? Math.floor(parsedOffset) : 0;

    const langfuse = getLangfuse();
    if (!langfuse) {
      return res
        .status(200)
        .json(STATUS_CODE[200]({ traces: [], total: 0, limit: limitNum, offset: offsetNum }));
    }

    const page = Math.floor(offsetNum / limitNum) + 1;
    // Scope to the caller's org: Langfuse returns only traces carrying ALL of the
    // supplied tags, so org:<id> restricts the result set to this tenant's traces.
    const result = await langfuse.fetchTraces({
      limit: limitNum,
      page,
      tags: [orgTag(organizationId)],
      userId: userId as string | undefined,
      name: name as string | undefined,
    } as any);

    const traces = (result as any)?.data ?? [];
    const total = (result as any)?.meta?.totalItems ?? traces.length;

    return res
      .status(200)
      .json(STATUS_CODE[200]({ traces, total, limit: limitNum, offset: offsetNum }));
  } catch (error) {
    logStructured("error", "failed to get traces", functionName, fileName);
    logger.error("Error in getTraces:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/observability/traces/:id
 * Trace detail with its spans (observations). Null/empty when unconfigured.
 */
export async function getTraceDetail(req: Request, res: Response) {
  const functionName = "getTraceDetail";
  const traceId = req.params.id as string;
  const organizationId = req.organizationId!;

  try {
    const langfuse = getLangfuse();
    if (!langfuse) {
      return res.status(200).json(STATUS_CODE[200]({ trace: null, spans: [] }));
    }

    const result = await langfuse.fetchTrace(traceId);
    const trace = (result as any)?.data ?? null;

    // fetch-by-id has no tag filter, so enforce tenant ownership here. Traces
    // belonging to another org (or carrying no org tag) are indistinguishable
    // from a non-existent id — return 404 rather than confirm existence.
    if (!trace || !traceBelongsToOrg(trace, organizationId)) {
      return res.status(404).json(STATUS_CODE[404]("Trace not found"));
    }

    const spans = trace?.observations ?? [];

    return res.status(200).json(STATUS_CODE[200]({ trace, spans }));
  } catch (error) {
    logStructured("error", "failed to get trace detail", functionName, fileName);
    logger.error("Error in getTraceDetail:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/observability/costs
 * Cost breakdown by agent/model for an optional period.
 * Sourced from costTracker (Langfuse-independent), so it works when unconfigured.
 */
export async function getCosts(req: Request, res: Response) {
  const functionName = "getCosts";
  const organizationId = req.organizationId!;

  try {
    const { dateFrom, dateTo } = req.query;
    const summary = await getCostSummary(
      organizationId,
      dateFrom as string | undefined,
      dateTo as string | undefined,
    );

    const breakdown = ((summary as any)?.breakdown ?? []) as any[];
    const totalCost = breakdown.reduce((sum, row) => sum + Number(row.total_cost ?? 0), 0);

    return res.status(200).json(STATUS_CODE[200]({ breakdown, totalCost }));
  } catch (error) {
    logStructured("error", "failed to get costs", functionName, fileName);
    logger.error("Error in getCosts:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/observability/performance
 * Latency percentiles (p50/p95/p99) and error rate over recent observations.
 * Zeroed when Langfuse is unconfigured.
 */
export async function getPerformance(req: Request, res: Response) {
  const functionName = "getPerformance";
  const organizationId = req.organizationId!;

  try {
    const { limit } = req.query;
    const limitNum = boundedLimit(limit, 500, MAX_LIMIT);

    const langfuse = getLangfuse();
    if (!langfuse) {
      return res.status(200).json(
        STATUS_CODE[200]({
          latency: { p50: 0, p95: 0, p99: 0 },
          errorRate: 0,
          totalRequests: 0,
        }),
      );
    }

    // fetchObservations has no org/tag filter, so scope through this org's traces:
    // resolve the tenant's most-recent trace ids via the org tag, then aggregate
    // only observations belonging to those traces. Never aggregate across the
    // whole shared Langfuse project. The trace sample is capped so one request
    // can't fan out an unbounded number of fetches to Langfuse.
    const traceSampleSize = Math.min(limitNum, PERFORMANCE_TRACE_SAMPLE);
    const tracesResult = await langfuse.fetchTraces({
      limit: traceSampleSize,
      page: 1,
      tags: [orgTag(organizationId)],
    } as any);
    const orgTraceIds = Array.from(
      new Set<string>(
        (((tracesResult as any)?.data ?? []) as any[])
          .map((t) => t?.id)
          .filter((id): id is string => typeof id === "string"),
      ),
    );

    if (orgTraceIds.length === 0) {
      return res.status(200).json(
        STATUS_CODE[200]({
          latency: { p50: 0, p95: 0, p99: 0 },
          errorRate: 0,
          totalRequests: 0,
        }),
      );
    }

    const observationBatches = await mapWithConcurrency(
      orgTraceIds,
      PERFORMANCE_FETCH_CONCURRENCY,
      async (traceId) => {
        const obsResult = await langfuse.fetchObservations({
          limit: limitNum,
          traceId,
        } as any);
        return ((obsResult as any)?.data ?? []) as any[];
      },
    );
    const observations = observationBatches.flat();
    // totalRequests is the number of observations in the sampled window (this
    // org's most-recent PERFORMANCE_TRACE_SAMPLE traces), consistent with the
    // latency/error figures which are computed over the same sample.
    const totalRequests = observations.length;

    const latencies = observations
      .map((o) => Number(o.latency ?? 0))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    const errorCount = observations.filter((o) => o.level === "ERROR").length;
    const errorRate = observations.length > 0 ? errorCount / observations.length : 0;

    return res.status(200).json(
      STATUS_CODE[200]({
        latency: {
          p50: percentile(latencies, 50),
          p95: percentile(latencies, 95),
          p99: percentile(latencies, 99),
        },
        errorRate,
        totalRequests,
      }),
    );
  } catch (error) {
    logStructured("error", "failed to get performance", functionName, fileName);
    logger.error("Error in getPerformance:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/observability/metrics
 * Dashboard roll-up: headline counters plus a per-day average-latency series.
 *
 * The AI Observability page has always called this path; the route was never
 * implemented, so every request 404'd, React Query retried three times, and the
 * page settled into four permanently-zero stat cards and an empty chart that
 * were indistinguishable from an org with no AI activity.
 *
 * Composed from the same org-scoped primitives the sibling endpoints use --
 * costs from costTracker, latency and error rate from the traces carrying this
 * org's tag -- so it inherits their tenant boundary rather than introducing a
 * second one. Zeroed, not 500, when Langfuse is unconfigured: an unconfigured
 * install is a legitimate state, and the cost figures are still meaningful
 * because costTracker is Langfuse-independent.
 */
export async function getMetrics(req: Request, res: Response) {
  const functionName = "getMetrics";
  const organizationId = req.organizationId!;

  try {
    const { dateFrom, dateTo } = req.query;

    const costSummary = await getCostSummary(
      organizationId,
      dateFrom as string | undefined,
      dateTo as string | undefined,
    );
    const breakdown = ((costSummary as any)?.breakdown ?? []) as any[];
    // pg returns numeric as a string, so coerce before summing.
    const totalCost = breakdown.reduce((sum, row) => sum + Number(row.total_cost ?? 0), 0);

    const emptySummary = {
      summary: {
        total_traces: 0,
        total_cost: totalCost,
        avg_latency_ms: 0,
        error_rate_pct: 0,
      },
      latencyTrend: [] as Array<{ date: string; avg_latency_ms: number }>,
    };

    const langfuse = getLangfuse();
    if (!langfuse) {
      return res.status(200).json(STATUS_CODE[200](emptySummary));
    }

    const tracesResult = await langfuse.fetchTraces({
      limit: METRICS_TRACE_SAMPLE,
      page: 1,
      tags: [orgTag(organizationId)],
    } as any);
    const traces = (((tracesResult as any)?.data ?? []) as any[]).filter((t) =>
      traceBelongsToOrg(t, organizationId),
    );
    const totalTraces = (tracesResult as any)?.meta?.totalItems ?? traces.length;

    if (traces.length === 0) {
      return res.status(200).json(
        STATUS_CODE[200]({
          ...emptySummary,
          summary: { ...emptySummary.summary, total_traces: totalTraces },
        }),
      );
    }

    const latencies: number[] = [];
    let errorCount = 0;
    // date (YYYY-MM-DD) -> running sum and count, so the series is one pass.
    const perDay = new Map<string, { sum: number; count: number }>();

    for (const trace of traces) {
      const latency = Number(trace?.latency ?? 0);
      if (Number.isFinite(latency)) latencies.push(latency);
      if (trace?.level === "ERROR") errorCount += 1;

      const stamp = trace?.timestamp ?? trace?.createdAt;
      const date = typeof stamp === "string" ? stamp.slice(0, 10) : null;
      if (date && Number.isFinite(latency)) {
        const bucket = perDay.get(date) ?? { sum: 0, count: 0 };
        bucket.sum += latency;
        bucket.count += 1;
        perDay.set(date, bucket);
      }
    }

    const avgLatency =
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    const latencyTrend = Array.from(perDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { sum, count }]) => ({
        date,
        avg_latency_ms: Math.round(sum / count),
      }));

    return res.status(200).json(
      STATUS_CODE[200]({
        summary: {
          total_traces: totalTraces,
          total_cost: totalCost,
          avg_latency_ms: Math.round(avgLatency),
          error_rate_pct: Math.round((errorCount / traces.length) * 100),
        },
        latencyTrend,
      }),
    );
  } catch (error) {
    logStructured("error", "failed to get metrics", functionName, fileName);
    logger.error("Error in getMetrics:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
