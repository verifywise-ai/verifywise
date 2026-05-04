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
