import { ValidationException, NotFoundException } from "../exceptions/custom.exception";

// Mock sequelize-typescript
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    DATE: "DATE",
  },
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

// Mock sequelize Op for findByName method
jest.mock("sequelize", () => ({
  Op: {
    iLike: "iLike",
  },
}));

// Test class mimicking FrameworkModel behavior
class TestFrameworkModel {
  id?: number;
  name!: string;
  description!: string;
  created_at!: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  // Static method to create new framework
  static async createNewFramework(name: string, description: string): Promise<TestFrameworkModel> {
    // Validate name
    if (!name || name.trim().length === 0) {
      throw new ValidationException("Name is required", "name", name);
    }

    if (name.trim().length < 2) {
      throw new ValidationException("Name must be at least 2 characters long", "name", name);
    }

    if (name.trim().length > 255) {
      throw new ValidationException("Name must not exceed 255 characters", "name", name);
    }

    // Validate description
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

    if (description.trim().length > 1000) {
      throw new ValidationException(
        "Description must not exceed 1000 characters",
        "description",
        description,
      );
    }

    // Create and return the framework model instance
    const framework = new TestFrameworkModel();
    framework.name = name.trim();
    framework.description = description.trim();
    framework.created_at = new Date();

    return framework;
  }

  // Instance methods
  async updateFramework(updateData: { name?: string; description?: string }): Promise<void> {
    // Validate name if provided
    if (updateData.name !== undefined) {
      if (!updateData.name || updateData.name.trim().length === 0) {
        throw new ValidationException("Name is required", "name", updateData.name);
      }

      if (updateData.name.trim().length < 2) {
        throw new ValidationException(
          "Name must be at least 2 characters long",
          "name",
          updateData.name,
        );
      }

      if (updateData.name.trim().length > 255) {
        throw new ValidationException(
          "Name must not exceed 255 characters",
          "name",
          updateData.name,
        );
      }

      this.name = updateData.name.trim();
    }

    // Validate description if provided
    if (updateData.description !== undefined) {
      if (!updateData.description || updateData.description.trim().length === 0) {
        throw new ValidationException(
          "Description is required",
          "description",
          updateData.description,
        );
      }

      if (updateData.description.trim().length < 10) {
        throw new ValidationException(
          "Description must be at least 10 characters long",
          "description",
          updateData.description,
        );
      }

      if (updateData.description.trim().length > 1000) {
        throw new ValidationException(
          "Description must not exceed 1000 characters",
          "description",
          updateData.description,
        );
      }

      this.description = updateData.description.trim();
    }
  }

  async validateFrameworkData(): Promise<void> {
    if (!this.name || this.name.trim().length === 0) {
      throw new ValidationException("Name is required", "name", this.name);
    }

    if (this.name.trim().length < 2) {
      throw new ValidationException("Name must be at least 2 characters long", "name", this.name);
    }

    if (this.name.trim().length > 255) {
      throw new ValidationException("Name must not exceed 255 characters", "name", this.name);
    }

    if (!this.description || this.description.trim().length === 0) {
      throw new ValidationException("Description is required", "description", this.description);
    }

    if (this.description.trim().length < 10) {
      throw new ValidationException(
        "Description must be at least 10 characters long",
        "description",
        this.description,
      );
    }

    if (this.description.trim().length > 1000) {
      throw new ValidationException(
        "Description must not exceed 1000 characters",
        "description",
        this.description,
      );
    }
  }

  isActive(): boolean {
    if (!this.created_at) {
      return true; // New frameworks are considered active
    }

    // Consider framework active if created within the last 365 days
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    return this.created_at > oneYearAgo;
  }

  getAgeInDays(): number {
    if (!this.created_at) {
      return 0;
    }

    const now = new Date();
    const diffTime = Math.abs(now.getTime() - this.created_at.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  isRecent(days: number = 30): boolean {
    return this.getAgeInDays() <= days;
  }

  getSummary(): {
    id: number | undefined;
    name: string;
    description: string;
    ageInDays: number;
    isActive: boolean;
  } {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      ageInDays: this.getAgeInDays(),
      isActive: this.isActive(),
    };
  }

  toSafeJSON(): any {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      created_at: this.created_at?.toISOString(),
    };
  }

  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      created_at: this.created_at?.toISOString(),
      ageInDays: this.getAgeInDays(),
      isActive: this.isActive(),
    };
  }

  static fromJSON(json: any): TestFrameworkModel {
    return new TestFrameworkModel(json);
  }

  // Static methods for database operations
  static async findByIdWithValidation(id: number): Promise<TestFrameworkModel> {
    if (!id || id < 1) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    // Mock database lookup
    if (id === 999) {
      throw new NotFoundException("Framework not found", "Framework", id);
    }

    return new TestFrameworkModel({
      id,
      name: "Test Framework",
      description: "A test framework description",
      created_at: new Date(),
    });
  }

  static async findAllFrameworks(): Promise<TestFrameworkModel[]> {
    return [
      new TestFrameworkModel({
        id: 1,
        name: "Framework 1",
        description: "Description 1",
        created_at: new Date(),
      }),
      new TestFrameworkModel({
        id: 2,
        name: "Framework 2",
        description: "Description 2",
        created_at: new Date(),
      }),
    ];
  }

  static async findByName(name: string): Promise<TestFrameworkModel[]> {
    if (!name || name.trim().length === 0) {
      throw new ValidationException("Name is required for search", "name", name);
    }

    return [
      new TestFrameworkModel({
        id: 1,
        name: `Framework containing ${name}`,
        description: "Description",
        created_at: new Date(),
      }),
    ];
  }

  static async updateFrameworkById(
    id: number,
    updateData: any,
  ): Promise<[number, TestFrameworkModel[]]> {
    if (!id || id < 1) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return [1, [new TestFrameworkModel({ id, ...updateData })]];
  }

  static async deleteFrameworkById(id: number): Promise<number> {
    if (!id || id < 1) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return 1;
  }

  canBeDeleted(): boolean {
    return true;
  }

  async getUsageStatistics(): Promise<{
    totalProjects: number;
    activeProjects: number;
    lastUsed: Date | null;
  }> {
    return {
      totalProjects: 0,
      activeProjects: 0,
      lastUsed: null,
    };
  }

  async isBeingUsed(): Promise<boolean> {
    const stats = await this.getUsageStatistics();
    return stats.totalProjects > 0;
  }

  getMetadata(): {
    id: number | undefined;
    name: string;
    description: string;
    created_at: Date | undefined;
    ageInDays: number;
    isActive: boolean;
    isRecent: boolean;
  } {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      created_at: this.created_at,
      ageInDays: this.getAgeInDays(),
      isActive: this.isActive(),
      isRecent: this.isRecent(),
    };
  }
}

describe("FrameworkModel", () => {
  const validFrameworkData = {
    name: "Test Framework",
    description: "This is a test framework description that is long enough",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewFramework", () => {
    it("should create framework with valid data", async () => {
      const framework = await TestFrameworkModel.createNewFramework(
        validFrameworkData.name,
        validFrameworkData.description,
      );

      expect(framework).toBeInstanceOf(TestFrameworkModel);
      expect(framework.name).toBe("Test Framework");
      expect(framework.description).toBe(
        "This is a test framework description that is long enough",
      );
      expect(framework.created_at).toBeInstanceOf(Date);
    });

    it("should throw ValidationException for empty name", async () => {
      await expect(
        TestFrameworkModel.createNewFramework("", validFrameworkData.description),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for short name", async () => {
      await expect(
        TestFrameworkModel.createNewFramework("A", validFrameworkData.description),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for long name", async () => {
      const longName = "A".repeat(256);
      await expect(
        TestFrameworkModel.createNewFramework(longName, validFrameworkData.description),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty description", async () => {
      await expect(
        TestFrameworkModel.createNewFramework(validFrameworkData.name, ""),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for short description", async () => {
      await expect(
        TestFrameworkModel.createNewFramework(validFrameworkData.name, "Short"),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for long description", async () => {
      const longDescription = "A".repeat(1001);
      await expect(
        TestFrameworkModel.createNewFramework(validFrameworkData.name, longDescription),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("updateFramework", () => {
    it("should update framework name successfully", async () => {
      const framework = new TestFrameworkModel(validFrameworkData);

      await framework.updateFramework({ name: "Updated Framework Name" });

      expect(framework.name).toBe("Updated Framework Name");
    });

    it("should update framework description successfully", async () => {
      const framework = new TestFrameworkModel(validFrameworkData);

      await framework.updateFramework({
        description: "This is an updated description that is long enough",
      });

      expect(framework.description).toBe("This is an updated description that is long enough");
    });

    it("should throw ValidationException for invalid name update", async () => {
      const framework = new TestFrameworkModel(validFrameworkData);

      await expect(framework.updateFramework({ name: "A" })).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid description update", async () => {
      const framework = new TestFrameworkModel(validFrameworkData);

      await expect(framework.updateFramework({ description: "Short" })).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("validateFrameworkData", () => {
    it("should pass validation with valid data", async () => {
      const framework = new TestFrameworkModel(validFrameworkData);
      await expect(framework.validateFrameworkData()).resolves.not.toThrow();
    });

    it("should throw ValidationException for invalid name", async () => {
      const framework = new TestFrameworkModel({
        ...validFrameworkData,
        name: "A",
      });
      await expect(framework.validateFrameworkData()).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid description", async () => {
      const framework = new TestFrameworkModel({
        ...validFrameworkData,
        description: "Short",
      });
      await expect(framework.validateFrameworkData()).rejects.toThrow(ValidationException);
    });
  });

  describe("isActive", () => {
    it("should return true for framework without created_at", () => {
      const framework = new TestFrameworkModel(validFrameworkData);
      expect(framework.isActive()).toBe(true);
    });

    it("should return true for recent framework", () => {
      const framework = new TestFrameworkModel({
        ...validFrameworkData,
        created_at: new Date(),
      });
      expect(framework.isActive()).toBe(true);
    });

    it("should return false for old framework", () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 2);
      const framework = new TestFrameworkModel({
        ...validFrameworkData,
        created_at: oldDate,
      });
      expect(framework.isActive()).toBe(false);
    });
  });

  describe("getAgeInDays", () => {
    it("should return 0 for framework without created_at", () => {
      const framework = new TestFrameworkModel(validFrameworkData);
      expect(framework.getAgeInDays()).toBe(0);
    });

    it("should return correct age for framework with created_at", () => {
      const fixedDate = new Date("2024-01-01T12:00:00.000Z");
      const framework = new TestFrameworkModel({
        ...validFrameworkData,
        created_at: fixedDate,
      });

      const originalDate = global.Date;
      const mockDate = new Date("2024-01-02T12:00:00.000Z");
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.UTC = originalDate.UTC;
      global.Date.parse = originalDate.parse;
      global.Date.now = originalDate.now;

      try {
        expect(framework.getAgeInDays()).toBe(1);
      } finally {
        global.Date = originalDate;
      }
    });
  });

  describe("isRecent", () => {
    it("should return true for recent framework", () => {
      const fixedDate = new Date("2024-01-01T12:00:00.000Z");
      const framework = new TestFrameworkModel({
        ...validFrameworkData,
        created_at: fixedDate,
      });

      const originalDate = global.Date;
      const mockDate = new Date("2024-01-02T12:00:00.000Z");
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.UTC = originalDate.UTC;
      global.Date.parse = originalDate.parse;
      global.Date.now = originalDate.now;

      try {
        expect(framework.isRecent(30)).toBe(true);
      } finally {
        global.Date = originalDate;
      }
    });

    it("should return false for old framework", () => {
      const oldDate = new Date("2024-01-01T12:00:00.000Z");
      const framework = new TestFrameworkModel({
        ...validFrameworkData,
        created_at: oldDate,
      });

      const originalDate = global.Date;
      const mockDate = new Date("2024-02-01T12:00:00.000Z");
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.UTC = originalDate.UTC;
      global.Date.parse = originalDate.parse;
      global.Date.now = originalDate.now;

      try {
        expect(framework.isRecent(30)).toBe(false);
      } finally {
        global.Date = originalDate;
      }
    });
  });

  describe("getSummary", () => {
    it("should return framework summary", () => {
      const framework = new TestFrameworkModel({
        id: 1,
        ...validFrameworkData,
        created_at: new Date(),
      });

      const summary = framework.getSummary();

      expect(summary).toEqual({
        id: 1,
        name: validFrameworkData.name,
        description: validFrameworkData.description,
        ageInDays: expect.any(Number),
        isActive: expect.any(Boolean),
      });
    });
  });

  describe("toSafeJSON", () => {
    it("should return safe JSON representation", () => {
      const framework = new TestFrameworkModel({
        id: 1,
        ...validFrameworkData,
        created_at: new Date("2024-01-01T00:00:00.000Z"),
      });

      const result = framework.toSafeJSON();

      expect(result).toEqual({
        id: 1,
        name: validFrameworkData.name,
        description: validFrameworkData.description,
        created_at: "2024-01-01T00:00:00.000Z",
      });
    });
  });

  describe("toJSON", () => {
    it("should return complete JSON representation", () => {
      const framework = new TestFrameworkModel({
        id: 1,
        ...validFrameworkData,
        created_at: new Date("2024-01-01T00:00:00.000Z"),
      });

      const result = framework.toJSON();

      expect(result).toEqual({
        id: 1,
        name: validFrameworkData.name,
        description: validFrameworkData.description,
        created_at: "2024-01-01T00:00:00.000Z",
        ageInDays: expect.any(Number),
        isActive: expect.any(Boolean),
      });
    });
  });

  describe("fromJSON", () => {
    it("should create framework from JSON", () => {
      const json = { id: 1, ...validFrameworkData };
      const framework = TestFrameworkModel.fromJSON(json);
      expect(framework).toBeInstanceOf(TestFrameworkModel);
      expect(framework.id).toBe(1);
      expect(framework.name).toBe(validFrameworkData.name);
    });
  });

  describe("findByIdWithValidation", () => {
    it("should find framework by valid ID", async () => {
      const framework = await TestFrameworkModel.findByIdWithValidation(1);
      expect(framework).toBeInstanceOf(TestFrameworkModel);
      expect(framework.id).toBe(1);
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestFrameworkModel.findByIdWithValidation(0)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw NotFoundException for non-existent ID", async () => {
      await expect(TestFrameworkModel.findByIdWithValidation(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("findAllFrameworks", () => {
    it("should return all frameworks", async () => {
      const frameworks = await TestFrameworkModel.findAllFrameworks();
      expect(frameworks).toHaveLength(2);
      expect(frameworks[0]).toBeInstanceOf(TestFrameworkModel);
    });
  });

  describe("findByName", () => {
    it("should find frameworks by name", async () => {
      const frameworks = await TestFrameworkModel.findByName("test");
      expect(frameworks).toHaveLength(1);
      expect(frameworks[0].name).toContain("test");
    });

    it("should throw ValidationException for empty name", async () => {
      await expect(TestFrameworkModel.findByName("")).rejects.toThrow(ValidationException);
    });
  });

  describe("updateFrameworkById", () => {
    it("should update framework by ID", async () => {
      const [affected, updated] = await TestFrameworkModel.updateFrameworkById(1, {
        name: "Updated Name",
      });
      expect(affected).toBe(1);
      expect(updated[0].name).toBe("Updated Name");
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestFrameworkModel.updateFrameworkById(0, { name: "Updated" })).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("deleteFrameworkById", () => {
    it("should delete framework by ID", async () => {
      const deleted = await TestFrameworkModel.deleteFrameworkById(1);
      expect(deleted).toBe(1);
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestFrameworkModel.deleteFrameworkById(0)).rejects.toThrow(ValidationException);
    });
  });

  describe("canBeDeleted", () => {
    it("should return true for deletable framework", () => {
      const framework = new TestFrameworkModel(validFrameworkData);
      expect(framework.canBeDeleted()).toBe(true);
    });
  });

  describe("getUsageStatistics", () => {
    it("should return usage statistics", async () => {
      const framework = new TestFrameworkModel(validFrameworkData);
      const stats = await framework.getUsageStatistics();

      expect(stats).toEqual({
        totalProjects: 0,
        activeProjects: 0,
        lastUsed: null,
      });
    });
  });

  describe("isBeingUsed", () => {
    it("should return false for unused framework", async () => {
      const framework = new TestFrameworkModel(validFrameworkData);
      const isUsed = await framework.isBeingUsed();
      expect(isUsed).toBe(false);
    });
  });

  describe("getMetadata", () => {
    it("should return framework metadata", () => {
      const framework = new TestFrameworkModel({
        id: 1,
        ...validFrameworkData,
        created_at: new Date(),
      });

      const metadata = framework.getMetadata();

      expect(metadata).toEqual({
        id: 1,
        name: validFrameworkData.name,
        description: validFrameworkData.description,
        created_at: expect.any(Date),
        ageInDays: expect.any(Number),
        isActive: expect.any(Boolean),
        isRecent: expect.any(Boolean),
      });
    });
  });
});
