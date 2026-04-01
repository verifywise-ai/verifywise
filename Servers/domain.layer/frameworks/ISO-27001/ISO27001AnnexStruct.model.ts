import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from "sequelize-typescript";
import { FrameworkModel } from "../../models/frameworks/frameworks.model";
import { IISO27001AnnexStruct } from "../../interfaces/i.ISO27001AnnexStruct";

@Table({
  tableName: "annex_struct_iso27001",
})
export class ISO27001AnnexStructModel
  extends Model<ISO27001AnnexStructModel>
  implements IISO27001AnnexStruct {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  arrangement!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  title!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  order_no!: number;

  @ForeignKey(() => FrameworkModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  framework_id!: number;

  /**
   * Create ISO27001AnnexCategoryModel instance from JSON data
   */
  static fromJSON(json: any): ISO27001AnnexStructModel {
    return new ISO27001AnnexStructModel(json);
  }

  /**
   * Convert annex category model to JSON representation
   */
  toJSON(): any {
    const dataValues = this.dataValues as any;
    return {
      id: this.id,
      arrangement: this.arrangement,
      title: this.title,
      order_no: this.order_no,
      framework_id: this.framework_id,
      // Include dynamically added properties from queries
      subClauses: dataValues?.subClauses,
    };
  }

}
