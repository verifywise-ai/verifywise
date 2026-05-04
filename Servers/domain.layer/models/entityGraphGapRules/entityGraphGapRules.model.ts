/**
 * @fileoverview Entity Graph Gap Rules Model
 *
 * Defines the EntityGraphGapRules entity for user-customized gap detection rules.
 * Allows users to configure their own completeness requirements for Entity Graph.
 *
 * Database Schema:
 * - id: Integer primary key
 * - user_id: Foreign key to UserModel (rules owner - private to user)
 * - organization_id: Foreign key to OrganizationModel (multi-tenancy)
 * - rules: JSON array containing gap detection rules
 * - created_at: Rules creation timestamp
 * - updated_at: Last update timestamp
 *
 * Rules JSON structure:
 * [
 *   {
 *     entityType: 'model' | 'risk' | 'control' | 'vendor' | 'useCase',
 *     requirement: 'has_risk' | 'has_control' | 'has_owner' | 'has_evidence' | etc.,
 *     severity: 'critical' | 'warning' | 'info',
 *     enabled: boolean
 *   }
 * ]
 *
 * @module domain.layer/models/entityGraphGapRules
 */

import { Column, DataType, ForeignKey, Model, Table, BelongsTo } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { OrganizationModel } from "../organization/organization.model";
import { ValidationException } from "../../exceptions/custom.exception";

// Interface for a single gap rule
export interface GapRule {
  entityType: "model" | "risk" | "control" | "vendor" | "useCase";
  requirement: string;
  severity: "critical" | "warning" | "info";
  enabled: boolean;
}

@Table({
  tableName: "entity_graph_gap_rules",
  timestamps: true,
  underscored: true,
})
export class EntityGraphGapRulesModel extends Model<EntityGraphGapRulesModel> {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id?: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    unique: true, // One set of rules per user
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
  rules!: GapRule[];

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
   * Creates new gap rules with validation
   */
  static async createGapRules(
    user_id: number,
    organization_id: number,
    rules: GapRule[],
  ): Promise<EntityGraphGapRulesModel> {
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

    // Validate rules array
    if (!Array.isArray(rules)) {
      throw new ValidationException("Rules must be an array", "rules", rules);
    }

    // Validate each rule
    for (const rule of rules) {
      if (!rule.entityType || !rule.requirement || !rule.severity) {
        throw new ValidationException(
          "Each rule must have entityType, requirement, and severity",
          "rules",
          rule,
        );
      }
    }

    const gapRules = new EntityGraphGapRulesModel();
    gapRules.user_id = user_id;
    gapRules.organization_id = organization_id;
    gapRules.rules = rules;
    gapRules.created_at = new Date();
    gapRules.updated_at = new Date();

    return gapRules;
  }

  /**
   * Updates rules
   */
  async updateRules(rules: GapRule[]): Promise<void> {
    // Validate rules array
    if (!Array.isArray(rules)) {
      throw new ValidationException("Rules must be an array", "rules", rules);
    }

    // Validate each rule
    for (const rule of rules) {
      if (!rule.entityType || !rule.requirement || !rule.severity) {
        throw new ValidationException(
          "Each rule must have entityType, requirement, and severity",
          "rules",
          rule,
        );
      }
    }

    this.rules = rules;
    this.updated_at = new Date();
  }

  /**
   * Checks if rules belong to specified user
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
      user_id: this.user_id,
      organization_id: this.organization_id,
      rules: this.rules,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
    };
  }

  constructor(init?: Partial<EntityGraphGapRulesModel>) {
    super();
    Object.assign(this, init);
  }
}
