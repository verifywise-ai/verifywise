import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { AiAppDiscoveredSource, AiAppStatus } from "../../enums/ai-app-status.enum";
import { IAIApp, IAIAppCreatePayload, IAIAppUpdatePayload } from "../../interfaces/i.aiApp";
import { ValidationException } from "../../exceptions/custom.exception";
import { UserModel } from "../user/user.model";
import { VendorModel } from "../vendor/vendor.model";

@Table({
  tableName: "ai_apps",
  timestamps: true,
  underscored: true,
})
export class AiAppModel extends Model<AiAppModel> implements IAIApp {
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
    type: DataType.STRING,
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string | null;

  @ForeignKey(() => VendorModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  vendor_id?: number | null;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  owner_id?: number | null;

  @Column({
    type: DataType.ENUM(...Object.values(AiAppStatus)),
    allowNull: false,
    defaultValue: AiAppStatus.DRAFT,
  })
  status!: AiAppStatus;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  risk_score?: number | null;

  @Column({
    type: DataType.ENUM(...Object.values(AiAppDiscoveredSource)),
    allowNull: false,
    defaultValue: AiAppDiscoveredSource.MANUAL,
  })
  discovered_source!: AiAppDiscoveredSource;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  shadow_ai_tool_id?: number | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  required_training?: string | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_demo?: boolean;

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

  /**
   * Validate AI App data before saving
   */
  async validateAiAppData(): Promise<void> {
    if (!this.name || this.name.trim().length === 0) {
      throw new ValidationException("AI App name is required", "name", this.name);
    }

    if (!this.organization_id || this.organization_id <= 0) {
      throw new ValidationException(
        "Valid organization ID is required",
        "organization_id",
        this.organization_id,
      );
    }

    if (!Object.values(AiAppStatus).includes(this.status)) {
      throw new ValidationException("Invalid status value", "status", this.status);
    }

    if (!Object.values(AiAppDiscoveredSource).includes(this.discovered_source)) {
      throw new ValidationException(
        "Invalid discovered source value",
        "discovered_source",
        this.discovered_source,
      );
    }
  }

  /**
   * Check if AI App is a demo entry
   */
  isDemoAiApp(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Check if AI App is approved
   */
  isApproved(): boolean {
    return this.status === AiAppStatus.APPROVED;
  }

  /**
   * Check if AI App is restricted
   */
  isRestricted(): boolean {
    return this.status === AiAppStatus.RESTRICTED;
  }

  /**
   * Check if AI App is banned
   */
  isBanned(): boolean {
    return this.status === AiAppStatus.BANNED;
  }

  /**
   * Convert AI App to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      organization_id: this.organization_id,
      name: this.name,
      description: this.description,
      vendor_id: this.vendor_id,
      owner_id: this.owner_id,
      status: this.status,
      risk_score: this.risk_score,
      discovered_source: this.discovered_source,
      shadow_ai_tool_id: this.shadow_ai_tool_id,
      required_training: this.required_training,
      is_demo: this.is_demo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
    };
  }

  /**
   * Create AiAppModel instance from JSON data
   */
  static fromJSON(json: any): AiAppModel {
    return new AiAppModel(json);
  }

  /**
   * Create a new AiAppModel instance with minimal validations
   */
  static createNewAiApp(organizationId: number, data: IAIAppCreatePayload): AiAppModel {
    if (!organizationId || organizationId <= 0) {
      throw new ValidationException(
        "Valid organization ID is required",
        "organization_id",
        organizationId,
      );
    }

    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationException("AI App name is required", "name", data.name);
    }

    return new AiAppModel({
      organization_id: organizationId,
      name: data.name.trim(),
      description: data.description ?? null,
      vendor_id: data.vendor_id ?? null,
      owner_id: data.owner_id ?? null,
      status: data.status ?? AiAppStatus.DRAFT,
      discovered_source: data.discovered_source ?? AiAppDiscoveredSource.MANUAL,
      shadow_ai_tool_id: data.shadow_ai_tool_id ?? null,
      required_training: data.required_training ?? null,
      risk_score: null,
      is_demo: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  /**
   * Update an existing AiAppModel instance
   */
  static updateAiApp(existingApp: AiAppModel, data: IAIAppUpdatePayload): AiAppModel {
    if (data.name !== undefined) {
      if (!data.name || data.name.trim().length === 0) {
        throw new ValidationException("AI App name is required", "name", data.name);
      }
      existingApp.name = data.name.trim();
    }

    if (data.description !== undefined) {
      existingApp.description = data.description;
    }

    if (data.vendor_id !== undefined) {
      existingApp.vendor_id = data.vendor_id;
    }

    if (data.owner_id !== undefined) {
      existingApp.owner_id = data.owner_id;
    }

    if (data.status !== undefined) {
      if (!Object.values(AiAppStatus).includes(data.status)) {
        throw new ValidationException("Invalid status value", "status", data.status);
      }
      existingApp.status = data.status;
    }

    if (data.discovered_source !== undefined) {
      if (!Object.values(AiAppDiscoveredSource).includes(data.discovered_source)) {
        throw new ValidationException(
          "Invalid discovered source value",
          "discovered_source",
          data.discovered_source,
        );
      }
      existingApp.discovered_source = data.discovered_source;
    }

    if (data.shadow_ai_tool_id !== undefined) {
      existingApp.shadow_ai_tool_id = data.shadow_ai_tool_id;
    }

    if (data.required_training !== undefined) {
      existingApp.required_training = data.required_training;
    }

    if (data.risk_score !== undefined) {
      existingApp.risk_score = data.risk_score;
    }

    existingApp.updated_at = new Date();
    return existingApp;
  }

  constructor(init?: Partial<IAIApp>) {
    super();
    Object.assign(this, init);
  }
}
