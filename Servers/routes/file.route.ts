import express from "express";
import {
  getFileContentById,
  getFileMetaByProjectId,
  getUserFilesMetaData,
  postFileContent,
  attachFileToEntity,
  attachFilesToEntity,
  detachFileFromEntity,
  getEntityFiles,
  bulkUpdateFileTags,
} from "../controllers/file.ctrl";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import { createMemoryUpload } from "../utils/upload.utils";

// Security: the previous config had a typo'd `Storage` key, so multer ran
// with zero limits and no type validation (memory-exhaustion DoS vector).
// Use the shared bounded factory (30MB/file, 10 files, MIME allowlist).
const upload = createMemoryUpload();

const router = express.Router();

router.get("/", authenticateJWT, getUserFilesMetaData);
router.get("/by-projid/:id", authenticateJWT, getFileMetaByProjectId);

// File entity linking endpoints (framework-agnostic)
router.get("/entity/:framework_type/:entity_type/:entity_id", authenticateJWT, getEntityFiles);
router.post("/attach", authenticateJWT, attachFileToEntity);
router.post("/attach-bulk", authenticateJWT, attachFilesToEntity);
router.delete("/detach", authenticateJWT, detachFileFromEntity);

// Bulk file actions (Admin/Editor only). Must come before generic /:id routes.
router.patch("/bulk-tags", authenticateJWT, authorize(["Admin", "Editor"]), bulkUpdateFileTags);

// File download - Admin only
router.get("/:id", authenticateJWT, authorize(["Admin"]), getFileContentById);
router.post(
  "/",
  authenticateJWT,
  authorize(["Admin", "Reviewer", "Editor"]),
  upload.any("files"),
  postFileContent,
);

export default router;
