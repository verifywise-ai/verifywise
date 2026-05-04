/**
 * Post-Market Monitoring Interfaces
 *
 * Defines the TypeScript interfaces for the Post-Market Monitoring feature,
 * which provides periodic compliance checks for AI use cases with email
 * reminders, escalation, and PDF reports.
 */

// ============================================================================
// Configuration
// ============================================================================

export type FrequencyUnit = "days" | "weeks" | "months";

export interface IPMMConfig {
  id?: number;
  project_id: number;
  is_active: boolean;
  frequency_value: number;
  frequency_unit: FrequencyUnit;
  start_date?: Date | string;
  reminder_days: number;
  escalation_days: number;
  escalation_contact_id?: number;
  notification_hour: number;
  created_by?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface IPMMConfigWithDetails extends IPMMConfig {
  project_title?: string;
  escalation_contact_name?: string;
  escalation_contact_email?: string;
  questions_count?: number;
  active_cycle?: IPMMCycle | null;
}

// ============================================================================
// Questions
// ============================================================================

export type QuestionType = "yes_no" | "multi_select" | "multi_line_text";

export interface IPMMQuestion {
  id?: number;
  config_id?: number | null; // NULL = org-wide global template
  question_text: string;
  question_type: QuestionType;
  options?: string[]; // For multi_select type
  suggestion_text?: string; // Shown when answer is "No"
  is_required: boolean;
  is_system_default: boolean;
  allows_flag_for_concern: boolean;
  display_order: number;
  eu_ai_act_article?: string;
  created_at?: Date;
}

export interface IPMMQuestionCreate {
  config_id?: number | null;
  question_text: string;
  question_type: QuestionType;
  options?: string[];
  suggestion_text?: string;
  is_required?: boolean;
  allows_flag_for_concern?: boolean;
  display_order?: number;
  eu_ai_act_article?: string;
}

export interface IPMMQuestionUpdate {
  question_text?: string;
  question_type?: QuestionType;
  options?: string[];
  suggestion_text?: string;
  is_required?: boolean;
  allows_flag_for_concern?: boolean;
  display_order?: number;
  eu_ai_act_article?: string;
}

// ============================================================================
// Cycles
// ============================================================================

export type CycleStatus = "pending" | "in_progress" | "completed" | "escalated";

export interface IPMMCycle {
  id?: number;
  config_id: number;
  cycle_number: number;
  status: CycleStatus;
  started_at: Date;
  due_at: Date;
  reminder_sent_at?: Date;
  escalation_sent_at?: Date;
  completed_at?: Date;
  completed_by?: number;
  assigned_stakeholder_id?: number;
  created_at?: Date;
}

export interface IPMMCycleWithDetails extends IPMMCycle {
  project_id?: number;
  project_title?: string;
  stakeholder_name?: string;
  stakeholder_email?: string;
  completed_by_name?: string;
  has_flagged_concerns?: boolean;
  responses_count?: number;
  questions_count?: number;
}

// ============================================================================
// Responses
// ============================================================================

export interface IPMMResponse {
  id?: number;
  cycle_id: number;
  question_id: number;
  response_value: any; // boolean for yes_no, string[] for multi_select, string for text
  is_flagged: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface IPMMResponseWithQuestion extends IPMMResponse {
  question_text: string;
  question_type: QuestionType;
  suggestion_text?: string;
  eu_ai_act_article?: string;
}

export interface IPMMResponseSave {
  question_id: number;
  response_value: any;
  is_flagged?: boolean;
}

// ============================================================================
// Reports
// ============================================================================

export interface IPMMReport {
  id?: number;
  cycle_id: number;
  file_id?: number;
  context_snapshot: IPMMContextSnapshot;
  generated_at?: Date;
  generated_by?: number;
}

export interface IPMMReportWithDetails extends IPMMReport {
  project_id?: number;
  project_title?: string;
  cycle_number?: number;
  completed_at?: Date;
  completed_by_name?: string;
  has_flagged_concerns?: boolean;
  file_name?: string;
}

// ============================================================================
// Context Snapshot (captured at report generation time)
// ============================================================================

export interface IPMMContextSnapshot {
  use_case_title: string;
  use_case_status: string;
  risks_count: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  models_count: number;
  model_risks_count: number;
  vendors_count: number;
  vendor_risks_count: number;
  captured_at: Date;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface IPMMConfigCreateRequest {
  project_id: number;
  frequency_value?: number;
  frequency_unit?: FrequencyUnit;
  start_date?: string;
  reminder_days?: number;
  escalation_days?: number;
  escalation_contact_id?: number;
  notification_hour?: number;
}

export interface IPMMConfigUpdateRequest {
  is_active?: boolean;
  frequency_value?: number;
  frequency_unit?: FrequencyUnit;
  start_date?: string;
  reminder_days?: number;
  escalation_days?: number;
  escalation_contact_id?: number;
  notification_hour?: number;
}

export interface IPMMCycleSubmitRequest {
  responses: IPMMResponseSave[];
}

export interface IPMMReportsFilterRequest {
  project_id?: number;
  start_date?: string;
  end_date?: string;
  completed_by?: number;
  flagged_only?: boolean;
  page?: number;
  limit?: number;
}

// ============================================================================
// Email Notification Types
// ============================================================================

export interface IPMMNotificationData {
  stakeholder_name: string;
  stakeholder_email: string;
  use_case_title: string;
  use_case_id: number;
  cycle_number: number;
  due_date: string;
  days_remaining: number;
  monitoring_link: string;
  organization_name: string;
}

export interface IPMMEscalationData extends IPMMNotificationData {
  escalation_contact_name: string;
  escalation_contact_email: string;
  days_overdue: number;
}

export interface IPMMFlaggedConcernData {
  stakeholder_name: string;
  use_case_title: string;
  cycle_number: number;
  flagged_questions: Array<{
    question_text: string;
    response: string;
  }>;
  recipients: Array<{
    name: string;
    email: string;
  }>;
}

// ============================================================================
// PDF Report Types
// ============================================================================

export interface IPMMReportData {
  metadata: {
    organization_name: string;
    organization_logo?: string;
    use_case_title: string;
    use_case_id: string;
    cycle_number: number;
    completed_at: Date;
    completed_by: string;
    eu_ai_act_articles: string[];
  };
  context: IPMMContextSnapshot;
  responses: Array<{
    question: string;
    question_type: QuestionType;
    response: any;
    is_flagged: boolean;
    suggestion_text?: string;
    eu_ai_act_article?: string;
  }>;
  branding: {
    primary_color?: string;
    secondary_color?: string;
  };
}
