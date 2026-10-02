/**
 * @fileoverview Access Control Middleware
 *
 * Provides role-based access control (RBAC) middleware for protecting routes
 * based on user roles. Works in conjunction with authentication middleware to
 * enforce granular access permissions.
 *
 * Key Features:
 * - Role-based route protection
 * - Multiple role support per route
 * - Integration with JWT authentication
 * - Clear error responses for unauthorized access
 *
 * Usage Flow:
 * 1. authenticateJWT middleware populates req.role with user's role name
 * 2. Access control middleware checks req.role against allowed roles
 * 3. Grants or denies access based on role match
 *
 * Standard Roles:
 * - Admin: Full system access
 * - Reviewer: Review and approval permissions
 * - Editor: Content editing permissions
 * - Auditor: Read-only audit access
 *
 * @module middleware/accessControl
 */

import { Request, Response, NextFunction } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { roleHasPermission } from "../utils/rolePermissions.utils";
import type { PermissionKey } from "../config/rolePermissions.config";

interface AuthenticatedRequest extends Request {
  userId?: number;
  role?: string;
  organizationId?: number;
}

/**
 * Creates role-based access control middleware
 *
 * Returns middleware function that validates user's role against allowed roles list.
 * Must be used after authenticateJWT middleware that populates req.role.
 *
 * @param {string[]} allowedRoles - Array of role names authorized to access the route
 * @returns {Function} Express middleware function for role validation
 *
 * @security
 * - Requires authenticateJWT middleware to run first
 * - Validates role from req.role (populated by authenticateJWT)
 * - Returns 401 if role not found (authentication missing)
 * - Returns 403 if user role not in allowed list
 *
 * @example
 * // Allow only Admin role
 * router.delete('/users/:id', authenticateJWT, authorize(['Admin']), deleteUser);
 *
 * @example
 * // Allow multiple roles
 * router.patch('/data/:id', authenticateJWT, authorize(['Admin', 'Editor']), updateData);
 *
 * @example
 * // Protect sensitive operations
 * router.get('/audit-logs', authenticateJWT, authorize(['Admin', 'Auditor']), getAuditLogs);
 */
/**
 * Authorization middleware (issue #4588 — permission matrix).
 *
 * Accepts either:
 *   - a permission key (`authorize("risks.edit")`): resolved through the
 *     permission matrix — built-in roles against the static BUILTIN matrix
 *     (parity with the old allowlists), custom organization roles against
 *     the `role_permissions` table (missing row = deny).
 *   - a legacy role-name array (`authorize(["Admin", "Editor"])`): kept as a
 *     temporary shim so the ~94 call sites can migrate file-by-file; new code
 *     must use permission keys.
 */
const authorize =
  (permissionOrRoles: PermissionKey | string[]) =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Check if role exists (populated by authenticateJWT middleware)
    if (!req.role) {
      console.error("Authorization failed: No role found in request");
      return res.status(401).json(STATUS_CODE[401](req.t!("Authentication required")));
    }
    const roleName = req.role; // Extract role from authenticated request

    try {
      if (Array.isArray(permissionOrRoles)) {
        // Legacy path — unchanged literal-allowlist behavior (migration shim).
        if (!permissionOrRoles.includes(roleName)) {
          return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
        }
        return next();
      }

      const allowed = await roleHasPermission(
        req.organizationId ?? null,
        roleName,
        permissionOrRoles,
      );
      if (!allowed) {
        return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };

export default authorize;
