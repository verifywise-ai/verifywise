import { UploadedFile } from "./question.utils";
import { sequelize } from "../database/db";
import { FileModel, FileSource } from "../domain.layer/models/file/file.model";
import { Transaction, QueryTypes } from "sequelize";
import { ProjectModel } from "../domain.layer/models/project/project.model";
import { resolveFileExpiryOnCreate } from "./retention.utils";
import {
  BIAS_AUDIT_STANCE_SOURCE,
  deleteVisibleFileQuery,
  VISIBLE_FILE_REPLACEMENTS,
  VISIBLE_FILE_SQL,
} from "./files/visibleFiles";

const sanitizeFilename = (name: string) => name.replace(/[^a-zA-Z0-9-_\.]/g, "_");

export const uploadFile = async (
  file: UploadedFile,
  user_id: number,
  project_id: number | null,
  source: FileSource,
  organizationId: number,
  transaction: Transaction | null = null,
  options?: {
    org_id?: number;
    model_id?: number;
    file_path?: string;
  },
) => {
  let is_demo = false;
  if (project_id) {
    const projectIsDemo = await sequelize.query(
      `SELECT is_demo FROM projects WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: { organizationId, id: project_id },
        mapToModel: true,
        model: ProjectModel,
        ...(transaction && { transaction }),
      },
    );
    is_demo = projectIsDemo[0]?.is_demo || false;
  }
  // Apply org-level default retention (if configured). Explicit expiry /
  // retention overrides come later via updateFileMetadata — this upload path
  // takes no per-file values from the caller. A bias audit stance PDF gets
  // none: it is an immutable record cited by hash, never updated or
  // replaced, so an expiry date would only prompt an update that cannot
  // happen (and put a hidden file in expiry notifications).
  const { expiry_date, retention_policy } =
    source === BIAS_AUDIT_STANCE_SOURCE
      ? { expiry_date: null, retention_policy: null }
      : await resolveFileExpiryOnCreate(organizationId, null, null);

  const query = `INSERT INTO files
    (
      organization_id, filename, content, type, project_id, uploaded_by, uploaded_time, is_demo, source, size, file_path, org_id, model_id, expiry_date, retention_policy
    )
    VALUES (
      :organization_id, :filename, :content, :type, :project_id, :uploaded_by, :uploaded_time, :is_demo, :source, :size, :file_path, :org_id, :model_id, :expiry_date, :retention_policy
    ) RETURNING *`;
  const result = await sequelize.query(query, {
    replacements: {
      organization_id: organizationId,
      filename: sanitizeFilename(file.originalname),
      content: file.buffer,
      project_id: project_id,
      type: file.mimetype,
      uploaded_by: user_id,
      uploaded_time: new Date().toISOString(),
      is_demo,
      source,
      size: file.size || null,
      file_path: options?.file_path || sanitizeFilename(file.originalname),
      org_id: options?.org_id || null,
      model_id: options?.model_id || null,
      expiry_date,
      retention_policy,
    },
    mapToModel: true,
    model: FileModel,
    ...(transaction && { transaction }),
  });
  // result[0] is an array of model instances, get the first one
  return Array.isArray(result[0]) && result[0].length > 0 ? result[0][0] : result[0];
};

// Defined beside the visible-file predicate; re-exported for existing importers.
export { BIAS_AUDIT_STANCE_SOURCE };

/**
 * Delete a file, its folder mappings and its entity links. A stance PDF is never
 * deleted: like a missing id it is a silent no-op and the answer is false.
 */
export const deleteFileById = async (
  id: number,
  organizationId: number,
  transaction: Transaction,
): Promise<boolean> => deleteVisibleFileQuery(id, organizationId, transaction);

/** A file by id. A bias audit stance PDF answers exactly as a missing file does. */
export const getFileById = async (id: number, organizationId: number) => {
  const query = `SELECT * FROM files
    WHERE organization_id = :organizationId AND id = :id AND ${VISIBLE_FILE_SQL("files")}`;
  const result = await sequelize.query(query, {
    replacements: { organizationId, id, ...VISIBLE_FILE_REPLACEMENTS },
    mapToModel: true,
    model: FileModel,
  });
  return result[0];
};

/**
 * Check if a user has access to a file.
 * Access is granted if:
 * - User is Admin
 * - User uploaded the file
 * - For project files: User has access to the project (owner or member)
 * - For org-level files: User belongs to the same organization
 * A bias audit stance PDF is denied exactly as a missing file is.
 */
export const canUserAccessFile = async (
  fileId: number,
  userId: number,
  role: string,
  organizationId: number,
  userOrgId?: number,
): Promise<boolean> => {
  // Admins can access all files
  if (role === "Admin" || role === "SuperAdmin") {
    return true;
  }

  // Query that handles both project-level and org-level files
  const query = `
    SELECT f.id
    FROM files f
    LEFT JOIN projects p ON f.project_id = p.id AND p.organization_id = :organizationId
    LEFT JOIN projects_members pm ON p.id = pm.project_id AND pm.organization_id = :organizationId
    WHERE f.organization_id = :organizationId AND f.id = :fileId
      AND ${VISIBLE_FILE_SQL("f")}
      AND (
        f.uploaded_by = :userId
        OR p.owner = :userId
        OR pm.user_id = :userId
        OR (f.project_id IS NULL AND f.org_id = :userOrgId)
      )
    LIMIT 1
  `;

  const result = await sequelize.query(query, {
    replacements: {
      organizationId,
      fileId,
      userId,
      userOrgId: userOrgId || null,
      ...VISIBLE_FILE_REPLACEMENTS,
    },
    type: QueryTypes.SELECT,
  });

  return result.length > 0;
};

export const getFileMetadataByProjectId = async (project_id: number, organizationId: number) => {
  const query = `SELECT
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
      AND ${VISIBLE_FILE_SQL("f")}
    ORDER BY uploaded_time DESC, id ASC`;
  const result = await sequelize.query(query, {
    replacements: { organizationId, project_id, ...VISIBLE_FILE_REPLACEMENTS },
    mapToModel: true,
    model: FileModel,
  });
  return result;
};
