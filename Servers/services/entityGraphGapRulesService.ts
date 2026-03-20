/**
 * @fileoverview Entity Graph Gap Rules Service
 *
 * Business logic layer for Entity Graph gap detection rules management.
 * Handles validation, permission checks, and orchestration of gap rules operations.
 *
 * Responsibilities:
 * - Validate user permissions (only owner can modify)
 * - Validate rule structure
 * - Coordinate with utilities
 * - Log audit events
 *
 * @module services/entityGraphGapRulesService
 */

import {
  EntityGraphGapRulesModel,
  GapRule,
} from "../domain.layer/models/entityGraphGapRules/entityGraphGapRules.model";
import {
  getGapRulesByUserQuery,
  getGapRulesByIdQuery,
  upsertGapRulesQuery,
  deleteGapRulesQuery,
  getDefaultGapRules,
} from "../utils/entityGraphGapRules.utils";
import {
  ValidationException,
  BusinessLogicException,
} from "../domain.layer/exceptions/custom.exception";
import {
  logFailure,
  logProcessing,
  logSuccess,
} from "../utils/logger/logHelper";

// Valid entity types for gap rules
const VALID_ENTITY_TYPES = ["model", "risk", "control", "vendor", "useCase"];

// Valid severity levels
const VALID_SEVERITIES = ["critical", "warning", "info"];

export class EntityGraphGapRulesService {
  /**
   * Save gap rules for a user (create or update)
   *
   * @static
   * @async
   * @param {GapRule[]} rules - Array of gap rules
   * @param {number} userId - User ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<EntityGraphGapRulesModel>} Saved gap rules
   * @throws {ValidationException} If validation fails
   */
  static async saveGapRules(
    rules: GapRule[],
    userId: number,
    organizationId: number
  ): Promise<EntityGraphGapRulesModel> {
    logProcessing({
      description: "Starting EntityGraphGapRulesService.saveGapRules",
      functionName: "saveGapRules",
      fileName: "entityGraphGapRulesService.ts",
      userId: userId,
      organizationId: organizationId,
    });

    try {
      // Validate rules array
      if (!Array.isArray(rules)) {
        throw new ValidationException(
          "Rules must be an array",
          "rules",
          rules
        );
      }

      if (rules.length > 50) {
        throw new ValidationException(
          "Maximum of 50 gap rules allowed",
          "rules",
          rules.length
        );
      }

      // Validate each rule
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];

        if (!rule.entityType) {
          throw new ValidationException(
            `Rule ${i + 1}: entityType is required`,
            "rules",
            rule
          );
        }

        if (!VALID_ENTITY_TYPES.includes(rule.entityType)) {
          throw new ValidationException(
            `Rule ${i + 1}: entityType must be one of: ${VALID_ENTITY_TYPES.join(", ")}`,
            "rules",
            rule
          );
        }

        if (!rule.requirement || rule.requirement.trim().length === 0) {
          throw new ValidationException(
            `Rule ${i + 1}: requirement is required`,
            "rules",
            rule
          );
        }

        if (!rule.severity) {
          throw new ValidationException(
            `Rule ${i + 1}: severity is required`,
            "rules",
            rule
          );
        }

        if (!VALID_SEVERITIES.includes(rule.severity)) {
          throw new ValidationException(
            `Rule ${i + 1}: severity must be one of: ${VALID_SEVERITIES.join(", ")}`,
            "rules",
            rule
          );
        }

        if (typeof rule.enabled !== "boolean") {
          throw new ValidationException(
            `Rule ${i + 1}: enabled must be a boolean`,
            "rules",
            rule
          );
        }
      }

      if (!userId || userId < 1) {
        throw new ValidationException(
          "Valid user ID is required",
          "userId",
          userId
        );
      }

      // Create gap rules model
      const gapRules = await EntityGraphGapRulesModel.createGapRules(
        userId,
        organizationId,
        rules
      );

      // Upsert to database
      const savedGapRules = await upsertGapRulesQuery(gapRules, organizationId);

      await logSuccess({
        eventType: "Create",
        description: `Gap rules saved for user ${userId}`,
        functionName: "saveGapRules",
        fileName: "entityGraphGapRulesService.ts",
        userId: userId,
        organizationId: organizationId,
      });

      return savedGapRules;
    } catch (error) {
      await logFailure({
        eventType: "Create",
        description: "Failed to save gap rules",
        functionName: "saveGapRules",
        fileName: "entityGraphGapRulesService.ts",
        error: error as Error,
        userId: userId,
        organizationId: organizationId,
      });
      throw error;
    }
  }

  /**
   * Get gap rules for a user
   *
   * Returns user's custom rules or default rules if none exist.
   *
   * @static
   * @async
   * @param {number} userId - User ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<{ rules: GapRule[]; isDefault: boolean }>} Gap rules and default flag
   */
  static async getGapRules(
    userId: number,
    organizationId: number
  ): Promise<{ rules: GapRule[]; isDefault: boolean; id?: number }> {
    logProcessing({
      description: "Starting EntityGraphGapRulesService.getGapRules",
      functionName: "getGapRules",
      fileName: "entityGraphGapRulesService.ts",
      userId: userId,
      organizationId: organizationId,
    });

    try {
      const gapRules = await getGapRulesByUserQuery(userId, organizationId);

      if (gapRules) {
        await logSuccess({
          eventType: "Read",
          description: `Retrieved gap rules for user ${userId}`,
          functionName: "getGapRules",
          fileName: "entityGraphGapRulesService.ts",
          userId: userId,
          organizationId: organizationId,
        });

        return {
          rules: gapRules.rules,
          isDefault: false,
          id: gapRules.id,
        };
      }

      // Return default rules if user has no custom rules
      await logSuccess({
        eventType: "Read",
        description: `Returning default gap rules for user ${userId}`,
        functionName: "getGapRules",
        fileName: "entityGraphGapRulesService.ts",
        userId: userId,
        organizationId: organizationId,
      });

      return {
        rules: getDefaultGapRules(),
        isDefault: true,
      };
    } catch (error) {
      await logFailure({
        eventType: "Read",
        description: "Failed to fetch gap rules",
        functionName: "getGapRules",
        fileName: "entityGraphGapRulesService.ts",
        error: error as Error,
        userId: userId,
        organizationId: organizationId,
      });
      throw error;
    }
  }

  /**
   * Reset gap rules to defaults
   *
   * Deletes user's custom rules so they'll get defaults.
   *
   * @static
   * @async
   * @param {number} userId - User ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<{ rules: GapRule[]; isDefault: boolean }>} Default rules
   */
  static async resetToDefaults(
    userId: number,
    organizationId: number
  ): Promise<{ rules: GapRule[]; isDefault: boolean }> {
    logProcessing({
      description: "Starting EntityGraphGapRulesService.resetToDefaults",
      functionName: "resetToDefaults",
      fileName: "entityGraphGapRulesService.ts",
      userId: userId,
      organizationId: organizationId,
    });

    try {
      // Get existing rules to find the ID
      const existingRules = await getGapRulesByUserQuery(userId, organizationId);

      if (existingRules && existingRules.id) {
        // Delete user's custom rules
        await deleteGapRulesQuery(existingRules.id, organizationId);
      }

      await logSuccess({
        eventType: "Update",
        description: `Gap rules reset to defaults for user ${userId}`,
        functionName: "resetToDefaults",
        fileName: "entityGraphGapRulesService.ts",
        userId: userId,
        organizationId: organizationId,
      });

      return {
        rules: getDefaultGapRules(),
        isDefault: true,
      };
    } catch (error) {
      await logFailure({
        eventType: "Update",
        description: "Failed to reset gap rules",
        functionName: "resetToDefaults",
        fileName: "entityGraphGapRulesService.ts",
        error: error as Error,
        userId: userId,
        organizationId: organizationId,
      });
      throw error;
    }
  }

  /**
   * Delete gap rules
   *
   * @static
   * @async
   * @param {number} gapRulesId - Gap rules ID
   * @param {number} userId - User ID attempting deletion
   * @param {number} organizationId - Organization ID
   * @returns {Promise<boolean>} True if deleted successfully
   * @throws {BusinessLogicException} If user lacks permission
   */
  static async deleteGapRules(
    gapRulesId: number,
    userId: number,
    organizationId: number
  ): Promise<boolean> {
    logProcessing({
      description: `Starting EntityGraphGapRulesService.deleteGapRules for ID ${gapRulesId}`,
      functionName: "deleteGapRules",
      fileName: "entityGraphGapRulesService.ts",
      userId: userId,
      organizationId: organizationId,
    });

    try {
      // Fetch existing gap rules
      const gapRules = await getGapRulesByIdQuery(gapRulesId, organizationId);

      if (!gapRules) {
        throw new Error(`Gap rules with ID ${gapRulesId} not found`);
      }

      // Check permissions: only owner can delete
      if (!gapRules.isOwnedBy(userId)) {
        throw new BusinessLogicException(
          "Only the gap rules owner can delete these rules",
          "GAP_RULES_DELETE_FORBIDDEN",
          { gapRulesId, userId }
        );
      }

      // Delete from database
      const deleteCount = await deleteGapRulesQuery(gapRulesId, organizationId);

      if (deleteCount === 0) {
        throw new Error(`Failed to delete gap rules with ID ${gapRulesId}`);
      }

      await logSuccess({
        eventType: "Delete",
        description: `Gap rules ${gapRulesId} deleted`,
        functionName: "deleteGapRules",
        fileName: "entityGraphGapRulesService.ts",
        userId: userId,
        organizationId: organizationId,
      });

      return true;
    } catch (error) {
      await logFailure({
        eventType: "Delete",
        description: `Failed to delete gap rules ${gapRulesId}`,
        functionName: "deleteGapRules",
        fileName: "entityGraphGapRulesService.ts",
        error: error as Error,
        userId: userId,
        organizationId: organizationId,
      });
      throw error;
    }
  }

  /**
   * Get default gap rules
   *
   * @static
   * @returns {GapRule[]} Default gap rules
   */
  static getDefaults(): GapRule[] {
    return getDefaultGapRules();
  }
}
