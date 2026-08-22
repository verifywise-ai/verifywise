/**
 * Shadow AI fixtures.
 *
 * Field names follow `domain/interfaces/i.shadowAi.ts` — what the components
 * type against — not the database columns. Deterministic by design: the suite's
 * other fixtures (vendors, projects, risks, users, files) are hand-written for
 * the same reason, so a failure is reproducible without a seed.
 */

import type {
  IShadowAiApiKey,
  IShadowAiApiKeyCreated,
  IShadowAiSettings,
  IShadowAiSyslogConfig,
  IShadowAiTool,
  ShadowAiDepartmentActivity,
  ShadowAiInsightsSummary,
  ShadowAiToolByEvents,
  ShadowAiToolByUsers,
  ShadowAiUserActivity,
  ShadowAiUsersByDepartment,
} from "../../../domain/interfaces/i.shadowAi";

// ─── API keys ────────────────────────────────────────────────────────

export function createMockShadowAiApiKey(overrides: Partial<IShadowAiApiKey> = {}) {
  return {
    id: 1,
    key_prefix: "sk_live_abc",
    label: "Zscaler proxy",
    created_by: 1,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    last_used_at: "2026-01-15T00:00:00Z",
    ...overrides,
  } satisfies IShadowAiApiKey;
}

export const mockShadowAiApiKeys: IShadowAiApiKey[] = [
  createMockShadowAiApiKey(),
  createMockShadowAiApiKey({
    id: 2,
    key_prefix: "sk_live_xyz",
    label: "Netskope proxy",
    is_active: false,
    last_used_at: undefined,
  }),
];

/** The full key is returned only on creation. */
export const mockShadowAiApiKeyCreated: IShadowAiApiKeyCreated = {
  ...createMockShadowAiApiKey({ id: 3, key_prefix: "sk_live_new", label: "New key" }),
  key: "sk_live_new_full_secret_value",
};

// ─── Tools ───────────────────────────────────────────────────────────

export function createMockShadowAiTool(overrides: Partial<IShadowAiTool> = {}) {
  return {
    id: 1,
    name: "ChatGPT",
    vendor: "OpenAI",
    domains: ["chat.openai.com"],
    status: "detected",
    risk_score: 72,
    first_detected_at: "2026-01-04T09:00:00Z",
    last_seen_at: "2026-02-10T16:30:00Z",
    total_users: 48,
    total_events: 1290,
    trains_on_data: true,
    soc2_certified: true,
    gdpr_compliant: true,
    data_residency: "US",
    sso_support: true,
    encryption_at_rest: true,
    ...overrides,
  } satisfies IShadowAiTool;
}

export const mockShadowAiTools: IShadowAiTool[] = [
  createMockShadowAiTool(),
  createMockShadowAiTool({
    id: 2,
    name: "Claude",
    vendor: "Anthropic",
    domains: ["claude.ai"],
    status: "approved",
    risk_score: 31,
    total_users: 22,
    total_events: 540,
    trains_on_data: false,
  }),
];

export function mockToolsResponse(tools: IShadowAiTool[] = mockShadowAiTools) {
  return { tools, total: tools.length, page: 1, limit: 20 };
}

// ─── Insights ────────────────────────────────────────────────────────

export const mockInsightsSummary: ShadowAiInsightsSummary = {
  unique_apps: 12,
  total_ai_users: 70,
  highest_risk_tool: { name: "ChatGPT", risk_score: 72 },
  most_active_department: "Engineering",
  departments_using_ai: 5,
};

export const mockToolsByEvents: ShadowAiToolByEvents[] = [
  { tool_name: "ChatGPT", event_count: 1290 },
  { tool_name: "Claude", event_count: 540 },
];

export const mockToolsByUsers: ShadowAiToolByUsers[] = [
  { tool_name: "ChatGPT", user_count: 48 },
  { tool_name: "Claude", user_count: 22 },
];

export const mockUsersByDepartment: ShadowAiUsersByDepartment[] = [
  { department: "Engineering", user_count: 40 },
  { department: "Marketing", user_count: 18 },
];

// ─── User / department activity ──────────────────────────────────────

export const mockShadowAiUsers: ShadowAiUserActivity[] = [
  { user_email: "ada@example.com", total_prompts: 210, risk_score: 64, department: "Engineering" },
  { user_email: "grace@example.com", total_prompts: 88, risk_score: 22, department: "Marketing" },
];

export function mockUsersResponse(users: ShadowAiUserActivity[] = mockShadowAiUsers) {
  return { users, total: users.length, page: 1, limit: 20 };
}

export const mockDepartmentActivity: ShadowAiDepartmentActivity[] = [
  {
    department: "Engineering",
    users: 40,
    total_prompts: 980,
    top_tool: "ChatGPT",
    risk_score: 61,
  },
  { department: "Marketing", users: 18, total_prompts: 240, top_tool: "Claude", risk_score: 25 },
];

// ─── Syslog config and settings ──────────────────────────────────────

export function createMockSyslogConfig(overrides: Partial<IShadowAiSyslogConfig> = {}) {
  return {
    id: 1,
    source_identifier: "proxy-01.corp.com",
    parser_type: "zscaler",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } satisfies IShadowAiSyslogConfig;
}

export const mockSyslogConfigs: IShadowAiSyslogConfig[] = [
  createMockSyslogConfig(),
  createMockSyslogConfig({
    id: 2,
    source_identifier: "proxy-02.corp.com",
    parser_type: "netskope",
    is_active: false,
  }),
];

export const mockShadowAiSettings: IShadowAiSettings = {
  id: 1,
  rate_limit_max_events_per_hour: 500,
  retention_events_days: 30,
  retention_daily_rollups_days: 365,
  retention_alert_history_days: 90,
  updated_at: "2026-02-01T00:00:00Z",
  updated_by: 1,
};

// ─── Rules and alert history ─────────────────────────────────────────
// Shaped from RulesPage usage rather than a single exported interface.

export const mockShadowAiRules = [
  {
    id: 1,
    name: "High-risk tool detected",
    trigger_type: "new_tool",
    is_active: true,
    created_at: "2026-01-10T00:00:00Z",
  },
  {
    id: 2,
    name: "Unusual prompt volume",
    trigger_type: "threshold",
    is_active: false,
    created_at: "2026-01-20T00:00:00Z",
  },
];

export const mockAlertHistory = [
  {
    id: 1,
    rule_id: 1,
    rule_name: "High-risk tool detected",
    trigger_type: "new_tool",
    fired_at: "2026-02-11T10:00:00Z",
  },
];
