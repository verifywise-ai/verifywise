import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ProjectModel } from "../project/project.model";
import { FrameworkModel } from "../frameworks/frameworks.model";
import { IProjectFrameworks } from "../../interfaces/i.projectFramework";
import { ValidationException, NotFoundException } from "../../exceptions/custom.exception";

@Table({
  tableName: "project_frameworks",
  timestamps: true,
  underscored: true,
})
export class ProjectFrameworksModel
  extends Model<ProjectFrameworksModel>
  implements IProjectFrameworks
{
  @ForeignKey(() => FrameworkModel)
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
  })
  framework_id!: number;

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
   * Create a new project-framework association with validation
   */
  static async createProjectFramework(
    framework_id: number,
    project_id: number,
    is_demo: boolean = false,
  ): Promise<ProjectFrameworksModel> {
    // Validate framework_id
    if (!framework_id || framework_id < 1) {
      throw new ValidationException(
        "Valid framework ID is required (must be >= 1)",
        "framework_id",
        framework_id,
      );
    }

    // Validate project_id
    if (!project_id || project_id < 1) {
      throw new ValidationException(
        "Valid project ID is required (must be >= 1)",
        "project_id",
        project_id,
      );
    }

    // Create and return the project-framework association
    const projectFramework = new ProjectFrameworksModel();
    projectFramework.framework_id = framework_id;
    projectFramework.project_id = project_id;
    projectFramework.is_demo = is_demo;

    return projectFramework;
  }

  /**
   * Update project-framework association
   */
  async updateProjectFramework(updateData: { is_demo?: boolean }): Promise<void> {
    if (updateData.is_demo !== undefined) {
      this.is_demo = updateData.is_demo;
    }
  }

  /**
   * Validate project-framework data before saving
   */
  async validateProjectFrameworkData(): Promise<void> {
    if (!this.framework_id || this.framework_id < 1) {
      throw new ValidationException(
        "Valid framework ID is required (must be >= 1)",
        "framework_id",
        this.framework_id,
      );
    }

    if (!this.project_id || this.project_id < 1) {
      throw new ValidationException(
        "Valid project ID is required (must be >= 1)",
        "project_id",
        this.project_id,
      );
    }
  }

  /**
   * Check if this is a demo association
   */
  isDemoAssociation(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): any {
    return {
      framework_id: this.framework_id,
      project_id: this.project_id,
      is_demo: this.is_demo,
    };
  }

  /**
   * Static method to find project-framework by IDs with validation
   */
  static async findByProjectAndFramework(
    project_id: number,
    framework_id: number,
  ): Promise<ProjectFrameworksModel> {
    if (!project_id || project_id < 1) {
      throw new ValidationException(
        "Valid project ID is required (must be >= 1)",
        "project_id",
        project_id,
      );
    }

    if (!framework_id || framework_id < 1) {
      throw new ValidationException(
        "Valid framework ID is required (must be >= 1)",
        "framework_id",
        framework_id,
      );
    }

    const projectFramework = await ProjectFrameworksModel.findOne({
      where: {
        project_id,
        framework_id,
      },
    });

    if (!projectFramework) {
      throw new NotFoundException("Project-framework association not found", "ProjectFramework", {
        project_id,
        framework_id,
      });
    }

    return projectFramework;
  }

  /**
   * Static method to find all frameworks for a project
   */
  static async findByProjectId(project_id: number): Promise<ProjectFrameworksModel[]> {
    if (!project_id || project_id < 1) {
      throw new ValidationException(
        "Valid project ID is required (must be >= 1)",
        "project_id",
        project_id,
      );
    }

    return await ProjectFrameworksModel.findAll({
      where: { project_id },
      order: [["framework_id", "ASC"]],
    });
  }

  /**
   * Static method to find all projects for a framework
   */
  static async findByFrameworkId(framework_id: number): Promise<ProjectFrameworksModel[]> {
    if (!framework_id || framework_id < 1) {
      throw new ValidationException(
        "Valid framework ID is required (must be >= 1)",
        "framework_id",
        framework_id,
      );
    }

    return await ProjectFrameworksModel.findAll({
      where: { framework_id },
      order: [["project_id", "ASC"]],
    });
  }

  constructor(init?: Partial<IProjectFrameworks>) {
    super();
    Object.assign(this, init);
  }
}
