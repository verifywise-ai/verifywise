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
