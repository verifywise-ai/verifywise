import { Model, Column, DataType, Table } from "sequelize-typescript";
import { IFramework } from "../../interfaces/i.framework";
import { ValidationException, NotFoundException } from "../../exceptions/custom.exception";

@Table({
  tableName: "frameworks",
  timestamps: true,
  underscored: true,
})
export class FrameworkModel extends Model<FrameworkModel> implements IFramework {
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
    type: DataType.DATE,
    allowNull: false,
  })
  created_at!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  updated_at?: Date;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  is_organizational!: boolean;

  /**
   * Create a new framework with comprehensive validation
   */
  static async createNewFramework(name: string, description: string): Promise<FrameworkModel> {
    // Validate name
    if (!name || name.trim().length === 0) {
      throw new ValidationException("Name is required", "name", name);
    }

    if (name.trim().length < 2) {
      throw new ValidationException("Name must be at least 2 characters long", "name", name);
    }

    if (name.trim().length > 255) {
      throw new ValidationException("Name must not exceed 255 characters", "name", name);
    }

    // Validate description
    if (!description || description.trim().length === 0) {
      throw new ValidationException("Description is required", "description", description);
    }

    if (description.trim().length < 10) {
      throw new ValidationException(
        "Description must be at least 10 characters long",
        "description",
        description,
      );
    }

    if (description.trim().length > 1000) {
      throw new ValidationException(
        "Description must not exceed 1000 characters",
        "description",
        description,
      );
    }

    // Create and return the framework model instance
    const framework = new FrameworkModel();
    framework.name = name.trim();
    framework.description = description.trim();
    framework.created_at = new Date();

    return framework;
  }

  /**
   * Update framework information with validation
   */
  async updateFramework(updateData: { name?: string; description?: string }): Promise<void> {
    // Validate name if provided
    if (updateData.name !== undefined) {
      if (!updateData.name || updateData.name.trim().length === 0) {
        throw new ValidationException("Name is required", "name", updateData.name);
      }

      if (updateData.name.trim().length < 2) {
        throw new ValidationException(
          "Name must be at least 2 characters long",
          "name",
          updateData.name,
        );
      }

      if (updateData.name.trim().length > 255) {
        throw new ValidationException(
          "Name must not exceed 255 characters",
          "name",
          updateData.name,
        );
      }

      this.name = updateData.name.trim();
    }

    // Validate description if provided
    if (updateData.description !== undefined) {
      if (!updateData.description || updateData.description.trim().length === 0) {
        throw new ValidationException(
          "Description is required",
          "description",
          updateData.description,
        );
      }

      if (updateData.description.trim().length < 10) {
        throw new ValidationException(
          "Description must be at least 10 characters long",
          "description",
          updateData.description,
        );
      }

      if (updateData.description.trim().length > 1000) {
        throw new ValidationException(
          "Description must not exceed 1000 characters",
          "description",
          updateData.description,
        );
      }

      this.description = updateData.description.trim();
    }
  }

  /**
   * Validate framework data before saving
   */
  async validateFrameworkData(): Promise<void> {
    if (!this.name || this.name.trim().length === 0) {
      throw new ValidationException("Name is required", "name", this.name);
    }

    if (this.name.trim().length < 2) {
      throw new ValidationException("Name must be at least 2 characters long", "name", this.name);
    }

    if (this.name.trim().length > 255) {
      throw new ValidationException("Name must not exceed 255 characters", "name", this.name);
    }

    if (!this.description || this.description.trim().length === 0) {
      throw new ValidationException("Description is required", "description", this.description);
    }

    if (this.description.trim().length < 10) {
      throw new ValidationException(
        "Description must be at least 10 characters long",
        "description",
        this.description,
      );
    }

    if (this.description.trim().length > 1000) {
      throw new ValidationException(
        "Description must not exceed 1000 characters",
        "description",
        this.description,
      );
    }
  }

  /**
   * Check if framework is active (recently created)
   */
  isActive(): boolean {
    if (!this.created_at) {
      return true; // New frameworks are considered active
    }

    // Consider framework active if created within the last 365 days
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    return this.created_at > oneYearAgo;
  }

  /**
   * Get framework age in days
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
   * Check if framework is recent (created within specified days)
   */
  isRecent(days: number = 30): boolean {
    return this.getAgeInDays() <= days;
  }

  /**
   * Get framework summary for display
   */
  getSummary(): {
    id: number | undefined;
    name: string;
    description: string;
    ageInDays: number;
    isActive: boolean;
  } {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      ageInDays: this.getAgeInDays(),
      isActive: this.isActive(),
    };
  }

  /**
   * Get framework data without sensitive information
   */
  toSafeJSON(): any {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
    };
  }

  /**
   * Convert framework model to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      is_organizational: this.is_organizational,
      ageInDays: this.getAgeInDays(),
      isActive: this.isActive(),
    };
  }

  /**
   * Create FrameworkModel instance from JSON data
   */
  static fromJSON(json: any): FrameworkModel {
    return new FrameworkModel(json);
  }

  /**
   * Static method to find framework by ID with validation
   */
  static async findByIdWithValidation(id: number): Promise<FrameworkModel> {
    if (!id || id < 1) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    const framework = await FrameworkModel.findByPk(id);
    if (!framework) {
      throw new NotFoundException("Framework not found", "Framework", id);
    }

    return framework;
  }

  /**
   * Static method to find all frameworks
   */
  static async findAllFrameworks(): Promise<FrameworkModel[]> {
    return await FrameworkModel.findAll({
      order: [["name", "ASC"]],
    });
  }

  /**
   * Static method to find frameworks by name (case-insensitive search)
   */
  static async findByName(name: string): Promise<FrameworkModel[]> {
    if (!name || name.trim().length === 0) {
      throw new ValidationException("Name is required for search", "name", name);
    }

    return await FrameworkModel.findAll({
      where: {
        name: {
          [require("sequelize").Op.iLike]: `%${name.trim()}%`,
        },
      },
      order: [["name", "ASC"]],
    });
  }

  /**
   * Static method to update framework by ID
   */
  static async updateFrameworkById(
    id: number,
    updateData: Partial<IFramework>,
  ): Promise<[number, FrameworkModel[]]> {
    if (!id || id < 1) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return await FrameworkModel.update(updateData, {
      where: { id },
      returning: true,
    });
  }

  /**
   * Static method to delete framework by ID
   */
  static async deleteFrameworkById(id: number): Promise<number> {
    if (!id || id < 1) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return await FrameworkModel.destroy({
      where: { id },
    });
  }

  /**
   * Check if framework can be deleted
   */
  canBeDeleted(): boolean {
    // Check if framework is being used by any projects
    // This would need to be implemented based on your business logic
    // For now, we'll allow deletion of any framework
    return true;
  }

  /**
   * Get framework usage statistics
   */
  async getUsageStatistics(): Promise<{
    totalProjects: number;
    activeProjects: number;
    lastUsed: Date | null;
  }> {
    // This would need to be implemented based on your database relationships
    // For now, returning placeholder data
    return {
      totalProjects: 0,
      activeProjects: 0,
      lastUsed: null,
    };
  }

  /**
   * Check if framework is being used
   */
  async isBeingUsed(): Promise<boolean> {
    const stats = await this.getUsageStatistics();
    return stats.totalProjects > 0;
  }

  /**
   * Get framework metadata
   */
  getMetadata(): {
    id: number | undefined;
    name: string;
    description: string;
    created_at: Date | undefined;
    ageInDays: number;
    isActive: boolean;
    isRecent: boolean;
  } {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      created_at: this.createdAt ?? this.created_at,
      ageInDays: this.getAgeInDays(),
      isActive: this.isActive(),
      isRecent: this.isRecent(),
    };
  }

  constructor(init?: Partial<IFramework>) {
    super();
    Object.assign(this, init);
  }
}
