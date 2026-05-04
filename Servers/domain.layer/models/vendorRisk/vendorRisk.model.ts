import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { VendorModel } from "../vendor/vendor.model";
import { UserModel } from "../user/user.model";
import { IVendorRisk } from "../../interfaces/i.vendorRisk";

@Table({
  tableName: "vendor_risks",
  timestamps: true,
  underscored: true,
})
export class VendorRiskModel extends Model<VendorRiskModel> implements IVendorRisk {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => VendorModel)
  @Column({
    type: DataType.INTEGER,
  })
  vendor_id!: number;

  @Column({
    type: DataType.INTEGER,
  })
  order_no?: number;

  @Column({
    type: DataType.STRING,
  })
  risk_description!: string;

  @Column({
    type: DataType.STRING,
  })
  impact_description!: string;

  @Column({
    type: DataType.ENUM("Negligible", "Minor", "Moderate", "Major", "Critical"),
  })
  impact!: "Negligible" | "Minor" | "Moderate" | "Major" | "Critical";

  @Column({
    type: DataType.ENUM("Rare", "Unlikely", "Possible", "Likely", "Almost certain"),
  })
  likelihood!: "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost certain";

  @Column({
    type: DataType.ENUM("Negligible", "Minor", "Moderate", "Major", "Catastrophic"),
  })
  risk_severity!: "Negligible" | "Minor" | "Moderate" | "Major" | "Catastrophic";

  @Column({
    type: DataType.STRING,
  })
  action_plan!: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  action_owner!: number;

  @Column({
    type: DataType.STRING,
  })
  risk_level!: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_demo?: boolean;

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

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_deleted?: boolean;

  @Column({
    type: DataType.DATE,
  })
  deleted_at?: Date;

  static async createNewVendorRisk(vendorRisk: IVendorRisk): Promise<VendorRiskModel> {
    const vendorRiskModel = new VendorRiskModel();
    vendorRiskModel.vendor_id = vendorRisk.vendor_id!;
    vendorRiskModel.risk_description = vendorRisk.risk_description;
    vendorRiskModel.impact_description = vendorRisk.impact_description;
    vendorRiskModel.action_owner = vendorRisk.action_owner;
    vendorRiskModel.action_plan = vendorRisk.action_plan;
    vendorRiskModel.risk_severity = vendorRisk.risk_severity;
    vendorRiskModel.risk_level = vendorRisk.risk_level;
    vendorRiskModel.likelihood = vendorRisk.likelihood;
    return vendorRiskModel;
  }

  async updateVendorRisk(updateData: {
    vendor_id?: number;
    risk_description?: string;
    impact_description?: string;
    action_owner?: number;
    action_plan?: string;
    risk_severity?: "Negligible" | "Minor" | "Moderate" | "Major" | "Catastrophic";
    risk_level?: string;
    likelihood?: "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost certain";
  }): Promise<void> {
    if (updateData.vendor_id !== undefined) {
      this.vendor_id = updateData.vendor_id;
    }
    if (updateData.risk_description !== undefined) {
      this.risk_description = updateData.risk_description;
    }
    if (updateData.impact_description !== undefined) {
      this.impact_description = updateData.impact_description;
    }
    if (updateData.action_owner !== undefined) {
      this.action_owner = updateData.action_owner;
    }
    if (updateData.action_plan !== undefined) {
      this.action_plan = updateData.action_plan;
    }
    if (updateData.risk_severity !== undefined) {
      this.risk_severity = updateData.risk_severity;
    }
    if (updateData.risk_level !== undefined) {
      this.risk_level = updateData.risk_level;
    }
    if (updateData.likelihood !== undefined) {
      this.likelihood = updateData.likelihood;
    }
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      vendor_id: this.vendor_id,
      order_no: this.order_no,
      risk_description: this.risk_description,
      impact_description: this.impact_description,
      impact: this.impact,
      likelihood: this.likelihood,
      risk_severity: this.risk_severity,
      action_plan: this.action_plan,
      action_owner: this.action_owner,
      risk_level: this.risk_level,
      is_demo: this.is_demo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
    };
  }
}
