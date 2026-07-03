import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IMrmValidation, MrmValidationReport } from "../../interfaces/i.mrmValidation";
import {
  MrmValidationOutcome,
  MrmValidationStage,
  MrmValidationTrigger,
} from "../../enums/mrm.enum";

@Table({
  tableName: "mrm_validations",
  timestamps: true,
  underscored: true,
})
export class MrmValidationModel extends Model<MrmValidationModel> implements IMrmValidation {
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
    type: DataType.ENUM(...Object.values(MrmValidationStage)),
    allowNull: false,
    defaultValue: MrmValidationStage.NOT_STARTED,
  })
  stage!: MrmValidationStage;

  @Column({
    type: DataType.ENUM(...Object.values(MrmValidationTrigger)),
    allowNull: true,
  })
  trigger?: MrmValidationTrigger;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  validator_id?: number;

  @Column({
    type: DataType.ENUM(...Object.values(MrmValidationOutcome)),
    allowNull: true,
  })
  outcome?: MrmValidationOutcome;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  report_version?: string;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
  })
  report!: MrmValidationReport;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  signed_off_at?: Date;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  signed_off_by?: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  next_due?: Date;

  // created_at / updated_at are managed by Sequelize (timestamps: true) — not declared here.

  constructor(init?: Partial<IMrmValidation>) {
    super();
    Object.assign(this, init);
  }
}
