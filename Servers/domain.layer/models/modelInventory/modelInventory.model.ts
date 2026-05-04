import { Column, DataType, Model, Table } from "sequelize-typescript";
import { Filedata, IModelInventory } from "../../interfaces/i.modelInventory";
import { ModelInventoryStatus } from "../../enums/model-inventory-status.enum";
import { ValidationException } from "../../exceptions/custom.exception";

@Table({
  tableName: "model_inventories",
  timestamps: true,
  underscored: true,
})
export class ModelInventoryModel extends Model<ModelInventoryModel> implements IModelInventory {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
    allowNull: true, // Allow null during transition
  })
  provider_model?: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  provider!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  model!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  version!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  approver?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  capabilities!: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  security_assessment!: boolean;

  @Column({
    type: DataType.ENUM(...Object.values(ModelInventoryStatus)),
    allowNull: false,
    defaultValue: ModelInventoryStatus.PENDING,
  })
  status!: ModelInventoryStatus;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  status_date!: Date;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  reference_link!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  biases!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  limitations!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  hosting_provider!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true, // Optional
    defaultValue: [], // Initialize as empty array
  })
  security_assessment_data!: Filedata[];

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
   * Validate model inventory data before saving
   */
  async validateModelInventoryData(): Promise<void> {
    if (!this.provider?.trim()) {
      throw new ValidationException("Provider is required", "provider", this.provider);
    }

    if (!this.model?.trim()) {
      throw new ValidationException("Model is required", "model", this.model);
    }

    if (!this.version?.trim()) {
      throw new ValidationException("Version is required", "version", this.version);
    }

    if (!this.capabilities?.trim()) {
      throw new ValidationException("Capabilities are required", "capabilities", this.capabilities);
    }

    if (!this.status_date) {
      throw new ValidationException("Status date is required", "status_date", this.status_date);
    }

    if (!this.reference_link?.trim()) {
      throw new ValidationException(
        "Reference link is required",
        "reference_link",
        this.reference_link,
      );
    }

    if (!this.biases?.trim()) {
      throw new ValidationException("Biases is required", "biases", this.biases);
    }

    if (!this.limitations?.trim()) {
      throw new ValidationException("Limitations are required", "limitations", this.limitations);
    }

    if (!this.hosting_provider?.trim()) {
      throw new ValidationException(
        "Hosting provider is required",
        "hosting_provider",
        this.hosting_provider,
      );
    }
  }

  /**
   * Check if model inventory is a demo entry
   */
  isDemoModelInventory(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Check if model inventory can be modified by user
   */
  canBeModifiedBy(user: any): boolean {
    // Demo model inventory can only be modified by demo users or admins
    if (this.isDemoModelInventory()) {
      return user.is_demo || user.role_id === 1;
    }

    // Regular model inventory can be modified by any authenticated user
    return true;
  }

  /**
   * Update status with automatic status_date update
   */
  async updateStatus(newStatus: ModelInventoryStatus): Promise<void> {
    if (!Object.values(ModelInventoryStatus).includes(newStatus)) {
      throw new ValidationException("Invalid status value", "status", newStatus);
    }

    this.status = newStatus;
    this.status_date = new Date();
    this.updated_at = new Date();
  }

  /**
   * Toggle security assessment status
   */
  async toggleSecurityAssessment(): Promise<void> {
    this.security_assessment = !this.security_assessment;
    this.updated_at = new Date();
  }

  /**
   * Get security assessment badge text
   */
  getSecurityAssessmentBadge(): string {
    return this.security_assessment ? "Yes" : "No";
  }

  /**
   * Get status badge text
   */
  getStatusBadge(): string {
    return this.status;
  }

  /**
   * Check if model inventory is approved
   */
  isApproved(): boolean {
    return this.status === ModelInventoryStatus.APPROVED;
  }

  /**
   * Check if model inventory is restricted
   */
  isRestricted(): boolean {
    return this.status === ModelInventoryStatus.RESTRICTED;
  }

  /**
   * Check if model inventory is pending
   */
  isPending(): boolean {
    return this.status === ModelInventoryStatus.PENDING;
  }

  /**
   * Get model inventory data without sensitive information
   */
  toSafeJSON(): any {
    const dataValues = this.dataValues as any;
    return {
      id: this.id,
      provider_model: this.provider_model, // Keep for backward compatibility
      provider: this.provider,
      model: this.model,
      version: this.version,
      approver: this.approver,
      capabilities: this.capabilities
        ? this.capabilities.split(", ").filter((cap) => cap.trim())
        : [],
      security_assessment: this.security_assessment,
      status: this.status,
      status_date: this.status_date?.toISOString(),
      reference_link: this.reference_link?.trim() || null,
      biases: this.biases,
      limitations: this.limitations,
      hosting_provider: this.hosting_provider,
      security_assessment_data:
        this.security_assessment_data != undefined ? this.security_assessment_data : [],
      is_demo: this.is_demo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
      projects: dataValues.projects || [],
      frameworks: dataValues.frameworks || [],
    };
  }

  /**
   * Create ModelInventoryModel instance from JSON data
   */
  static fromJSON(json: any): ModelInventoryModel {
    return new ModelInventoryModel(json);
  }

  /**
   * Convert model inventory to JSON representation
   */
  toJSON(): any {
    const dataValues = this.dataValues as any;
    return {
      id: this.id,
      provider_model: this.provider_model, // Keep for backward compatibility
      provider: this.provider,
      model: this.model,
      version: this.version,
      approver: this.approver,
      capabilities: this.capabilities
        ? this.capabilities.split(", ").filter((cap) => cap.trim())
        : [],
      security_assessment: this.security_assessment,
      status: this.status,
      status_date: this.status_date?.toISOString(),
      reference_link: this.reference_link,
      biases: this.biases,
      limitations: this.limitations,
      hosting_provider: this.hosting_provider,
      security_assessment_data:
        this.security_assessment_data != undefined ? this.security_assessment_data : [],
      is_demo: this.is_demo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
      projects: dataValues.projects || [],
      frameworks: dataValues.frameworks || [],
    };
  }

  /**
   * Check if model inventory is active (not demo or recent)
   */
  isActive(): boolean {
    if (this.isDemoModelInventory()) {
      return false;
    }

    // Consider model inventory active if created within the last 30 days
    if (this.created_at) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return this.created_at > thirtyDaysAgo;
    }

    return true; // New model inventory entries are considered active
  }

  /**
   * Get model inventory age in days
   */
  getAgeInDays(): number {
    if (!this.created_at) {
      return 0;
    }

    const now = new Date();
    const diffTime = Math.abs(now.getTime() - this.created_at.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if model inventory is recent (created within specified days)
   */
  isRecent(days: number = 7): boolean {
    return this.getAgeInDays() <= days;
  }

  /**
   * Get full model name (provider + version)
   */
  getFullModelName(): string {
    return `${this.provider} ${this.model} ${this.version}`.trim();
  }

  /**
   * Create a new ModelInventoryModel instance with minimal validations
   */
  static createNewModelInventory(data: Partial<IModelInventory>): ModelInventoryModel {
    const modelInventory = new ModelInventoryModel({
      provider_model: data.provider_model || "", // Keep for backward compatibility
      provider: data.provider || "",
      model: data.model || "",
      version: data.version || "",
      approver: data.approver || undefined,
      capabilities: Array.isArray(data.capabilities)
        ? data.capabilities.join(", ")
        : data.capabilities || "",
      security_assessment: data.security_assessment || false,
      status: data.status || ModelInventoryStatus.PENDING,
      status_date: data.status_date || new Date(),
      reference_link: data.reference_link || "",
      biases: data.biases || "",
      limitations: data.limitations || "",
      hosting_provider: data.hosting_provider || "",
      security_assessment_data: data.security_assessment_data || [],
      is_demo: data.is_demo || false,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return modelInventory;
  }

  /**
   * Update an existing ModelInventoryModel instance with minimal validations
   */
  static updateModelInventory(
    existingModel: ModelInventoryModel,
    data: Partial<ModelInventoryModel>,
  ): ModelInventoryModel {
    // Update only the fields that are provided
    if (data.provider_model !== undefined) {
      existingModel.provider_model = data.provider_model;
    }
    if (data.provider !== undefined) {
      existingModel.provider = data.provider;
    }
    if (data.model !== undefined) {
      existingModel.model = data.model;
    }
    if (data.version !== undefined) {
      existingModel.version = data.version;
    }
    if (data.approver !== undefined) {
      existingModel.approver = data.approver;
    }
    if (data.capabilities !== undefined) {
      existingModel.capabilities = Array.isArray(data.capabilities)
        ? data.capabilities.join(", ")
        : data.capabilities;
    }
    if (data.security_assessment !== undefined) {
      existingModel.security_assessment = data.security_assessment;
    }
    if (data.status !== undefined) {
      existingModel.status = data.status;
    }
    if (data.status_date !== undefined) {
      existingModel.status_date = data.status_date;
    }
    if (data.reference_link !== undefined) {
      existingModel.reference_link = data.reference_link;
    }
    if (data.biases !== undefined) {
      existingModel.biases = data.biases;
    }
    if (data.limitations !== undefined) {
      existingModel.limitations = data.limitations;
    }
    if (data.hosting_provider !== undefined) {
      existingModel.hosting_provider = data.hosting_provider;
    }
    if (data.security_assessment_data !== undefined) {
      existingModel.security_assessment_data = data.security_assessment_data;
    }
    if (data.is_demo !== undefined) {
      existingModel.is_demo = data.is_demo;
    }

    // Always update the updated_at timestamp
    existingModel.updated_at = new Date();

    return existingModel;
  }

  constructor(init?: Partial<IModelInventory>) {
    super();
    Object.assign(this, init);
  }
}
