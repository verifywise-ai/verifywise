import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ProjectModel } from "../project/project.model";
import { UserModel } from "../user/user.model";
import { IProjectsMembers } from "../../interfaces/i.projectMember";
import { numberValidation } from "../../validations/number.valid";
import {
  ValidationException,
  BusinessLogicException,
  NotFoundException,
  ConflictException,
} from "../../exceptions/custom.exception";

@Table({
  tableName: "project_members",
  timestamps: true,
  underscored: true,
})
export class ProjectsMembersModel extends Model<ProjectsMembersModel> implements IProjectsMembers {
  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  user_id!: number;

  @ForeignKey(() => ProjectModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  project_id!: number;

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
   * Create a new project member with comprehensive validation
   */
  static async createNewProjectMember(
    userId: number,
    projectId: number,
    is_demo: boolean = false,
  ): Promise<ProjectsMembersModel> {
    // Validate user_id
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    // Validate project_id
    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    // Check if the user-project combination already exists
    const existingMember = await ProjectsMembersModel.findOne({
      where: {
        user_id: userId,
        project_id: projectId,
      },
    });

    if (existingMember) {
      throw new ConflictException(
        "User is already a member of this project",
        "ProjectMember",
        "user_id,project_id",
      );
    }

    // Create and return the project member model instance
    const projectMember = new ProjectsMembersModel();
    projectMember.user_id = userId;
    projectMember.project_id = projectId;
    projectMember.is_demo = is_demo;

    return projectMember;
  }

  /**
   * Update project member information with validation
   */
  async updateProjectMember(updateData: { is_demo?: boolean }): Promise<void> {
    // Validate that this is not a demo member being modified
    if (this.isDemoMember() && updateData.is_demo === false) {
      throw new BusinessLogicException(
        "Demo project members cannot be converted to regular members",
        "DEMO_MEMBER_RESTRICTION",
        { userId: this.user_id, projectId: this.project_id },
      );
    }

    // Update boolean fields if provided
    if (updateData.is_demo !== undefined) {
      this.is_demo = updateData.is_demo;
    }
  }

  /**
   * Validate project member data before saving
   */
  async validateProjectMemberData(): Promise<void> {
    if (!this.user_id || !numberValidation(this.user_id, 1)) {
      throw new ValidationException(
        "Valid user_id is required (must be >= 1)",
        "user_id",
        this.user_id,
      );
    }

    if (!this.project_id || !numberValidation(this.project_id, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        this.project_id,
      );
    }
  }

  /**
   * Check if project member is a demo member
   */
  isDemoMember(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Check if project member can be modified
   */
  canBeModified(): boolean {
    if (this.isDemoMember()) {
      throw new BusinessLogicException(
        "Demo project members cannot be modified",
        "DEMO_MEMBER_RESTRICTION",
        { userId: this.user_id, projectId: this.project_id },
      );
    }
    return true;
  }

  /**
   * Get project member summary for display
   */
  getSummary(): {
    userId: number;
    projectId: number;
    isDemo: boolean;
  } {
    return {
      userId: this.user_id,
      projectId: this.project_id,
      isDemo: this.isDemoMember(),
    };
  }

  /**
   * Get project member data without sensitive information
   */
  toSafeJSON(): any {
    return {
      userId: this.user_id,
      projectId: this.project_id,
      isDemo: this.isDemoMember(),
    };
  }

  /**
   * Convert project member model to JSON representation
   */
  toJSON(): any {
    return {
      user_id: this.user_id,
      project_id: this.project_id,
      is_demo: this.is_demo,
    };
  }

  /**
   * Create ProjectsMembersModel instance from JSON data
   */
  static fromJSON(json: any): ProjectsMembersModel {
    return new ProjectsMembersModel(json);
  }

  /**
   * Static method to find project member by user and project IDs with validation
   */
  static async findByUserAndProject(
    userId: number,
    projectId: number,
  ): Promise<ProjectsMembersModel | null> {
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    return await ProjectsMembersModel.findOne({
      where: {
        user_id: userId,
        project_id: projectId,
      },
    });
  }

  /**
   * Static method to find project member by user and project IDs with validation
   */
  static async findByUserAndProjectWithValidation(
    userId: number,
    projectId: number,
  ): Promise<ProjectsMembersModel> {
    const projectMember = await ProjectsMembersModel.findByUserAndProject(userId, projectId);

    if (!projectMember) {
      throw new NotFoundException("Project member not found", "ProjectMember", {
        userId,
        projectId,
      });
    }

    return projectMember;
  }

  /**
   * Static method to find all project members by project ID
   */
  static async findByProjectId(projectId: number): Promise<ProjectsMembersModel[]> {
    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    return await ProjectsMembersModel.findAll({
      where: { project_id: projectId },
    });
  }

  /**
   * Static method to find all projects by user ID
   */
  static async findByUserId(userId: number): Promise<ProjectsMembersModel[]> {
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    return await ProjectsMembersModel.findAll({
      where: { user_id: userId },
    });
  }

  /**
   * Static method to update project member by user and project IDs
   */
  static async updateProjectMemberByUserAndProject(
    userId: number,
    projectId: number,
    updateData: Partial<IProjectsMembers>,
  ): Promise<[number, ProjectsMembersModel[]]> {
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    return await ProjectsMembersModel.update(updateData, {
      where: {
        user_id: userId,
        project_id: projectId,
      },
      returning: true,
    });
  }

  /**
   * Static method to delete project member by user and project IDs
   */
  static async deleteProjectMemberByUserAndProject(
    userId: number,
    projectId: number,
  ): Promise<number> {
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    return await ProjectsMembersModel.destroy({
      where: {
        user_id: userId,
        project_id: projectId,
      },
    });
  }

  /**
   * Static method to check if user is a member of a project
   */
  static async isUserMemberOfProject(userId: number, projectId: number): Promise<boolean> {
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    const member = await ProjectsMembersModel.findOne({
      where: {
        user_id: userId,
        project_id: projectId,
      },
    });

    return member !== null;
  }

  /**
   * Static method to get project member count by project ID
   */
  static async getProjectMemberCount(projectId: number): Promise<number> {
    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    return await ProjectsMembersModel.count({
      where: { project_id: projectId },
    });
  }

  /**
   * Static method to get user project count by user ID
   */
  static async getUserProjectCount(userId: number): Promise<number> {
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    return await ProjectsMembersModel.count({
      where: { user_id: userId },
    });
  }

  /**
   * Check if project member requires special attention
   */
  requiresSpecialAttention(): boolean {
    return this.isDemoMember();
  }

  /**
   * Get member permissions based on membership type
   */
  getMemberPermissions(): string[] {
    const permissions: string[] = [];

    if (this.isDemoMember()) {
      permissions.push("read_only");
      permissions.push("demo_access");
    } else {
      permissions.push("full_access");
      permissions.push("read_write");
    }

    return permissions;
  }

  constructor(init?: Partial<IProjectsMembers>) {
    super();
    Object.assign(this, init);
  }
}
