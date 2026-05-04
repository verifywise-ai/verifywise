import { Column, DataType, ForeignKey, Model, Table, BelongsTo } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { ModelInventoryModel } from "../modelInventory/modelInventory.model";

export interface IModelInventoryChangeHistory {
  id?: number;
  model_inventory_id: number;
  action: "created" | "updated" | "deleted";
  field_name?: string;
  old_value?: string;
  new_value?: string;
  changed_by_user_id?: number | null; // Allow NULL for deleted users
  changed_at?: Date;
  created_at?: Date;
}

@Table({
  tableName: "model_inventory_change_history",
  timestamps: true,
  underscored: true,
})
export class ModelInventoryChangeHistoryModel
  extends Model<ModelInventoryChangeHistoryModel>
  implements IModelInventoryChangeHistory
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => ModelInventoryModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  model_inventory_id!: number;

  @Column({
    type: DataType.ENUM("created", "updated", "deleted"),
    allowNull: false,
  })
  action!: "created" | "updated" | "deleted";

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  field_name?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  old_value?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  new_value?: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true, // Allow NULL when user is deleted
  })
  changed_by_user_id?: number | null;

  @BelongsTo(() => UserModel)
  changed_by_user?: UserModel;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  changed_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  updated_at?: Date;
}
