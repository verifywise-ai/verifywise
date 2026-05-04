import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { IISO27001AnnexControlStruct } from "../../interfaces/i.ISO27001AnnexControlStruct";
import { ISO27001AnnexStructModel } from "./ISO27001AnnexStruct.model";

@Table({
  tableName: "annexcontrols_struct_iso27001",
  timestamps: true,
})
export class ISO27001AnnexControlStructModel
  extends Model<ISO27001AnnexControlStructModel>
  implements IISO27001AnnexControlStruct
{
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
  title!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  order_no!: number;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  requirement_summary!: string;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: false,
  })
  key_questions!: string[];

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: false,
  })
  evidence_examples!: string[];

  @ForeignKey(() => ISO27001AnnexStructModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  annex_id!: number;
  /**
   * Create ISO27001AnnexControlStructModel instance from JSON data
   */
  static fromJSON(json: any): ISO27001AnnexControlStructModel {
    return new ISO27001AnnexControlStructModel(json);
  }

  toJSON(): any {
    return {
      id: this.id,
      title: this.title,
      order_no: this.order_no,
      requirement_summary: this.requirement_summary,
      key_questions: this.key_questions,
      evidence_examples: this.evidence_examples,
      annex_id: this.annex_id,
    };
  }
}
