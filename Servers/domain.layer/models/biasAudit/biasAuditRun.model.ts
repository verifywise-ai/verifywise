import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table({
  tableName: "bias_audit_runs",
  timestamps: false,
  underscored: true,
})
export class BiasAuditRun extends Model<BiasAuditRun> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  organization_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  project_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  profile_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  profile_version!: number;

  @Column({
    type: DataType.STRING(64),
    allowNull: false,
  })
  preset_id!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  question_set_version!: number;

  @Column({
    type: DataType.STRING(64),
    allowNull: true,
  })
  job_description_key?: string | null;

  @Column({
    type: DataType.STRING(32),
    allowNull: false,
  })
  metric!: string;

  @Column({
    type: DataType.DECIMAL(5, 4),
    allowNull: true,
  })
  threshold?: string | null;

  @Column({
    type: DataType.STRING(32),
    allowNull: true,
  })
  threshold_source?: string | null;

  @Column({
    type: DataType.DECIMAL(5, 4),
    allowNull: true,
  })
  small_sample_exclusion?: string | null;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  data_basis_json?: unknown;

  @Column({
    type: DataType.DATEONLY,
    allowNull: true,
  })
  expiry_date?: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  expiry_trigger?: string | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  readiness_score?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  readiness_blocked_reason?: string | null;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  result_json?: unknown;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 1,
  })
  result_schema_version!: number;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  gate_findings_json?: unknown;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  order_findings_json?: unknown;

  @Column({
    type: DataType.STRING(64),
    allowNull: true,
  })
  dataset_sha256?: string | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  dataset_retained!: boolean;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  row_count?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  corpus_id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  created_by?: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at!: Date;
}
