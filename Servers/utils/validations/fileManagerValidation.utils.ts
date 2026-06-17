/**
 * @fileoverview File Manager Validation Utilities
 *
 * Provides validation functions for file manager operations including:
 * - File type validation
 * - File size validation
 * - Filename sanitization
 * - Access control validation
 *
 * Supported File Types:
 * - Documents: PDF, DOC, DOCX, XLS, XLSX, CSV, MD
 * - Images: All common formats
 * - Videos: All common formats
 *
 * Constraints:
 * - Max file size: 30MB
 *
 * @module utils/validations/fileManagerValidation
 */

import * as path from "path";

export const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB in bytes

/**
 * Allowed MIME types for file uploads
 */
export const ALLOWED_MIME_TYPES = {
  // Documents
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"],
  "text/markdown": [".md"],

  // Images
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/svg+xml": [".svg"],
  "image/bmp": [".bmp"],
  "image/tiff": [".tiff", ".tif"],

  // Videos
  "video/mp4": [".mp4"],
  "video/mpeg": [".mpeg", ".mpg"],
  "video/quicktime": [".mov"],
  "video/x-msvideo": [".avi"],
  "video/x-ms-wmv": [".wmv"],
  "video/webm": [".webm"],
  "video/x-matroska": [".mkv"],
};

/**
 * Validates file type against allowed MIME types
 *
 * @param {string} mimetype - MIME type of the file
 * @param {string} filename - Original filename
 * @returns {boolean} True if file type is allowed
 */
export const validateFileType = (mimetype: string, filename: string): boolean => {
  // Extract and normalize file extension
  const ext = path.extname(filename).toLowerCase();

  // Early return if no extension
  if (!ext) {
    return false;
  }

  // Get allowed extensions for this MIME type
  const allowedExts = ALLOWED_MIME_TYPES[mimetype as keyof typeof ALLOWED_MIME_TYPES];

  // Early return if MIME type is not in allowed list
  if (!allowedExts) {
    return false;
  }

  // Ensure allowedExts is an array before calling includes
  return Array.isArray(allowedExts) && allowedExts.includes(ext);
};

/**
 * Validates file size against maximum allowed size
 *
 * @param {number} size - File size in bytes
 * @returns {boolean} True if file size is within limit
 */
export const validateFileSize = (size: number): boolean => {
  return size > 0 && size <= MAX_FILE_SIZE;
};

/**
 * Sanitizes filename to prevent security issues
 * Removes special characters and replaces spaces
 *
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
export const sanitizeFilename = (filename: string): string => {
  // Get file extension
  const lastDotIndex = filename.lastIndexOf(".");
  const name = lastDotIndex !== -1 ? filename.substring(0, lastDotIndex) : filename;
  const extension = lastDotIndex !== -1 ? filename.substring(lastDotIndex) : "";

  // Sanitize name: replace spaces and remove special characters
  const sanitizedName = name
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/[^a-zA-Z0-9-_]/g, "") // Remove special characters
    .substring(0, 200); // Limit length

  return sanitizedName + extension.toLowerCase();
};

/**
 * Checks if user role can upload files
 * All roles except Auditor can upload
 *
 * @param {string} role - User role name
 * @returns {boolean} True if user can upload files
 */
export const canUploadFiles = (role: string): boolean => {
  const restrictedRoles = ["Auditor"];
  return !restrictedRoles.includes(role);
};

/**
 * Validates complete file upload request
 *
 * @param {Express.Multer.File} file - Uploaded file object
 * @param {string} [userRole] - User's role name (optional, for backward compatibility)
 * @returns {{ valid: boolean; error?: string }} Validation result
 *
 * Note: Role-based authorization should be handled at the route level via middleware.
 * This function now focuses on file-specific validations (type, size).
 */
export const validateFileUpload = (
  file: Express.Multer.File,
  userRole?: string,
): { valid: boolean; error?: string } => {
  // Check user permissions (only if userRole is provided - for backward compatibility)
  if (userRole !== undefined && !canUploadFiles(userRole)) {
    return {
      valid: false,
      error: "Auditors are not allowed to upload files",
    };
  }

  // Validate file type
  if (!validateFileType(file.mimetype, file.originalname)) {
    return {
      valid: false,
      error: `File type not allowed. Allowed types: Documents (PDF, DOC, DOCX, XLS, XLSX, CSV, MD), Images (all formats), Videos (all formats)`,
    };
  }

  // Validate file size
  if (!validateFileSize(file.size)) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  return { valid: true };
};

/**
 * Formats file size for display
 *
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size (e.g., "1.5 MB")
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

// ---------------------------------------------------------------------------
// Pagination, tag, and metadata helpers (used by fileManager controllers).
// ---------------------------------------------------------------------------

export const PAGINATION_LIMITS = {
  maxPageSize: 100,
  maxPage: 10000,
  defaultPageSize: 20,
};

/**
 * Validate file ID from req.params.id. Returns a safe integer or `null`
 * (and writes a 400 to res) if the input is missing or malformed.
 */
export const parseValidFileId = (raw: string | string[] | undefined): number | null => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export type PaginationResult =
  | { page: number | undefined; pageSize: number | undefined; offset: number | undefined }
  | { error: string };

export const validatePagination = (
  page: number | undefined,
  pageSize: number | undefined,
): PaginationResult => {
  if (page !== undefined) {
    if (!Number.isSafeInteger(page) || page < 1 || page > PAGINATION_LIMITS.maxPage) {
      return {
        error: `Page must be a positive integer between 1 and ${PAGINATION_LIMITS.maxPage}`,
      };
    }
  }
  if (pageSize !== undefined) {
    if (
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > PAGINATION_LIMITS.maxPageSize
    ) {
      return {
        error: `Page size must be a positive integer between 1 and ${PAGINATION_LIMITS.maxPageSize}`,
      };
    }
  }

  const validPage = page && page > 0 ? page : undefined;
  const validPageSize =
    pageSize && pageSize > 0 ? Math.min(pageSize, PAGINATION_LIMITS.maxPageSize) : undefined;
  const offset =
    validPage !== undefined && validPageSize !== undefined
      ? (validPage - 1) * validPageSize
      : undefined;

  return { page: validPage, pageSize: validPageSize, offset };
};

export const validateTags = (tags: unknown): { tags: string[] } | { error: string } => {
  if (!Array.isArray(tags)) return { error: "Tags must be an array" };
  if (tags.length > 50) return { error: "Maximum 50 tags allowed" };

  const validatedTags: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== "string") return { error: "Each tag must be a string" };
    const trimmedTag = tag.trim();
    if (trimmedTag.length === 0) continue;
    if (trimmedTag.length > 100) {
      return { error: "Tag length must not exceed 100 characters" };
    }
    if (!/^[\w\s-]+$/u.test(trimmedTag)) {
      return { error: "Tags can only contain letters, numbers, spaces, hyphens, and underscores" };
    }
    validatedTags.push(trimmedTag);
  }
  return { tags: validatedTags };
};

export const VALID_REVIEW_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "expired",
  "superseded",
] as const;

export type ReviewStatusInput = (typeof VALID_REVIEW_STATUSES)[number];

export interface FileMetadataUpdateInput {
  tags?: unknown;
  review_status?: unknown;
  version?: unknown;
  expiry_date?: unknown;
  description?: unknown;
}

export interface ValidatedMetadataUpdate {
  tags?: string[];
  review_status?: ReviewStatusInput;
  version?: string;
  expiry_date?: string;
  description?: string;
}

/**
 * Validate the payload of PATCH /file-manager/:id/metadata. Returns the
 * normalized update or a single error string for the first failure encountered.
 */
export const validateFileMetadataUpdate = (
  input: FileMetadataUpdateInput,
): { update: ValidatedMetadataUpdate } | { error: string } => {
  const update: ValidatedMetadataUpdate = {};

  if (input.review_status !== undefined) {
    if (!VALID_REVIEW_STATUSES.includes(input.review_status as ReviewStatusInput)) {
      return { error: "Invalid review status" };
    }
    update.review_status = input.review_status as ReviewStatusInput;
  }

  if (input.version !== undefined) {
    if (typeof input.version !== "string" || !/^[0-9]+\.[0-9]+(\.[0-9]+)?$/.test(input.version)) {
      return { error: "Invalid version format. Use X.Y or X.Y.Z" };
    }
    update.version = input.version;
  }

  if (input.tags !== undefined) {
    const tagsResult = validateTags(input.tags);
    if ("error" in tagsResult) return { error: tagsResult.error };
    update.tags = tagsResult.tags;
  }

  if (input.expiry_date !== undefined && input.expiry_date !== null) {
    if (typeof input.expiry_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiry_date)) {
      return { error: "Invalid date format. Use YYYY-MM-DD" };
    }
    const parsedDate = new Date(input.expiry_date);
    if (isNaN(parsedDate.getTime())) return { error: "Invalid date value" };
    update.expiry_date = input.expiry_date;
  } else if (input.expiry_date === null) {
    update.expiry_date = undefined;
  }

  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== "string") {
      return { error: "Description must be a string" };
    }
    if (input.description.length > 2000) {
      return { error: "Description must not exceed 2000 characters" };
    }
    update.description = input.description;
  }

  return { update };
};

/**
 * Parses page / pageSize query parameters that may arrive as string, string[], or undefined.
 * Returns `undefined` when missing — caller decides whether to default.
 */
export const parsePaginationQuery = (
  rawPage: unknown,
  rawPageSize: unknown,
): { page: number | undefined; pageSize: number | undefined } => {
  const coerce = (value: unknown): number | undefined => {
    if (value === undefined || value === null) return undefined;
    const v = Array.isArray(value) ? value[0] : value;
    if (typeof v !== "string" && typeof v !== "number") return undefined;
    const n = Number(v);
    return isNaN(n) ? undefined : n;
  };
  return { page: coerce(rawPage), pageSize: coerce(rawPageSize) };
};
