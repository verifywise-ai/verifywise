import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from "sequelize-typescript";
import { IISO27001AnnexControl } from "../../interfaces/i.iso27001AnnexControl";
import { UserModel } from "../../models/user/user.model";
import { ProjectFrameworksModel } from "../../models/projectFrameworks/projectFrameworks.model";
import { ISO27001AnnexControlStructModel } from "./ISO27001AnnexControlStruct.model";

@Table({
  tableName: "annexcontrols_iso27001",
  timestamps: true,
})
export class ISO27001AnnexControlModel
  extends Model<ISO27001AnnexControlModel>
  implements IISO27001AnnexControl
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

  @ForeignKey(() => ISO27001AnnexControlStructModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  annexcontrol_meta_id!: number;

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
   * Create ISO27001AnnexControlModel instance from JSON data
   */
  static fromJSON(json: any): ISO27001AnnexControlModel {
    return new ISO27001AnnexControlModel(json);
  }

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
      annexcontrol_meta_id: this.annexcontrol_meta_id,
      projects_frameworks_id: this.projects_frameworks_id,
      created_at: this.created_at,
      is_demo: this.is_demo,
    };
  }
}
