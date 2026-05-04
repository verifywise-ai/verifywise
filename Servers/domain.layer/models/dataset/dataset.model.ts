import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IDataset, DocumentationFile } from "../../interfaces/i.dataset";
import { DatasetStatus } from "../../enums/dataset-status.enum";
import { DatasetType } from "../../enums/dataset-type.enum";
import { DataClassification } from "../../enums/data-classification.enum";
import { ValidationException } from "../../exceptions/custom.exception";

@Table({
  tableName: "datasets",
  timestamps: true,
  underscored: true,
})
export class DatasetModel extends Model<DatasetModel> implements IDataset {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  description!: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  version!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  owner!: string;

  @Column({
    type: DataType.ENUM(...Object.values(DatasetType)),
    allowNull: false,
  })
  type!: DatasetType;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  function!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  source!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  license?: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  format?: string;

  @Column({
    type: DataType.ENUM(...Object.values(DataClassification)),
    allowNull: false,
  })
  classification!: DataClassification;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  contains_pii!: boolean;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  pii_types?: string;

  @Column({
    type: DataType.ENUM(...Object.values(DatasetStatus)),
    allowNull: false,
    defaultValue: DatasetStatus.DRAFT,
  })
  status!: DatasetStatus;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  status_date!: Date;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  known_biases?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  bias_mitigation?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  collection_method?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  preprocessing_steps?: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    defaultValue: [],
  })
  documentation_data?: DocumentationFile[];

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
   * Validate dataset data before saving
   */
  async validateDatasetData(): Promise<void> {
    if (!this.name?.trim()) {
      throw new ValidationException("Name is required", "name", this.name);
    }

    if (!this.description?.trim()) {
      throw new ValidationException("Description is required", "description", this.description);
    }

    if (!this.version?.trim()) {
      throw new ValidationException("Version is required", "version", this.version);
    }

    if (!this.owner?.trim()) {
      throw new ValidationException("Owner is required", "owner", this.owner);
    }

    if (!this.type) {
      throw new ValidationException("Type is required", "type", this.type);
    }

    if (!this.function?.trim()) {
      throw new ValidationException("Function is required", "function", this.function);
    }

    if (!this.source?.trim()) {
      throw new ValidationException("Source is required", "source", this.source);
    }

    if (!this.classification) {
      throw new ValidationException(
        "Classification is required",
        "classification",
        this.classification,
      );
    }

    if (!this.status_date) {
      throw new ValidationException("Status date is required", "status_date", this.status_date);
    }
  }

  /**
   * Check if dataset is a demo entry
   */
  isDemoDataset(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Check if dataset can be modified by user
   */
  canBeModifiedBy(user: any): boolean {
    if (this.isDemoDataset()) {
      return user.is_demo || user.role_id === 1;
    }
    return true;
  }

  /**
   * Update status with automatic status_date update
   */
  async updateStatus(newStatus: DatasetStatus): Promise<void> {
    if (!Object.values(DatasetStatus).includes(newStatus)) {
      throw new ValidationException("Invalid status value", "status", newStatus);
    }

    this.status = newStatus;
    this.status_date = new Date();
    this.updated_at = new Date();
  }

  /**
   * Check if dataset contains PII
   */
  hasPII(): boolean {
    return this.contains_pii;
  }

  /**
   * Check status helpers
   */
  isDraft(): boolean {
    return this.status === DatasetStatus.DRAFT;
  }

  isActive(): boolean {
    return this.status === DatasetStatus.ACTIVE;
  }

  isDeprecated(): boolean {
    return this.status === DatasetStatus.DEPRECATED;
  }

  isArchived(): boolean {
    return this.status === DatasetStatus.ARCHIVED;
  }

  /**
   * Get dataset data without sensitive information
   */
  toSafeJSON(): any {
    const dataValues = this.dataValues as any;
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      version: this.version,
      owner: this.owner,
      type: this.type,
      function: this.function,
      source: this.source,
      license: this.license,
      format: this.format,
      classification: this.classification,
      contains_pii: this.contains_pii,
      pii_types: this.pii_types,
      status: this.status,
      status_date: this.status_date?.toISOString?.() || this.status_date,
      known_biases: this.known_biases,
      bias_mitigation: this.bias_mitigation,
      collection_method: this.collection_method,
      preprocessing_steps: this.preprocessing_steps,
      documentation_data: this.documentation_data || [],
      is_demo: this.is_demo,
      created_at:
        (this.createdAt ?? this.created_at)?.toISOString?.() || this.createdAt || this.created_at,
      updated_at:
        (this.updatedAt ?? this.updated_at)?.toISOString?.() || this.updatedAt || this.updated_at,
      models: dataValues.models || [],
      projects: dataValues.projects || [],
    };
  }

  /**
   * Convert dataset to JSON representation
   */
  toJSON(): any {
    return this.toSafeJSON();
  }

  /**
   * Create a new DatasetModel instance
   */
  static createNewDataset(data: Partial<IDataset>): DatasetModel {
    const dataset = new DatasetModel({
      name: data.name || "",
      description: data.description || "",
      version: data.version || "",
      owner: data.owner || "",
      type: data.type || DatasetType.TRAINING,
      function: data.function || "",
      source: data.source || "",
      license: data.license || "",
      format: data.format || "",
      classification: data.classification || DataClassification.INTERNAL,
      contains_pii: data.contains_pii || false,
      pii_types: data.pii_types || "",
      status: data.status || DatasetStatus.DRAFT,
      status_date: data.status_date || new Date(),
      known_biases: data.known_biases || "",
      bias_mitigation: data.bias_mitigation || "",
      collection_method: data.collection_method || "",
      preprocessing_steps: data.preprocessing_steps || "",
      documentation_data: data.documentation_data || [],
      is_demo: data.is_demo || false,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return dataset;
  }

  /**
   * Update an existing DatasetModel instance
   */
  static updateDataset(existingDataset: DatasetModel, data: Partial<DatasetModel>): DatasetModel {
    if (data.name !== undefined) existingDataset.name = data.name;
    if (data.description !== undefined) existingDataset.description = data.description;
    if (data.version !== undefined) existingDataset.version = data.version;
    if (data.owner !== undefined) existingDataset.owner = data.owner;
    if (data.type !== undefined) existingDataset.type = data.type;
    if (data.function !== undefined) existingDataset.function = data.function;
    if (data.source !== undefined) existingDataset.source = data.source;
    if (data.license !== undefined) existingDataset.license = data.license;
    if (data.format !== undefined) existingDataset.format = data.format;
    if (data.classification !== undefined) existingDataset.classification = data.classification;
    if (data.contains_pii !== undefined) existingDataset.contains_pii = data.contains_pii;
    if (data.pii_types !== undefined) existingDataset.pii_types = data.pii_types;
    if (data.status !== undefined) existingDataset.status = data.status;
    if (data.status_date !== undefined) existingDataset.status_date = data.status_date;
    if (data.known_biases !== undefined) existingDataset.known_biases = data.known_biases;
    if (data.bias_mitigation !== undefined) existingDataset.bias_mitigation = data.bias_mitigation;
    if (data.collection_method !== undefined)
      existingDataset.collection_method = data.collection_method;
    if (data.preprocessing_steps !== undefined)
      existingDataset.preprocessing_steps = data.preprocessing_steps;
    if (data.documentation_data !== undefined)
      existingDataset.documentation_data = data.documentation_data;
    if (data.is_demo !== undefined) existingDataset.is_demo = data.is_demo;

    existingDataset.updated_at = new Date();

    return existingDataset;
  }

  constructor(init?: Partial<IDataset>) {
    super();
    Object.assign(this, init);
  }
}
