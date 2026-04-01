/**
 * @fileoverview Entity Graph Views Service
 *
 * Business logic layer for Entity Graph saved views management.
 * Handles validation, permission checks, and orchestration of view operations.
 *
 * Responsibilities:
 * - Validate user permissions (only owner can modify)
 * - Sanitize user input
 * - Coordinate with utilities
 * - Log audit events
 *
 * @module services/entityGraphViewsService
 */

import {
  EntityGraphViewsModel,
  EntityGraphViewConfig,
} from "../domain.layer/models/entityGraphViews/entityGraphViews.model";
import {
  createViewQuery,
  getViewsByUserQuery,
  getViewByIdQuery,
  updateViewQuery,
  deleteViewByIdQuery,
  getViewCountByUserQuery,
} from "../utils/entityGraphViews.utils";
import {
  ValidationException,
  BusinessLogicException,
} from "../domain.layer/exceptions/custom.exception";
import {
  logFailure,
  logProcessing,
  logSuccess,
} from "../utils/logger/logHelper";
import {
  sanitizeViewName,
  sanitizeViewConfig,
} from "../utils/entityGraphSecurity.utils";

// Maximum number of saved views per user
const MAX_VIEWS_PER_USER = 20;

export class EntityGraphViewsService {
  /**
   * Create a new saved view
   *
   * @static
   * @async
   * @param {string} name - View name
   * @param {EntityGraphViewConfig} config - View configuration
   * @param {number} userId - User ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<EntityGraphViewsModel>} Created view
   * @throws {ValidationException} If validation fails
   */
  static async createView(
    name: string,
    config: EntityGraphViewConfig,
    userId: number,
    organizationId: number
  ): Promise<EntityGraphViewsModel> {
    logProcessing({
      description: "Starting EntityGraphViewsService.createView",
      functionName: "createView",
      fileName: "entityGraphViewsService.ts",
      userId: userId,
      organizationId: organizationId,
    });

    try {
      // Validate and sanitize name
      const nameValidation = sanitizeViewName(name);
      if (!nameValidation.valid) {
        throw new ValidationException(
          nameValidation.error || "Invalid view name",
          "name",
          name
        );
      }
      const sanitizedName = nameValidation.sanitized;

      // Validate and sanitize config
      const configValidation = sanitizeViewConfig(config);
      if (!configValidation.valid) {
        throw new ValidationException(
          configValidation.error || "Invalid config",
          "config",
          config
        );
      }
      const sanitizedConfig = configValidation.sanitized as EntityGraphViewConfig;

      if (!userId || userId < 1) {
        throw new ValidationException(
          "Valid user ID is required",
          "userId",
          userId
        );
      }

      // Check if user has reached the limit
      const viewCount = await getViewCountByUserQuery(
        userId,
        organizationId
      );

      if (viewCount >= MAX_VIEWS_PER_USER) {
        throw new BusinessLogicException(
          `Maximum of ${MAX_VIEWS_PER_USER} saved views allowed per user`,
          "MAX_VIEWS_REACHED",
          { currentCount: viewCount, maxAllowed: MAX_VIEWS_PER_USER }
        );
      }

      // Create view model
      const view = await EntityGraphViewsModel.createView(
        sanitizedName,
        userId,
        organizationId,
        sanitizedConfig
      );

      // Save to database
      const savedView = await createViewQuery(view, organizationId);

      await logSuccess({
        eventType: "Create",
        description: `View "${name}" created`,
        functionName: "createView",
        fileName: "entityGraphViewsService.ts",
        userId: userId,
        organizationId: organizationId,
      });

      return savedView;
    } catch (error) {
      await logFailure({
        eventType: "Create",
        description: "Failed to create view",
        functionName: "createView",
        fileName: "entityGraphViewsService.ts",
        error: error as Error,
        userId: userId,
        organizationId: organizationId,
      });
      throw error;
    }
  }

  /**
   * Get all views for a user
   *
   * @static
   * @async
   * @param {number} userId - User ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<EntityGraphViewsModel[]>} Array of views
   */
  static async getViews(
    userId: number,
    organizationId: number
  ): Promise<EntityGraphViewsModel[]> {
    logProcessing({
      description: "Starting EntityGraphViewsService.getViews",
      functionName: "getViews",
      fileName: "entityGraphViewsService.ts",
      userId: userId,
      organizationId: organizationId,
    });

    try {
      const views = await getViewsByUserQuery(userId, organizationId);

      await logSuccess({
        eventType: "Read",
        description: `Retrieved ${views.length} views for user ${userId}`,
        functionName: "getViews",
        fileName: "entityGraphViewsService.ts",
        userId: userId,
        organizationId: organizationId,
      });

      return views;
    } catch (error) {
      await logFailure({
        eventType: "Read",
        description: "Failed to fetch views",
        functionName: "getViews",
        fileName: "entityGraphViewsService.ts",
        error: error as Error,
        userId: userId,
        organizationId: organizationId,
      });
      throw error;
    }
  }

  /**
   * Get a specific view by ID
   *
   * @static
   * @async
   * @param {number} viewId - View ID
   * @param {number} userId - User ID (for permission check)
   * @param {number} organizationId - Organization ID
   * @returns {Promise<EntityGraphViewsModel | null>} View or null
   */
  static async getViewById(
    viewId: number,
    userId: number,
    organizationId: number
  ): Promise<EntityGraphViewsModel | null> {
    try {
      const view = await getViewByIdQuery(viewId, organizationId);

      // Only return if user owns the view
      if (view && !view.isOwnedBy(userId)) {
        return null;
      }

      return view;
    } catch (error) {
      throw new Error(`Failed to get view: ${(error as Error).message}`);
    }
  }

  /**
   * Update a view
   *
   * @static
   * @async
   * @param {number} viewId - View ID
   * @param {string | undefined} name - New name (optional)
   * @param {EntityGraphViewConfig | undefined} config - New config (optional)
   * @param {number} userId - User ID attempting update
   * @param {number} organizationId - Organization ID
   * @returns {Promise<EntityGraphViewsModel>} Updated view
   * @throws {BusinessLogicException} If user lacks permission
   */
  static async updateView(
    viewId: number,
    name: string | undefined,
    config: EntityGraphViewConfig | undefined,
    userId: number,
    organizationId: number
  ): Promise<EntityGraphViewsModel> {
    logProcessing({
      description: `Starting EntityGraphViewsService.updateView for ID ${viewId}`,
      functionName: "updateView",
      fileName: "entityGraphViewsService.ts",
      userId: userId,
      organizationId: organizationId,
    });

    try {
      // Validate and sanitize name if provided
      let sanitizedName: string | undefined;
      if (name !== undefined) {
        const nameValidation = sanitizeViewName(name);
        if (!nameValidation.valid) {
          throw new ValidationException(
            nameValidation.error || "Invalid view name",
            "name",
            name
          );
        }
        sanitizedName = nameValidation.sanitized;
      }

      // Validate and sanitize config if provided
      let sanitizedConfig: EntityGraphViewConfig | undefined;
      if (config !== undefined) {
        const configValidation = sanitizeViewConfig(config);
        if (!configValidation.valid) {
          throw new ValidationException(
            configValidation.error || "Invalid config",
            "config",
            config
          );
        }
        sanitizedConfig = configValidation.sanitized as EntityGraphViewConfig;
      }

      // Fetch existing view
      const existingView = await getViewByIdQuery(viewId, organizationId);

      if (!existingView) {
        throw new Error(`View with ID ${viewId} not found`);
      }

      // Check permissions: only owner can update
      if (!existingView.isOwnedBy(userId)) {
        throw new BusinessLogicException(
          "Only the view owner can update this view",
          "VIEW_UPDATE_FORBIDDEN",
          { viewId, userId }
        );
      }

      // Update in database
      const updatedView = await updateViewQuery(
        viewId,
        sanitizedName,
        sanitizedConfig,
        organizationId
      );

      if (!updatedView) {
        throw new Error(`Failed to update view with ID ${viewId}`);
      }

      await logSuccess({
        eventType: "Update",
        description: `View ${viewId} updated`,
        functionName: "updateView",
        fileName: "entityGraphViewsService.ts",
        userId: userId,
        organizationId: organizationId,
      });

      return updatedView;
    } catch (error) {
      await logFailure({
        eventType: "Update",
        description: `Failed to update view ${viewId}`,
        functionName: "updateView",
        fileName: "entityGraphViewsService.ts",
        error: error as Error,
        userId: userId,
        organizationId: organizationId,
      });
      throw error;
    }
  }

  /**
   * Delete a view
   *
   * @static
   * @async
   * @param {number} viewId - View ID
   * @param {number} userId - User ID attempting deletion
   * @param {number} organizationId - Organization ID
   * @returns {Promise<boolean>} True if deleted successfully
   * @throws {BusinessLogicException} If user lacks permission
   */
  static async deleteView(
    viewId: number,
    userId: number,
    organizationId: number
  ): Promise<boolean> {
    logProcessing({
      description: `Starting EntityGraphViewsService.deleteView for ID ${viewId}`,
      functionName: "deleteView",
      fileName: "entityGraphViewsService.ts",
      userId: userId,
      organizationId: organizationId,
    });

    try {
      // Fetch existing view
      const view = await getViewByIdQuery(viewId, organizationId);

      if (!view) {
        throw new Error(`View with ID ${viewId} not found`);
      }

      // Check permissions: only owner can delete
      if (!view.isOwnedBy(userId)) {
        throw new BusinessLogicException(
          "Only the view owner can delete this view",
          "VIEW_DELETE_FORBIDDEN",
          { viewId, userId }
        );
      }

      // Delete from database
      const deleteCount = await deleteViewByIdQuery(viewId, organizationId);

      if (deleteCount === 0) {
        throw new Error(`Failed to delete view with ID ${viewId}`);
      }

      await logSuccess({
        eventType: "Delete",
        description: `View ${viewId} deleted`,
        functionName: "deleteView",
        fileName: "entityGraphViewsService.ts",
        userId: userId,
        organizationId: organizationId,
      });

      return true;
    } catch (error) {
      await logFailure({
        eventType: "Delete",
        description: `Failed to delete view ${viewId}`,
        functionName: "deleteView",
        fileName: "entityGraphViewsService.ts",
        error: error as Error,
        userId: userId,
        organizationId: organizationId,
      });
      throw error;
    }
  }
}
