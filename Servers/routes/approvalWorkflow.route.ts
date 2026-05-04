/**
 * @fileoverview Approval Workflow Routes
 *
 * Defines RESTful API endpoints for approval workflow management.
 * All routes require JWT authentication. Write operations restricted to Admin role.
 *
 * Workflow Management Endpoints:
 * - GET / - List all approval workflows (All authenticated users)
 * - GET /:id - Get workflow by ID (All authenticated users)
 * - POST / - Create new workflow (Admin only)
 * - PUT /:id - Update workflow (Admin only)
 * - DELETE /:id - Delete workflow (Admin only)
 *
 * @module routes/approvalWorkflow.route
 */

import express from "express";
const router = express.Router();

import {
  getAllApprovalWorkflows,
  getApprovalWorkflowById,
  createApprovalWorkflow,
  updateApprovalWorkflow,
  deleteApprovalWorkflow,
} from "../controllers/approvalWorkflow.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";

/**
 * GET /approval-workflows
 * List all approval workflows
 * @access All authenticated users (needed for use-case creation)
 */
router.get("/", authenticateJWT, getAllApprovalWorkflows);

/**
 * GET /approval-workflows/:id
 * Get approval workflow by ID with steps
 * @access All authenticated users (needed for viewing workflow details)
 */
router.get("/:id", authenticateJWT, getApprovalWorkflowById);

/**
 * POST /approval-workflows
 * Create new approval workflow
 * @access Admin only
 */
router.post("/", authenticateJWT, authorize(["Admin"]), createApprovalWorkflow);

/**
 * PUT /approval-workflows/:id
 * Update approval workflow
 * @access Admin only
 */
router.put("/:id", authenticateJWT, authorize(["Admin"]), updateApprovalWorkflow);

/**
 * DELETE /approval-workflows/:id
 * Delete approval workflow
 * @access Admin only
 */
router.delete("/:id", authenticateJWT, authorize(["Admin"]), deleteApprovalWorkflow);

export default router;
