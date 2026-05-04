import { Column, DataType, Model, Table } from "sequelize-typescript";
import { ITiers, TierFeatures } from "../../interfaces/i.tiers";

@Table({
  tableName: "tiers",
  timestamps: true,
  underscored: true,
})
export class TiersModel extends Model<TiersModel> implements ITiers {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING(10),
  })
  name!: string;

  @Column({
    type: DataType.INTEGER,
  })
  price!: number;

  @Column({
    type: DataType.JSONB,
  })
  features!: TierFeatures;

  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
    allowNull: false,
  })
  created_at!: Date;

  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
    allowNull: false,
  })
  updated_at!: Date;

  static async createNewTier(tier: ITiers): Promise<TiersModel> {
    const tierModel = new TiersModel();
    tierModel.name = tier.name;
    tierModel.price = tier.price;
    tierModel.features = tier.features;
    return tierModel;
  }

  async updateTier(updateData: {
    name?: string;
    price?: number;
    features?: TierFeatures;
  }): Promise<void> {
    if (updateData.name !== undefined) {
      this.name = updateData.name;
    }
    if (updateData.price !== undefined) {
      this.price = updateData.price;
    }
    if (updateData.features !== undefined) {
      this.features = updateData.features;
    }
  }
}
