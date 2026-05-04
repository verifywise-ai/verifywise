import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IAITrustCentreSubprocessors } from "../../interfaces/i.aiTrustCentreSubprocessors";

@Table({
  tableName: "ai_trust_center_subprocessors",
  timestamps: true,
  underscored: true,
})
export class AITrustCenterSubprocessorsModel
  extends Model<AITrustCenterSubprocessorsModel>
  implements IAITrustCentreSubprocessors
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
  purpose!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  location!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  url!: string;

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
