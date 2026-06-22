/**
 * @fileoverview File Manager Routes
 *
 * Defines HTTP routes for file manager operations.
 * These routes handle organization-level files (files without project association).
 *
 * Note: All file manager operations now use the unified 'files' table
 * with project_id = NULL to distinguish org-level files from project files.
 *
 * Routes:
 * - POST   /file-manager       - Upload file (Admin, Reviewer, Editor only)
 * - GET    /file-manager       - List all files (All authenticated users)
 * - GET    /file-manager/:id   - Download file (Admin only)
 * - DELETE /file-manager/:id   - Delete file (Admin, Reviewer, Editor only)
 *
 * Access Control:
 * - All routes require JWT authentication
 * - Upload/Delete restricted to Admin, Reviewer, Editor (enforced by authorize middleware)
 * - Download restricted to Admin only
 * - Preview and List available to all authenticated users
 *
 * @module routes/fileManager
 */

import express, { Request, Response, NextFunction } from "express";
import {
  uploadFile,
  listFiles,
  searchFiles,
  downloadFile,
  removeFile,
  getFileMetadata,
  updateMetadata,
  listFilesWithMetadata,
  previewFile,
  getFileVersionHistory,
} from "../controllers/fileManager.ctrl";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import { fileOperationsLimiter } from "../middleware/rateLimit.middleware";
import {
  validateFileIdParam,
  validateFileSearchQuery,
  validatePaginationQuery,
  validateUpdateFileMetadata,
} from "../middleware/validators/fileManager.validator";
import multer from "multer";
import { STATUS_CODE } from "../utils/statusCode.utils";
import * as path from "path";
import { ALLOWED_MIME_TYPES } from "../utils/validations/fileManagerValidation.utils";

const router = express.Router();

// Configure multer for file uploads with memory storage
// Files are stored in database, so we don't need disk storage
const storage = multer.memoryStorage();

// File filter to validate file types
const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const mimetype = file.mimetype;
  const ext = path.extname(file.originalname).toLowerCase();

  // Check if MIME type is allowed
  const allowedExts = ALLOWED_MIME_TYPES[mimetype as keyof typeof ALLOWED_MIME_TYPES];

  if (allowedExts && Array.isArray(allowedExts) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("UNSUPPORTED_FILE_TYPE"));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 30 * 1024 * 1024, // 30MB
  },
  fileFilter: fileFilter,
});

/**
 * Multer error handling middleware
 * Catches file size limit errors and file type rejection errors
 * Note: No temp file cleanup needed with memory storage
 */
const handleMulterError = (err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(413)
        .json(STATUS_CODE[413]("File size exceeds maximum allowed size of 30MB"));
    }
    // Other multer errors
    return res.status(400).json(STATUS_CODE[400](err.message));
  }

  // Handle unsupported file type error
  if (err && err.message === "UNSUPPORTED_FILE_TYPE") {
    return res
      .status(415)
      .json(
        STATUS_CODE[415](
          "Unsupported file type. Allowed types: Documents (PDF, DOC, DOCX, XLS, XLSX, CSV, MD), Images (JPEG, PNG, GIF, WEBP, SVG, BMP, TIFF), Videos (MP4, MPEG, MOV, AVI, WMV, WEBM, MKV)",
        ),
      );
  }

  // Pass to next error handler if not a recognized error
  return next(err);
};

/**
 * @route   POST /file-manager
 * @desc    Upload a file to file manager
 * @access  Admin, Reviewer, Editor only
 * @body    file (multipart/form-data)
 * @returns {201} File uploaded successfully with metadata
 * @returns {400} Invalid file or validation error
 * @returns {403} Access denied (unauthorized role)
 * @returns {413} File size exceeds maximum allowed size
 * @returns {415} Unsupported file type
 * @returns {500} Server error
 */
router.post(
  "/",
  fileOperationsLimiter,
  authenticateJWT,
  authorize(["Admin", "Reviewer", "Editor"]),
  upload.single("file"),
  handleMulterError,
  uploadFile,
);

/**
 * @route   GET /file-manager
 * @desc    Get list of all files in organization
 * @access  All authenticated users
 * @query   page - Page number (optional)
 * @query   pageSize - Items per page (optional)
 * @returns {200} List of files with metadata and pagination
 * @returns {429} Too many requests - rate limit exceeded
 * @returns {500} Server error
 */
router.get("/", fileOperationsLimiter, authenticateJWT, validatePaginationQuery, listFiles);

/**
 * @route   GET /file-manager/search
 * @desc    Full-text search over file contents (organization-level files)
 * @access  All authenticated users
 * @query   q - Search query (required)
 * @query   page - Page number (optional, default 1)
 * @query   pageSize - Items per page (optional, default 20)
 * @returns {200} List of matching files with snippets and pagination
 * @returns {400} Validation error
 * @returns {500} Server error
 */
router.get("/search", fileOperationsLimiter, authenticateJWT, validateFileSearchQuery, searchFiles);

/**
 * @route   GET /file-manager/with-metadata
 * @desc    Get list of all files with full metadata (tags, status, version, attention flags)
 * @access  All authenticated users
 * @query   page - Page number (optional)
 * @query   pageSize - Items per page (optional)
 * @query   daysUntilExpiry - Threshold for is_due_for_update flag (default 30, 1-365)
 * @query   recentDays - Threshold for is_recently_modified flag (default 7, 1-365)
 * @returns {200} List of files with metadata, attention flags, and pagination
 * @returns {500} Server error
 */
router.get(
  "/with-metadata",
  fileOperationsLimiter,
  authenticateJWT,
  validatePaginationQuery,
  listFilesWithMetadata,
);

/**
 * @route   GET /file-manager/:id
 * @desc    Download a file by ID
 * @access  All authenticated users
 * @param   id - File ID
 * @returns {200} File content with download headers
 * @returns {403} Access denied (unauthorized role or file from different organization)
 * @returns {404} File not found
 * @returns {500} Server error
 */
router.get("/:id", fileOperationsLimiter, authenticateJWT, validateFileIdParam, downloadFile);

/**
 * @route   GET /file-manager/:id/metadata
 * @desc    Get file metadata (tags, status, version, expiry, description)
 * @access  All authenticated users
 * @param   id - File ID
 * @returns {200} File metadata
 * @returns {403} Access denied
 * @returns {404} File not found
 * @returns {500} Server error
 */
router.get(
  "/:id/metadata",
  fileOperationsLimiter,
  authenticateJWT,
  validateFileIdParam,
  getFileMetadata,
);

/**
 * @route   GET /file-manager/:id/versions
 * @desc    Get version history for a file (all files in the same group)
 * @access  All authenticated users
 * @param   id - File ID
 * @returns {200} List of file versions
 * @returns {404} File not found
 * @returns {500} Server error
 */
router.get(
  "/:id/versions",
  fileOperationsLimiter,
  authenticateJWT,
  validateFileIdParam,
  getFileVersionHistory,
);

/**
 * @route   PATCH /file-manager/:id/metadata
 * @desc    Update file metadata
 * @access  Admin, Reviewer, Editor only
 * @param   id - File ID
 * @body    { tags?: string[], review_status?: string, version?: string, expiry_date?: string, description?: string }
 * @returns {200} Updated file metadata
 * @returns {400} Validation error
 * @returns {403} Access denied
 * @returns {404} File not found
 * @returns {500} Server error
 */
router.patch(
  "/:id/metadata",
  fileOperationsLimiter,
  authenticateJWT,
  authorize(["Admin", "Reviewer", "Editor"]),
  validateUpdateFileMetadata,
  updateMetadata,
);

/**
 * @route   GET /file-manager/:id/preview
 * @desc    Get file content for preview (limited to 5MB)
 * @access  All authenticated users
 * @param   id - File ID
 * @returns {200} File content for inline display
 * @returns {403} Access denied
 * @returns {404} File not found
 * @returns {413} File too large for preview
 * @returns {500} Server error
 */
router.get(
  "/:id/preview",
  fileOperationsLimiter,
  authenticateJWT,
  validateFileIdParam,
  previewFile,
);

/**
 * @route   DELETE /file-manager/:id
 * @desc    Delete a file by ID
 * @access  Admin, Reviewer, Editor only
 * @param   id - File ID
 * @returns {200} File deleted successfully
 * @returns {403} Access denied (unauthorized role or wrong organization)
 * @returns {404} File not found
 * @returns {500} Server error
 */
router.delete(
  "/:id",
  fileOperationsLimiter,
  authenticateJWT,
  authorize(["Admin", "Reviewer", "Editor"]),
  validateFileIdParam,
  removeFile,
);

export default router;
