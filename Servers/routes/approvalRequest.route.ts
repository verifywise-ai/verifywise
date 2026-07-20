/**
 * @fileoverview Approval Request Routes
 *
 * Defines RESTful API endpoints for approval request management.
 * All routes require JWT authentication. Access control varies by endpoint.
 *
 * Request Management Endpoints:
 * - POST / - Create new approval request (All authenticated users)
 * - GET /my-requests - Get user's own requests (All authenticated users)
 * - GET /pending-approvals - Get requests pending user's approval (All authenticated users)
 * - GET /all - Get all requests (Admin only)
 * - GET /:id - Get request by ID (All authenticated users)
 * - POST /:id/approve - Approve a request (Approvers only)
 * - POST /:id/reject - Reject a request (Approvers only)
 * - POST /:id/withdraw - Withdraw a request (Requestor only)
 *
 * @module routes/approvalRequest.route
 */

import express from "express";
const router = express.Router();

import {
  createApprovalRequest,
  getMyApprovalRequests,
  getPendingApprovals,
  getApprovalRequestById,
  approveRequest,
  rejectRequest,
  withdrawRequest,
  getAllApprovalRequests,
} from "../controllers/approvalRequest.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  validateApprovalActionBody,
  validateApprovalIdParam,
  validateCreateApprovalRequest,
} from "../middleware/validators/approvalRequest.validator";

/**
 * POST /approval-requests
 * Create new approval request
 * @access All authenticated users
 */
router.post("/", authenticateJWT, validateCreateApprovalRequest, createApprovalRequest);

/**
 * GET /approval-requests/my-requests
 * Get user's own approval requests
 * @access All authenticated users
 */
router.get("/my-requests", authenticateJWT, getMyApprovalRequests);

/**
 * GET /approval-requests/pending-approvals
 * Get requests pending current user's approval
 * @access All authenticated users
 */
router.get("/pending-approvals", authenticateJWT, getPendingApprovals);

/**
 * GET /approval-requests/all
 * Get all approval requests (admin view)
 * @access Admin only
 */
router.get("/all", authenticateJWT, authorize(["Admin"]), getAllApprovalRequests);

/**
 * GET /approval-requests/:id
 * Get approval request by ID with timeline
 * @access All authenticated users
 */
router.get("/:id", authenticateJWT, validateApprovalIdParam, getApprovalRequestById);

/**
 * POST /approval-requests/:id/approve
 * Approve a request
 * @access Approvers only
 */
router.post("/:id/approve", authenticateJWT, validateApprovalActionBody, approveRequest);

/**
 * POST /approval-requests/:id/reject
 * Reject a request
 * @access Approvers only
 */
router.post("/:id/reject", authenticateJWT, validateApprovalActionBody, rejectRequest);

/**
 * POST /approval-requests/:id/withdraw
 * Withdraw a request
 * @access Requestor only
 */
router.post("/:id/withdraw", authenticateJWT, validateApprovalIdParam, withdrawRequest);

export default router;
