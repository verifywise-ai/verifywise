import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IMrmFinding } from "../../interfaces/i.mrmFinding";
import { MrmFindingSeverity, MrmFindingStage } from "../../enums/mrm.enum";

@Table({
  tableName: "mrm_findings",
  timestamps: true,
  underscored: true,
})
export class MrmFindingModel extends Model<MrmFindingModel> implements IMrmFinding {
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
  model_inventory_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  validation_id?: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  title!: string;

  @Column({
    type: DataType.ENUM(...Object.values(MrmFindingSeverity)),
    allowNull: false,
    defaultValue: MrmFindingSeverity.MEDIUM,
  })
  severity!: MrmFindingSeverity;

  @Column({
    type: DataType.ENUM(...Object.values(MrmFindingStage)),
    allowNull: false,
    defaultValue: MrmFindingStage.OPEN,
  })
  stage!: MrmFindingStage;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  owner_id?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  remediation_plan?: string;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  due_date?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  closed_at?: Date;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  closed_verified!: boolean;

  // created_at / updated_at are managed by Sequelize (timestamps: true) — not declared here.

  constructor(init?: Partial<IMrmFinding>) {
    super();
    Object.assign(this, init);
  }
}
