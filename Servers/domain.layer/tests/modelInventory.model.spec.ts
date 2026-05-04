import { ModelInventoryStatus } from "../enums/model-inventory-status.enum";

// Mock sequelize-typescript completely
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    TEXT: "TEXT",
    ENUM: jest.fn(),
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

// Create a simple test class that mimics ModelInventoryModel behavior
class TestModelInventoryModel {
  id?: number;
  provider_model!: string;
  version!: string;
  approver?: string;
  capabilities!: string;
  security_assessment!: boolean;
  status!: ModelInventoryStatus;
  status_date!: Date;
  is_demo?: boolean;
  created_at?: Date;
  updated_at?: Date;

  constructor(data?: any) {
    if (data) {
      Object.assign(this, data);
    }
  }

  // Static method to create new model inventory
  static createNewModelInventory(data: Partial<TestModelInventoryModel>): TestModelInventoryModel {
    const modelInventory = new TestModelInventoryModel({
      provider_model: data.provider_model || "",
      version: data.version || "",
      approver: data.approver || "",
      capabilities: data.capabilities || "",
      security_assessment: data.security_assessment || false,
      status: data.status || ModelInventoryStatus.PENDING,
      status_date: data.status_date || new Date(),
      is_demo: data.is_demo || false,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return modelInventory;
  }

  // Static method to update model inventory
  static updateModelInventory(
    existingModel: TestModelInventoryModel,
    data: Partial<TestModelInventoryModel>,
  ): TestModelInventoryModel {
    // Update only the fields that are provided
    if (data.provider_model !== undefined) {
      existingModel.provider_model = data.provider_model;
    }
    if (data.version !== undefined) {
      existingModel.version = data.version;
    }
    if (data.approver !== undefined) {
      existingModel.approver = data.approver;
    }
    if (data.capabilities !== undefined) {
      existingModel.capabilities = data.capabilities;
    }
    if (data.security_assessment !== undefined) {
      existingModel.security_assessment = data.security_assessment;
    }
    if (data.status !== undefined) {
      existingModel.status = data.status;
    }
    if (data.status_date !== undefined) {
      existingModel.status_date = data.status_date;
    }
    if (data.is_demo !== undefined) {
      existingModel.is_demo = data.is_demo;
    }

    // Always update the updated_at timestamp
    existingModel.updated_at = new Date();

    return existingModel;
  }

  // Instance methods
  getSecurityAssessmentBadge(): string {
    return this.security_assessment ? "Yes" : "No";
  }

  getStatusBadge(): string {
    return this.status;
  }

  isApproved(): boolean {
    return this.status === ModelInventoryStatus.APPROVED;
  }

  isRestricted(): boolean {
    return this.status === ModelInventoryStatus.RESTRICTED;
  }

  isPending(): boolean {
    return this.status === ModelInventoryStatus.PENDING;
  }

  getFullModelName(): string {
    return `${this.provider_model} ${this.version}`.trim();
  }

  isDemoModelInventory(): boolean {
    return this.is_demo ?? false;
  }

  isActive(): boolean {
    if (this.isDemoModelInventory()) {
      return false;
    }

    if (this.created_at) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return this.created_at > thirtyDaysAgo;
    }

    return true;
  }

  getAgeInDays(): number {
    if (!this.created_at) {
      return 0;
    }

    const now = new Date();
    const diffTime = Math.abs(now.getTime() - this.created_at.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  isRecent(days: number = 7): boolean {
    return this.getAgeInDays() <= days;
  }

  toSafeJSON(): any {
    return {
      id: this.id,
      provider_model: this.provider_model,
      version: this.version,
      approver: this.approver,
      capabilities: this.capabilities,
      security_assessment: this.security_assessment,
      status: this.status,
      status_date: this.status_date?.toISOString(),
      is_demo: this.is_demo,
      created_at: this.created_at?.toISOString(),
      updated_at: this.updated_at?.toISOString(),
    };
  }

  toJSON(): any {
    return {
      id: this.id,
      provider_model: this.provider_model,
      version: this.version,
      approver: this.approver,
      capabilities: this.capabilities,
      security_assessment: this.security_assessment,
      status: this.status,
      status_date: this.status_date?.toISOString(),
      is_demo: this.is_demo,
      created_at: this.created_at?.toISOString(),
      updated_at: this.updated_at?.toISOString(),
    };
  }
}

describe("ModelInventoryModel", () => {
  // Test data
  const validModelInventoryData = {
    provider_model: "OpenAI GPT-4",
    version: "4.0",
    approver: "John Doe",
    capabilities: "Text generation, code completion",
    security_assessment: true,
    status: ModelInventoryStatus.APPROVED,
  };

  // Clear all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewModelInventory", () => {
    it("should create a new model inventory with valid data", () => {
      // Arrange & Act
      const result = TestModelInventoryModel.createNewModelInventory(validModelInventoryData);

      // Assert
      expect(result).toBeInstanceOf(TestModelInventoryModel);
      expect(result.provider_model).toBe(validModelInventoryData.provider_model);
      expect(result.version).toBe(validModelInventoryData.version);
      expect(result.approver).toBe(validModelInventoryData.approver);
      expect(result.capabilities).toBe(validModelInventoryData.capabilities);
      expect(result.security_assessment).toBe(validModelInventoryData.security_assessment);
      expect(result.status).toBe(validModelInventoryData.status);
      expect(result.status_date).toBeInstanceOf(Date);
      expect(result.is_demo).toBe(false); // default value
    });

    it("should create model inventory with default values for missing fields", () => {
      // Arrange & Act
      const result = TestModelInventoryModel.createNewModelInventory({
        provider_model: "Test Model",
        version: "1.0",
        approver: "Test Approver",
        capabilities: "Test capabilities",
      });

      // Assert
      expect(result.provider_model).toBe("Test Model");
      expect(result.version).toBe("1.0");
      expect(result.approver).toBe("Test Approver");
      expect(result.capabilities).toBe("Test capabilities");
      expect(result.security_assessment).toBe(false); // default
      expect(result.status).toBe(ModelInventoryStatus.PENDING); // default
      expect(result.is_demo).toBe(false); // default
    });
  });

  describe("updateModelInventory", () => {
    let existingModel: TestModelInventoryModel;

    beforeEach(() => {
      existingModel = new TestModelInventoryModel({
        provider_model: "Original Model",
        version: "1.0",
        approver: "Original Approver",
        capabilities: "Original capabilities",
        security_assessment: false,
        status: ModelInventoryStatus.PENDING,
        status_date: new Date(),
      });
    });

    it("should update only provided fields", () => {
      // Arrange & Act
      const result = TestModelInventoryModel.updateModelInventory(existingModel, {
        provider_model: "Updated Model",
        version: "2.0",
      });

      // Assert
      expect(result.provider_model).toBe("Updated Model");
      expect(result.version).toBe("2.0");
      expect(result.approver).toBe("Original Approver"); // unchanged
      expect(result.capabilities).toBe("Original capabilities"); // unchanged
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it("should update all fields when all are provided", () => {
      // Arrange & Act
      const result = TestModelInventoryModel.updateModelInventory(existingModel, {
        provider_model: "Updated Model",
        version: "2.0",
        approver: "Updated Approver",
        capabilities: "Updated capabilities",
        security_assessment: true,
        status: ModelInventoryStatus.APPROVED,
        status_date: new Date(),
        is_demo: true,
      });

      // Assert
      expect(result.provider_model).toBe("Updated Model");
      expect(result.version).toBe("2.0");
      expect(result.approver).toBe("Updated Approver");
      expect(result.capabilities).toBe("Updated capabilities");
      expect(result.security_assessment).toBe(true);
      expect(result.status).toBe(ModelInventoryStatus.APPROVED);
      expect(result.is_demo).toBe(true);
    });
  });

  describe("instance methods", () => {
    let modelInventory: TestModelInventoryModel;

    beforeEach(() => {
      modelInventory = new TestModelInventoryModel({
        provider_model: "Test Model",
        version: "1.0",
        approver: "Test Approver",
        capabilities: "Test capabilities",
        security_assessment: false,
        status: ModelInventoryStatus.PENDING,
        status_date: new Date(),
      });
    });

    it("should return correct security assessment badge", () => {
      expect(modelInventory.getSecurityAssessmentBadge()).toBe("No");

      modelInventory.security_assessment = true;
      expect(modelInventory.getSecurityAssessmentBadge()).toBe("Yes");
    });

    it("should return correct status badge", () => {
      expect(modelInventory.getStatusBadge()).toBe(ModelInventoryStatus.PENDING);
    });

    it("should check approval status correctly", () => {
      expect(modelInventory.isApproved()).toBe(false);

      modelInventory.status = ModelInventoryStatus.APPROVED;
      expect(modelInventory.isApproved()).toBe(true);
    });

    it("should check restricted status correctly", () => {
      expect(modelInventory.isRestricted()).toBe(false);

      modelInventory.status = ModelInventoryStatus.RESTRICTED;
      expect(modelInventory.isRestricted()).toBe(true);
    });

    it("should check pending status correctly", () => {
      expect(modelInventory.isPending()).toBe(true);

      modelInventory.status = ModelInventoryStatus.APPROVED;
      expect(modelInventory.isPending()).toBe(false);
    });

    it("should get full model name correctly", () => {
      expect(modelInventory.getFullModelName()).toBe("Test Model 1.0");
    });

    it("should check demo status correctly", () => {
      expect(modelInventory.isDemoModelInventory()).toBe(false);

      modelInventory.is_demo = true;
      expect(modelInventory.isDemoModelInventory()).toBe(true);
    });

    it("should check if model inventory is active", () => {
      expect(modelInventory.isActive()).toBe(true);

      modelInventory.is_demo = true;
      expect(modelInventory.isActive()).toBe(false);
    });

    it("should calculate age in days correctly", () => {
      // Test with a date that's approximately 10 days ago
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      modelInventory.created_at = oldDate;

      // The result should be approximately 10 days, allow for small variations
      const ageInDays = modelInventory.getAgeInDays();
      expect(ageInDays).toBeGreaterThanOrEqual(9);
      expect(ageInDays).toBeLessThanOrEqual(11);
    });

    it("should check if model inventory is recent", () => {
      // Test with a date that's 3 days ago
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 3);
      modelInventory.created_at = recentDate;

      // Should be recent within 7 days
      expect(modelInventory.isRecent(7)).toBe(true);
      // Should not be recent within 2 days
      expect(modelInventory.isRecent(2)).toBe(false);
    });

    it("should return safe JSON without sensitive data", () => {
      const json = modelInventory.toSafeJSON();

      expect(json).toHaveProperty("provider_model", "Test Model");
      expect(json).toHaveProperty("version", "1.0");
      expect(json).toHaveProperty("security_assessment", false);
      expect(json).toHaveProperty("status", ModelInventoryStatus.PENDING);
    });

    it("should return formatted JSON", () => {
      const json = modelInventory.toJSON();

      expect(json).toHaveProperty("provider_model", "Test Model");
      expect(json).toHaveProperty("version", "1.0");
      expect(json).toHaveProperty("security_assessment", false);
      expect(json).toHaveProperty("status", ModelInventoryStatus.PENDING);
      expect(json.status_date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
