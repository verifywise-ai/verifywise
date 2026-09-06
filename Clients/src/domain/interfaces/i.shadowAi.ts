// ─── Shadow AI Detection — Client Domain Interfaces ─────────────────

// ─── Tool Status ─────────────────────────────────────────────────────

export type ShadowAiToolStatus =
  | "detected"
  | "under_review"
  | "approved"
  | "restricted"
  | "blocked"
  | "dismissed";

// ─── Tools ───────────────────────────────────────────────────────────

export interface IShadowAiTool {
  id: number;
  name: string;
  vendor?: string;
  domains: string[];
  status: ShadowAiToolStatus;
  risk_score?: number;
  first_detected_at?: string;
  last_seen_at?: string;
  total_users: number;
  total_events: number;
  trains_on_data?: boolean;
  soc2_certified?: boolean;
  gdpr_compliant?: boolean;
  data_residency?: string;
  sso_support?: boolean;
  encryption_at_rest?: boolean;
  model_inventory_id?: number;
  governance_owner_id?: number;
  risk_entry_id?: number;
}

// ─── Rules ───────────────────────────────────────────────────────────

export type ShadowAiTriggerType =
  | "new_tool_detected"
  | "usage_threshold_exceeded"
  | "sensitive_department"
  | "blocked_attempt"
  | "risk_score_exceeded"
  | "new_user_detected";

export type ShadowAiActionType =
  | "send_alert"
  | "create_task"
  | "start_governance_review"
  | "create_risk_entry";

export interface IShadowAiRuleAction {
  type: ShadowAiActionType;
  assign_to?: number;
}

export interface IShadowAiRule {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  trigger_type: ShadowAiTriggerType;
  trigger_config: Record<string, unknown>;
  actions: IShadowAiRuleAction[];
  cooldown_minutes?: number;
  notification_user_ids?: number[];
  created_by: number;
  created_at?: string;
  updated_at?: string;
}

// ─── API Keys ────────────────────────────────────────────────────────

export interface IShadowAiApiKey {
  id: number;
  key_prefix: string;
  label?: string;
  created_by: number;
  last_used_at?: string;
  is_active: boolean;
  created_at?: string;
}

export interface IShadowAiApiKeyCreated extends IShadowAiApiKey {
  key: string; // Full key returned only on creation
}

// ─── Syslog Config ──────────────────────────────────────────────────

export interface IShadowAiSyslogConfig {
  id: number;
  source_identifier: string;
  parser_type: "zscaler" | "netskope" | "squid" | "generic_kv";
  is_active: boolean;
  created_at?: string;
}

// ─── Insights ────────────────────────────────────────────────────────

export interface ShadowAiInsightsSummary {
  unique_apps: number;
  total_ai_users: number;
  highest_risk_tool: { name: string; risk_score: number } | null;
  most_active_department: string | null;
  departments_using_ai: number;
}

export interface ShadowAiToolByEvents {
  tool_name: string;
  event_count: number;
}

export interface ShadowAiToolByUsers {
  tool_name: string;
  user_count: number;
}

export interface ShadowAiUsersByDepartment {
  department: string;
  user_count: number;
}

export interface ShadowAiTrendPoint {
  date: string;
  total_events: number;
  unique_users: number;
  new_tools: number;
}

// ─── User Activity ──────────────────────────────────────────────────

export interface ShadowAiUserActivity {
  user_email: string;
  total_prompts: number;
  risk_score: number;
  department: string;
}

export interface ShadowAiDepartmentActivity {
  department: string;
  users: number;
  total_prompts: number;
  top_tool: string;
  risk_score: number;
}

// ─── Alert History ──────────────────────────────────────────────────

export interface IShadowAiAlertHistory {
  id: number;
  rule_id?: number;
  rule_name?: string;
  trigger_type?: string;
  trigger_data?: Record<string, unknown>;
  actions_taken?: Record<string, unknown>;
  fired_at?: string;
}

// ─── Settings ───────────────────────────────────────────────────────

export interface IShadowAiSettings {
  id: number;
  rate_limit_max_events_per_hour: number;
  retention_events_days: number;
  retention_daily_rollups_days: number;
  retention_alert_history_days: number;
  updated_at?: string;
  updated_by?: number;
}

// ─── Governance Wizard ──────────────────────────────────────────────

export interface ShadowAiGovernanceRequest {
  model_inventory: {
    provider: string;
    model: string;
    version?: string;
    status?: string;
  };
  governance_owner_id: number;
  risk_assessment?: {
    data_sensitivity?: string;
    description?: string;
  };
  start_lifecycle?: boolean;
}

export interface ShadowAiGovernanceResult {
  model_inventory_id?: number;
  risk_entry_id?: number;
  lifecycle_started?: boolean;
}
