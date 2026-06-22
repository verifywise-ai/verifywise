import { apiServices } from "../../infrastructure/api/networkServices";

export interface AuditLogFilters {
  state?: string;
  tool?: string;
  user?: number;
  actorType?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export async function getAuditLog(filters?: AuditLogFilters) {
  const params = new URLSearchParams();
  if (filters?.state) params.set("state", filters.state);
  if (filters?.tool) params.set("tool", filters.tool);
  if (filters?.user) params.set("user", String(filters.user));
  if (filters?.actorType) params.set("actorType", filters.actorType);
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.set("dateTo", filters.dateTo);
  if (filters?.limit) params.set("limit", String(filters.limit));
  if (filters?.offset) params.set("offset", String(filters.offset));

  const response = await apiServices.get<any>(`/ai-audit/log?${params.toString()}`);
  return response.data?.data || response.data;
}

export async function getActionAuditTrail(actionId: string) {
  const response = await apiServices.get<any>(`/ai-audit/log/${actionId}`);
  return response.data?.data || response.data;
}

export async function getAuditAnalytics(dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const response = await apiServices.get<any>(`/ai-audit/analytics?${params.toString()}`);
  return response.data?.data || response.data;
}

export async function exportAuditLog(format: "csv" | "json", dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams();
  params.set("format", format);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  if (format === "csv") {
    const response = await apiServices.get<any>(`/ai-audit/export?${params.toString()}`, {
      responseType: "blob",
    });
    const blob = new Blob([response.data], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-audit-log.csv";
    a.click();
    window.URL.revokeObjectURL(url);
    return;
  }

  const response = await apiServices.get<any>(`/ai-audit/export?${params.toString()}`);
  return response.data?.data || response.data;
}
