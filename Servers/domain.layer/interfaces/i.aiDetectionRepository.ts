/**
 * @fileoverview AI Detection Repository Interface Definitions
 *
 * Type definitions for the AI Detection Repository Registry feature,
 * which allows users to register repositories for monitoring and
 * configure scheduled/recurring scans.
 *
 * @module domain.layer/interfaces/i.aiDetectionRepository
 */

// ============================================================================
// Schedule Types
// ============================================================================

export type ScheduleFrequency = "daily" | "weekly" | "monthly";

// ============================================================================
// Trigger Types
// ============================================================================

export type TriggerType = "manual" | "scheduled" | "webhook";

// ============================================================================
// Repository Record
// ============================================================================

export interface IAIDetectionRepository {
  id?: number;
  repository_url: string;
  repository_owner: string;
  repository_name: string;
  display_name?: string | null;
  default_branch: string;
  github_token_id?: number | null;

  // Schedule fields
  schedule_enabled: boolean;
  schedule_frequency?: ScheduleFrequency | null;
  schedule_day_of_week?: number | null;
  schedule_day_of_month?: number | null;
  schedule_hour: number;
  schedule_minute: number;

  // CI/CD webhook fields
  webhook_secret?: string | null;
  ci_enabled: boolean;
  ci_min_score: number;
  ci_max_critical: number;
  ci_post_comments: boolean;
  ci_status_checks: boolean;

  // Denormalized tracking
  last_scan_id?: number | null;
  last_scan_status?: string | null;
  last_scan_at?: Date | null;
  next_scan_at?: Date | null;

  is_enabled: boolean;
  created_by: number;
  created_at?: Date;
  updated_at?: Date;
}

// ============================================================================
// Input Types
// ============================================================================

export interface ICreateRepositoryInput {
  repository_url: string;
  repository_owner: string;
  repository_name: string;
  display_name?: string | null;
  default_branch?: string;
  github_token_id?: number | null;

  schedule_enabled?: boolean;
  schedule_frequency?: ScheduleFrequency | null;
  schedule_day_of_week?: number | null;
  schedule_day_of_month?: number | null;
  schedule_hour?: number;
  schedule_minute?: number;

  // CI/CD webhook fields
  ci_enabled?: boolean;
  ci_min_score?: number;
  ci_max_critical?: number;
  ci_post_comments?: boolean;
  ci_status_checks?: boolean;

  created_by: number;
}

export interface IUpdateRepositoryInput {
  display_name?: string | null;
  default_branch?: string;
  github_token_id?: number | null;

  schedule_enabled?: boolean;
  schedule_frequency?: ScheduleFrequency | null;
  schedule_day_of_week?: number | null;
  schedule_day_of_month?: number | null;
  schedule_hour?: number;
  schedule_minute?: number;

  // CI/CD webhook fields
  ci_enabled?: boolean;
  ci_min_score?: number;
  ci_max_critical?: number;
  ci_post_comments?: boolean;
  ci_status_checks?: boolean;

  is_enabled?: boolean;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface IRepositoryListResponse {
  repositories: IAIDetectionRepository[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
