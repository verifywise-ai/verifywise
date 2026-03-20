/**
 * @fileoverview File Repository
 *
 * Consolidated repository for all file-related database operations.
 * Handles both project-level and organization-level files in a unified
 * files table following the repository pattern.
 *
 * Uses shared-schema multi-tenancy with organization_id column for isolation.
 *
 * @module repositories/file
 */

import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { FileModel, FileSource } from "../domain.layer/models/file/file.model";
import { ProjectModel } from "../domain.layer/models/project/project.model";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import sanitizeFilename from "sanitize-filename";

// Re-export FileSource for backward compatibility
export { FileSource };

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size?: number;
}

export interface FileMetadata {
  id: number;
  filename: string;
  project_id?: number;
  uploaded_time?: string;
  source?: string;
  uploader_name?: string;
  uploader_surname?: string;
}

export type ReviewStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'expired' | 'superseded';

export interface OrganizationFileMetadata {
  id: number;
  filename: string;
  size?: number;
  mimetype?: string;
  upload_date?: string;
  uploaded_by?: number;
  org_id?: number;
  project_id?: number | null;
  model_id?: number;
  source?: string;
  uploader_name?: string;
  uploader_surname?: string;
  // New metadata fields
  tags?: string[];
  review_status?: ReviewStatus;
  version?: string;
  expiry_date?: string;
  last_modified_by?: number;
  last_modifier_name?: string;
  last_modifier_surname?: string;
  description?: string;
  file_group_id?: string;
  // Approval workflow support
  approval_workflow_id?: number;
  approval_workflow_name?: string;
}

export interface UpdateFileMetadataInput {
  tags?: string[];
  review_status?: ReviewStatus;
  version?: string;
  expiry_date?: string | null;
  description?: string | null;
  last_modified_by: number;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface FileAccessLog {
  id: number;
  file_id: number;
  accessed_by: number;
  access_date: Date;
  action: "download" | "view";
  user_name?: string;
  user_surname?: string;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validates organization ID to prevent SQL injection
 *
 * @param organizationId - The organization ID to validate
 * @throws {ValidationException} If organizationId is invalid
 */
function validateOrganizationId(organizationId: number): void {
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    throw new ValidationException("Invalid organization identifier");
  }
}

/**
 * Sanitizes filename to remove dangerous characters
 *
 * @param name - The filename to sanitize
 * @returns Sanitized filename with dangerous characters removed
 */
function sanitizeFilenameStr(name: string): string {
  // Use industry-standard sanitization first, fallback to regex
  const sanitized = sanitizeFilename(name);
  return sanitized || name.replace(/[^a-zA-Z0-9-_\.]/g, "_");
}

// ============================================================================
// Project Files Repository (files table)
// ============================================================================

/**
 * Uploads a file to project files table
 *
 * @param file - The uploaded file containing buffer and metadata
 * @param userId - ID of the user uploading the file
 * @param projectId - ID of the project (null for organization-level files)
 * @param source - Source identifier for the file
 * @param organizationId - Organization ID for tenant isolation
 * @param transaction - Optional database transaction
 * @returns The created file record
 */
export async function uploadProjectFile(
  file: UploadedFile,
  userId: number,
  projectId: number | null,
  source: FileSource,
  organizationId: number,
  transaction: Transaction | null = null
): Promise<FileModel> {
  validateOrganizationId(organizationId);

  let isDemo = false;
  if (projectId) {
    const projectResult = await sequelize.query(
      `SELECT is_demo FROM projects WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: { organizationId, id: projectId },
        mapToModel: true,
        model: ProjectModel,
        ...(transaction && { transaction }),
      }
    );
    isDemo = projectResult[0]?.is_demo || false;
  }

  const query = `
    INSERT INTO files
      (organization_id, filename, content, type, project_id, uploaded_by, uploaded_time, is_demo, source)
    VALUES
      (:organizationId, :filename, :content, :type, :project_id, :uploaded_by, :uploaded_time, :is_demo, :source)
    RETURNING *`;

  const result = await sequelize.query(query, {
    replacements: {
      organizationId,
      filename: sanitizeFilenameStr(file.originalname),
      content: file.buffer,
      project_id: projectId,
      type: file.mimetype,
      uploaded_by: userId,
      uploaded_time: new Date().toISOString(),
      is_demo: isDemo,
      source,
    },
    mapToModel: true,
    model: FileModel,
    ...(transaction && { transaction }),
  });

  return Array.isArray(result[0]) && result[0].length > 0
    ? result[0][0]
    : (result[0] as FileModel);
}

/**
 * Gets a project file by ID
 *
 * @param id - The file ID to retrieve
 * @param organizationId - Organization ID for tenant isolation
 * @returns The file record or null if not found
 */
export async function getProjectFileById(
  id: number,
  organizationId: number
): Promise<FileModel | null> {
  validateOrganizationId(organizationId);

  const query = `SELECT * FROM files WHERE organization_id = :organizationId AND id = :id`;
  const result = await sequelize.query(query, {
    replacements: { organizationId, id },
    mapToModel: true,
    model: FileModel,
  });

  return result[0] || null;
}

/**
 * Deletes a project file by ID
 *
 * @param id - The file ID to delete
 * @param organizationId - Organization ID for tenant isolation
 * @param transaction - Database transaction for atomicity
 * @returns True if file was deleted, false otherwise
 */
export async function deleteProjectFileById(
  id: number,
  organizationId: number,
  transaction: Transaction
): Promise<boolean> {
  validateOrganizationId(organizationId);

  // Clean up any virtual folder mappings for this file
  await sequelize.query(
    `DELETE FROM file_folder_mappings WHERE organization_id = :organizationId AND file_id = :id`,
    {
      replacements: { organizationId, id },
      transaction,
    }
  );

  const query = `DELETE FROM files WHERE organization_id = :organizationId AND id = :id RETURNING id`;
  const result = await sequelize.query(query, {
    replacements: { organizationId, id },
    mapToModel: true,
    model: FileModel,
    transaction,
  });

  return result.length > 0;
}

/**
 * Gets file metadata for a project
 *
 * @param projectId - The project ID to get files for
 * @param organizationId - Organization ID for tenant isolation
 * @returns Array of file metadata with uploader information
 */
export async function getProjectFileMetadata(
  projectId: number,
  organizationId: number
): Promise<FileMetadata[]> {
  validateOrganizationId(organizationId);

  const query = `
    SELECT
      f.id,
      f.filename,
      f.project_id,
      f.uploaded_time,
      f.source,
      u.name AS uploader_name,
      u.surname AS uploader_surname
    FROM files f
    JOIN users u ON f.uploaded_by = u.id
    WHERE f.organization_id = :organizationId AND project_id = :project_id
    ORDER BY uploaded_time DESC, id ASC`;

  const result = await sequelize.query(query, {
    replacements: { organizationId, project_id: projectId },
    type: QueryTypes.SELECT,
  });

  return result as FileMetadata[];
}

// ============================================================================
// Organization Files Repository (org-level files in files table)
// ============================================================================

/**
 * Options for uploading organization-level files
 */
export interface UploadOrganizationFileOptions {
  modelId?: number;
  source?: FileSource;
  approvalWorkflowId?: number;
  transaction?: Transaction;
}

/**
 * Uploads an organization-level file (no project association)
 *
 * @param file - The Express multer file object
 * @param userId - ID of the user uploading the file
 * @param orgId - Organization ID for the file
 * @param organizationId - Organization ID for tenant isolation
 * @param options - Optional settings including modelId, source, approvalWorkflowId, and transaction
 * @returns The created file record
 */
export async function uploadOrganizationFile(
  file: Express.Multer.File,
  userId: number,
  orgId: number,
  organizationId: number,
  options?: UploadOrganizationFileOptions
): Promise<OrganizationFileMetadata>;

/**
 * @deprecated Use the options object overload instead
 */
export async function uploadOrganizationFile(
  file: Express.Multer.File,
  userId: number,
  orgId: number,
  organizationId: number,
  modelId?: number,
  source?: FileSource,
  transaction?: Transaction
): Promise<OrganizationFileMetadata>;

export async function uploadOrganizationFile(
  file: Express.Multer.File,
  userId: number,
  orgId: number,
  organizationId: number,
  modelIdOrOptions?: number | UploadOrganizationFileOptions,
  source?: FileSource,
  transaction?: Transaction
): Promise<OrganizationFileMetadata> {
  validateOrganizationId(organizationId);

  // Handle both old and new signatures
  let modelId: number | undefined;
  let finalSource: FileSource | undefined;
  let approvalWorkflowId: number | undefined;
  let txn: Transaction | undefined;

  if (typeof modelIdOrOptions === 'object' && modelIdOrOptions !== null) {
    // New signature with options object
    modelId = modelIdOrOptions.modelId;
    finalSource = modelIdOrOptions.source;
    approvalWorkflowId = modelIdOrOptions.approvalWorkflowId;
    txn = modelIdOrOptions.transaction;
  } else {
    // Old signature for backward compatibility
    modelId = modelIdOrOptions;
    finalSource = source;
    txn = transaction;
  }

  const safeName = sanitizeFilenameStr(file.originalname);

  // If approval workflow is selected, set status to pending_review
  const reviewStatus = approvalWorkflowId ? 'pending_review' : 'draft';

  const query = `
    INSERT INTO files
      (organization_id, filename, size, type, file_path, content, uploaded_by, uploaded_time, model_id, org_id, is_demo, source, project_id, file_group_id, review_status, version, approval_workflow_id)
    VALUES
      (:organizationId, :filename, :size, :mimetype, :file_path, :content, :uploaded_by, NOW(), :model_id, :org_id, false, :source, NULL, gen_random_uuid(), :review_status, '1.0', :approval_workflow_id)
    RETURNING id, filename, size, type AS mimetype, file_path, uploaded_by, uploaded_time AS upload_date, model_id, org_id, is_demo, source, project_id, file_group_id, review_status, version, approval_workflow_id`;

  const result = await sequelize.query(query, {
    replacements: {
      organizationId,
      filename: safeName,
      size: file.size,
      mimetype: file.mimetype,
      uploaded_by: userId,
      org_id: orgId,
      model_id: modelId ?? null,
      file_path: safeName,
      content: file.buffer,
      source: finalSource ?? "File Manager",
      review_status: reviewStatus,
      approval_workflow_id: approvalWorkflowId ?? null,
    },
    type: QueryTypes.SELECT,
    ...(txn && { transaction: txn }),
  });

  return result[0] as OrganizationFileMetadata;
}

/**
 * Gets a file by ID from the files table
 *
 * @param fileId - The file ID to retrieve
 * @param organizationId - Organization ID for tenant isolation
 * @returns The file record or null if not found
 */
export async function getFileById(
  fileId: number,
  organizationId: number
): Promise<FileModel | null> {
  validateOrganizationId(organizationId);

  const query = `SELECT * FROM files WHERE organization_id = :organizationId AND id = :fileId`;

  const result = await sequelize.query(query, {
    replacements: { organizationId, fileId },
    type: QueryTypes.SELECT,
  });

  return (result[0] as FileModel) || null;
}

/**
 * Deletes a file by ID from the files table
 *
 * @param fileId - The file ID to delete
 * @param organizationId - Organization ID for tenant isolation
 * @param transaction - Optional database transaction for atomicity
 * @returns True if file was deleted, false otherwise
 */
export async function deleteFileById(
  fileId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<boolean> {
  validateOrganizationId(organizationId);

  // If no transaction provided, create one to ensure atomicity of both operations
  const useProvidedTransaction = !!transaction;
  const txn = transaction || (await sequelize.transaction());

  try {
    // Clean up any virtual folder mappings for this file
    await sequelize.query(
      `DELETE FROM file_folder_mappings WHERE organization_id = :organizationId AND file_id = :fileId`,
      {
        replacements: { organizationId, fileId },
        transaction: txn,
      }
    );

    // Clean up file entity links (evidence/attachment associations)
    await sequelize.query(
      `DELETE FROM file_entity_links WHERE organization_id = :organizationId AND file_id = :fileId`,
      {
        replacements: { organizationId, fileId },
        transaction: txn,
      }
    );

    const query = `DELETE FROM files WHERE organization_id = :organizationId AND id = :fileId RETURNING id`;

    const result = await sequelize.query(query, {
      replacements: { organizationId, fileId },
      type: QueryTypes.SELECT,
      transaction: txn,
    });

    const deleted = Array.isArray(result) && result.length > 0;

    // Only commit if we created the transaction ourselves
    if (!useProvidedTransaction) {
      await txn.commit();
    }

    return deleted;
  } catch (error) {
    // Only rollback if we created the transaction ourselves
    if (!useProvidedTransaction) {
      await txn.rollback();
    }
    throw error;
  }
}

/**
 * Gets organization-level files (files without project association) with pagination
 *
 * @param orgId - Organization ID to get files for
 * @param organizationId - Organization ID for tenant isolation
 * @param options - Pagination options (limit and offset)
 * @returns Object containing files array and total count
 */
export async function getOrganizationFiles(
  organizationId: number,
  options: PaginationOptions = {}
): Promise<{ files: OrganizationFileMetadata[]; total: number }> {
  validateOrganizationId(organizationId);

  const { limit, offset } = options;

  // Show all files regardless of approval status - UI handles display
  // Use organization_id for tenant isolation (org_id may be NULL on migrated files)
  let query = `
    SELECT
      f.id,
      f.filename,
      f.size,
      f.type AS mimetype,
      f.uploaded_time AS upload_date,
      f.uploaded_by,
      f.org_id,
      f.model_id,
      f.source,
      f.review_status,
      f.approval_workflow_id,
      u.name AS uploader_name,
      u.surname AS uploader_surname
    FROM files f
    JOIN users u ON f.uploaded_by = u.id
    WHERE f.organization_id = :organizationId
      AND f.project_id IS NULL
      AND (f.source IS NULL OR f.source != 'policy_editor')
    ORDER BY f.uploaded_time DESC`;

  if (limit !== undefined) query += ` LIMIT :limit`;
  if (offset !== undefined) query += ` OFFSET :offset`;

  const files = await sequelize.query(query, {
    replacements: { organizationId, limit, offset },
    type: QueryTypes.SELECT,
  });

  const countQuery = `
    SELECT COUNT(*) as count
    FROM files
    WHERE organization_id = :organizationId
      AND project_id IS NULL
      AND (source IS NULL OR source != 'policy_editor')`;

  const countResult = await sequelize.query(countQuery, {
    replacements: { organizationId },
    type: QueryTypes.SELECT,
  });

  const countRow = countResult[0] as { count: string } | undefined;
  const total = countRow ? parseInt(countRow.count, 10) : 0;

  return { files: files as OrganizationFileMetadata[], total };
}

// ============================================================================
// File Access Logging
// ============================================================================

/**
 * Logs file access (download/view)
 *
 * @param fileId - The file ID being accessed
 * @param userId - ID of the user accessing the file
 * @param orgId - Organization ID for the log entry
 * @param action - Type of access action ('download' or 'view')
 * @param organizationId - Organization ID for tenant isolation
 * @param transaction - Optional database transaction for atomicity
 */
export async function logFileAccess(
  fileId: number,
  userId: number,
  orgId: number,
  action: "download" | "view",
  organizationId: number,
  transaction?: Transaction
): Promise<void> {
  validateOrganizationId(organizationId);

  const query = `
    INSERT INTO file_access_logs
      (organization_id, file_id, accessed_by, access_date, action, org_id)
    VALUES
      (:organizationId, :fileId, :userId, NOW(), :action, :orgId)`;

  await sequelize.query(query, {
    replacements: { organizationId, fileId, userId, action, orgId },
    type: QueryTypes.INSERT,
    ...(transaction && { transaction }),
  });
}

/**
 * Gets file access logs with pagination
 *
 * @param fileId - The file ID to get logs for
 * @param organizationId - Organization ID for tenant isolation
 * @param options - Pagination options (limit and offset)
 * @returns Array of file access log entries with user information
 */
export async function getFileAccessLogs(
  fileId: number,
  organizationId: number,
  options: PaginationOptions = {}
): Promise<FileAccessLog[]> {
  validateOrganizationId(organizationId);

  const { limit, offset } = options;

  let query = `
    SELECT
      fal.id,
      fal.file_id,
      fal.accessed_by,
      fal.access_date,
      fal.action,
      u.name AS user_name,
      u.surname AS user_surname
    FROM file_access_logs fal
    JOIN users u ON fal.accessed_by = u.id
    WHERE fal.organization_id = :organizationId AND fal.file_id = :fileId
    ORDER BY fal.access_date DESC`;

  if (limit !== undefined) query += ` LIMIT :limit`;
  if (offset !== undefined) query += ` OFFSET :offset`;

  const logs = await sequelize.query(query, {
    replacements: { organizationId, fileId, limit, offset },
    type: QueryTypes.SELECT,
  });

  return logs as FileAccessLog[];
}

// ============================================================================
// Full-text search on file content
// ============================================================================

export interface FileContentSearchOptions {
  limit?: number;
  offset?: number;
}

export interface FileSearchResult {
  id: number;
  filename: string;
  mimetype: string;
  size: number | null;
  upload_date: Date;
  uploaded_by: number;
  snippet?: string;
}

/**
 * Search organization-level files by extracted content using PostgreSQL FTS.
 *
 * @param orgId - Organization ID
 * @param organizationId - Organization ID for tenant isolation
 * @param queryText - User-entered search query
 * @param options - Pagination and scoping options
 */
export async function searchFilesByContent(
  organizationId: number,
  queryText: string,
  options: FileContentSearchOptions = {}
): Promise<{ files: FileSearchResult[] }> {
  validateOrganizationId(organizationId);

  const { limit, offset } = options;

  let query = `
    SELECT
      f.id,
      f.filename,
      f.type AS mimetype,
      f.size,
      f.uploaded_time AS upload_date,
      f.uploaded_by,
      -- Snippet is optional; if content_text is null we just return empty string
      COALESCE(
        ts_headline(
          'english',
          f.content_text,
          plainto_tsquery('english', :q),
          'MaxWords=35, MinWords=15'
        ),
        ''
      ) AS snippet
    FROM files f
    WHERE
      f.organization_id = :organizationId
      AND f.project_id IS NULL
      AND (f.source IS NULL OR f.source != 'policy_editor')
      AND f.content_search IS NOT NULL
      AND f.content_search @@ plainto_tsquery('english', :q)
    ORDER BY ts_rank(f.content_search, plainto_tsquery('english', :q)) DESC, f.uploaded_time DESC
  `;

  if (limit !== undefined) {
    query += ` LIMIT :limit`;
  }
  if (offset !== undefined) {
    query += ` OFFSET :offset`;
  }

  const files = await sequelize.query(query, {
    replacements: { organizationId, q: queryText, limit, offset },
    type: QueryTypes.SELECT,
  });

  return { files: files as FileSearchResult[] };
}

/**
 * Gets files associated with a specific model ID
 *
 * @param modelId - The model ID to get files for
 * @param organizationId - Organization ID for tenant isolation
 * @returns Array of files associated with the model
 */
export async function getFilesByModelId(
  modelId: number,
  organizationId: number
): Promise<OrganizationFileMetadata[]> {
  validateOrganizationId(organizationId);

  const query = `
    SELECT
      f.id,
      f.filename,
      f.size,
      f.type AS mimetype,
      f.uploaded_time AS upload_date,
      f.uploaded_by,
      f.org_id,
      f.model_id,
      f.source,
      u.name AS uploader_name,
      u.surname AS uploader_surname
    FROM files f
    JOIN users u ON f.uploaded_by = u.id
    WHERE f.organization_id = :organizationId AND f.model_id = :modelId
    ORDER BY f.uploaded_time DESC`;

  const files = await sequelize.query(query, {
    replacements: { organizationId, modelId },
    type: QueryTypes.SELECT,
  });

  return files as OrganizationFileMetadata[];
}

// ============================================================================
// File Metadata Operations
// ============================================================================

/**
 * Updates file metadata (tags, status, version, expiry date, description)
 *
 * @param fileId - The file ID to update
 * @param updates - The metadata fields to update
 * @param organizationId - Organization ID for tenant isolation
 * @param transaction - Optional database transaction for atomicity
 * @returns The updated file record or null if not found
 */
export async function updateFileMetadata(
  fileId: number,
  updates: UpdateFileMetadataInput,
  organizationId: number,
  transaction?: Transaction
): Promise<OrganizationFileMetadata | null> {
  validateOrganizationId(organizationId);

  const setClauses: string[] = [];
  const replacements: Record<string, unknown> = { organizationId, fileId };

  // Build dynamic SET clause
  if (updates.tags !== undefined) {
    setClauses.push('tags = :tags::jsonb');
    replacements.tags = JSON.stringify(updates.tags);
  }
  if (updates.review_status !== undefined) {
    setClauses.push('review_status = :review_status');
    replacements.review_status = updates.review_status;
  }
  if (updates.version !== undefined) {
    setClauses.push('version = :version');
    replacements.version = updates.version;
  }
  if (updates.expiry_date !== undefined) {
    setClauses.push('expiry_date = :expiry_date');
    replacements.expiry_date = updates.expiry_date;
  }
  if (updates.description !== undefined) {
    setClauses.push('description = :description');
    replacements.description = updates.description;
  }

  // Always update last_modified_by and updated_at
  setClauses.push('last_modified_by = :last_modified_by');
  setClauses.push('updated_at = NOW()');
  replacements.last_modified_by = updates.last_modified_by;

  // Since we always add last_modified_by, setClauses will never be empty
  // But if no actual updates are needed, return current file with metadata
  if (setClauses.length === 2) {
    // Only last_modified_by and updated_at - return current file
    return getFileWithMetadata(fileId, organizationId);
  }

  const query = `
    UPDATE files
    SET ${setClauses.join(', ')}
    WHERE organization_id = :organizationId AND id = :fileId
    RETURNING *`;

  const result = await sequelize.query(query, {
    replacements,
    type: QueryTypes.SELECT,
    ...(transaction && { transaction }),
  });

  return (result[0] as OrganizationFileMetadata) || null;
}

/**
 * Gets file with full metadata including modifier name
 *
 * @param fileId - The file ID to retrieve
 * @param organizationId - Organization ID for tenant isolation
 * @returns The file record with metadata or null if not found
 */
export async function getFileWithMetadata(
  fileId: number,
  organizationId: number
): Promise<OrganizationFileMetadata | null> {
  validateOrganizationId(organizationId);

  const query = `
    SELECT
      f.id,
      f.filename,
      f.size,
      f.type AS mimetype,
      f.uploaded_time AS upload_date,
      f.uploaded_by,
      f.org_id,
      f.project_id,
      f.model_id,
      f.source,
      f.tags,
      f.review_status,
      f.version,
      f.expiry_date,
      f.last_modified_by,
      f.description,
      f.file_group_id,
      f.approval_workflow_id,
      aw.workflow_title AS approval_workflow_name,
      u.name AS uploader_name,
      u.surname AS uploader_surname,
      m.name AS last_modifier_name,
      m.surname AS last_modifier_surname
    FROM files f
    JOIN users u ON f.uploaded_by = u.id
    LEFT JOIN users m ON f.last_modified_by = m.id
    LEFT JOIN approval_workflows aw ON aw.organization_id = f.organization_id AND f.approval_workflow_id = aw.id
    WHERE f.organization_id = :organizationId AND f.id = :fileId`;

  const result = await sequelize.query(query, {
    replacements: { organizationId, fileId },
    type: QueryTypes.SELECT,
  });

  return (result[0] as OrganizationFileMetadata) || null;
}

/**
 * Gets organization files with full metadata for file manager view
 *
 * @param orgId - Organization ID to get files for
 * @param organizationId - Organization ID for tenant isolation
 * @param options - Pagination options (limit and offset)
 * @returns Object containing files array with metadata and total count
 */
export async function getOrganizationFilesWithMetadata(
  organizationId: number,
  options: PaginationOptions = {}
): Promise<{ files: OrganizationFileMetadata[]; total: number }> {
  validateOrganizationId(organizationId);

  const { limit, offset } = options;

  // Use organization_id for tenant isolation (org_id may be NULL on migrated files)
  let query = `
    SELECT
      f.id,
      f.filename,
      f.size,
      f.type AS mimetype,
      f.uploaded_time AS upload_date,
      f.uploaded_by,
      f.org_id,
      f.model_id,
      f.source,
      f.tags,
      f.review_status,
      f.version,
      f.expiry_date,
      f.last_modified_by,
      f.description,
      f.file_group_id,
      f.approval_workflow_id,
      aw.workflow_title AS approval_workflow_name,
      u.name AS uploader_name,
      u.surname AS uploader_surname,
      m.name AS last_modifier_name,
      m.surname AS last_modifier_surname
    FROM files f
    JOIN users u ON f.uploaded_by = u.id
    LEFT JOIN users m ON f.last_modified_by = m.id
    LEFT JOIN approval_workflows aw ON aw.organization_id = f.organization_id AND f.approval_workflow_id = aw.id
    WHERE f.organization_id = :organizationId
      AND f.project_id IS NULL
      AND (f.source IS NULL OR f.source != 'policy_editor')
    ORDER BY f.uploaded_time DESC`;

  if (limit !== undefined) query += ` LIMIT :limit`;
  if (offset !== undefined) query += ` OFFSET :offset`;

  const files = await sequelize.query(query, {
    replacements: { organizationId, limit, offset },
    type: QueryTypes.SELECT,
  });

  const countQuery = `
    SELECT COUNT(*) as count
    FROM files
    WHERE organization_id = :organizationId
      AND project_id IS NULL
      AND (source IS NULL OR source != 'policy_editor')`;

  const countResult = await sequelize.query(countQuery, {
    replacements: { organizationId },
    type: QueryTypes.SELECT,
  });

  const countRow = countResult[0] as { count: string } | undefined;
  const total = countRow ? parseInt(countRow.count, 10) : 0;

  return { files: files as OrganizationFileMetadata[], total };
}

/**
 * Gets files that need attention (due for update, pending approval, recently modified)
 *
 * @param orgId - Organization ID to get files for
 * @param organizationId - Organization ID for tenant isolation
 * @param daysUntilExpiry - Number of days before expiry to flag as "due for update"
 * @param recentDays - Number of days to consider as "recently modified"
 * @returns Object containing categorized file IDs
 */
export async function getHighlightedFiles(
  organizationId: number,
  daysUntilExpiry: number = 30,
  recentDays: number = 7
): Promise<{
  dueForUpdate: number[];
  pendingApproval: number[];
  recentlyModified: number[];
}> {
  validateOrganizationId(organizationId);

  // Validate numeric inputs to prevent SQL injection - must be positive integers within reasonable bounds
  const safeDaysUntilExpiry = Math.max(1, Math.min(365, Math.floor(Number(daysUntilExpiry) || 30)));
  const safeRecentDays = Math.max(1, Math.min(365, Math.floor(Number(recentDays) || 7)));

  // Files due for update (expiry_date within X days or passed)
  // Using INTERVAL with integer cast for safe parameterization
  const dueQuery = `
    SELECT id FROM files
    WHERE organization_id = :organizationId
      AND project_id IS NULL
      AND expiry_date IS NOT NULL
      AND expiry_date <= CURRENT_DATE + (:daysUntilExpiry || ' days')::INTERVAL
    ORDER BY expiry_date ASC`;

  const dueResult = await sequelize.query(dueQuery, {
    replacements: { organizationId, daysUntilExpiry: safeDaysUntilExpiry },
    type: QueryTypes.SELECT,
  });

  // Files pending approval
  const pendingQuery = `
    SELECT id FROM files
    WHERE organization_id = :organizationId
      AND project_id IS NULL
      AND review_status = 'pending_review'
    ORDER BY uploaded_time DESC`;

  const pendingResult = await sequelize.query(pendingQuery, {
    replacements: { organizationId },
    type: QueryTypes.SELECT,
  });

  // Recently modified files
  const recentQuery = `
    SELECT id FROM files
    WHERE organization_id = :organizationId
      AND project_id IS NULL
      AND updated_at >= CURRENT_DATE - (:recentDays || ' days')::INTERVAL
    ORDER BY updated_at DESC`;

  const recentResult = await sequelize.query(recentQuery, {
    replacements: { organizationId, recentDays: safeRecentDays },
    type: QueryTypes.SELECT,
  });

  return {
    dueForUpdate: (dueResult as { id: number }[]).map((r) => r.id),
    pendingApproval: (pendingResult as { id: number }[]).map((r) => r.id),
    recentlyModified: (recentResult as { id: number }[]).map((r) => r.id),
  };
}

/**
 * Gets file content for preview (limited size)
 *
 * @param fileId - The file ID to get content for
 * @param organizationId - Organization ID for tenant isolation
 * @param maxSize - Maximum size in bytes (default 5MB)
 * @returns Object with file info and content, or null if not found or too large
 */
export async function getFilePreview(
  fileId: number,
  organizationId: number,
  maxSize: number = 5 * 1024 * 1024 // 5MB default
): Promise<{
  id: number;
  filename: string;
  mimetype: string;
  size: number;
  content: Buffer;
  canPreview: boolean;
} | null> {
  validateOrganizationId(organizationId);

  const query = `
    SELECT
      id,
      filename,
      type AS mimetype,
      size,
      content
    FROM files
    WHERE organization_id = :organizationId AND id = :fileId`;

  const result = await sequelize.query(query, {
    replacements: { organizationId, fileId },
    type: QueryTypes.SELECT,
  });

  if (!result[0]) {
    return null;
  }

  const file = result[0] as {
    id: number;
    filename: string;
    mimetype: string;
    size: number | null;
    content: Buffer | null;
  };

  // Check if file has content stored
  if (!file.content) {
    return {
      id: file.id,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size || 0,
      content: Buffer.alloc(0),
      canPreview: false,
    };
  }

  // Check if file is too large for preview
  const fileSize = file.size || file.content.length;
  const canPreview = fileSize <= maxSize;

  return {
    ...file,
    size: fileSize,
    canPreview,
    content: canPreview ? file.content : Buffer.alloc(0),
  };
}

// ============================================================================
// File Version History
// ============================================================================

/**
 * Gets all file versions in the same file group, ordered by upload time descending
 *
 * @param fileGroupId - The file group UUID to query
 * @param organizationId - Organization ID for tenant isolation
 * @returns Array of file records in the same version group
 */
export async function getFileVersionHistory(
  fileGroupId: string,
  organizationId: number
): Promise<OrganizationFileMetadata[]> {
  validateOrganizationId(organizationId);

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileGroupId)) {
    return [];
  }

  const query = `
    SELECT
      f.id,
      f.filename,
      f.size,
      f.type AS mimetype,
      f.uploaded_time AS upload_date,
      f.uploaded_by,
      f.org_id,
      f.model_id,
      f.source,
      f.tags,
      f.review_status,
      f.version,
      f.expiry_date,
      f.last_modified_by,
      f.description,
      f.file_group_id,
      u.name AS uploader_name,
      u.surname AS uploader_surname
    FROM files f
    JOIN users u ON f.uploaded_by = u.id
    WHERE f.organization_id = :organizationId AND f.file_group_id = :fileGroupId
    ORDER BY f.uploaded_time DESC`;

  const result = await sequelize.query(query, {
    replacements: { organizationId, fileGroupId },
    type: QueryTypes.SELECT,
  });

  return result as OrganizationFileMetadata[];
}

// ============================================================================
// File Approval Workflow Operations
// ============================================================================

/**
 * Updates file review status
 *
 * @param fileId - The file ID to update
 * @param reviewStatus - The new review status
 * @param organizationId - Organization ID for tenant isolation
 * @param transaction - Optional database transaction for atomicity
 * @returns True if update was successful
 */
export async function updateFileReviewStatus(
  fileId: number,
  reviewStatus: ReviewStatus,
  organizationId: number,
  transaction?: Transaction
): Promise<boolean> {
  validateOrganizationId(organizationId);

  const query = `
    UPDATE files
    SET review_status = :reviewStatus, updated_at = NOW()
    WHERE organization_id = :organizationId AND id = :fileId
    RETURNING id`;

  const result = await sequelize.query(query, {
    replacements: { organizationId, fileId, reviewStatus },
    type: QueryTypes.SELECT,
    ...(transaction && { transaction }),
  });

  return Array.isArray(result) && result.length > 0;
}

/**
 * Gets files pending approval for a specific workflow
 *
 * @param workflowId - The approval workflow ID
 * @param organizationId - Organization ID for tenant isolation
 * @returns Array of files pending approval for this workflow
 */
export async function getFilesPendingApproval(
  workflowId: number,
  organizationId: number
): Promise<OrganizationFileMetadata[]> {
  validateOrganizationId(organizationId);

  const query = `
    SELECT
      f.id,
      f.filename,
      f.size,
      f.type AS mimetype,
      f.uploaded_time AS upload_date,
      f.uploaded_by,
      f.org_id,
      f.model_id,
      f.source,
      f.tags,
      f.review_status,
      f.version,
      f.expiry_date,
      f.last_modified_by,
      f.description,
      f.file_group_id,
      f.approval_workflow_id,
      u.name AS uploader_name,
      u.surname AS uploader_surname
    FROM files f
    JOIN users u ON f.uploaded_by = u.id
    WHERE f.organization_id = :organizationId AND f.approval_workflow_id = :workflowId
      AND f.review_status = 'pending_review'
    ORDER BY f.uploaded_time DESC`;

  const result = await sequelize.query(query, {
    replacements: { organizationId, workflowId },
    type: QueryTypes.SELECT,
  });

  return result as OrganizationFileMetadata[];
}

// ============================================================================
// File Entity Links (Evidence/Attachment Linking)
// ============================================================================

export type FrameworkType = 'eu_ai_act' | 'nist_ai_rmf' | 'iso_27001' | 'iso_42001' | string;
export type EntityType = 'assessment' | 'subcontrol' | 'subclause' | 'annex_control' | 'annex_category' | string;
export type LinkType = 'evidence' | 'feedback' | 'attachment' | 'reference' | 'source_data';

export interface FileEntityLink {
  id?: number;
  file_id: number;
  framework_type: FrameworkType;
  entity_type: EntityType;
  entity_id: number;
  project_id?: number;
  link_type?: LinkType;
  created_by?: number;
  created_at?: Date;
}

/**
 * Creates a link between a file and an entity (control, assessment, subclause, etc.)
 *
 * @param link - The file-entity link to create
 * @param organizationId - Organization ID for tenant isolation
 * @param transaction - Optional database transaction for atomicity
 * @returns The created link or null if already exists (ON CONFLICT DO NOTHING)
 */
export async function createFileEntityLink(
  link: Omit<FileEntityLink, 'id' | 'created_at'>,
  organizationId: number,
  transaction?: Transaction
): Promise<FileEntityLink | null> {
  validateOrganizationId(organizationId);

  const query = `
    INSERT INTO file_entity_links
      (organization_id, file_id, framework_type, entity_type, entity_id, project_id, link_type, created_by, created_at)
    VALUES
      (:organizationId, :fileId, :frameworkType, :entityType, :entityId, :projectId, :linkType, :createdBy, NOW())
    ON CONFLICT (organization_id, file_id, framework_type, entity_type, entity_id) DO NOTHING
    RETURNING *`;

  const result = await sequelize.query(query, {
    replacements: {
      organizationId,
      fileId: link.file_id,
      frameworkType: link.framework_type,
      entityType: link.entity_type,
      entityId: link.entity_id,
      projectId: link.project_id ?? null,
      linkType: link.link_type ?? 'evidence',
      createdBy: link.created_by ?? null,
    },
    type: QueryTypes.SELECT,
    ...(transaction && { transaction }),
  });

  return (result[0] as FileEntityLink) || null;
}

/**
 * Deletes a file-entity link
 *
 * @param fileId - The file ID
 * @param frameworkType - The framework type
 * @param entityType - The entity type
 * @param entityId - The entity ID
 * @param organizationId - Organization ID for tenant isolation
 * @param transaction - Optional database transaction for atomicity
 * @returns True if link was deleted
 */
export async function deleteFileEntityLink(
  fileId: number,
  frameworkType: FrameworkType,
  entityType: EntityType,
  entityId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<boolean> {
  validateOrganizationId(organizationId);

  const query = `
    DELETE FROM file_entity_links
    WHERE organization_id = :organizationId
      AND file_id = :fileId
      AND framework_type = :frameworkType
      AND entity_type = :entityType
      AND entity_id = :entityId
    RETURNING id`;

  const result = await sequelize.query(query, {
    replacements: { organizationId, fileId, frameworkType, entityType, entityId },
    type: QueryTypes.SELECT,
    ...(transaction && { transaction }),
  });

  return Array.isArray(result) && result.length > 0;
}

/**
 * Gets all entity links for a specific file
 *
 * @param fileId - The file ID
 * @param organizationId - Organization ID for tenant isolation
 * @returns Array of file entity links
 */
export async function getFileEntityLinks(
  fileId: number,
  organizationId: number
): Promise<FileEntityLink[]> {
  validateOrganizationId(organizationId);

  const query = `
    SELECT id, file_id, framework_type, entity_type, entity_id, project_id, link_type, created_by, created_at
    FROM file_entity_links
    WHERE organization_id = :organizationId AND file_id = :fileId
    ORDER BY created_at DESC`;

  const result = await sequelize.query(query, {
    replacements: { organizationId, fileId },
    type: QueryTypes.SELECT,
  });

  return result as FileEntityLink[];
}

/**
 * Gets all files linked to a specific entity
 *
 * @param frameworkType - The framework type
 * @param entityType - The entity type
 * @param entityId - The entity ID
 * @param organizationId - Organization ID for tenant isolation
 * @returns Array of file IDs linked to the entity
 */
export async function getFilesForEntity(
  frameworkType: FrameworkType,
  entityType: EntityType,
  entityId: number,
  organizationId: number
): Promise<number[]> {
  validateOrganizationId(organizationId);

  const query = `
    SELECT file_id
    FROM file_entity_links
    WHERE organization_id = :organizationId
      AND framework_type = :frameworkType
      AND entity_type = :entityType
      AND entity_id = :entityId
    ORDER BY created_at DESC`;

  const result = await sequelize.query(query, {
    replacements: { organizationId, frameworkType, entityType, entityId },
    type: QueryTypes.SELECT,
  });

  return (result as { file_id: number }[]).map(r => r.file_id);
}

/**
 * Gets files linked to an entity with full file metadata
 *
 * @param frameworkType - The framework type
 * @param entityType - The entity type
 * @param entityId - The entity ID
 * @param organizationId - Organization ID for tenant isolation
 * @returns Array of file metadata for linked files
 */
export async function getFilesWithMetadataForEntity(
  frameworkType: FrameworkType,
  entityType: EntityType,
  entityId: number,
  organizationId: number
): Promise<OrganizationFileMetadata[]> {
  validateOrganizationId(organizationId);

  const query = `
    SELECT
      f.id,
      f.filename,
      f.size,
      f.type AS mimetype,
      f.uploaded_time AS upload_date,
      f.uploaded_by,
      f.org_id,
      f.project_id,
      f.source,
      f.tags,
      f.review_status,
      f.version,
      fel.link_type,
      u.name AS uploader_name,
      u.surname AS uploader_surname
    FROM file_entity_links fel
    JOIN files f ON f.organization_id = fel.organization_id AND fel.file_id = f.id
    JOIN users u ON f.uploaded_by = u.id
    WHERE fel.organization_id = :organizationId
      AND fel.framework_type = :frameworkType
      AND fel.entity_type = :entityType
      AND fel.entity_id = :entityId
    ORDER BY fel.created_at DESC`;

  const result = await sequelize.query(query, {
    replacements: { organizationId, frameworkType, entityType, entityId },
    type: QueryTypes.SELECT,
  });

  return result as OrganizationFileMetadata[];
}

/**
 * Deletes all entity links for a file (used when deleting a file)
 *
 * @param fileId - The file ID
 * @param organizationId - Organization ID for tenant isolation
 * @param transaction - Optional database transaction for atomicity
 * @returns Number of links deleted
 */
export async function deleteAllFileEntityLinks(
  fileId: number,
  organizationId: number,
  transaction?: Transaction
): Promise<number> {
  validateOrganizationId(organizationId);

  const query = `
    DELETE FROM file_entity_links
    WHERE organization_id = :organizationId AND file_id = :fileId
    RETURNING id`;

  const result = await sequelize.query(query, {
    replacements: { organizationId, fileId },
    type: QueryTypes.SELECT,
    ...(transaction && { transaction }),
  });

  return Array.isArray(result) ? result.length : 0;
}

// ============================================================================
// Backward Compatibility Aliases
// ============================================================================

/**
 * @deprecated Use uploadOrganizationFile instead
 */
export const uploadFileManagerFile = uploadOrganizationFile;
