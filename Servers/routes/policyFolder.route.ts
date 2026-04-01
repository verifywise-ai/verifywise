/**
 * @fileoverview Policy Folder Routes
 *
 * Express routes for policy-to-virtual-folder assignments.
 * Mounted at /api/policies via index.ts (merges with existing policy routes).
 *
 * @module routes/policyFolder.route
 */

import { Router } from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  getPolicyFolders,
  getPoliciesInFolder,
  updatePolicyFolders,
} from "../controllers/policyFolder.ctrl";

const router = Router();

/**
 * GET /policies/folders/:folderId/policies
 * Get all policy IDs assigned to a folder
 */
router.get("/folders/:folderId/policies", authenticateJWT, getPoliciesInFolder);

/**
 * GET /policies/:id/folders
 * Get all folders a policy belongs to
 */
router.get("/:id/folders", authenticateJWT, getPolicyFolders);

/**
 * PATCH /policies/:id/folders
 * Bulk update policy folder assignments
 */
router.patch("/:id/folders", authenticateJWT, updatePolicyFolders);

export default router;
