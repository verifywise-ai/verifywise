/**
 * @fileoverview Compliance Score Routes
 *
 * Defines RESTful API endpoints for AI compliance score management.
 * Implements secure access to compliance scoring, detailed breakdowns,
 * and drill-down functionality with proper authentication.
 *
 * Public Endpoints: None
 *
 * Protected Endpoints (require authentication):
 * - GET /score - Get compliance score for authenticated user's organization
 * - GET /score/:organizationId - Get compliance score for specific organization (admin)
 * - GET /details/:organizationId - Get detailed compliance breakdown for drill-down
 *
 * Middleware:
 * - authenticateJWT: Validates JWT tokens and enforces multi-tenant isolation
 *
 * @module routes/compliance.route
 */

import express from "express";
const router = express.Router();

import {
  getComplianceScore,
  getComplianceScoreByOrganization,
  getComplianceDetails,
} from "../controllers/compliance.ctrl";

import authenticateJWT from "../middleware/auth.middleware";

/**
 * GET /compliance/score
 *
 * Retrieves the AI compliance score for the authenticated user's organization.
 * Includes overall score, module breakdowns, and calculation metadata.
 *
 * @name get/score
 * @function
 * @memberof module:routes/compliance.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Object} Complete compliance score with module breakdowns
 */
router.get("/score", authenticateJWT, getComplianceScore);

/**
 * GET /compliance/score/:organizationId
 *
 * Retrieves compliance score for a specific organization.
 * Requires authentication and appropriate authorization.
 *
 * @name get/score/:organizationId
 * @function
 * @memberof module:routes/compliance.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Object} Complete compliance score for specified organization
 */
router.get("/score/:organizationId", authenticateJWT, getComplianceScoreByOrganization);

/**
 * GET /compliance/details/:organizationId
 *
 * Retrieves detailed compliance breakdown for drill-down functionality.
 * Provides comprehensive module analysis, component-level scoring,
 * improvement insights, and data quality indicators.
 *
 * @name get/details/:organizationId
 * @function
 * @memberof module:routes/compliance.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Object} Detailed compliance analysis with insights
 */
router.get("/details/:organizationId", authenticateJWT, getComplianceDetails);

export default router;
