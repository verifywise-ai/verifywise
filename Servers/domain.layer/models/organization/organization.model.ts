/**
 * @fileoverview Organization Model
 *
 * Defines the Organization entity for multi-tenant architecture. Each organization
 * represents an isolated tenant with its own users, projects, and data.
 *
 * Database Schema:
 * - id: Auto-incrementing primary key
 * - name: Organization name (2-255 chars, required)
 * - logo: Logo URL (valid URL format, optional)
 * - created_at: Organization creation timestamp
 *
 * Key Features:
 * - Comprehensive name and logo validation
 * - URL format validation for logos
 * - Factory method for safe instance creation
 * - Organization age calculation utilities
 * - Safe JSON serialization
 *
 * Multi-Tenancy:
 * - Each organization gets isolated tenant database
 * - Users belong to single organization
 * - Projects scoped to organization
 * - Data segregation enforced at application level
 *
 * @module domain.layer/models/organization
 */

import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IOrganization } from "../../interfaces/i.organization";
import { numberValidation } from "../../validations/number.valid";
import {
  ValidationException,
  NotFoundException,
} from "../../exceptions/custom.exception";

@Table({
  tableName: "organizations",
  timestamps: true,
  underscored: true,
})
export class OrganizationModel
  extends Model<OrganizationModel>
  implements IOrganization
{
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
  logo!: string;

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

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'pending',
  })
  onboarding_status?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  tenant_id?: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'qualitative',
  })
  risk_assessment_mode?: "qualitative" | "quantitative";

  /**
   * Creates a new organization with validation
   *
   * Factory method that creates an OrganizationModel instance with validated data.
   * Does NOT save to database - caller must persist using query utilities.
   *
   * @static
   * @async
   * @param {string} name - Organization name (2-255 chars)
   * @param {string} [logo] - Logo URL (must be valid URL format)
   * @param {number[]} [members] - Array of user IDs (unused, for future)
   * @param {number[]} [projects] - Array of project IDs (unused, for future)
   * @returns {Promise<OrganizationModel>} OrganizationModel instance (not yet persisted)
   * @throws {ValidationException} If any field fails validation
   *
   * @validation
   * - Name: Required, 2-255 chars
   * - Logo: Optional, must be valid URL if provided
   * - Members: Optional array of positive integers
   * - Projects: Optional array of positive integers
   *
   * @example
   * const org = await OrganizationModel.createNewOrganization(
   *   'Acme Corp', 'https://example.com/logo.png'
   * );
   * // Org instance created but not saved to database yet
   */
  static async createNewOrganization(
    name: string,
    logo?: string,
    members?: number[],
    projects?: number[]
  ): Promise<OrganizationModel> {
    // Validate name
    if (!name || name.trim().length === 0) {
      throw new ValidationException("Name is required", "name", name);
    }

    if (name.trim().length < 2) {
      throw new ValidationException(
        "Name must be at least 2 characters long",
        "name",
        name
      );
    }

    if (name.trim().length > 255) {
      throw new ValidationException(
        "Name must not exceed 255 characters",
        "name",
        name
      );
    }

    // Validate logo URL if provided
    if (logo !== undefined && logo !== null) {
      if (logo.trim().length === 0) {
        throw new ValidationException(
          "Logo URL cannot be empty if provided",
          "logo",
          logo
        );
      }

      // Basic URL validation
      try {
        new URL(logo);
      } catch {
        throw new ValidationException("Logo must be a valid URL", "logo", logo);
      }
    }

    // Validate members array if provided
    if (members !== undefined && members !== null) {
      if (!Array.isArray(members)) {
        throw new ValidationException(
          "Members must be an array",
          "members",
          members
        );
      }

      for (const memberId of members) {
        if (!numberValidation(memberId, 1)) {
          throw new ValidationException(
            "All member IDs must be positive integers",
            "members",
            members
          );
        }
      }
    }

    // Validate projects array if provided
    if (projects !== undefined && projects !== null) {
      if (!Array.isArray(projects)) {
        throw new ValidationException(
          "Projects must be an array",
          "projects",
          projects
        );
      }

      for (const projectId of projects) {
        if (!numberValidation(projectId, 1)) {
          throw new ValidationException(
            "All project IDs must be positive integers",
            "projects",
            projects
          );
        }
      }
    }

    // Create and return the organization model instance
    const organization = new OrganizationModel();
    organization.name = name.trim();
    organization.logo = logo || "";
    organization.created_at = new Date();

    return organization;
  }

  /**
   * Updates organization information with validation
   *
   * Allows partial updates of name and logo with field-level validation.
   * Changes are applied to the instance but not persisted to database.
   *
   * @async
   * @param {Object} updateData - Fields to update
   * @param {string} [updateData.name] - New organization name (2-255 chars)
   * @param {string} [updateData.logo] - New logo URL (valid URL format)
   * @param {number[]} [updateData.members] - Member IDs (unused, for future)
   * @param {number[]} [updateData.projects] - Project IDs (unused, for future)
   * @returns {Promise<void>}
   * @throws {ValidationException} If any field fails validation
   *
   * @example
   * await org.updateOrganization({ name: 'New Name', logo: 'https://new.url' });
   * // Org instance updated but not saved to database yet
   */
  async updateOrganization(updateData: {
    name?: string;
    logo?: string;
    members?: number[];
    projects?: number[];
  }): Promise<void> {
    // Validate name if provided
    if (updateData.name !== undefined) {
      if (!updateData.name || updateData.name.trim().length === 0) {
        throw new ValidationException(
          "Name is required",
          "name",
          updateData.name
        );
      }

      if (updateData.name.trim().length < 2) {
        throw new ValidationException(
          "Name must be at least 2 characters long",
          "name",
          updateData.name
        );
      }

      if (updateData.name.trim().length > 255) {
        throw new ValidationException(
          "Name must not exceed 255 characters",
          "name",
          updateData.name
        );
      }

      this.name = updateData.name.trim();
    }

    // Validate logo if provided
    if (updateData.logo !== undefined) {
      if (updateData.logo !== null && updateData.logo.trim().length === 0) {
        throw new ValidationException(
          "Logo URL cannot be empty if provided",
          "logo",
          updateData.logo
        );
      }

      if (updateData.logo !== null) {
        // Basic URL validation
        try {
          new URL(updateData.logo);
        } catch {
          throw new ValidationException(
            "Logo must be a valid URL",
            "logo",
            updateData.logo
          );
        }
      }

      this.logo = updateData.logo || "";
    }
  }

  /**
   * Validates all organization data fields before persistence
   *
   * Performs comprehensive validation of all required fields.
   * Should be called before saving organization to database.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {ValidationException} If any required field is missing or invalid
   *
   * @validation
   * - Name: Required, 2-255 chars
   * - Logo: Optional, must be valid URL if provided
   *
   * @example
   * await org.validateOrganizationData();
   * // Throws ValidationException if any field is invalid
   */
  async validateOrganizationData(): Promise<void> {
    if (!this.name || this.name.trim().length === 0) {
      throw new ValidationException("Name is required", "name", this.name);
    }

    if (this.name.trim().length < 2) {
      throw new ValidationException(
        "Name must be at least 2 characters long",
        "name",
        this.name
      );
    }

    if (this.name.trim().length > 255) {
      throw new ValidationException(
        "Name must not exceed 255 characters",
        "name",
        this.name
      );
    }

    // Validate logo if present
    if (this.logo && this.logo.trim().length > 0) {
      try {
        new URL(this.logo);
      } catch {
        throw new ValidationException(
          "Logo must be a valid URL",
          "logo",
          this.logo
        );
      }
    }
  }

  /**
   * Get organization age in days
   */
  getAgeInDays(): number {
    if (!this.created_at) {
      return 0;
    }

    const now = new Date();
    const diffTime = Math.abs(now.getTime() - this.created_at.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if organization is recent (created within specified days)
   */
  isRecent(days: number = 30): boolean {
    return this.getAgeInDays() <= days;
  }

  /**
   * Get organization data without sensitive information
   */
  toSafeJSON(): any {
    return {
      id: this.id,
      name: this.name,
      logo: this.logo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      onboarding_status: this.onboarding_status,
      risk_assessment_mode: this.risk_assessment_mode,
    };
  }

  /**
   * Convert organization model to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      logo: this.logo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      onboarding_status: this.onboarding_status,
      risk_assessment_mode: this.risk_assessment_mode,
      ageInDays: this.getAgeInDays(),
    };
  }

  /**
   * Static method to create organization from JSON data
   */
  static fromJSON(json: any): OrganizationModel {
    return new OrganizationModel(json);
  }

  /**
   * Finds organization by ID with validation
   *
   * Validates ID format and verifies organization exists before returning.
   *
   * @static
   * @async
   * @param {number} id - Organization ID (must be >= 1)
   * @returns {Promise<OrganizationModel>} Organization instance
   * @throws {ValidationException} If ID format is invalid
   * @throws {NotFoundException} If organization not found
   *
   * @example
   * const org = await OrganizationModel.findByIdWithValidation(1);
   * // Returns organization or throws exception
   */
  static async findByIdWithValidation(id: number): Promise<OrganizationModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException(
        "Valid ID is required (must be >= 1)",
        "id",
        id
      );
    }

    const organization = await OrganizationModel.findByPk(id);
    if (!organization) {
      throw new NotFoundException("Organization not found", "Organization", id);
    }

    return organization;
  }

  /**
   * Static method to update organization
   */
  static async updateOrganizationById(
    id: number,
    updateData: Partial<IOrganization>
  ): Promise<[number, OrganizationModel[]]> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException(
        "Valid ID is required (must be >= 1)",
        "id",
        id
      );
    }

    return await OrganizationModel.update(updateData, {
      where: { id },
      returning: true,
    });
  }

  /**
   * Static method to delete organization
   */
  static async deleteOrganizationById(id: number): Promise<number> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException(
        "Valid ID is required (must be >= 1)",
        "id",
        id
      );
    }

    return await OrganizationModel.destroy({
      where: { id },
    });
  }

  /**
   * Get organization summary for display
   */
  getSummary(): {
    id: number | undefined;
    name: string;
  } {
    return {
      id: this.id,
      name: this.name,
    };
  }

  constructor(init?: Partial<IOrganization>) {
    super();
    Object.assign(this, init);
  }
}
