import { useQuery } from "@tanstack/react-query";
import {
  getTraces,
  getTraceDetail,
  getObservabilityMetrics,
  type TraceFilters,
} from "../repository/observability.repository";

const TRACES_KEY = ["observability-traces"] as const;
const TRACE_DETAIL_KEY = ["observability-trace-detail"] as const;
const METRICS_KEY = ["observability-metrics"] as const;

export function useTraces(filters?: TraceFilters) {
  return useQuery({
    queryKey: [...TRACES_KEY, filters],
    queryFn: () => getTraces(filters),
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useTraceDetail(traceId?: string) {
  return useQuery({
    queryKey: [...TRACE_DETAIL_KEY, traceId],
    queryFn: () => getTraceDetail(traceId as string),
    enabled: !!traceId,
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useObservabilityMetrics(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: [...METRICS_KEY, dateFrom, dateTo],
    queryFn: () => getObservabilityMetrics(dateFrom, dateTo),
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
