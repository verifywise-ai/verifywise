/**
 * Shared, security-bounded multer factory for in-memory uploads.
 *
 * Security: every memoryStorage() upload MUST declare explicit limits and a
 * file-type filter. An unbounded memoryStorage() config is a memory-exhaustion
 * DoS vector (a large request body is buffered entirely in RAM). Always use
 * this factory instead of calling multer({ storage: multer.memoryStorage() })
 * directly in route files.
 */
const multer = require("multer");
import * as path from "path";
import type { NextFunction, Request, Response } from "express";
import { STATUS_CODE } from "./statusCode.utils";
import { ALLOWED_MIME_TYPES } from "./validations/fileManagerValidation.utils";

export interface MemoryUploadOptions {
  /** Max size per file in bytes. Defaults to 30MB. */
  fileSize?: number;
  /** Max number of files per request. Defaults to 10. */
  files?: number;
}

const DEFAULT_FILE_SIZE = 30 * 1024 * 1024; // 30MB
const DEFAULT_MAX_FILES = 10;

export function createMemoryUpload(options: MemoryUploadOptions = {}) {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: options.fileSize ?? DEFAULT_FILE_SIZE,
      files: options.files ?? DEFAULT_MAX_FILES,
    },
    fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: any) => {
      const allowedExts = ALLOWED_MIME_TYPES[file.mimetype as keyof typeof ALLOWED_MIME_TYPES];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedExts && Array.isArray(allowedExts) && allowedExts.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error("UNSUPPORTED_FILE_TYPE"));
      }
    },
  });
}

/** Unsupported-type messages, one per kind of upload. Default: files the file manager accepts. */
export const DOCUMENT_UNSUPPORTED_MESSAGE =
  "Unsupported file type. Allowed types: Documents (PDF, DOC, DOCX, XLS, XLSX, CSV, MD), Images (JPEG, PNG, GIF, WEBP, SVG, BMP, TIFF), Videos (MP4, MPEG, MOV, AVI, WMV, WEBM, MKV)";
export const IMAGE_ONLY_UNSUPPORTED_MESSAGE = "Unsupported file type. Please upload an image";
export const SPREADSHEET_UNSUPPORTED_MESSAGE =
  "Unsupported file type. Allowed types: CSV, XLS, XLSX";

/** A byte limit as the 413 message shows it: "30MB", "2.5MB", "512KB". */
function formatLimit(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${Number(mb.toFixed(1))}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

/**
 * Express error middleware for multer uploads. Place it right after the upload
 * middleware in the route chain: multer reports a rejected file (unsupported
 * type) or a breached limit through next(err), and without this the request
 * ends in a bare 500.
 *
 * Pass the limit the upload was created with when it is not the default, so the
 * 413 message names the real limit, and an unsupported-type message when the
 * upload accepts other types than the default.
 */
export function createUploadErrorHandler(
  fileSizeBytes: number = DEFAULT_FILE_SIZE,
  unsupportedTypeMessage: string = DOCUMENT_UNSUPPORTED_MESSAGE,
) {
  return (err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      const code = (err as { code?: string }).code;
      if (code === "LIMIT_FILE_SIZE") {
        const limit = formatLimit(fileSizeBytes);
        return res
          .status(413)
          .json(
            STATUS_CODE[413](
              req.t!("File size exceeds maximum allowed size of {limit}", { limit }),
            ),
          );
      }
      if (code === "LIMIT_FILE_COUNT") {
        return res.status(400).json(STATUS_CODE[400](req.t!("Too many files in one upload")));
      }
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("The file upload could not be processed")));
    }

    if (err instanceof Error && err.message === "UNSUPPORTED_FILE_TYPE") {
      return res.status(415).json(STATUS_CODE[415](req.t!(unsupportedTypeMessage)));
    }

    return next(err);
  };
}

/** Handler for uploads created with the default limits. */
export const handleUploadError = createUploadErrorHandler();
