/**
 * @fileoverview Virtual Folder Routes
 *
 * Express routes for virtual folder management.
 *
 * @module routes/virtualFolder.route
 */

import { Router } from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  getAllFolders,
  getFolderTree,
  getFolderById,
  getFolderPath,
  createFolder,
  updateFolder,
  deleteFolder,
  getFilesInFolder,
  getUncategorizedFiles,
  assignFilesToFolder,
  removeFileFromFolder,
  getFileFolders,
  updateFileFolders,
} from "../controllers/virtualFolder.ctrl";

const router = Router();

// ============================================================================
// FOLDER ROUTES
// ============================================================================

/**
 * GET /virtual-folders
 * Get all folders (flat list with file counts)
 */
router.get("/", authenticateJWT, getAllFolders);

/**
 * GET /virtual-folders/tree
 * Get folder tree (hierarchical structure)
 */
router.get("/tree", authenticateJWT, getFolderTree);

/**
 * GET /virtual-folders/uncategorized
 * Get files not assigned to any folder
 * Note: Must be before /:id to avoid matching "uncategorized" as id
 */
router.get("/uncategorized", authenticateJWT, getUncategorizedFiles);

/**
 * GET /virtual-folders/:id
 * Get folder by ID
 */
router.get("/:id", authenticateJWT, getFolderById);

/**
 * GET /virtual-folders/:id/path
 * Get folder path (breadcrumb from root to folder)
 */
router.get("/:id/path", authenticateJWT, getFolderPath);

/**
 * POST /virtual-folders
 * Create a new folder
 */
router.post("/", authenticateJWT, createFolder);

/**
 * PATCH /virtual-folders/:id
 * Update an existing folder
 */
router.patch("/:id", authenticateJWT, updateFolder);

/**
 * DELETE /virtual-folders/:id
 * Delete a folder (cascade deletes children and mappings)
 */
router.delete("/:id", authenticateJWT, deleteFolder);

// ============================================================================
// FILE-FOLDER MAPPING ROUTES
// ============================================================================

/**
 * GET /virtual-folders/:id/files
 * Get files in a folder
 */
router.get("/:id/files", authenticateJWT, getFilesInFolder);

/**
 * POST /virtual-folders/:id/files
 * Assign files to a folder
 */
router.post("/:id/files", authenticateJWT, authorize("file.edit"), assignFilesToFolder);

/**
 * DELETE /virtual-folders/:id/files/:fileId
 * Remove a file from a folder
 */
router.delete("/:id/files/:fileId", authenticateJWT, authorize("file.edit"), removeFileFromFolder);

// ============================================================================
// FILE FOLDER ROUTES (Mounted at /files)
// ============================================================================

/**
 * These routes should be mounted at /files/:id/folders
 * They allow getting and updating folder assignments for a specific file
 */
export const filesFolderRouter = Router();

/**
 * GET /files/:id/folders
 * Get all folders a file belongs to
 */
filesFolderRouter.get("/:id/folders", authenticateJWT, getFileFolders);

/**
 * PATCH /files/:id/folders
 * Bulk update file folder assignments
 */
filesFolderRouter.patch("/:id/folders", authenticateJWT, authorize("file.edit"), updateFileFolders);

export default router;
