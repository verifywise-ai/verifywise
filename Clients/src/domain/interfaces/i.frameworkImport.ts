/**
 * Framework import DTOs (#5254) — exchanged with the
 * /api/v1/framework-import endpoints.
 */

export interface FrameworkImportRow {
  framework_name?: string;
  framework_description?: string;
  topic_number?: string | number;
  topic_name?: string;
  topic_description?: string;
  subtopic_number?: string | number;
  subtopic_name?: string;
  subtopic_description?: string;
  /** The row's line number in the sheet, so server errors match Excel even when blank rows are skipped. */
  row_number?: number;
}

export interface FrameworkImportError {
  row: number;
  field: string;
  message: string;
}

export interface FrameworkImportResult {
  success: boolean;
  imported_framework_id?: number;
  imported_topics: number;
  imported_subtopics: number;
  failed: number;
  errors: FrameworkImportError[];
  importedAt: string;
  /**
   * Topics plus subtopics added, updated, retired (gone from the file but kept
   * because they hold assessment data) and removed by this upload (#5254).
   * A first import only has `added`.
   */
  added?: number;
  updated?: number;
  retired?: number;
  removed?: number;
}

export interface ImportedSubtopic {
  id: number;
  subtopic_number: string;
  name: string;
  description: string | null;
  order_no: number;
}

export interface ImportedTopic {
  id: number;
  topic_number: string;
  name: string;
  description: string | null;
  order_no: number;
  subtopics: ImportedSubtopic[];
}

export interface ImportedFramework {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  topics: ImportedTopic[];
}

export interface ImportedFrameworkPatch {
  name?: string;
  description?: string | null;
  is_active?: boolean;
}
