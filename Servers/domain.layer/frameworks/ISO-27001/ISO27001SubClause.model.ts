import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from "sequelize-typescript";
import { IISO27001SubClause } from "../../interfaces/i.ISO27001SubClause";
import { UserModel } from "../../models/user/user.model";
import { ISO27001ClauseStructModel } from "./ISO27001ClauseStruct.model";
import { ProjectFrameworksModel } from "../../models/projectFrameworks/projectFrameworks.model";

@Table({
  tableName: "subclauses_iso27001",
  timestamps: true,
})
export class ISO27001SubClauseModel
  extends Model<ISO27001SubClauseModel>
  implements IISO27001SubClause {

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
  implementation_description!: string;

  // NOTE: evidence_links are now stored in file_entity_links table

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  status!: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  owner!: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  reviewer!: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  approver!: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  due_date!: Date;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  auditor_feedback!: string;

  @ForeignKey(() => ISO27001ClauseStructModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  subclause_meta_id!: number;

  @ForeignKey(() => ProjectFrameworksModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  projects_frameworks_id!: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  created_at!: Date;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
  })
  is_demo!: boolean;

  /**
   * Create ISO27001SubClauseModel instance from JSON data
   */
  static fromJSON(json: any): ISO27001SubClauseModel {
    return new ISO27001SubClauseModel(json);
  }

  /**
   * Convert clause model to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      implementation_description: this.implementation_description,
      // NOTE: evidence_links are now stored in file_entity_links table
      status: this.status,
      owner: this.owner,
      reviewer: this.reviewer,
      approver: this.approver,
      due_date: this.due_date,
      auditor_feedback: this.auditor_feedback,
      subclause_meta_id: this.subclause_meta_id,
      projects_frameworks_id: this.projects_frameworks_id,
      created_at: this.created_at,
      is_demo: this.is_demo,
    };
  }

}
