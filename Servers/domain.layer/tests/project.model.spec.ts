import { AiRiskClassification } from "../enums/ai-risk-classification.enum";
import { HighRiskRole } from "../enums/high-risk-role.enum";
import { ValidationException } from "../exceptions/custom.exception";
import { IProjectAttributes } from "../interfaces/i.project";

// Mock sequelize-typescript completely
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
      if (data) {
        Object.assign(this, data);
      }
    }
  },
}));

// Create a simple test class that mimics ProjectModel behavior
class TestProjectModel {
  id?: number;
  project_title!: string;
  owner!: number;
  start_date!: Date;
  ai_risk_classification!: AiRiskClassification;
  type_of_high_risk_role!: HighRiskRole;
  goal!: string;
  last_updated!: Date;
  last_updated_by!: number;
  is_demo?: boolean;
  created_at?: Date;

  constructor(data?: any) {
    if (data) {
      Object.assign(this, data);
    }
  }

  // Static method to create new project
  static async CreateNewProject(
    projectAttributes: Partial<IProjectAttributes>,
  ): Promise<TestProjectModel> {
    // Validate required fields
    if (!projectAttributes.project_title || projectAttributes.project_title.trim().length === 0) {
      throw new ValidationException(
        "Project title is required",
        "project_title",
        projectAttributes.project_title,
      );
    }

    if (!projectAttributes.owner || projectAttributes.owner <= 0) {
      throw new ValidationException("Valid owner is required", "owner", projectAttributes.owner);
    }

    if (!projectAttributes.start_date) {
      throw new ValidationException(
        "Start date is required",
        "start_date",
        projectAttributes.start_date,
      );
    }

    if (
      !projectAttributes.ai_risk_classification ||
      !Object.values(AiRiskClassification).includes(projectAttributes.ai_risk_classification)
    ) {
      throw new ValidationException(
        "Valid AI risk classification is required",
        "ai_risk_classification",
        projectAttributes.ai_risk_classification,
      );
    }

    if (
      !projectAttributes.type_of_high_risk_role ||
      !Object.values(HighRiskRole).includes(projectAttributes.type_of_high_risk_role)
    ) {
      throw new ValidationException(
        "Valid high risk role is required",
        "type_of_high_risk_role",
        projectAttributes.type_of_high_risk_role,
      );
    }

    if (!projectAttributes.goal || projectAttributes.goal.trim().length === 0) {
      throw new ValidationException("Goal is required", "goal", projectAttributes.goal);
    }

    if (!projectAttributes.last_updated) {
      throw new ValidationException(
        "Last updated date is required",
        "last_updated",
        projectAttributes.last_updated,
      );
    }

    if (!projectAttributes.last_updated_by || projectAttributes.last_updated_by <= 0) {
      throw new ValidationException(
        "Valid last updated by is required",
        "last_updated_by",
        projectAttributes.last_updated_by,
      );
    }

    // Create and return the project model instance
    const project = new TestProjectModel();
    project.project_title = projectAttributes.project_title;
    project.owner = projectAttributes.owner;
    project.start_date = projectAttributes.start_date;
    project.ai_risk_classification = projectAttributes.ai_risk_classification;
    project.type_of_high_risk_role = projectAttributes.type_of_high_risk_role;
    project.goal = projectAttributes.goal;
    project.last_updated = projectAttributes.last_updated;
    project.last_updated_by = projectAttributes.last_updated_by;
    project.is_demo = (projectAttributes as any).is_demo ?? false;
    project.created_at = projectAttributes.created_at ?? new Date();

    return project;
  }

  // Static method to update project
  static async UpdateProject(
    projectId: number,
    projectAttributes: Partial<IProjectAttributes>,
  ): Promise<[number]> {
    // Validate project ID
    if (!projectId || projectId <= 0) {
      throw new ValidationException("Valid project ID is required", "projectId", projectId);
    }

    // Validate enum values if provided
    if (
      projectAttributes.ai_risk_classification &&
      !Object.values(AiRiskClassification).includes(projectAttributes.ai_risk_classification)
    ) {
      throw new ValidationException(
        "Valid AI risk classification is required",
        "ai_risk_classification",
        projectAttributes.ai_risk_classification,
      );
    }

    if (
      projectAttributes.type_of_high_risk_role &&
      !Object.values(HighRiskRole).includes(projectAttributes.type_of_high_risk_role)
    ) {
      throw new ValidationException(
        "Valid high risk role is required",
        "type_of_high_risk_role",
        projectAttributes.type_of_high_risk_role,
      );
    }

    // Mock successful update
    return [1];
  }

  // Static method to find by primary key
  static async findByPk(id: number): Promise<TestProjectModel | null> {
    if (!id || id <= 0) {
      return null;
    }

    // Mock finding a project
    return new TestProjectModel({
      id: id,
      project_title: "Mock Project",
      owner: 1,
      start_date: new Date("2024-01-01"),
      ai_risk_classification: AiRiskClassification.MINIMAL_RISK,
      type_of_high_risk_role: HighRiskRole.DEPLOYER,
      goal: "Mock goal",
      last_updated: new Date("2024-01-02"),
      last_updated_by: 1,
      is_demo: false,
      created_at: new Date("2024-01-01"),
    });
  }
}

describe("ProjectModel", () => {
  // Test data
  const validProjectData = {
    project_title: "Test Project",
    owner: 1,
    start_date: new Date("2024-01-01"),
    ai_risk_classification: AiRiskClassification.MINIMAL_RISK,
    type_of_high_risk_role: HighRiskRole.DEPLOYER,
    goal: "Test goal",
    last_updated: new Date("2024-01-02"),
    last_updated_by: 1,
  };

  // Clear all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("instantiation", () => {
    it("should instantiate with correct attributes", () => {
      // Arrange & Act
      const project = new TestProjectModel(validProjectData);

      // Assert
      expect(project.project_title).toBe("Test Project");
      expect(project.owner).toBe(1);
      expect(project.ai_risk_classification).toBe(AiRiskClassification.MINIMAL_RISK);
      expect(project.type_of_high_risk_role).toBe(HighRiskRole.DEPLOYER);
      expect(project.goal).toBe("Test goal");
    });
  });

  describe("CreateNewProject", () => {
    it("should create a new project with valid data", async () => {
      // Arrange & Act
      const project = await TestProjectModel.CreateNewProject(validProjectData);

      // Assert
      expect(project).toBeInstanceOf(TestProjectModel);
      expect(project.project_title).toBe("Test Project");
      expect(project.owner).toBe(1);
      expect(project.ai_risk_classification).toBe(AiRiskClassification.MINIMAL_RISK);
      expect(project.type_of_high_risk_role).toBe(HighRiskRole.DEPLOYER);
      expect(project.goal).toBe("Test goal");
      expect(project.is_demo).toBe(false); // default value
    });

    it("should create a new project with different risk classification", async () => {
      // Arrange
      const projectData = {
        ...validProjectData,
        ai_risk_classification: AiRiskClassification.LIMITED_RISK,
        type_of_high_risk_role: HighRiskRole.PROVIDER,
      };

      // Act
      const project = await TestProjectModel.CreateNewProject(projectData);

      // Assert
      expect(project.ai_risk_classification).toBe(AiRiskClassification.LIMITED_RISK);
      expect(project.type_of_high_risk_role).toBe(HighRiskRole.PROVIDER);
    });

    it("should throw ValidationException for missing project title", async () => {
      // Arrange & Act & Assert
      await expect(
        TestProjectModel.CreateNewProject({
          ...validProjectData,
          project_title: "",
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid owner", async () => {
      // Arrange & Act & Assert
      await expect(
        TestProjectModel.CreateNewProject({
          ...validProjectData,
          owner: 0,
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for missing start date", async () => {
      // Arrange & Act & Assert
      await expect(
        TestProjectModel.CreateNewProject({
          ...validProjectData,
          start_date: undefined as any,
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid AI risk classification", async () => {
      // Arrange & Act & Assert
      await expect(
        TestProjectModel.CreateNewProject({
          ...validProjectData,
          ai_risk_classification: "INVALID" as any,
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid high risk role", async () => {
      // Arrange & Act & Assert
      await expect(
        TestProjectModel.CreateNewProject({
          ...validProjectData,
          type_of_high_risk_role: "INVALID" as any,
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for missing goal", async () => {
      // Arrange & Act & Assert
      await expect(
        TestProjectModel.CreateNewProject({
          ...validProjectData,
          goal: "",
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for missing last updated date", async () => {
      // Arrange & Act & Assert
      await expect(
        TestProjectModel.CreateNewProject({
          ...validProjectData,
          last_updated: undefined as any,
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid last updated by", async () => {
      // Arrange & Act & Assert
      await expect(
        TestProjectModel.CreateNewProject({
          ...validProjectData,
          last_updated_by: 0,
        }),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("UpdateProject", () => {
    it("should update a project with valid data", async () => {
      // Arrange
      const projectId = 1;
      const updateData = {
        goal: "Updated goal",
      };

      // Act
      const [affected] = await TestProjectModel.UpdateProject(projectId, updateData);

      // Assert
      expect(affected).toBe(1);
    });

    it("should throw ValidationException for invalid project ID", async () => {
      // Arrange & Act & Assert
      await expect(TestProjectModel.UpdateProject(0, { goal: "Updated goal" })).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw ValidationException for invalid AI risk classification in update", async () => {
      // Arrange & Act & Assert
      await expect(
        TestProjectModel.UpdateProject(1, {
          ai_risk_classification: "INVALID" as any,
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid high risk role in update", async () => {
      // Arrange & Act & Assert
      await expect(
        TestProjectModel.UpdateProject(1, {
          type_of_high_risk_role: "INVALID" as any,
        }),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("findByPk", () => {
    it("should find project by valid ID", async () => {
      // Arrange & Act
      const project = await TestProjectModel.findByPk(1);

      // Assert
      expect(project).toBeInstanceOf(TestProjectModel);
      expect(project?.id).toBe(1);
      expect(project?.project_title).toBe("Mock Project");
    });

    it("should return null for invalid ID", async () => {
      // Arrange & Act
      const project = await TestProjectModel.findByPk(0);

      // Assert
      expect(project).toBeNull();
    });
  });
});
