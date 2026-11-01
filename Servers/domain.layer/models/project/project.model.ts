import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { IProjectAttributes } from "../../interfaces/i.project";
import { AiRiskClassification } from "../../enums/ai-risk-classification.enum";
import { HighRiskRole } from "../../enums/high-risk-role.enum";
import { ProjectStatus } from "../../enums/project-status.enum";
import { LifecycleStage } from "../../enums/lifecycle-stage.enum";
import { legacyHighRiskRole, normalizeHighRiskRoles } from "../../../utils/highRiskRoles.utils";

@Table({
  tableName: "projects",
  timestamps: true,
  underscored: true,
})
export class ProjectModel extends Model<ProjectModel> implements IProjectAttributes {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
    unique: true,
  })
  uc_id?: string;

  @Column({
    type: DataType.STRING,
  })
  project_title!: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  owner!: number;

  @Column({
    type: DataType.DATE,
  })
  start_date!: Date;

  @Column({
    type: DataType.INTEGER,
  })
  geography!: number;

  @Column({
    type: DataType.ENUM(...Object.values(AiRiskClassification)),
    allowNull: true,
  })
  ai_risk_classification?: AiRiskClassification | null;

  /** EU AI Act roles, normalised: no duplicates, Provider first. */
  @Column({
    type: DataType.ARRAY(DataType.TEXT),
    allowNull: false,
    defaultValue: [],
  })
  high_risk_roles!: HighRiskRole[];

  @Column({
    type: DataType.STRING,
  })
  goal!: string;

  @Column({
    type: DataType.STRING,
  })
  target_industry!: string;

  @Column({
    type: DataType.STRING,
  })
  description!: string;

  @Column({
    type: DataType.DATE,
  })
  last_updated!: Date;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  last_updated_by!: number;

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

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  is_organizational!: boolean;

  @Column({
    type: DataType.ENUM(...Object.values(ProjectStatus)),
    allowNull: false,
    defaultValue: ProjectStatus.NOT_STARTED,
  })
  status!: ProjectStatus;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  approval_workflow_id?: number;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  pending_frameworks?: number[];

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  enable_ai_data_insertion?: boolean;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  use_case_category?: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  use_case_purpose?: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  use_case_audience?: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  deployment_context?: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  _source?: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: LifecycleStage.PLANNED,
  })
  lifecycle_stage?: LifecycleStage;

  @Column({
    type: DataType.DATEONLY,
    allowNull: true,
  })
  go_live_date?: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  retired_at?: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  last_confirmed_at?: Date | null;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  last_confirmed_by?: number | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  confirmation_reminded_at?: Date | null;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  department?: string | null;

  static async CreateNewProject(projectAttributes: Partial<IProjectAttributes>) {
    // Convert Partial<IProjectAttributes> to Optional<ProjectModel, NullishPropertiesOf<ProjectModel>>
    const attributes = projectAttributes as any;
    return await ProjectModel.create(attributes);
  }

  static async UpdateProject(projectId: number, projectAttributes: Partial<IProjectAttributes>) {
    return await ProjectModel.update(projectAttributes, {
      where: {
        id: projectId,
      },
    });
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): any {
    const dataValues = this.dataValues as any;
    return {
      id: this.id,
      uc_id: this.uc_id,
      project_title: this.project_title,
      owner: this.owner,
      start_date: this.start_date?.toISOString(),
      geography: this.geography,
      ai_risk_classification: this.ai_risk_classification,
      high_risk_roles: normalizeHighRiskRoles(this.high_risk_roles),
      // Deprecated: the single role older API clients read (Provider when present).
      type_of_high_risk_role: legacyHighRiskRole(this.high_risk_roles),
      use_case_category: this.use_case_category,
      use_case_purpose: this.use_case_purpose,
      use_case_audience: this.use_case_audience,
      deployment_context: this.deployment_context,
      goal: this.goal,
      target_industry: this.target_industry,
      description: this.description,
      last_updated: this.last_updated?.toISOString(),
      last_updated_by: this.last_updated_by,
      is_demo: this.is_demo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      is_organizational: this.is_organizational,
      status: this.status,
      lifecycle_stage: this.lifecycle_stage,
      go_live_date: this.go_live_date ?? null,
      retired_at: this.retired_at ?? null,
      last_confirmed_at: this.last_confirmed_at ?? null,
      last_confirmed_by: this.last_confirmed_by ?? null,
      department: this.department ?? null,
      _source: (this as any)._source,
      // Include dynamically added properties from queries
      framework: dataValues?.framework,
      members: dataValues?.members,
      has_pending_approval: dataValues?.has_pending_approval,
      approval_status: dataValues?.approval_status,
      custom_fields: dataValues?.custom_fields,
    };
  }

  constructor(init?: Partial<IProjectAttributes>) {
    super();
    Object.assign(this, init);
  }
}
