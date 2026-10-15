import { Column, DataType, Model, Table } from "sequelize-typescript";

@Table({
  tableName: "aedt_profile_answers",
  timestamps: false,
  underscored: true,
})
export class AedtProfileAnswer extends Model<AedtProfileAnswer> {
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
  profile_id!: number;

  @Column({
    type: DataType.STRING(128),
    allowNull: false,
  })
  question_key!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  question_set_version!: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  answer_value?: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  answer_notes?: string | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_dont_know!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_not_applicable!: boolean;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  answered_by_user_id?: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  answered_at!: Date;
}
