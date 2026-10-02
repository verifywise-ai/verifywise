/**
 * @fileoverview Role Permissions Controller
 *
 * Backing endpoints for the per-organization permission matrix (issue #4588).
 * Lets an org Admin inspect the permission catalog, read a custom role's
 * effective permissions, and replace the role's permission matrix.
 *
 * Built-in roles resolve against the static BUILTIN_ROLE_PERMISSIONS matrix
 * and are immutable — these endpoints only mutate `role_permissions` rows for
 * custom (org-scoped) roles.
 *
 * @module controllers/rolePermissions
 */

import { Request, Response } from "express";

import { STATUS_CODE } from "../utils/statusCode.utils";
import { getRoleByIdQuery } from "../utils/role.utils";
import { sequelize } from "../database/db";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import { translateError } from "../utils/i18n.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import {
  getEffectivePermissions,
  listPermissionCatalog,
  replaceRolePermissionsQuery,
} from "../utils/rolePermissions.utils";

/**
 * GET /roles/permissions/catalog
 *
 * The full permission catalog (key, module, description) that the admin UI
 * renders when granting permissions to a custom role.
 */
export async function getPermissionCatalog(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getPermissionCatalog",
    functionName: "getPermissionCatalog",
    fileName: "rolePermissions.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const catalog = listPermissionCatalog();

    await logSuccess({
      eventType: "Read",
      description: "Retrieved permission catalog",
      functionName: "getPermissionCatalog",
      fileName: "rolePermissions.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](catalog));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve permission catalog",
      functionName: "getPermissionCatalog",
      fileName: "rolePermissions.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * GET /roles/my-permissions
 *
 * The authenticated user's effective permission keys (built-ins against the
 * static matrix, custom roles against their `role_permissions` rows). Feeds
 * the client's permission context so the UI can reconcile role-name gates
 * with custom roles (issue #4588) — backend remains the enforcing authority.
 */
export async function getMyPermissions(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getMyPermissions",
    functionName: "getMyPermissions",
    fileName: "rolePermissions.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    if (!req.role) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Authentication required")));
    }

    const permissions = await getEffectivePermissions(req.organizationId ?? null, req.role);

    await logSuccess({
      eventType: "Read",
      description: "Retrieved own permissions",
      functionName: "getMyPermissions",
      fileName: "rolePermissions.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](Array.from(permissions)));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve own permissions",
      functionName: "getMyPermissions",
      fileName: "rolePermissions.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Loads a role for a permissions read/mutation and enforces ownership.
 * Reads may target built-in roles (their static matrix is not secret);
 * mutations (`forMutation`) are limited to the org's own custom roles.
 * Returns the role or sends the error response.
 */
async function loadCustomRoleOrRespond(
  req: Request,
  res: Response,
  forMutation: boolean,
): Promise<{ id: number; name: string; organization_id: number | null } | null> {
  const roleId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const role = await getRoleByIdQuery(roleId);

  if (!role) {
    res.status(404).json(STATUS_CODE[404]({}));
    return null;
  }
  if (forMutation && role.organization_id == null) {
    res.status(403).json(STATUS_CODE[403](req.t!("Built-in roles cannot be modified")));
    return null;
  }
  if (role.organization_id != null && role.organization_id !== (req.organizationId ?? null)) {
    res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
    return null;
  }
  return role as { id: number; name: string; organization_id: number | null };
}

/**
 * GET /roles/:id/permissions
 *
 * The role's effective permission keys. Built-in roles resolve against the
 * static matrix; custom roles against their `role_permissions` rows.
 */
export async function getRolePermissionsById(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getRolePermissionsById",
    functionName: "getRolePermissionsById",
    fileName: "rolePermissions.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const role = await loadCustomRoleOrRespond(req, res, false);
    if (!role) return;

    const permissions = await getEffectivePermissions(role.organization_id, role.name);

    await logSuccess({
      eventType: "Read",
      description: `Retrieved permissions for role ID ${role.id}`,
      functionName: "getRolePermissionsById",
      fileName: "rolePermissions.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](Array.from(permissions)));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve role permissions",
      functionName: "getRolePermissionsById",
      fileName: "rolePermissions.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * PUT /roles/:id/permissions
 *
 * Replaces the role's whole permission matrix in one transaction.
 * Body: { permissions: [{ permission_key, allowed }] }.
 */
export async function replaceRolePermissions(req: Request, res: Response): Promise<any> {
  const transaction = await sequelize.transaction();

  logProcessing({
    description: "starting replaceRolePermissions",
    functionName: "replaceRolePermissions",
    fileName: "rolePermissions.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const role = await loadCustomRoleOrRespond(req, res, true);
    if (!role) {
      await transaction.rollback();
      return;
    }

    const permissions = req.body?.permissions;
    if (!Array.isArray(permissions)) {
      throw new ValidationException(
        "Body must be { permissions: [{ permission_key, allowed }] }",
        "permissions",
        permissions,
      );
    }

    await replaceRolePermissionsQuery(role.organization_id!, role.id, permissions, transaction);

    await transaction.commit();

    await logSuccess({
      eventType: "Update",
      description: `Replaced permissions for role ID ${role.id}`,
      functionName: "replaceRolePermissions",
      fileName: "rolePermissions.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(202).json(STATUS_CODE[202]({ role_id: role.id }));
  } catch (error) {
    await transaction.rollback();

    await logFailure({
      eventType: "Update",
      description: "Failed to replace role permissions",
      functionName: "replaceRolePermissions",
      fileName: "rolePermissions.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
