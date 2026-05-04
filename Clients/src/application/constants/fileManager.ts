/**
 * @fileoverview File Manager Constants
 *
 * Single source of truth for file upload constraints and allowed file types.
 * These constants should match the server-side validation in:
 * Servers/utils/validations/fileManagerValidation.utils.ts
 *
 * @module constants/fileManager
 */

/**
 * Maximum file size in bytes (30MB)
 */
export const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024;

/**
 * Maximum file size in MB for display
 */
export const MAX_FILE_SIZE_MB = 30;

/**
 * Allowed MIME types for file uploads
 * Must match server-side ALLOWED_MIME_TYPES in:
 * Servers/utils/validations/fileManagerValidation.utils.ts
 */
export const ALLOWED_MIME_TYPES = new Set([
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/markdown",
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
  // Videos
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-ms-wmv",
  "video/webm",
  "video/x-matroska",
]);

/**
 * Allowed file extensions grouped by category
 * This mirrors the server-side ALLOWED_MIME_TYPES configuration
 */
export const ALLOWED_FILE_TYPES = {
  documents: {
    label: "Documents",
    extensions: ["PDF", "DOC", "DOCX", "XLS", "XLSX", "CSV", "MD"],
  },
  images: {
    label: "Images",
    extensions: ["JPEG", "PNG", "GIF", "WEBP", "SVG", "BMP", "TIFF"],
  },
  videos: {
    label: "Videos",
    extensions: ["MP4", "MPEG", "MOV", "AVI", "WMV", "WEBM", "MKV"],
  },
} as const;

/**
 * Generates a human-readable string of supported file types
 * Format: "Documents (PDF, DOC, DOCX), Images (JPEG, PNG), Videos (MP4, MOV)"
 *
 * @returns {string} Formatted string of supported file types
 */
export const getSupportedFileTypesString = (): string => {
  const categories = Object.values(ALLOWED_FILE_TYPES);

  return categories
    .map((category) => `${category.label} (${category.extensions.join(", ")})`)
    .join(", ");
};

/**
 * Pre-generated supported file types string for performance
 * Use this in components to avoid recalculating on every render
 */
export const SUPPORTED_FILE_TYPES_STRING = getSupportedFileTypesString();

/**
 * Validates a file against size and type constraints
 *
 * @param {File} file - The file to validate
 * @returns {{ valid: boolean; error?: string }} Validation result
 */
export const validateFile = (file: File): { valid: boolean; error?: string } => {
  // Check if file exists (defensive check for null/undefined)
  if (!file) {
    return {
      valid: false,
      error: "No file provided",
    };
  }

  // Check if file has a name (defensive check for malformed File object)
  if (!file.name || file.name.trim() === "") {
    return {
      valid: false,
      error: "File name is missing",
    };
  }

  // Check if file is empty (zero bytes)
  if (file.size === 0) {
    return {
      valid: false,
      error: "File is empty",
    };
  }

  // Check file size against maximum allowed
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File too large (max ${MAX_FILE_SIZE_MB}MB)`,
    };
  }

  // Check file type (with defensive check for missing MIME type)
  if (!file.type || !ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      valid: false,
      error: file.type ? "Unsupported file type" : "File type could not be determined",
    };
  }

  return { valid: true };
};
