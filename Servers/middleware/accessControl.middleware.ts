/**
 * @fileoverview Access Control Middleware
 *
 * Permission-based route protection. Works after authenticateJWT, which sets
 * req.role and req.organizationId.
 *
 * Built-in roles (Admin, Editor, Reviewer, Auditor, SuperAdmin) resolve a
 * permission key against the static built-in matrix; custom organization
 * roles resolve it against their `role_permissions` rows.
 *
 * @module middleware/accessControl
 */

import { Request, Response, NextFunction } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { requestHasPermission } from "../utils/rolePermissions.utils";
import type { PermissionKey } from "../config/rolePermissions.config";

interface AuthenticatedRequest extends Request {
  userId?: number;
  role?: string;
  organizationId?: number;
  isSuperAdmin?: boolean;
}

/**
 * Authorization middleware (issues #4588, #5314).
 *
 * `authorize("risks.edit")` resolves the key through the permission matrix:
 * built-in roles against the static built-in matrix (parity with the old
 * role-name allowlists), custom organization roles against the
 * `role_permissions` table (missing row = deny). A pure super admin (no
 * organization) answers from the built-in SuperAdmin matrix; see
 * isPureSuperAdmin. Routes must not authorize by
 * role name: a custom role can never match one.
 *
 * Returns 401 when authenticateJWT set no role, 403 when the role lacks the
 * permission.
 *
 * @example
 * router.delete("/:id", authenticateJWT, authorize("training.admin"), deleteTraining);
 */
const authorize =
  (permission: PermissionKey) =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Check if role exists (populated by authenticateJWT middleware)
    if (!req.role) {
      console.error("Authorization failed: No role found in request");
      return res.status(401).json(STATUS_CODE[401](req.t!("Authentication required")));
    }

    try {
      const allowed = await requestHasPermission(req, permission);
      if (!allowed) {
        return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };

export default authorize;
