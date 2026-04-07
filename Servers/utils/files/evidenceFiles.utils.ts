/**
 * Evidence Files Utility
 *
 * Provides helper functions to query evidence/feedback files from file_entity_links table.
 * This replaces the old JSONB columns (evidence_files, evidence_links, feedback_files).
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";

/**
 * Standard evidence file structure matching the old JSONB format
 * for backward compatibility with frontend
 */
export interface EvidenceFile {
  link_id?: number;
  id: string;
  fileName: string;
  project_id?: number;
  uploaded_by: number;
  uploaded_time: string;
  source?: string;
}

/**
 * Get evidence files for an entity from file_entity_links table
 */
export async function getEvidenceFilesForEntity(
  organizationId: number,
  frameworkType: string,
  entityType: string,
  entityId: number,
  linkType: string = "evidence"
): Promise<EvidenceFile[]> {
  const result = await sequelize.query(
    `SELECT
      fel.id AS link_id,
      f.id::text AS id,
      f.filename AS "fileName",
      f.project_id,
      f.uploaded_by,
      f.uploaded_time::text AS uploaded_time,
      COALESCE(f.source, 'File Manager') AS source
    FROM file_entity_links fel
    JOIN files f ON f.id = fel.file_id AND f.organization_id = fel.organization_id
    WHERE fel.organization_id = :organizationId
      AND fel.framework_type = :frameworkType
      AND fel.entity_type = :entityType
      AND fel.entity_id = :entityId
      AND fel.link_type = :linkType
    ORDER BY fel.created_at DESC`,
    {
      replacements: { organizationId, frameworkType, entityType, entityId, linkType },
      type: QueryTypes.SELECT,
    }
  );

  return result as EvidenceFile[];
}

/**
 * Get evidence files for multiple entities in a single query (batch)
 * Returns a map of entityId -> EvidenceFile[]
 */
export async function getEvidenceFilesForEntities(
  organizationId: number,
  frameworkType: string,
  entityType: string,
  entityIds: number[],
  linkType: string = "evidence"
): Promise<Map<number, EvidenceFile[]>> {
  if (entityIds.length === 0) {
    return new Map();
  }

  const result = await sequelize.query(
    `SELECT
      fel.entity_id,
      f.id::text AS id,
      f.filename AS "fileName",
      f.project_id,
      f.uploaded_by,
      f.uploaded_time::text AS uploaded_time,
      COALESCE(f.source, 'File Manager') AS source
    FROM file_entity_links fel
    JOIN files f ON f.id = fel.file_id AND f.organization_id = fel.organization_id
    WHERE fel.organization_id = :organizationId
      AND fel.framework_type = :frameworkType
      AND fel.entity_type = :entityType
      AND fel.entity_id IN (:entityIds)
      AND fel.link_type = :linkType
    ORDER BY fel.entity_id, fel.created_at DESC`,
    {
      replacements: { organizationId, frameworkType, entityType, entityIds, linkType },
      type: QueryTypes.SELECT,
    }
  );

  // Group by entity_id
  const map = new Map<number, EvidenceFile[]>();
  for (const row of result as (EvidenceFile & { entity_id: number })[]) {
    const entityId = row.entity_id;
    if (!map.has(entityId)) {
      map.set(entityId, []);
    }
    map.get(entityId)!.push({
      id: row.id,
      fileName: row.fileName,
      project_id: row.project_id,
      uploaded_by: row.uploaded_by,
      uploaded_time: row.uploaded_time,
      source: row.source,
    });
  }

  return map;
}

/**
 * Create a file entity link (used when uploading evidence files)
 */
export async function createFileEntityLink(
  organizationId: number,
  fileId: number,
  frameworkType: string,
  entityType: string,
  entityId: number,
  linkType: string = "evidence",
  createdBy?: number,
  transaction?: any
): Promise<void> {
  await sequelize.query(
    `INSERT INTO file_entity_links
      (organization_id, file_id, framework_type, entity_type, entity_id, link_type, created_by, created_at)
     VALUES (:organizationId, :fileId, :frameworkType, :entityType, :entityId, :linkType, :createdBy, NOW())
     ON CONFLICT (file_id, framework_type, entity_type, entity_id) DO NOTHING`,
    {
      replacements: { organizationId, fileId, frameworkType, entityType, entityId, linkType, createdBy },
      ...(transaction && { transaction }),
    }
  );
}

/**
 * Delete a file entity link (used when removing evidence files)
 */
export async function deleteFileEntityLink(
  organizationId: number,
  fileId: number,
  frameworkType: string,
  entityType: string,
  entityId: number,
  transaction?: any
): Promise<void> {
  await sequelize.query(
    `DELETE FROM file_entity_links
     WHERE organization_id = :organizationId
       AND file_id = :fileId
       AND framework_type = :frameworkType
       AND entity_type = :entityType
       AND entity_id = :entityId`,
    {
      replacements: { organizationId, fileId, frameworkType, entityType, entityId },
      ...(transaction && { transaction }),
    }
  );
}

/**
 * Get evidence files for a single entity across multiple entity types.
 * Returns a map of entityType -> EvidenceFile[]
 */
export async function getEvidenceFilesForEntityTypes(
  organizationId: number,
  frameworkType: string,
  entityTypes: string[],
  entityId: number,
  linkType: string = "evidence"
): Promise<Record<string, EvidenceFile[]>> {
  if (entityTypes.length === 0) {
    return {};
  }

  const result = await sequelize.query(
    `SELECT
      fel.entity_type,
      fel.id AS link_id,
      f.id::text AS id,
      f.filename AS "fileName",
      f.project_id,
      f.uploaded_by,
      f.uploaded_time::text AS uploaded_time,
      COALESCE(f.source, 'File Manager') AS source
    FROM file_entity_links fel
    JOIN files f ON f.id = fel.file_id AND f.organization_id = fel.organization_id
    WHERE fel.organization_id = :organizationId
      AND fel.framework_type = :frameworkType
      AND fel.entity_type IN (:entityTypes)
      AND fel.entity_id = :entityId
      AND fel.link_type = :linkType
    ORDER BY fel.entity_type, fel.created_at DESC`,
    {
      replacements: { organizationId, frameworkType, entityTypes, entityId, linkType },
      type: QueryTypes.SELECT,
    }
  );

  const map: Record<string, EvidenceFile[]> = {};
  for (const row of result as (EvidenceFile & { entity_type: string; link_id: number })[]) {
    const entityType = row.entity_type;
    if (!map[entityType]) {
      map[entityType] = [];
    }
    map[entityType].push({
      link_id: row.link_id,
      id: row.id,
      fileName: row.fileName,
      project_id: row.project_id,
      uploaded_by: row.uploaded_by,
      uploaded_time: row.uploaded_time,
      source: row.source,
    });
  }

  return map;
}

/**
 * Delete a file entity link by its primary key ID
 */
export async function deleteFileEntityLinkById(
  linkId: number,
  organizationId: number,
  transaction?: any
): Promise<boolean> {
  const result = await sequelize.query(
    `DELETE FROM file_entity_links
     WHERE id = :linkId
       AND organization_id = :organizationId
     RETURNING id`,
    {
      replacements: { linkId, organizationId },
      type: QueryTypes.DELETE,
      ...(transaction && { transaction }),
    }
  );

  return Array.isArray(result) && result.length > 0;
}

/**
 * Delete all file entity links for an entity (used when deleting an entity)
 */
export async function deleteAllFileEntityLinksForEntity(
  organizationId: number,
  frameworkType: string,
  entityType: string,
  entityId: number,
  transaction?: any
): Promise<void> {
  await sequelize.query(
    `DELETE FROM file_entity_links
     WHERE organization_id = :organizationId
       AND framework_type = :frameworkType
       AND entity_type = :entityType
       AND entity_id = :entityId`,
    {
      replacements: { organizationId, frameworkType, entityType, entityId },
      ...(transaction && { transaction }),
    }
  );
}

/**
 * Delete all file entity links for multiple entities (used when bulk deleting entities)
 * Handles both 'evidence' and 'feedback' link types
 */
export async function deleteAllFileEntityLinksForEntities(
  organizationId: number,
  frameworkType: string,
  entityType: string,
  entityIds: number[],
  transaction?: any
): Promise<void> {
  if (entityIds.length === 0) {
    return;
  }
  await sequelize.query(
    `DELETE FROM file_entity_links
     WHERE organization_id = :organizationId
       AND framework_type = :frameworkType
       AND entity_type = :entityType
       AND entity_id IN (:entityIds)`,
    {
      replacements: { organizationId, frameworkType, entityType, entityIds },
      ...(transaction && { transaction }),
    }
  );
}

/**
 * Delete all file entity links for a framework and project (used when deleting project framework)
 * This is a broader cleanup that removes all links for a given framework type
 */
export async function deleteAllFileEntityLinksForFramework(
  organizationId: number,
  frameworkType: string,
  projectId: number,
  transaction?: any
): Promise<void> {
  // Delete by joining with files to filter by project_id
  await sequelize.query(
    `DELETE FROM file_entity_links
     WHERE organization_id = :organizationId
       AND framework_type = :frameworkType
       AND file_id IN (
         SELECT id FROM files WHERE organization_id = :organizationId AND project_id = :projectId
       )`,
    {
      replacements: { organizationId, frameworkType, projectId },
      ...(transaction && { transaction }),
    }
  );
}
