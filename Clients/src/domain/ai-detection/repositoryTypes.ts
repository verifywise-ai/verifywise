/**
 * @fileoverview AI Detection Repository Type Definitions
 *
 * Frontend types for the repository registry and scheduled scans feature.
 *
 * @module domain/ai-detection/repositoryTypes
 */

export type ScheduleFrequency = "daily" | "weekly" | "monthly";

export interface AIDetectionRepository {
  id: number;
  repository_url: string;
  repository_owner: string;
  repository_name: string;
  display_name?: string | null;
  default_branch: string;
  github_token_id?: number | null;

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
  /** When GitHub last delivered a webhook for this repository */
  last_webhook_at?: string | null;
  last_webhook_status?: WebhookDeliveryStatus | null;

  last_scan_id?: number | null;
  last_scan_status?: string | null;
  last_scan_at?: string | null;
  next_scan_at?: string | null;

  is_enabled: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface CreateRepositoryInput {
  repository_url: string;
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
}

export interface UpdateRepositoryInput {
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

export interface RepositoriesResponse {
  repositories: AIDetectionRepository[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

/** Outcome of the most recent GitHub webhook delivery */
export type WebhookDeliveryStatus = "ok" | "invalid_signature" | "secret_missing" | "error";

/** Where GitHub should send webhooks, from the deployment's public address */
export interface WebhookConfig {
  /** Null when the deployment has no public address configured */
  webhook_url: string | null;
  /** False when the address is missing or not reachable from the internet */
  is_public: boolean;
}
