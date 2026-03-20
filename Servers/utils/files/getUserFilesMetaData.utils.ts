import { sequelize } from "../../database/db";
import { FileList } from "../../domain.layer/models/file/file.model";

/**
 * Gets file metadata with entity links from the centralized file_entity_links table.
 * This utility populates parent_id, sub_id, meta_id for backward compatibility with existing UI.
 */
const getUserFilesMetaDataQuery = async (
  role: string,
  userId: number,
  organizationId: number,
  options?: { limit?: number; offset?: number }
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
  if (role === "Admin") {
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
    query = `
      WITH projects_of_user AS (
        SELECT DISTINCT project_id FROM projects_members WHERE organization_id = :organizationId AND user_id = :userId
        UNION ALL
        SELECT id AS project_id FROM projects WHERE organization_id = :organizationId AND owner = :userId
      ) SELECT f.id, f.filename, f.project_id, f.uploaded_time, f.source, f.review_status,
          p.project_title, u.name AS uploader_name, u.surname AS uploader_surname
        FROM files f JOIN projects_of_user pu ON f.project_id = pu.project_id
        JOIN projects p ON p.id = pu.project_id AND p.organization_id = :organizationId
        JOIN users u ON f.uploaded_by = u.id
        WHERE f.organization_id = :organizationId AND f.source::TEXT NOT ILIKE '%report%'
        ORDER BY f.uploaded_time DESC
      ${paginationClause};`;
    replacements.userId = userId;
  }

  if (limit !== undefined) replacements.limit = limit;
  if (offset !== undefined) replacements.offset = offset;

  try {
    const queryResults = (await sequelize.query(query, {
      replacements,
    })) as [FileList[], number];

    const results = queryResults[0];

    // Get all entity links for these files in a single query
    const fileIds = results.map(r => Number(r.id));
    if (fileIds.length > 0) {
      // Use IN clause with array spread for Sequelize compatibility
      const linksQuery = `
        SELECT file_id, framework_type, entity_type, entity_id, link_type
        FROM file_entity_links
        WHERE organization_id = :organizationId AND file_id IN (:fileIds)`;

      const linksResult = (await sequelize.query(linksQuery, {
        replacements: { organizationId, fileIds },
      })) as [any[], number];

      const linksMap = new Map<number, any[]>();
      for (const link of linksResult[0]) {
        if (!linksMap.has(link.file_id)) {
          linksMap.set(link.file_id, []);
        }
        linksMap.get(link.file_id)!.push(link);
      }

      // Enrich each file with its entity link info
      for (const result of results) {
        result.sub_id = undefined;
        result.meta_id = undefined;
        result.parent_id = undefined;
        result.is_evidence = true;

        const fileId = Number(result.id);
        const links = linksMap.get(fileId) || [];
        if (links.length === 0) continue;

        const link = links[0]; // Use first link for primary display
        result.meta_id = link.entity_id;

        // Determine if evidence or feedback
        if (link.link_type === 'feedback') {
          result.is_evidence = false;
        }

        // Fetch parent info based on entity type and framework
        switch (link.entity_type) {
          case 'subcontrol': {
            // EU AI Act subcontrol - get parent control
            const parentQuery = `
              SELECT c.control_meta_id as parent_id
              FROM subcontrols_eu s
              JOIN controls_eu c ON s.control_id = c.id AND c.organization_id = :organizationId
              WHERE s.organization_id = :organizationId AND s.id = :entityId`;
            const parentResult = (await sequelize.query(parentQuery, {
              replacements: { organizationId, entityId: link.entity_id },
            })) as [any[], number];
            if (parentResult[0][0]) {
              result.parent_id = parentResult[0][0].parent_id;
            }
            break;
          }
          case 'assessment': {
            // EU AI Act assessment answer - get topic/subtopic
            const parentQuery = `
              SELECT topic.id AS topic_id, subtopic.id AS subtopic_id
              FROM answers_eu ans
              JOIN questions_struct_eu question ON question.id = ans.question_id
              JOIN subtopics_struct_eu subtopic ON subtopic.id = question.subtopic_id
              JOIN topics_struct_eu topic ON topic.id = subtopic.topic_id
              WHERE ans.organization_id = :organizationId AND ans.id = :entityId`;
            const parentResult = (await sequelize.query(parentQuery, {
              replacements: { organizationId, entityId: link.entity_id },
            })) as [any[], number];
            if (parentResult[0][0]) {
              result.parent_id = parentResult[0][0].topic_id;
              result.sub_id = parentResult[0][0].subtopic_id;
            }
            break;
          }
          case 'subclause': {
            // ISO subclause - get parent clause
            const table = link.framework_type === 'iso_27001'
              ? 'subclauses_iso27001'
              : 'subclauses_iso';
            const structTable = link.framework_type === 'iso_27001'
              ? 'subclauses_struct_iso27001'
              : 'subclauses_struct_iso';
            const parentQuery = `
              SELECT scs.clause_id as clause_id
              FROM ${table} sc
              JOIN ${structTable} scs ON scs.id = sc.subclause_meta_id
              WHERE sc.organization_id = :organizationId AND sc.id = :entityId`;
            const parentResult = (await sequelize.query(parentQuery, {
              replacements: { organizationId, entityId: link.entity_id },
            })) as [any[], number];
            if (parentResult[0][0]) {
              result.parent_id = parentResult[0][0].clause_id;
            }
            break;
          }
          case 'annex_control': {
            // ISO 27001 annex control - get parent annex
            const parentQuery = `
              SELECT acs.annex_id as annex_id
              FROM annexcontrols_iso27001 ac
              JOIN annexcontrols_struct_iso27001 acs ON acs.id = ac.annexcontrol_meta_id
              WHERE ac.organization_id = :organizationId AND ac.id = :entityId`;
            const parentResult = (await sequelize.query(parentQuery, {
              replacements: { organizationId, entityId: link.entity_id },
            })) as [any[], number];
            if (parentResult[0][0]) {
              result.parent_id = parentResult[0][0].annex_id;
            }
            break;
          }
          case 'annex_category': {
            // ISO 42001 annex category - get parent annex
            const parentQuery = `
              SELECT acs.annex_id as annex_id
              FROM annexcategories_iso ac
              JOIN annexcategories_struct_iso acs ON acs.id = ac.annexcategory_meta_id
              WHERE ac.organization_id = :organizationId AND ac.id = :entityId`;
            const parentResult = (await sequelize.query(parentQuery, {
              replacements: { organizationId, entityId: link.entity_id },
            })) as [any[], number];
            if (parentResult[0][0]) {
              result.parent_id = parentResult[0][0].annex_id;
            }
            break;
          }
        }
      }
    }

    return results;
  } catch (err) {
    console.error(`Database query failed for user ${userId}:`, err);
    throw new Error("Failed to retrieve file metadata.");
  }
};

export default getUserFilesMetaDataQuery;
