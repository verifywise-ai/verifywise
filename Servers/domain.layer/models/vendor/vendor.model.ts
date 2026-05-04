import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { IVendor } from "../../interfaces/i.vendor";
import { numberValidation } from "../../validations/number.valid";
import {
  ValidationException,
  BusinessLogicException,
  NotFoundException,
} from "../../exceptions/custom.exception";

@Table({
  tableName: "vendors",
  timestamps: true,
  underscored: true,
})
export class VendorModel extends Model<VendorModel> implements IVendor {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.INTEGER,
  })
  order_no?: number;

  @Column({
    type: DataType.STRING,
  })
  vendor_name!: string;

  @Column({
    type: DataType.STRING,
  })
  vendor_provides!: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  assignee!: number;

  @Column({
    type: DataType.STRING,
  })
  website!: string;

  @Column({
    type: DataType.STRING,
  })
  vendor_contact_person!: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  review_result?: string;

  @Column({
    type: DataType.ENUM("Not started", "In review", "Reviewed", "Requires follow-up"),
    allowNull: true,
    defaultValue: "Not started",
  })
  review_status?: "Not started" | "In review" | "Reviewed" | "Requires follow-up";

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  reviewer?: number | null;
  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  review_date?: Date;

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
  })
  updated_at?: Date;

  @Column({
    type: DataType.ENUM(
      "None",
      "Internal only",
      "Personally identifiable information (PII)",
      "Financial data",
      "Health data (e.g. HIPAA)",
      "Model weights or AI assets",
      "Other sensitive data",
    ),
    allowNull: true,
  })
  data_sensitivity?:
    | "None"
    | "Internal only"
    | "Personally identifiable information (PII)"
    | "Financial data"
    | "Health data (e.g. HIPAA)"
    | "Model weights or AI assets"
    | "Other sensitive data";

  @Column({
    type: DataType.ENUM(
      "Low (vendor supports non-core functions)",
      "Medium (affects operations but is replaceable)",
      "High (critical to core services or products)",
    ),
    allowNull: true,
  })
  business_criticality?:
    | "Low (vendor supports non-core functions)"
    | "Medium (affects operations but is replaceable)"
    | "High (critical to core services or products)";

  @Column({
    type: DataType.ENUM(
      "None",
      "Minor incident (e.g. small delay, minor bug)",
      "Major incident (e.g. data breach, legal issue)",
    ),
    allowNull: true,
  })
  past_issues?:
    | "None"
    | "Minor incident (e.g. small delay, minor bug)"
    | "Major incident (e.g. data breach, legal issue)";

  @Column({
    type: DataType.ENUM(
      "None",
      "GDPR (EU)",
      "HIPAA (US)",
      "SOC 2",
      "ISO 27001",
      "EU AI act",
      "CCPA (california)",
      "Other",
    ),
    allowNull: true,
  })
  regulatory_exposure?:
    | "None"
    | "GDPR (EU)"
    | "HIPAA (US)"
    | "SOC 2"
    | "ISO 27001"
    | "EU AI act"
    | "CCPA (california)"
    | "Other";

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  risk_score?: number;

  // Projects field (not a database column, used for API)
  projects?: number[];

  /**
   * Create a new vendor with comprehensive validation
   */
  static async createNewVendor(
    vendor_name: string,
    vendor_provides: string,
    assignee: number,
    website: string,
    vendor_contact_person: string,
    review_result?: string,
    review_status?: "Not started" | "In review" | "Reviewed" | "Requires follow-up",
    reviewer?: number,
    review_date?: Date,
    order_no?: number,
    is_demo: boolean = false,
    projects?: number[],
    data_sensitivity?:
      | "None"
      | "Internal only"
      | "Personally identifiable information (PII)"
      | "Financial data"
      | "Health data (e.g. HIPAA)"
      | "Model weights or AI assets"
      | "Other sensitive data",
    business_criticality?:
      | "Low (vendor supports non-core functions)"
      | "Medium (affects operations but is replaceable)"
      | "High (critical to core services or products)",
    past_issues?:
      | "None"
      | "Minor incident (e.g. small delay, minor bug)"
      | "Major incident (e.g. data breach, legal issue)",
    regulatory_exposure?:
      | "None"
      | "GDPR (EU)"
      | "HIPAA (US)"
      | "SOC 2"
      | "ISO 27001"
      | "EU AI act"
      | "CCPA (california)"
      | "Other",
    risk_score?: number,
  ): Promise<VendorModel> {
    // Validate required fields
    if (!vendor_name || vendor_name.trim().length === 0) {
      throw new ValidationException("Vendor name is required", "vendor_name", vendor_name);
    }

    if (!vendor_provides || vendor_provides.trim().length === 0) {
      throw new ValidationException(
        "Vendor provides is required",
        "vendor_provides",
        vendor_provides,
      );
    }

    if (!website || website.trim().length === 0) {
      throw new ValidationException("Website is required", "website", website);
    }

    if (!vendor_contact_person || vendor_contact_person.trim().length === 0) {
      throw new ValidationException(
        "Vendor contact person is required",
        "vendor_contact_person",
        vendor_contact_person,
      );
    }

    // Review result is now optional - no validation required

    // Validate assignee
    if (!numberValidation(assignee, 1)) {
      throw new ValidationException(
        "Valid assignee ID is required (must be >= 1)",
        "assignee",
        assignee,
      );
    }

    // Reviewer is now optional - validate only if provided and positive
    if (
      reviewer !== undefined &&
      reviewer !== null &&
      reviewer > 0 &&
      !numberValidation(reviewer, 1)
    ) {
      throw new ValidationException(
        "Valid reviewer ID is required (must be >= 1)",
        "reviewer",
        reviewer,
      );
    }

    // Order number validation removed as requested

    // Create and return the vendor model instance
    const vendor = new VendorModel();
    vendor.vendor_name = vendor_name.trim();
    vendor.vendor_provides = vendor_provides.trim();
    vendor.assignee = assignee;
    vendor.website = website.trim();
    vendor.vendor_contact_person = vendor_contact_person.trim();
    vendor.review_result = review_result ? review_result.trim() : "";
    vendor.review_status = review_status || "Not started";
    vendor.reviewer = reviewer && reviewer > 0 ? reviewer : null;
    vendor.review_date = review_date || new Date();
    vendor.order_no = order_no;
    vendor.is_demo = is_demo;
    vendor.created_at = new Date();
    vendor.projects = projects || [];

    // Set scorecard fields
    vendor.data_sensitivity = data_sensitivity;
    vendor.business_criticality = business_criticality;
    vendor.past_issues = past_issues;
    vendor.regulatory_exposure = regulatory_exposure;
    vendor.risk_score = risk_score;

    return vendor;
  }

  /**
   * Update vendor information with validation
   */
  async updateVendor(updateData: {
    vendor_name?: string;
    vendor_provides?: string;
    assignee?: number;
    website?: string;
    vendor_contact_person?: string;
    review_result?: string;
    review_status?: "Not started" | "In review" | "Reviewed" | "Requires follow-up";
    reviewer?: number | null;
    review_date?: Date;
    order_no?: number;
    projects?: number[];
    data_sensitivity?:
      | "None"
      | "Internal only"
      | "Personally identifiable information (PII)"
      | "Financial data"
      | "Health data (e.g. HIPAA)"
      | "Model weights or AI assets"
      | "Other sensitive data";
    business_criticality?:
      | "Low (vendor supports non-core functions)"
      | "Medium (affects operations but is replaceable)"
      | "High (critical to core services or products)";
    past_issues?:
      | "None"
      | "Minor incident (e.g. small delay, minor bug)"
      | "Major incident (e.g. data breach, legal issue)";
    regulatory_exposure?:
      | "None"
      | "GDPR (EU)"
      | "HIPAA (US)"
      | "SOC 2"
      | "ISO 27001"
      | "EU AI act"
      | "CCPA (california)"
      | "Other";
    risk_score?: number;
  }): Promise<void> {
    // Validate vendor_name if provided
    if (updateData.vendor_name !== undefined) {
      if (!updateData.vendor_name || updateData.vendor_name.trim().length === 0) {
        throw new ValidationException(
          "Vendor name is required",
          "vendor_name",
          updateData.vendor_name,
        );
      }
      this.vendor_name = updateData.vendor_name.trim();
    }

    // Validate vendor_provides if provided
    if (updateData.vendor_provides !== undefined) {
      if (!updateData.vendor_provides || updateData.vendor_provides.trim().length === 0) {
        throw new ValidationException(
          "Vendor provides is required",
          "vendor_provides",
          updateData.vendor_provides,
        );
      }
      this.vendor_provides = updateData.vendor_provides.trim();
    }

    // Validate website if provided
    if (updateData.website !== undefined) {
      if (!updateData.website || updateData.website.trim().length === 0) {
        throw new ValidationException("Website is required", "website", updateData.website);
      }
      this.website = updateData.website.trim();
    }

    // Validate vendor_contact_person if provided
    if (updateData.vendor_contact_person !== undefined) {
      if (
        !updateData.vendor_contact_person ||
        updateData.vendor_contact_person.trim().length === 0
      ) {
        throw new ValidationException(
          "Vendor contact person is required",
          "vendor_contact_person",
          updateData.vendor_contact_person,
        );
      }
      this.vendor_contact_person = updateData.vendor_contact_person.trim();
    }

    // Validate review_result if provided - now optional, allow empty values
    if (updateData.review_result !== undefined) {
      this.review_result = updateData.review_result ? updateData.review_result.trim() : "";
    }

    // Validate assignee if provided
    if (updateData.assignee !== undefined) {
      if (!numberValidation(updateData.assignee, 1)) {
        throw new ValidationException(
          "Valid assignee ID is required (must be >= 1)",
          "assignee",
          updateData.assignee,
        );
      }
      this.assignee = updateData.assignee;
    }

    // Validate reviewer if provided - only validate if it's a positive number
    if (updateData.reviewer !== undefined) {
      if (
        updateData.reviewer !== null &&
        updateData.reviewer > 0 &&
        !numberValidation(updateData.reviewer, 1)
      ) {
        throw new ValidationException(
          "Valid reviewer ID is required (must be >= 1)",
          "reviewer",
          updateData.reviewer,
        );
      }
      this.reviewer = updateData.reviewer;
    }

    // Order number validation removed as requested
    if (updateData.order_no !== undefined) {
      this.order_no = updateData.order_no;
    }

    // Update other fields if provided
    if (updateData.review_status !== undefined) {
      this.review_status = updateData.review_status;
    }

    if (updateData.review_date !== undefined) {
      this.review_date = updateData.review_date;
    }

    // Update projects if provided
    if (updateData.projects !== undefined) {
      this.projects = updateData.projects;
    }

    // Update scorecard fields if provided
    if (updateData.data_sensitivity !== undefined) {
      this.data_sensitivity = updateData.data_sensitivity;
    }

    if (updateData.business_criticality !== undefined) {
      this.business_criticality = updateData.business_criticality;
    }

    if (updateData.past_issues !== undefined) {
      this.past_issues = updateData.past_issues;
    }

    if (updateData.regulatory_exposure !== undefined) {
      this.regulatory_exposure = updateData.regulatory_exposure;
    }

    if (updateData.risk_score !== undefined) {
      this.risk_score = updateData.risk_score;
    }
  }

  /**
   * Validate vendor data before saving
   */
  async validateVendorData(): Promise<void> {
    if (!this.vendor_name || this.vendor_name.trim().length === 0) {
      throw new ValidationException("Vendor name is required", "vendor_name", this.vendor_name);
    }

    if (!this.vendor_provides || this.vendor_provides.trim().length === 0) {
      throw new ValidationException(
        "Vendor provides is required",
        "vendor_provides",
        this.vendor_provides,
      );
    }

    if (!this.website || this.website.trim().length === 0) {
      throw new ValidationException("Website is required", "website", this.website);
    }

    if (!this.vendor_contact_person || this.vendor_contact_person.trim().length === 0) {
      throw new ValidationException(
        "Vendor contact person is required",
        "vendor_contact_person",
        this.vendor_contact_person,
      );
    }

    // Review result is now optional - only validate if provided and not empty
    if (this.review_result && this.review_result.trim().length === 0) {
      throw new ValidationException(
        "Review result cannot be empty if provided",
        "review_result",
        this.review_result,
      );
    }

    if (!this.assignee || !numberValidation(this.assignee, 1)) {
      throw new ValidationException("Valid assignee ID is required", "assignee", this.assignee);
    }

    // Reviewer is now optional - validate only if provided and not 0
    if (
      this.reviewer !== undefined &&
      this.reviewer !== null &&
      this.reviewer > 0 &&
      !numberValidation(this.reviewer, 1)
    ) {
      throw new ValidationException("Valid reviewer ID is required", "reviewer", this.reviewer);
    }

    // Order number validation removed as requested
  }

  /**
   * Check if vendor is a demo vendor
   */
  isDemoVendor(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Check if vendor can be modified
   */
  canBeModified(): boolean {
    if (this.isDemoVendor()) {
      throw new BusinessLogicException(
        "Demo vendors cannot be modified",
        "DEMO_VENDOR_RESTRICTION",
        { vendorId: this.id, vendorName: this.vendor_name },
      );
    }
    return true;
  }

  /**
   * Check if vendor review is completed
   */
  isReviewCompleted(): boolean {
    return this.review_status === "Reviewed";
  }

  /**
   * Check if vendor review is in progress
   */
  isReviewInProgress(): boolean {
    return this.review_status === "In review";
  }

  /**
   * Check if vendor review requires follow-up
   */
  requiresFollowUp(): boolean {
    return this.review_status === "Requires follow-up";
  }

  /**
   * Get vendor summary for display
   */
  getSummary(): {
    id: number | undefined;
    vendorName: string;
    vendorProvides: string;
    reviewStatus: string | undefined;
    isDemo: boolean;
  } {
    return {
      id: this.id,
      vendorName: this.vendor_name,
      vendorProvides: this.vendor_provides,
      reviewStatus: this.review_status,
      isDemo: this.isDemoVendor(),
    };
  }

  /**
   * Convert vendor model to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      order_no: this.order_no,
      vendor_name: this.vendor_name,
      vendor_provides: this.vendor_provides,
      assignee: this.assignee,
      website: this.website,
      vendor_contact_person: this.vendor_contact_person,
      review_result: this.review_result,
      review_status: this.review_status,
      reviewer: this.reviewer,
      review_date: this.review_date?.toISOString(),
      is_demo: this.is_demo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
    };
  }

  /**
   * Create VendorModel instance from JSON data
   */
  static fromJSON(json: any): VendorModel {
    return new VendorModel(json);
  }

  /**
   * Static method to find vendor by ID with validation
   */
  static async findByIdWithValidation(id: number): Promise<VendorModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    const vendor = await VendorModel.findByPk(id);
    if (!vendor) {
      throw new NotFoundException("Vendor not found", "Vendor", id);
    }

    return vendor;
  }

  constructor(init?: Partial<IVendor>) {
    super();
    Object.assign(this, init);
  }
}
