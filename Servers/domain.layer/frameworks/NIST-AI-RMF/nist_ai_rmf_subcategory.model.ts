import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from "sequelize-typescript";
import { Status, STATUSES } from "../../../types/status.type";
import { UserModel } from "../../models/user/user.model";

@Table({
  tableName: "nist_ai_rmf_subcategories",
  timestamps: false,
})
export class NISTAIMRFSubcategoryModel extends Model<NISTAIMRFSubcategoryModel> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  organization_id?: number;

  @Column({
    type: DataType.STRING,
  })
  implementation_description?: string;

  @Column({
    type: DataType.ENUM(...STATUSES),
  })
  status?: Status;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  owner?: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  reviewer?: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  approver?: number;

  @Column({
    type: DataType.DATE,
  })
  due_date?: Date;

  @Column({
    type: DataType.STRING,
  })
  auditor_feedback?: string;

  @Column({
    type: DataType.INTEGER,
  })
  subcategory_meta_id?: number;

  @Column({
    type: DataType.INTEGER,
  })
  projects_frameworks_id?: number;

  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
  })
  updated_at?: Date;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  is_demo?: boolean;

  // NOTE: evidence_links are now stored in file_entity_links table

  // Virtual fields populated via JOIN with struct tables (not actual DB columns)
  // These exist for backward compatibility with API responses
  @Column({
    type: DataType.VIRTUAL,
  })
  function?: string;

  @Column({
    type: DataType.VIRTUAL,
  })
  index?: string;  // subcategory_id from struct (e.g., "GV.1.1")

  @Column({
    type: DataType.VIRTUAL,
  })
  title?: string;  // description from struct

  @Column({
    type: DataType.VIRTUAL,
  })
  description?: string;  // description from struct (for frontend compatibility)

  @Column({
    type: DataType.VIRTUAL,
  })
  category_id?: number;  // category_struct_id from struct
}
