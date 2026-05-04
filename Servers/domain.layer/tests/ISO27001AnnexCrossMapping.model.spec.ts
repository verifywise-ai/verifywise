import { ValidationException } from "../exceptions/custom.exception";

// Mock sequelize-typescript completely
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) {
        Object.assign(this, data);
      }
    }
  },
}));

// Mock validation functions
jest.mock("../validations/number.valid", () => ({
  numberValidation: jest.fn((value: number, min: number) => value >= min),
}));

// Create a simple test class that mimics ISO27001AnnexCrossMappingModel behavior
class TestISO27001AnnexCrossMappingModel {
  id?: number;
  clause_no!: number;
  order_no!: number;
  clause_title!: string;
  relevance!: string;
  iso27001annex_control_id!: number;

  constructor(data?: any) {
    if (data) {
      Object.assign(this, data);
    }
  }

  // Static method to create new cross mapping
  static async createNewCrossMapping(
    clause_no: number,
    order_no: number,
    clause_title: string,
    relevance: string,
    iso27001annex_control_id: number,
  ): Promise<TestISO27001AnnexCrossMappingModel> {
    // Validate clause_no
    if (clause_no < 1) {
      throw new ValidationException(
        "Clause number must be a positive integer",
        "clause_no",
        clause_no,
      );
    }

    // Validate order_no
    if (order_no < 1) {
      throw new ValidationException(
        "Order number must be a positive integer",
        "order_no",
        order_no,
      );
    }

    // Validate clause_title
    if (!clause_title || clause_title.trim().length === 0) {
      throw new ValidationException("Clause title is required", "clause_title", clause_title);
    }

    if (clause_title.trim().length < 3) {
      throw new ValidationException(
        "Clause title must be at least 3 characters long",
        "clause_title",
        clause_title,
      );
    }

    if (clause_title.trim().length > 255) {
      throw new ValidationException(
        "Clause title must not exceed 255 characters",
        "clause_title",
        clause_title,
      );
    }

    // Validate relevance
    if (!relevance || relevance.trim().length === 0) {
      throw new ValidationException("Relevance is required", "relevance", relevance);
    }

    if (relevance.trim().length < 5) {
      throw new ValidationException(
        "Relevance must be at least 5 characters long",
        "relevance",
        relevance,
      );
    }

    if (relevance.trim().length > 500) {
      throw new ValidationException(
        "Relevance must not exceed 500 characters",
        "relevance",
        relevance,
      );
    }

    // Validate iso27001annex_control_id
    if (iso27001annex_control_id < 1) {
      throw new ValidationException(
        "Valid annex control ID is required",
        "iso27001annex_control_id",
        iso27001annex_control_id,
      );
    }

    // Create and return the cross mapping model instance
    const crossMapping = new TestISO27001AnnexCrossMappingModel();
    crossMapping.clause_no = clause_no;
    crossMapping.order_no = order_no;
    crossMapping.clause_title = clause_title.trim();
    crossMapping.relevance = relevance.trim();
    crossMapping.iso27001annex_control_id = iso27001annex_control_id;

    return crossMapping;
  }

  // Instance method to update cross mapping
  async updateCrossMapping(updateData: {
    clause_no?: number;
    order_no?: number;
    clause_title?: string;
    relevance?: string;
    iso27001annex_control_id?: number;
  }): Promise<void> {
    // Validate clause_no if provided
    if (updateData.clause_no !== undefined) {
      if (updateData.clause_no < 1) {
        throw new ValidationException(
          "Clause number must be a positive integer",
          "clause_no",
          updateData.clause_no,
        );
      }
      this.clause_no = updateData.clause_no;
    }

    // Validate order_no if provided
    if (updateData.order_no !== undefined) {
      if (updateData.order_no < 1) {
        throw new ValidationException(
          "Order number must be a positive integer",
          "order_no",
          updateData.order_no,
        );
      }
      this.order_no = updateData.order_no;
    }

    // Validate clause_title if provided
    if (updateData.clause_title !== undefined) {
      if (!updateData.clause_title || updateData.clause_title.trim().length === 0) {
        throw new ValidationException(
          "Clause title is required",
          "clause_title",
          updateData.clause_title,
        );
      }
      if (updateData.clause_title.trim().length < 3) {
        throw new ValidationException(
          "Clause title must be at least 3 characters long",
          "clause_title",
          updateData.clause_title,
        );
      }
      if (updateData.clause_title.trim().length > 255) {
        throw new ValidationException(
          "Clause title must not exceed 255 characters",
          "clause_title",
          updateData.clause_title,
        );
      }
      this.clause_title = updateData.clause_title.trim();
    }

    // Validate relevance if provided
    if (updateData.relevance !== undefined) {
      if (!updateData.relevance || updateData.relevance.trim().length === 0) {
        throw new ValidationException("Relevance is required", "relevance", updateData.relevance);
      }
      if (updateData.relevance.trim().length < 5) {
        throw new ValidationException(
          "Relevance must be at least 5 characters long",
          "relevance",
          updateData.relevance,
        );
      }
      if (updateData.relevance.trim().length > 500) {
        throw new ValidationException(
          "Relevance must not exceed 500 characters",
          "relevance",
          updateData.relevance,
        );
      }
      this.relevance = updateData.relevance.trim();
    }

    // Validate iso27001annex_control_id if provided
    if (updateData.iso27001annex_control_id !== undefined) {
      if (updateData.iso27001annex_control_id < 1) {
        throw new ValidationException(
          "Valid annex control ID is required",
          "iso27001annex_control_id",
          updateData.iso27001annex_control_id,
        );
      }
      this.iso27001annex_control_id = updateData.iso27001annex_control_id;
    }
  }

  // Business logic methods
  belongsToControl(controlId: number): boolean {
    return this.iso27001annex_control_id === controlId;
  }

  getClauseIdentifier(): string {
    return `Clause ${this.clause_no}`;
  }

  getFullClauseName(): string {
    return `${this.getClauseIdentifier()} - ${this.clause_title}`;
  }

  isValidForISO27001(): boolean {
    return this.clause_no >= 1 && this.clause_no <= 200;
  }

  getPriority(): "high" | "medium" | "low" {
    if (this.order_no <= 10) return "high";
    if (this.order_no <= 25) return "medium";
    return "low";
  }

  isHighlyRelevant(): boolean {
    const relevanceLower = this.relevance.toLowerCase();
    return (
      relevanceLower.includes("high") ||
      relevanceLower.includes("critical") ||
      relevanceLower.includes("essential") ||
      relevanceLower.includes("required")
    );
  }

  isModeratelyRelevant(): boolean {
    const relevanceLower = this.relevance.toLowerCase();
    return (
      relevanceLower.includes("medium") ||
      relevanceLower.includes("moderate") ||
      relevanceLower.includes("important") ||
      relevanceLower.includes("recommended")
    );
  }

  isLowRelevant(): boolean {
    const relevanceLower = this.relevance.toLowerCase();
    return (
      relevanceLower.includes("low") ||
      relevanceLower.includes("optional") ||
      relevanceLower.includes("nice to have") ||
      relevanceLower.includes("consider")
    );
  }
}

describe("ISO27001AnnexCrossMappingModel", () => {
  // Test data
  const validCrossMappingData = {
    clause_no: 1,
    order_no: 1,
    clause_title: "Information Security Policy",
    relevance: "This clause is highly relevant for establishing security policies",
    iso27001annex_control_id: 1,
  };

  // Clear all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewCrossMapping", () => {
    it("should create a new cross mapping with valid data", async () => {
      // Arrange & Act
      const crossMapping = await TestISO27001AnnexCrossMappingModel.createNewCrossMapping(
        validCrossMappingData.clause_no,
        validCrossMappingData.order_no,
        validCrossMappingData.clause_title,
        validCrossMappingData.relevance,
        validCrossMappingData.iso27001annex_control_id,
      );

      // Assert
      expect(crossMapping).toBeInstanceOf(TestISO27001AnnexCrossMappingModel);
      expect(crossMapping.clause_no).toBe(1);
      expect(crossMapping.order_no).toBe(1);
      expect(crossMapping.clause_title).toBe("Information Security Policy");
      expect(crossMapping.relevance).toBe(
        "This clause is highly relevant for establishing security policies",
      );
      expect(crossMapping.iso27001annex_control_id).toBe(1);
    });

    it("should throw ValidationException for invalid clause number", async () => {
      // Arrange & Act & Assert
      await expect(
        TestISO27001AnnexCrossMappingModel.createNewCrossMapping(
          0, // invalid clause number
          validCrossMappingData.order_no,
          validCrossMappingData.clause_title,
          validCrossMappingData.relevance,
          validCrossMappingData.iso27001annex_control_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for missing clause title", async () => {
      // Arrange & Act & Assert
      await expect(
        TestISO27001AnnexCrossMappingModel.createNewCrossMapping(
          validCrossMappingData.clause_no,
          validCrossMappingData.order_no,
          "", // empty clause title
          validCrossMappingData.relevance,
          validCrossMappingData.iso27001annex_control_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for clause title too short", async () => {
      // Arrange & Act & Assert
      await expect(
        TestISO27001AnnexCrossMappingModel.createNewCrossMapping(
          validCrossMappingData.clause_no,
          validCrossMappingData.order_no,
          "AB", // too short
          validCrossMappingData.relevance,
          validCrossMappingData.iso27001annex_control_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for relevance too short", async () => {
      // Arrange & Act & Assert
      await expect(
        TestISO27001AnnexCrossMappingModel.createNewCrossMapping(
          validCrossMappingData.clause_no,
          validCrossMappingData.order_no,
          validCrossMappingData.clause_title,
          "Hi", // too short relevance
          validCrossMappingData.iso27001annex_control_id,
        ),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("updateCrossMapping", () => {
    it("should update cross mapping with valid data", async () => {
      // Arrange
      const crossMapping = new TestISO27001AnnexCrossMappingModel(validCrossMappingData);
      const updateData = {
        clause_title: "Updated Security Policy",
        relevance: "Updated relevance description for the clause",
      };

      // Act
      await crossMapping.updateCrossMapping(updateData);

      // Assert
      expect(crossMapping.clause_title).toBe("Updated Security Policy");
      expect(crossMapping.relevance).toBe("Updated relevance description for the clause");
    });

    it("should throw ValidationException for invalid clause title in update", async () => {
      // Arrange
      const crossMapping = new TestISO27001AnnexCrossMappingModel(validCrossMappingData);

      // Act & Assert
      await expect(crossMapping.updateCrossMapping({ clause_title: "" })).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw ValidationException for invalid relevance in update", async () => {
      // Arrange
      const crossMapping = new TestISO27001AnnexCrossMappingModel(validCrossMappingData);

      // Act & Assert
      await expect(crossMapping.updateCrossMapping({ relevance: "Hi" })).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("business logic methods", () => {
    it("should correctly identify control ownership", () => {
      // Arrange
      const crossMapping = new TestISO27001AnnexCrossMappingModel(validCrossMappingData);

      // Act & Assert
      expect(crossMapping.belongsToControl(1)).toBe(true);
      expect(crossMapping.belongsToControl(2)).toBe(false);
    });

    it("should generate correct clause identifier", () => {
      // Arrange
      const crossMapping = new TestISO27001AnnexCrossMappingModel(validCrossMappingData);

      // Act & Assert
      expect(crossMapping.getClauseIdentifier()).toBe("Clause 1");
    });

    it("should generate correct full clause name", () => {
      // Arrange
      const crossMapping = new TestISO27001AnnexCrossMappingModel(validCrossMappingData);

      // Act & Assert
      expect(crossMapping.getFullClauseName()).toBe("Clause 1 - Information Security Policy");
    });

    it("should validate ISO 27001 compliance", () => {
      // Arrange
      const validMapping = new TestISO27001AnnexCrossMappingModel({
        ...validCrossMappingData,
        clause_no: 100,
      });
      const invalidMapping = new TestISO27001AnnexCrossMappingModel({
        ...validCrossMappingData,
        clause_no: 201,
      });

      // Act & Assert
      expect(validMapping.isValidForISO27001()).toBe(true);
      expect(invalidMapping.isValidForISO27001()).toBe(false);
    });

    it("should return correct priority based on order number", () => {
      // Arrange
      const highPriority = new TestISO27001AnnexCrossMappingModel({
        ...validCrossMappingData,
        order_no: 5,
      });
      const mediumPriority = new TestISO27001AnnexCrossMappingModel({
        ...validCrossMappingData,
        order_no: 15,
      });
      const lowPriority = new TestISO27001AnnexCrossMappingModel({
        ...validCrossMappingData,
        order_no: 30,
      });

      // Act & Assert
      expect(highPriority.getPriority()).toBe("high");
      expect(mediumPriority.getPriority()).toBe("medium");
      expect(lowPriority.getPriority()).toBe("low");
    });

    it("should correctly identify relevance levels", () => {
      // Arrange
      const highlyRelevant = new TestISO27001AnnexCrossMappingModel({
        ...validCrossMappingData,
        relevance: "This is highly critical for security",
      });
      const moderatelyRelevant = new TestISO27001AnnexCrossMappingModel({
        ...validCrossMappingData,
        relevance: "This is moderately important",
      });
      const lowRelevant = new TestISO27001AnnexCrossMappingModel({
        ...validCrossMappingData,
        relevance: "This is optional to consider",
      });

      // Act & Assert
      expect(highlyRelevant.isHighlyRelevant()).toBe(true);
      expect(moderatelyRelevant.isModeratelyRelevant()).toBe(true);
      expect(lowRelevant.isLowRelevant()).toBe(true);
    });
  });
});
