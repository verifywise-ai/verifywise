/**
 * @fileoverview Policy Folder Controller
 *
 * HTTP handlers for policy-to-virtual-folder assignment operations.
 *
 * Authorization:
 * - GET endpoints: All authenticated users
 * - PATCH endpoints: Admin and Editor roles only
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

const ALLOWED_ROLES = ["Admin", "Editor"];

const hasManagePermission = (userRole: string | undefined): boolean => {
  return userRole ? ALLOWED_ROLES.includes(userRole) : false;
};

const parseParamId = (param: string | string[] | undefined): number => {
  const value = Array.isArray(param) ? param[0] : param;
  return parseInt(value || "", 10);
};

/**
 * GET /policies/:id/folders
 * Get all folders a policy belongs to
 */
export const getPolicyFolders = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const policyId = parseParamId(req.params.id);
    if (isNaN(policyId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid policy ID"));
    }

    const folders = await getPolicyFoldersQuery(req.organizationId!, policyId);
    return res.status(200).json(STATUS_CODE[200](folders));
  } catch (error) {
    console.error("Error getting policy folders:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * GET /folders/:folderId/policies
 * Get all policy IDs in a folder
 */
export const getPoliciesInFolder = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const folderId = parseParamId(req.params.folderId);
    if (isNaN(folderId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid folder ID"));
    }

    const policyIds = await getPolicyIdsInFolderQuery(req.organizationId!, folderId);
    return res.status(200).json(STATUS_CODE[200](policyIds));
  } catch (error) {
    console.error("Error getting policies in folder:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * PATCH /policies/:id/folders
 * Bulk update policy folder assignments
 */
export const updatePolicyFolders = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const transaction = await sequelize.transaction();
  try {
    if (!hasManagePermission(req.role)) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403]("Insufficient permissions"));
    }

    const policyId = parseParamId(req.params.id);
    if (isNaN(policyId)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid policy ID"));
    }

    const { folder_ids } = req.body as { folder_ids: number[] };
    if (!Array.isArray(folder_ids)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Folder IDs array is required"));
    }

    await bulkUpdatePolicyFoldersQuery(
      req.organizationId!,
      policyId,
      folder_ids,
      req.userId!,
      transaction
    );

    const updatedFolders = await getPolicyFoldersQuery(req.organizationId!, policyId);

    await transaction.commit();
    return res.status(200).json(STATUS_CODE[200](updatedFolders));
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating policy folders:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};
