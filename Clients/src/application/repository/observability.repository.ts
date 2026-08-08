import { apiServices } from "../../infrastructure/api/networkServices";

export interface TraceFilters {
  status?: string;
  service?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export async function getTraces(filters?: TraceFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.service) params.set("service", filters.service);
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.set("dateTo", filters.dateTo);
  if (filters?.limit) params.set("limit", String(filters.limit));
  if (filters?.offset) params.set("offset", String(filters.offset));

  const response = await apiServices.get<any>(`/observability/traces?${params.toString()}`);
  return response.data?.data || response.data;
}

export async function getTraceDetail(traceId: string) {
  const response = await apiServices.get<any>(`/observability/traces/${traceId}`);
  return response.data?.data || response.data;
}

export async function getObservabilityMetrics(dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const response = await apiServices.get<any>(`/observability/metrics?${params.toString()}`);
  return response.data?.data || response.data;
}
