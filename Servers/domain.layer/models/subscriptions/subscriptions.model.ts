import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ISubscription } from "../../interfaces/i.subscriptions";
import { OrganizationModel } from "../organization/organization.model";
import { TiersModel } from "../tiers/tiers.model";

@Table({
  tableName: "subscriptions",
  timestamps: true,
  underscored: true,
})
export class SubscriptionModel extends Model<SubscriptionModel> implements ISubscription {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => OrganizationModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  organization_id!: number;

  @ForeignKey(() => TiersModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  tier_id!: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  stripe_sub_id!: string;

  @Column({
    type: DataType.STRING(10),
    allowNull: false,
  })
  status!: "active" | "inactive" | "canceled";

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  start_date!: Date;

  @Column({
    type: DataType.DATE,
  })
  end_date?: Date;

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

  static async createNewSubscription(subscription: ISubscription): Promise<SubscriptionModel> {
    const subscriptionModel = new SubscriptionModel();
    subscriptionModel.organization_id = subscription.organization_id;
    subscriptionModel.tier_id = subscription.tier_id;
    subscriptionModel.stripe_sub_id = subscription.stripe_sub_id;
    subscriptionModel.status = subscription.status;
    subscriptionModel.start_date = subscription.start_date;
    subscriptionModel.end_date = subscription.end_date;
    return subscriptionModel;
  }

  async updateSubscription(updateData: Partial<ISubscription>): Promise<void> {
    if (updateData.tier_id !== undefined) {
      this.tier_id = updateData.tier_id;
    }
    if (updateData.stripe_sub_id !== undefined) {
      this.stripe_sub_id = updateData.stripe_sub_id;
    }
    if (updateData.status !== undefined) {
      this.status = updateData.status;
    }
    if (updateData.start_date !== undefined) {
      this.start_date = updateData.start_date;
    }
    if (updateData.end_date !== undefined) {
      this.end_date = updateData.end_date;
    }
  }
}
