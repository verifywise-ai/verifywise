import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table({
  tableName: "bias_audit_stances",
  timestamps: false,
  underscored: true,
})
export class BiasAuditStance extends Model<BiasAuditStance> {
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
    allowNull: true,
  })
  run_id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 1,
  })
  version!: number;

  @Column({
    type: DataType.STRING(64),
    allowNull: true,
  })
  pdf_sha256?: string | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  pdf_file_id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  score_at_generation?: number;

  @Column({
    type: DataType.STRING(32),
    allowNull: false,
  })
  scope_at_generation!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  profile_version!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  question_set_version!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  generated_by?: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  generated_at!: Date;
}
