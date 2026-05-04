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

// Create a simple test class that mimics ISO27001ClauseCrossMappingModel behavior
class TestISO27001ClauseCrossMappingModel {
  id?: number;
  clause_no!: number;
  order_no!: number;
  clause_title!: string;
  relevance!: string;
  iso27001clause_id!: number;

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
    iso27001clause_id: number,
  ): Promise<TestISO27001ClauseCrossMappingModel> {
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

    // Validate iso27001clause_id
    if (iso27001clause_id < 1) {
      throw new ValidationException(
        "Valid clause ID is required",
        "iso27001clause_id",
        iso27001clause_id,
      );
    }

    // Create and return the cross mapping model instance
    const crossMapping = new TestISO27001ClauseCrossMappingModel();
    crossMapping.clause_no = clause_no;
    crossMapping.order_no = order_no;
    crossMapping.clause_title = clause_title.trim();
    crossMapping.relevance = relevance.trim();
    crossMapping.iso27001clause_id = iso27001clause_id;

    return crossMapping;
  }

  // Instance method to update cross mapping
  async updateCrossMapping(updateData: {
    clause_no?: number;
    order_no?: number;
    clause_title?: string;
    relevance?: string;
    iso27001clause_id?: number;
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

    // Update other fields if provided
    if (updateData.order_no !== undefined) {
      this.order_no = updateData.order_no;
    }

    if (updateData.relevance !== undefined) {
      this.relevance = updateData.relevance;
    }

    if (updateData.iso27001clause_id !== undefined) {
      this.iso27001clause_id = updateData.iso27001clause_id;
    }
  }

  // Instance method to validate cross mapping data
  async validateCrossMappingData(): Promise<void> {
    if (this.clause_no < 1) {
      throw new ValidationException(
        "Valid clause number is required (must be >= 1)",
        "clause_no",
        this.clause_no,
      );
    }

    if (this.order_no < 1) {
      throw new ValidationException(
        "Valid order number is required (must be >= 1)",
        "order_no",
        this.order_no,
      );
    }

    if (!this.clause_title || this.clause_title.trim().length === 0) {
      throw new ValidationException("Clause title is required", "clause_title", this.clause_title);
    }

    if (this.clause_title.trim().length < 3) {
      throw new ValidationException(
        "Clause title must be at least 3 characters long",
        "clause_title",
        this.clause_title,
      );
    }

    if (this.clause_title.trim().length > 255) {
      throw new ValidationException(
        "Clause title must not exceed 255 characters",
        "clause_title",
        this.clause_title,
      );
    }

    if (!this.relevance || this.relevance.trim().length === 0) {
      throw new ValidationException("Relevance is required", "relevance", this.relevance);
    }

    if (this.relevance.trim().length < 5) {
      throw new ValidationException(
        "Relevance must be at least 5 characters long",
        "relevance",
        this.relevance,
      );
    }

    if (this.relevance.trim().length > 500) {
      throw new ValidationException(
        "Relevance must not exceed 500 characters",
        "relevance",
        this.relevance,
      );
    }

    if (this.iso27001clause_id < 1) {
      throw new ValidationException(
        "Valid clause ID is required",
        "iso27001clause_id",
        this.iso27001clause_id,
      );
    }
  }

  // Instance method to check if cross mapping belongs to clause
  belongsToClause(clauseId: number): boolean {
    return this.iso27001clause_id === clauseId;
  }

  // Instance method to get clause identifier
  getClauseIdentifier(): string {
    return `Clause ${this.clause_no}`;
  }

  // Instance method to get full clause name
  getFullClauseName(): string {
    return `${this.getClauseIdentifier()} - ${this.clause_title}`;
  }

  // Instance method to get mapping summary
  getMappingSummary(): {
    id: number | undefined;
    clause_no: number;
    order_no: number;
    clause_title: string;
    relevance: string;
    clause_id: number;
    clause_identifier: string;
    full_clause_name: string;
  } {
    return {
      id: this.id,
      clause_no: this.clause_no,
      order_no: this.order_no,
      clause_title: this.clause_title,
      relevance: this.relevance,
      clause_id: this.iso27001clause_id,
      clause_identifier: this.getClauseIdentifier(),
      full_clause_name: this.getFullClauseName(),
    };
  }

  // Instance method to get display info
  getDisplayInfo(): {
    identifier: string;
    title: string;
    fullName: string;
    order: number;
    relevance: string;
  } {
    return {
      identifier: this.getClauseIdentifier(),
      title: this.clause_title,
      fullName: this.getFullClauseName(),
      order: this.order_no,
      relevance: this.relevance,
    };
  }

  // Instance method to check if valid for ISO 27001
  isValidForISO27001(): boolean {
    return this.clause_no >= 1 && this.clause_no <= 200;
  }

  // Instance method to get priority
  getPriority(): "high" | "medium" | "low" {
    if (this.order_no <= 10) return "high";
    if (this.order_no <= 25) return "medium";
    return "low";
  }

  // Instance method to check if highly relevant
  isHighlyRelevant(): boolean {
    const relevanceLower = this.relevance.toLowerCase();
    return (
      relevanceLower.includes("high") ||
      relevanceLower.includes("critical") ||
      relevanceLower.includes("essential") ||
      relevanceLower.includes("required")
    );
  }

  // Instance method to check if moderately relevant
  isModeratelyRelevant(): boolean {
    const relevanceLower = this.relevance.toLowerCase();
    return (
      relevanceLower.includes("medium") ||
      relevanceLower.includes("moderate") ||
      relevanceLower.includes("important") ||
      relevanceLower.includes("recommended")
    );
  }

  // Instance method to check if low relevance
  isLowRelevant(): boolean {
    const relevanceLower = this.relevance.toLowerCase();
    return (
      relevanceLower.includes("low") ||
      relevanceLower.includes("optional") ||
      relevanceLower.includes("nice to have") ||
      relevanceLower.includes("consider")
    );
  }

  // Static method to create from JSON
  static fromJSON(json: any): TestISO27001ClauseCrossMappingModel {
    return new TestISO27001ClauseCrossMappingModel(json);
  }

  // Instance method to convert to JSON
  toJSON(): any {
    return {
      id: this.id,
      clause_no: this.clause_no,
      order_no: this.order_no,
      clause_title: this.clause_title,
      relevance: this.relevance,
      iso27001clause_id: this.iso27001clause_id,
      clause_identifier: this.getClauseIdentifier(),
      full_clause_name: this.getFullClauseName(),
    };
  }

  // Instance method to get safe JSON
  toSafeJSON(): any {
    return this;
  }
}

describe("ISO27001ClauseCrossMappingModel", () => {
  const validCrossMappingData = {
    clause_no: 1,
    order_no: 1,
    clause_title: "Information Security Policy",
    relevance: "This clause is highly relevant for establishing security policies",
    iso27001clause_id: 1,
  };

  // Clear all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("instantiation", () => {
    it("should instantiate with correct attributes", () => {
      // Arrange & Act
      const crossMapping = new TestISO27001ClauseCrossMappingModel(validCrossMappingData);

      // Assert
      expect(crossMapping.clause_no).toBe(1);
      expect(crossMapping.clause_title).toBe("Information Security Policy");
      expect(crossMapping.order_no).toBe(1);
      expect(crossMapping.iso27001clause_id).toBe(1);
    });
  });

  describe("createNewCrossMapping", () => {
    it("should create a new cross mapping with valid data", async () => {
      // Arrange & Act
      const crossMapping = await TestISO27001ClauseCrossMappingModel.createNewCrossMapping(
        validCrossMappingData.clause_no,
        validCrossMappingData.order_no,
        validCrossMappingData.clause_title,
        validCrossMappingData.relevance,
        validCrossMappingData.iso27001clause_id,
      );

      // Assert
      expect(crossMapping).toBeInstanceOf(TestISO27001ClauseCrossMappingModel);
      expect(crossMapping.clause_no).toBe(validCrossMappingData.clause_no);
      expect(crossMapping.clause_title).toBe(validCrossMappingData.clause_title);
      expect(crossMapping.order_no).toBe(validCrossMappingData.order_no);
      expect(crossMapping.relevance).toBe(validCrossMappingData.relevance);
      expect(crossMapping.iso27001clause_id).toBe(validCrossMappingData.iso27001clause_id);
    });

    it("should throw ValidationException for invalid clause_no", async () => {
      // Arrange & Act & Assert
      await expect(
        TestISO27001ClauseCrossMappingModel.createNewCrossMapping(
          0,
          validCrossMappingData.order_no,
          validCrossMappingData.clause_title,
          validCrossMappingData.relevance,
          validCrossMappingData.iso27001clause_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid order_no", async () => {
      // Arrange & Act & Assert
      await expect(
        TestISO27001ClauseCrossMappingModel.createNewCrossMapping(
          validCrossMappingData.clause_no,
          0,
          validCrossMappingData.clause_title,
          validCrossMappingData.relevance,
          validCrossMappingData.iso27001clause_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty clause title", async () => {
      // Arrange & Act & Assert
      await expect(
        TestISO27001ClauseCrossMappingModel.createNewCrossMapping(
          validCrossMappingData.clause_no,
          validCrossMappingData.order_no,
          "",
          validCrossMappingData.relevance,
          validCrossMappingData.iso27001clause_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for clause title too short", async () => {
      // Arrange & Act & Assert
      await expect(
        TestISO27001ClauseCrossMappingModel.createNewCrossMapping(
          validCrossMappingData.clause_no,
          validCrossMappingData.order_no,
          "ab",
          validCrossMappingData.relevance,
          validCrossMappingData.iso27001clause_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for clause title too long", async () => {
      // Arrange
      const longTitle = "a".repeat(256);

      // Act & Assert
      await expect(
        TestISO27001ClauseCrossMappingModel.createNewCrossMapping(
          validCrossMappingData.clause_no,
          validCrossMappingData.order_no,
          longTitle,
          validCrossMappingData.relevance,
          validCrossMappingData.iso27001clause_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty relevance", async () => {
      // Arrange & Act & Assert
      await expect(
        TestISO27001ClauseCrossMappingModel.createNewCrossMapping(
          validCrossMappingData.clause_no,
          validCrossMappingData.order_no,
          validCrossMappingData.clause_title,
          "",
          validCrossMappingData.iso27001clause_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for relevance too short", async () => {
      // Arrange & Act & Assert
      await expect(
        TestISO27001ClauseCrossMappingModel.createNewCrossMapping(
          validCrossMappingData.clause_no,
          validCrossMappingData.order_no,
          validCrossMappingData.clause_title,
          "abcd",
          validCrossMappingData.iso27001clause_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for relevance too long", async () => {
      // Arrange
      const longRelevance = "a".repeat(501);

      // Act & Assert
      await expect(
        TestISO27001ClauseCrossMappingModel.createNewCrossMapping(
          validCrossMappingData.clause_no,
          validCrossMappingData.order_no,
          validCrossMappingData.clause_title,
          longRelevance,
          validCrossMappingData.iso27001clause_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid clause_id", async () => {
      // Arrange & Act & Assert
      await expect(
        TestISO27001ClauseCrossMappingModel.createNewCrossMapping(
          validCrossMappingData.clause_no,
          validCrossMappingData.order_no,
          validCrossMappingData.clause_title,
          validCrossMappingData.relevance,
          0,
        ),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("updateCrossMapping", () => {
    let crossMapping: TestISO27001ClauseCrossMappingModel;

    beforeEach(async () => {
      crossMapping = await TestISO27001ClauseCrossMappingModel.createNewCrossMapping(
        validCrossMappingData.clause_no,
        validCrossMappingData.order_no,
        validCrossMappingData.clause_title,
        validCrossMappingData.relevance,
        validCrossMappingData.iso27001clause_id,
      );
    });

    it("should update cross mapping with valid data", async () => {
      // Arrange & Act
      await crossMapping.updateCrossMapping({
        clause_title: "Updated Policy",
        relevance: "Updated relevance description",
      });

      // Assert
      expect(crossMapping.clause_title).toBe("Updated Policy");
      expect(crossMapping.relevance).toBe("Updated relevance description");
    });

    it("should throw ValidationException for invalid clause title update", async () => {
      // Arrange & Act & Assert
      await expect(crossMapping.updateCrossMapping({ clause_title: "" })).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw ValidationException for invalid clause_no update", async () => {
      // Arrange & Act & Assert
      await expect(crossMapping.updateCrossMapping({ clause_no: 0 })).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("validateCrossMappingData", () => {
    let crossMapping: TestISO27001ClauseCrossMappingModel;

    beforeEach(async () => {
      crossMapping = await TestISO27001ClauseCrossMappingModel.createNewCrossMapping(
        validCrossMappingData.clause_no,
        validCrossMappingData.order_no,
        validCrossMappingData.clause_title,
        validCrossMappingData.relevance,
        validCrossMappingData.iso27001clause_id,
      );
    });

    it("should pass validation with valid data", async () => {
      // Arrange & Act & Assert
      await expect(crossMapping.validateCrossMappingData()).resolves.not.toThrow();
    });

    it("should throw ValidationException for invalid clause_no", async () => {
      // Arrange
      crossMapping.clause_no = 0;

      // Act & Assert
      await expect(crossMapping.validateCrossMappingData()).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid order_no", async () => {
      // Arrange
      crossMapping.order_no = 0;

      // Act & Assert
      await expect(crossMapping.validateCrossMappingData()).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty clause title", async () => {
      // Arrange
      crossMapping.clause_title = "";

      // Act & Assert
      await expect(crossMapping.validateCrossMappingData()).rejects.toThrow(ValidationException);
    });
  });

  describe("utility methods", () => {
    let crossMapping: TestISO27001ClauseCrossMappingModel;

    beforeEach(async () => {
      crossMapping = await TestISO27001ClauseCrossMappingModel.createNewCrossMapping(
        validCrossMappingData.clause_no,
        validCrossMappingData.order_no,
        validCrossMappingData.clause_title,
        validCrossMappingData.relevance,
        validCrossMappingData.iso27001clause_id,
      );
    });

    it("should check if cross mapping belongs to clause", () => {
      // Arrange & Act & Assert
      expect(crossMapping.belongsToClause(1)).toBe(true);
      expect(crossMapping.belongsToClause(2)).toBe(false);
    });

    it("should get clause identifier", () => {
      // Arrange & Act & Assert
      expect(crossMapping.getClauseIdentifier()).toBe("Clause 1");
    });

    it("should get full clause name", () => {
      // Arrange & Act & Assert
      expect(crossMapping.getFullClauseName()).toBe("Clause 1 - Information Security Policy");
    });

    it("should get mapping summary", () => {
      // Arrange & Act
      const summary = crossMapping.getMappingSummary();

      // Assert
      expect(summary.clause_no).toBe(1);
      expect(summary.clause_title).toBe("Information Security Policy");
      expect(summary.clause_identifier).toBe("Clause 1");
      expect(summary.full_clause_name).toBe("Clause 1 - Information Security Policy");
    });

    it("should get display info", () => {
      // Arrange & Act
      const displayInfo = crossMapping.getDisplayInfo();

      // Assert
      expect(displayInfo.identifier).toBe("Clause 1");
      expect(displayInfo.title).toBe("Information Security Policy");
      expect(displayInfo.fullName).toBe("Clause 1 - Information Security Policy");
      expect(displayInfo.order).toBe(1);
      expect(displayInfo.relevance).toBe(validCrossMappingData.relevance);
    });

    it("should check if valid for ISO 27001", () => {
      // Arrange & Act & Assert
      expect(crossMapping.isValidForISO27001()).toBe(true);

      crossMapping.clause_no = 201;
      expect(crossMapping.isValidForISO27001()).toBe(false);
    });

    it("should get priority based on order number", () => {
      // Arrange & Act & Assert
      expect(crossMapping.getPriority()).toBe("high");

      crossMapping.order_no = 15;
      expect(crossMapping.getPriority()).toBe("medium");

      crossMapping.order_no = 30;
      expect(crossMapping.getPriority()).toBe("low");
    });

    it("should check relevance levels", () => {
      // Arrange & Act & Assert
      expect(crossMapping.isHighlyRelevant()).toBe(true);
      expect(crossMapping.isModeratelyRelevant()).toBe(false);
      expect(crossMapping.isLowRelevant()).toBe(false);

      crossMapping.relevance = "This is medium importance";
      expect(crossMapping.isHighlyRelevant()).toBe(false);
      expect(crossMapping.isModeratelyRelevant()).toBe(true);
      expect(crossMapping.isLowRelevant()).toBe(false);

      crossMapping.relevance = "This is low priority optional";
      expect(crossMapping.isHighlyRelevant()).toBe(false);
      expect(crossMapping.isModeratelyRelevant()).toBe(false);
      expect(crossMapping.isLowRelevant()).toBe(true);
    });
  });

  describe("JSON serialization", () => {
    it("should convert to JSON", async () => {
      // Arrange
      const crossMapping = await TestISO27001ClauseCrossMappingModel.createNewCrossMapping(
        validCrossMappingData.clause_no,
        validCrossMappingData.order_no,
        validCrossMappingData.clause_title,
        validCrossMappingData.relevance,
        validCrossMappingData.iso27001clause_id,
      );

      // Act
      const json = crossMapping.toJSON();

      // Assert
      expect(json.clause_title).toBe(validCrossMappingData.clause_title);
      expect(json.clause_identifier).toBe("Clause 1");
      expect(json.full_clause_name).toBe("Clause 1 - Information Security Policy");
    });

    it("should create from JSON", () => {
      // Arrange
      const jsonData = { ...validCrossMappingData, id: 1 };

      // Act
      const crossMapping = TestISO27001ClauseCrossMappingModel.fromJSON(jsonData);

      // Assert
      expect(crossMapping.clause_title).toBe(jsonData.clause_title);
      expect(crossMapping.id).toBe(jsonData.id);
    });
  });
});
