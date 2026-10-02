/**
 * @fileoverview GitHub Integration Routes
 *
 * Routes for managing GitHub Personal Access Token for private repository access.
 * Admin-only endpoints for token management.
 *
 * @module routes/githubIntegration
 */

import { Router } from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  getGitHubTokenStatusController,
  saveGitHubTokenController,
  deleteGitHubTokenController,
  testGitHubTokenController,
} from "../controllers/githubToken.ctrl";

const router = Router();

// Admin role required for token management
// All routes require authentication
router.use(authenticateJWT);

// GET /api/integrations/github/token - Get token status
router.get("/token", authorize("githubIntegration.admin"), getGitHubTokenStatusController);

// POST /api/integrations/github/token - Save/update token
router.post("/token", authorize("githubIntegration.admin"), saveGitHubTokenController);

// DELETE /api/integrations/github/token - Delete token
router.delete("/token", authorize("githubIntegration.admin"), deleteGitHubTokenController);

// POST /api/integrations/github/token/test - Test token validity
router.post("/token/test", authorize("githubIntegration.admin"), testGitHubTokenController);

export default router;
