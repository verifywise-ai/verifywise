import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IMrmIngestionToken } from "../../interfaces/i.mrmIngestionToken";

/**
 * A per-org, revocable machine-to-machine ingestion token. Only the hash is
 * stored — the plaintext is shown once on creation and never persisted.
 */
@Table({
  tableName: "mrm_ingestion_tokens",
  timestamps: false,
  underscored: true,
})
export class MrmIngestionTokenModel
  extends Model<MrmIngestionTokenModel>
  implements IMrmIngestionToken
{
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
  organization_id!: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false, // hash of the token, never the plaintext
  })
  token_hash!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true, // null = org-wide token; set = scoped to a single model
  })
  model_inventory_id?: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  last_used_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true, // null = active; set = revoked
  })
  revoked_at?: Date;

  @Column({
    type: DataType.INTEGER,
    allowNull: true, // SET NULL on user delete — preserves the token record
  })
  created_by?: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  constructor(init?: Partial<IMrmIngestionToken>) {
    super();
    Object.assign(this, init);
  }
}
