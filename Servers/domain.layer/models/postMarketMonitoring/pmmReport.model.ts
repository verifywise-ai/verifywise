import { Column, DataType, ForeignKey, Model, Table, BelongsTo } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { IPMMReport, IPMMContextSnapshot } from "../../interfaces/i.postMarketMonitoring";
import { PMMCycleModel } from "./pmmCycle.model";
import { FileModel } from "../file/file.model";

@Table({
  tableName: "post_market_monitoring_reports",
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ["cycle_id"],
    },
  ],
})
export class PMMReportModel extends Model<PMMReportModel> implements IPMMReport {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => PMMCycleModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    unique: true,
  })
  cycle_id!: number;

  @BelongsTo(() => PMMCycleModel)
  cycle?: PMMCycleModel;

  @ForeignKey(() => FileModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  file_id?: number;

  @BelongsTo(() => FileModel)
  file?: FileModel;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
  })
  context_snapshot!: IPMMContextSnapshot;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  generated_at?: Date;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  generated_by?: number;

  @BelongsTo(() => UserModel)
  generator?: UserModel;
}
