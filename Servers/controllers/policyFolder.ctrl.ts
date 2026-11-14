/**
 * @fileoverview Policy Folder Controller
 *
 * HTTP handlers for policy-to-virtual-folder assignment operations.
 *
 * Authorization:
 * - GET endpoints: All authenticated users
 * - PATCH endpoints: the policy.edit permission (Admin and Editor by default)
 *   or a pure super admin, as the old Admin/SuperAdmin/Editor list allowed
 *
 * @module controllers/policyFolder.ctrl
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  getPolicyFoldersQuery,
  getPolicyIdsInFolderQuery,
  bulkUpdatePolicyFoldersQuery,
} from "../utils/policyFolder.utils";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import {
  ForbiddenException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import { isPureSuperAdmin, requestHasPermission } from "../utils/rolePermissions.utils";

import { translateError } from "../utils/i18n.utils";
// policy.edit is held by Admin and Editor; a pure super admin was on the old
// role-name list too, so it keeps access.
const hasManagePermission = async (req: Request): Promise<boolean> =>
  isPureSuperAdmin(req) || (await requestHasPermission(req, "policy.edit"));

const parseParamId = (param: string | string[] | undefined): number => {
  const value = Array.isArray(param) ? param[0] : param;
  return parseInt(value || "", 10);
};

/**
 * GET /policies/:id/folders
 * Get all folders a policy belongs to
 */
export const getPolicyFolders = async (req: Request, res: Response): Promise<Response> => {
  try {
    const policyId = parseParamId(req.params.id);
    if (isNaN(policyId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid policy ID")));
    }

    const folders = await getPolicyFoldersQuery(req.organizationId!, policyId);
    return res.status(200).json(STATUS_CODE[200](folders));
  } catch (error) {
    console.error("Error getting policy folders:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};

/**
 * GET /folders/:folderId/policies
 * Get all policy IDs in a folder
 */
export const getPoliciesInFolder = async (req: Request, res: Response): Promise<Response> => {
  try {
    const folderId = parseParamId(req.params.folderId);
    if (isNaN(folderId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid folder ID")));
    }

    const policyIds = await getPolicyIdsInFolderQuery(req.organizationId!, folderId);
    return res.status(200).json(STATUS_CODE[200](policyIds));
  } catch (error) {
    console.error("Error getting policies in folder:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};

/**
 * PATCH /policies/:id/folders
 * Bulk update policy folder assignments
 */
export const updatePolicyFolders = async (req: Request, res: Response): Promise<Response> => {
  const transaction = await sequelize.transaction();
  try {
    if (!(await hasManagePermission(req))) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403](req.t!("Insufficient permissions")));
    }

    const policyId = parseParamId(req.params.id);
    if (isNaN(policyId)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid policy ID")));
    }

    const { folder_ids } = req.body as { folder_ids: number[] };
    if (!Array.isArray(folder_ids)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400](req.t!("Folder IDs array is required")));
    }

    const policyRows = await sequelize.query(
      `SELECT id FROM policy_manager WHERE id = :policyId AND organization_id = :organizationId`,
      {
        replacements: { policyId, organizationId: req.organizationId! },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    if (policyRows.length === 0) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](null));
    }

    await bulkUpdatePolicyFoldersQuery(
      req.organizationId!,
      policyId,
      folder_ids,
      req.userId!,
      transaction,
    );

    const updatedFolders = await getPolicyFoldersQuery(req.organizationId!, policyId, transaction);

    await transaction.commit();
    return res.status(200).json(STATUS_CODE[200](updatedFolders));
  } catch (error) {
    await transaction.rollback();
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }
    if (error instanceof ForbiddenException) {
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }
    console.error("Error updating policy folders:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};
