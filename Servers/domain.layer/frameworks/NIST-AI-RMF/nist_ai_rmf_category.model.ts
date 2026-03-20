import {
  Column,
  DataType,
  Model,
  Table,
} from "sequelize-typescript";

/**
 * NIST AI RMF Category Model
 * Maps to nist_ai_rmf_categories_struct table in public schema
 */
@Table({
  tableName: "nist_ai_rmf_categories_struct",
  timestamps: false,
})
export class NISTAIMRFCategoryModel extends Model<NISTAIMRFCategoryModel> {
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
  framework_id?: number;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
  })
  function?: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  category_id?: number;

  @Column({
    type: DataType.TEXT,
  })
  description?: string;

  @Column({
    type: DataType.INTEGER,
  })
  order_no?: number;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  is_demo?: boolean;
}
