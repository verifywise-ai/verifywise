import { ValidationException } from "../exceptions/custom.exception";
import { AiAppStatus, AiAppDiscoveredSource } from "../enums/ai-app-status.enum";

// Mock sequelize-typescript
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    ENUM: jest.fn(),
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

jest.mock("../models/user/user.model", () => ({
  UserModel: class MockUserModel {},
}));

jest.mock("../models/vendor/vendor.model", () => ({
  VendorModel: class MockVendorModel {},
}));

class TestAiAppModel {
  id?: number;
  organization_id!: number;
  name!: string;
  description?: string | null;
  vendor_id?: number | null;
  owner_id?: number | null;
  status!: AiAppStatus;
  risk_score?: number | null;
  discovered_source!: AiAppDiscoveredSource;
  shadow_ai_tool_id?: number | null;
  required_training?: string | null;
  is_demo?: boolean;
  created_at?: Date;
  updated_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  async validateAiAppData(): Promise<void> {
    if (!this.name || this.name.trim().length === 0) {
      throw new ValidationException("AI App name is required", "name", this.name);
    }

    if (!this.organization_id || this.organization_id <= 0) {
      throw new ValidationException(
        "Valid organization ID is required",
        "organization_id",
        this.organization_id,
      );
    }

    if (!Object.values(AiAppStatus).includes(this.status)) {
      throw new ValidationException("Invalid status value", "status", this.status);
    }

    if (!Object.values(AiAppDiscoveredSource).includes(this.discovered_source)) {
      throw new ValidationException(
        "Invalid discovered source value",
        "discovered_source",
        this.discovered_source,
      );
    }
  }

  isApproved(): boolean {
    return this.status === AiAppStatus.APPROVED;
  }

  isRestricted(): boolean {
    return this.status === AiAppStatus.RESTRICTED;
  }

  isBanned(): boolean {
    return this.status === AiAppStatus.BANNED;
  }

  static createNewAiApp(organizationId: number, data: any): TestAiAppModel {
    if (!organizationId || organizationId <= 0) {
      throw new ValidationException(
        "Valid organization ID is required",
        "organization_id",
        organizationId,
      );
    }

    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationException("AI App name is required", "name", data.name);
    }

    return new TestAiAppModel({
      organization_id: organizationId,
      name: data.name.trim(),
      description: data.description ?? null,
      vendor_id: data.vendor_id ?? null,
      owner_id: data.owner_id ?? null,
      status: data.status ?? AiAppStatus.DRAFT,
      discovered_source: data.discovered_source ?? AiAppDiscoveredSource.MANUAL,
      shadow_ai_tool_id: data.shadow_ai_tool_id ?? null,
      required_training: data.required_training ?? null,
      risk_score: null,
      is_demo: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
}

describe("AiAppModel", () => {
  describe("createNewAiApp", () => {
    it("should create a new AI App with default values", () => {
      const app = TestAiAppModel.createNewAiApp(1, { name: "ChatGPT" });
      expect(app.name).toBe("ChatGPT");
      expect(app.status).toBe(AiAppStatus.DRAFT);
      expect(app.discovered_source).toBe(AiAppDiscoveredSource.MANUAL);
      expect(app.is_demo).toBe(false);
    });

    it("should throw when name is empty", () => {
      expect(() => TestAiAppModel.createNewAiApp(1, { name: "" })).toThrow(ValidationException);
    });

    it("should throw when organization ID is invalid", () => {
      expect(() => TestAiAppModel.createNewAiApp(0, { name: "ChatGPT" })).toThrow(
        ValidationException,
      );
    });
  });

  describe("validateAiAppData", () => {
    it("should pass validation for valid data", async () => {
      const app = new TestAiAppModel({
        organization_id: 1,
        name: "ChatGPT",
        status: AiAppStatus.APPROVED,
        discovered_source: AiAppDiscoveredSource.MANUAL,
      });
      await expect(app.validateAiAppData()).resolves.toBeUndefined();
    });

    it("should throw when name is missing", async () => {
      const app = new TestAiAppModel({
        organization_id: 1,
        name: "",
        status: AiAppStatus.DRAFT,
        discovered_source: AiAppDiscoveredSource.MANUAL,
      });
      await expect(app.validateAiAppData()).rejects.toThrow(ValidationException);
    });

    it("should throw for invalid status", async () => {
      const app = new TestAiAppModel({
        organization_id: 1,
        name: "ChatGPT",
        status: "invalid_status" as AiAppStatus,
        discovered_source: AiAppDiscoveredSource.MANUAL,
      });
      await expect(app.validateAiAppData()).rejects.toThrow(ValidationException);
    });
  });

  describe("status helpers", () => {
    it("should detect approved status", () => {
      const app = new TestAiAppModel({ status: AiAppStatus.APPROVED });
      expect(app.isApproved()).toBe(true);
      expect(app.isRestricted()).toBe(false);
      expect(app.isBanned()).toBe(false);
    });

    it("should detect restricted status", () => {
      const app = new TestAiAppModel({ status: AiAppStatus.RESTRICTED });
      expect(app.isRestricted()).toBe(true);
    });

    it("should detect banned status", () => {
      const app = new TestAiAppModel({ status: AiAppStatus.BANNED });
      expect(app.isBanned()).toBe(true);
    });
  });
});
