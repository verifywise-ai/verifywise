import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IManifestCountry, IRegulationCountry } from "../../interfaces/i.regulationsTracker";

@Table({ tableName: "regulation_countries", timestamps: false })
export class RegulationCountryModel
  extends Model<RegulationCountryModel>
  implements IRegulationCountry
{
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  id?: number;

  @Column({ type: DataType.STRING(120), allowNull: false })
  slug!: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(50), allowNull: true })
  region?: string | null;

  @Column({ type: DataType.SMALLINT, allowNull: true })
  regulation_count?: number | null;

  @Column({ type: DataType.JSONB, allowNull: false })
  data!: IManifestCountry;

  @Column({ type: DataType.STRING(80), allowNull: false })
  hash!: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  is_active!: boolean;

  @Column({ type: DataType.DATE, allowNull: true })
  removed_at?: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  last_changed_at?: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  last_fetched_at?: Date | null;
}
