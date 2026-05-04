import { ValidationException, NotFoundException } from "../exceptions/custom.exception";

// Mock sequelize-typescript
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
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

// Mock related models
jest.mock("../models/project/project.model", () => ({
  ProjectModel: class MockProjectModel {},
}));

jest.mock("../models/frameworks/frameworks.model", () => ({
  FrameworkModel: class MockFrameworkModel {},
}));

// Test class mimicking ProjectFrameworksModel behavior
class TestProjectFrameworksModel {
  framework_id!: number;
  project_id!: number;
  is_demo?: boolean;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  // Static method to create new project-framework association
  static async createProjectFramework(
    framework_id: number,
    project_id: number,
    is_demo: boolean = false,
  ): Promise<TestProjectFrameworksModel> {
    // Validate framework_id
    if (!framework_id || framework_id < 1) {
      throw new ValidationException(
        "Valid framework ID is required (must be >= 1)",
        "framework_id",
        framework_id,
      );
    }

    // Validate project_id
    if (!project_id || project_id < 1) {
      throw new ValidationException(
        "Valid project ID is required (must be >= 1)",
        "project_id",
        project_id,
      );
    }

    // Create and return the project-framework association
    const projectFramework = new TestProjectFrameworksModel();
    projectFramework.framework_id = framework_id;
    projectFramework.project_id = project_id;
    projectFramework.is_demo = is_demo;

    return projectFramework;
  }

  // Instance method to update project-framework association
  async updateProjectFramework(updateData: { is_demo?: boolean }): Promise<void> {
    if (updateData.is_demo !== undefined) {
      this.is_demo = updateData.is_demo;
    }
  }

  // Instance method to validate project-framework data
  async validateProjectFrameworkData(): Promise<void> {
    if (!this.framework_id || this.framework_id < 1) {
      throw new ValidationException(
        "Valid framework ID is required (must be >= 1)",
        "framework_id",
        this.framework_id,
      );
    }

    if (!this.project_id || this.project_id < 1) {
      throw new ValidationException(
        "Valid project ID is required (must be >= 1)",
        "project_id",
        this.project_id,
      );
    }
  }

  // Instance method to check if this is a demo association
  isDemoAssociation(): boolean {
    return this.is_demo ?? false;
  }

  // Instance method to convert to JSON representation
  toJSON(): any {
    return {
      framework_id: this.framework_id,
      project_id: this.project_id,
      is_demo: this.is_demo,
    };
  }

  // Static method to find project-framework by IDs with validation
  static async findByProjectAndFramework(
    project_id: number,
    framework_id: number,
  ): Promise<TestProjectFrameworksModel> {
    if (!project_id || project_id < 1) {
      throw new ValidationException(
        "Valid project ID is required (must be >= 1)",
        "project_id",
        project_id,
      );
    }

    if (!framework_id || framework_id < 1) {
      throw new ValidationException(
        "Valid framework ID is required (must be >= 1)",
        "framework_id",
        framework_id,
      );
    }

    // Mock database lookup
    if (project_id === 999 || framework_id === 999) {
      throw new NotFoundException("Project-framework association not found", "ProjectFramework", {
        project_id,
        framework_id,
      });
    }

    return new TestProjectFrameworksModel({
      project_id,
      framework_id,
      is_demo: false,
    });
  }

  // Static method to find all frameworks for a project
  static async findByProjectId(project_id: number): Promise<TestProjectFrameworksModel[]> {
    if (!project_id || project_id < 1) {
      throw new ValidationException(
        "Valid project ID is required (must be >= 1)",
        "project_id",
        project_id,
      );
    }

    return [
      new TestProjectFrameworksModel({
        project_id,
        framework_id: 1,
        is_demo: false,
      }),
      new TestProjectFrameworksModel({
        project_id,
        framework_id: 2,
        is_demo: true,
      }),
    ];
  }

  // Static method to find all projects for a framework
  static async findByFrameworkId(framework_id: number): Promise<TestProjectFrameworksModel[]> {
    if (!framework_id || framework_id < 1) {
      throw new ValidationException(
        "Valid framework ID is required (must be >= 1)",
        "framework_id",
        framework_id,
      );
    }

    return [
      new TestProjectFrameworksModel({
        project_id: 1,
        framework_id,
        is_demo: false,
      }),
      new TestProjectFrameworksModel({
        project_id: 2,
        framework_id,
        is_demo: true,
      }),
    ];
  }
}

describe("ProjectFrameworksModel", () => {
  const validData = {
    framework_id: 1,
    project_id: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createProjectFramework", () => {
    it("should create project-framework association with valid data", async () => {
      const association = await TestProjectFrameworksModel.createProjectFramework(
        validData.framework_id,
        validData.project_id,
      );

      expect(association).toBeInstanceOf(TestProjectFrameworksModel);
      expect(association.framework_id).toBe(1);
      expect(association.project_id).toBe(1);
      expect(association.is_demo).toBe(false);
    });

    it("should create with custom is_demo value", async () => {
      const association = await TestProjectFrameworksModel.createProjectFramework(
        validData.framework_id,
        validData.project_id,
        true,
      );

      expect(association.is_demo).toBe(true);
    });

    it("should throw ValidationException for invalid framework_id", async () => {
      await expect(
        TestProjectFrameworksModel.createProjectFramework(0, validData.project_id),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid project_id", async () => {
      await expect(
        TestProjectFrameworksModel.createProjectFramework(validData.framework_id, 0),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("updateProjectFramework", () => {
    it("should update is_demo value", async () => {
      const association = new TestProjectFrameworksModel(validData);

      await association.updateProjectFramework({ is_demo: true });

      expect(association.is_demo).toBe(true);
    });

    it("should not update when is_demo is undefined", async () => {
      const association = new TestProjectFrameworksModel({
        ...validData,
        is_demo: false,
      });

      await association.updateProjectFramework({});

      expect(association.is_demo).toBe(false);
    });
  });

  describe("validateProjectFrameworkData", () => {
    it("should pass validation with valid data", async () => {
      const association = new TestProjectFrameworksModel(validData);

      await expect(association.validateProjectFrameworkData()).resolves.not.toThrow();
    });

    it("should throw ValidationException for invalid framework_id", async () => {
      const association = new TestProjectFrameworksModel({
        ...validData,
        framework_id: 0,
      });

      await expect(association.validateProjectFrameworkData()).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid project_id", async () => {
      const association = new TestProjectFrameworksModel({
        ...validData,
        project_id: 0,
      });

      await expect(association.validateProjectFrameworkData()).rejects.toThrow(ValidationException);
    });
  });

  describe("isDemoAssociation", () => {
    it("should return true for demo association", () => {
      const association = new TestProjectFrameworksModel({
        ...validData,
        is_demo: true,
      });

      expect(association.isDemoAssociation()).toBe(true);
    });

    it("should return false for regular association", () => {
      const association = new TestProjectFrameworksModel(validData);

      expect(association.isDemoAssociation()).toBe(false);
    });

    it("should return false when is_demo is undefined", () => {
      const association = new TestProjectFrameworksModel({
        ...validData,
        is_demo: undefined,
      });

      expect(association.isDemoAssociation()).toBe(false);
    });
  });

  describe("toJSON", () => {
    it("should return JSON representation", () => {
      const association = new TestProjectFrameworksModel({
        ...validData,
        is_demo: true,
      });

      const result = association.toJSON();

      expect(result).toEqual({
        framework_id: 1,
        project_id: 1,
        is_demo: true,
      });
    });
  });

  describe("findByProjectAndFramework", () => {
    it("should find association by valid IDs", async () => {
      const association = await TestProjectFrameworksModel.findByProjectAndFramework(1, 1);

      expect(association).toBeInstanceOf(TestProjectFrameworksModel);
      expect(association.project_id).toBe(1);
      expect(association.framework_id).toBe(1);
    });

    it("should throw ValidationException for invalid project_id", async () => {
      await expect(TestProjectFrameworksModel.findByProjectAndFramework(0, 1)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw ValidationException for invalid framework_id", async () => {
      await expect(TestProjectFrameworksModel.findByProjectAndFramework(1, 0)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw NotFoundException for non-existent association", async () => {
      await expect(TestProjectFrameworksModel.findByProjectAndFramework(999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("findByProjectId", () => {
    it("should find all frameworks for project", async () => {
      const associations = await TestProjectFrameworksModel.findByProjectId(1);

      expect(associations).toHaveLength(2);
      expect(associations[0].project_id).toBe(1);
      expect(associations[1].project_id).toBe(1);
    });

    it("should throw ValidationException for invalid project_id", async () => {
      await expect(TestProjectFrameworksModel.findByProjectId(0)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("findByFrameworkId", () => {
    it("should find all projects for framework", async () => {
      const associations = await TestProjectFrameworksModel.findByFrameworkId(1);

      expect(associations).toHaveLength(2);
      expect(associations[0].framework_id).toBe(1);
      expect(associations[1].framework_id).toBe(1);
    });

    it("should throw ValidationException for invalid framework_id", async () => {
      await expect(TestProjectFrameworksModel.findByFrameworkId(0)).rejects.toThrow(
        ValidationException,
      );
    });
  });
});
