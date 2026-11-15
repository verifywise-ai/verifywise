import { sequelize } from "../../database/db";
import { FileList } from "../../domain.layer/models/file/file.model";
import { attachLinkProjections } from "./attachLinkProjections";
import { projectVisibilitySql } from "../projectVisibility.utils";

export type { FileEntityLinkProjection } from "./attachLinkProjections";

/**
 * Gets file metadata with entity links from the centralized file_entity_links table.
 * This utility populates parent_id, sub_id, meta_id for backward compatibility with existing UI.
 */
const getUserFilesMetaDataQuery = async (
  role: string,
  userId: number,
  organizationId: number,
  options?: { limit?: number; offset?: number },
): Promise<FileList[]> => {
  const { limit, offset } = options ?? {};

  const paginationClause =
    limit !== undefined && offset !== undefined
      ? "LIMIT :limit OFFSET :offset"
      : limit !== undefined
        ? "LIMIT :limit"
        : "";

  let query = null;
  const replacements: Record<string, number> = { organizationId };

  // Show all files regardless of approval status - UI handles display
  if (role === "Admin" || role === "SuperAdmin") {
    query = `
      SELECT f.id, f.filename, f.project_id, f.uploaded_time, f.source, f.review_status,
        p.project_title, u.name AS uploader_name, u.surname AS uploader_surname
      FROM files f JOIN projects p ON p.id = f.project_id AND p.organization_id = :organizationId
      JOIN users u ON f.uploaded_by = u.id
      WHERE f.organization_id = :organizationId AND f.source::TEXT NOT ILIKE '%report%'
      ORDER BY f.uploaded_time DESC
      ${paginationClause};
    `;
  } else {
    // Owner, member or group member (#5253), by the use case list's rule.
    const visibility = projectVisibilitySql("p", { userId, role });
    query = `
      SELECT f.id, f.filename, f.project_id, f.uploaded_time, f.source, f.review_status,
          p.project_title, u.name AS uploader_name, u.surname AS uploader_surname
        FROM files f
        JOIN projects p ON p.id = f.project_id AND p.organization_id = :organizationId
        JOIN users u ON f.uploaded_by = u.id
        WHERE f.organization_id = :organizationId AND f.source::TEXT NOT ILIKE '%report%'${visibility.sql}
        ORDER BY f.uploaded_time DESC
      ${paginationClause};`;
    Object.assign(replacements, visibility.replacements);
  }

  if (limit !== undefined) replacements.limit = limit;
  if (offset !== undefined) replacements.offset = offset;

  try {
    const queryResults = (await sequelize.query(query, {
      replacements,
    })) as [FileList[], number];

    const results = queryResults[0];

    for (const result of results) {
      result.sub_id = undefined;
      result.meta_id = undefined;
      result.parent_id = undefined;
      result.is_evidence = true;
    }

    await attachLinkProjections(organizationId, results as any);

    return results;
  } catch (err) {
    console.error(`Database query failed for user ${userId}:`, err);
    throw new Error("Failed to retrieve file metadata.");
  }
};

export default getUserFilesMetaDataQuery;
