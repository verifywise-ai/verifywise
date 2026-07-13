import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IMrmModelRole } from "../../interfaces/i.mrmModelRole";
import { MrmModelRole } from "../../enums/mrm.enum";

@Table({
  tableName: "mrm_model_roles",
  timestamps: false,
  underscored: true,
})
export class MrmModelRoleModel extends Model<MrmModelRoleModel> implements IMrmModelRole {
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
    type: DataType.ENUM(...Object.values(MrmModelRole)),
    allowNull: false,
  })
  role!: MrmModelRole;

  @Column({
    type: DataType.INTEGER,
    allowNull: true, // SET NULL on user delete — preserves the role record for audit
  })
  user_id?: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  constructor(init?: Partial<IMrmModelRole>) {
    super();
    Object.assign(this, init);
  }
}
