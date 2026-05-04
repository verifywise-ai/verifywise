/**
 * @fileoverview Role Model
 *
 * Defines the Role entity for role-based access control (RBAC) system.
 * Roles define permission levels and access rights for users within the application.
 *
 * Database Schema:
 * - id: Auto-incrementing primary key
 * - name: Role name (required)
 * - description: Role description (required)
 * - is_demo: Flag for demo/sandbox roles
 * - created_at: Role creation timestamp
 *
 * Standard Roles:
 * - 1: Admin - Full system access and administrative privileges
 * - 2: Reviewer - Review and approval permissions
 * - 3: Editor - Content editing and modification permissions
 * - 4: Auditor - Read-only access for audit and compliance
 *
 * Key Features:
 * - Name and description validation
 * - Factory method for safe role creation
 * - Demo role support for testing environments
 * - Timestamp tracking
 *
 * @module domain.layer/models/role
 */

import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IRoleAttributes } from "../../interfaces/i.role";
import { ValidationException } from "../../exceptions/custom.exception";

@Table({
  tableName: "roles",
  timestamps: true,
  underscored: true,
})
export class RoleModel extends Model<RoleModel> implements IRoleAttributes {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
  })
  name!: string;

  @Column({
    type: DataType.STRING,
  })
  description!: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_demo?: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  updated_at?: Date;

  /**
   * Creates a new role with validation
   *
   * Factory method that creates a RoleModel instance with validated data.
   * Does NOT save to database - caller must persist using query utilities.
   *
   * @static
   * @async
   * @param {string} name - Role name (required, typically capitalized)
   * @param {string} description - Role description explaining permissions (required)
   * @returns {Promise<RoleModel>} RoleModel instance (not yet persisted)
   * @throws {ValidationException} If name or description is missing
   *
   * @validation
   * - Name: Required, non-empty
   * - Description: Required, non-empty
   *
   * @example
   * const role = await RoleModel.createRole('Manager', 'Project management permissions');
   * // Role instance created but not saved to database yet
   *
   * @example
   * // Standard role creation
   * const adminRole = await RoleModel.createRole('Admin', 'Full system access');
   * const reviewerRole = await RoleModel.createRole('Reviewer', 'Review and approval permissions');
   */
  static async createRole(name: string, description: string): Promise<RoleModel> {
    if (!name) {
      throw new ValidationException("Role name is required", "name", name);
    }
    if (!description) {
      throw new ValidationException("Role description is required", "description", description);
    }
    const role = new RoleModel();
    role.name = name;
    role.description = description;
    role.created_at = new Date();
    return role;
  }
}
