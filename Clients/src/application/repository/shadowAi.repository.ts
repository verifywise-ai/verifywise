/**
 * Shadow AI Repository
 *
 * API client for Shadow AI endpoints.
 */

import { apiServices } from "../../infrastructure/api/networkServices";
import {
  IShadowAiTool,
  IShadowAiRule,
  IShadowAiApiKey,
  IShadowAiApiKeyCreated,
  IShadowAiSyslogConfig,
  ShadowAiInsightsSummary,
  ShadowAiToolByEvents,
  ShadowAiToolByUsers,
  ShadowAiUsersByDepartment,
  ShadowAiTrendPoint,
  ShadowAiUserActivity,
  ShadowAiDepartmentActivity,
  IShadowAiAlertHistory,
  ShadowAiGovernanceRequest,
  ShadowAiGovernanceResult,
  ShadowAiToolStatus,
  IShadowAiSettings,
} from "../../domain/interfaces/i.shadowAi";

const BASE_URL = "/shadow-ai";

// ============================================================================
// API Keys
// ============================================================================

export async function createApiKey(label?: string): Promise<IShadowAiApiKeyCreated> {
  const response = await apiServices.post<{ data: IShadowAiApiKeyCreated }>(
    `${BASE_URL}/api-keys`,
    { label },
  );
  return response.data.data;
}

export async function listApiKeys(): Promise<IShadowAiApiKey[]> {
  const response = await apiServices.get<{ data: IShadowAiApiKey[] }>(`${BASE_URL}/api-keys`);
  return response.data.data;
}

export async function revokeApiKey(id: number): Promise<void> {
  await apiServices.delete(`${BASE_URL}/api-keys/${id}`);
}

export async function deleteApiKey(id: number): Promise<void> {
  await apiServices.delete(`${BASE_URL}/api-keys/${id}/permanent`);
}

// ============================================================================
// Insights
// ============================================================================

export async function getInsightsSummary(period?: string): Promise<ShadowAiInsightsSummary> {
  const params = period ? `?period=${period}` : "";
  const response = await apiServices.get<{ data: ShadowAiInsightsSummary }>(
    `${BASE_URL}/insights/summary${params}`,
  );
  return response.data.data;
}

export async function getToolsByEvents(
  period?: string,
  limit?: number,
): Promise<ShadowAiToolByEvents[]> {
  const queryParams = new URLSearchParams();
  if (period) queryParams.append("period", period);
  if (limit) queryParams.append("limit", limit.toString());
  const qs = queryParams.toString();
  const response = await apiServices.get<{ data: ShadowAiToolByEvents[] }>(
    `${BASE_URL}/insights/tools-by-events${qs ? `?${qs}` : ""}`,
  );
  return response.data.data;
}

export async function getToolsByUsers(
  period?: string,
  limit?: number,
): Promise<ShadowAiToolByUsers[]> {
  const queryParams = new URLSearchParams();
  if (period) queryParams.append("period", period);
  if (limit) queryParams.append("limit", limit.toString());
  const qs = queryParams.toString();
  const response = await apiServices.get<{ data: ShadowAiToolByUsers[] }>(
    `${BASE_URL}/insights/tools-by-users${qs ? `?${qs}` : ""}`,
  );
  return response.data.data;
}

export async function getUsersByDepartment(period?: string): Promise<ShadowAiUsersByDepartment[]> {
  const params = period ? `?period=${period}` : "";
  const response = await apiServices.get<{ data: ShadowAiUsersByDepartment[] }>(
    `${BASE_URL}/insights/users-by-department${params}`,
  );
  return response.data.data;
}

export async function getTrend(
  period?: string,
  granularity?: string,
): Promise<ShadowAiTrendPoint[]> {
  const queryParams = new URLSearchParams();
  if (period) queryParams.append("period", period);
  if (granularity) queryParams.append("granularity", granularity);
  const qs = queryParams.toString();
  const response = await apiServices.get<{ data: ShadowAiTrendPoint[] }>(
    `${BASE_URL}/insights/trend${qs ? `?${qs}` : ""}`,
  );
  return response.data.data;
}

// ============================================================================
// User Activity
// ============================================================================

export interface GetUsersParams {
  page?: number;
  limit?: number;
  period?: string;
  department?: string;
  sort_by?: string;
  order?: string;
}

export interface UsersResponse {
  users: ShadowAiUserActivity[];
  total: number;
  page: number;
  limit: number;
}

export async function getUsers(params: GetUsersParams = {}): Promise<UsersResponse> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append("page", params.page.toString());
  if (params.limit) queryParams.append("limit", params.limit.toString());
  if (params.period) queryParams.append("period", params.period);
  if (params.department) queryParams.append("department", params.department);
  if (params.sort_by) queryParams.append("sort_by", params.sort_by);
  if (params.order) queryParams.append("order", params.order);
  const qs = queryParams.toString();
  const response = await apiServices.get<{ data: UsersResponse }>(
    `${BASE_URL}/users${qs ? `?${qs}` : ""}`,
  );
  return response.data.data;
}

export async function getUserDetail(
  email: string,
  period?: string,
): Promise<{
  email: string;
  department: string;
  tools: { tool_name: string; event_count: number; last_used: string }[];
  total_prompts: number;
}> {
  const params = period ? `?period=${period}` : "";
  const response = await apiServices.get<{
    data: {
      email: string;
      department: string;
      tools: { tool_name: string; event_count: number; last_used: string }[];
      total_prompts: number;
    };
  }>(`${BASE_URL}/users/${encodeURIComponent(email)}/activity${params}`);
  return response.data.data;
}

export async function getDepartmentActivity(
  period?: string,
): Promise<ShadowAiDepartmentActivity[]> {
  const params = period ? `?period=${period}` : "";
  const response = await apiServices.get<{ data: ShadowAiDepartmentActivity[] }>(
    `${BASE_URL}/departments${params}`,
  );
  return response.data.data;
}

// ============================================================================
// Tools
// ============================================================================

export interface GetToolsParams {
  page?: number;
  limit?: number;
  status?: ShadowAiToolStatus;
  sort_by?: string;
  order?: string;
}

export interface ToolsResponse {
  tools: IShadowAiTool[];
  total: number;
  page: number;
  limit: number;
}

export async function getTools(params: GetToolsParams = {}): Promise<ToolsResponse> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append("page", params.page.toString());
  if (params.limit) queryParams.append("limit", params.limit.toString());
  if (params.status) queryParams.append("status", params.status);
  if (params.sort_by) queryParams.append("sort_by", params.sort_by);
  if (params.order) queryParams.append("order", params.order);
  const qs = queryParams.toString();
  const response = await apiServices.get<{ data: ToolsResponse }>(
    `${BASE_URL}/tools${qs ? `?${qs}` : ""}`,
  );
  return response.data.data;
}

export async function getToolById(id: number): Promise<
  IShadowAiTool & {
    departments: { department: string; user_count: number }[];
    top_users: { user_email: string; event_count: number }[];
  }
> {
  const response = await apiServices.get<{
    data: IShadowAiTool & {
      departments: { department: string; user_count: number }[];
      top_users: { user_email: string; event_count: number }[];
    };
  }>(`${BASE_URL}/tools/${id}`);
  return response.data.data;
}

export async function updateToolStatus(
  id: number,
  status: ShadowAiToolStatus,
): Promise<IShadowAiTool> {
  const response = await apiServices.patch<{ data: IShadowAiTool }>(
    `${BASE_URL}/tools/${id}/status`,
    { status },
  );
  return response.data.data;
}

export async function startGovernance(
  toolId: number,
  data: ShadowAiGovernanceRequest,
): Promise<ShadowAiGovernanceResult> {
  const response = await apiServices.post<{ data: ShadowAiGovernanceResult }>(
    `${BASE_URL}/tools/${toolId}/start-governance`,
    data,
  );
  return response.data.data;
}

// ============================================================================
// Rules
// ============================================================================

export async function getRules(): Promise<IShadowAiRule[]> {
  const response = await apiServices.get<{ data: IShadowAiRule[] }>(`${BASE_URL}/rules`);
  return response.data.data;
}

export async function createRule(
  rule: Omit<IShadowAiRule, "id" | "created_by" | "created_at" | "updated_at">,
): Promise<IShadowAiRule> {
  const response = await apiServices.post<{ data: IShadowAiRule }>(`${BASE_URL}/rules`, rule);
  return response.data.data;
}

export async function updateRule(id: number, rule: Partial<IShadowAiRule>): Promise<IShadowAiRule> {
  const response = await apiServices.patch<{ data: IShadowAiRule }>(
    `${BASE_URL}/rules/${id}`,
    rule,
  );
  return response.data.data;
}

export async function deleteRule(id: number): Promise<void> {
  await apiServices.delete(`${BASE_URL}/rules/${id}`);
}

export async function getAlertHistory(
  page?: number,
  limit?: number,
): Promise<{ alerts: IShadowAiAlertHistory[]; total: number }> {
  const queryParams = new URLSearchParams();
  if (page) queryParams.append("page", page.toString());
  if (limit) queryParams.append("limit", limit.toString());
  const qs = queryParams.toString();
  const response = await apiServices.get<{
    data: { alerts: IShadowAiAlertHistory[]; total: number };
  }>(`${BASE_URL}/rules/alert-history${qs ? `?${qs}` : ""}`);
  return response.data.data;
}

// ============================================================================
// Config
// ============================================================================

export async function getSyslogConfigs(): Promise<IShadowAiSyslogConfig[]> {
  const response = await apiServices.get<{ data: IShadowAiSyslogConfig[] }>(
    `${BASE_URL}/config/syslog`,
  );
  return response.data.data;
}

export async function createSyslogConfig(
  config: Omit<IShadowAiSyslogConfig, "id" | "created_at">,
): Promise<IShadowAiSyslogConfig> {
  const response = await apiServices.post<{ data: IShadowAiSyslogConfig }>(
    `${BASE_URL}/config/syslog`,
    config,
  );
  return response.data.data;
}

export async function updateSyslogConfig(
  id: number,
  updates: Partial<Pick<IShadowAiSyslogConfig, "source_identifier" | "parser_type" | "is_active">>,
): Promise<IShadowAiSyslogConfig> {
  const response = await apiServices.patch<{ data: IShadowAiSyslogConfig }>(
    `${BASE_URL}/config/syslog/${id}`,
    updates,
  );
  return response.data.data;
}

export async function deleteSyslogConfig(id: number): Promise<void> {
  await apiServices.delete(`${BASE_URL}/config/syslog/${id}`);
}

// ============================================================================
// Settings (Rate Limiting & Data Retention)
// ============================================================================

export async function getSettingsConfig(): Promise<IShadowAiSettings> {
  const response = await apiServices.get<{ data: IShadowAiSettings }>(`${BASE_URL}/settings`);
  return response.data.data;
}

export async function updateSettingsConfig(
  updates: Partial<
    Pick<
      IShadowAiSettings,
      | "rate_limit_max_events_per_hour"
      | "retention_events_days"
      | "retention_daily_rollups_days"
      | "retention_alert_history_days"
    >
  >,
): Promise<IShadowAiSettings> {
  const response = await apiServices.patch<{ data: IShadowAiSettings }>(
    `${BASE_URL}/settings`,
    updates,
  );
  return response.data.data;
}
