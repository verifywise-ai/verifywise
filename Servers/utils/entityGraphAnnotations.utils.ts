/**
 * @fileoverview Entity Graph Annotations Utility Functions
 *
 * Data access layer for Entity Graph annotations operations.
 * Uses raw SQL queries with shared-schema multi-tenancy (organization_id column).
 *
 * Functions:
 * - createAnnotationQuery: Create and persist a new annotation
 * - getAnnotationsByUserQuery: Fetch all annotations for a user
 * - getAnnotationByEntityQuery: Fetch annotation for specific entity
 * - getAnnotationByIdQuery: Fetch a single annotation by ID
 * - updateAnnotationContentQuery: Update annotation content
 * - deleteAnnotationByIdQuery: Delete an annotation
 *
 * @module utils/entityGraphAnnotations
 */

import { EntityGraphAnnotationsModel } from "../domain.layer/models/entityGraphAnnotations/entityGraphAnnotations.model";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";

/**
 * Create and persist a new annotation to the database
 *
 * @async
 * @param {EntityGraphAnnotationsModel} annotation - Model instance to save
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<EntityGraphAnnotationsModel>} Saved annotation instance
 * @throws {Error} If database operation fails
 */
export async function createAnnotationQuery(
  annotation: EntityGraphAnnotationsModel,
  organizationId: number
): Promise<EntityGraphAnnotationsModel> {
  try {
    const result = await sequelize.query(
      `INSERT INTO entity_graph_annotations
        (content, user_id, entity_type, entity_id, organization_id, created_at, updated_at)
       VALUES (:content, :user_id, :entity_type, :entity_id, :organization_id, :created_at, :updated_at)
       RETURNING id, content, user_id, entity_type, entity_id, organization_id, created_at, updated_at`,
      {
        replacements: {
          content: annotation.content,
          user_id: annotation.user_id,
          entity_type: annotation.entity_type,
          entity_id: annotation.entity_id,
          organization_id: organizationId,
          created_at: new Date(),
          updated_at: new Date(),
        },
        type: QueryTypes.INSERT,
      }
    );

    // Extract the generated data from the result
    if (
      result &&
      Array.isArray(result) &&
      result[0] &&
      Array.isArray(result[0]) &&
      result[0][0]
    ) {
      const row = result[0][0];
      annotation.id = row.id;
      annotation.created_at = row.created_at;
      annotation.updated_at = row.updated_at;
    }

    return annotation;
  } catch (error) {
    throw new Error(`Failed to create annotation: ${(error as Error).message}`);
  }
}

/**
 * Fetch all annotations for a user in an organization
 *
 * @async
 * @param {number} userId - User ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<EntityGraphAnnotationsModel[]>} Array of annotations
 * @throws {Error} If database operation fails
 */
export async function getAnnotationsByUserQuery(
  userId: number,
  organizationId: number
): Promise<EntityGraphAnnotationsModel[]> {
  try {
    const annotations = await sequelize.query(
      `SELECT id, content, user_id, entity_type, entity_id, organization_id, created_at, updated_at
       FROM entity_graph_annotations
       WHERE user_id = :user_id AND organization_id = :organization_id
       ORDER BY updated_at DESC`,
      {
        replacements: {
          user_id: userId,
          organization_id: organizationId,
        },
        type: QueryTypes.SELECT,
      }
    );

    return (annotations as any[]).map((row) => {
      return new EntityGraphAnnotationsModel({
        id: row.id,
        content: row.content,
        user_id: row.user_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        organization_id: row.organization_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    });
  } catch (error) {
    throw new Error(`Failed to fetch annotations: ${(error as Error).message}`);
  }
}

/**
 * Fetch annotation for a specific entity by a specific user
 *
 * @async
 * @param {number} userId - User ID
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<EntityGraphAnnotationsModel | null>} Annotation or null
 * @throws {Error} If database operation fails
 */
export async function getAnnotationByEntityQuery(
  userId: number,
  entityType: string,
  entityId: string,
  organizationId: number
): Promise<EntityGraphAnnotationsModel | null> {
  try {
    const result = await sequelize.query(
      `SELECT id, content, user_id, entity_type, entity_id, organization_id, created_at, updated_at
       FROM entity_graph_annotations
       WHERE user_id = :user_id AND entity_type = :entity_type AND entity_id = :entity_id
         AND organization_id = :organization_id
       LIMIT 1`,
      {
        replacements: {
          user_id: userId,
          entity_type: entityType,
          entity_id: entityId,
          organization_id: organizationId,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (result && (result as any[]).length > 0) {
      const row = (result as any[])[0];
      return new EntityGraphAnnotationsModel({
        id: row.id,
        content: row.content,
        user_id: row.user_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        organization_id: row.organization_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    return null;
  } catch (error) {
    throw new Error(`Failed to fetch annotation: ${(error as Error).message}`);
  }
}

/**
 * Fetch a single annotation by ID
 *
 * @async
 * @param {number} annotationId - Annotation ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<EntityGraphAnnotationsModel | null>} Annotation or null
 * @throws {Error} If database operation fails
 */
export async function getAnnotationByIdQuery(
  annotationId: number,
  organizationId: number
): Promise<EntityGraphAnnotationsModel | null> {
  try {
    const result = await sequelize.query(
      `SELECT id, content, user_id, entity_type, entity_id, organization_id, created_at, updated_at
       FROM entity_graph_annotations
       WHERE id = :id AND organization_id = :organization_id
       LIMIT 1`,
      {
        replacements: { id: annotationId, organization_id: organizationId },
        type: QueryTypes.SELECT,
      }
    );

    if (result && (result as any[]).length > 0) {
      const row = (result as any[])[0];
      return new EntityGraphAnnotationsModel({
        id: row.id,
        content: row.content,
        user_id: row.user_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        organization_id: row.organization_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    return null;
  } catch (error) {
    throw new Error(`Failed to fetch annotation: ${(error as Error).message}`);
  }
}

/**
 * Update annotation content in the database
 *
 * @async
 * @param {number} annotationId - Annotation ID
 * @param {string} content - New content
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<EntityGraphAnnotationsModel | null>} Updated annotation
 * @throws {Error} If database operation fails
 */
export async function updateAnnotationContentQuery(
  annotationId: number,
  content: string,
  organizationId: number
): Promise<EntityGraphAnnotationsModel | null> {
  try {
    const updatedAt = new Date();

    await sequelize.query(
      `UPDATE entity_graph_annotations
       SET content = :content, updated_at = :updated_at
       WHERE id = :id AND organization_id = :organization_id`,
      {
        replacements: {
          id: annotationId,
          content: content,
          updated_at: updatedAt,
          organization_id: organizationId,
        },
        type: QueryTypes.UPDATE,
      }
    );

    // Fetch the updated annotation
    return getAnnotationByIdQuery(annotationId, organizationId);
  } catch (error) {
    throw new Error(`Failed to update annotation: ${(error as Error).message}`);
  }
}

/**
 * Upsert annotation - create or update
 *
 * Since we have a unique constraint on (user_id, entity_type, entity_id),
 * this function will update if exists or create if not.
 *
 * @async
 * @param {EntityGraphAnnotationsModel} annotation - Annotation to upsert
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<EntityGraphAnnotationsModel>} Upserted annotation
 * @throws {Error} If database operation fails
 */
export async function upsertAnnotationQuery(
  annotation: EntityGraphAnnotationsModel,
  organizationId: number
): Promise<EntityGraphAnnotationsModel> {
  try {
    const result = await sequelize.query(
      `INSERT INTO entity_graph_annotations
        (content, user_id, entity_type, entity_id, organization_id, created_at, updated_at)
       VALUES (:content, :user_id, :entity_type, :entity_id, :organization_id, :created_at, :updated_at)
       ON CONFLICT (user_id, entity_type, entity_id)
       DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at
       RETURNING id, content, user_id, entity_type, entity_id, organization_id, created_at, updated_at`,
      {
        replacements: {
          content: annotation.content,
          user_id: annotation.user_id,
          entity_type: annotation.entity_type,
          entity_id: annotation.entity_id,
          organization_id: organizationId,
          created_at: new Date(),
          updated_at: new Date(),
        },
        type: QueryTypes.INSERT,
      }
    );

    if (
      result &&
      Array.isArray(result) &&
      result[0] &&
      Array.isArray(result[0]) &&
      result[0][0]
    ) {
      const row = result[0][0];
      return new EntityGraphAnnotationsModel({
        id: row.id,
        content: row.content,
        user_id: row.user_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        organization_id: row.organization_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    return annotation;
  } catch (error) {
    throw new Error(`Failed to upsert annotation: ${(error as Error).message}`);
  }
}

/**
 * Delete an annotation from the database
 *
 * @async
 * @param {number} annotationId - Annotation ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<number>} Number of rows affected (0 or 1)
 * @throws {Error} If database operation fails
 */
export async function deleteAnnotationByIdQuery(
  annotationId: number,
  organizationId: number
): Promise<number> {
  try {
    const result = await sequelize.query(
      `DELETE FROM entity_graph_annotations
       WHERE id = :id AND organization_id = :organization_id
       RETURNING id`,
      {
        replacements: { id: annotationId, organization_id: organizationId },
        type: QueryTypes.SELECT,
      }
    );

    return Array.isArray(result) && result.length > 0 ? 1 : 0;
  } catch (error) {
    throw new Error(`Failed to delete annotation: ${(error as Error).message}`);
  }
}

/**
 * Delete annotation by entity for a user
 *
 * @async
 * @param {number} userId - User ID
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<number>} Number of rows affected
 * @throws {Error} If database operation fails
 */
export async function deleteAnnotationByEntityQuery(
  userId: number,
  entityType: string,
  entityId: string,
  organizationId: number
): Promise<number> {
  try {
    const result = await sequelize.query(
      `DELETE FROM entity_graph_annotations
       WHERE user_id = :user_id AND entity_type = :entity_type AND entity_id = :entity_id
         AND organization_id = :organization_id
       RETURNING id`,
      {
        replacements: {
          user_id: userId,
          entity_type: entityType,
          entity_id: entityId,
          organization_id: organizationId,
        },
        type: QueryTypes.SELECT,
      }
    );

    return Array.isArray(result) && result.length > 0 ? 1 : 0;
  } catch (error) {
    throw new Error(
      `Failed to delete annotation by entity: ${(error as Error).message}`
    );
  }
}
