/**
 * @fileoverview Entity Graph Views Utility Functions
 *
 * Data access layer for Entity Graph saved views operations.
 * Uses raw SQL queries with shared-schema multi-tenancy (organization_id column).
 *
 * Functions:
 * - createViewQuery: Create and persist a new view
 * - getViewsByUserQuery: Fetch all views for a user
 * - getViewByIdQuery: Fetch a single view by ID
 * - updateViewQuery: Update view name and/or config
 * - deleteViewByIdQuery: Delete a view
 *
 * @module utils/entityGraphViews
 */

import {
  EntityGraphViewsModel,
  EntityGraphViewConfig,
} from "../domain.layer/models/entityGraphViews/entityGraphViews.model";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";

/**
 * Create and persist a new view to the database
 *
 * @async
 * @param {EntityGraphViewsModel} view - Model instance to save
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<EntityGraphViewsModel>} Saved view instance
 * @throws {Error} If database operation fails
 */
export async function createViewQuery(
  view: EntityGraphViewsModel,
  organizationId: number
): Promise<EntityGraphViewsModel> {
  try {
    const result = await sequelize.query(
      `INSERT INTO entity_graph_views
        (name, user_id, organization_id, config, created_at, updated_at)
       VALUES (:name, :user_id, :organization_id, :config, :created_at, :updated_at)
       RETURNING id, name, user_id, organization_id, config, created_at, updated_at`,
      {
        replacements: {
          name: view.name,
          user_id: view.user_id,
          organization_id: organizationId,
          config: JSON.stringify(view.config),
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
      view.id = row.id;
      view.created_at = row.created_at;
      view.updated_at = row.updated_at;
    }

    return view;
  } catch (error) {
    throw new Error(`Failed to create view: ${(error as Error).message}`);
  }
}

/**
 * Fetch all views for a user in an organization
 *
 * @async
 * @param {number} userId - User ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<EntityGraphViewsModel[]>} Array of views
 * @throws {Error} If database operation fails
 */
export async function getViewsByUserQuery(
  userId: number,
  organizationId: number
): Promise<EntityGraphViewsModel[]> {
  try {
    const views = await sequelize.query(
      `SELECT id, name, user_id, organization_id, config, created_at, updated_at
       FROM entity_graph_views
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

    return (views as any[]).map((row) => {
      return new EntityGraphViewsModel({
        id: row.id,
        name: row.name,
        user_id: row.user_id,
        organization_id: row.organization_id,
        config:
          typeof row.config === "string" ? JSON.parse(row.config) : row.config,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    });
  } catch (error) {
    throw new Error(`Failed to fetch views: ${(error as Error).message}`);
  }
}

/**
 * Fetch a single view by ID
 *
 * @async
 * @param {number} viewId - View ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<EntityGraphViewsModel | null>} View or null
 * @throws {Error} If database operation fails
 */
export async function getViewByIdQuery(
  viewId: number,
  organizationId: number
): Promise<EntityGraphViewsModel | null> {
  try {
    const result = await sequelize.query(
      `SELECT id, name, user_id, organization_id, config, created_at, updated_at
       FROM entity_graph_views
       WHERE id = :id AND organization_id = :organization_id
       LIMIT 1`,
      {
        replacements: { id: viewId, organization_id: organizationId },
        type: QueryTypes.SELECT,
      }
    );

    if (result && (result as any[]).length > 0) {
      const row = (result as any[])[0];
      return new EntityGraphViewsModel({
        id: row.id,
        name: row.name,
        user_id: row.user_id,
        organization_id: row.organization_id,
        config:
          typeof row.config === "string" ? JSON.parse(row.config) : row.config,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    return null;
  } catch (error) {
    throw new Error(`Failed to fetch view: ${(error as Error).message}`);
  }
}

/**
 * Update view name and/or config in the database
 *
 * @async
 * @param {number} viewId - View ID
 * @param {string | undefined} name - New name (optional)
 * @param {EntityGraphViewConfig | undefined} config - New config (optional)
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<EntityGraphViewsModel | null>} Updated view
 * @throws {Error} If database operation fails
 */
export async function updateViewQuery(
  viewId: number,
  name: string | undefined,
  config: EntityGraphViewConfig | undefined,
  organizationId: number
): Promise<EntityGraphViewsModel | null> {
  try {
    const updatedAt = new Date();

    // Build dynamic update query based on what's provided
    const updates: string[] = ["updated_at = :updated_at"];
    const replacements: any = {
      id: viewId,
      organization_id: organizationId,
      updated_at: updatedAt,
    };

    if (name !== undefined) {
      updates.push("name = :name");
      replacements.name = name;
    }

    if (config !== undefined) {
      updates.push("config = :config");
      replacements.config = JSON.stringify(config);
    }

    await sequelize.query(
      `UPDATE entity_graph_views
       SET ${updates.join(", ")}
       WHERE id = :id AND organization_id = :organization_id`,
      {
        replacements,
        type: QueryTypes.UPDATE,
      }
    );

    // Fetch the updated view
    return getViewByIdQuery(viewId, organizationId);
  } catch (error) {
    throw new Error(`Failed to update view: ${(error as Error).message}`);
  }
}

/**
 * Delete a view from the database
 *
 * @async
 * @param {number} viewId - View ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<number>} Number of rows affected (0 or 1)
 * @throws {Error} If database operation fails
 */
export async function deleteViewByIdQuery(
  viewId: number,
  organizationId: number
): Promise<number> {
  try {
    const result = await sequelize.query(
      `DELETE FROM entity_graph_views
       WHERE id = :id AND organization_id = :organization_id
       RETURNING id`,
      {
        replacements: { id: viewId, organization_id: organizationId },
        type: QueryTypes.SELECT,
      }
    );

    return Array.isArray(result) && result.length > 0 ? 1 : 0;
  } catch (error) {
    throw new Error(`Failed to delete view: ${(error as Error).message}`);
  }
}

/**
 * Get view count for a user
 *
 * @async
 * @param {number} userId - User ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<number>} Count of views
 * @throws {Error} If database operation fails
 */
export async function getViewCountByUserQuery(
  userId: number,
  organizationId: number
): Promise<number> {
  try {
    const result = await sequelize.query(
      `SELECT COUNT(*) as count
       FROM entity_graph_views
       WHERE user_id = :user_id AND organization_id = :organization_id`,
      {
        replacements: {
          user_id: userId,
          organization_id: organizationId,
        },
        type: QueryTypes.SELECT,
      }
    );

    return parseInt((result as any[])[0].count, 10) || 0;
  } catch (error) {
    throw new Error(`Failed to count views: ${(error as Error).message}`);
  }
}
