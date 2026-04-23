/**
 * ISO 42001 Framework Types
 * Defines all interfaces, enums, and types for ISO 42001 AI Management System
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * ISO 42001 Implementation Status
 * Mirrors NIST AI RMF status pattern for consistency
 */
export enum ISO42001Status {
  NOT_STARTED = "Not started",
  DRAFT = "Draft",
  IN_PROGRESS = "In progress",
  AWAITING_REVIEW = "Awaiting review",
  AWAITING_APPROVAL = "Awaiting approval",
  IMPLEMENTED = "Implemented",
  NEEDS_REWORK = "Needs rework",
}

// ============================================================================
// INTERFACES - CORE ENTITIES
// ============================================================================

/**
 * ISO 42001 Clause (Management System Requirements)
 * Examples: 4.1, 4.2, 5.1, etc.
 */
export interface ISO42001Clause {
  id: number;
  clause_no: string; // e.g., "4", "5"
  title: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * ISO 42001 Sub-Clause (Detailed Requirement)
 * Examples: 4.1.1, 4.1.2, etc.
 */
export interface ISO42001SubClause {
  id: number;
  clause_id: number;
  subclause_id?: string; // Canonical subclause label from the struct (e.g. "6.1.1", "6.3")
  index?: number | string; // Display index (e.g., 1, 2, 3)
  title: string;
  summary?: string;
  requirement_summary?: string;
  key_questions?: string[]; // Questions field from backend
  questions?: string[]; // Alternative name for questions
  evidence_examples?: string[];
  status: ISO42001Status;
  implementation_description?: string;
  owner?: number | null;
  reviewer?: number | null;
  approver?: number | null;
  auditor_feedback?: string;
  due_date?: string | null;
  evidence_links?: FileData[] | null;
  risks?: number[];
  created_at?: string;
  updated_at?: string;
  order_no?: number;
}

/**
 * ISO 42001 Annex (Control Categories for AI Management)
 * Container for annex categories
 */
export interface ISO42001Annex {
  id: number;
  title: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * ISO 42001 Annex Category (Individual Control)
 * Examples: A.1, A.2, etc.
 */
export interface ISO42001AnnexCategory {
  id: number;
  annex_id: number;
  control_no?: number;
  control_subSection?: number;
  title: string;
  shortDescription?: string;
  description?: string; // Description from backend
  guidance?: string;
  status: ISO42001Status;
  is_applicable: boolean;
  justification_for_exclusion?: string | null;
  implementation_description?: string;
  owner?: number | null;
  reviewer?: number | null;
  approver?: number | null;
  auditor_feedback?: string;
  due_date?: string | null;
  evidence_links?: FileData[] | null;
  risks?: number[];
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// INTERFACES - SUPPORT ENTITIES
// ============================================================================

/**
 * File/Evidence Data
 * Represents uploaded evidence files
 */
export interface FileData {
  id: string | number;
  fileName: string;
  size?: number;
  type?: string;
  data?: Blob;
  uploadDate?: string;
  uploader?: string;
  source?: string;
}

/**
 * Linked Risk
 * Risk linked to a clause or annex category
 */
export interface LinkedRisk {
  id: number;
  risk_name: string;
  risk_description?: string;
  risk_level?: string;
  mitigation_status?: string;
}

/**
 * Alert/Notification
 * Used for user feedback (success, error, info, warning)
 */
export interface AlertProps {
  variant: "success" | "error" | "warning" | "info";
  body: string;
}

// ============================================================================
// INTERFACES - DRAWER PROPS
// ============================================================================

/**
 * Props for ISO 42001 Clause Drawer Dialog
 */
export interface ISO42001ClauseDrawerProps {
  open: boolean;
  onClose: () => void;
  onSaveSuccess?: (
    success: boolean,
    message?: string,
    savedSubclauseId?: number
  ) => void;
  clause?: ISO42001Clause;
  subclause?: ISO42001SubClause;
  projectFrameworkId: number;
  project_id?: number; // Optional, not required for new tab-based implementation
}

/**
 * Props for ISO 42001 Annex Drawer Dialog
 */
export interface ISO42001AnnexDrawerProps {
  open: boolean;
  onClose: () => void;
  onSaveSuccess?: (
    success: boolean,
    message?: string,
    savedCategoryId?: number
  ) => void;
  annex?: ISO42001Annex;
  category?: ISO42001AnnexCategory;
  projectFrameworkId: number;
  project_id: number;
}

// ============================================================================
// INTERFACES - FORM DATA
// ============================================================================

/**
 * Form data structure for clause/annex updates
 * Mirrors NIST pattern for consistency
 */
export interface ISO42001FormData {
  status: ISO42001Status | string;
  implementation_description: string;
  owner: string; // User ID as string
  reviewer: string; // User ID as string
  approver: string; // User ID as string
  auditor_feedback: string;
  tags?: string[]; // For optional tagging support
  // Annex-specific fields
  is_applicable?: boolean;
  justification_for_exclusion?: string;
}

/**
 * State management structure for file operations
 */
export interface FileState {
  existingFiles: FileData[]; // Files from API
  uploadFiles: FileData[]; // New files to upload
  deletedFileIds: number[]; // File IDs to delete
}

/**
 * State management structure for risk operations
 */
export interface RiskState {
  currentRisks: number[]; // Risk IDs from API
  linkedRiskObjects: LinkedRisk[]; // Full risk objects for display
  selectedRisks: number[]; // New risk IDs to add
  deletedRisks: number[]; // Risk IDs to remove
}

// ============================================================================
// STATUS CONSTANTS
// ============================================================================

/**
 * All available status options
 * Used in status dropdowns throughout the application
 */
export const ISO42001_STATUS_OPTIONS = [
  { id: ISO42001Status.NOT_STARTED, name: "Not started" },
  { id: ISO42001Status.DRAFT, name: "Draft" },
  { id: ISO42001Status.IN_PROGRESS, name: "In progress" },
  { id: ISO42001Status.AWAITING_REVIEW, name: "Awaiting review" },
  { id: ISO42001Status.AWAITING_APPROVAL, name: "Awaiting approval" },
  { id: ISO42001Status.IMPLEMENTED, name: "Implemented" },
  { id: ISO42001Status.NEEDS_REWORK, name: "Needs rework" },
];

/**
 * Accepted file types for evidence upload
 */
export const ACCEPTED_FILE_TYPES =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar";

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Response structure for API calls
 */
export interface ApiResponse<T> {
  status: number;
  message?: string;
  data?: T;
}
