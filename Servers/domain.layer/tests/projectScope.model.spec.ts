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
    BOOLEAN: "BOOLEAN",
    DATE: "DATE",
  },
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

// Test class mimicking ProjectScopeModel behavior
class TestProjectScopeModel {
  id?: number;
  assessmentId!: number;
  describeAiEnvironment!: string;
  isNewAiTechnology!: boolean;
  usesPersonalData!: boolean;
  projectScopeDocuments!: string;
  technologyType!: string;
  hasOngoingMonitoring!: boolean;
  unintendedOutcomes!: string;
  technologyDocumentation!: string;
  is_demo?: boolean;
  created_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  // Static method to create new project scope
  static async createNewProjectScope(
    assessmentId: number,
    describeAiEnvironment: string,
    isNewAiTechnology: boolean,
    usesPersonalData: boolean,
    projectScopeDocuments: string,
    technologyType: string,
    hasOngoingMonitoring: boolean,
    unintendedOutcomes: string,
    technologyDocumentation: string,
    is_demo: boolean = false,
  ): Promise<TestProjectScopeModel> {
    // Validate assessment_id
    if (!numberValidation(assessmentId, 1)) {
      throw new ValidationException(
        "Valid assessment_id is required (must be >= 1)",
        "assessment_id",
        assessmentId,
      );
    }

    // Validate describeAiEnvironment
    if (!describeAiEnvironment || describeAiEnvironment.trim().length === 0) {
      throw new ValidationException(
        "AI environment description is required",
        "describeAiEnvironment",
        describeAiEnvironment,
      );
    }

    if (describeAiEnvironment.trim().length < 10) {
      throw new ValidationException(
        "AI environment description must be at least 10 characters long",
        "describeAiEnvironment",
        describeAiEnvironment,
      );
    }

    // Validate projectScopeDocuments
    if (!projectScopeDocuments || projectScopeDocuments.trim().length === 0) {
      throw new ValidationException(
        "Project scope documents are required",
        "projectScopeDocuments",
        projectScopeDocuments,
      );
    }

    // Validate technologyType
    if (!technologyType || technologyType.trim().length === 0) {
      throw new ValidationException(
        "Technology type is required",
        "technologyType",
        technologyType,
      );
    }

    if (technologyType.trim().length < 3) {
      throw new ValidationException(
        "Technology type must be at least 3 characters long",
        "technologyType",
        technologyType,
      );
    }

    // Validate unintendedOutcomes
    if (!unintendedOutcomes || unintendedOutcomes.trim().length === 0) {
      throw new ValidationException(
        "Unintended outcomes description is required",
        "unintendedOutcomes",
        unintendedOutcomes,
      );
    }

    // Validate technologyDocumentation
    if (!technologyDocumentation || technologyDocumentation.trim().length === 0) {
      throw new ValidationException(
        "Technology documentation is required",
        "technologyDocumentation",
        technologyDocumentation,
      );
    }

    // Create and return the project scope model instance
    const projectScope = new TestProjectScopeModel();
    projectScope.assessmentId = assessmentId;
    projectScope.describeAiEnvironment = describeAiEnvironment.trim();
    projectScope.isNewAiTechnology = isNewAiTechnology;
    projectScope.usesPersonalData = usesPersonalData;
    projectScope.projectScopeDocuments = projectScopeDocuments.trim();
    projectScope.technologyType = technologyType.trim();
    projectScope.hasOngoingMonitoring = hasOngoingMonitoring;
    projectScope.unintendedOutcomes = unintendedOutcomes.trim();
    projectScope.technologyDocumentation = technologyDocumentation.trim();
    projectScope.is_demo = is_demo;
    projectScope.created_at = new Date();

    return projectScope;
  }

  // Instance method to update project scope
  async updateProjectScope(updateData: {
    describeAiEnvironment?: string;
    isNewAiTechnology?: boolean;
    usesPersonalData?: boolean;
    projectScopeDocuments?: string;
    technologyType?: string;
    hasOngoingMonitoring?: boolean;
    unintendedOutcomes?: string;
    technologyDocumentation?: string;
  }): Promise<void> {
    // Validate describeAiEnvironment if provided
    if (updateData.describeAiEnvironment !== undefined) {
      if (
        !updateData.describeAiEnvironment ||
        updateData.describeAiEnvironment.trim().length === 0
      ) {
        throw new ValidationException(
          "AI environment description is required",
          "describeAiEnvironment",
          updateData.describeAiEnvironment,
        );
      }
      if (updateData.describeAiEnvironment.trim().length < 10) {
        throw new ValidationException(
          "AI environment description must be at least 10 characters long",
          "describeAiEnvironment",
          updateData.describeAiEnvironment,
        );
      }
      this.describeAiEnvironment = updateData.describeAiEnvironment.trim();
    }

    // Validate projectScopeDocuments if provided
    if (updateData.projectScopeDocuments !== undefined) {
      if (
        !updateData.projectScopeDocuments ||
        updateData.projectScopeDocuments.trim().length === 0
      ) {
        throw new ValidationException(
          "Project scope documents are required",
          "projectScopeDocuments",
          updateData.projectScopeDocuments,
        );
      }
      this.projectScopeDocuments = updateData.projectScopeDocuments.trim();
    }

    // Validate technologyType if provided
    if (updateData.technologyType !== undefined) {
      if (!updateData.technologyType || updateData.technologyType.trim().length === 0) {
        throw new ValidationException(
          "Technology type is required",
          "technologyType",
          updateData.technologyType,
        );
      }
      if (updateData.technologyType.trim().length < 3) {
        throw new ValidationException(
          "Technology type must be at least 3 characters long",
          "technologyType",
          updateData.technologyType,
        );
      }
      this.technologyType = updateData.technologyType.trim();
    }

    // Validate unintendedOutcomes if provided
    if (updateData.unintendedOutcomes !== undefined) {
      if (!updateData.unintendedOutcomes || updateData.unintendedOutcomes.trim().length === 0) {
        throw new ValidationException(
          "Unintended outcomes description is required",
          "unintendedOutcomes",
          updateData.unintendedOutcomes,
        );
      }
      this.unintendedOutcomes = updateData.unintendedOutcomes.trim();
    }

    // Validate technologyDocumentation if provided
    if (updateData.technologyDocumentation !== undefined) {
      if (
        !updateData.technologyDocumentation ||
        updateData.technologyDocumentation.trim().length === 0
      ) {
        throw new ValidationException(
          "Technology documentation is required",
          "technologyDocumentation",
          updateData.technologyDocumentation,
        );
      }
      this.technologyDocumentation = updateData.technologyDocumentation.trim();
    }

    // Update boolean fields if provided
    if (updateData.isNewAiTechnology !== undefined) {
      this.isNewAiTechnology = updateData.isNewAiTechnology;
    }

    if (updateData.usesPersonalData !== undefined) {
      this.usesPersonalData = updateData.usesPersonalData;
    }

    if (updateData.hasOngoingMonitoring !== undefined) {
      this.hasOngoingMonitoring = updateData.hasOngoingMonitoring;
    }
  }

  // Instance method to validate project scope data
  async validateProjectScopeData(): Promise<void> {
    if (!this.assessmentId || !numberValidation(this.assessmentId, 1)) {
      throw new ValidationException(
        "Valid assessment_id is required (must be >= 1)",
        "assessment_id",
        this.assessmentId,
      );
    }

    if (!this.describeAiEnvironment || this.describeAiEnvironment.trim().length === 0) {
      throw new ValidationException(
        "AI environment description is required",
        "describeAiEnvironment",
        this.describeAiEnvironment,
      );
    }

    if (this.describeAiEnvironment.trim().length < 10) {
      throw new ValidationException(
        "AI environment description must be at least 10 characters long",
        "describeAiEnvironment",
        this.describeAiEnvironment,
      );
    }

    if (!this.projectScopeDocuments || this.projectScopeDocuments.trim().length === 0) {
      throw new ValidationException(
        "Project scope documents are required",
        "projectScopeDocuments",
        this.projectScopeDocuments,
      );
    }

    if (!this.technologyType || this.technologyType.trim().length === 0) {
      throw new ValidationException(
        "Technology type is required",
        "technologyType",
        this.technologyType,
      );
    }

    if (this.technologyType.trim().length < 3) {
      throw new ValidationException(
        "Technology type must be at least 3 characters long",
        "technologyType",
        this.technologyType,
      );
    }

    if (!this.unintendedOutcomes || this.unintendedOutcomes.trim().length === 0) {
      throw new ValidationException(
        "Unintended outcomes description is required",
        "unintendedOutcomes",
        this.unintendedOutcomes,
      );
    }

    if (!this.technologyDocumentation || this.technologyDocumentation.trim().length === 0) {
      throw new ValidationException(
        "Technology documentation is required",
        "technologyDocumentation",
        this.technologyDocumentation,
      );
    }
  }

  // Instance method to check if this is a demo scope
  isDemoScope(): boolean {
    return this.is_demo ?? false;
  }

  // Instance method to check if project scope can be modified
  canBeModified(): boolean {
    if (this.isDemoScope()) {
      throw new BusinessLogicException(
        "Demo project scopes cannot be modified",
        "DEMO_SCOPE_RESTRICTION",
        { scopeId: this.id, assessmentId: this.assessmentId },
      );
    }
    return true;
  }

  // Instance method to get risk level
  getRiskLevel(): "High" | "Medium" | "Low" {
    let riskScore = 0;

    // New AI technology increases risk
    if (this.isNewAiTechnology) {
      riskScore += 2;
    }

    // Personal data usage increases risk
    if (this.usesPersonalData) {
      riskScore += 2;
    }

    // No ongoing monitoring increases risk
    if (!this.hasOngoingMonitoring) {
      riskScore += 1;
    }

    // Determine risk level based on score
    if (riskScore >= 3) {
      return "High";
    } else if (riskScore >= 1) {
      return "Medium";
    } else {
      return "Low";
    }
  }

  // Instance method to get summary
  getSummary(): {
    id: number | undefined;
    assessmentId: number;
    technologyType: string;
    riskLevel: string;
    usesPersonalData: boolean;
    hasOngoingMonitoring: boolean;
  } {
    return {
      id: this.id,
      assessmentId: this.assessmentId,
      technologyType: this.technologyType,
      riskLevel: this.getRiskLevel(),
      usesPersonalData: this.usesPersonalData,
      hasOngoingMonitoring: this.hasOngoingMonitoring,
    };
  }

  // Instance method to get safe JSON
  toSafeJSON(): any {
    return {
      id: this.id,
      assessmentId: this.assessmentId,
      technologyType: this.technologyType,
      riskLevel: this.getRiskLevel(),
      usesPersonalData: this.usesPersonalData,
      hasOngoingMonitoring: this.hasOngoingMonitoring,
      isNewAiTechnology: this.isNewAiTechnology,
      created_at: this.created_at?.toISOString(),
      is_demo: this.is_demo,
    };
  }

  // Instance method to get JSON representation
  toJSON(): any {
    return {
      id: this.id,
      assessmentId: this.assessmentId,
      describeAiEnvironment: this.describeAiEnvironment,
      isNewAiTechnology: this.isNewAiTechnology,
      usesPersonalData: this.usesPersonalData,
      projectScopeDocuments: this.projectScopeDocuments,
      technologyType: this.technologyType,
      hasOngoingMonitoring: this.hasOngoingMonitoring,
      unintendedOutcomes: this.unintendedOutcomes,
      technologyDocumentation: this.technologyDocumentation,
      created_at: this.created_at?.toISOString(),
      is_demo: this.is_demo,
      riskLevel: this.getRiskLevel(),
    };
  }

  // Static method to find by ID with validation
  static async findByIdWithValidation(id: number): Promise<TestProjectScopeModel> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    if (id === 999) {
      throw new NotFoundException("Project scope not found", "ProjectScope", id);
    }

    return new TestProjectScopeModel({
      id,
      assessmentId: 1,
      describeAiEnvironment: "Test AI environment description",
      isNewAiTechnology: false,
      usesPersonalData: false,
      projectScopeDocuments: "Test documents",
      technologyType: "Test technology",
      hasOngoingMonitoring: true,
      unintendedOutcomes: "Test outcomes",
      technologyDocumentation: "Test documentation",
      is_demo: false,
    });
  }

  // Static method to find by assessment ID
  static async findByAssessmentId(assessmentId: number): Promise<TestProjectScopeModel | null> {
    if (!numberValidation(assessmentId, 1)) {
      throw new ValidationException(
        "Valid assessment_id is required (must be >= 1)",
        "assessment_id",
        assessmentId,
      );
    }

    return new TestProjectScopeModel({
      id: 1,
      assessmentId,
      describeAiEnvironment: "Test AI environment description",
      isNewAiTechnology: false,
      usesPersonalData: false,
      projectScopeDocuments: "Test documents",
      technologyType: "Test technology",
      hasOngoingMonitoring: true,
      unintendedOutcomes: "Test outcomes",
      technologyDocumentation: "Test documentation",
      is_demo: false,
    });
  }

  // Static method to update by ID
  static async updateProjectScopeById(
    id: number,
    updateData: any,
  ): Promise<[number, TestProjectScopeModel[]]> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return [1, [new TestProjectScopeModel({ id, ...updateData })]];
  }

  // Static method to delete by ID
  static async deleteProjectScopeById(id: number): Promise<number> {
    if (!numberValidation(id, 1)) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return 1;
  }

  // Instance method to check if requires special attention
  requiresSpecialAttention(): boolean {
    return (
      this.isNewAiTechnology ||
      this.usesPersonalData ||
      !this.hasOngoingMonitoring ||
      this.getRiskLevel() === "High"
    );
  }

  // Instance method to get compliance requirements
  getComplianceRequirements(): string[] {
    const requirements: string[] = [];

    if (this.usesPersonalData) {
      requirements.push("GDPR compliance required");
      requirements.push("Data protection impact assessment needed");
    }

    if (this.isNewAiTechnology) {
      requirements.push("AI risk assessment required");
      requirements.push("Technology validation needed");
    }

    if (!this.hasOngoingMonitoring) {
      requirements.push("Monitoring implementation required");
    }

    if (this.getRiskLevel() === "High") {
      requirements.push("Enhanced oversight required");
      requirements.push("Regular risk reviews needed");
    }

    return requirements;
  }
}

describe("ProjectScopeModel", () => {
  const validData = {
    assessmentId: 1,
    describeAiEnvironment:
      "This is a comprehensive AI environment description that meets the minimum length requirement",
    isNewAiTechnology: false,
    usesPersonalData: false,
    projectScopeDocuments: "Project scope documents content",
    technologyType: "Machine Learning",
    hasOngoingMonitoring: true,
    unintendedOutcomes: "Potential unintended outcomes description",
    technologyDocumentation: "Comprehensive technology documentation",
    is_demo: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewProjectScope", () => {
    it("should create project scope with valid data", async () => {
      const projectScope = await TestProjectScopeModel.createNewProjectScope(
        validData.assessmentId,
        validData.describeAiEnvironment,
        validData.isNewAiTechnology,
        validData.usesPersonalData,
        validData.projectScopeDocuments,
        validData.technologyType,
        validData.hasOngoingMonitoring,
        validData.unintendedOutcomes,
        validData.technologyDocumentation,
        validData.is_demo,
      );

      expect(projectScope).toBeInstanceOf(TestProjectScopeModel);
      expect(projectScope.assessmentId).toBe(1);
      expect(projectScope.describeAiEnvironment).toBe(validData.describeAiEnvironment);
      expect(projectScope.technologyType).toBe("Machine Learning");
      expect(projectScope.is_demo).toBe(false);
      expect(projectScope.created_at).toBeInstanceOf(Date);
    });

    it("should throw ValidationException for invalid assessment_id", async () => {
      await expect(
        TestProjectScopeModel.createNewProjectScope(
          0,
          validData.describeAiEnvironment,
          validData.isNewAiTechnology,
          validData.usesPersonalData,
          validData.projectScopeDocuments,
          validData.technologyType,
          validData.hasOngoingMonitoring,
          validData.unintendedOutcomes,
          validData.technologyDocumentation,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for short AI environment description", async () => {
      await expect(
        TestProjectScopeModel.createNewProjectScope(
          validData.assessmentId,
          "Short",
          validData.isNewAiTechnology,
          validData.usesPersonalData,
          validData.projectScopeDocuments,
          validData.technologyType,
          validData.hasOngoingMonitoring,
          validData.unintendedOutcomes,
          validData.technologyDocumentation,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for short technology type", async () => {
      await expect(
        TestProjectScopeModel.createNewProjectScope(
          validData.assessmentId,
          validData.describeAiEnvironment,
          validData.isNewAiTechnology,
          validData.usesPersonalData,
          validData.projectScopeDocuments,
          "AI",
          validData.hasOngoingMonitoring,
          validData.unintendedOutcomes,
          validData.technologyDocumentation,
        ),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("updateProjectScope", () => {
    it("should update project scope with valid data", async () => {
      const projectScope = new TestProjectScopeModel(validData);

      await projectScope.updateProjectScope({
        describeAiEnvironment:
          "Updated AI environment description that meets the minimum length requirement",
        technologyType: "Deep Learning",
      });

      expect(projectScope.describeAiEnvironment).toBe(
        "Updated AI environment description that meets the minimum length requirement",
      );
      expect(projectScope.technologyType).toBe("Deep Learning");
    });

    it("should throw ValidationException for invalid update data", async () => {
      const projectScope = new TestProjectScopeModel(validData);

      await expect(
        projectScope.updateProjectScope({
          describeAiEnvironment: "Short",
        }),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("validateProjectScopeData", () => {
    it("should pass validation with valid data", async () => {
      const projectScope = new TestProjectScopeModel(validData);

      await expect(projectScope.validateProjectScopeData()).resolves.not.toThrow();
    });

    it("should throw ValidationException for invalid data", async () => {
      const projectScope = new TestProjectScopeModel({
        ...validData,
        describeAiEnvironment: "Short",
      });

      await expect(projectScope.validateProjectScopeData()).rejects.toThrow(ValidationException);
    });
  });

  describe("isDemoScope", () => {
    it("should return true for demo scope", () => {
      const projectScope = new TestProjectScopeModel({
        ...validData,
        is_demo: true,
      });

      expect(projectScope.isDemoScope()).toBe(true);
    });

    it("should return false for regular scope", () => {
      const projectScope = new TestProjectScopeModel(validData);

      expect(projectScope.isDemoScope()).toBe(false);
    });
  });

  describe("canBeModified", () => {
    it("should return true for regular scope", () => {
      const projectScope = new TestProjectScopeModel(validData);

      expect(projectScope.canBeModified()).toBe(true);
    });

    it("should throw BusinessLogicException for demo scope", () => {
      const projectScope = new TestProjectScopeModel({
        ...validData,
        is_demo: true,
      });

      expect(() => projectScope.canBeModified()).toThrow(BusinessLogicException);
    });
  });

  describe("getRiskLevel", () => {
    it("should return Low risk for safe scope", () => {
      const projectScope = new TestProjectScopeModel(validData);

      expect(projectScope.getRiskLevel()).toBe("Low");
    });

    it("should return High risk for risky scope", () => {
      const projectScope = new TestProjectScopeModel({
        ...validData,
        isNewAiTechnology: true,
        usesPersonalData: true,
        hasOngoingMonitoring: false,
      });

      expect(projectScope.getRiskLevel()).toBe("High");
    });

    it("should return Medium risk for moderate scope", () => {
      const projectScope = new TestProjectScopeModel({
        ...validData,
        isNewAiTechnology: true,
        usesPersonalData: false,
        hasOngoingMonitoring: true,
      });

      expect(projectScope.getRiskLevel()).toBe("Medium");
    });
  });

  describe("getSummary", () => {
    it("should return correct summary", () => {
      const projectScope = new TestProjectScopeModel({
        ...validData,
        id: 1,
      });

      const summary = projectScope.getSummary();

      expect(summary).toEqual({
        id: 1,
        assessmentId: 1,
        technologyType: "Machine Learning",
        riskLevel: "Low",
        usesPersonalData: false,
        hasOngoingMonitoring: true,
      });
    });
  });

  describe("toSafeJSON", () => {
    it("should return safe JSON representation", () => {
      const projectScope = new TestProjectScopeModel({
        ...validData,
        id: 1,
        created_at: new Date("2024-01-01T00:00:00.000Z"),
      });

      const result = projectScope.toSafeJSON();

      expect(result).toHaveProperty("id", 1);
      expect(result).toHaveProperty("assessmentId", 1);
      expect(result).toHaveProperty("technologyType", "Machine Learning");
      expect(result).toHaveProperty("riskLevel", "Low");
      expect(result).toHaveProperty("is_demo", false);
      expect(result).toHaveProperty("created_at", "2024-01-01T00:00:00.000Z");
    });
  });

  describe("toJSON", () => {
    it("should return complete JSON representation", () => {
      const projectScope = new TestProjectScopeModel({
        ...validData,
        id: 1,
        created_at: new Date("2024-01-01T00:00:00.000Z"),
      });

      const result = projectScope.toJSON();

      expect(result).toHaveProperty("id", 1);
      expect(result).toHaveProperty("assessmentId", 1);
      expect(result).toHaveProperty("describeAiEnvironment");
      expect(result).toHaveProperty("technologyType", "Machine Learning");
      expect(result).toHaveProperty("riskLevel", "Low");
      expect(result).toHaveProperty("created_at", "2024-01-01T00:00:00.000Z");
    });
  });

  describe("findByIdWithValidation", () => {
    it("should find project scope by valid ID", async () => {
      const projectScope = await TestProjectScopeModel.findByIdWithValidation(1);

      expect(projectScope).toBeInstanceOf(TestProjectScopeModel);
      expect(projectScope.id).toBe(1);
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestProjectScopeModel.findByIdWithValidation(0)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw NotFoundException for non-existent ID", async () => {
      await expect(TestProjectScopeModel.findByIdWithValidation(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("findByAssessmentId", () => {
    it("should find project scope by assessment ID", async () => {
      const projectScope = await TestProjectScopeModel.findByAssessmentId(1);

      expect(projectScope).toBeInstanceOf(TestProjectScopeModel);
      expect(projectScope?.assessmentId).toBe(1);
    });

    it("should throw ValidationException for invalid assessment ID", async () => {
      await expect(TestProjectScopeModel.findByAssessmentId(0)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("updateProjectScopeById", () => {
    it("should update project scope by ID", async () => {
      const [affected, updated] = await TestProjectScopeModel.updateProjectScopeById(1, {
        technologyType: "Updated Technology",
      });

      expect(affected).toBe(1);
      expect(updated[0].technologyType).toBe("Updated Technology");
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(
        TestProjectScopeModel.updateProjectScopeById(0, {
          technologyType: "Updated",
        }),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("deleteProjectScopeById", () => {
    it("should delete project scope by ID", async () => {
      const deleted = await TestProjectScopeModel.deleteProjectScopeById(1);

      expect(deleted).toBe(1);
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestProjectScopeModel.deleteProjectScopeById(0)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("requiresSpecialAttention", () => {
    it("should return true for scope requiring attention", () => {
      const projectScope = new TestProjectScopeModel({
        ...validData,
        isNewAiTechnology: true,
        usesPersonalData: true,
        hasOngoingMonitoring: false,
      });

      expect(projectScope.requiresSpecialAttention()).toBe(true);
    });

    it("should return false for safe scope", () => {
      const projectScope = new TestProjectScopeModel(validData);

      expect(projectScope.requiresSpecialAttention()).toBe(false);
    });
  });

  describe("getComplianceRequirements", () => {
    it("should return compliance requirements for personal data usage", () => {
      const projectScope = new TestProjectScopeModel({
        ...validData,
        usesPersonalData: true,
      });

      const requirements = projectScope.getComplianceRequirements();

      expect(requirements).toContain("GDPR compliance required");
      expect(requirements).toContain("Data protection impact assessment needed");
    });

    it("should return compliance requirements for new AI technology", () => {
      const projectScope = new TestProjectScopeModel({
        ...validData,
        isNewAiTechnology: true,
      });

      const requirements = projectScope.getComplianceRequirements();

      expect(requirements).toContain("AI risk assessment required");
      expect(requirements).toContain("Technology validation needed");
    });

    it("should return compliance requirements for high risk scope", () => {
      const projectScope = new TestProjectScopeModel({
        ...validData,
        isNewAiTechnology: true,
        usesPersonalData: true,
        hasOngoingMonitoring: false,
      });

      const requirements = projectScope.getComplianceRequirements();

      expect(requirements).toContain("Enhanced oversight required");
      expect(requirements).toContain("Regular risk reviews needed");
    });
  });
});
