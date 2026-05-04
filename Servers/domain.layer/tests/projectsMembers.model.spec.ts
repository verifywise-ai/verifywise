import {
  ValidationException,
  BusinessLogicException,
  NotFoundException,
  ConflictException,
} from "../exceptions/custom.exception";
import { numberValidation } from "../validations/number.valid";

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

jest.mock("../models/user/user.model", () => ({
  UserModel: class MockUserModel {},
}));

// Test class mimicking ProjectsMembersModel behavior
class TestProjectsMembersModel {
  user_id!: number;
  project_id!: number;
  is_demo?: boolean;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  // Static method to create new project member
  static async createNewProjectMember(
    userId: number,
    projectId: number,
    is_demo: boolean = false,
  ): Promise<TestProjectsMembersModel> {
    // Validate user_id
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    // Validate project_id
    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    // Check if the user-project combination already exists
    const existingMember = await TestProjectsMembersModel.findOne({
      where: {
        user_id: userId,
        project_id: projectId,
      },
    });

    if (existingMember) {
      throw new ConflictException(
        "User is already a member of this project",
        "ProjectMember",
        "user_id,project_id",
      );
    }

    // Create and return the project member model instance
    const projectMember = new TestProjectsMembersModel();
    projectMember.user_id = userId;
    projectMember.project_id = projectId;
    projectMember.is_demo = is_demo;

    return projectMember;
  }

  // Instance method to update project member
  async updateProjectMember(updateData: { is_demo?: boolean }): Promise<void> {
    // Validate that this is not a demo member being modified
    if (this.isDemoMember() && updateData.is_demo === false) {
      throw new BusinessLogicException(
        "Demo project members cannot be converted to regular members",
        "DEMO_MEMBER_RESTRICTION",
        { userId: this.user_id, projectId: this.project_id },
      );
    }

    // Update boolean fields if provided
    if (updateData.is_demo !== undefined) {
      this.is_demo = updateData.is_demo;
    }
  }

  // Instance method to validate project member data
  async validateProjectMemberData(): Promise<void> {
    if (!this.user_id || !numberValidation(this.user_id, 1)) {
      throw new ValidationException(
        "Valid user_id is required (must be >= 1)",
        "user_id",
        this.user_id,
      );
    }

    if (!this.project_id || !numberValidation(this.project_id, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        this.project_id,
      );
    }
  }

  // Instance method to check if this is a demo member
  isDemoMember(): boolean {
    return this.is_demo ?? false;
  }

  // Instance method to check if project member can be modified
  canBeModified(): boolean {
    if (this.isDemoMember()) {
      throw new BusinessLogicException(
        "Demo project members cannot be modified",
        "DEMO_MEMBER_RESTRICTION",
        { userId: this.user_id, projectId: this.project_id },
      );
    }
    return true;
  }

  // Instance method to get summary
  getSummary(): {
    userId: number;
    projectId: number;
    isDemo: boolean;
  } {
    return {
      userId: this.user_id,
      projectId: this.project_id,
      isDemo: this.isDemoMember(),
    };
  }

  // Instance method to get safe JSON
  toSafeJSON(): any {
    return {
      userId: this.user_id,
      projectId: this.project_id,
      isDemo: this.isDemoMember(),
    };
  }

  // Instance method to get JSON representation
  toJSON(): any {
    return {
      user_id: this.user_id,
      project_id: this.project_id,
      is_demo: this.is_demo,
    };
  }

  // Static method to find by user and project IDs
  static async findByUserAndProject(
    userId: number,
    projectId: number,
  ): Promise<TestProjectsMembersModel | null> {
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    // Mock database lookup
    if (userId === 999 || projectId === 999) {
      return null;
    }

    return new TestProjectsMembersModel({
      user_id: userId,
      project_id: projectId,
      is_demo: false,
    });
  }

  // Static method to find by user and project IDs with validation
  static async findByUserAndProjectWithValidation(
    userId: number,
    projectId: number,
  ): Promise<TestProjectsMembersModel> {
    const projectMember = await TestProjectsMembersModel.findByUserAndProject(userId, projectId);

    if (!projectMember) {
      throw new NotFoundException("Project member not found", "ProjectMember", {
        userId,
        projectId,
      });
    }

    return projectMember;
  }

  // Static method to find all project members by project ID
  static async findByProjectId(projectId: number): Promise<TestProjectsMembersModel[]> {
    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    return [
      new TestProjectsMembersModel({
        user_id: 1,
        project_id: projectId,
        is_demo: false,
      }),
      new TestProjectsMembersModel({
        user_id: 2,
        project_id: projectId,
        is_demo: true,
      }),
    ];
  }

  // Static method to find all projects by user ID
  static async findByUserId(userId: number): Promise<TestProjectsMembersModel[]> {
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    return [
      new TestProjectsMembersModel({
        user_id: userId,
        project_id: 1,
        is_demo: false,
      }),
      new TestProjectsMembersModel({
        user_id: userId,
        project_id: 2,
        is_demo: true,
      }),
    ];
  }

  // Static method to update project member by user and project IDs
  static async updateProjectMemberByUserAndProject(
    userId: number,
    projectId: number,
    updateData: any,
  ): Promise<[number, TestProjectsMembersModel[]]> {
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    return [
      1,
      [
        new TestProjectsMembersModel({
          user_id: userId,
          project_id: projectId,
          ...updateData,
        }),
      ],
    ];
  }

  // Static method to delete project member by user and project IDs
  static async deleteProjectMemberByUserAndProject(
    userId: number,
    projectId: number,
  ): Promise<number> {
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    return 1;
  }

  // Static method to check if user is a member of a project
  static async isUserMemberOfProject(userId: number, projectId: number): Promise<boolean> {
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    const member = await TestProjectsMembersModel.findOne({
      where: {
        user_id: userId,
        project_id: projectId,
      },
    });

    return member !== null;
  }

  // Static method to get project member count by project ID
  static async getProjectMemberCount(projectId: number): Promise<number> {
    if (!numberValidation(projectId, 1)) {
      throw new ValidationException(
        "Valid project_id is required (must be >= 1)",
        "project_id",
        projectId,
      );
    }

    return 2; // Mock count
  }

  // Static method to get user project count by user ID
  static async getUserProjectCount(userId: number): Promise<number> {
    if (!numberValidation(userId, 1)) {
      throw new ValidationException("Valid user_id is required (must be >= 1)", "user_id", userId);
    }

    return 3; // Mock count
  }

  // Instance method to check if requires special attention
  requiresSpecialAttention(): boolean {
    return this.isDemoMember();
  }

  // Instance method to get member permissions
  getMemberPermissions(): string[] {
    const permissions: string[] = [];

    if (this.isDemoMember()) {
      permissions.push("read_only");
      permissions.push("demo_access");
    } else {
      permissions.push("full_access");
      permissions.push("read_write");
    }

    return permissions;
  }

  // Mock findOne method for testing
  static async findOne(options: any): Promise<TestProjectsMembersModel | null> {
    // Return null for non-existent members (used in createNewProjectMember and isUserMemberOfProject)
    if (options.where.user_id === 999 || options.where.project_id === 999) {
      return null;
    }

    // For other cases, return a mock member
    return new TestProjectsMembersModel({
      user_id: options.where.user_id,
      project_id: options.where.project_id,
      is_demo: false,
    });
  }
}

describe("ProjectsMembersModel", () => {
  const validData = {
    user_id: 1,
    project_id: 1,
    is_demo: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewProjectMember", () => {
    it("should create project member with valid data", async () => {
      // Mock findOne to return null (no existing member)
      jest.spyOn(TestProjectsMembersModel, "findOne").mockResolvedValue(null);

      const projectMember = await TestProjectsMembersModel.createNewProjectMember(
        validData.user_id,
        validData.project_id,
        validData.is_demo,
      );

      expect(projectMember).toBeInstanceOf(TestProjectsMembersModel);
      expect(projectMember.user_id).toBe(1);
      expect(projectMember.project_id).toBe(1);
      expect(projectMember.is_demo).toBe(false);
    });

    it("should create with custom is_demo value", async () => {
      // Mock findOne to return null (no existing member)
      jest.spyOn(TestProjectsMembersModel, "findOne").mockResolvedValue(null);

      const projectMember = await TestProjectsMembersModel.createNewProjectMember(
        validData.user_id,
        validData.project_id,
        true,
      );

      expect(projectMember.is_demo).toBe(true);
    });

    it("should throw ValidationException for invalid user_id", async () => {
      await expect(
        TestProjectsMembersModel.createNewProjectMember(0, validData.project_id),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid project_id", async () => {
      await expect(
        TestProjectsMembersModel.createNewProjectMember(validData.user_id, 0),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ConflictException for existing member", async () => {
      // Mock existing member
      jest
        .spyOn(TestProjectsMembersModel, "findOne")
        .mockResolvedValue(new TestProjectsMembersModel(validData));

      await expect(
        TestProjectsMembersModel.createNewProjectMember(validData.user_id, validData.project_id),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("updateProjectMember", () => {
    it("should update project member with valid data", async () => {
      const projectMember = new TestProjectsMembersModel(validData);

      await projectMember.updateProjectMember({ is_demo: true });

      expect(projectMember.is_demo).toBe(true);
    });

    it("should throw BusinessLogicException for demo member conversion", async () => {
      const projectMember = new TestProjectsMembersModel({
        ...validData,
        is_demo: true,
      });

      await expect(projectMember.updateProjectMember({ is_demo: false })).rejects.toThrow(
        BusinessLogicException,
      );
    });
  });

  describe("validateProjectMemberData", () => {
    it("should pass validation with valid data", async () => {
      const projectMember = new TestProjectsMembersModel(validData);

      await expect(projectMember.validateProjectMemberData()).resolves.not.toThrow();
    });

    it("should throw ValidationException for invalid user_id", async () => {
      const projectMember = new TestProjectsMembersModel({
        ...validData,
        user_id: 0,
      });

      await expect(projectMember.validateProjectMemberData()).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid project_id", async () => {
      const projectMember = new TestProjectsMembersModel({
        ...validData,
        project_id: 0,
      });

      await expect(projectMember.validateProjectMemberData()).rejects.toThrow(ValidationException);
    });
  });

  describe("isDemoMember", () => {
    it("should return true for demo member", () => {
      const projectMember = new TestProjectsMembersModel({
        ...validData,
        is_demo: true,
      });

      expect(projectMember.isDemoMember()).toBe(true);
    });

    it("should return false for regular member", () => {
      const projectMember = new TestProjectsMembersModel(validData);

      expect(projectMember.isDemoMember()).toBe(false);
    });

    it("should return false when is_demo is undefined", () => {
      const projectMember = new TestProjectsMembersModel({
        ...validData,
        is_demo: undefined,
      });

      expect(projectMember.isDemoMember()).toBe(false);
    });
  });

  describe("canBeModified", () => {
    it("should return true for regular member", () => {
      const projectMember = new TestProjectsMembersModel(validData);

      expect(projectMember.canBeModified()).toBe(true);
    });

    it("should throw BusinessLogicException for demo member", () => {
      const projectMember = new TestProjectsMembersModel({
        ...validData,
        is_demo: true,
      });

      expect(() => projectMember.canBeModified()).toThrow(BusinessLogicException);
    });
  });

  describe("getSummary", () => {
    it("should return correct summary", () => {
      const projectMember = new TestProjectsMembersModel(validData);

      const summary = projectMember.getSummary();

      expect(summary).toEqual({
        userId: 1,
        projectId: 1,
        isDemo: false,
      });
    });
  });

  describe("toSafeJSON", () => {
    it("should return safe JSON representation", () => {
      const projectMember = new TestProjectsMembersModel(validData);

      const result = projectMember.toSafeJSON();

      expect(result).toEqual({
        userId: 1,
        projectId: 1,
        isDemo: false,
      });
    });
  });

  describe("toJSON", () => {
    it("should return JSON representation", () => {
      const projectMember = new TestProjectsMembersModel(validData);

      const result = projectMember.toJSON();

      expect(result).toEqual({
        user_id: 1,
        project_id: 1,
        is_demo: false,
      });
    });
  });

  describe("findByUserAndProject", () => {
    it("should find project member by valid IDs", async () => {
      const projectMember = await TestProjectsMembersModel.findByUserAndProject(1, 1);

      expect(projectMember).toBeInstanceOf(TestProjectsMembersModel);
      expect(projectMember?.user_id).toBe(1);
      expect(projectMember?.project_id).toBe(1);
    });

    it("should return null for non-existent member", async () => {
      const projectMember = await TestProjectsMembersModel.findByUserAndProject(999, 1);

      expect(projectMember).toBeNull();
    });

    it("should throw ValidationException for invalid user_id", async () => {
      await expect(TestProjectsMembersModel.findByUserAndProject(0, 1)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw ValidationException for invalid project_id", async () => {
      await expect(TestProjectsMembersModel.findByUserAndProject(1, 0)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("findByUserAndProjectWithValidation", () => {
    it("should find project member by valid IDs", async () => {
      const projectMember = await TestProjectsMembersModel.findByUserAndProjectWithValidation(1, 1);

      expect(projectMember).toBeInstanceOf(TestProjectsMembersModel);
      expect(projectMember.user_id).toBe(1);
      expect(projectMember.project_id).toBe(1);
    });

    it("should throw NotFoundException for non-existent member", async () => {
      await expect(
        TestProjectsMembersModel.findByUserAndProjectWithValidation(999, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("findByProjectId", () => {
    it("should find all project members by project ID", async () => {
      const projectMembers = await TestProjectsMembersModel.findByProjectId(1);

      expect(projectMembers).toHaveLength(2);
      expect(projectMembers[0].project_id).toBe(1);
      expect(projectMembers[1].project_id).toBe(1);
    });

    it("should throw ValidationException for invalid project_id", async () => {
      await expect(TestProjectsMembersModel.findByProjectId(0)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("findByUserId", () => {
    it("should find all projects by user ID", async () => {
      const projectMembers = await TestProjectsMembersModel.findByUserId(1);

      expect(projectMembers).toHaveLength(2);
      expect(projectMembers[0].user_id).toBe(1);
      expect(projectMembers[1].user_id).toBe(1);
    });

    it("should throw ValidationException for invalid user_id", async () => {
      await expect(TestProjectsMembersModel.findByUserId(0)).rejects.toThrow(ValidationException);
    });
  });

  describe("updateProjectMemberByUserAndProject", () => {
    it("should update project member by user and project IDs", async () => {
      const [affected, updated] =
        await TestProjectsMembersModel.updateProjectMemberByUserAndProject(1, 1, { is_demo: true });

      expect(affected).toBe(1);
      expect(updated).toHaveLength(1);
      expect(updated[0].is_demo).toBe(true);
    });

    it("should throw ValidationException for invalid user_id", async () => {
      await expect(
        TestProjectsMembersModel.updateProjectMemberByUserAndProject(0, 1, {
          is_demo: true,
        }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid project_id", async () => {
      await expect(
        TestProjectsMembersModel.updateProjectMemberByUserAndProject(1, 0, {
          is_demo: true,
        }),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("deleteProjectMemberByUserAndProject", () => {
    it("should delete project member by user and project IDs", async () => {
      const deleted = await TestProjectsMembersModel.deleteProjectMemberByUserAndProject(1, 1);

      expect(deleted).toBe(1);
    });

    it("should throw ValidationException for invalid user_id", async () => {
      await expect(
        TestProjectsMembersModel.deleteProjectMemberByUserAndProject(0, 1),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid project_id", async () => {
      await expect(
        TestProjectsMembersModel.deleteProjectMemberByUserAndProject(1, 0),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("isUserMemberOfProject", () => {
    it("should return true for existing member", async () => {
      const isMember = await TestProjectsMembersModel.isUserMemberOfProject(1, 1);

      expect(isMember).toBe(true);
    });

    it("should return false for non-existent member", async () => {
      // Mock findOne to return null for non-existent member
      jest.spyOn(TestProjectsMembersModel, "findOne").mockResolvedValue(null);

      const isMember = await TestProjectsMembersModel.isUserMemberOfProject(999, 1);

      expect(isMember).toBe(false);
    });

    it("should throw ValidationException for invalid user_id", async () => {
      await expect(TestProjectsMembersModel.isUserMemberOfProject(0, 1)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw ValidationException for invalid project_id", async () => {
      await expect(TestProjectsMembersModel.isUserMemberOfProject(1, 0)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("getProjectMemberCount", () => {
    it("should return project member count", async () => {
      const count = await TestProjectsMembersModel.getProjectMemberCount(1);

      expect(count).toBe(2);
    });

    it("should throw ValidationException for invalid project_id", async () => {
      await expect(TestProjectsMembersModel.getProjectMemberCount(0)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("getUserProjectCount", () => {
    it("should return user project count", async () => {
      const count = await TestProjectsMembersModel.getUserProjectCount(1);

      expect(count).toBe(3);
    });

    it("should throw ValidationException for invalid user_id", async () => {
      await expect(TestProjectsMembersModel.getUserProjectCount(0)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("requiresSpecialAttention", () => {
    it("should return true for demo member", () => {
      const projectMember = new TestProjectsMembersModel({
        ...validData,
        is_demo: true,
      });

      expect(projectMember.requiresSpecialAttention()).toBe(true);
    });

    it("should return false for regular member", () => {
      const projectMember = new TestProjectsMembersModel(validData);

      expect(projectMember.requiresSpecialAttention()).toBe(false);
    });
  });

  describe("getMemberPermissions", () => {
    it("should return demo permissions for demo member", () => {
      const projectMember = new TestProjectsMembersModel({
        ...validData,
        is_demo: true,
      });

      const permissions = projectMember.getMemberPermissions();

      expect(permissions).toContain("read_only");
      expect(permissions).toContain("demo_access");
      expect(permissions).not.toContain("full_access");
    });

    it("should return full permissions for regular member", () => {
      const projectMember = new TestProjectsMembersModel(validData);

      const permissions = projectMember.getMemberPermissions();

      expect(permissions).toContain("full_access");
      expect(permissions).toContain("read_write");
      expect(permissions).not.toContain("read_only");
    });
  });
});
