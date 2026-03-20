/**
 * @fileoverview Multi-Tenancy Middleware
 *
 * Enforces multi-tenancy constraints for organization creation operations.
 * Validates whether new organizations can be created based on system configuration
 * and licensing requirements.
 *
 * Key Features:
 * - Environment-based multi-tenancy control
 * - Domain-based access validation
 * - First-organization exception (setup flow)
 * - License enforcement for multi-tenant deployments
 *
 * Multi-Tenancy Modes:
 * - Single-tenant: Only one organization allowed (default for self-hosted)
 * - Multi-tenant: Multiple organizations allowed (requires license and configuration)
 *
 * Allowed Scenarios:
 * 1. MULTI_TENANCY_ENABLED=true AND request from authorized domains
 * 2. No organizations exist yet (initial setup)
 *
 * @module middleware/multiTenancy
 */

import { NextFunction, Request, Response } from "express";
import { getOrganizationsExistsQuery } from "../utils/organization.utils";

/**
 * Validates multi-tenancy constraints for organization creation
 *
 * Checks whether a new organization can be created based on:
 * - Multi-tenancy configuration (MULTI_TENANCY_ENABLED env var)
 * - Request origin (authorized domains for SaaS deployment)
 * - Existing organization count (allows first organization for setup)
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 * @returns {Promise<void|Response>} Continues to next middleware or returns 403 error
 *
 * @security
 * - Prevents unauthorized multi-tenant usage
 * - Domain-based access control for SaaS deployments
 * - License enforcement through environment configuration
 *
 * @example
 * // Protect organization creation endpoint
 * router.post('/organizations', checkMultiTenancy, createOrganization);
 *
 * @example
 * // First organization creation (setup flow)
 * // Always allowed regardless of multi-tenancy setting
 * // Enables initial setup for self-hosted deployments
 */
export const checkMultiTenancy = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestOrigin = req.headers.origin || req.headers.host;
  const organizationExists = await getOrganizationsExistsQuery();
  if (
    (process.env.MULTI_TENANCY_ENABLED === "true" &&
      (requestOrigin?.includes("app.ai") ||
        requestOrigin?.includes("test.ai"))) ||
    !organizationExists.exists
  ) {
    return next();
  } else {
    return res.status(403).json({
      message:
        "Multi tenancy is not enabled in this server. Please contact VerifyWise to get a license for multi tenancy option.",
    });
  }
};
