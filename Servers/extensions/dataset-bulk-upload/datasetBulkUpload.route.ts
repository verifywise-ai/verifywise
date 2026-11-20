/**
 * @fileoverview Dataset Bulk Upload Routes
 *
 * Plugin route for uploading multiple CSV/XLSX files and auto-creating
 * governance dataset records. Each file is uploaded one-at-a-time to
 * allow per-file progress tracking on the client.
 *
 * Routes:
 * - POST /dataset-bulk-upload/upload - Upload one file + create one dataset record
 *
 * Access Control:
 * - Requires JWT authentication
 * - Requires "dataset-bulk-upload" extension to be enabled for the caller org
 * - Upload restricted to Admin and Editor roles
 */

import express from "express";
import multer from "multer";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";
import {
  createUploadErrorHandler,
  SPREADSHEET_UNSUPPORTED_MESSAGE,
} from "../../utils/upload.utils";
import { uploadDatasetFile } from "./datasetBulkUpload.ctrl";

const router = express.Router();

// Auth first so req.organizationId is populated before the enable gate runs.
router.use(authenticateJWT);
router.use(requireExtensionEnabled("dataset-bulk-upload"));

// Configure multer for memory storage (files stored in DB as BYTEA)
const storage = multer.memoryStorage();

const DATASET_MIME_TYPES: Record<string, string[]> = {
  "text/csv": [".csv"],
  "application/vnd.ms-excel": [".xls", ".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf("."));
  const allowedExts = DATASET_MIME_TYPES[file.mimetype];

  if (allowedExts && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("UNSUPPORTED_FILE_TYPE"));
  }
};

const DATASET_MAX_BYTES = 30 * 1024 * 1024; // 30MB

const upload = multer({
  storage,
  limits: { fileSize: DATASET_MAX_BYTES },
  fileFilter,
});

const handleMulterError = createUploadErrorHandler(
  DATASET_MAX_BYTES,
  SPREADSHEET_UNSUPPORTED_MESSAGE,
);

/**
 * @route   POST /dataset-bulk-upload/upload
 * @desc    Upload one file and create a dataset record with metadata
 * @access  Admin, Editor (plugin must be installed)
 */
router.post(
  "/upload",
  authorize("ext.datasetBulkUpload.edit"),
  upload.single("file"),
  handleMulterError,
  uploadDatasetFile,
);

export default router;
