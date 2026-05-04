import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IModelRisk } from "../../interfaces/i.modelRisk";
import { ModelRiskCategory } from "../../enums/model-risk-category.enum";
import { ModelRiskLevel } from "../../enums/model-risk-level.enum";
import { ModelRiskStatus } from "../../enums/model-risk-status.enum";
import { ValidationException } from "../../exceptions/custom.exception";

@Table({
  tableName: "model_risks",
  timestamps: true,
  underscored: true,
})
export class ModelRiskModel extends Model<ModelRiskModel> implements IModelRisk {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    field: "risk_name",
  })
  risk_name!: string;

  @Column({
    type: DataType.ENUM(...Object.values(ModelRiskCategory)),
    allowNull: false,
    field: "risk_category",
  })
  risk_category!: ModelRiskCategory;

  @Column({
    type: DataType.ENUM(...Object.values(ModelRiskLevel)),
    allowNull: false,
    field: "risk_level",
  })
  risk_level!: ModelRiskLevel;

  @Column({
    type: DataType.ENUM(...Object.values(ModelRiskStatus)),
    allowNull: false,
    defaultValue: ModelRiskStatus.OPEN,
  })
  status!: ModelRiskStatus;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  owner!: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    field: "target_date",
  })
  target_date!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    field: "mitigation_plan",
  })
  mitigation_plan?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  impact?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  likelihood?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    field: "key_metrics",
  })
  key_metrics?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    field: "current_values",
  })
  current_values?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  threshold?: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    field: "model_id",
  })
  model_id?: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: "is_demo",
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
    allowNull: false,
    defaultValue: false,
  })
  is_deleted?: boolean;

  @Column({
    type: DataType.DATE,
  })
  deleted_at?: Date;

  @Column({
    type: DataType.VIRTUAL,
    get() {
      return this.getDataValue("created_at")?.toISOString();
    },
  })
  createdDate?: string;

  @Column({
    type: DataType.VIRTUAL,
    get() {
      return this.getDataValue("updated_at")?.toISOString();
    },
  })
  lastUpdated?: string;

  /**
   * Validate model risk data before saving
   */
  async validateModelRiskData(): Promise<void> {
    if (!this.risk_name || !String(this.risk_name).trim()) {
      throw new ValidationException("Risk name is required", "risk_name", this.risk_name);
    }

    if (!this.risk_category) {
      throw new ValidationException(
        "Risk category is required",
        "risk_category",
        this.risk_category,
      );
    }

    if (!this.risk_level) {
      throw new ValidationException("Risk level is required", "risk_level", this.risk_level);
    }

    if (!this.status) {
      throw new ValidationException("Status is required", "status", this.status);
    }

    if (!this.owner || !String(this.owner).trim()) {
      throw new ValidationException("Owner is required", "owner", this.owner);
    }

    if (!this.target_date) {
      throw new ValidationException(
        "Next review date is required",
        "target_date",
        this.target_date,
      );
    }
  }

  /**
   * Get model risk data without sensitive information
   */
  toSafeJSON(): any {
    return {
      id: this.id,
      risk_name: this.risk_name,
      risk_category: this.risk_category,
      risk_level: this.risk_level,
      status: this.status,
      owner: this.owner,
      target_date: this.target_date,
      description: this.description,
      mitigation_plan: this.mitigation_plan,
      impact: this.impact,
      likelihood: this.likelihood,
      key_metrics: this.key_metrics,
      current_values: this.current_values,
      threshold: this.threshold,
      model_id: this.model_id,
      created_at: this.createdAt ?? this.created_at,
      updated_at: this.updatedAt ?? this.updated_at,
    };
  }

  /**
   * Convert model risk to JSON representation
   */
  toJSON(): any {
    return this.toSafeJSON();
  }

  /**
   * Create a new ModelRiskModel instance
   */
  static createNewModelRisk(data: Partial<IModelRisk>): ModelRiskModel {
    const modelRisk = new ModelRiskModel({
      risk_name: data.risk_name || "",
      risk_category: data.risk_category || ModelRiskCategory.PERFORMANCE,
      risk_level: data.risk_level || ModelRiskLevel.MEDIUM,
      status: data.status || ModelRiskStatus.OPEN,
      owner: data.owner || "",
      target_date: data.target_date || new Date().toISOString(),
      description: data.description || "",
      mitigation_plan: data.mitigation_plan || "",
      impact: data.impact || "",
      likelihood: data.likelihood || "",
      key_metrics: data.key_metrics || "",
      current_values: data.current_values || "",
      threshold: data.threshold || "",
      model_id: data.model_id || undefined,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return modelRisk;
  }

  constructor(init?: Partial<IModelRisk>) {
    super();
    Object.assign(this, init);
  }
}
