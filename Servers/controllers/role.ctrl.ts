/**
 * @fileoverview Role Management Controller
 *
 * Handles role-based access control (RBAC) operations including role creation,
 * retrieval, updates, and deletion. Roles define permission levels for users
 * within the system.
 *
 * Key Features:
 * - Role CRUD operations with validation
 * - Transaction-based operations for data consistency
 * - Comprehensive audit logging for all role operations
 * - Role validation before persistence
 *
 * Standard Roles:
 * - 1: Admin - Full system access
 * - 2: Reviewer - Review and approval permissions
 * - 3: Editor - Content editing permissions
 * - 4: Auditor - Read-only audit access
 *
 * Security Features:
 * - Transaction rollback on failures
 * - Role data validation
 * - Audit logging for all operations
 *
 * @module controllers/role
 */

import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  createNewRoleQuery,
  deleteRoleByIdQuery,
  getAllRolesQuery,
  getRoleByIdQuery,
  updateRoleByIdQuery,
} from "../utils/role.utils";
import { sequelize } from "../database/db";
import { RoleModel } from "../domain.layer/models/role/role.model";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import {
  logProcessing,
  logSuccess,
  logFailure,
} from "../utils/logger/logHelper";

/**
 * Retrieves all roles from the system
 *
 * Returns a complete list of all available roles that can be assigned to users.
 *
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} JSON array of roles or appropriate status code
 *
 * @example
 * GET /api/roles
 * Authorization: Bearer <jwt_token>
 *
 * Response 200:
 * {
 *   "code": 200,
 *   "data": [
 *     { "id": 1, "name": "Admin", "description": "Full system access" },
 *     { "id": 2, "name": "Reviewer", "description": "Review permissions" }
 *   ]
 * }
 */
export async function getAllRoles(_req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getAllRoles",
    functionName: "getAllRoles",
    fileName: "role.ctrl.ts",
    userId: _req.userId!,
    tenantId: _req.organizationId!,
  });

  try {
    const roles = await getAllRolesQuery();

    await logSuccess({
      eventType: "Read",
      description: "Retrieved all roles",
      functionName: "getAllRoles",
      fileName: "role.ctrl.ts",
      userId: _req.userId!,
      tenantId: _req.organizationId!,
    });

    if (roles) {
      return res.status(200).json(STATUS_CODE[200](roles));
    }

    return res.status(204).json(STATUS_CODE[204](roles));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve roles",
      functionName: "getAllRoles",
      fileName: "role.ctrl.ts",
      error: error as Error,
      userId: _req.userId!,
      tenantId: _req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Retrieves a specific role by its ID
 *
 * Returns detailed information about a single role.
 *
 * @async
 * @param {Request} req - Express request with role ID in params
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} Role object or 404 if not found
 *
 * @example
 * GET /api/roles/1
 * Authorization: Bearer <jwt_token>
 *
 * Response 200:
 * {
 *   "code": 200,
 *   "data": {
 *     "id": 1,
 *     "name": "Admin",
 *     "description": "Full system access"
 *   }
 * }
 */
export async function getRoleById(req: Request, res: Response): Promise<any> {
  const roleId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getRoleById for ID ${roleId}`,
    functionName: "getRoleById",
    fileName: "role.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const role = await getRoleByIdQuery(roleId);

    await logSuccess({
      eventType: "Read",
      description: `Retrieved role ID ${roleId}`,
      functionName: "getRoleById",
      fileName: "role.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    if (role) {
      return res.status(200).json(STATUS_CODE[200](role));
    }

    return res.status(404).json(STATUS_CODE[404](role));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve role by ID",
      functionName: "getRoleById",
      fileName: "role.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Creates a new role in the system
 *
 * Allows creation of custom roles with name and description.
 * Validates role data before persistence and uses transactions for atomicity.
 *
 * @async
 * @param {Request} req - Express request with role data in body
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} Created role object or error status
 *
 * @security
 * - Transaction-based creation for atomicity
 * - Role data validation via RoleModel
 * - Audit logging for role creation
 *
 * @validation
 * - Role name required and must be unique
 * - Description required
 * - Name validated for length and format
 *
 * @example
 * POST /api/roles
 * Authorization: Bearer <jwt_token>
 * {
 *   "name": "Manager",
 *   "description": "Project management permissions"
 * }
 *
 * Response 201:
 * {
 *   "code": 201,
 *   "data": {
 *     "id": 5,
 *     "name": "Manager",
 *     "description": "Project management permissions"
 *   }
 * }
 */
export async function createRole(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();

  logProcessing({
    description: "starting createRole",
    functionName: "createRole",
    fileName: "role.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const newRole = req.body;

    const roleObj = await RoleModel.createRole(
      newRole.name,
      newRole.description
    );
    const createdRole = await createNewRoleQuery(roleObj, transaction);

    if (createdRole) {
      await transaction.commit();

      await logSuccess({
        eventType: "Create",
        description: "Created new role",
        functionName: "createRole",
        fileName: "role.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res.status(201).json(STATUS_CODE[201](createdRole));
    }

    await logFailure({
      eventType: "Create",
      description: "Role creation returned null",
      functionName: "createRole",
      fileName: "role.ctrl.ts",
      error: new Error("Role creation returned null"),
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(503).json(STATUS_CODE[503]({}));
  } catch (error) {
    await transaction.rollback();

    await logFailure({
      eventType: "Create",
      description: "Failed to create role",
      functionName: "createRole",
      fileName: "role.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Updates an existing role's information
 *
 * Allows modification of role name and description with validation.
 * Uses transaction to ensure data consistency.
 *
 * @async
 * @param {Request} req - Express request with role ID in params and update data in body
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} Updated role object or error status
 *
 * @security
 * - Transaction-based update for atomicity
 * - Role ID verified before update
 * - Audit logging for role updates
 *
 * @validation
 * - Role must exist
 * - Name must be unique if changed
 *
 * @example
 * PATCH /api/roles/5
 * Authorization: Bearer <jwt_token>
 * {
 *   "name": "Senior Manager",
 *   "description": "Advanced project management permissions"
 * }
 *
 * Response 202:
 * {
 *   "code": 202,
 *   "data": {
 *     "id": 5,
 *     "name": "Senior Manager",
 *     "description": "Advanced project management permissions"
 *   }
 * }
 */
export async function updateRoleById(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const roleId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting updateRoleById for ID ${roleId}`,
    functionName: "updateRoleById",
    fileName: "role.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const updatedRole = req.body;

    const role = await updateRoleByIdQuery(roleId, updatedRole, transaction);

    if (role) {
      await transaction.commit();

      await logSuccess({
        eventType: "Update",
        description: `Updated role ID ${roleId}`,
        functionName: "updateRoleById",
        fileName: "role.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res.status(202).json(STATUS_CODE[202](role));
    }

    await logSuccess({
      eventType: "Update",
      description: `Role not found for update: ID ${roleId}`,
      functionName: "updateRoleById",
      fileName: "role.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();

    await logFailure({
      eventType: "Update",
      description: "Failed to update role",
      functionName: "updateRoleById",
      fileName: "role.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Deletes a role from the system
 *
 * Removes a role from the system. Should be used with caution as it may impact
 * users currently assigned to this role.
 *
 * @async
 * @param {Request} req - Express request with role ID in params
 * @param {Response} res - Express response object
 * @returns {Promise<Response>} Deleted role object or error status
 *
 * @security
 * - Transaction-based deletion for atomicity
 * - Role existence verified before deletion
 * - Audit logging for role deletions
 *
 * @warning
 * Deleting a role may impact:
 * - Users currently assigned to this role
 * - Permission checks for existing users
 * - Consider reassigning users before deletion
 *
 * @example
 * DELETE /api/roles/5
 * Authorization: Bearer <jwt_token>
 *
 * Response 202:
 * {
 *   "code": 202,
 *   "data": {
 *     "id": 5,
 *     "name": "Manager"
 *   }
 * }
 */
export async function deleteRoleById(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const roleId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting deleteRoleById for ID ${roleId}`,
    functionName: "deleteRoleById",
    fileName: "role.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const deletedRole = await deleteRoleByIdQuery(roleId, transaction);

    if (deletedRole) {
      await transaction.commit();

      await logSuccess({
        eventType: "Delete",
        description: `Deleted role ID ${roleId}`,
        functionName: "deleteRoleById",
        fileName: "role.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res.status(202).json(STATUS_CODE[202](deletedRole));
    }

    await logSuccess({
      eventType: "Delete",
      description: `Role not found for deletion: ID ${roleId}`,
      functionName: "deleteRoleById",
      fileName: "role.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();

    await logFailure({
      eventType: "Delete",
      description: "Failed to delete role",
      functionName: "deleteRoleById",
      fileName: "role.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
