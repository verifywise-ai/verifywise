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
    JSONB: "JSONB",
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

// Mock related models
jest.mock("../models/control/control.model", () => ({
  ControlModel: class MockControlModel {},
}));

jest.mock("../models/user/user.model", () => ({
  UserModel: class MockUserModel {},
}));

// Test class mimicking SubcontrolModel behavior
class TestSubcontrolModel {
  id?: number;
  title!: string;
  description!: string;
  order_no?: number;
  status?: "Waiting" | "In progress" | "Done";
  approver?: number;
  risk_review?: "Acceptable risk" | "Residual risk" | "Unacceptable risk";
  owner?: number;
  reviewer?: number;
  due_date?: Date;
  implementation_details?: string;
  evidence_description?: string;
  feedback_description?: string;
  evidence_files?: any[];
  feedback_files?: any[];
  control_id!: number;
  is_demo?: boolean;
  created_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  // Static method to create new subcontrol
  static async createNewSubcontrol(
    title: string,
    description: string,
    control_id: number,
    order_no?: number,
    status?: "Waiting" | "In progress" | "Done",
    approver?: number,
    risk_review?: "Acceptable risk" | "Residual risk" | "Unacceptable risk",
    owner?: number,
    reviewer?: number,
    due_date?: Date,
    implementation_details?: string,
    evidence_description?: string,
    feedback_description?: string,
    evidence_files?: any[],
    feedback_files?: any[],
    is_demo: boolean = false,
  ): Promise<TestSubcontrolModel> {
    // Validate required fields
    if (!title || title.trim().length === 0) {
      throw new ValidationException("Subcontrol title is required", "title", title);
    }

    if (!description || description.trim().length === 0) {
      throw new ValidationException(
        "Subcontrol description is required",
        "description",
        description,
      );
    }

    // Validate control_id
    if (!numberValidation(control_id, 1)) {
      throw new ValidationException(
        "Valid control_id is required (must be >= 1)",
        "control_id",
        control_id,
      );
    }

    // Validate order_no if provided
    if (order_no !== undefined && !numberValidation(order_no, 1)) {
      throw new ValidationException(
        "Order number must be a positive integer",
        "order_no",
        order_no,
      );
    }

    // Validate approver if provided
    if (approver !== undefined && !numberValidation(approver, 1)) {
      throw new ValidationException(
        "Valid approver ID is required (must be >= 1)",
        "approver",
        approver,
      );
    }

    // Validate owner if provided
    if (owner !== undefined && !numberValidation(owner, 1)) {
      throw new ValidationException("Valid owner ID is required (must be >= 1)", "owner", owner);
    }

    // Validate reviewer if provided
    if (reviewer !== undefined && !numberValidation(reviewer, 1)) {
      throw new ValidationException(
        "Valid reviewer ID is required (must be >= 1)",
        "reviewer",
        reviewer,
      );
    }

    // Create and return the subcontrol model instance
    const subcontrol = new TestSubcontrolModel();
    subcontrol.title = title.trim();
    subcontrol.description = description.trim();
    subcontrol.control_id = control_id;
    subcontrol.order_no = order_no;
    subcontrol.status = status || "Waiting";
    subcontrol.approver = approver;
    subcontrol.risk_review = risk_review;
    subcontrol.owner = owner;
    subcontrol.reviewer = reviewer;
    subcontrol.due_date = due_date;
    subcontrol.implementation_details = implementation_details;
    subcontrol.evidence_description = evidence_description;
    subcontrol.feedback_description = feedback_description;
    subcontrol.evidence_files = evidence_files || [];
    subcontrol.feedback_files = feedback_files || [];
    subcontrol.is_demo = is_demo;
    subcontrol.created_at = new Date();

    return subcontrol;
  }

  // Instance method to update subcontrol
  async updateSubcontrol(updateData: {
    title?: string;
    description?: string;
    order_no?: number;
    status?: "Waiting" | "In progress" | "Done";
    approver?: number;
    risk_review?: "Acceptable risk" | "Residual risk" | "Unacceptable risk";
    owner?: number;
    reviewer?: number;
    due_date?: Date;
    implementation_details?: string;
    evidence_description?: string;
    feedback_description?: string;
    evidence_files?: any[];
    feedback_files?: any[];
  }): Promise<void> {
    // Validate title if provided
    if (updateData.title !== undefined) {
      if (!updateData.title || updateData.title.trim().length === 0) {
        throw new ValidationException("Subcontrol title is required", "title", updateData.title);
      }
      this.title = updateData.title.trim();
    }

    // Validate description if provided
    if (updateData.description !== undefined) {
      if (!updateData.description || updateData.description.trim().length === 0) {
        throw new ValidationException(
          "Subcontrol description is required",
          "description",
          updateData.description,
        );
      }
      this.description = updateData.description.trim();
    }

    // Validate order_no if provided
    if (updateData.order_no !== undefined) {
      if (!numberValidation(updateData.order_no, 1)) {
        throw new ValidationException(
          "Order number must be a positive integer",
          "order_no",
          updateData.order_no,
        );
      }
      this.order_no = updateData.order_no;
    }

    // Validate approver if provided
    if (updateData.approver !== undefined) {
      if (!numberValidation(updateData.approver, 1)) {
        throw new ValidationException(
          "Valid approver ID is required (must be >= 1)",
          "approver",
          updateData.approver,
        );
      }
      this.approver = updateData.approver;
    }

    // Validate owner if provided
    if (updateData.owner !== undefined) {
      if (!numberValidation(updateData.owner, 1)) {
        throw new ValidationException(
          "Valid owner ID is required (must be >= 1)",
          "owner",
          updateData.owner,
        );
      }
      this.owner = updateData.owner;
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

    // Update other fields if provided
    if (updateData.status !== undefined) {
      this.status = updateData.status;
    }

    if (updateData.risk_review !== undefined) {
      this.risk_review = updateData.risk_review;
    }

    if (updateData.due_date !== undefined) {
      this.due_date = updateData.due_date;
    }

    if (updateData.implementation_details !== undefined) {
      this.implementation_details = updateData.implementation_details;
    }

    if (updateData.evidence_description !== undefined) {
      this.evidence_description = updateData.evidence_description;
    }

    if (updateData.feedback_description !== undefined) {
      this.feedback_description = updateData.feedback_description;
    }

    if (updateData.evidence_files !== undefined) {
      this.evidence_files = updateData.evidence_files;
    }

    if (updateData.feedback_files !== undefined) {
      this.feedback_files = updateData.feedback_files;
    }
  }

  // Instance method to validate subcontrol data
  async validateSubcontrolData(): Promise<void> {
    if (!this.title || this.title.trim().length === 0) {
      throw new ValidationException("Subcontrol title is required", "title", this.title);
    }

    if (!this.description || this.description.trim().length === 0) {
      throw new ValidationException(
        "Subcontrol description is required",
        "description",
        this.description,
      );
    }

    if (!this.control_id || !numberValidation(this.control_id, 1)) {
      throw new ValidationException("Valid control_id is required", "control_id", this.control_id);
    }

    if (this.order_no !== undefined && !numberValidation(this.order_no, 1)) {
      throw new ValidationException(
        "Order number must be a positive integer",
        "order_no",
        this.order_no,
      );
    }

    if (this.approver !== undefined && !numberValidation(this.approver, 1)) {
      throw new ValidationException("Valid approver ID is required", "approver", this.approver);
    }

    if (this.owner !== undefined && !numberValidation(this.owner, 1)) {
      throw new ValidationException("Valid owner ID is required", "owner", this.owner);
    }

    if (this.reviewer !== undefined && !numberValidation(this.reviewer, 1)) {
      throw new ValidationException("Valid reviewer ID is required", "reviewer", this.reviewer);
    }
  }

  // Instance method to check if subcontrol is a demo subcontrol
  isDemoSubcontrol(): boolean {
    return this.is_demo ?? false;
  }

  // Instance method to check if subcontrol can be modified
  canBeModified(): boolean {
    if (this.isDemoSubcontrol()) {
      throw new BusinessLogicException(
        "Demo subcontrols cannot be modified",
        "DEMO_SUBCONTROL_RESTRICTION",
        { subcontrolId: this.id, controlId: this.control_id },
      );
    }
    return true;
  }

  // Instance method to check if subcontrol is completed
  isCompleted(): boolean {
    return this.status === "Done";
  }

  // Instance method to check if subcontrol is in progress
  isInProgress(): boolean {
    return this.status === "In progress";
  }

  // Instance method to check if subcontrol is waiting
  isWaiting(): boolean {
    return this.status === "Waiting" || !this.status;
  }

  // Instance method to check if subcontrol has acceptable risk
  hasAcceptableRisk(): boolean {
    return this.risk_review === "Acceptable risk";
  }

  // Instance method to check if subcontrol has residual risk
  hasResidualRisk(): boolean {
    return this.risk_review === "Residual risk";
  }

  // Instance method to check if subcontrol has unacceptable risk
  hasUnacceptableRisk(): boolean {
    return this.risk_review === "Unacceptable risk";
  }

  // Instance method to check if subcontrol is overdue
  isOverdue(): boolean {
    if (!this.due_date) return false;
    return new Date() > this.due_date && !this.isCompleted();
  }

  // Instance method to get subcontrol progress percentage
  getProgressPercentage(): number {
    if (this.isCompleted()) {
      return 100;
    }
    if (this.isInProgress()) {
      return 50;
    }
    return 0;
  }

  // Instance method to get subcontrol summary
  getSummary(): {
    id: number | undefined;
    title: string;
    status: string;
    progress: number;
    riskReview: string | undefined;
    isOverdue: boolean;
  } {
    return {
      id: this.id,
      title: this.title,
      status: this.status || "Waiting",
      progress: this.getProgressPercentage(),
      riskReview: this.risk_review,
      isOverdue: this.isOverdue(),
    };
  }

  // Instance method to convert to JSON
  toJSON(): any {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      order_no: this.order_no,
      status: this.status,
      approver: this.approver,
      risk_review: this.risk_review,
      owner: this.owner,
      reviewer: this.reviewer,
      due_date: this.due_date?.toISOString(),
      implementation_details: this.implementation_details,
      evidence_description: this.evidence_description,
      feedback_description: this.feedback_description,
      evidence_files: this.evidence_files,
      feedback_files: this.feedback_files,
      control_id: this.control_id,
      is_demo: this.is_demo,
      created_at: this.created_at?.toISOString(),
      progressPercentage: this.getProgressPercentage(),
      isOverdue: this.isOverdue(),
    };
  }

  // Static method to find subcontrol by ID with validation
  static async findByIdWithValidation(id: number): Promise<TestSubcontrolModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    if (id === 999) {
      throw new NotFoundException("Subcontrol not found", "Subcontrol", id);
    }

    return new TestSubcontrolModel({
      id,
      title: "Test Subcontrol",
      description: "Test Description",
      control_id: 1,
      status: "Waiting",
      is_demo: false,
      created_at: new Date(),
    });
  }

  // Static method to find subcontrols by control ID
  static async findByControlId(controlId: number): Promise<TestSubcontrolModel[]> {
    if (!numberValidation(controlId, 1)) {
      throw new ValidationException(
        "Valid control_id is required (must be >= 1)",
        "control_id",
        controlId,
      );
    }

    return [
      new TestSubcontrolModel({
        id: 1,
        title: "Subcontrol 1",
        control_id: controlId,
        status: "Waiting",
      }),
      new TestSubcontrolModel({
        id: 2,
        title: "Subcontrol 2",
        control_id: controlId,
        status: "Done",
      }),
    ];
  }

  // Static method to update subcontrol by ID
  static async updateSubcontrolById(
    id: number,
    updateData: any,
  ): Promise<[number, TestSubcontrolModel[]]> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return [
      1,
      [
        new TestSubcontrolModel({
          id,
          ...updateData,
        }),
      ],
    ];
  }

  // Static method to delete subcontrol by ID
  static async deleteSubcontrolById(id: number): Promise<number> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return 1;
  }
}

describe("SubcontrolModel", () => {
  const validSubcontrolData = {
    title: "Test Subcontrol",
    description: "Test Description",
    control_id: 1,
    order_no: 1,
    status: "Waiting" as const,
    approver: 1,
    risk_review: "Acceptable risk" as const,
    owner: 1,
    reviewer: 1,
    due_date: new Date("2024-12-31"),
    implementation_details: "Implementation details",
    evidence_description: "Evidence description",
    feedback_description: "Feedback description",
    evidence_files: [],
    feedback_files: [],
    is_demo: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewSubcontrol", () => {
    it("should create subcontrol with valid data", async () => {
      const subcontrol = await TestSubcontrolModel.createNewSubcontrol(
        validSubcontrolData.title,
        validSubcontrolData.description,
        validSubcontrolData.control_id,
        validSubcontrolData.order_no,
        validSubcontrolData.status,
        validSubcontrolData.approver,
        validSubcontrolData.risk_review,
        validSubcontrolData.owner,
        validSubcontrolData.reviewer,
        validSubcontrolData.due_date,
        validSubcontrolData.implementation_details,
        validSubcontrolData.evidence_description,
        validSubcontrolData.feedback_description,
        validSubcontrolData.evidence_files,
        validSubcontrolData.feedback_files,
        validSubcontrolData.is_demo,
      );

      expect(subcontrol).toBeInstanceOf(TestSubcontrolModel);
      expect(subcontrol.title).toBe("Test Subcontrol");
      expect(subcontrol.control_id).toBe(1);
      expect(subcontrol.status).toBe("Waiting");
      expect(subcontrol.is_demo).toBe(false);
      expect(subcontrol.created_at).toBeInstanceOf(Date);
    });

    it("should throw ValidationException for empty title", async () => {
      await expect(
        TestSubcontrolModel.createNewSubcontrol(
          "",
          validSubcontrolData.description,
          validSubcontrolData.control_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty description", async () => {
      await expect(
        TestSubcontrolModel.createNewSubcontrol(
          validSubcontrolData.title,
          "",
          validSubcontrolData.control_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid control_id", async () => {
      await expect(
        TestSubcontrolModel.createNewSubcontrol(
          validSubcontrolData.title,
          validSubcontrolData.description,
          0,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid order_no", async () => {
      await expect(
        TestSubcontrolModel.createNewSubcontrol(
          validSubcontrolData.title,
          validSubcontrolData.description,
          validSubcontrolData.control_id,
          0,
        ),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("updateSubcontrol", () => {
    it("should update subcontrol successfully", async () => {
      const subcontrol = new TestSubcontrolModel(validSubcontrolData);

      await subcontrol.updateSubcontrol({
        title: "Updated Title",
        status: "In progress",
      });

      expect(subcontrol.title).toBe("Updated Title");
      expect(subcontrol.status).toBe("In progress");
    });

    it("should throw ValidationException for empty title update", async () => {
      const subcontrol = new TestSubcontrolModel(validSubcontrolData);

      await expect(subcontrol.updateSubcontrol({ title: "" })).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid approver ID", async () => {
      const subcontrol = new TestSubcontrolModel(validSubcontrolData);

      await expect(subcontrol.updateSubcontrol({ approver: 0 })).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("validateSubcontrolData", () => {
    it("should pass validation with valid data", async () => {
      const subcontrol = new TestSubcontrolModel(validSubcontrolData);

      await expect(subcontrol.validateSubcontrolData()).resolves.not.toThrow();
    });

    it("should throw ValidationException for empty title", async () => {
      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        title: "",
      });

      await expect(subcontrol.validateSubcontrolData()).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid control_id", async () => {
      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        control_id: 0,
      });

      await expect(subcontrol.validateSubcontrolData()).rejects.toThrow(ValidationException);
    });
  });

  describe("canBeModified", () => {
    it("should return true for regular subcontrol", () => {
      const subcontrol = new TestSubcontrolModel(validSubcontrolData);
      expect(subcontrol.canBeModified()).toBe(true);
    });

    it("should throw BusinessLogicException for demo subcontrol", () => {
      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        is_demo: true,
      });

      expect(() => subcontrol.canBeModified()).toThrow(BusinessLogicException);
    });
  });

  describe("status checks", () => {
    it("should correctly identify completed subcontrol", () => {
      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        status: "Done",
      });
      expect(subcontrol.isCompleted()).toBe(true);
      expect(subcontrol.isInProgress()).toBe(false);
      expect(subcontrol.isWaiting()).toBe(false);
    });

    it("should correctly identify in-progress subcontrol", () => {
      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        status: "In progress",
      });
      expect(subcontrol.isCompleted()).toBe(false);
      expect(subcontrol.isInProgress()).toBe(true);
      expect(subcontrol.isWaiting()).toBe(false);
    });

    it("should correctly identify waiting subcontrol", () => {
      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        status: "Waiting",
      });
      expect(subcontrol.isCompleted()).toBe(false);
      expect(subcontrol.isInProgress()).toBe(false);
      expect(subcontrol.isWaiting()).toBe(true);
    });
  });

  describe("risk review checks", () => {
    it("should correctly identify acceptable risk", () => {
      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        risk_review: "Acceptable risk",
      });
      expect(subcontrol.hasAcceptableRisk()).toBe(true);
      expect(subcontrol.hasResidualRisk()).toBe(false);
      expect(subcontrol.hasUnacceptableRisk()).toBe(false);
    });

    it("should correctly identify residual risk", () => {
      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        risk_review: "Residual risk",
      });
      expect(subcontrol.hasAcceptableRisk()).toBe(false);
      expect(subcontrol.hasResidualRisk()).toBe(true);
      expect(subcontrol.hasUnacceptableRisk()).toBe(false);
    });

    it("should correctly identify unacceptable risk", () => {
      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        risk_review: "Unacceptable risk",
      });
      expect(subcontrol.hasAcceptableRisk()).toBe(false);
      expect(subcontrol.hasResidualRisk()).toBe(false);
      expect(subcontrol.hasUnacceptableRisk()).toBe(true);
    });
  });

  describe("isOverdue", () => {
    it("should return true for overdue subcontrol", () => {
      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        due_date: new Date("2020-01-01"),
        status: "In progress",
      });
      expect(subcontrol.isOverdue()).toBe(true);
    });

    it("should return false for completed subcontrol even if overdue", () => {
      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        due_date: new Date("2020-01-01"),
        status: "Done",
      });
      expect(subcontrol.isOverdue()).toBe(false);
    });

    it("should return false for subcontrol without due date", () => {
      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        due_date: undefined,
      });
      expect(subcontrol.isOverdue()).toBe(false);
    });
  });

  describe("getProgressPercentage", () => {
    it("should return 100 for completed subcontrol", () => {
      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        status: "Done",
      });
      expect(subcontrol.getProgressPercentage()).toBe(100);
    });

    it("should return 50 for in-progress subcontrol", () => {
      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        status: "In progress",
      });
      expect(subcontrol.getProgressPercentage()).toBe(50);
    });

    it("should return 0 for waiting subcontrol", () => {
      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        status: "Waiting",
      });
      expect(subcontrol.getProgressPercentage()).toBe(0);
    });
  });

  describe("getSummary", () => {
    it("should return correct summary", () => {
      // Use a date 1 year in the future to ensure it's never overdue
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        id: 1,
        status: "In progress",
        risk_review: "Acceptable risk",
        due_date: futureDate,
      });

      const summary = subcontrol.getSummary();

      expect(summary).toEqual({
        id: 1,
        title: "Test Subcontrol",
        status: "In progress",
        progress: 50,
        riskReview: "Acceptable risk",
        isOverdue: false,
      });
    });
  });

  describe("toJSON", () => {
    it("should return formatted JSON", () => {
      // Use a date 1 year in the future to ensure it's never overdue
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      futureDate.setHours(0, 0, 0, 0);

      const subcontrol = new TestSubcontrolModel({
        ...validSubcontrolData,
        id: 1,
        created_at: new Date("2023-01-01T00:00:00.000Z"),
        due_date: futureDate,
      });

      const result = subcontrol.toJSON();

      expect(result).toHaveProperty("id", 1);
      expect(result).toHaveProperty("title", "Test Subcontrol");
      expect(result).toHaveProperty("created_at", "2023-01-01T00:00:00.000Z");
      expect(result).toHaveProperty("due_date");
      expect(result).toHaveProperty("progressPercentage", 0);
      expect(result).toHaveProperty("isOverdue", false);
    });
  });

  describe("findByIdWithValidation", () => {
    it("should find subcontrol by valid ID", async () => {
      const subcontrol = await TestSubcontrolModel.findByIdWithValidation(1);

      expect(subcontrol).toBeInstanceOf(TestSubcontrolModel);
      expect(subcontrol.id).toBe(1);
      expect(subcontrol.title).toBe("Test Subcontrol");
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestSubcontrolModel.findByIdWithValidation(0)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw NotFoundException for non-existent ID", async () => {
      await expect(TestSubcontrolModel.findByIdWithValidation(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("findByControlId", () => {
    it("should find subcontrols by control ID", async () => {
      const subcontrols = await TestSubcontrolModel.findByControlId(1);

      expect(subcontrols).toHaveLength(2);
      expect(subcontrols[0].control_id).toBe(1);
      expect(subcontrols[1].control_id).toBe(1);
    });

    it("should throw ValidationException for invalid control_id", async () => {
      await expect(TestSubcontrolModel.findByControlId(0)).rejects.toThrow(ValidationException);
    });
  });

  describe("updateSubcontrolById", () => {
    it("should update subcontrol by ID", async () => {
      const [affected, updated] = await TestSubcontrolModel.updateSubcontrolById(1, {
        title: "Updated Title",
      });

      expect(affected).toBe(1);
      expect(updated).toHaveLength(1);
      expect(updated[0].title).toBe("Updated Title");
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(
        TestSubcontrolModel.updateSubcontrolById(0, { title: "Updated" }),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("deleteSubcontrolById", () => {
    it("should delete subcontrol by ID", async () => {
      const deleted = await TestSubcontrolModel.deleteSubcontrolById(1);

      expect(deleted).toBe(1);
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestSubcontrolModel.deleteSubcontrolById(0)).rejects.toThrow(
        ValidationException,
      );
    });
  });
});
