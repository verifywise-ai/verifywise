import {
  Column,
  DataType,
  Model,
  Table,
} from "sequelize-typescript";
import { IFriaModelLink } from "../../interfaces/i.fria";

@Table({
  tableName: "fria_model_links",
  timestamps: false,
  underscored: true,
})
export class FriaModelLinkModel
  extends Model<FriaModelLinkModel>
  implements IFriaModelLink
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  organization_id!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  fria_id!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  model_id!: number;

  toSafeJSON(): IFriaModelLink {
    return {
      id: this.id,
      organization_id: this.organization_id,
      fria_id: this.fria_id,
      model_id: this.model_id,
    };
  }
}
