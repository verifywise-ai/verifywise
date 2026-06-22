import { getFileById, getFileMetadataByProjectId } from "../../utils/fileUpload.utils";
import {
  createFolderQuery,
  assignFilesToFolderQuery,
  removeFileFromFolderQuery,
} from "../../utils/virtualFolder.utils";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

// ============================================================================
// Read Tools
// ============================================================================

const fetchFiles = async (
  params: { project_id?: number; entity_type?: string; limit?: number },
  organizationId: number,
) => {
  try {
    let files: any[] = [];

    if (params.project_id) {
      files = await getFileMetadataByProjectId(params.project_id, organizationId);
    } else {
      const [result] = (await sequelize.query(
        `SELECT
          f.id, f.filename, f.project_id, f.uploaded_time, f.source, f.size, f.type,
          u.name AS uploader_name, u.surname AS uploader_surname,
          p.project_title
        FROM files f
        LEFT JOIN users u ON f.uploaded_by = u.id
        LEFT JOIN projects p ON f.project_id = p.id AND p.organization_id = :organizationId
        WHERE f.organization_id = :organizationId
        ORDER BY f.uploaded_time DESC`,
        { replacements: { organizationId } },
      )) as [any[], number];
      files = result || [];
    }

    if (params.entity_type) {
      const [entityFiles] = (await sequelize.query(
        `SELECT
          f.id, f.filename, f.project_id, f.uploaded_time, f.source, f.size, f.type,
          u.name AS uploader_name, u.surname AS uploader_surname
        FROM files f
        LEFT JOIN users u ON f.uploaded_by = u.id
        WHERE f.organization_id = :organizationId AND f.source = :entity_type
        ORDER BY f.uploaded_time DESC`,
        { replacements: { organizationId, entity_type: params.entity_type } },
      )) as [any[], number];
      files = entityFiles || [];
    }

    if (params.limit && params.limit > 0) {
      files = files.slice(0, params.limit);
    }

    return {
      files,
      total: files.length,
    };
  } catch (error) {
    logger.error("Error fetching files:", error);
    throw new Error(
      `Failed to fetch files: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getFileDetail = async (params: { file_id: number }, organizationId: number) => {
  try {
    const file = await getFileById(params.file_id, organizationId);
    if (!file) {
      return { message: "File not found.", file_id: params.file_id };
    }
    // Return metadata without binary content
    return {
      id: (file as any).id,
      filename: (file as any).filename,
      type: (file as any).type,
      size: (file as any).size,
      project_id: (file as any).project_id,
      uploaded_by: (file as any).uploaded_by,
      uploaded_time: (file as any).uploaded_time,
      source: (file as any).source,
      file_path: (file as any).file_path,
    };
  } catch (error) {
    logger.error("Error fetching file detail:", error);
    throw new Error(
      `Failed to fetch file detail: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getFilesByEntity = async (
  params: { entity_type: string; entity_id: number },
  organizationId: number,
) => {
  try {
    const [files] = (await sequelize.query(
      `SELECT
        f.id, f.filename, f.project_id, f.uploaded_time, f.source, f.size, f.type,
        u.name AS uploader_name, u.surname AS uploader_surname
      FROM files f
      LEFT JOIN users u ON f.uploaded_by = u.id
      WHERE f.organization_id = :organizationId AND f.source = :entity_type
        AND (f.project_id = :entity_id OR f.org_id = :entity_id OR f.model_id = :entity_id)
      ORDER BY f.uploaded_time DESC`,
      {
        replacements: {
          organizationId,
          entity_type: params.entity_type,
          entity_id: params.entity_id,
        },
      },
    )) as [any[], number];

    return {
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      files: files || [],
      total: (files || []).length,
    };
  } catch (error) {
    logger.error("Error fetching files by entity:", error);
    throw new Error(
      `Failed to fetch files by entity: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getFileChangeHistory = async (params: { file_id: number }, organizationId: number) => {
  try {
    const file = await getFileById(params.file_id, organizationId);
    if (!file) {
      return { message: "File not found.", file_id: params.file_id };
    }

    // Get folder assignment history
    const [folderHistory] = (await sequelize.query(
      `SELECT
        ffm.folder_id, vf.name as folder_name, ffm.assigned_at, ffm.assigned_by,
        u.name as assigned_by_name
      FROM file_folder_mappings ffm
      LEFT JOIN virtual_folders vf ON ffm.folder_id = vf.id AND vf.organization_id = :organizationId
      LEFT JOIN users u ON ffm.assigned_by = u.id
      WHERE ffm.organization_id = :organizationId AND ffm.file_id = :file_id
      ORDER BY ffm.assigned_at DESC`,
      { replacements: { organizationId, file_id: params.file_id } },
    )) as [any[], number];

    return {
      file_id: params.file_id,
      filename: (file as any).filename,
      uploaded_time: (file as any).uploaded_time,
      folder_assignments: folderHistory || [],
    };
  } catch (error) {
    logger.error("Error fetching file change history:", error);
    throw new Error(
      `Failed to fetch file change history: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getFileAnalytics = async (_params: Record<string, unknown>, organizationId: number) => {
  try {
    const [totalResult] = (await sequelize.query(
      `SELECT
        COUNT(*)::INTEGER as total_files,
        COALESCE(SUM(size), 0)::BIGINT as total_size_bytes
      FROM files
      WHERE organization_id = :organizationId`,
      { replacements: { organizationId } },
    )) as [any[], number];

    const [byProject] = (await sequelize.query(
      `SELECT p.project_title, COUNT(f.id)::INTEGER as file_count, COALESCE(SUM(f.size), 0)::BIGINT as total_size
      FROM files f
      LEFT JOIN projects p ON f.project_id = p.id AND p.organization_id = :organizationId
      WHERE f.organization_id = :organizationId AND f.project_id IS NOT NULL
      GROUP BY p.project_title
      ORDER BY file_count DESC`,
      { replacements: { organizationId } },
    )) as [any[], number];

    const [byType] = (await sequelize.query(
      `SELECT type, COUNT(*)::INTEGER as count
      FROM files
      WHERE organization_id = :organizationId
      GROUP BY type
      ORDER BY count DESC`,
      { replacements: { organizationId } },
    )) as [any[], number];

    const [bySource] = (await sequelize.query(
      `SELECT source, COUNT(*)::INTEGER as count
      FROM files
      WHERE organization_id = :organizationId
      GROUP BY source
      ORDER BY count DESC`,
      { replacements: { organizationId } },
    )) as [any[], number];

    const [uncategorizedResult] = (await sequelize.query(
      `SELECT COUNT(*)::INTEGER as uncategorized_count
      FROM files f
      WHERE f.organization_id = :organizationId AND NOT EXISTS (
        SELECT 1 FROM file_folder_mappings ffm
        WHERE ffm.organization_id = :organizationId AND ffm.file_id = f.id
      )`,
      { replacements: { organizationId } },
    )) as [any[], number];

    return {
      totals: totalResult[0] || { total_files: 0, total_size_bytes: 0 },
      by_project: byProject || [],
      by_type: byType || [],
      by_source: bySource || [],
      uncategorized_files: (uncategorizedResult[0] as any)?.uncategorized_count || 0,
    };
  } catch (error) {
    logger.error("Error getting file analytics:", error);
    throw new Error(
      `Failed to get file analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getFileExecutiveSummary = async (
  _params: Record<string, unknown>,
  organizationId: number,
) => {
  try {
    const [summary] = (await sequelize.query(
      `SELECT
        (SELECT COUNT(*)::INTEGER FROM files WHERE organization_id = :organizationId) as total_files,
        (SELECT COALESCE(SUM(size), 0)::BIGINT FROM files WHERE organization_id = :organizationId) as total_storage_bytes,
        (SELECT COUNT(*)::INTEGER FROM files f WHERE f.organization_id = :organizationId AND NOT EXISTS (
          SELECT 1 FROM file_folder_mappings ffm WHERE ffm.organization_id = :organizationId AND ffm.file_id = f.id
        )) as uncategorized_files,
        (SELECT COUNT(*)::INTEGER FROM files WHERE organization_id = :organizationId AND uploaded_time >= NOW() - INTERVAL '7 days') as recent_uploads_7d,
        (SELECT COUNT(*)::INTEGER FROM virtual_folders WHERE organization_id = :organizationId) as total_folders`,
      { replacements: { organizationId } },
    )) as [any[], number];

    const [topUploaders] = (await sequelize.query(
      `SELECT u.name, u.surname, COUNT(f.id)::INTEGER as upload_count
      FROM files f
      JOIN users u ON f.uploaded_by = u.id
      WHERE f.organization_id = :organizationId
      GROUP BY u.name, u.surname
      ORDER BY upload_count DESC
      LIMIT 5`,
      { replacements: { organizationId } },
    )) as [any[], number];

    return {
      ...(summary[0] || {
        total_files: 0,
        total_storage_bytes: 0,
        uncategorized_files: 0,
        recent_uploads_7d: 0,
        total_folders: 0,
      }),
      top_uploaders: topUploaders || [],
    };
  } catch (error) {
    logger.error("Error getting file executive summary:", error);
    throw new Error(
      `Failed to get file executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// ============================================================================
// Write Tools (Human Confirmation Flow)
// ============================================================================

const agentAttachFileToEntity = createWriteToolFn({
  toolName: "agent_attach_file_to_entity",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Attach file #${params.file_id} to ${params.entity_type} #${params.entity_id}`,
  executeFn: async (params, organizationId) => {
    const fileId = params.file_id as number;
    const entityType = params.entity_type as string;
    const entityId = params.entity_id as number;

    // Update the file's source and associated entity reference
    await sequelize.query(
      `UPDATE files SET source = :entity_type, project_id = CASE WHEN :entity_type = 'project' THEN :entity_id ELSE project_id END,
       org_id = CASE WHEN :entity_type = 'organization' THEN :entity_id ELSE org_id END,
       model_id = CASE WHEN :entity_type = 'model' THEN :entity_id ELSE model_id END
       WHERE organization_id = :organizationId AND id = :file_id`,
      {
        replacements: {
          organizationId,
          file_id: fileId,
          entity_type: entityType,
          entity_id: entityId,
        },
      },
    );
    return {
      file_id: fileId,
      entity_type: entityType,
      entity_id: entityId,
      message: "File attached to entity successfully",
    };
  },
});

const agentDetachFileFromEntity = createWriteToolFn({
  toolName: "agent_detach_file_from_entity",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Detach file #${params.file_id} from ${params.entity_type} #${params.entity_id}`,
  executeFn: async (params, organizationId) => {
    const fileId = params.file_id as number;
    const entityType = params.entity_type as string;
    const entityId = params.entity_id as number;

    // Clear the entity association based on type
    await sequelize.query(
      `UPDATE files SET
       project_id = CASE WHEN :entity_type = 'project' AND project_id = :entity_id THEN NULL ELSE project_id END,
       org_id = CASE WHEN :entity_type = 'organization' AND org_id = :entity_id THEN NULL ELSE org_id END,
       model_id = CASE WHEN :entity_type = 'model' AND model_id = :entity_id THEN NULL ELSE model_id END
       WHERE organization_id = :organizationId AND id = :file_id`,
      {
        replacements: {
          organizationId,
          file_id: fileId,
          entity_type: entityType,
          entity_id: entityId,
        },
      },
    );
    return {
      file_id: fileId,
      entity_type: entityType,
      entity_id: entityId,
      message: "File detached from entity successfully",
    };
  },
});

const agentCreateVirtualFolder = createWriteToolFn({
  toolName: "agent_create_virtual_folder",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Create virtual folder "${params.name}"${params.parent_folder_id ? ` under folder #${params.parent_folder_id}` : ""}`,
  executeFn: async (params, organizationId) => {
    const folder = await createFolderQuery(
      {
        name: params.name as string,
        parent_id: (params.parent_folder_id as number) || undefined,
      },
      (params._userId as number) || 0,
      organizationId,
    );
    return { id: folder.id, name: folder.name, message: "Virtual folder created successfully" };
  },
});

const agentAssignFileToFolder = createWriteToolFn({
  toolName: "agent_assign_file_to_folder",
  warningLevel: "warning",
  descriptionFn: (params) => `Assign file #${params.file_id} to folder #${params.folder_id}`,
  executeFn: async (params, organizationId) => {
    const fileId = params.file_id as number;
    const folderId = params.folder_id as number;

    const count = await assignFilesToFolderQuery(
      organizationId,
      folderId,
      [fileId],
      (params._userId as number) || 0,
    );
    return {
      file_id: fileId,
      folder_id: folderId,
      assigned: count > 0,
      message: "File assigned to folder successfully",
    };
  },
});

const agentRemoveFileFromFolder = createWriteToolFn({
  toolName: "agent_remove_file_from_folder",
  warningLevel: "warning",
  descriptionFn: (params) => `Remove file #${params.file_id} from folder #${params.folder_id}`,
  executeFn: async (params, organizationId) => {
    const fileId = params.file_id as number;
    const folderId = params.folder_id as number;

    const removed = await removeFileFromFolderQuery(organizationId, folderId, fileId);
    return {
      file_id: fileId,
      folder_id: folderId,
      removed,
      message: "File removed from folder successfully",
    };
  },
});

// ============================================================================
// Export
// ============================================================================

const availableFileManagementTools: any = {
  fetch_files: fetchFiles,
  get_file_detail: getFileDetail,
  get_files_by_entity: getFilesByEntity,
  get_file_change_history: getFileChangeHistory,
  get_file_analytics: getFileAnalytics,
  get_file_executive_summary: getFileExecutiveSummary,
  agent_attach_file_to_entity: agentAttachFileToEntity,
  agent_detach_file_from_entity: agentDetachFileFromEntity,
  agent_create_virtual_folder: agentCreateVirtualFolder,
  agent_assign_file_to_folder: agentAssignFileToFolder,
  agent_remove_file_from_folder: agentRemoveFileFromFolder,
};

export { availableFileManagementTools };
