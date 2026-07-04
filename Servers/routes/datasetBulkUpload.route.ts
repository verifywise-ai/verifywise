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
 * - Requires "dataset-bulk-upload" plugin to be installed
 * - Upload restricted to Admin and Editor roles
 */

import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import { requirePlugin } from "../middleware/pluginGuard.middleware";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { uploadDatasetFile } from "../controllers/datasetBulkUpload.ctrl";

const router = express.Router();

// Auth first so req.organizationId is available before the plugin guard runs
router.use(authenticateJWT);
router.use(requirePlugin("dataset-bulk-upload"));

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

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
  fileFilter,
});

/**
 * Multer error handling middleware
 */
const handleMulterError = (err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(413)
        .json(STATUS_CODE[413]("File size exceeds maximum allowed size of 30MB"));
    }
    return res.status(400).json(STATUS_CODE[400](err.message));
  }

  if (err && err.message === "UNSUPPORTED_FILE_TYPE") {
    return res
      .status(415)
      .json(STATUS_CODE[415]("Unsupported file type. Allowed types: CSV, XLS, XLSX"));
  }

  return next(err);
};

/**
 * @route   POST /dataset-bulk-upload/upload
 * @desc    Upload one file and create a dataset record with metadata
 * @access  Admin, Editor (plugin must be installed)
 */
router.post(
  "/upload",
  authorize(["Admin", "Editor"]),
  upload.single("file"),
  handleMulterError,
  uploadDatasetFile,
);

export default router;
