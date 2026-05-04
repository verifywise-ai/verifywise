/**
 * @fileoverview Entity Graph Views Model
 *
 * Defines the EntityGraphViews entity for user-saved filter configurations.
 * Allows users to save and restore custom views of the Entity Graph.
 *
 * Database Schema:
 * - id: Integer primary key
 * - name: View name (max 100 chars)
 * - user_id: Foreign key to UserModel (view owner - private to user)
 * - organization_id: Foreign key to OrganizationModel (multi-tenancy)
 * - config: JSON containing view configuration (filters, visible entities, etc.)
 * - created_at: View creation timestamp
 * - updated_at: Last update timestamp
 *
 * Config JSON structure:
 * {
 *   visibleEntities: string[],      // Entity types to show
 *   visibleRelationships: string[], // Relationship types to show
 *   showProblemsOnly: boolean,      // Filter to problems only
 *   showGapsOnly: boolean,          // Filter to gaps only
 *   query: {                        // Active smart query
 *     entityType: string,
 *     condition: string,
 *     attribute: string
 *   }
 * }
 *
 * @module domain.layer/models/entityGraphViews
 */

import { Column, DataType, ForeignKey, Model, Table, BelongsTo } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { OrganizationModel } from "../organization/organization.model";
import { ValidationException } from "../../exceptions/custom.exception";

// Interface for view configuration
export interface EntityGraphViewConfig {
  visibleEntities?: string[];
  visibleRelationships?: string[];
  showProblemsOnly?: boolean;
  showGapsOnly?: boolean;
  query?: {
    entityType: string;
    condition: string;
    attribute: string;
  } | null;
}

@Table({
  tableName: "entity_graph_views",
  timestamps: true,
  underscored: true,
})
export class EntityGraphViewsModel extends Model<EntityGraphViewsModel> {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  name!: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  user_id!: number;

  @ForeignKey(() => OrganizationModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  organization_id!: number;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
  })
  config!: EntityGraphViewConfig;

  @BelongsTo(() => UserModel)
  user?: UserModel;

  @BelongsTo(() => OrganizationModel)
  organization?: OrganizationModel;

  @Column({
    type: DataType.DATE,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
  })
  updated_at?: Date;

  /**
   * Creates a new view with validation
   */
  static async createView(
    name: string,
    user_id: number,
    organization_id: number,
    config: EntityGraphViewConfig,
  ): Promise<EntityGraphViewsModel> {
    // Validate name
    if (!name || name.trim().length === 0) {
      throw new ValidationException("View name is required", "name", name);
    }

    if (name.trim().length > 100) {
      throw new ValidationException("View name cannot exceed 100 characters", "name", name);
    }

    // Validate user_id
    if (!user_id || user_id < 1) {
      throw new ValidationException("Valid user_id is required", "user_id", user_id);
    }

    // Validate organization_id
    if (!organization_id || organization_id < 1) {
      throw new ValidationException(
        "Valid organization_id is required",
        "organization_id",
        organization_id,
      );
    }

    // Validate config
    if (!config || typeof config !== "object") {
      throw new ValidationException("Valid config object is required", "config", config);
    }

    const view = new EntityGraphViewsModel();
    view.name = name.trim();
    view.user_id = user_id;
    view.organization_id = organization_id;
    view.config = config;
    view.created_at = new Date();
    view.updated_at = new Date();

    return view;
  }

  /**
   * Updates view name and/or config
   */
  async updateView(name?: string, config?: EntityGraphViewConfig): Promise<void> {
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        throw new ValidationException("View name is required", "name", name);
      }
      if (name.trim().length > 100) {
        throw new ValidationException("View name cannot exceed 100 characters", "name", name);
      }
      this.name = name.trim();
    }

    if (config !== undefined) {
      if (!config || typeof config !== "object") {
        throw new ValidationException("Valid config object is required", "config", config);
      }
      this.config = config;
    }

    this.updated_at = new Date();
  }

  /**
   * Checks if view belongs to specified user
   */
  isOwnedBy(userId: number): boolean {
    return this.user_id === userId;
  }

  /**
   * Convert to JSON for API response
   */
  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      user_id: this.user_id,
      organization_id: this.organization_id,
      config: this.config,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
    };
  }

  constructor(init?: Partial<EntityGraphViewsModel>) {
    super();
    Object.assign(this, init);
  }
}
