import { Column, DataType, Model, Table } from "sequelize-typescript";

export const AEDT_PROFILE_STATUSES = ["draft", "attested", "superseded"] as const;
export type AedtProfileStatus = (typeof AEDT_PROFILE_STATUSES)[number];

@Table({
  tableName: "aedt_profiles",
  timestamps: false,
  underscored: true,
})
export class AedtProfile extends Model<AedtProfile> {
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
  framework_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 1,
  })
  version!: number;

  @Column({
    type: DataType.ENUM(...AEDT_PROFILE_STATUSES),
    allowNull: false,
    defaultValue: "draft",
  })
  status!: AedtProfileStatus;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  question_set_version!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  attested_by_user_id?: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  attested_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  superseded_at?: Date;

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

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  updated_at!: Date;
}
