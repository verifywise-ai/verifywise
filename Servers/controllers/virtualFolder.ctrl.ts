/**
 * @fileoverview Virtual Folder Controller
 *
 * HTTP handlers for virtual folder operations. Provides endpoints for
 * managing folders and file-folder assignments.
 *
 * Authorization:
 * - GET endpoints: All authenticated users
 * - POST/PATCH/DELETE endpoints: Admin and Editor roles only
 *
 * @module controllers/virtualFolder.ctrl
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  getAllFoldersQuery,
  getFolderTreeQuery,
  getFolderByIdQuery,
  createFolderQuery,
  updateFolderByIdQuery,
  deleteFolderByIdQuery,
  checkFolderNameExistsQuery,
  getFilesInFolderQuery,
  getUncategorizedFilesQuery,
  getFileFoldersQuery,
  assignFilesToFolderQuery,
  removeFileFromFolderQuery,
  bulkUpdateFileFoldersQuery,
  getFolderPathQuery,
  wouldCreateCircularReferenceQuery,
} from "../utils/virtualFolder.utils";
import { sequelize } from "../database/db";
import {
  IVirtualFolderInput,
  IVirtualFolderUpdate,
} from "../domain.layer/interfaces/i.virtualFolder";

const ALLOWED_ROLES = ["Admin", "Editor"];

/**
 * Check if user has permission to manage folders
 */
const hasManagePermission = (userRole: string | undefined): boolean => {
  return userRole ? ALLOWED_ROLES.includes(userRole) : false;
};

/**
 * Safely parse a route parameter to integer
 * Express params can be string | string[], this ensures we handle both cases
 */
const parseParamId = (param: string | string[] | undefined): number => {
  const value = Array.isArray(param) ? param[0] : param;
  return parseInt(value || "", 10);
};

// ============================================================================
// FOLDER ENDPOINTS
// ============================================================================

/**
 * GET /virtual-folders
 * Get all folders (flat list with file counts)
 */
export const getAllFolders = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const folders = await getAllFoldersQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](folders));
  } catch (error) {
    console.error("Error getting folders:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * GET /virtual-folders/tree
 * Get folder tree (hierarchical structure)
 */
export const getFolderTree = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const tree = await getFolderTreeQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](tree));
  } catch (error) {
    console.error("Error getting folder tree:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * GET /virtual-folders/:id
 * Get folder by ID
 */
export const getFolderById = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const folderId = parseParamId(req.params.id);
    if (isNaN(folderId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid folder ID"));
    }

    const folder = await getFolderByIdQuery(req.organizationId!, folderId);
    if (!folder) {
      return res.status(404).json(STATUS_CODE[404]("Folder not found"));
    }

    return res.status(200).json(STATUS_CODE[200](folder));
  } catch (error) {
    console.error("Error getting folder:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * GET /virtual-folders/:id/path
 * Get folder path (breadcrumb from root to folder)
 */
export const getFolderPath = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const folderId = parseParamId(req.params.id);
    if (isNaN(folderId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid folder ID"));
    }

    const path = await getFolderPathQuery(req.organizationId!, folderId);
    return res.status(200).json(STATUS_CODE[200](path));
  } catch (error) {
    console.error("Error getting folder path:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * POST /virtual-folders
 * Create a new folder
 */
export const createFolder = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const transaction = await sequelize.transaction();
  try {
    // Check permissions
    if (!hasManagePermission(req.role)) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403]("Insufficient permissions"));
    }

    const { name, description, parent_id, color, icon } =
      req.body as IVirtualFolderInput;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Folder name is required"));
    }

    // Validate folder name length
    if (name.trim().length > 255) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Folder name cannot exceed 255 characters"));
    }

    // Check for duplicate name in same parent
    const exists = await checkFolderNameExistsQuery(
      req.organizationId!,
      name,
      parent_id || null
    );
    if (exists) {
      await transaction.rollback();
      return res
        .status(409)
        .json(STATUS_CODE[409]("A folder with this name already exists in the same location"));
    }

    // Verify parent folder exists if specified
    if (parent_id) {
      const parentFolder = await getFolderByIdQuery(req.organizationId!, parent_id);
      if (!parentFolder) {
        await transaction.rollback();
        return res.status(400).json(STATUS_CODE[400]("Parent folder not found"));
      }
    }

    const folder = await createFolderQuery(
      { name, description, parent_id, color, icon },
      req.userId!,
      req.organizationId!,
      transaction
    );

    await transaction.commit();
    return res.status(201).json(STATUS_CODE[201](folder));
  } catch (error) {
    await transaction.rollback();
    console.error("Error creating folder:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * PATCH /virtual-folders/:id
 * Update an existing folder
 */
export const updateFolder = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const transaction = await sequelize.transaction();
  try {
    // Check permissions
    if (!hasManagePermission(req.role)) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403]("Insufficient permissions"));
    }

    const folderId = parseParamId(req.params.id);
    if (isNaN(folderId)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid folder ID"));
    }

    const { name, description, parent_id, color, icon } =
      req.body as IVirtualFolderUpdate;

    // Check folder exists
    const existingFolder = await getFolderByIdQuery(req.organizationId!, folderId);
    if (!existingFolder) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Folder not found"));
    }

    // Check if it's a system folder
    if (existingFolder.is_system) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403]("System folders cannot be modified"));
    }

    // Validate folder name length if provided
    if (name && name.trim().length > 255) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Folder name cannot exceed 255 characters"));
    }

    // Check for duplicate name if name is being changed
    if (name && name.trim() !== existingFolder.name) {
      const targetParentId = parent_id !== undefined ? parent_id : existingFolder.parent_id;
      const exists = await checkFolderNameExistsQuery(
        req.organizationId!,
        name,
        targetParentId || null,
        folderId
      );
      if (exists) {
        await transaction.rollback();
        return res
          .status(409)
          .json(STATUS_CODE[409]("A folder with this name already exists in the same location"));
      }
    }

    // Check for circular reference if parent is being changed
    if (parent_id !== undefined && parent_id !== existingFolder.parent_id) {
      if (parent_id !== null) {
        // Verify new parent exists
        const parentFolder = await getFolderByIdQuery(req.organizationId!, parent_id);
        if (!parentFolder) {
          await transaction.rollback();
          return res.status(400).json(STATUS_CODE[400]("Parent folder not found"));
        }

        // Check for circular reference
        const wouldBeCircular = await wouldCreateCircularReferenceQuery(
          req.organizationId!,
          folderId,
          parent_id
        );
        if (wouldBeCircular) {
          await transaction.rollback();
          return res
            .status(400)
            .json(STATUS_CODE[400]("Cannot move folder into its own subfolder"));
        }
      }
    }

    const folder = await updateFolderByIdQuery(
      folderId,
      { name, description, parent_id, color, icon },
      req.organizationId!,
      transaction
    );

    if (!folder) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Folder not found or update failed"));
    }

    await transaction.commit();
    return res.status(200).json(STATUS_CODE[200](folder));
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating folder:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * DELETE /virtual-folders/:id
 * Delete a folder (cascade deletes children and mappings)
 */
export const deleteFolder = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const transaction = await sequelize.transaction();
  try {
    // Check permissions
    if (!hasManagePermission(req.role)) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403]("Insufficient permissions"));
    }

    const folderId = parseParamId(req.params.id);
    if (isNaN(folderId)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid folder ID"));
    }

    // Check folder exists
    const existingFolder = await getFolderByIdQuery(req.organizationId!, folderId);
    if (!existingFolder) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Folder not found"));
    }

    // Check if it's a system folder
    if (existingFolder.is_system) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403]("System folders cannot be deleted"));
    }

    const deleted = await deleteFolderByIdQuery(req.organizationId!, folderId, transaction);
    if (!deleted) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Folder not found"));
    }

    await transaction.commit();
    return res.status(200).json(STATUS_CODE[200]({ deleted: true }));
  } catch (error) {
    await transaction.rollback();
    console.error("Error deleting folder:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

// ============================================================================
// FILE-FOLDER MAPPING ENDPOINTS
// ============================================================================

/**
 * GET /virtual-folders/:id/files
 * Get files in a folder
 */
export const getFilesInFolder = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const folderId = parseParamId(req.params.id);
    if (isNaN(folderId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid folder ID"));
    }

    // Verify folder exists
    const folder = await getFolderByIdQuery(req.organizationId!, folderId);
    if (!folder) {
      return res.status(404).json(STATUS_CODE[404]("Folder not found"));
    }

    const files = await getFilesInFolderQuery(req.organizationId!, folderId);
    return res.status(200).json(STATUS_CODE[200](files));
  } catch (error) {
    console.error("Error getting files in folder:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * GET /virtual-folders/uncategorized
 * Get files not assigned to any folder
 */
export const getUncategorizedFiles = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const files = await getUncategorizedFilesQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](files));
  } catch (error) {
    console.error("Error getting uncategorized files:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * POST /virtual-folders/:id/files
 * Assign files to a folder
 */
export const assignFilesToFolder = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const transaction = await sequelize.transaction();
  try {
    // Check permissions
    if (!hasManagePermission(req.role)) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403]("Insufficient permissions"));
    }

    const folderId = parseParamId(req.params.id);
    if (isNaN(folderId)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid folder ID"));
    }

    const { file_ids } = req.body as { file_ids: number[] };
    if (!Array.isArray(file_ids) || file_ids.length === 0) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("File IDs array is required"));
    }

    // Verify folder exists
    const folder = await getFolderByIdQuery(req.organizationId!, folderId);
    if (!folder) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Folder not found"));
    }

    const assignedCount = await assignFilesToFolderQuery(
      req.organizationId!,
      folderId,
      file_ids,
      req.userId!,
      transaction
    );

    await transaction.commit();
    return res.status(200).json(STATUS_CODE[200]({ assigned: assignedCount }));
  } catch (error) {
    await transaction.rollback();
    console.error("Error assigning files to folder:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * DELETE /virtual-folders/:id/files/:fileId
 * Remove a file from a folder
 */
export const removeFileFromFolder = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const transaction = await sequelize.transaction();
  try {
    // Check permissions
    if (!hasManagePermission(req.role)) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403]("Insufficient permissions"));
    }

    const folderId = parseParamId(req.params.id);
    const fileId = parseParamId(req.params.fileId);
    if (isNaN(folderId) || isNaN(fileId)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid folder or file ID"));
    }

    const removed = await removeFileFromFolderQuery(
      req.organizationId!,
      folderId,
      fileId,
      transaction
    );

    await transaction.commit();
    return res.status(200).json(STATUS_CODE[200]({ removed }));
  } catch (error) {
    await transaction.rollback();
    console.error("Error removing file from folder:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * GET /files/:id/folders
 * Get all folders a file belongs to
 */
export const getFileFolders = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const fileId = parseParamId(req.params.id);
    if (isNaN(fileId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
    }

    const folders = await getFileFoldersQuery(req.organizationId!, fileId);
    return res.status(200).json(STATUS_CODE[200](folders));
  } catch (error) {
    console.error("Error getting file folders:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * PATCH /files/:id/folders
 * Bulk update file folder assignments
 */
export const updateFileFolders = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const transaction = await sequelize.transaction();
  try {
    // Check permissions
    if (!hasManagePermission(req.role)) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403]("Insufficient permissions"));
    }

    const fileId = parseParamId(req.params.id);
    if (isNaN(fileId)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
    }

    const { folder_ids } = req.body as { folder_ids: number[] };
    if (!Array.isArray(folder_ids)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Folder IDs array is required"));
    }

    await bulkUpdateFileFoldersQuery(
      req.organizationId!,
      fileId,
      folder_ids,
      req.userId!,
      transaction
    );

    const updatedFolders = await getFileFoldersQuery(req.organizationId!, fileId);

    await transaction.commit();
    return res.status(200).json(STATUS_CODE[200](updatedFolders));
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating file folders:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};
