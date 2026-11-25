import { UploadedFile } from "./question.utils";
import { sequelize } from "../database/db";
import { FileModel, FileSource } from "../domain.layer/models/file/file.model";
import { Transaction, QueryTypes } from "sequelize";
import { ProjectModel } from "../domain.layer/models/project/project.model";
import { resolveFileExpiryOnCreate } from "./retention.utils";
import { buildStorageKey, getFileStorage } from "../services/storage";
import { deleteObjectOnCommit, registerPendingPut } from "../services/storage/transactionRegistry";
import { StorageObjectRef } from "../services/storage/types";

const sanitizeFilename = (name: string) => name.replace(/[^a-zA-Z0-9-_\.]/g, "_");

/**
 * Store the upload buffer via the configured storage provider. Under the
 * default local provider this is a pass-through (the buffer goes into
 * files.content); under S3 the object is stored and the row records the key.
 */
const storeFileContent = async (
  file: UploadedFile,
  organizationId: number,
  transaction: Transaction | null,
): Promise<{ content: Buffer | null; ref: StorageObjectRef }> => {
  const stored = await getFileStorage().put({
    key: buildStorageKey(organizationId, file.originalname),
    body: file.buffer,
    contentType: file.mimetype,
  });
  registerPendingPut(transaction, stored);
  return { content: stored.key ? null : file.buffer, ref: stored };
};

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
  // takes no per-file values from the caller.
  const { expiry_date, retention_policy } = await resolveFileExpiryOnCreate(
    organizationId,
    null,
    null,
  );

  const { content, ref } = await storeFileContent(file, organizationId, transaction);

  const query = `INSERT INTO files
    (
      organization_id, filename, content, type, project_id, uploaded_by, uploaded_time, is_demo, source, size, file_path, org_id, model_id, expiry_date, retention_policy, storage_provider, storage_key
    )
    VALUES (
      :organization_id, :filename, :content, :type, :project_id, :uploaded_by, :uploaded_time, :is_demo, :source, :size, :file_path, :org_id, :model_id, :expiry_date, :retention_policy, :storage_provider, :storage_key
    ) RETURNING *`;
  const result = await sequelize.query(query, {
    replacements: {
      organization_id: organizationId,
      filename: sanitizeFilename(file.originalname),
      content,
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
      storage_provider: ref.key ? ref.provider : null,
      storage_key: ref.key,
    },
    mapToModel: true,
    model: FileModel,
    ...(transaction && { transaction }),
  });
  // result[0] is an array of model instances, get the first one
  return Array.isArray(result[0]) && result[0].length > 0 ? result[0][0] : result[0];
};

export const deleteFileById = async (
  id: number,
  organizationId: number,
  transaction: Transaction,
) => {
  // Clean up any virtual folder mappings for this file
  await sequelize.query(
    `DELETE FROM file_folder_mappings WHERE organization_id = :organizationId AND file_id = :id`,
    {
      replacements: { organizationId, id },
      transaction,
    },
  );

  const query = `DELETE FROM files WHERE organization_id = :organizationId AND id = :id returning id, storage_provider, storage_key`;
  console.log(`Executing query: ${query} with id: ${id}`);
  const result = await sequelize.query(query, {
    replacements: { organizationId, id },
    mapToModel: true,
    model: FileModel,
    transaction,
  });
  console.log(`Delete result: ${result}`);
  // Externally stored bytes are removed only after the row delete commits.
  for (const row of result) {
    if (row.storage_key) {
      deleteObjectOnCommit(transaction, {
        provider: row.storage_provider as StorageObjectRef["provider"],
        key: row.storage_key,
      });
    }
  }
  return result.length > 0;
};

export const getFileById = async (id: number, organizationId: number) => {
  const query = `SELECT * FROM files WHERE organization_id = :organizationId AND id = :id`;
  const result = await sequelize.query(query, {
    replacements: { organizationId, id },
    mapToModel: true,
    model: FileModel,
  });
  return result[0];
};

/** Roles that may read every file in their organization. */
export const isFileAdminRole = (role: string) => role === "Admin" || role === "SuperAdmin";

/**
 * SQL predicate: the caller (`:fileAccessUserId`) may read the files row
 * `alias`. It is the rule the File Manager download applies
 * (fileManager.ctrl.ts downloadFile), minus the Admin bypass, which callers
 * handle with isFileAdminRole:
 * - an organization-level file (project_id IS NULL) is readable by any member
 *   of the organization. files.org_id is not consulted: migrated files and
 *   uploadFile leave it NULL, and the row's organization_id already scopes it;
 * - a project file by its uploader and the project's owner and members.
 *
 * The caller must already restrict `alias.organization_id` to the caller's
 * organization.
 */
export const fileAccessPredicate = (alias: string) => `(
      ${alias}.project_id IS NULL
      OR ${alias}.uploaded_by = :fileAccessUserId
      OR EXISTS (
        SELECT 1 FROM projects fa_p
         WHERE fa_p.id = ${alias}.project_id
           AND fa_p.organization_id = ${alias}.organization_id
           AND fa_p.owner = :fileAccessUserId
      )
      OR EXISTS (
        SELECT 1 FROM projects_members fa_pm
         WHERE fa_pm.project_id = ${alias}.project_id
           AND fa_pm.organization_id = ${alias}.organization_id
           AND fa_pm.user_id = :fileAccessUserId
      )
    )`;

/**
 * canUserAccessFile's rule as a WHERE fragment over a joined files row, for
 * list queries. Empty for Admins. Otherwise the file must exist: a LEFT JOIN
 * that found no file would otherwise pass as an organization-level file.
 */
export const buildFileAccessFilter = (
  alias: string,
  userId: number | null,
  role: string,
): { clause: string; replacements: Record<string, unknown> } => {
  if (isFileAdminRole(role)) return { clause: "", replacements: {} };
  return {
    clause: `AND ${alias}.id IS NOT NULL AND ${fileAccessPredicate(alias)}`,
    replacements: { fileAccessUserId: userId },
  };
};

/**
 * Whether the user may read the file: an Admin any file of the organization;
 * anyone else see fileAccessPredicate. A missing file, or another
 * organization's, answers false like a forbidden one.
 */
export const canUserAccessFile = async (
  fileId: number,
  userId: number,
  role: string,
  organizationId: number,
): Promise<boolean> => {
  // Admins skip the per-file rule, not the organization: the file must still
  // be one of theirs.
  const query = isFileAdminRole(role)
    ? `SELECT f.id FROM files f
        WHERE f.organization_id = :organizationId AND f.id = :fileId
        LIMIT 1`
    : `SELECT f.id
         FROM files f
        WHERE f.organization_id = :organizationId AND f.id = :fileId
          AND ${fileAccessPredicate("f")}
        LIMIT 1`;

  const result = await sequelize.query(query, {
    replacements: { organizationId, fileId, fileAccessUserId: userId },
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
    ORDER BY uploaded_time DESC, id ASC`;
  const result = await sequelize.query(query, {
    replacements: { organizationId, project_id },
    mapToModel: true,
    model: FileModel,
  });
  return result;
};
