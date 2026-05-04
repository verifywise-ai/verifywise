import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IDatasetModelInventory } from "../../interfaces/i.dataset";

@Table({
  tableName: "dataset_model_inventories",
  timestamps: false,
  underscored: true,
})
export class DatasetModelInventoryModel
  extends Model<DatasetModelInventoryModel>
  implements IDatasetModelInventory
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    references: {
      model: "datasets",
      key: "id",
    },
    onDelete: "CASCADE",
  })
  dataset_id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    references: {
      model: "model_inventories",
      key: "id",
    },
    onDelete: "CASCADE",
  })
  model_inventory_id!: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    defaultValue: "trained_on",
  })
  relationship_type!: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  /**
   * Get relationship type display name
   */
  getRelationshipTypeDisplay(): string {
    const typeMap: Record<string, string> = {
      trained_on: "Trained On",
      validated_on: "Validated On",
      tested_on: "Tested On",
    };
    return typeMap[this.relationship_type] || this.relationship_type;
  }

  /**
   * Check if this is a training relationship
   */
  isTrainingRelation(): boolean {
    return this.relationship_type === "trained_on";
  }

  /**
   * Check if this is a validation relationship
   */
  isValidationRelation(): boolean {
    return this.relationship_type === "validated_on";
  }

  /**
   * Check if this is a testing relationship
   */
  isTestingRelation(): boolean {
    return this.relationship_type === "tested_on";
  }

  toJSON(): any {
    return {
      id: this.id,
      dataset_id: this.dataset_id,
      model_inventory_id: this.model_inventory_id,
      relationship_type: this.relationship_type,
      created_at:
        (this.createdAt ?? this.created_at)?.toISOString?.() || this.createdAt || this.created_at,
    };
  }

  constructor(init?: Partial<IDatasetModelInventory>) {
    super();
    Object.assign(this, init);
  }
}
