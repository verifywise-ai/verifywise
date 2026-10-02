/**
 * @fileoverview Role Routes
 *
 * Defines RESTful API endpoints for role-based access control (RBAC) management.
 * All endpoints require authentication via JWT middleware.
 *
 * Protected Endpoints (all require authentication):
 * - GET / - List all roles
 * - GET /:id - Get role by ID
 * - POST / - Create new role
 * - PUT /:id - Update role
 * - DELETE /:id - Delete role
 *
 * Standard Roles:
 * - 1: Admin - Full system access
 * - 2: Reviewer - Review and approval permissions
 * - 3: Editor - Content editing permissions
 * - 4: Auditor - Read-only audit access
 *
 * Middleware:
 * - authenticateJWT: Validates JWT tokens for all role operations
 *
 * @module routes/role.route
 */

import express from "express";
const router = express.Router();

import {
  createRole,
  deleteRoleById,
  getAllRoles,
  getRoleById,
  updateRoleById,
} from "../controllers/role.ctrl";
import {
  getMyPermissions,
  getPermissionCatalog,
  getRolePermissionsById,
  replaceRolePermissions,
} from "../controllers/rolePermissions.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";

/**
 * GET /roles
 *
 * Retrieves all roles available in the system.
 * Requires authentication.
 *
 * @name get/
 * @function
 * @memberof module:routes/role.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Array<Object>} Array of role objects
 */
router.get("/", authenticateJWT, getAllRoles);

router.get("/permissions/catalog", authenticateJWT, getPermissionCatalog);
// Single-segment path — must be declared before "/:id".
router.get("/my-permissions", authenticateJWT, getMyPermissions);

/**
 * GET /roles/:id
 *
 * Retrieves a specific role by ID.
 * Requires authentication.
 *
 * @name get/:id
 * @function
 * @memberof module:routes/role.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Object} Role object
 */
router.get("/:id", authenticateJWT, getRoleById);

/**
 * POST /roles
 *
 * Creates a new role in the system.
 * Requires authentication.
 *
 * @name post/
 * @function
 * @memberof module:routes/role.route
 * @inner
 * @param {express.Request} req - Express request object with role data
 * @param {express.Response} res - Express response object
 * @returns {Object} Created role object
 */
router.post("/", authenticateJWT, authorize("roles.manage"), createRole);

/**
 * PUT /roles/:id
 *
 * Updates an existing role's information.
 * Requires authentication.
 *
 * @name put/:id
 * @function
 * @memberof module:routes/role.route
 * @inner
 * @param {express.Request} req - Express request object with updated role data
 * @param {express.Response} res - Express response object
 * @returns {Object} Updated role object
 */
router.put("/:id", authenticateJWT, authorize("roles.manage"), updateRoleById);

/**
 * DELETE /roles/:id
 *
 * Deletes a role from the system.
 * Requires authentication.
 * Use with caution as it may impact users with this role.
 *
 * @name delete/:id
 * @function
 * @memberof module:routes/role.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @returns {Object} Deleted role object
 */
router.delete("/:id", authenticateJWT, authorize("roles.manage"), deleteRoleById);

// Custom-role permission matrix (issue #4588). Same roles.manage guard.
router.get("/:id/permissions", authenticateJWT, getRolePermissionsById);
router.put("/:id/permissions", authenticateJWT, authorize("roles.manage"), replaceRolePermissions);

export default router;
