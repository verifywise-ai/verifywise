/**
 * @fileoverview Virtual Folder Utility Functions
 *
 * Database query functions for virtual folder operations.
 * Handles CRUD operations for folders and file-folder assignments.
 *
 * @module utils/virtualFolder.utils
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  IVirtualFolder,
  IVirtualFolderInput,
  IVirtualFolderUpdate,
  IFolderTreeNode,
  IFolderWithCount,
  IFileWithFolders,
} from "../domain.layer/interfaces/i.virtualFolder";

// ============================================================================
// FOLDER CRUD OPERATIONS
// ============================================================================

/**
 * Get all folders for an organization (flat list)
 */
export const getAllFoldersQuery = async (
  organizationId: number
): Promise<IFolderWithCount[]> => {
  const result = await sequelize.query(
    `SELECT
      vf.*,
      COALESCE(COUNT(ffm.id), 0)::INTEGER as file_count
    FROM virtual_folders vf
    LEFT JOIN file_folder_mappings ffm ON vf.id = ffm.folder_id AND ffm.organization_id = :organizationId
    WHERE vf.organization_id = :organizationId
    GROUP BY vf.id
    ORDER BY vf.name ASC`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    }
  );
  return result as IFolderWithCount[];
};

/**
 * Get folder tree (hierarchical structure)
 */
export const getFolderTreeQuery = async (
  organizationId: number
): Promise<IFolderTreeNode[]> => {
  // Get all folders with file counts
  const folders = await getAllFoldersQuery(organizationId);

  // Build tree structure
  const folderMap = new Map<number, IFolderTreeNode>();
  const rootFolders: IFolderTreeNode[] = [];

  // First pass: create all nodes
  for (const folder of folders) {
    folderMap.set(folder.id!, {
      ...folder,
      children: [],
      path: [folder.name],
    });
  }

  // Second pass: build parent-child relationships
  for (const folder of folders) {
    const node = folderMap.get(folder.id!)!;
    if (folder.parent_id && folderMap.has(folder.parent_id)) {
      const parent = folderMap.get(folder.parent_id)!;
      parent.children.push(node);
      // Build path from parent
      node.path = [...parent.path, folder.name];
    } else {
      rootFolders.push(node);
    }
  }

  // Sort children at each level
  const sortChildren = (nodes: IFolderTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) {
      sortChildren(node.children);
    }
  };
  sortChildren(rootFolders);

  return rootFolders;
};

/**
 * Get folder by ID
 */
export const getFolderByIdQuery = async (
  organizationId: number,
  id: number
): Promise<IFolderWithCount | null> => {
  const result = await sequelize.query(
    `SELECT
      vf.*,
      COALESCE(COUNT(ffm.id), 0)::INTEGER as file_count
    FROM virtual_folders vf
    LEFT JOIN file_folder_mappings ffm ON vf.id = ffm.folder_id AND ffm.organization_id = :organizationId
    WHERE vf.organization_id = :organizationId AND vf.id = :id
    GROUP BY vf.id`,
    {
      replacements: { organizationId, id },
      type: QueryTypes.SELECT,
    }
  );
  return result.length > 0 ? (result[0] as IFolderWithCount) : null;
};

/**
 * Create a new folder
 */
export const createFolderQuery = async (
  folder: IVirtualFolderInput,
  userId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<IVirtualFolder> => {
  const result = await sequelize.query<IVirtualFolder>(
    `INSERT INTO virtual_folders (
      organization_id, name, description, parent_id, color, icon, created_by, created_at, updated_at
    ) VALUES (
      :organization_id, :name, :description, :parent_id, :color, :icon, :created_by, NOW(), NOW()
    ) RETURNING *`,
    {
      replacements: {
        organization_id: organizationId,
        name: folder.name.trim(),
        description: folder.description || null,
        parent_id: folder.parent_id || null,
        color: folder.color || null,
        icon: folder.icon || null,
        created_by: userId,
      },
      type: QueryTypes.SELECT,
      transaction,
    }
  );
  return result[0];
};

/**
 * Update an existing folder
 */
export const updateFolderByIdQuery = async (
  id: number,
  folder: IVirtualFolderUpdate,
  organizationId: number,
  transaction?: Transaction
): Promise<IVirtualFolder | null> => {
  // Build dynamic SET clause
  const updates: string[] = [];
  const replacements: Record<string, unknown> = { organizationId, id };

  if (folder.name !== undefined) {
    updates.push("name = :name");
    replacements.name = folder.name.trim();
  }
  if (folder.description !== undefined) {
    updates.push("description = :description");
    replacements.description = folder.description;
  }
  if (folder.parent_id !== undefined) {
    updates.push("parent_id = :parent_id");
    replacements.parent_id = folder.parent_id;
  }
  if (folder.color !== undefined) {
    updates.push("color = :color");
    replacements.color = folder.color;
  }
  if (folder.icon !== undefined) {
    updates.push("icon = :icon");
    replacements.icon = folder.icon;
  }

  if (updates.length === 0) {
    return getFolderByIdQuery(organizationId, id);
  }

  updates.push("updated_at = NOW()");

  const result = await sequelize.query<IVirtualFolder>(
    `UPDATE virtual_folders
     SET ${updates.join(", ")}
     WHERE organization_id = :organizationId AND id = :id AND is_system = false
     RETURNING *`,
    {
      replacements,
      type: QueryTypes.SELECT,
      transaction,
    }
  );

  return result.length > 0 ? result[0] : null;
};

/**
 * Delete a folder by ID
 * Note: CASCADE will handle child folders and file mappings
 */
export const deleteFolderByIdQuery = async (
  organizationId: number,
  id: number,
  transaction?: Transaction
): Promise<boolean> => {
  const result = await sequelize.query<{ id: number }>(
    `DELETE FROM virtual_folders
     WHERE organization_id = :organizationId AND id = :id AND is_system = false
     RETURNING id`,
    {
      replacements: { organizationId, id },
      type: QueryTypes.SELECT,
      transaction,
    }
  );
  return result.length > 0;
};

/**
 * Check if folder name exists in parent (for uniqueness validation)
 */
export const checkFolderNameExistsQuery = async (
  organizationId: number,
  name: string,
  parentId: number | null,
  excludeId?: number
): Promise<boolean> => {
  const result = await sequelize.query(
    `SELECT 1 FROM virtual_folders
     WHERE organization_id = :organizationId
     AND LOWER(name) = LOWER(:name)
     AND (
       (:parentId IS NULL AND parent_id IS NULL)
       OR parent_id = :parentId
     )
     ${excludeId ? 'AND id != :excludeId' : ''}
     LIMIT 1`,
    {
      replacements: { organizationId, name: name.trim(), parentId, excludeId },
      type: QueryTypes.SELECT,
    }
  );
  return result.length > 0;
};

// ============================================================================
// FILE-FOLDER MAPPING OPERATIONS
// ============================================================================

/**
 * Get files in a folder
 * Optimized to fetch file folders in a single query to avoid N+1 problem
 */
export const getFilesInFolderQuery = async (
  organizationId: number,
  folderId: number
): Promise<IFileWithFolders[]> => {
  // Get files in the specified folder
  const filesResult = await sequelize.query(
    `SELECT
      f.id,
      f.filename,
      f.size,
      COALESCE(f.type, 'application/octet-stream') as mimetype,
      f.uploaded_time as upload_date,
      f.uploaded_by,
      f.project_id,
      f.source,
      p.project_title,
      u.name as uploader_name,
      u.surname as uploader_surname
    FROM files f
    INNER JOIN file_folder_mappings ffm ON f.id = ffm.file_id AND ffm.organization_id = :organizationId
    LEFT JOIN users u ON f.uploaded_by = u.id
    LEFT JOIN projects p ON f.project_id = p.id AND p.organization_id = :organizationId
    WHERE f.organization_id = :organizationId AND ffm.folder_id = :folderId
    ORDER BY f.uploaded_time DESC`,
    {
      replacements: { organizationId, folderId },
      type: QueryTypes.SELECT,
    }
  );

  const files = filesResult as IFileWithFolders[];
  if (files.length === 0) {
    return [];
  }

  // Get all folder assignments for these files in a single query
  const fileIds = files.map(f => f.id);
  const folderAssignments = await sequelize.query<{
    file_id: number;
    folder_id: number;
    folder_name: string;
    folder_description: string | null;
    folder_parent_id: number | null;
    folder_color: string | null;
    folder_icon: string | null;
    folder_is_system: boolean;
    folder_created_by: number;
    folder_created_at: Date;
    folder_updated_at: Date;
  }>(
    `SELECT
      ffm.file_id,
      vf.id as folder_id,
      vf.name as folder_name,
      vf.description as folder_description,
      vf.parent_id as folder_parent_id,
      vf.color as folder_color,
      vf.icon as folder_icon,
      vf.is_system as folder_is_system,
      vf.created_by as folder_created_by,
      vf.created_at as folder_created_at,
      vf.updated_at as folder_updated_at
    FROM file_folder_mappings ffm
    INNER JOIN virtual_folders vf ON vf.id = ffm.folder_id AND vf.organization_id = :organizationId
    WHERE ffm.organization_id = :organizationId AND ffm.file_id IN (:fileIds)
    ORDER BY vf.name ASC`,
    {
      replacements: { organizationId, fileIds },
      type: QueryTypes.SELECT,
    }
  );

  // Group folder assignments by file ID
  const foldersByFileId = new Map<number, IVirtualFolder[]>();
  for (const assignment of folderAssignments) {
    const folder: IVirtualFolder = {
      id: assignment.folder_id,
      name: assignment.folder_name,
      description: assignment.folder_description,
      parent_id: assignment.folder_parent_id,
      color: assignment.folder_color,
      icon: assignment.folder_icon,
      is_system: assignment.folder_is_system,
      created_by: assignment.folder_created_by,
      created_at: assignment.folder_created_at,
      updated_at: assignment.folder_updated_at,
    };

    if (!foldersByFileId.has(assignment.file_id)) {
      foldersByFileId.set(assignment.file_id, []);
    }
    foldersByFileId.get(assignment.file_id)!.push(folder);
  }

  // Assign folders to each file
  for (const file of files) {
    file.folders = foldersByFileId.get(file.id) || [];
  }

  return files;
};

/**
 * Get uncategorized files (files not assigned to any folder)
 */
export const getUncategorizedFilesQuery = async (
  organizationId: number
): Promise<IFileWithFolders[]> => {
  const result = await sequelize.query(
    `SELECT
      f.id,
      f.filename,
      f.size,
      COALESCE(f.type, 'application/octet-stream') as mimetype,
      f.uploaded_time as upload_date,
      f.uploaded_by,
      f.project_id,
      f.source,
      p.project_title,
      u.name as uploader_name,
      u.surname as uploader_surname
    FROM files f
    LEFT JOIN users u ON f.uploaded_by = u.id
    LEFT JOIN projects p ON f.project_id = p.id AND p.organization_id = :organizationId
    WHERE f.organization_id = :organizationId AND NOT EXISTS (
      SELECT 1 FROM file_folder_mappings ffm
      WHERE ffm.organization_id = :organizationId AND ffm.file_id = f.id
    )
    ORDER BY f.uploaded_time DESC`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    }
  );

  // Add empty folders array for uncategorized files
  return (result as IFileWithFolders[]).map(file => ({
    ...file,
    folders: [],
  }));
};

/**
 * Get all folders that a file belongs to
 */
export const getFileFoldersQuery = async (
  organizationId: number,
  fileId: number
): Promise<IVirtualFolder[]> => {
  const result = await sequelize.query(
    `SELECT vf.*
    FROM virtual_folders vf
    INNER JOIN file_folder_mappings ffm ON vf.id = ffm.folder_id AND ffm.organization_id = :organizationId
    WHERE vf.organization_id = :organizationId AND ffm.file_id = :fileId
    ORDER BY vf.name ASC`,
    {
      replacements: { organizationId, fileId },
      type: QueryTypes.SELECT,
    }
  );
  return result as IVirtualFolder[];
};

/**
 * Assign files to a folder
 */
export const assignFilesToFolderQuery = async (
  organizationId: number,
  folderId: number,
  fileIds: number[],
  userId: number,
  transaction?: Transaction
): Promise<number> => {
  if (fileIds.length === 0) return 0;

  // Use INSERT ... ON CONFLICT DO NOTHING to handle duplicates gracefully
  const values = fileIds
    .map((_, i) => `(:organizationId, :file_id_${i}, :folderId, :userId, NOW())`)
    .join(", ");

  const replacements: Record<string, unknown> = {
    organizationId,
    folderId,
    userId,
  };
  fileIds.forEach((fileId, i) => {
    replacements[`file_id_${i}`] = fileId;
  });

  const result = await sequelize.query<{ id: number }>(
    `INSERT INTO file_folder_mappings (organization_id, file_id, folder_id, assigned_by, assigned_at)
     VALUES ${values}
     ON CONFLICT (organization_id, file_id, folder_id) DO NOTHING
     RETURNING id`,
    {
      replacements,
      type: QueryTypes.SELECT,
      transaction,
    }
  );

  return result.length;
};

/**
 * Remove a file from a folder
 */
export const removeFileFromFolderQuery = async (
  organizationId: number,
  folderId: number,
  fileId: number,
  transaction?: Transaction
): Promise<boolean> => {
  const result = await sequelize.query<{ id: number }>(
    `DELETE FROM file_folder_mappings
     WHERE organization_id = :organizationId AND folder_id = :folderId AND file_id = :fileId
     RETURNING id`,
    {
      replacements: { organizationId, folderId, fileId },
      type: QueryTypes.SELECT,
      transaction,
    }
  );
  return result.length > 0;
};

/**
 * Bulk update file folder assignments (replace all folder assignments for a file)
 */
export const bulkUpdateFileFoldersQuery = async (
  organizationId: number,
  fileId: number,
  folderIds: number[],
  userId: number,
  transaction?: Transaction
): Promise<void> => {
  // Delete existing assignments
  await sequelize.query(
    `DELETE FROM file_folder_mappings WHERE organization_id = :organizationId AND file_id = :fileId`,
    {
      replacements: { organizationId, fileId },
      transaction,
    }
  );

  // Add new assignments
  if (folderIds.length > 0) {
    const values = folderIds
      .map((_, i) => `(:organizationId, :fileId, :folder_id_${i}, :userId, NOW())`)
      .join(", ");

    const replacements: Record<string, unknown> = {
      organizationId,
      fileId,
      userId,
    };
    folderIds.forEach((folderId, i) => {
      replacements[`folder_id_${i}`] = folderId;
    });

    await sequelize.query(
      `INSERT INTO file_folder_mappings (organization_id, file_id, folder_id, assigned_by, assigned_at)
       VALUES ${values}`,
      {
        replacements,
        transaction,
      }
    );
  }
};

/**
 * Get folder path (breadcrumb) from root to folder
 */
export const getFolderPathQuery = async (
  organizationId: number,
  folderId: number
): Promise<IVirtualFolder[]> => {
  const result = await sequelize.query(
    `WITH RECURSIVE folder_path AS (
      SELECT id, name, parent_id, description, color, icon, is_system, created_by, created_at, updated_at, 1 as level
      FROM virtual_folders
      WHERE organization_id = :organizationId AND id = :folderId

      UNION ALL

      SELECT vf.id, vf.name, vf.parent_id, vf.description, vf.color, vf.icon, vf.is_system, vf.created_by, vf.created_at, vf.updated_at, fp.level + 1
      FROM virtual_folders vf
      INNER JOIN folder_path fp ON vf.id = fp.parent_id
      WHERE vf.organization_id = :organizationId
    )
    SELECT * FROM folder_path ORDER BY level DESC`,
    {
      replacements: { organizationId, folderId },
      type: QueryTypes.SELECT,
    }
  );
  return result as IVirtualFolder[];
};

/**
 * Check if moving folder would create a circular reference
 */
export const wouldCreateCircularReferenceQuery = async (
  organizationId: number,
  folderId: number,
  newParentId: number
): Promise<boolean> => {
  if (folderId === newParentId) return true;

  // Check if newParentId is a descendant of folderId
  const result = await sequelize.query(
    `WITH RECURSIVE descendants AS (
      SELECT id FROM virtual_folders WHERE organization_id = :organizationId AND parent_id = :folderId
      UNION ALL
      SELECT vf.id FROM virtual_folders vf
      INNER JOIN descendants d ON vf.parent_id = d.id
      WHERE vf.organization_id = :organizationId
    )
    SELECT 1 FROM descendants WHERE id = :newParentId LIMIT 1`,
    {
      replacements: { organizationId, folderId, newParentId },
      type: QueryTypes.SELECT,
    }
  );
  return result.length > 0;
};
