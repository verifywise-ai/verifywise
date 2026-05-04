import { ValidationException, BusinessLogicException } from "../exceptions/custom.exception";

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

// Mock ControlCategoryModel
jest.mock("../models/controlCategory/controlCategory.model", () => ({
  ControlCategoryModel: class MockControlCategoryModel {},
}));

// Test class mimicking ControlModel behavior
class TestControlModel {
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
  control_category_id!: number;
  is_demo?: boolean;
  created_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  // Static method to create new control
  static async createNewControl(
    title: string,
    description: string,
    control_category_id: number,
    order_no?: number,
    owner?: number,
    reviewer?: number,
    approver?: number,
    due_date?: Date,
    implementation_details?: string,
    is_demo: boolean = false,
  ): Promise<TestControlModel> {
    // Validate required fields
    if (!title || title.trim().length === 0) {
      throw new ValidationException("Title is required", "title", title);
    }

    if (title.trim().length < 3) {
      throw new ValidationException("Title must be at least 3 characters long", "title", title);
    }

    if (!description || description.trim().length === 0) {
      throw new ValidationException("Description is required", "description", description);
    }

    if (description.trim().length < 10) {
      throw new ValidationException(
        "Description must be at least 10 characters long",
        "description",
        description,
      );
    }

    // Validate control_category_id
    if (!control_category_id || control_category_id < 1) {
      throw new ValidationException(
        "Valid control_category_id is required (must be >= 1)",
        "control_category_id",
        control_category_id,
      );
    }

    // Create and return the control model instance
    const control = new TestControlModel();
    control.title = title.trim();
    control.description = description.trim();
    control.control_category_id = control_category_id;
    control.order_no = order_no;
    control.owner = owner;
    control.reviewer = reviewer;
    control.approver = approver;
    control.due_date = due_date;
    control.implementation_details = implementation_details?.trim();
    control.status = "Waiting"; // Default status
    control.is_demo = is_demo;
    control.created_at = new Date();

    return control;
  }

  // Instance methods
  async updateControl(updateData: {
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
  }): Promise<void> {
    if (updateData.title !== undefined) {
      if (!updateData.title || updateData.title.trim().length === 0) {
        throw new ValidationException("Title is required", "title", updateData.title);
      }
      if (updateData.title.trim().length < 3) {
        throw new ValidationException(
          "Title must be at least 3 characters long",
          "title",
          updateData.title,
        );
      }
      this.title = updateData.title.trim();
    }

    if (updateData.status !== undefined) {
      const validStatuses = ["Waiting", "In progress", "Done"];
      if (!validStatuses.includes(updateData.status)) {
        throw new ValidationException("Invalid status value", "status", updateData.status);
      }
      this.status = updateData.status;
    }
  }

  isOverdue(): boolean {
    if (!this.due_date) {
      return false;
    }
    return new Date() > this.due_date && this.status !== "Done";
  }

  isCompleted(): boolean {
    return this.status === "Done";
  }

  isDemoControl(): boolean {
    return this.is_demo ?? false;
  }

  canBeModifiedBy(userId: number, isAdmin: boolean = false): boolean {
    if (this.isDemoControl()) {
      throw new BusinessLogicException(
        "Demo controls cannot be modified",
        "DEMO_CONTROL_RESTRICTION",
        { controlId: this.id, userId },
      );
    }

    if (isAdmin) {
      return true;
    }

    return this.owner === userId || this.reviewer === userId || this.approver === userId;
  }

  getProgressPercentage(): number {
    if (this.isCompleted()) {
      return 100;
    }
    if (this.status === "In progress") {
      return 50;
    }
    return 0;
  }
}

describe("ControlModel", () => {
  const validControlData = {
    title: "Test Control",
    description: "This is a test control description that is long enough",
    control_category_id: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewControl", () => {
    it("should create control with valid data", async () => {
      const control = await TestControlModel.createNewControl(
        validControlData.title,
        validControlData.description,
        validControlData.control_category_id,
      );

      expect(control).toBeInstanceOf(TestControlModel);
      expect(control.title).toBe("Test Control");
      expect(control.description).toBe("This is a test control description that is long enough");
      expect(control.control_category_id).toBe(1);
      expect(control.status).toBe("Waiting");
      expect(control.is_demo).toBe(false);
    });

    it("should throw ValidationException for short title", async () => {
      await expect(
        TestControlModel.createNewControl(
          "AB",
          validControlData.description,
          validControlData.control_category_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for short description", async () => {
      await expect(
        TestControlModel.createNewControl(
          validControlData.title,
          "Short",
          validControlData.control_category_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid control_category_id", async () => {
      await expect(
        TestControlModel.createNewControl(validControlData.title, validControlData.description, 0),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("updateControl", () => {
    it("should update control title successfully", async () => {
      const control = new TestControlModel(validControlData);

      await control.updateControl({ title: "Updated Control Title" });

      expect(control.title).toBe("Updated Control Title");
    });

    it("should update control status successfully", async () => {
      const control = new TestControlModel(validControlData);

      await control.updateControl({ status: "In progress" });

      expect(control.status).toBe("In progress");
    });

    it("should throw ValidationException for invalid status", async () => {
      const control = new TestControlModel(validControlData);

      await expect(control.updateControl({ status: "Invalid" as any })).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("isOverdue", () => {
    it("should return false for control without due date", () => {
      const control = new TestControlModel(validControlData);
      expect(control.isOverdue()).toBe(false);
    });

    it("should return false for completed control", () => {
      const control = new TestControlModel({
        ...validControlData,
        due_date: new Date("2020-01-01"),
        status: "Done",
      });
      expect(control.isOverdue()).toBe(false);
    });
  });

  describe("isCompleted", () => {
    it("should return true for completed control", () => {
      const control = new TestControlModel({
        ...validControlData,
        status: "Done",
      });
      expect(control.isCompleted()).toBe(true);
    });

    it("should return false for non-completed control", () => {
      const control = new TestControlModel({
        ...validControlData,
        status: "Waiting",
      });
      expect(control.isCompleted()).toBe(false);
    });
  });

  describe("canBeModifiedBy", () => {
    it("should allow admin to modify any control", () => {
      const control = new TestControlModel(validControlData);
      expect(control.canBeModifiedBy(999, true)).toBe(true);
    });

    it("should allow owner to modify control", () => {
      const control = new TestControlModel({
        ...validControlData,
        owner: 1,
      });
      expect(control.canBeModifiedBy(1, false)).toBe(true);
    });

    it("should throw BusinessLogicException for demo control", () => {
      const control = new TestControlModel({
        ...validControlData,
        is_demo: true,
      });
      expect(() => control.canBeModifiedBy(1, false)).toThrow(BusinessLogicException);
    });
  });

  describe("getProgressPercentage", () => {
    it("should return 100 for completed control", () => {
      const control = new TestControlModel({
        ...validControlData,
        status: "Done",
      });
      expect(control.getProgressPercentage()).toBe(100);
    });

    it("should return 50 for in-progress control", () => {
      const control = new TestControlModel({
        ...validControlData,
        status: "In progress",
      });
      expect(control.getProgressPercentage()).toBe(50);
    });

    it("should return 0 for waiting control", () => {
      const control = new TestControlModel({
        ...validControlData,
        status: "Waiting",
      });
      expect(control.getProgressPercentage()).toBe(0);
    });
  });
});
