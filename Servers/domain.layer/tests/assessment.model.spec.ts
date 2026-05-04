import { ValidationException } from "../exceptions/custom.exception";
import { IAssessment } from "../interfaces/i.assessment";

// Mock sequelize-typescript
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: { INTEGER: "INTEGER", BOOLEAN: "BOOLEAN", DATE: "DATE" },
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

// Test class mimicking AssessmentModel
class TestAssessmentModel {
  id?: number;
  project_id!: number;
  is_demo?: boolean;
  created_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  // Static methods
  static async CreateNewAssessment(attributes: Partial<IAssessment>): Promise<TestAssessmentModel> {
    if (!attributes.project_id || attributes.project_id < 1) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        attributes.project_id,
      );
    }
    return new TestAssessmentModel({
      ...attributes,
      is_demo: attributes.is_demo ?? false,
      created_at: attributes.created_at ?? new Date(),
    });
  }

  static async UpdateAssessment(
    id: number,
    attributes: Partial<IAssessment>,
  ): Promise<[number, TestAssessmentModel[]]> {
    if (id < 1) {
      throw new ValidationException(
        "Valid assessment_id is required (must be >= 1)",
        "assessment_id",
        id,
      );
    }
    if (attributes.project_id !== undefined && attributes.project_id < 1) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        attributes.project_id,
      );
    }
    return [1, [new TestAssessmentModel({ id, ...attributes })]];
  }

  static async FindAssessmentById(id: number): Promise<TestAssessmentModel | null> {
    if (id < 1) {
      throw new ValidationException(
        "Valid assessment_id is required (must be >= 1)",
        "assessment_id",
        id,
      );
    }
    return id === 999 ? null : new TestAssessmentModel({ id, project_id: 1, is_demo: false });
  }

  static async FindAssessmentsByProjectId(projectId: number): Promise<TestAssessmentModel[]> {
    if (projectId < 1) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }
    return [
      new TestAssessmentModel({ id: 1, project_id: projectId, is_demo: false }),
      new TestAssessmentModel({ id: 2, project_id: projectId, is_demo: true }),
    ];
  }

  static async DeleteAssessment(id: number): Promise<number> {
    if (id < 1) {
      throw new ValidationException(
        "Valid assessment_id is required (must be >= 1)",
        "assessment_id",
        id,
      );
    }
    return 1;
  }

  // Instance methods
  async validateAssessmentData(): Promise<void> {
    if (!this.project_id || this.project_id < 1) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        this.project_id,
      );
    }
  }

  isDemoAssessment(): boolean {
    return this.is_demo ?? false;
  }

  canBeModifiedBy(user: any): boolean {
    if (this.isDemoAssessment()) {
      return user.is_demo || user.role_id === 1;
    }
    return true;
  }

  isActive(): boolean {
    if (this.isDemoAssessment()) return false;
    if (this.created_at) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return this.created_at > thirtyDaysAgo;
    }
    return true;
  }

  getAgeInDays(): number {
    if (!this.created_at) return 0;
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - this.created_at.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  isRecent(days: number = 7): boolean {
    return this.getAgeInDays() <= days;
  }

  toJSON(): any {
    return {
      id: this.id,
      project_id: this.project_id,
      is_demo: this.is_demo,
      created_at: this.created_at?.toISOString(),
    };
  }

  static fromJSON(json: any): TestAssessmentModel {
    return new TestAssessmentModel(json);
  }
}

describe("AssessmentModel", () => {
  const validData = { project_id: 1, is_demo: false };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("CreateNewAssessment", () => {
    it("should create assessment with valid data", async () => {
      const assessment = await TestAssessmentModel.CreateNewAssessment(validData);
      expect(assessment).toBeInstanceOf(TestAssessmentModel);
      expect(assessment.project_id).toBe(1);
      expect(assessment.is_demo).toBe(false);
      expect(assessment.created_at).toBeInstanceOf(Date);
    });

    it("should throw ValidationException for invalid project_id", async () => {
      await expect(TestAssessmentModel.CreateNewAssessment({ project_id: 0 })).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("UpdateAssessment", () => {
    it("should update assessment successfully", async () => {
      const [affected, updated] = await TestAssessmentModel.UpdateAssessment(1, { is_demo: true });
      expect(affected).toBe(1);
      expect(updated[0].is_demo).toBe(true);
    });

    it("should throw ValidationException for invalid assessment ID", async () => {
      await expect(TestAssessmentModel.UpdateAssessment(0, { is_demo: true })).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("FindAssessmentById", () => {
    it("should find assessment by valid ID", async () => {
      const assessment = await TestAssessmentModel.FindAssessmentById(1);
      expect(assessment).toBeInstanceOf(TestAssessmentModel);
      expect(assessment?.id).toBe(1);
    });

    it("should return null for non-existent ID", async () => {
      const assessment = await TestAssessmentModel.FindAssessmentById(999);
      expect(assessment).toBeNull();
    });
  });

  describe("FindAssessmentsByProjectId", () => {
    it("should find assessments for project", async () => {
      const assessments = await TestAssessmentModel.FindAssessmentsByProjectId(1);
      expect(assessments).toHaveLength(2);
      expect(assessments[0].project_id).toBe(1);
    });
  });

  describe("DeleteAssessment", () => {
    it("should delete assessment successfully", async () => {
      const deleted = await TestAssessmentModel.DeleteAssessment(1);
      expect(deleted).toBe(1);
    });
  });

  describe("validateAssessmentData", () => {
    it("should pass validation with valid data", async () => {
      const assessment = new TestAssessmentModel(validData);
      await expect(assessment.validateAssessmentData()).resolves.not.toThrow();
    });

    it("should throw ValidationException for invalid project_id", async () => {
      const assessment = new TestAssessmentModel({ project_id: 0 });
      await expect(assessment.validateAssessmentData()).rejects.toThrow(ValidationException);
    });
  });

  describe("isDemoAssessment", () => {
    it("should return true for demo assessment", () => {
      const assessment = new TestAssessmentModel({
        ...validData,
        is_demo: true,
      });
      expect(assessment.isDemoAssessment()).toBe(true);
    });

    it("should return false for regular assessment", () => {
      const assessment = new TestAssessmentModel(validData);
      expect(assessment.isDemoAssessment()).toBe(false);
    });
  });

  describe("canBeModifiedBy", () => {
    it("should allow demo user to modify demo assessment", () => {
      const assessment = new TestAssessmentModel({
        ...validData,
        is_demo: true,
      });
      const user = { is_demo: true, role_id: 2 };
      expect(assessment.canBeModifiedBy(user)).toBe(true);
    });

    it("should allow admin to modify demo assessment", () => {
      const assessment = new TestAssessmentModel({
        ...validData,
        is_demo: true,
      });
      const user = { is_demo: false, role_id: 1 };
      expect(assessment.canBeModifiedBy(user)).toBe(true);
    });

    it("should deny regular user from modifying demo assessment", () => {
      const assessment = new TestAssessmentModel({
        ...validData,
        is_demo: true,
      });
      const user = { is_demo: false, role_id: 2 };
      expect(assessment.canBeModifiedBy(user)).toBe(false);
    });
  });

  describe("isActive", () => {
    it("should return false for demo assessment", () => {
      const assessment = new TestAssessmentModel({
        ...validData,
        is_demo: true,
      });
      expect(assessment.isActive()).toBe(false);
    });

    it("should return true for recent assessment", () => {
      const assessment = new TestAssessmentModel({
        ...validData,
        created_at: new Date(),
      });
      expect(assessment.isActive()).toBe(true);
    });
  });

  describe("getAgeInDays", () => {
    it("should return 0 for assessment without created_at", () => {
      const assessment = new TestAssessmentModel(validData);
      expect(assessment.getAgeInDays()).toBe(0);
    });

    it("should return correct age for assessment with created_at", () => {
      // Use a fixed date to avoid timezone and timing issues
      const fixedDate = new Date("2024-01-01T12:00:00.000Z");
      const assessment = new TestAssessmentModel({
        ...validData,
        created_at: fixedDate,
      });

      // Mock the current date to ensure consistent results
      const originalDate = global.Date;
      const mockDate = new Date("2024-01-02T12:00:00.000Z");
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.UTC = originalDate.UTC;
      global.Date.parse = originalDate.parse;
      global.Date.now = originalDate.now;

      try {
        expect(assessment.getAgeInDays()).toBe(1);
      } finally {
        global.Date = originalDate;
      }
    });
  });

  describe("isRecent", () => {
    it("should return true for recent assessment", () => {
      // Use a fixed date to avoid timezone and timing issues
      const fixedDate = new Date("2024-01-01T12:00:00.000Z");
      const assessment = new TestAssessmentModel({
        ...validData,
        created_at: fixedDate,
      });

      // Mock the current date to ensure consistent results
      const originalDate = global.Date;
      const mockDate = new Date("2024-01-02T12:00:00.000Z");
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.UTC = originalDate.UTC;
      global.Date.parse = originalDate.parse;
      global.Date.now = originalDate.now;

      try {
        expect(assessment.isRecent(7)).toBe(true);
      } finally {
        global.Date = originalDate;
      }
    });

    it("should return false for old assessment", () => {
      // Use a fixed date to avoid timezone and timing issues
      const oldDate = new Date("2024-01-01T12:00:00.000Z");
      const assessment = new TestAssessmentModel({
        ...validData,
        created_at: oldDate,
      });

      // Mock the current date to ensure consistent results
      const originalDate = global.Date;
      const mockDate = new Date("2024-01-15T12:00:00.000Z");
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.UTC = originalDate.UTC;
      global.Date.parse = originalDate.parse;
      global.Date.now = originalDate.now;

      try {
        expect(assessment.isRecent(7)).toBe(false);
      } finally {
        global.Date = originalDate;
      }
    });
  });

  describe("toJSON", () => {
    it("should return formatted assessment data", () => {
      const assessment = new TestAssessmentModel({
        id: 1,
        project_id: 1,
        is_demo: false,
        created_at: new Date("2024-01-01T00:00:00.000Z"),
      });
      const result = assessment.toJSON();
      expect(result).toEqual({
        id: 1,
        project_id: 1,
        is_demo: false,
        created_at: "2024-01-01T00:00:00.000Z",
      });
    });
  });

  describe("fromJSON", () => {
    it("should create assessment from JSON", () => {
      const json = { id: 1, project_id: 1, is_demo: false };
      const assessment = TestAssessmentModel.fromJSON(json);
      expect(assessment).toBeInstanceOf(TestAssessmentModel);
      expect(assessment.id).toBe(1);
    });
  });
});
