/**
 * @fileoverview Entity Graph Annotations Model
 *
 * Defines the EntityGraphAnnotations entity for user-private notes on graph nodes.
 * Allows users to attach personal notes to entities in the Entity Graph visualization.
 *
 * Database Schema:
 * - id: Integer primary key
 * - content: Note text content (max 2000 chars)
 * - user_id: Foreign key to UserModel (note owner - private to user)
 * - entity_type: Type of entity (useCase, model, risk, vendor, etc.)
 * - entity_id: String ID of the entity (e.g., "model-123", "vendor-456")
 * - organization_id: Foreign key to OrganizationModel (multi-tenancy)
 * - created_at: Note creation timestamp
 * - updated_at: Last update timestamp
 *
 * Key Features:
 * - User-private (not shared with team)
 * - Organization-scoped for multi-tenancy
 * - Supports all Entity Graph entity types
 * - Flexible entity_id as string to support various ID formats
 *
 * @module domain.layer/models/entityGraphAnnotations
 */

import { Column, DataType, ForeignKey, Model, Table, BelongsTo } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { OrganizationModel } from "../organization/organization.model";
import { ValidationException } from "../../exceptions/custom.exception";

// Enum for supported entity types in Entity Graph
export enum EntityGraphEntityType {
  USE_CASE = "useCase",
  MODEL = "model",
  RISK = "risk",
  VENDOR = "vendor",
  CONTROL = "control",
  EVIDENCE = "evidence",
  FRAMEWORK = "framework",
  USER = "user",
}

@Table({
  tableName: "entity_graph_annotations",
  timestamps: true,
  underscored: true,
})
export class EntityGraphAnnotationsModel extends Model<EntityGraphAnnotationsModel> {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    validate: {
      len: [1, 2000],
    },
  })
  content!: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  user_id!: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  entity_type!: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  entity_id!: string;

  @ForeignKey(() => OrganizationModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  organization_id!: number;

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
   * Creates a new annotation with validation
   */
  static async createAnnotation(
    content: string,
    user_id: number,
    entity_type: string,
    entity_id: string,
    organization_id: number,
  ): Promise<EntityGraphAnnotationsModel> {
    // Validate content
    if (!content || content.trim().length === 0) {
      throw new ValidationException("Annotation content is required", "content", content);
    }

    if (content.trim().length > 2000) {
      throw new ValidationException(
        "Annotation content cannot exceed 2000 characters",
        "content",
        content,
      );
    }

    // Validate user_id
    if (!user_id || user_id < 1) {
      throw new ValidationException("Valid user_id is required", "user_id", user_id);
    }

    // Validate entity_type
    if (!entity_type || entity_type.trim().length === 0) {
      throw new ValidationException("entity_type is required", "entity_type", entity_type);
    }

    // Validate entity_id
    if (!entity_id || entity_id.trim().length === 0) {
      throw new ValidationException("entity_id is required", "entity_id", entity_id);
    }

    // Validate organization_id
    if (!organization_id || organization_id < 1) {
      throw new ValidationException(
        "Valid organization_id is required",
        "organization_id",
        organization_id,
      );
    }

    const annotation = new EntityGraphAnnotationsModel();
    annotation.content = content.trim();
    annotation.user_id = user_id;
    annotation.entity_type = entity_type.trim();
    annotation.entity_id = entity_id.trim();
    annotation.organization_id = organization_id;
    annotation.created_at = new Date();
    annotation.updated_at = new Date();

    return annotation;
  }

  /**
   * Updates annotation content
   */
  async updateContent(content: string): Promise<void> {
    if (!content || content.trim().length === 0) {
      throw new ValidationException("Annotation content is required", "content", content);
    }

    if (content.trim().length > 2000) {
      throw new ValidationException(
        "Annotation content cannot exceed 2000 characters",
        "content",
        content,
      );
    }

    this.content = content.trim();
    this.updated_at = new Date();
  }

  /**
   * Checks if annotation belongs to specified user
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
      content: this.content,
      user_id: this.user_id,
      entity_type: this.entity_type,
      entity_id: this.entity_id,
      organization_id: this.organization_id,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
    };
  }

  constructor(init?: Partial<EntityGraphAnnotationsModel>) {
    super();
    Object.assign(this, init);
  }
}
