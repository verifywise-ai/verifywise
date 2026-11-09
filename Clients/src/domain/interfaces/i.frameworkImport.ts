/**
 * Framework import DTOs (#5254) — exchanged with the
 * /api/extensions/framework-import endpoints.
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
