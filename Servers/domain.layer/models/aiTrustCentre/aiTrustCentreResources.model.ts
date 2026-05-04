import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { IAITrustCentreResources } from "../../interfaces/i.aiTrustCentreResources";
import { FileModel } from "../file/file.model";

@Table({
  tableName: "ai_trust_center_resources",
  timestamps: true,
  underscored: true,
})
export class AITrustCenterResourcesModel
  extends Model<AITrustCenterResourcesModel>
  implements IAITrustCentreResources
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
  name!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  description!: string;

  @ForeignKey(() => FileModel)
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  file_id!: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  visible!: boolean;

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
}
