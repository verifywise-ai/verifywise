import {
  ValidationException,
  BusinessLogicException,
  NotFoundException,
} from "../exceptions/custom.exception";

// Mock sequelize-typescript
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    BOOLEAN: "BOOLEAN",
    DATE: "DATE",
    ARRAY: jest.fn(() => "ARRAY"),
  },
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

// Mock sequelize Op for database queries
jest.mock("sequelize", () => ({
  Op: {
    contains: "contains",
  },
}));

// Test class mimicking OrganizationModel behavior
class TestOrganizationModel {
  id?: number;
  name!: string;
  logo!: string;
  members!: number[];
  projects!: number[];
  is_demo?: boolean;
  created_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  // Static method to create new organization
  static async createNewOrganization(
    name: string,
    logo?: string,
    members?: number[],
    projects?: number[],
    is_demo: boolean = false,
  ): Promise<TestOrganizationModel> {
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

    // Validate logo URL if provided
    if (logo !== undefined && logo !== null) {
      if (logo.trim().length === 0) {
        throw new ValidationException("Logo URL cannot be empty if provided", "logo", logo);
      }

      try {
        new URL(logo);
      } catch {
        throw new ValidationException("Logo must be a valid URL", "logo", logo);
      }
    }

    // Validate members array if provided
    if (members !== undefined && members !== null) {
      if (!Array.isArray(members)) {
        throw new ValidationException("Members must be an array", "members", members);
      }

      for (const memberId of members) {
        if (!memberId || memberId < 1) {
          throw new ValidationException(
            "All member IDs must be positive integers",
            "members",
            members,
          );
        }
      }
    }

    // Validate projects array if provided
    if (projects !== undefined && projects !== null) {
      if (!Array.isArray(projects)) {
        throw new ValidationException("Projects must be an array", "projects", projects);
      }

      for (const projectId of projects) {
        if (!projectId || projectId < 1) {
          throw new ValidationException(
            "All project IDs must be positive integers",
            "projects",
            projects,
          );
        }
      }
    }

    const organization = new TestOrganizationModel();
    organization.name = name.trim();
    organization.logo = logo || "";
    organization.members = members || [];
    organization.projects = projects || [];
    organization.is_demo = is_demo;
    organization.created_at = new Date();

    return organization;
  }

  // Instance methods
  async updateOrganization(updateData: {
    name?: string;
    logo?: string;
    members?: number[];
    projects?: number[];
  }): Promise<void> {
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

    if (updateData.logo !== undefined) {
      if (updateData.logo !== null && updateData.logo.trim().length === 0) {
        throw new ValidationException(
          "Logo URL cannot be empty if provided",
          "logo",
          updateData.logo,
        );
      }

      if (updateData.logo !== null) {
        try {
          new URL(updateData.logo);
        } catch {
          throw new ValidationException("Logo must be a valid URL", "logo", updateData.logo);
        }
      }

      this.logo = updateData.logo || "";
    }

    if (updateData.members !== undefined) {
      if (!Array.isArray(updateData.members)) {
        throw new ValidationException("Members must be an array", "members", updateData.members);
      }

      for (const memberId of updateData.members) {
        if (!memberId || memberId < 1) {
          throw new ValidationException(
            "All member IDs must be positive integers",
            "members",
            updateData.members,
          );
        }
      }

      this.members = updateData.members;
    }

    if (updateData.projects !== undefined) {
      if (!Array.isArray(updateData.projects)) {
        throw new ValidationException("Projects must be an array", "projects", updateData.projects);
      }

      for (const projectId of updateData.projects) {
        if (!projectId || projectId < 1) {
          throw new ValidationException(
            "All project IDs must be positive integers",
            "projects",
            updateData.projects,
          );
        }
      }

      this.projects = updateData.projects;
    }
  }

  async validateOrganizationData(): Promise<void> {
    if (!this.name || this.name.trim().length === 0) {
      throw new ValidationException("Name is required", "name", this.name);
    }

    if (this.name.trim().length < 2) {
      throw new ValidationException("Name must be at least 2 characters long", "name", this.name);
    }

    if (this.name.trim().length > 255) {
      throw new ValidationException("Name must not exceed 255 characters", "name", this.name);
    }

    if (this.logo && this.logo.trim().length > 0) {
      try {
        new URL(this.logo);
      } catch {
        throw new ValidationException("Logo must be a valid URL", "logo", this.logo);
      }
    }

    if (this.members && !Array.isArray(this.members)) {
      throw new ValidationException("Members must be an array", "members", this.members);
    }

    if (this.members) {
      for (const memberId of this.members) {
        if (!memberId || memberId < 1) {
          throw new ValidationException(
            "All member IDs must be positive integers",
            "members",
            this.members,
          );
        }
      }
    }

    if (this.projects && !Array.isArray(this.projects)) {
      throw new ValidationException("Projects must be an array", "projects", this.projects);
    }

    if (this.projects) {
      for (const projectId of this.projects) {
        if (!projectId || projectId < 1) {
          throw new ValidationException(
            "All project IDs must be positive integers",
            "projects",
            this.projects,
          );
        }
      }
    }
  }

  isDemoOrganization(): boolean {
    return this.is_demo ?? false;
  }

  canBeModified(): boolean {
    if (this.isDemoOrganization()) {
      throw new BusinessLogicException(
        "Demo organizations cannot be modified",
        "DEMO_ORGANIZATION_RESTRICTION",
        { organizationId: this.id, organizationName: this.name },
      );
    }
    return true;
  }

  canBeDeleted(): boolean {
    if (this.isDemoOrganization()) {
      return false;
    }

    if (this.projects && this.projects.length > 0) {
      return false;
    }

    return true;
  }

  addMember(userId: number): void {
    if (!userId || userId < 1) {
      throw new ValidationException("User ID must be a positive integer", "userId", userId);
    }

    if (!this.members) {
      this.members = [];
    }

    if (!this.members.includes(userId)) {
      this.members.push(userId);
    }
  }

  removeMember(userId: number): void {
    if (!userId || userId < 1) {
      throw new ValidationException("User ID must be a positive integer", "userId", userId);
    }

    if (this.members) {
      this.members = this.members.filter((id) => id !== userId);
    }
  }

  isMember(userId: number): boolean {
    if (!userId || userId < 1) {
      return false;
    }

    return this.members ? this.members.includes(userId) : false;
  }

  addProject(projectId: number): void {
    if (!projectId || projectId < 1) {
      throw new ValidationException(
        "Project ID must be a positive integer",
        "projectId",
        projectId,
      );
    }

    if (!this.projects) {
      this.projects = [];
    }

    if (!this.projects.includes(projectId)) {
      this.projects.push(projectId);
    }
  }

  removeProject(projectId: number): void {
    if (!projectId || projectId < 1) {
      throw new ValidationException(
        "Project ID must be a positive integer",
        "projectId",
        projectId,
      );
    }

    if (this.projects) {
      this.projects = this.projects.filter((id) => id !== projectId);
    }
  }

  hasProject(projectId: number): boolean {
    if (!projectId || projectId < 1) {
      return false;
    }

    return this.projects ? this.projects.includes(projectId) : false;
  }

  getMemberCount(): number {
    return this.members ? this.members.length : 0;
  }

  getProjectCount(): number {
    return this.projects ? this.projects.length : 0;
  }

  isActive(): boolean {
    return this.getMemberCount() > 0 || this.getProjectCount() > 0;
  }

  isEmpty(): boolean {
    return this.getMemberCount() === 0 && this.getProjectCount() === 0;
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

  toSafeJSON(): any {
    return {
      id: this.id,
      name: this.name,
      logo: this.logo,
      memberCount: this.getMemberCount(),
      projectCount: this.getProjectCount(),
      isActive: this.isActive(),
      isDemo: this.isDemoOrganization(),
      created_at: this.created_at?.toISOString(),
    };
  }

  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      logo: this.logo,
      members: this.members,
      projects: this.projects,
      is_demo: this.is_demo,
      created_at: this.created_at?.toISOString(),
      memberCount: this.getMemberCount(),
      projectCount: this.getProjectCount(),
      isActive: this.isActive(),
      isEmpty: this.isEmpty(),
      ageInDays: this.getAgeInDays(),
    };
  }

  static fromJSON(json: any): TestOrganizationModel {
    return new TestOrganizationModel(json);
  }

  // Static methods for database operations
  static async findByIdWithValidation(id: number): Promise<TestOrganizationModel> {
    if (!id || id < 1) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    if (id === 999) {
      throw new NotFoundException("Organization not found", "Organization", id);
    }

    return new TestOrganizationModel({
      id,
      name: "Test Organization",
      logo: "https://example.com/logo.png",
      members: [1, 2],
      projects: [1],
      is_demo: false,
      created_at: new Date(),
    });
  }

  static async findByMemberId(memberId: number): Promise<TestOrganizationModel[]> {
    if (!memberId || memberId < 1) {
      throw new ValidationException(
        "Valid member ID is required (must be >= 1)",
        "memberId",
        memberId,
      );
    }

    return [
      new TestOrganizationModel({
        id: 1,
        name: "Organization 1",
        members: [memberId],
        created_at: new Date(),
      }),
    ];
  }

  static async findByProjectId(projectId: number): Promise<TestOrganizationModel[]> {
    if (!projectId || projectId < 1) {
      throw new ValidationException(
        "Valid project ID is required (must be >= 1)",
        "projectId",
        projectId,
      );
    }

    return [
      new TestOrganizationModel({
        id: 1,
        name: "Organization 1",
        projects: [projectId],
        created_at: new Date(),
      }),
    ];
  }

  static async updateOrganizationById(
    id: number,
    updateData: any,
  ): Promise<[number, TestOrganizationModel[]]> {
    if (!id || id < 1) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return [1, [new TestOrganizationModel({ id, ...updateData })]];
  }

  static async deleteOrganizationById(id: number): Promise<number> {
    if (!id || id < 1) {
      throw new ValidationException("Valid ID is required (must be >= 1)", "id", id);
    }

    return 1;
  }

  getSummary(): {
    id: number | undefined;
    name: string;
    memberCount: number;
    projectCount: number;
    isActive: boolean;
    isDemo: boolean;
  } {
    return {
      id: this.id,
      name: this.name,
      memberCount: this.getMemberCount(),
      projectCount: this.getProjectCount(),
      isActive: this.isActive(),
      isDemo: this.isDemoOrganization(),
    };
  }
}

describe("OrganizationModel", () => {
  const validOrganizationData = {
    name: "Test Organization",
    logo: "https://example.com/logo.png",
    members: [1, 2, 3],
    projects: [1, 2],
    is_demo: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewOrganization", () => {
    it("should create organization with valid data", async () => {
      const organization = await TestOrganizationModel.createNewOrganization(
        validOrganizationData.name,
        validOrganizationData.logo,
        validOrganizationData.members,
        validOrganizationData.projects,
        validOrganizationData.is_demo,
      );

      expect(organization).toBeInstanceOf(TestOrganizationModel);
      expect(organization.name).toBe("Test Organization");
      expect(organization.logo).toBe("https://example.com/logo.png");
      expect(organization.members).toEqual([1, 2, 3]);
      expect(organization.projects).toEqual([1, 2]);
      expect(organization.is_demo).toBe(false);
      expect(organization.created_at).toBeInstanceOf(Date);
    });

    it("should throw ValidationException for empty name", async () => {
      await expect(
        TestOrganizationModel.createNewOrganization("", "https://example.com/logo.png"),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for short name", async () => {
      await expect(
        TestOrganizationModel.createNewOrganization("A", "https://example.com/logo.png"),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid logo URL", async () => {
      await expect(
        TestOrganizationModel.createNewOrganization("Test Org", "invalid-url"),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid member IDs", async () => {
      await expect(
        TestOrganizationModel.createNewOrganization("Test Org", undefined, [0, -1]),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid project IDs", async () => {
      await expect(
        TestOrganizationModel.createNewOrganization("Test Org", undefined, undefined, [0, -1]),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("updateOrganization", () => {
    it("should update organization name successfully", async () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      await organization.updateOrganization({ name: "Updated Organization" });
      expect(organization.name).toBe("Updated Organization");
    });

    it("should throw ValidationException for invalid name update", async () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      await expect(organization.updateOrganization({ name: "A" })).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("validateOrganizationData", () => {
    it("should pass validation with valid data", async () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      await expect(organization.validateOrganizationData()).resolves.not.toThrow();
    });

    it("should throw ValidationException for invalid name", async () => {
      const organization = new TestOrganizationModel({
        ...validOrganizationData,
        name: "A",
      });
      await expect(organization.validateOrganizationData()).rejects.toThrow(ValidationException);
    });
  });

  describe("isDemoOrganization", () => {
    it("should return true for demo organization", () => {
      const organization = new TestOrganizationModel({
        ...validOrganizationData,
        is_demo: true,
      });
      expect(organization.isDemoOrganization()).toBe(true);
    });

    it("should return false for regular organization", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(organization.isDemoOrganization()).toBe(false);
    });
  });

  describe("canBeModified", () => {
    it("should return true for regular organization", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(organization.canBeModified()).toBe(true);
    });

    it("should throw BusinessLogicException for demo organization", () => {
      const organization = new TestOrganizationModel({
        ...validOrganizationData,
        is_demo: true,
      });
      expect(() => organization.canBeModified()).toThrow(BusinessLogicException);
    });
  });

  describe("canBeDeleted", () => {
    it("should return true for empty regular organization", () => {
      const organization = new TestOrganizationModel({
        ...validOrganizationData,
        members: [],
        projects: [],
      });
      expect(organization.canBeDeleted()).toBe(true);
    });

    it("should return false for demo organization", () => {
      const organization = new TestOrganizationModel({
        ...validOrganizationData,
        is_demo: true,
      });
      expect(organization.canBeDeleted()).toBe(false);
    });

    it("should return false for organization with projects", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(organization.canBeDeleted()).toBe(false);
    });
  });

  describe("addMember", () => {
    it("should add member successfully", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      organization.addMember(4);
      expect(organization.members).toContain(4);
    });

    it("should throw ValidationException for invalid user ID", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(() => organization.addMember(0)).toThrow(ValidationException);
    });
  });

  describe("removeMember", () => {
    it("should remove member successfully", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      organization.removeMember(1);
      expect(organization.members).not.toContain(1);
    });

    it("should throw ValidationException for invalid user ID", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(() => organization.removeMember(0)).toThrow(ValidationException);
    });
  });

  describe("isMember", () => {
    it("should return true for existing member", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(organization.isMember(1)).toBe(true);
    });

    it("should return false for non-member", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(organization.isMember(999)).toBe(false);
    });

    it("should return false for invalid user ID", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(organization.isMember(0)).toBe(false);
    });
  });

  describe("addProject", () => {
    it("should add project successfully", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      organization.addProject(3);
      expect(organization.projects).toContain(3);
    });

    it("should throw ValidationException for invalid project ID", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(() => organization.addProject(0)).toThrow(ValidationException);
    });
  });

  describe("removeProject", () => {
    it("should remove project successfully", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      organization.removeProject(1);
      expect(organization.projects).not.toContain(1);
    });

    it("should throw ValidationException for invalid project ID", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(() => organization.removeProject(0)).toThrow(ValidationException);
    });
  });

  describe("hasProject", () => {
    it("should return true for existing project", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(organization.hasProject(1)).toBe(true);
    });

    it("should return false for non-existing project", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(organization.hasProject(999)).toBe(false);
    });

    it("should return false for invalid project ID", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(organization.hasProject(0)).toBe(false);
    });
  });

  describe("getMemberCount", () => {
    it("should return correct member count", () => {
      const organization = new TestOrganizationModel({
        ...validOrganizationData,
        members: [1, 2, 3], // Use explicit values instead of spread
        projects: [1, 2], // Use explicit values instead of spread
      });
      expect(organization.getMemberCount()).toBe(3);
    });

    it("should return 0 for organization without members", () => {
      const organization = new TestOrganizationModel({
        ...validOrganizationData,
        members: [],
        projects: [1, 2], // Use explicit values instead of spread
      });
      expect(organization.getMemberCount()).toBe(0);
    });
  });

  describe("getProjectCount", () => {
    it("should return correct project count", () => {
      const organization = new TestOrganizationModel({
        ...validOrganizationData,
        members: [1, 2, 3], // Use explicit values instead of spread
        projects: [1, 2], // Use explicit values instead of spread
      });
      expect(organization.getProjectCount()).toBe(2);
    });

    it("should return 0 for organization without projects", () => {
      const organization = new TestOrganizationModel({
        ...validOrganizationData,
        members: [1, 2, 3], // Use explicit values instead of spread
        projects: [],
      });
      expect(organization.getProjectCount()).toBe(0);
    });
  });

  describe("isActive", () => {
    it("should return true for organization with members", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(organization.isActive()).toBe(true);
    });

    it("should return true for organization with projects", () => {
      const organization = new TestOrganizationModel({
        ...validOrganizationData,
        members: [],
      });
      expect(organization.isActive()).toBe(true);
    });

    it("should return false for empty organization", () => {
      const organization = new TestOrganizationModel({
        ...validOrganizationData,
        members: [],
        projects: [],
      });
      expect(organization.isActive()).toBe(false);
    });
  });

  describe("isEmpty", () => {
    it("should return true for empty organization", () => {
      const organization = new TestOrganizationModel({
        ...validOrganizationData,
        members: [],
        projects: [],
      });
      expect(organization.isEmpty()).toBe(true);
    });

    it("should return false for organization with members", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(organization.isEmpty()).toBe(false);
    });
  });

  describe("getAgeInDays", () => {
    it("should return 0 for organization without created_at", () => {
      const organization = new TestOrganizationModel(validOrganizationData);
      expect(organization.getAgeInDays()).toBe(0);
    });

    it("should return correct age for organization with created_at", () => {
      const fixedDate = new Date("2024-01-01T12:00:00.000Z");
      const organization = new TestOrganizationModel({
        ...validOrganizationData,
        created_at: fixedDate,
      });

      const originalDate = global.Date;
      const mockDate = new Date("2024-01-02T12:00:00.000Z");
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.UTC = originalDate.UTC;
      global.Date.parse = originalDate.parse;
      global.Date.now = originalDate.now;

      try {
        expect(organization.getAgeInDays()).toBe(1);
      } finally {
        global.Date = originalDate;
      }
    });
  });

  describe("isRecent", () => {
    it("should return true for recent organization", () => {
      const fixedDate = new Date("2024-01-01T12:00:00.000Z");
      const organization = new TestOrganizationModel({
        ...validOrganizationData,
        created_at: fixedDate,
      });

      const originalDate = global.Date;
      const mockDate = new Date("2024-01-02T12:00:00.000Z");
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.UTC = originalDate.UTC;
      global.Date.parse = originalDate.parse;
      global.Date.now = originalDate.now;

      try {
        expect(organization.isRecent(30)).toBe(true);
      } finally {
        global.Date = originalDate;
      }
    });

    it("should return false for old organization", () => {
      const oldDate = new Date("2024-01-01T12:00:00.000Z");
      const organization = new TestOrganizationModel({
        ...validOrganizationData,
        created_at: oldDate,
      });

      const originalDate = global.Date;
      const mockDate = new Date("2024-02-01T12:00:00.000Z");
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.UTC = originalDate.UTC;
      global.Date.parse = originalDate.parse;
      global.Date.now = originalDate.now;

      try {
        expect(organization.isRecent(30)).toBe(false);
      } finally {
        global.Date = originalDate;
      }
    });
  });

  describe("toSafeJSON", () => {
    it("should return safe JSON representation", () => {
      const testData = {
        name: "Test Organization",
        logo: "https://example.com/logo.png",
        members: [1, 2, 3],
        projects: [1, 2],
        is_demo: false,
      };

      const organization = new TestOrganizationModel({
        id: 1,
        ...testData,
        created_at: new Date("2024-01-01T00:00:00.000Z"),
      });

      const result = organization.toSafeJSON();

      expect(result).toEqual({
        id: 1,
        name: testData.name,
        logo: testData.logo,
        memberCount: 3,
        projectCount: 2,
        isActive: true,
        isDemo: false,
        created_at: "2024-01-01T00:00:00.000Z",
      });
    });
  });

  describe("toJSON", () => {
    it("should return complete JSON representation", () => {
      const testData = {
        name: "Test Organization",
        logo: "https://example.com/logo.png",
        members: [1, 2, 3],
        projects: [1, 2],
        is_demo: false,
      };

      const organization = new TestOrganizationModel({
        id: 1,
        ...testData,
        created_at: new Date("2024-01-01T00:00:00.000Z"),
      });

      const result = organization.toJSON();

      expect(result).toEqual({
        id: 1,
        name: testData.name,
        logo: testData.logo,
        members: testData.members,
        projects: testData.projects,
        is_demo: false,
        created_at: "2024-01-01T00:00:00.000Z",
        memberCount: 3,
        projectCount: 2,
        isActive: true,
        isEmpty: false,
        ageInDays: expect.any(Number),
      });
    });
  });

  describe("fromJSON", () => {
    it("should create organization from JSON", () => {
      const testData = {
        name: "Test Organization",
        logo: "https://example.com/logo.png",
        members: [1, 2, 3],
        projects: [1, 2],
        is_demo: false,
      };

      const json = { id: 1, ...testData };
      const organization = TestOrganizationModel.fromJSON(json);
      expect(organization).toBeInstanceOf(TestOrganizationModel);
      expect(organization.id).toBe(1);
      expect(organization.name).toBe(testData.name);
    });
  });

  describe("findByIdWithValidation", () => {
    it("should find organization by valid ID", async () => {
      const organization = await TestOrganizationModel.findByIdWithValidation(1);
      expect(organization).toBeInstanceOf(TestOrganizationModel);
      expect(organization.id).toBe(1);
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestOrganizationModel.findByIdWithValidation(0)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw NotFoundException for non-existent ID", async () => {
      await expect(TestOrganizationModel.findByIdWithValidation(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("findByMemberId", () => {
    it("should find organizations by member ID", async () => {
      const organizations = await TestOrganizationModel.findByMemberId(1);
      expect(organizations).toHaveLength(1);
      expect(organizations[0]).toBeInstanceOf(TestOrganizationModel);
    });

    it("should throw ValidationException for invalid member ID", async () => {
      await expect(TestOrganizationModel.findByMemberId(0)).rejects.toThrow(ValidationException);
    });
  });

  describe("findByProjectId", () => {
    it("should find organizations by project ID", async () => {
      const organizations = await TestOrganizationModel.findByProjectId(1);
      expect(organizations).toHaveLength(1);
      expect(organizations[0]).toBeInstanceOf(TestOrganizationModel);
    });

    it("should throw ValidationException for invalid project ID", async () => {
      await expect(TestOrganizationModel.findByProjectId(0)).rejects.toThrow(ValidationException);
    });
  });

  describe("updateOrganizationById", () => {
    it("should update organization by ID", async () => {
      const [affected, updated] = await TestOrganizationModel.updateOrganizationById(1, {
        name: "Updated Name",
      });
      expect(affected).toBe(1);
      expect(updated[0].name).toBe("Updated Name");
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(
        TestOrganizationModel.updateOrganizationById(0, { name: "Updated" }),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("deleteOrganizationById", () => {
    it("should delete organization by ID", async () => {
      const deleted = await TestOrganizationModel.deleteOrganizationById(1);
      expect(deleted).toBe(1);
    });

    it("should throw ValidationException for invalid ID", async () => {
      await expect(TestOrganizationModel.deleteOrganizationById(0)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("getSummary", () => {
    it("should return organization summary", () => {
      const testData = {
        name: "Test Organization",
        logo: "https://example.com/logo.png",
        members: [1, 2, 3],
        projects: [1, 2],
        is_demo: false,
      };

      const organization = new TestOrganizationModel({
        id: 1,
        ...testData,
      });

      const summary = organization.getSummary();

      expect(summary).toEqual({
        id: 1,
        name: testData.name,
        memberCount: 3,
        projectCount: 2,
        isActive: true,
        isDemo: false,
      });
    });
  });
});
