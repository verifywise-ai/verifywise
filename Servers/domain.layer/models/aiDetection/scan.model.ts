/**
 * @fileoverview AI Detection Scan Model
 *
 * Sequelize model for ai_detection_scans table.
 * Represents a repository scan record with status and progress tracking.
 *
 * @module domain.layer/models/aiDetection/scan.model
 */

import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IScan, ScanStatus, IUpdateScanProgressInput } from "../../interfaces/i.aiDetection";
import { ValidationException } from "../../exceptions/custom.exception";

@Table({
  tableName: "ai_detection_scans",
  timestamps: false,
})
export class ScanModel extends Model<ScanModel> implements IScan {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING(500),
    allowNull: false,
  })
  repository_url!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  repository_owner!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  repository_name!: string;

  @Column({
    type: DataType.STRING(100),
    defaultValue: "main",
  })
  default_branch?: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    defaultValue: "pending",
  })
  status!: ScanStatus;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  findings_count?: number;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  files_scanned?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  total_files?: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  started_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  completed_at?: Date;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  duration_ms?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  error_message?: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  triggered_by!: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  cache_path?: string;

  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
  })
  updated_at?: Date;

  // ============================================================================
  // Static Factory Methods
  // ============================================================================

  /**
   * Create a new scan model instance
   */
  static createNew(
    repositoryUrl: string,
    repositoryOwner: string,
    repositoryName: string,
    triggeredBy: number,
  ): ScanModel {
    const scan = new ScanModel();
    scan.repository_url = repositoryUrl;
    scan.repository_owner = repositoryOwner;
    scan.repository_name = repositoryName;
    scan.triggered_by = triggeredBy;
    scan.status = "pending";
    scan.findings_count = 0;
    scan.files_scanned = 0;
    return scan;
  }

  // ============================================================================
  // Validation Methods
  // ============================================================================

  /**
   * Validate scan data before operations
   *
   * @throws {ValidationException} If validation fails
   */
  validateScanData(): void {
    if (!this.repository_url) {
      throw new ValidationException("Repository URL is required", "repository_url");
    }

    if (!this.repository_owner) {
      throw new ValidationException("Repository owner is required", "repository_owner");
    }

    if (!this.repository_name) {
      throw new ValidationException("Repository name is required", "repository_name");
    }

    if (!this.triggered_by) {
      throw new ValidationException("Triggered by is required", "triggered_by");
    }

    // Validate URL length
    if (this.repository_url.length > 500) {
      throw new ValidationException(
        "Repository URL exceeds maximum length of 500 characters",
        "repository_url",
      );
    }
  }

  // ============================================================================
  // Status Methods
  // ============================================================================

  /**
   * Check if scan is in a terminal state (completed, failed, or cancelled)
   */
  isTerminal(): boolean {
    return ["completed", "failed", "cancelled"].includes(this.status);
  }

  /**
   * Check if scan is in progress
   */
  isInProgress(): boolean {
    return ["pending", "cloning", "scanning"].includes(this.status);
  }

  /**
   * Check if scan can be cancelled
   */
  canBeCancelled(): boolean {
    return this.isInProgress();
  }

  /**
   * Check if scan can be deleted
   */
  canBeDeleted(): boolean {
    return this.isTerminal();
  }

  // ============================================================================
  // Update Methods
  // ============================================================================

  /**
   * Update scan progress
   */
  updateProgress(input: IUpdateScanProgressInput): void {
    if (input.status !== undefined) {
      this.status = input.status;
    }
    if (input.files_scanned !== undefined) {
      this.files_scanned = input.files_scanned;
    }
    if (input.total_files !== undefined) {
      this.total_files = input.total_files;
    }
    if (input.findings_count !== undefined) {
      this.findings_count = input.findings_count;
    }
    if (input.started_at !== undefined) {
      this.started_at = input.started_at;
    }
    if (input.completed_at !== undefined) {
      this.completed_at = input.completed_at;
    }
    if (input.duration_ms !== undefined) {
      this.duration_ms = input.duration_ms;
    }
    if (input.error_message !== undefined) {
      this.error_message = input.error_message;
    }
    if (input.cache_path !== undefined) {
      this.cache_path = input.cache_path;
    }
    this.updated_at = new Date();
  }

  /**
   * Mark scan as started
   */
  markStarted(): void {
    this.status = "cloning";
    this.started_at = new Date();
    this.updated_at = new Date();
  }

  /**
   * Mark scan as scanning
   */
  markScanning(totalFiles?: number): void {
    this.status = "scanning";
    if (totalFiles !== undefined) {
      this.total_files = totalFiles;
    }
    this.updated_at = new Date();
  }

  /**
   * Mark scan as completed
   */
  markCompleted(findingsCount: number, filesScanned: number): void {
    this.status = "completed";
    this.findings_count = findingsCount;
    this.files_scanned = filesScanned;
    this.completed_at = new Date();
    if (this.started_at) {
      this.duration_ms = this.completed_at.getTime() - this.started_at.getTime();
    }
    this.updated_at = new Date();
  }

  /**
   * Mark scan as failed
   */
  markFailed(errorMessage: string): void {
    this.status = "failed";
    this.error_message = errorMessage;
    this.completed_at = new Date();
    if (this.started_at) {
      this.duration_ms = this.completed_at.getTime() - this.started_at.getTime();
    }
    this.updated_at = new Date();
  }

  /**
   * Mark scan as cancelled
   */
  markCancelled(): void {
    this.status = "cancelled";
    this.completed_at = new Date();
    if (this.started_at) {
      this.duration_ms = this.completed_at.getTime() - this.started_at.getTime();
    }
    this.updated_at = new Date();
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Calculate progress percentage (0-100)
   */
  getProgressPercentage(): number {
    if (this.status === "pending") return 0;
    if (this.status === "cloning") return 5;
    if (this.status === "completed") return 100;
    if (this.status === "failed" || this.status === "cancelled") return 100;

    if (this.total_files && this.total_files > 0 && this.files_scanned) {
      // Reserve 5% for cloning, 95% for scanning
      const scanProgress = (this.files_scanned / this.total_files) * 95;
      return Math.min(99, Math.round(5 + scanProgress));
    }

    return 10; // Default scanning progress
  }

  /**
   * Get full repository name (owner/repo)
   */
  getFullRepoName(): string {
    return `${this.repository_owner}/${this.repository_name}`;
  }

  /**
   * Get scan summary
   */
  getSummary(): {
    id: number;
    repo: string;
    status: ScanStatus;
    findings: number;
  } {
    return {
      id: this.id!,
      repo: this.getFullRepoName(),
      status: this.status,
      findings: this.findings_count || 0,
    };
  }

  constructor(init?: Partial<IScan>) {
    super();
    if (init) {
      Object.assign(this, init);
    }
  }
}
