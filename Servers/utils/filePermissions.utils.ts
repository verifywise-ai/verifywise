/**
 * @file filePermissions.utils.ts
 * @description Set-based authorization for file operations.
 *
 * postFileContent (assessment evidence upload/delete) previously trusted
 * client-supplied user_id/project_id and never checked that the caller may
 * act on the project or on the files being deleted. These helpers enforce:
 *
 *   - project access: the caller is an Admin/SuperAdmin, the project owner,
 *     or a project member (mirrors fileManager.ctrl.ts);
 *   - bulk delete: for non-admins, every file must have been uploaded by the
 *     caller or belong to a project the caller owns or is a member of.
 *
 * Everything is resolved with single queries (no per-row, per-file loops),
 * and every query is scoped to the caller's organization.
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { ForbiddenException } from "../domain.layer/exceptions/custom.exception";

interface AccessContext {
  userId: number;
  role: string;
  organizationId: number;
  transaction?: Transaction;
}

const isAdmin = (role: string) => role === "Admin" || role === "SuperAdmin";

/**
 * True when the caller may act on the project at all. Admin/SuperAdmin pass;
 * otherwise the caller must own the project or be a member of it.
 */
export async function canAccessProject(projectId: number, ctx: AccessContext): Promise<boolean> {
  if (isAdmin(ctx.role)) return true;
  const rows = (await sequelize.query(
    `SELECT 1 AS ok
       FROM projects p
      WHERE p.organization_id = :organizationId AND p.id = :projectId
        AND (p.owner = :userId OR EXISTS (
              SELECT 1 FROM projects_members pm
               WHERE pm.organization_id = :organizationId
                 AND pm.project_id = p.id
                 AND pm.user_id = :userId));`,
    {
      replacements: {
        organizationId: ctx.organizationId,
        projectId,
        userId: ctx.userId,
      },
      type: QueryTypes.SELECT,
      ...(ctx.transaction && { transaction: ctx.transaction }),
    },
  )) as Array<{ ok: number }>;
  return rows.length > 0;
}

/** Throws ForbiddenException unless the caller may act on the project. */
export async function assertCanAccessProject(projectId: number, ctx: AccessContext): Promise<void> {
  if (!(await canAccessProject(projectId, ctx))) {
    throw new ForbiddenException("Access denied");
  }
}

/**
 * Throws ForbiddenException unless the caller may delete every file in `ids`.
 * Org ownership of the ids is enforced separately by assertOrgOwnsIds; this
 * checks the per-caller rule in one grouped query: a non-admin may only
 * delete files they uploaded, or files whose project they own or belong to.
 */
export async function assertCanDeleteFiles(ids: number[], ctx: AccessContext): Promise<void> {
  if (ids.length === 0 || isAdmin(ctx.role)) return;
  const rows = (await sequelize.query(
    `SELECT f.id
       FROM files f
      WHERE f.organization_id = :organizationId AND f.id IN (:ids)
        AND NOT (f.uploaded_by = :userId)
        AND NOT (f.project_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM projects p
               WHERE p.organization_id = :organizationId
                 AND p.id = f.project_id
                 AND p.owner = :userId))
        AND NOT (f.project_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM projects_members pm
               WHERE pm.organization_id = :organizationId
                 AND pm.project_id = f.project_id
                 AND pm.user_id = :userId))
      LIMIT 1;`,
    {
      replacements: { organizationId: ctx.organizationId, ids, userId: ctx.userId },
      type: QueryTypes.SELECT,
      ...(ctx.transaction && { transaction: ctx.transaction }),
    },
  )) as Array<{ id: number }>;
  if (rows.length > 0) {
    throw new ForbiddenException("Access denied");
  }
}
