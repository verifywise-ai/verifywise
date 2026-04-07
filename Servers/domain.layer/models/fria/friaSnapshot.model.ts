import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { IFriaSnapshot } from "../../interfaces/i.fria";

@Table({
  tableName: "fria_snapshots",
  timestamps: false,
  underscored: true,
})
export class FriaSnapshotModel
  extends Model<FriaSnapshotModel>
  implements IFriaSnapshot
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  organization_id!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  fria_id!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  version!: number;

  @Column({ type: DataType.JSONB, allowNull: false })
  snapshot_data!: Record<string, unknown>;

  @Column({ type: DataType.STRING(255), allowNull: true })
  snapshot_reason?: string;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  created_by!: number;

  @Column({ type: DataType.DATE, allowNull: true })
  created_at?: Date;

  toSafeJSON(): IFriaSnapshot {
    return {
      id: this.id,
      organization_id: this.organization_id,
      fria_id: this.fria_id,
      version: this.version,
      snapshot_data: this.snapshot_data,
      snapshot_reason: this.snapshot_reason,
      created_by: this.created_by,
      created_at: this.created_at,
    };
  }
}
