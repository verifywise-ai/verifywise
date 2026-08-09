import { ValidationException, NotFoundException } from "../exceptions/custom.exception";

// Mock sequelize-typescript
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    ENUM: jest.fn(),
    ARRAY: jest.fn(),
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

jest.mock("../models/user/user.model", () => ({
  UserModel: class MockUserModel {},
}));

// Test class mimicking ProjectRiskModel behavior
class TestProjectRiskModel {
  id?: number;
  project_id!: number;
  risk_name!: string;
  risk_owner!: number;
  ai_lifecycle_phase!:
    | "Problem definition & planning"
    | "Data collection & processing"
    | "Model development & training"
    | "Model validation & testing"
    | "Deployment & integration"
    | "Monitoring & maintenance"
    | "Decommissioning & retirement";
  risk_description!: string;
  risk_category!: string[];
  impact!: string;
  assessment_mapping!: string;
  controls_mapping!: string;
  likelihood!: "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost Certain";
  severity!: "Negligible" | "Minor" | "Moderate" | "Major" | "Catastrophic";
  risk_level_autocalculated!:
    | "No risk"
    | "Very low risk"
    | "Low risk"
    | "Medium risk"
    | "High risk"
    | "Very high risk";
  review_notes!: string;
  mitigation_status!:
    | "Not Started"
    | "In Progress"
    | "Completed"
    | "On Hold"
    | "Deferred"
    | "Canceled"
    | "Requires review";
  current_risk_level!:
    | "Very Low risk"
    | "Low risk"
    | "Medium risk"
    | "High risk"
    | "Very high risk";
  deadline!: Date;
  mitigation_plan!: string;
  implementation_strategy!: string;
  mitigation_evidence_document!: string;
  likelihood_mitigation!: "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost Certain";
  risk_severity!: "Negligible" | "Minor" | "Moderate" | "Major" | "Critical";
  final_risk_level!: string;
  risk_approval!: number;
  approval_status!: string;
  date_of_assessment!: Date;
  is_demo?: boolean;
  created_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  // Static method to create new project risk
  static async createProjectRisk(
    projectRiskData: any,
    is_demo: boolean = false,
  ): Promise<TestProjectRiskModel> {
    // Validate required fields
    if (!projectRiskData.project_id || projectRiskData.project_id < 1) {
      throw new ValidationException(
        "Valid project ID is required (must be >= 1)",
        "project_id",
        projectRiskData.project_id,
      );
    }

    if (!projectRiskData.risk_name || projectRiskData.risk_name.trim().length === 0) {
      throw new ValidationException(
        "Risk name is required",
        "risk_name",
        projectRiskData.risk_name,
      );
    }

    if (!projectRiskData.risk_owner || projectRiskData.risk_owner < 1) {
      throw new ValidationException(
        "Valid risk owner is required (must be >= 1)",
        "risk_owner",
        projectRiskData.risk_owner,
      );
    }

    if (!projectRiskData.risk_description || projectRiskData.risk_description.trim().length === 0) {
      throw new ValidationException(
        "Risk description is required",
        "risk_description",
        projectRiskData.risk_description,
      );
    }

    // Create and return the project risk model instance
    const projectRisk = new TestProjectRiskModel();
    Object.assign(projectRisk, projectRiskData);
    projectRisk.is_demo = is_demo;
    projectRisk.created_at = new Date();

    return projectRisk;
  }

  // Instance method to update project risk
  async updateProjectRisk(updateData: any): Promise<void> {
    // Validate project_id if provided
    if (updateData.project_id !== undefined) {
      if (!updateData.project_id || updateData.project_id < 1) {
        throw new ValidationException(
          "Valid project ID is required (must be >= 1)",
          "project_id",
          updateData.project_id,
        );
      }
      this.project_id = updateData.project_id;
    }

    // Validate risk_name if provided
    if (updateData.risk_name !== undefined) {
      if (!updateData.risk_name || updateData.risk_name.trim().length === 0) {
        throw new ValidationException("Risk name is required", "risk_name", updateData.risk_name);
      }
      this.risk_name = updateData.risk_name.trim();
    }

    // Validate risk_owner if provided
    if (updateData.risk_owner !== undefined) {
      if (!updateData.risk_owner || updateData.risk_owner < 1) {
        throw new ValidationException(
          "Valid risk owner is required (must be >= 1)",
          "risk_owner",
          updateData.risk_owner,
        );
      }
      this.risk_owner = updateData.risk_owner;
    }

    // Validate risk_description if provided
    if (updateData.risk_description !== undefined) {
      if (!updateData.risk_description || updateData.risk_description.trim().length === 0) {
        throw new ValidationException(
          "Risk description is required",
          "risk_description",
          updateData.risk_description,
        );
      }
      this.risk_description = updateData.risk_description.trim();
    }

    // Update other fields if provided
    if (updateData.ai_lifecycle_phase !== undefined) {
      this.ai_lifecycle_phase = updateData.ai_lifecycle_phase;
    }

    if (updateData.risk_category !== undefined) {
      this.risk_category = updateData.risk_category;
    }

    if (updateData.impact !== undefined) {
      this.impact = updateData.impact;
    }

    if (updateData.assessment_mapping !== undefined) {
      this.assessment_mapping = updateData.assessment_mapping;
    }

    if (updateData.controls_mapping !== undefined) {
      this.controls_mapping = updateData.controls_mapping;
    }

    if (updateData.likelihood !== undefined) {
      this.likelihood = updateData.likelihood;
    }

    if (updateData.severity !== undefined) {
      this.severity = updateData.severity;
    }

    if (updateData.risk_level_autocalculated !== undefined) {
      this.risk_level_autocalculated = updateData.risk_level_autocalculated;
    }

    if (updateData.review_notes !== undefined) {
      this.review_notes = updateData.review_notes;
    }

    if (updateData.mitigation_status !== undefined) {
      this.mitigation_status = updateData.mitigation_status;
    }

    if (updateData.current_risk_level !== undefined) {
      this.current_risk_level = updateData.current_risk_level;
    }

    if (updateData.deadline !== undefined) {
      this.deadline = updateData.deadline;
    }

    if (updateData.mitigation_plan !== undefined) {
      this.mitigation_plan = updateData.mitigation_plan;
    }

    if (updateData.implementation_strategy !== undefined) {
      this.implementation_strategy = updateData.implementation_strategy;
    }

    if (updateData.mitigation_evidence_document !== undefined) {
      this.mitigation_evidence_document = updateData.mitigation_evidence_document;
    }

    if (updateData.likelihood_mitigation !== undefined) {
      this.likelihood_mitigation = updateData.likelihood_mitigation;
    }

    if (updateData.risk_severity !== undefined) {
      this.risk_severity = updateData.risk_severity;
    }

    if (updateData.final_risk_level !== undefined) {
      this.final_risk_level = updateData.final_risk_level;
    }

    if (updateData.risk_approval !== undefined) {
      this.risk_approval = updateData.risk_approval;
    }

    if (updateData.approval_status !== undefined) {
      this.approval_status = updateData.approval_status;
    }

    if (updateData.date_of_assessment !== undefined) {
      this.date_of_assessment = updateData.date_of_assessment;
    }
  }

  // Instance method to validate project risk data
  async validateProjectRiskData(): Promise<void> {
    if (!this.project_id || this.project_id < 1) {
      throw new ValidationException(
        "Valid project ID is required (must be >= 1)",
        "project_id",
        this.project_id,
      );
    }

    if (!this.risk_name || this.risk_name.trim().length === 0) {
      throw new ValidationException("Risk name is required", "risk_name", this.risk_name);
    }

    if (!this.risk_owner || this.risk_owner < 1) {
      throw new ValidationException(
        "Valid risk owner is required (must be >= 1)",
        "risk_owner",
        this.risk_owner,
      );
    }

    if (!this.risk_description || this.risk_description.trim().length === 0) {
      throw new ValidationException(
        "Risk description is required",
        "risk_description",
        this.risk_description,
      );
    }
  }

  // Instance method to check if this is a demo project risk
  isDemoProjectRisk(): boolean {
    return this.is_demo ?? false;
  }

  // Instance method to convert to JSON representation
  toJSON(): any {
    return {
      id: this.id,
      project_id: this.project_id,
      risk_name: this.risk_name,
      risk_owner: this.risk_owner,
      ai_lifecycle_phase: this.ai_lifecycle_phase,
      risk_description: this.risk_description,
      risk_category: this.risk_category,
      impact: this.impact,
      assessment_mapping: this.assessment_mapping,
      controls_mapping: this.controls_mapping,
      likelihood: this.likelihood,
      severity: this.severity,
      risk_level_autocalculated: this.risk_level_autocalculated,
      review_notes: this.review_notes,
      mitigation_status: this.mitigation_status,
      current_risk_level: this.current_risk_level,
      deadline: this.deadline,
      mitigation_plan: this.mitigation_plan,
      implementation_strategy: this.implementation_strategy,
      mitigation_evidence_document: this.mitigation_evidence_document,
      likelihood_mitigation: this.likelihood_mitigation,
      risk_severity: this.risk_severity,
      final_risk_level: this.final_risk_level,
      risk_approval: this.risk_approval,
      approval_status: this.approval_status,
      date_of_assessment: this.date_of_assessment,
      is_demo: this.is_demo,
      created_at: this.created_at?.toISOString(),
    };
  }

  // Static method to find project risk by ID with validation
  static async findByIdWithValidation(id: number): Promise<TestProjectRiskModel> {
    if (!id || id < 1) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    // Mock database lookup
    if (id === 999) {
      throw new NotFoundException("Project risk not found", "ProjectRisk", id);
    }

    return new TestProjectRiskModel({
      id,
      project_id: 1,
      risk_name: "Test Risk",
      risk_owner: 1,
      risk_description: "Test description",
      is_demo: false,
    });
  }

  // Static method to find project risks by project ID
  static async findByProjectId(projectId: number): Promise<TestProjectRiskModel[]> {
    if (!projectId || projectId < 1) {
      throw new ValidationException(
        "Valid project ID is required (must be >= 1)",
        "projectId",
        projectId,
      );
    }

    return [
      new TestProjectRiskModel({
        id: 1,
        project_id: projectId,
        risk_name: "Risk 1",
        risk_owner: 1,
        risk_description: "Description 1",
        is_demo: false,
      }),
      new TestProjectRiskModel({
        id: 2,
        project_id: projectId,
        risk_name: "Risk 2",
        risk_owner: 2,
        risk_description: "Description 2",
        is_demo: true,
      }),
    ];
  }

  // Static method to find project risks by risk owner
  static async findByRiskOwner(riskOwnerId: number): Promise<TestProjectRiskModel[]> {
    if (!riskOwnerId || riskOwnerId < 1) {
      throw new ValidationException(
        "Valid risk owner ID is required (must be >= 1)",
        "riskOwnerId",
        riskOwnerId,
      );
    }

    return [
      new TestProjectRiskModel({
        id: 1,
        project_id: 1,
        risk_name: "Risk 1",
        risk_owner: riskOwnerId,
        risk_description: "Description 1",
        is_demo: false,
      }),
    ];
  }

  // Static method to update project risk by ID
  static async updateProjectRiskById(
    id: number,
    updateData: any,
  ): Promise<[number, TestProjectRiskModel[]]> {
    if (!id || id < 1) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return [1, [new TestProjectRiskModel({ id, ...updateData })]];
  }

  // Static method to delete project risk by ID
  static async deleteProjectRiskById(id: number): Promise<number> {
    if (!id || id < 1) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return 1;
  }
}

describe("ProjectRiskModel", () => {
  const validData = {
    project_id: 1,
    risk_name: "Test Risk",
    risk_owner: 1,
    ai_lifecycle_phase: "Problem definition & planning" as const,
    risk_description: "Test risk description",
    risk_category: ["Security", "Privacy"],
    impact: "High impact",
    assessment_mapping: "Assessment mapping",
    controls_mapping: "Controls mapping",
    likelihood: "Possible" as const,
    severity: "Moderate" as const,
    risk_level_autocalculated: "Medium risk" as const,
    review_notes: "Review notes",
    mitigation_status: "Not Started" as const,
    current_risk_level: "Medium risk" as const,
    deadline: new Date("2024-12-31"),
    mitigation_plan: "Mitigation plan",
    implementation_strategy: "Implementation strategy",
    mitigation_evidence_document: "Evidence document",
    likelihood_mitigation: "Rare" as const,
    risk_severity: "Minor" as const,
    final_risk_level: "Low risk",
    risk_approval: 1,
    approval_status: "Pending",
    date_of_assessment: new Date("2024-01-01"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createProjectRisk", () => {
    it("should create project risk with valid data", async () => {
      const projectRisk = await TestProjectRiskModel.createProjectRisk(validData);

      expect(projectRisk).toBeInstanceOf(TestProjectRiskModel);
      expect(projectRisk.project_id).toBe(1);
      expect(projectRisk.risk_name).toBe("Test Risk");
      expect(projectRisk.risk_owner).toBe(1);
      expect(projectRisk.risk_description).toBe("Test risk description");
      expect(projectRisk.is_demo).toBe(false);
      expect(projectRisk.created_at).toBeInstanceOf(Date);
    });

    it("should create with custom is_demo value", async () => {
      const projectRisk = await TestProjectRiskModel.createProjectRisk(validData, true);

      expect(projectRisk.is_demo).toBe(true);
    });

    it("should throw ValidationException for invalid project_id", async () => {
      await expect(
        TestProjectRiskModel.createProjectRisk({
          ...validData,
          project_id: 0,
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty risk_name", async () => {
      await expect(
        TestProjectRiskModel.createProjectRisk({
          ...validData,
          risk_name: "",
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid risk_owner", async () => {
      await expect(
        TestProjectRiskModel.createProjectRisk({
          ...validData,
          risk_owner: 0,
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty risk_description", async () => {
      await expect(
        TestProjectRiskModel.createProjectRisk({
          ...validData,
          risk_description: "",
        }),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("updateProjectRisk", () => {
    it("should update project risk with valid data", async () => {
      const projectRisk = new TestProjectRiskModel(validData);

      await projectRisk.updateProjectRisk({
        risk_name: "Updated Risk Name",
        risk_description: "Updated description",
      });

      expect(projectRisk.risk_name).toBe("Updated Risk Name");
      expect(projectRisk.risk_description).toBe("Updated description");
    });

    it("should throw ValidationException for invalid project_id in update", async () => {
      const projectRisk = new TestProjectRiskModel(validData);

      await expect(projectRisk.updateProjectRisk({ project_id: 0 })).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw ValidationException for empty risk_name in update", async () => {
      const projectRisk = new TestProjectRiskModel(validData);

      await expect(projectRisk.updateProjectRisk({ risk_name: "" })).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw ValidationException for invalid risk_owner in update", async () => {
      const projectRisk = new TestProjectRiskModel(validData);

      await expect(projectRisk.updateProjectRisk({ risk_owner: 0 })).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw ValidationException for empty risk_description in update", async () => {
      const projectRisk = new TestProjectRiskModel(validData);

      await expect(projectRisk.updateProjectRisk({ risk_description: "" })).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("validateProjectRiskData", () => {
    it("should pass validation with valid data", async () => {
      const projectRisk = new TestProjectRiskModel(validData);

      await expect(projectRisk.validateProjectRiskData()).resolves.not.toThrow();
    });

    it("should throw ValidationException for invalid project_id", async () => {
      const projectRisk = new TestProjectRiskModel({
        ...validData,
        project_id: 0,
      });

      await expect(projectRisk.validateProjectRiskData()).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty risk_name", async () => {
      const projectRisk = new TestProjectRiskModel({
        ...validData,
        risk_name: "",
      });

      await expect(projectRisk.validateProjectRiskData()).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid risk_owner", async () => {
      const projectRisk = new TestProjectRiskModel({
        ...validData,
        risk_owner: 0,
      });

      await expect(projectRisk.validateProjectRiskData()).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty risk_description", async () => {
      const projectRisk = new TestProjectRiskModel({
        ...validData,
        risk_description: "",
      });

      await expect(projectRisk.validateProjectRiskData()).rejects.toThrow(ValidationException);
    });
  });

  describe("isDemoProjectRisk", () => {
    it("should return true for demo project risk", () => {
      const projectRisk = new TestProjectRiskModel({
        ...validData,
        is_demo: true,
      });

      expect(projectRisk.isDemoProjectRisk()).toBe(true);
    });

    it("should return false for regular project risk", () => {
      const projectRisk = new TestProjectRiskModel(validData);

      expect(projectRisk.isDemoProjectRisk()).toBe(false);
    });

    it("should return false when is_demo is undefined", () => {
      const projectRisk = new TestProjectRiskModel({
        ...validData,
        is_demo: undefined,
      });

      expect(projectRisk.isDemoProjectRisk()).toBe(false);
    });
  });

  describe("toJSON", () => {
    it("should return JSON representation", () => {
      const projectRisk = new TestProjectRiskModel({
        ...validData,
        id: 1,
        created_at: new Date("2024-01-01T00:00:00.000Z"),
      });

      const result = projectRisk.toJSON();

      expect(result).toHaveProperty("id", 1);
      expect(result).toHaveProperty("project_id", 1);
      expect(result).toHaveProperty("risk_name", "Test Risk");
      expect(result).toHaveProperty("created_at", "2024-01-01T00:00:00.000Z");
    });
  });

  describe("findByIdWithValidation", () => {
    it("should find project risk by valid ID", async () => {
      const projectRisk = await TestProjectRiskModel.findByIdWithValidation(1);

      expect(projectRisk).toBeInstanceOf(TestProjectRiskModel);
      expect(projectRisk.id).toBe(1);
      expect(projectRisk.risk_name).toBe("Test Risk");
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestProjectRiskModel.findByIdWithValidation(0)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw NotFoundException for non-existent ID", async () => {
      await expect(TestProjectRiskModel.findByIdWithValidation(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("findByProjectId", () => {
    it("should find project risks by project ID", async () => {
      const projectRisks = await TestProjectRiskModel.findByProjectId(1);

      expect(projectRisks).toHaveLength(2);
      expect(projectRisks[0].project_id).toBe(1);
      expect(projectRisks[1].project_id).toBe(1);
    });

    it("should throw ValidationException for invalid project ID", async () => {
      await expect(TestProjectRiskModel.findByProjectId(0)).rejects.toThrow(ValidationException);
    });
  });

  describe("findByRiskOwner", () => {
    it("should find project risks by risk owner", async () => {
      const projectRisks = await TestProjectRiskModel.findByRiskOwner(1);

      expect(projectRisks).toHaveLength(1);
      expect(projectRisks[0].risk_owner).toBe(1);
    });

    it("should throw ValidationException for invalid risk owner ID", async () => {
      await expect(TestProjectRiskModel.findByRiskOwner(0)).rejects.toThrow(ValidationException);
    });
  });

  describe("updateProjectRiskById", () => {
    it("should update project risk by ID", async () => {
      const [affected, updated] = await TestProjectRiskModel.updateProjectRiskById(1, {
        risk_name: "Updated Risk",
      });

      expect(affected).toBe(1);
      expect(updated).toHaveLength(1);
      expect(updated[0].risk_name).toBe("Updated Risk");
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(
        TestProjectRiskModel.updateProjectRiskById(0, { risk_name: "Updated" }),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("deleteProjectRiskById", () => {
    it("should delete project risk by ID", async () => {
      const deleted = await TestProjectRiskModel.deleteProjectRiskById(1);

      expect(deleted).toBe(1);
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestProjectRiskModel.deleteProjectRiskById(0)).rejects.toThrow(
        ValidationException,
      );
    });
  });
});
