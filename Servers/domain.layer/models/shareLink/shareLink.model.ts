import { Column, DataType, ForeignKey, Model, Table, BeforeCreate } from "sequelize-typescript";
import { IShareLink } from "../../interfaces/i.shareLink";
import { UserModel } from "../user/user.model";
import crypto from "crypto";

@Table({
  tableName: "share_links",
  underscored: true,
  timestamps: true,
})
export class ShareLinkModel extends Model<ShareLinkModel> implements IShareLink {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id!: number;

  @Column({
    type: DataType.STRING(64),
    unique: true,
    allowNull: false,
  })
  share_token!: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  resource_type!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  resource_id!: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  created_by!: number;

  @Column({
    type: DataType.JSONB,
    defaultValue: {
      shareAllFields: false,
      allowDataExport: true,
      allowViewersToOpenRecords: false,
      displayToolbar: true,
    },
  })
  settings!: {
    shareAllFields: boolean;
    allowDataExport: boolean;
    allowViewersToOpenRecords: boolean;
    displayToolbar: boolean;
  };

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  is_enabled!: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  expires_at?: Date;

  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  created_at!: Date;

  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  updated_at!: Date;

  /**
   * Generate a unique share token before creating a new share link
   */
  @BeforeCreate
  static generateShareToken(instance: ShareLinkModel) {
    if (!instance.share_token) {
      instance.share_token = crypto.randomBytes(32).toString("hex");
    }
  }

  /**
   * Check if the share link is valid (enabled and not expired)
   */
  isValid(): boolean {
    if (!this.is_enabled) return false;
    if (this.expires_at && new Date() > new Date(this.expires_at)) return false;
    return true;
  }

  /**
   * Get the full shareable URL
   */
  getShareableUrl(baseUrl?: string): string {
    const url = baseUrl || process.env.FRONTEND_URL || "http://localhost:5173";
    return `${url}/shared/${this.resource_type}s/${this.share_token}`;
  }

  /**
   * Convert to a safe JSON response (without sensitive data)
   */
  toSafeJSON() {
    return {
      id: this.id,
      share_token: this.share_token,
      resource_type: this.resource_type,
      resource_id: this.resource_id,
      settings: this.settings,
      is_enabled: this.is_enabled,
      expires_at: this.expires_at,
      created_at: this.createdAt ?? this.created_at,
      updated_at: this.updatedAt ?? this.updated_at,
    };
  }
}
