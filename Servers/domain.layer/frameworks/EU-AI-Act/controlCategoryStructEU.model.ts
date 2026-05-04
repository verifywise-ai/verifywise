import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { ControlEU } from "./controlEU.model";
import { FrameworkModel } from "../../models/frameworks/frameworks.model";
import { Role, RiskTier } from "./euActTypes";

/*

This is the new ControlCategory model(Schema) and will be replaced with the new one.
Please align other files with this

*/
export type ControlCategoryStructEU = {
  id?: number; //automatically created by database
  title: string; // gets assigned from the structure
  order_no?: number; // gets assigned from the structure
  controls?: ControlEU[];
  framework_id?: number; // gets assigned from the structure
  article?: string;
  roles?: Role[];
  riskTiers?: RiskTier[];
};

@Table({
  tableName: "control_categories",
})
export class ControlCategoryStructEUModel extends Model<ControlCategoryStructEU> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
  })
  title!: string;

  @Column({
    type: DataType.INTEGER,
  })
  order_no?: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_demo?: boolean;

  @ForeignKey(() => FrameworkModel)
  @Column({
    type: DataType.INTEGER,
  })
  framework_id?: number;

  @Column({ type: DataType.TEXT })
  article?: string;

  // roles and riskTiers are attached via junction tables
  // (controlcategories_struct_eu__roles and controlcategories_struct_eu__risk_tiers).
  // The fields are kept on the TypeScript type for struct-file authoring so the
  // seed / junction-population migration can read them, but they are not stored
  // directly as columns on this table.
}
