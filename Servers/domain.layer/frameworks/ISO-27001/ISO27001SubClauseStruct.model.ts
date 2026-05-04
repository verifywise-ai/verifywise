import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { IISO27001SubClauseStruct } from "../../interfaces/i.ISO27001SubClauseStruct";
import { ISO27001ClauseStructModel } from "./ISO27001ClauseStruct.model";

@Table({
  tableName: "subclauses_struct_iso27001",
  timestamps: true,
})
export class ISO27001SubClauseStructModel
  extends Model<ISO27001SubClauseStructModel>
  implements IISO27001SubClauseStruct
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

  @ForeignKey(() => ISO27001ClauseStructModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  clause_id!: number;
  /**
   * Create ISO27001SubClauseStructModel instance from JSON data
   */
  static fromJSON(json: any): ISO27001SubClauseStructModel {
    return new ISO27001SubClauseStructModel(json);
  }

  /**
   * Convert clause model to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      title: this.title,
      order_no: this.order_no,
      requirement_summary: this.requirement_summary,
      key_questions: this.key_questions,
      evidence_examples: this.evidence_examples,
      clause_id: this.clause_id,
    };
  }
}
