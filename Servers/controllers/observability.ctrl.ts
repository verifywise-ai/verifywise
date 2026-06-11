import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { getLangfuse } from "../advisor/observability/langfuseConfig";
import { getCostSummary } from "../advisor/observability/costTracker";

const fileName = "observability.ctrl.ts";

/**
 * Compute a percentile from a numeric sample.
 * Returns 0 for an empty sample.
 */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.floor((p / 100) * sortedAsc.length),
  );
  return sortedAsc[idx];
}

/**
 * GET /api/observability/traces
 * Recent traces with optional filters. Empty when Langfuse is unconfigured.
 */
export async function getTraces(req: Request, res: Response) {
  const functionName = "getTraces";

  try {
    const { limit, offset, userId, name } = req.query;
    const limitNum = limit ? Number(limit) : 50;
    const offsetNum = offset ? Number(offset) : 0;

    const langfuse = getLangfuse();
    if (!langfuse) {
      return res
        .status(200)
        .json(STATUS_CODE[200]({ traces: [], total: 0, limit: limitNum, offset: offsetNum }));
    }

    const page = Math.floor(offsetNum / limitNum) + 1;
    const result = await langfuse.fetchTraces({
      limit: limitNum,
      page,
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

  try {
    const langfuse = getLangfuse();
    if (!langfuse) {
      return res.status(200).json(STATUS_CODE[200]({ trace: null, spans: [] }));
    }

    const result = await langfuse.fetchTrace(traceId);
    const trace = (result as any)?.data ?? null;
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
    const totalCost = breakdown.reduce(
      (sum, row) => sum + Number(row.total_cost ?? 0),
      0,
    );

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

  try {
    const { limit } = req.query;
    const limitNum = limit ? Number(limit) : 500;

    const langfuse = getLangfuse();
    if (!langfuse) {
      return res
        .status(200)
        .json(
          STATUS_CODE[200]({
            latency: { p50: 0, p95: 0, p99: 0 },
            errorRate: 0,
            totalRequests: 0,
          }),
        );
    }

    const result = await langfuse.fetchObservations({ limit: limitNum } as any);
    const observations = ((result as any)?.data ?? []) as any[];
    const totalRequests = (result as any)?.meta?.totalItems ?? observations.length;

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
