/**
 * @fileoverview Organization Routes
 *
 * Defines RESTful API endpoints for organization management operations.
 * Implements multi-tenant architecture with proper authentication and authorization.
 *
 * Public Endpoints:
 * - GET /exists - Check if any organizations exist (setup flow)
 *
 * Protected Endpoints (require authentication):
 * - GET /:id - Get organization by ID
 * - PATCH /:id - Update organization
 *
 * Multi-Tenancy Protected Endpoints:
 * - POST / - Create new organization with tenant provisioning
 *
 * Middleware:
 * - authenticateJWT: Validates JWT tokens and enforces multi-tenant isolation
 * - checkMultiTenancy: Validates multi-tenancy constraints for new organizations
 *
 * @module routes/organization.route
 */

import express from "express";
const router = express.Router();

import {
  createOrganization,
  getOrganizationById,
  updateOrganizationById,
  getOrganizationsExists,
  updateOnboardingStatus,
} from "../controllers/organization.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import superAdminOnly from "../middleware/superAdminOnly.middleware";

/**
 * GET /organizations/exists
 *
 * Checks if any organizations exist in the system.
 * Used for setup/initialization flows to determine fresh installation status.
 *
 * @name get/exists
 * @function
 * @memberof module:routes/organization.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {boolean} True if organizations exist, false otherwise
 */
router.get("/exists", getOrganizationsExists);

/**
 * GET /organizations/:id
 *
 * Retrieves a specific organization by ID.
 * Requires authentication.
 *
 * @name get/:id
 * @function
 * @memberof module:routes/organization.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Object} Organization object
 */
router.get("/:id", authenticateJWT, getOrganizationById);

/**
 * POST /organizations
 *
 * Creates a new organization with complete onboarding:
 * - Organization record creation
 * - Tenant database provisioning
 * - Admin user creation
 * - JWT token generation
 *
 * Protected by multi-tenancy validation to enforce organizational constraints.
 *
 * @name post/
 * @function
 * @memberof module:routes/organization.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Object} Created organization with admin user and access token
 */
router.post("/", authenticateJWT, superAdminOnly, createOrganization);

/**
 * PATCH /organizations/:id
 *
 * Updates an existing organization's information.
 * Requires authentication.
 *
 * @name patch/:id
 * @function
 * @memberof module:routes/organization.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Object} Updated organization object
 */
router.patch("/:id", authenticateJWT, updateOrganizationById);

/**
 * PATCH /organizations/:id/onboarding-status
 *
 * Updates the onboarding status of an organization to 'completed'.
 * Called after user selects demo data or blank dashboard option.
 * Requires authentication.
 *
 * @name patch/:id/onboarding-status
 * @function
 * @memberof module:routes/organization.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Object} Updated onboarding status
 */
router.patch("/:id/onboarding-status", authenticateJWT, updateOnboardingStatus);

/**
 * DELETE /organizations/:id
 *
 * Deletes an organization from the system.
 * Currently disabled - uncomment to enable.
 * Requires authentication when enabled.
 *
 * @name delete/:id
 * @function
 * @memberof module:routes/organization.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Object} Deleted organization object
 */
// router.delete("/:id", authenticateJWT, deleteOrganizationById);

export default router;
