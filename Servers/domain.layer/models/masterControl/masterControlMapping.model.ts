import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from "sequelize-typescript";
import { MasterControlModel } from "./masterControl.model";
import {
  IMasterControlFrameworkMapping,
  Framework,
  FrameworkEntityType,
  MappingCoverage,
  MappingConfidence,
  FRAMEWORK_ENTITY_TYPES,
} from "../../interfaces/i.masterControlMapping";
import { numberValidation } from "../../validations/number.valid";
import { ValidationException } from "../../exceptions/custom.exception";

export const FRAMEWORKS: readonly Framework[] = [
  "eu_ai_act",
  "iso_42001",
  "iso_27001",
  "nist_ai_rmf",
] as const;

@Table({
  tableName: "master_control_framework_mappings",
  timestamps: false,
  underscored: true,
})
export class MasterControlFrameworkMappingModel
  extends Model<MasterControlFrameworkMappingModel>
  implements IMasterControlFrameworkMapping {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => MasterControlModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  master_control_id!: number;

  @Column({
    type: DataType.STRING(32),
    allowNull: false,
  })
  framework!: Framework;

  @Column({
    type: DataType.STRING(48),
    allowNull: false,
  })
  framework_entity_type!: FrameworkEntityType;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  framework_entity_id!: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  rationale?: string | null;

  @Column({
    type: DataType.STRING(10),
    allowNull: true,
    defaultValue: "full",
  })
  coverage?: MappingCoverage;

  @Column({
    type: DataType.STRING(20),
    allowNull: true,
    defaultValue: "direct_match",
  })
  confidence?: MappingConfidence;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  created_at?: Date;

  /**
   * Factory — validates the (framework, framework_entity_type) tuple and
   * produces a mapping instance ready for persistence.
   */
  static async createNewMapping(
    master_control_id: number,
    framework: Framework,
    framework_entity_type: FrameworkEntityType,
    framework_entity_id: number,
    rationale?: string | null,
    coverage?: MappingCoverage,
    confidence?: MappingConfidence
  ): Promise<MasterControlFrameworkMappingModel> {
    if (!numberValidation(master_control_id, 1)) {
      throw new ValidationException(
        "Valid master_control_id is required (must be >= 1)",
        "master_control_id",
        master_control_id
      );
    }
    if (!FRAMEWORKS.includes(framework)) {
      throw new ValidationException(
        `Invalid framework. Allowed: ${FRAMEWORKS.join(", ")}`,
        "framework",
        framework
      );
    }
    const allowed = FRAMEWORK_ENTITY_TYPES[framework];
    if (!allowed.includes(framework_entity_type)) {
      throw new ValidationException(
        `Entity type "${framework_entity_type}" is not valid for framework "${framework}". Allowed: ${allowed.join(", ")}`,
        "framework_entity_type",
        framework_entity_type
      );
    }
    if (!numberValidation(framework_entity_id, 1)) {
      throw new ValidationException(
        "Valid framework_entity_id is required (must be >= 1)",
        "framework_entity_id",
        framework_entity_id
      );
    }

    const model = new MasterControlFrameworkMappingModel();
    model.master_control_id = master_control_id;
    model.framework = framework;
    model.framework_entity_type = framework_entity_type;
    model.framework_entity_id = framework_entity_id;
    model.rationale = rationale ?? null;
    model.coverage = coverage ?? "full";
    model.confidence = confidence ?? "direct_match";
    model.created_at = new Date();
    return model;
  }

  /**
   * Compact identity tuple — useful for dedupe and logging.
   */
  toKey(): string {
    return `${this.framework}:${this.framework_entity_type}:${this.framework_entity_id}`;
  }

  toJSON(): any {
    return {
      id: this.id,
      master_control_id: this.master_control_id,
      framework: this.framework,
      framework_entity_type: this.framework_entity_type,
      framework_entity_id: this.framework_entity_id,
      rationale: this.rationale ?? null,
      coverage: this.coverage ?? "full",
      confidence: this.confidence ?? "direct_match",
      created_at: (this.createdAt ?? this.created_at)?.toISOString?.() ?? null,
    };
  }

  constructor(init?: Partial<IMasterControlFrameworkMapping>) {
    super();
    Object.assign(this, init);
  }
}
