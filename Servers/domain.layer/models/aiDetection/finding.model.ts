/**
 * @fileoverview AI Detection Finding Model
 *
 * Sequelize model for ai_detection_findings table.
 * Represents a detected AI/ML library finding within a scan.
 *
 * @module domain.layer/models/aiDetection/finding.model
 */

import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IFinding, FindingType, ConfidenceLevel, IFilePath } from "../../interfaces/i.aiDetection";
import { ValidationException } from "../../exceptions/custom.exception";

@Table({
  tableName: "ai_detection_findings",
  timestamps: false,
})
export class FindingModel extends Model<FindingModel> implements IFinding {
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
  scan_id!: number;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  finding_type!: FindingType;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  category!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  provider?: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
  })
  confidence!: ConfidenceLevel;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: true,
  })
  documentation_url?: string;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 1,
  })
  file_count?: number;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  file_paths?: IFilePath[];

  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  // ============================================================================
  // Static Factory Methods
  // ============================================================================

  /**
   * Create a new finding model instance
   */
  static createNew(
    scanId: number,
    findingType: FindingType,
    category: string,
    name: string,
    provider: string | undefined,
    confidence: ConfidenceLevel,
    filePaths: IFilePath[],
    description?: string,
    documentationUrl?: string,
  ): FindingModel {
    const finding = new FindingModel();
    finding.scan_id = scanId;
    finding.finding_type = findingType;
    finding.category = category;
    finding.name = name;
    finding.provider = provider;
    finding.confidence = confidence;
    finding.file_paths = filePaths;
    finding.file_count = filePaths.length;
    finding.description = description;
    finding.documentation_url = documentationUrl;
    return finding;
  }

  // ============================================================================
  // Validation Methods
  // ============================================================================

  /**
   * Validate finding data before operations
   *
   * @throws {ValidationException} If validation fails
   */
  validateFindingData(): void {
    if (!this.scan_id) {
      throw new ValidationException("Scan ID is required", "scan_id");
    }

    if (!this.finding_type) {
      throw new ValidationException("Finding type is required", "finding_type");
    }

    if (!["library", "dependency"].includes(this.finding_type)) {
      throw new ValidationException(
        "Finding type must be 'library' or 'dependency'",
        "finding_type",
      );
    }

    if (!this.category) {
      throw new ValidationException("Category is required", "category");
    }

    if (!this.name) {
      throw new ValidationException("Name is required", "name");
    }

    if (!this.confidence) {
      throw new ValidationException("Confidence is required", "confidence");
    }

    if (!["high", "medium", "low"].includes(this.confidence)) {
      throw new ValidationException("Confidence must be 'high', 'medium', or 'low'", "confidence");
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Add a file path to this finding (for aggregation)
   */
  addFilePath(filePath: IFilePath): void {
    if (!this.file_paths) {
      this.file_paths = [];
    }
    this.file_paths.push(filePath);
    this.file_count = this.file_paths.length;
  }

  /**
   * Get a unique key for deduplication
   */
  getDeduplicationKey(): string {
    return `${this.name}::${this.provider || "unknown"}`;
  }

  /**
   * Get confidence sort order (for sorting high -> low)
   */
  getConfidenceSortOrder(): number {
    switch (this.confidence) {
      case "high":
        return 1;
      case "medium":
        return 2;
      case "low":
        return 3;
      default:
        return 4;
    }
  }

  /**
   * Get truncated file paths (first N)
   */
  getTruncatedFilePaths(limit: number = 5): IFilePath[] {
    if (!this.file_paths) return [];
    return this.file_paths.slice(0, limit);
  }

  /**
   * Check if there are more file paths than shown
   */
  hasMoreFilePaths(limit: number = 5): boolean {
    if (!this.file_paths) return false;
    return this.file_paths.length > limit;
  }

  /**
   * Get display name with provider
   */
  getDisplayName(): string {
    if (this.provider) {
      return `${this.name} (${this.provider})`;
    }
    return this.name;
  }

  constructor(init?: Partial<IFinding>) {
    super();
    if (init) {
      Object.assign(this, init);
    }
  }
}
