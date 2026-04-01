/**
 * @fileoverview Entity Graph Gap Rules Utility Functions
 *
 * Data access layer for Entity Graph gap detection rules operations.
 * Uses raw SQL queries with shared-schema multi-tenancy (organization_id column).
 *
 * Functions:
 * - createGapRulesQuery: Create and persist new gap rules
 * - getGapRulesByUserQuery: Fetch gap rules for a user
 * - updateGapRulesQuery: Update gap rules
 * - deleteGapRulesQuery: Delete gap rules
 *
 * @module utils/entityGraphGapRules
 */

import {
  EntityGraphGapRulesModel,
  GapRule,
} from "../domain.layer/models/entityGraphGapRules/entityGraphGapRules.model";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";

/**
 * Create and persist new gap rules to the database
 *
 * @async
 * @param {EntityGraphGapRulesModel} gapRules - Model instance to save
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<EntityGraphGapRulesModel>} Saved gap rules instance
 * @throws {Error} If database operation fails
 */
export async function createGapRulesQuery(
  gapRules: EntityGraphGapRulesModel,
  organizationId: number
): Promise<EntityGraphGapRulesModel> {
  try {
    const result = await sequelize.query(
      `INSERT INTO entity_graph_gap_rules
        (user_id, organization_id, rules, created_at, updated_at)
       VALUES (:user_id, :organization_id, :rules, :created_at, :updated_at)
       RETURNING id, user_id, organization_id, rules, created_at, updated_at`,
      {
        replacements: {
          user_id: gapRules.user_id,
          organization_id: organizationId,
          rules: JSON.stringify(gapRules.rules),
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
      gapRules.id = row.id;
      gapRules.created_at = row.created_at;
      gapRules.updated_at = row.updated_at;
    }

    return gapRules;
  } catch (error) {
    throw new Error(`Failed to create gap rules: ${(error as Error).message}`);
  }
}

/**
 * Fetch gap rules for a user
 *
 * Since each user can only have one set of rules (UNIQUE constraint on user_id),
 * this returns a single record or null.
 *
 * @async
 * @param {number} userId - User ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<EntityGraphGapRulesModel | null>} Gap rules or null
 * @throws {Error} If database operation fails
 */
export async function getGapRulesByUserQuery(
  userId: number,
  organizationId: number
): Promise<EntityGraphGapRulesModel | null> {
  try {
    const result = await sequelize.query(
      `SELECT id, user_id, organization_id, rules, created_at, updated_at
       FROM entity_graph_gap_rules
       WHERE user_id = :user_id AND organization_id = :organization_id
       LIMIT 1`,
      {
        replacements: { user_id: userId, organization_id: organizationId },
        type: QueryTypes.SELECT,
      }
    );

    if (result && (result as any[]).length > 0) {
      const row = (result as any[])[0];
      return new EntityGraphGapRulesModel({
        id: row.id,
        user_id: row.user_id,
        organization_id: row.organization_id,
        rules:
          typeof row.rules === "string" ? JSON.parse(row.rules) : row.rules,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    return null;
  } catch (error) {
    throw new Error(`Failed to fetch gap rules: ${(error as Error).message}`);
  }
}

/**
 * Fetch gap rules by ID
 *
 * @async
 * @param {number} gapRulesId - Gap rules ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<EntityGraphGapRulesModel | null>} Gap rules or null
 * @throws {Error} If database operation fails
 */
export async function getGapRulesByIdQuery(
  gapRulesId: number,
  organizationId: number
): Promise<EntityGraphGapRulesModel | null> {
  try {
    const result = await sequelize.query(
      `SELECT id, user_id, organization_id, rules, created_at, updated_at
       FROM entity_graph_gap_rules
       WHERE id = :id AND organization_id = :organization_id
       LIMIT 1`,
      {
        replacements: { id: gapRulesId, organization_id: organizationId },
        type: QueryTypes.SELECT,
      }
    );

    if (result && (result as any[]).length > 0) {
      const row = (result as any[])[0];
      return new EntityGraphGapRulesModel({
        id: row.id,
        user_id: row.user_id,
        organization_id: row.organization_id,
        rules:
          typeof row.rules === "string" ? JSON.parse(row.rules) : row.rules,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    return null;
  } catch (error) {
    throw new Error(`Failed to fetch gap rules: ${(error as Error).message}`);
  }
}

/**
 * Update gap rules in the database
 *
 * @async
 * @param {number} gapRulesId - Gap rules ID
 * @param {GapRule[]} rules - New rules array
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<EntityGraphGapRulesModel | null>} Updated gap rules
 * @throws {Error} If database operation fails
 */
export async function updateGapRulesQuery(
  gapRulesId: number,
  rules: GapRule[],
  organizationId: number
): Promise<EntityGraphGapRulesModel | null> {
  try {
    const updatedAt = new Date();

    await sequelize.query(
      `UPDATE entity_graph_gap_rules
       SET rules = :rules, updated_at = :updated_at
       WHERE id = :id AND organization_id = :organization_id`,
      {
        replacements: {
          id: gapRulesId,
          rules: JSON.stringify(rules),
          updated_at: updatedAt,
          organization_id: organizationId,
        },
        type: QueryTypes.UPDATE,
      }
    );

    // Fetch the updated gap rules
    return getGapRulesByIdQuery(gapRulesId, organizationId);
  } catch (error) {
    throw new Error(`Failed to update gap rules: ${(error as Error).message}`);
  }
}

/**
 * Upsert gap rules - create or update
 *
 * Since we have a unique constraint on user_id, this function will
 * update if exists or create if not.
 *
 * @async
 * @param {EntityGraphGapRulesModel} gapRules - Gap rules to upsert
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<EntityGraphGapRulesModel>} Upserted gap rules
 * @throws {Error} If database operation fails
 */
export async function upsertGapRulesQuery(
  gapRules: EntityGraphGapRulesModel,
  organizationId: number
): Promise<EntityGraphGapRulesModel> {
  try {
    const result = await sequelize.query(
      `INSERT INTO entity_graph_gap_rules
        (user_id, organization_id, rules, created_at, updated_at)
       VALUES (:user_id, :organization_id, :rules, :created_at, :updated_at)
       ON CONFLICT (user_id)
       DO UPDATE SET rules = EXCLUDED.rules, updated_at = EXCLUDED.updated_at
       RETURNING id, user_id, organization_id, rules, created_at, updated_at`,
      {
        replacements: {
          user_id: gapRules.user_id,
          organization_id: organizationId,
          rules: JSON.stringify(gapRules.rules),
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
      return new EntityGraphGapRulesModel({
        id: row.id,
        user_id: row.user_id,
        organization_id: row.organization_id,
        rules:
          typeof row.rules === "string" ? JSON.parse(row.rules) : row.rules,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    return gapRules;
  } catch (error) {
    throw new Error(`Failed to upsert gap rules: ${(error as Error).message}`);
  }
}

/**
 * Delete gap rules from the database
 *
 * @async
 * @param {number} gapRulesId - Gap rules ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<number>} Number of rows affected (0 or 1)
 * @throws {Error} If database operation fails
 */
export async function deleteGapRulesQuery(
  gapRulesId: number,
  organizationId: number
): Promise<number> {
  try {
    const result = await sequelize.query(
      `DELETE FROM entity_graph_gap_rules
       WHERE id = :id AND organization_id = :organization_id
       RETURNING id`,
      {
        replacements: { id: gapRulesId, organization_id: organizationId },
        type: QueryTypes.SELECT,
      }
    );

    return Array.isArray(result) && result.length > 0 ? 1 : 0;
  } catch (error) {
    throw new Error(`Failed to delete gap rules: ${(error as Error).message}`);
  }
}

/**
 * Delete gap rules by user ID
 *
 * @async
 * @param {number} userId - User ID
 * @param {number} organizationId - Organization ID for tenant isolation
 * @returns {Promise<number>} Number of rows affected
 * @throws {Error} If database operation fails
 */
export async function deleteGapRulesByUserQuery(
  userId: number,
  organizationId: number
): Promise<number> {
  try {
    const result = await sequelize.query(
      `DELETE FROM entity_graph_gap_rules
       WHERE user_id = :user_id AND organization_id = :organization_id
       RETURNING id`,
      {
        replacements: { user_id: userId, organization_id: organizationId },
        type: QueryTypes.SELECT,
      }
    );

    return Array.isArray(result) && result.length > 0 ? 1 : 0;
  } catch (error) {
    throw new Error(
      `Failed to delete gap rules by user: ${(error as Error).message}`
    );
  }
}

/**
 * Get default gap rules
 *
 * Returns a set of default gap detection rules that can be used
 * as a starting point for users.
 *
 * @returns {GapRule[]} Default gap rules
 */
export function getDefaultGapRules(): GapRule[] {
  return [
    {
      entityType: "model",
      requirement: "has_risk",
      severity: "warning",
      enabled: true,
    },
    {
      entityType: "model",
      requirement: "has_control",
      severity: "warning",
      enabled: true,
    },
    {
      entityType: "model",
      requirement: "has_owner",
      severity: "info",
      enabled: true,
    },
    {
      entityType: "risk",
      requirement: "has_control",
      severity: "critical",
      enabled: true,
    },
    {
      entityType: "risk",
      requirement: "has_owner",
      severity: "warning",
      enabled: true,
    },
    {
      entityType: "control",
      requirement: "has_evidence",
      severity: "warning",
      enabled: true,
    },
    {
      entityType: "vendor",
      requirement: "has_risk",
      severity: "info",
      enabled: true,
    },
    {
      entityType: "useCase",
      requirement: "has_model",
      severity: "warning",
      enabled: true,
    },
  ];
}
