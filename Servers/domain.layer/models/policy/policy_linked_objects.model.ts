import { Table, Column, Model, DataType, ForeignKey } from "sequelize-typescript";
import { PolicyManagerModel } from "./policy.model";
import { LinkedObjectType } from "../../enums/policy-manager.enum";

@Table({
  tableName: "policy_linked_objects",
})
export class PolicyLinkedObjectsModel extends Model<PolicyLinkedObjectsModel> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id!: number;

  @ForeignKey(() => PolicyManagerModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  policy_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  object_id!: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  object_type!: LinkedObjectType;

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

  toJSON(): any {
    return {
      id: this.id,
      policy_id: this.policy_id,
      object_id: this.object_id,
      object_type: this.object_type,
      created_at: this.createdAt ?? this.created_at,
      updated_at: this.updatedAt ?? this.updated_at,
    };
  }

  static fromJSON(json: any): PolicyLinkedObjectsModel {
    return new PolicyLinkedObjectsModel(json);
  }
}
