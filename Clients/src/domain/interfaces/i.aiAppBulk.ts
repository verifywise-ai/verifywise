/** AI apps bulk import and bulk assessment (#5258). */

import type { LifecycleStage } from "../enums/lifecycleStage.enum";
import type { AiAppStatus } from "../enums/aiApp.enum";

export interface IAiAppIdsFilters {
  status?: AiAppStatus;
  lifecycleStage?: LifecycleStage;
  search?: string;
}

/** `ids` holds at most 1000 entries; `total` counts every match. */
export interface IAiAppIdsResponse {
  ids: number[];
  total: number;
}

export interface IAiAppRowError {
  row: number;
  field: string;
  message: string;
}

export interface IAiAppImportRow {
  row_number: number;
  name: string;
  description: string;
  vendor: string;
  owner_email: string;
  status: string;
  departments: string;
  required_training: string;
}

export interface IAiAppImportPayload {
  rows: IAiAppImportRow[];
  dry_run: boolean;
}

export interface IAiAppImportSkippedRow {
  row: number;
  name: string;
  reason: string;
}

export interface IAiAppImportResult {
  dry_run: boolean;
  total: number;
  created: number;
  to_create: number;
  skipped: IAiAppImportSkippedRow[];
  new_vendors: string[];
  errors: IAiAppRowError[];
}

export interface IAiAppQuestion {
  key: string;
  label: string;
  description?: string | null;
  weight: number;
}

export interface IAiAppQuestionnaire {
  id: number;
  name: string;
  description?: string | null;
  questions: IAiAppQuestion[];
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

/** The server assigns question keys on every save. */
export type IAiAppQuestionInput = Omit<IAiAppQuestion, "key">;

export interface IAiAppQuestionnairePayload {
  name: string;
  description?: string;
  questions: IAiAppQuestionInput[];
}

export interface IAiAppBulkAssessPayload {
  app_ids: number[];
  questionnaire_id: number;
  notify_owners: boolean;
}

export interface IAiAppBulkAssessResult {
  created: number;
  already_open: number;
  not_found: number;
  /** Created assessments whose app has no owner, so an editor has to answer them. */
  unassigned: number;
  owners_notified: number;
}

export type AiAppAssessmentStatus = "pending" | "completed";

export interface IAiAppAssessment {
  id: number;
  ai_app_id: number;
  ai_app_name?: string | null;
  owner_id?: number | null;
  owner_name?: string | null;
  /** True for an editor, or for the owner of the app. */
  can_answer?: boolean;
  questionnaire_id: number | null;
  /** Null until completion on the record itself; a list may join the current name. */
  questionnaire_name?: string | null;
  status: AiAppAssessmentStatus;
  /** Copied from the questionnaire on completion. */
  questions?: IAiAppQuestion[] | null;
  answers?: Record<string, number> | null;
  risk_score?: number | null;
  assessed_by?: number | null;
  assessed_by_name?: string | null;
  assessed_at?: string | null;
  created_at?: string;
}

export interface IAiAppAssessmentFilters {
  status?: AiAppAssessmentStatus;
  questionnaireId?: number;
  search?: string;
  assignedToMe?: boolean;
  page?: number;
  limit?: number;
}

export interface IAiAppAssessmentListResponse {
  assessments: IAiAppAssessment[];
  total: number;
}

export interface IAiAppAnswersRow {
  row_number: number;
  assessment_id: number;
  /** A value the server cannot read as 1 to 5 is sent as written, so it reports the row. */
  answers: Record<string, number | string>;
}

export interface IAiAppAnswersUploadPayload {
  questionnaire_id: number;
  rows: IAiAppAnswersRow[];
}

export interface IAiAppAnswersUploadResult {
  completed: number;
  left_blank: number;
  already_completed: number;
  errors: IAiAppRowError[];
}
