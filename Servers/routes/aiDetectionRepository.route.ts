/**
 * @fileoverview AI Detection Repository Routes
 *
 * Express router for AI Detection repository registry endpoints.
 * All routes require authentication and role-based authorization.
 *
 * @module routes/aiDetectionRepository
 */

import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  listRepositories,
  getRepository,
  createRepository,
  updateRepository,
  deleteRepository,
  triggerRepositoryScan,
  getRepositoryScans,
  generateWebhookSecretController,
} from "../controllers/aiDetectionRepository.ctrl";

const router = express.Router();

const ALL_ROLES = ["Admin", "Editor", "Reviewer", "Auditor"];
const WRITE_ROLES = ["Admin", "Editor"];
const ADMIN_ONLY = ["Admin"];

/**
 * @route   GET /ai-detection/repositories
 * @desc    List all registered repositories
 * @access  Private - All roles
 * @query   page, limit
 */
router.get("/", authenticateJWT, authorize(ALL_ROLES), listRepositories);

/**
 * @route   GET /ai-detection/repositories/:id
 * @desc    Get a single repository by ID
 * @access  Private - All roles
 */
router.get("/:id", authenticateJWT, authorize(ALL_ROLES), getRepository);

/**
 * @route   POST /ai-detection/repositories
 * @desc    Register a new repository
 * @access  Private - Admin, Editor
 */
router.post("/", authenticateJWT, authorize(WRITE_ROLES), createRepository);

/**
 * @route   PATCH /ai-detection/repositories/:id
 * @desc    Update a repository (schedule, display name, etc.)
 * @access  Private - Admin, Editor
 */
router.patch("/:id", authenticateJWT, authorize(WRITE_ROLES), updateRepository);

/**
 * @route   DELETE /ai-detection/repositories/:id
 * @desc    Remove a repository from registry
 * @access  Private - Admin only
 */
router.delete("/:id", authenticateJWT, authorize(ADMIN_ONLY), deleteRepository);

/**
 * @route   POST /ai-detection/repositories/:id/scan
 * @desc    Trigger a manual scan for a registered repository
 * @access  Private - Admin, Editor
 */
router.post("/:id/scan", authenticateJWT, authorize(WRITE_ROLES), triggerRepositoryScan);

/**
 * @route   POST /ai-detection/repositories/:id/webhook-secret
 * @desc    Generate a new webhook secret for CI/CD integration
 * @access  Private - Admin, Editor
 */
router.post("/:id/webhook-secret", authenticateJWT, authorize(WRITE_ROLES), generateWebhookSecretController);

/**
 * @route   GET /ai-detection/repositories/:id/scans
 * @desc    Get scan history for a specific repository
 * @access  Private - All roles
 * @query   page, limit
 */
router.get("/:id/scans", authenticateJWT, authorize(ALL_ROLES), getRepositoryScans);

export default router;
