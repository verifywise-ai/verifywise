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
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

// Mock ProjectModel
jest.mock("../models/project/project.model", () => ({
  ProjectModel: class MockProjectModel {},
}));

// Test class mimicking ControlCategoryModel behavior
class TestControlCategoryModel {
  id?: number;
  project_id!: number;
  title!: string;
  order_no?: number;
  is_demo?: boolean;
  created_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  // Static method to create new control category
  static async createNewControlCategory(
    projectId: number,
    title: string,
    orderNo?: number,
  ): Promise<TestControlCategoryModel> {
    // Validate project_id
    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    // Validate title
    if (!title || title.trim().length === 0) {
      throw new ValidationException("Title is required", "title", title);
    }

    if (title.trim().length < 2) {
      throw new ValidationException("Title must be at least 2 characters long", "title", title);
    }

    if (title.trim().length > 255) {
      throw new ValidationException("Title must not exceed 255 characters", "title", title);
    }

    // Validate order_no if provided
    if (orderNo !== undefined) {
      if (!numberValidation(orderNo, 0)) {
        throw new ValidationException(
          "Order number must be a non-negative integer",
          "order_no",
          orderNo,
        );
      }
    }

    // Create and return the control category model instance
    const controlCategory = new TestControlCategoryModel();
    controlCategory.project_id = projectId;
    controlCategory.title = title.trim();
    controlCategory.order_no = orderNo || 0;
    controlCategory.created_at = new Date();
    controlCategory.is_demo = false;

    return controlCategory;
  }

  // Instance method to update control category
  async updateControlCategory(updateData: { title?: string; order_no?: number }): Promise<void> {
    // Validate title if provided
    if (updateData.title !== undefined) {
      if (!updateData.title || updateData.title.trim().length === 0) {
        throw new ValidationException("Title is required", "title", updateData.title);
      }

      if (updateData.title.trim().length < 2) {
        throw new ValidationException(
          "Title must be at least 2 characters long",
          "title",
          updateData.title,
        );
      }

      if (updateData.title.trim().length > 255) {
        throw new ValidationException(
          "Title must not exceed 255 characters",
          "title",
          updateData.title,
        );
      }

      this.title = updateData.title.trim();
    }

    // Validate order_no if provided
    if (updateData.order_no !== undefined) {
      if (!numberValidation(updateData.order_no, 0)) {
        throw new ValidationException(
          "Order number must be a non-negative integer",
          "order_no",
          updateData.order_no,
        );
      }
      this.order_no = updateData.order_no;
    }
  }

  // Instance method to validate control category data
  async validateControlCategoryData(): Promise<void> {
    if (!this.project_id || !numberValidation(this.project_id, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        this.project_id,
      );
    }

    if (!this.title || this.title.trim().length === 0) {
      throw new ValidationException("Title is required", "title", this.title);
    }

    if (this.title.trim().length < 2) {
      throw new ValidationException(
        "Title must be at least 2 characters long",
        "title",
        this.title,
      );
    }

    if (this.title.trim().length > 255) {
      throw new ValidationException("Title must not exceed 255 characters", "title", this.title);
    }

    if (this.order_no !== undefined && !numberValidation(this.order_no, 0)) {
      throw new ValidationException(
        "Order number must be a non-negative integer",
        "order_no",
        this.order_no,
      );
    }
  }

  // Instance method to check if control category is a demo category
  isDemoCategory(): boolean {
    return this.is_demo ?? false;
  }

  // Instance method to prevent demo categories from being modified
  canBeModified(): boolean {
    if (this.isDemoCategory()) {
      throw new BusinessLogicException(
        "Demo control categories cannot be modified",
        "DEMO_CATEGORY_RESTRICTION",
        { categoryId: this.id, categoryTitle: this.title },
      );
    }
    return true;
  }

  // Instance method to get control category data without sensitive information
  toSafeJSON(): any {
    return {
      id: this.id,
      project_id: this.project_id,
      title: this.title,
      order_no: this.order_no,
      created_at: this.created_at?.toISOString(),
      is_demo: this.is_demo,
    };
  }

  // Instance method to get display title
  getDisplayTitle(): string {
    if (this.order_no !== undefined && this.order_no > 0) {
      return `${this.order_no}. ${this.title}`;
    }
    return this.title;
  }

  // Instance method to check if control category is active
  isActive(): boolean {
    return !this.isDemoCategory();
  }

  // Static method to create control category from JSON data
  static fromJSON(json: any): TestControlCategoryModel {
    return new TestControlCategoryModel(json);
  }

  // Instance method to convert control category model to JSON representation
  toJSON(): any {
    return {
      id: this.id,
      project_id: this.project_id,
      title: this.title,
      order_no: this.order_no,
      created_at: this.created_at?.toISOString(),
      is_demo: this.is_demo,
    };
  }

  // Static method to find control category by ID with validation
  static async findByIdWithValidation(id: number): Promise<TestControlCategoryModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    // Mock finding a control category
    if (id === 999) {
      throw new NotFoundException("Control category not found", "ControlCategory", id);
    }

    return new TestControlCategoryModel({
      id,
      project_id: 1,
      title: "Test Category",
      order_no: 1,
      is_demo: false,
      created_at: new Date(),
    });
  }

  // Static method to find control categories by project ID
  static async findByProjectId(projectId: number): Promise<TestControlCategoryModel[]> {
    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    return [
      new TestControlCategoryModel({
        id: 1,
        project_id: projectId,
        title: "Category 1",
        order_no: 1,
        is_demo: false,
        created_at: new Date(),
      }),
      new TestControlCategoryModel({
        id: 2,
        project_id: projectId,
        title: "Category 2",
        order_no: 2,
        is_demo: true,
        created_at: new Date(),
      }),
    ];
  }

  // Static method to update control category
  static async updateControlCategoryById(
    id: number,
    updateData: any,
  ): Promise<[number, TestControlCategoryModel[]]> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return [
      1,
      [
        new TestControlCategoryModel({
          id,
          project_id: 1,
          title: updateData.title || "Updated Category",
          order_no: updateData.order_no || 1,
          is_demo: false,
          created_at: new Date(),
        }),
      ],
    ];
  }

  // Static method to delete control category
  static async deleteControlCategoryById(id: number): Promise<number> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return 1;
  }
}

describe("ControlCategoryModel", () => {
  const validCategoryData = {
    project_id: 1,
    title: "Test Category",
    order_no: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewControlCategory", () => {
    it("should create control category with valid data", async () => {
      const category = await TestControlCategoryModel.createNewControlCategory(
        validCategoryData.project_id,
        validCategoryData.title,
        validCategoryData.order_no,
      );

      expect(category).toBeInstanceOf(TestControlCategoryModel);
      expect(category.project_id).toBe(1);
      expect(category.title).toBe("Test Category");
      expect(category.order_no).toBe(1);
      expect(category.is_demo).toBe(false);
      expect(category.created_at).toBeInstanceOf(Date);
    });

    it("should create control category without order_no", async () => {
      const category = await TestControlCategoryModel.createNewControlCategory(
        validCategoryData.project_id,
        validCategoryData.title,
      );

      expect(category.order_no).toBe(0);
    });

    it("should throw ValidationException for invalid project_id", async () => {
      await expect(
        TestControlCategoryModel.createNewControlCategory(0, validCategoryData.title),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty title", async () => {
      await expect(
        TestControlCategoryModel.createNewControlCategory(validCategoryData.project_id, ""),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for short title", async () => {
      await expect(
        TestControlCategoryModel.createNewControlCategory(validCategoryData.project_id, "A"),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for long title", async () => {
      const longTitle = "A".repeat(256);
      await expect(
        TestControlCategoryModel.createNewControlCategory(validCategoryData.project_id, longTitle),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for negative order_no", async () => {
      await expect(
        TestControlCategoryModel.createNewControlCategory(
          validCategoryData.project_id,
          validCategoryData.title,
          -1,
        ),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("updateControlCategory", () => {
    it("should update control category title successfully", async () => {
      const category = new TestControlCategoryModel(validCategoryData);

      await category.updateControlCategory({ title: "Updated Category" });

      expect(category.title).toBe("Updated Category");
    });

    it("should update control category order_no successfully", async () => {
      const category = new TestControlCategoryModel(validCategoryData);

      await category.updateControlCategory({ order_no: 5 });

      expect(category.order_no).toBe(5);
    });

    it("should throw ValidationException for empty title update", async () => {
      const category = new TestControlCategoryModel(validCategoryData);

      await expect(category.updateControlCategory({ title: "" })).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw ValidationException for negative order_no update", async () => {
      const category = new TestControlCategoryModel(validCategoryData);

      await expect(category.updateControlCategory({ order_no: -1 })).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("validateControlCategoryData", () => {
    it("should pass validation with valid data", async () => {
      const category = new TestControlCategoryModel(validCategoryData);

      await expect(category.validateControlCategoryData()).resolves.not.toThrow();
    });

    it("should throw ValidationException for invalid project_id", async () => {
      const category = new TestControlCategoryModel({
        ...validCategoryData,
        project_id: 0,
      });

      await expect(category.validateControlCategoryData()).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty title", async () => {
      const category = new TestControlCategoryModel({
        ...validCategoryData,
        title: "",
      });

      await expect(category.validateControlCategoryData()).rejects.toThrow(ValidationException);
    });
  });

  describe("isDemoCategory", () => {
    it("should return true for demo category", () => {
      const category = new TestControlCategoryModel({
        ...validCategoryData,
        is_demo: true,
      });

      expect(category.isDemoCategory()).toBe(true);
    });

    it("should return false for regular category", () => {
      const category = new TestControlCategoryModel(validCategoryData);

      expect(category.isDemoCategory()).toBe(false);
    });

    it("should return false when is_demo is undefined", () => {
      const category = new TestControlCategoryModel({
        ...validCategoryData,
        is_demo: undefined,
      });

      expect(category.isDemoCategory()).toBe(false);
    });
  });

  describe("canBeModified", () => {
    it("should return true for regular category", () => {
      const category = new TestControlCategoryModel(validCategoryData);

      expect(category.canBeModified()).toBe(true);
    });

    it("should throw BusinessLogicException for demo category", () => {
      const category = new TestControlCategoryModel({
        ...validCategoryData,
        is_demo: true,
      });

      expect(() => category.canBeModified()).toThrow(BusinessLogicException);
    });
  });

  describe("toSafeJSON", () => {
    it("should return safe JSON representation", () => {
      const category = new TestControlCategoryModel({
        id: 1,
        project_id: 1,
        title: "Test Category",
        order_no: 1,
        is_demo: false,
        created_at: new Date("2024-01-01T00:00:00.000Z"),
      });

      const result = category.toSafeJSON();

      expect(result).toEqual({
        id: 1,
        project_id: 1,
        title: "Test Category",
        order_no: 1,
        created_at: "2024-01-01T00:00:00.000Z",
        is_demo: false,
      });
    });
  });

  describe("getDisplayTitle", () => {
    it("should return title with order number when order_no > 0", () => {
      const category = new TestControlCategoryModel({
        ...validCategoryData,
        order_no: 3,
      });

      expect(category.getDisplayTitle()).toBe("3. Test Category");
    });

    it("should return title without order number when order_no is 0", () => {
      const category = new TestControlCategoryModel({
        ...validCategoryData,
        order_no: 0,
      });

      expect(category.getDisplayTitle()).toBe("Test Category");
    });

    it("should return title without order number when order_no is undefined", () => {
      const category = new TestControlCategoryModel({
        ...validCategoryData,
        order_no: undefined,
      });

      expect(category.getDisplayTitle()).toBe("Test Category");
    });
  });

  describe("isActive", () => {
    it("should return true for regular category", () => {
      const category = new TestControlCategoryModel(validCategoryData);

      expect(category.isActive()).toBe(true);
    });

    it("should return false for demo category", () => {
      const category = new TestControlCategoryModel({
        ...validCategoryData,
        is_demo: true,
      });

      expect(category.isActive()).toBe(false);
    });
  });

  describe("fromJSON", () => {
    it("should create control category from JSON", () => {
      const json = {
        id: 1,
        project_id: 1,
        title: "Test Category",
        order_no: 1,
        is_demo: false,
      };

      const category = TestControlCategoryModel.fromJSON(json);

      expect(category).toBeInstanceOf(TestControlCategoryModel);
      expect(category.id).toBe(1);
      expect(category.title).toBe("Test Category");
    });
  });

  describe("toJSON", () => {
    it("should return JSON representation", () => {
      const category = new TestControlCategoryModel({
        id: 1,
        project_id: 1,
        title: "Test Category",
        order_no: 1,
        is_demo: false,
        created_at: new Date("2024-01-01T00:00:00.000Z"),
      });

      const result = category.toJSON();

      expect(result).toEqual({
        id: 1,
        project_id: 1,
        title: "Test Category",
        order_no: 1,
        created_at: "2024-01-01T00:00:00.000Z",
        is_demo: false,
      });
    });
  });

  describe("findByIdWithValidation", () => {
    it("should find control category by valid ID", async () => {
      const category = await TestControlCategoryModel.findByIdWithValidation(1);

      expect(category).toBeInstanceOf(TestControlCategoryModel);
      expect(category.id).toBe(1);
      expect(category.title).toBe("Test Category");
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestControlCategoryModel.findByIdWithValidation(0)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw NotFoundException for non-existent ID", async () => {
      await expect(TestControlCategoryModel.findByIdWithValidation(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("findByProjectId", () => {
    it("should find control categories for project", async () => {
      const categories = await TestControlCategoryModel.findByProjectId(1);

      expect(categories).toHaveLength(2);
      expect(categories[0].project_id).toBe(1);
      expect(categories[1].project_id).toBe(1);
    });

    it("should throw ValidationException for invalid project_id", async () => {
      await expect(TestControlCategoryModel.findByProjectId(0)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("updateControlCategoryById", () => {
    it("should update control category successfully", async () => {
      const [affected, updated] = await TestControlCategoryModel.updateControlCategoryById(1, {
        title: "Updated Category",
      });

      expect(affected).toBe(1);
      expect(updated[0].title).toBe("Updated Category");
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(
        TestControlCategoryModel.updateControlCategoryById(0, {
          title: "Updated",
        }),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("deleteControlCategoryById", () => {
    it("should delete control category successfully", async () => {
      const deleted = await TestControlCategoryModel.deleteControlCategoryById(1);

      expect(deleted).toBe(1);
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestControlCategoryModel.deleteControlCategoryById(0)).rejects.toThrow(
        ValidationException,
      );
    });
  });
});
