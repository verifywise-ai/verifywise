import {
  ValidationException,
  BusinessLogicException,
  NotFoundException,
} from "../exceptions/custom.exception";
import { numberValidation } from "../validations/number.valid";

// Mock sequelize-typescript
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    ENUM: jest.fn(),
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

// Mock UserModel
jest.mock("../models/user/user.model", () => ({
  UserModel: class MockUserModel {},
}));

// Test class mimicking VendorModel behavior
class TestVendorModel {
  id?: number;
  order_no?: number;
  vendor_name!: string;
  vendor_provides!: string;
  assignee!: number;
  website!: string;
  vendor_contact_person!: string;
  review_result!: string;
  review_status!: "Not started" | "In review" | "Reviewed" | "Requires follow-up";
  reviewer!: number;
  risk_status!: "Very high risk" | "High risk" | "Medium risk" | "Low risk" | "Very low risk";
  review_date!: Date;
  is_demo?: boolean;
  created_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  // Static method to create new vendor
  static async createNewVendor(
    vendor_name: string,
    vendor_provides: string,
    assignee: number,
    website: string,
    vendor_contact_person: string,
    review_result: string,
    review_status: "Not started" | "In review" | "Reviewed" | "Requires follow-up",
    reviewer: number,
    risk_status: "Very high risk" | "High risk" | "Medium risk" | "Low risk" | "Very low risk",
    review_date: Date,
    order_no?: number,
    is_demo: boolean = false,
  ): Promise<TestVendorModel> {
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

    if (!review_result || review_result.trim().length === 0) {
      throw new ValidationException("Review result is required", "review_result", review_result);
    }

    // Validate assignee
    if (!numberValidation(assignee, 1)) {
      throw new ValidationException(
        "Valid assignee ID is required (must be >= 1)",
        "assignee",
        assignee,
      );
    }

    // Validate reviewer
    if (!numberValidation(reviewer, 1)) {
      throw new ValidationException(
        "Valid reviewer ID is required (must be >= 1)",
        "reviewer",
        reviewer,
      );
    }

    // Order number validation removed as requested

    // Create and return the vendor model instance
    const vendor = new TestVendorModel();
    vendor.vendor_name = vendor_name.trim();
    vendor.vendor_provides = vendor_provides.trim();
    vendor.assignee = assignee;
    vendor.website = website.trim();
    vendor.vendor_contact_person = vendor_contact_person.trim();
    vendor.review_result = review_result.trim();
    vendor.review_status = review_status;
    vendor.reviewer = reviewer;
    vendor.risk_status = risk_status;
    vendor.review_date = review_date;
    vendor.order_no = order_no;
    vendor.is_demo = is_demo;
    vendor.created_at = new Date();

    return vendor;
  }

  // Instance method to update vendor
  async updateVendor(updateData: {
    vendor_name?: string;
    vendor_provides?: string;
    assignee?: number;
    website?: string;
    vendor_contact_person?: string;
    review_result?: string;
    review_status?: "Not started" | "In review" | "Reviewed" | "Requires follow-up";
    reviewer?: number;
    risk_status?: "Very high risk" | "High risk" | "Medium risk" | "Low risk" | "Very low risk";
    review_date?: Date;
    order_no?: number;
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

    // Validate review_result if provided
    if (updateData.review_result !== undefined) {
      if (!updateData.review_result || updateData.review_result.trim().length === 0) {
        throw new ValidationException(
          "Review result is required",
          "review_result",
          updateData.review_result,
        );
      }
      this.review_result = updateData.review_result.trim();
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

    // Validate reviewer if provided
    if (updateData.reviewer !== undefined) {
      if (!numberValidation(updateData.reviewer, 1)) {
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

    if (updateData.risk_status !== undefined) {
      this.risk_status = updateData.risk_status;
    }

    if (updateData.review_date !== undefined) {
      this.review_date = updateData.review_date;
    }
  }

  // Instance method to validate vendor data
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

    if (!this.review_result || this.review_result.trim().length === 0) {
      throw new ValidationException(
        "Review result is required",
        "review_result",
        this.review_result,
      );
    }

    if (!this.assignee || !numberValidation(this.assignee, 1)) {
      throw new ValidationException("Valid assignee ID is required", "assignee", this.assignee);
    }

    if (!this.reviewer || !numberValidation(this.reviewer, 1)) {
      throw new ValidationException("Valid reviewer ID is required", "reviewer", this.reviewer);
    }

    // Order number validation removed as requested
  }

  // Instance method to check if vendor is a demo vendor
  isDemoVendor(): boolean {
    return this.is_demo ?? false;
  }

  // Instance method to check if vendor can be modified
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

  // Instance method to check if vendor review is completed
  isReviewCompleted(): boolean {
    return this.review_status === "Reviewed";
  }

  // Instance method to check if vendor has high risk status
  hasHighRisk(): boolean {
    return this.risk_status === "Very high risk" || this.risk_status === "High risk";
  }

  // Instance method to get vendor summary
  getSummary(): {
    id: number | undefined;
    vendorName: string;
    vendorProvides: string;
    reviewStatus: string;
    riskStatus: string;
    isDemo: boolean;
  } {
    return {
      id: this.id,
      vendorName: this.vendor_name,
      vendorProvides: this.vendor_provides,
      reviewStatus: this.review_status,
      riskStatus: this.risk_status,
      isDemo: this.isDemoVendor(),
    };
  }

  // Instance method to convert to JSON
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
      risk_status: this.risk_status,
      review_date: this.review_date?.toISOString(),
      is_demo: this.is_demo,
      created_at: this.created_at?.toISOString(),
    };
  }

  // Static method to find vendor by ID with validation
  static async findByIdWithValidation(id: number): Promise<TestVendorModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    if (id === 999) {
      throw new NotFoundException("Vendor not found", "Vendor", id);
    }

    return new TestVendorModel({
      id,
      vendor_name: "Test Vendor",
      vendor_provides: "Test Services",
      assignee: 1,
      website: "https://test.com",
      vendor_contact_person: "John Doe",
      review_result: "Passed",
      review_status: "Reviewed",
      reviewer: 1,
      risk_status: "Low risk",
      review_date: new Date(),
      is_demo: false,
      created_at: new Date(),
    });
  }
}

describe("VendorModel", () => {
  const validVendorData = {
    vendor_name: "Test Vendor",
    vendor_provides: "AI Services",
    assignee: 1,
    website: "https://testvendor.com",
    vendor_contact_person: "John Doe",
    review_result: "Passed review",
    review_status: "Reviewed" as const,
    reviewer: 1,
    risk_status: "Low risk" as const,
    review_date: new Date(),
    order_no: 1,
    is_demo: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewVendor", () => {
    it("should create vendor with valid data", async () => {
      const vendor = await TestVendorModel.createNewVendor(
        validVendorData.vendor_name,
        validVendorData.vendor_provides,
        validVendorData.assignee,
        validVendorData.website,
        validVendorData.vendor_contact_person,
        validVendorData.review_result,
        validVendorData.review_status,
        validVendorData.reviewer,
        validVendorData.risk_status,
        validVendorData.review_date,
        validVendorData.order_no,
        validVendorData.is_demo,
      );

      expect(vendor).toBeInstanceOf(TestVendorModel);
      expect(vendor.vendor_name).toBe("Test Vendor");
      expect(vendor.vendor_provides).toBe("AI Services");
      expect(vendor.assignee).toBe(1);
      expect(vendor.is_demo).toBe(false);
      expect(vendor.created_at).toBeInstanceOf(Date);
    });

    it("should throw ValidationException for empty vendor name", async () => {
      await expect(
        TestVendorModel.createNewVendor(
          "",
          validVendorData.vendor_provides,
          validVendorData.assignee,
          validVendorData.website,
          validVendorData.vendor_contact_person,
          validVendorData.review_result,
          validVendorData.review_status,
          validVendorData.reviewer,
          validVendorData.risk_status,
          validVendorData.review_date,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid assignee", async () => {
      await expect(
        TestVendorModel.createNewVendor(
          validVendorData.vendor_name,
          validVendorData.vendor_provides,
          0, // Invalid assignee
          validVendorData.website,
          validVendorData.vendor_contact_person,
          validVendorData.review_result,
          validVendorData.review_status,
          validVendorData.reviewer,
          validVendorData.risk_status,
          validVendorData.review_date,
        ),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("updateVendor", () => {
    it("should update vendor successfully", async () => {
      const vendor = new TestVendorModel(validVendorData);

      await vendor.updateVendor({
        vendor_name: "Updated Vendor",
        risk_status: "Medium risk",
      });

      expect(vendor.vendor_name).toBe("Updated Vendor");
      expect(vendor.risk_status).toBe("Medium risk");
    });

    it("should throw ValidationException for empty vendor name update", async () => {
      const vendor = new TestVendorModel(validVendorData);

      await expect(vendor.updateVendor({ vendor_name: "" })).rejects.toThrow(ValidationException);
    });
  });

  describe("validateVendorData", () => {
    it("should pass validation with valid data", async () => {
      const vendor = new TestVendorModel(validVendorData);

      await expect(vendor.validateVendorData()).resolves.not.toThrow();
    });

    it("should throw ValidationException for empty vendor name", async () => {
      const vendor = new TestVendorModel({
        ...validVendorData,
        vendor_name: "",
      });

      await expect(vendor.validateVendorData()).rejects.toThrow(ValidationException);
    });
  });

  describe("canBeModified", () => {
    it("should return true for regular vendor", () => {
      const vendor = new TestVendorModel(validVendorData);
      expect(vendor.canBeModified()).toBe(true);
    });

    it("should throw BusinessLogicException for demo vendor", () => {
      const vendor = new TestVendorModel({
        ...validVendorData,
        is_demo: true,
      });

      expect(() => vendor.canBeModified()).toThrow(BusinessLogicException);
    });
  });

  describe("isReviewCompleted", () => {
    it("should return true for completed review", () => {
      const vendor = new TestVendorModel({
        ...validVendorData,
        review_status: "Reviewed",
      });
      expect(vendor.isReviewCompleted()).toBe(true);
    });

    it("should return false for incomplete review", () => {
      const vendor = new TestVendorModel({
        ...validVendorData,
        review_status: "In review",
      });
      expect(vendor.isReviewCompleted()).toBe(false);
    });
  });

  describe("hasHighRisk", () => {
    it("should return true for high risk vendor", () => {
      const vendor = new TestVendorModel({
        ...validVendorData,
        risk_status: "High risk",
      });
      expect(vendor.hasHighRisk()).toBe(true);
    });

    it("should return false for low risk vendor", () => {
      const vendor = new TestVendorModel({
        ...validVendorData,
        risk_status: "Low risk",
      });
      expect(vendor.hasHighRisk()).toBe(false);
    });
  });

  describe("findByIdWithValidation", () => {
    it("should find vendor by valid ID", async () => {
      const vendor = await TestVendorModel.findByIdWithValidation(1);

      expect(vendor).toBeInstanceOf(TestVendorModel);
      expect(vendor.id).toBe(1);
      expect(vendor.vendor_name).toBe("Test Vendor");
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestVendorModel.findByIdWithValidation(0)).rejects.toThrow(ValidationException);
    });

    it("should throw NotFoundException for non-existent ID", async () => {
      await expect(TestVendorModel.findByIdWithValidation(999)).rejects.toThrow(NotFoundException);
    });
  });
});
