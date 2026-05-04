import { ValidationException } from "../exceptions/custom.exception";

jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    DATE: "DATE",
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

jest.mock("../models/modelInventory/modelInventory.model", () => ({
  ModelInventoryModel: class MockModelInventoryModel {},
}));

jest.mock("../models/project/project.model", () => ({
  ProjectModel: class MockProjectModel {},
}));

jest.mock("../models/frameworks/frameworks.model", () => ({
  FrameworkModel: class MockFrameworkModel {},
}));

class TestModelInventoryProjectFrameworkModel {
  model_inventory_id!: number;
  project_id?: number;
  framework_id?: number;
  created_at?: Date;
  updated_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  async validateRelation(): Promise<void> {
    if (!this.project_id && !this.framework_id) {
      throw new ValidationException(
        "Either project_id or framework_id must be provided",
        "project_framework",
        null,
      );
    }
  }

  hasProject(): boolean {
    return this.project_id !== null && this.project_id !== undefined;
  }

  hasFramework(): boolean {
    return this.framework_id !== null && this.framework_id !== undefined;
  }

  hasBoth(): boolean {
    return this.hasProject() && this.hasFramework();
  }

  getRelationType(): "project" | "framework" | "both" {
    if (this.hasBoth()) return "both";
    if (this.hasProject()) return "project";
    return "framework";
  }

  toSafeJSON(): any {
    return {
      model_inventory_id: this.model_inventory_id,
      project_id: this.project_id,
      framework_id: this.framework_id,
    };
  }

  static fromJSON(json: any): TestModelInventoryProjectFrameworkModel {
    return new TestModelInventoryProjectFrameworkModel(json);
  }
}

describe("ModelInventoryProjectFrameworkModel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("validateRelation", () => {
    it("should pass when project_id is provided", async () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
        project_id: 5,
      });

      await expect(model.validateRelation()).resolves.not.toThrow();
    });

    it("should pass when framework_id is provided", async () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
        framework_id: 3,
      });

      await expect(model.validateRelation()).resolves.not.toThrow();
    });

    it("should pass when both project_id and framework_id are provided", async () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
        project_id: 5,
        framework_id: 3,
      });

      await expect(model.validateRelation()).resolves.not.toThrow();
    });

    it("should throw ValidationException when neither project_id nor framework_id is provided", async () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
      });

      await expect(model.validateRelation()).rejects.toThrow(ValidationException);
    });
  });

  describe("hasProject", () => {
    it("should return true when project_id is set", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
        project_id: 5,
      });
      expect(model.hasProject()).toBe(true);
    });

    it("should return false when project_id is undefined", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
      });
      expect(model.hasProject()).toBe(false);
    });

    it("should return false when project_id is null", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
        project_id: null,
      });
      expect(model.hasProject()).toBe(false);
    });
  });

  describe("hasFramework", () => {
    it("should return true when framework_id is set", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
        framework_id: 3,
      });
      expect(model.hasFramework()).toBe(true);
    });

    it("should return false when framework_id is undefined", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
      });
      expect(model.hasFramework()).toBe(false);
    });

    it("should return false when framework_id is null", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
        framework_id: null,
      });
      expect(model.hasFramework()).toBe(false);
    });
  });

  describe("hasBoth", () => {
    it("should return true when both are set", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
        project_id: 5,
        framework_id: 3,
      });
      expect(model.hasBoth()).toBe(true);
    });

    it("should return false when only project_id is set", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
        project_id: 5,
      });
      expect(model.hasBoth()).toBe(false);
    });

    it("should return false when only framework_id is set", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
        framework_id: 3,
      });
      expect(model.hasBoth()).toBe(false);
    });

    it("should return false when neither is set", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
      });
      expect(model.hasBoth()).toBe(false);
    });
  });

  describe("getRelationType", () => {
    it("should return 'both' when both project and framework are set", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
        project_id: 5,
        framework_id: 3,
      });
      expect(model.getRelationType()).toBe("both");
    });

    it("should return 'project' when only project is set", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
        project_id: 5,
      });
      expect(model.getRelationType()).toBe("project");
    });

    it("should return 'framework' when only framework is set", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
        framework_id: 3,
      });
      expect(model.getRelationType()).toBe("framework");
    });

    it("should return 'framework' when neither is set", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
      });
      expect(model.getRelationType()).toBe("framework");
    });
  });

  describe("toSafeJSON", () => {
    it("should return safe JSON with all fields", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
        project_id: 5,
        framework_id: 3,
      });

      const json = model.toSafeJSON();
      expect(json).toEqual({
        model_inventory_id: 1,
        project_id: 5,
        framework_id: 3,
      });
    });

    it("should return safe JSON with optional fields undefined", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
      });

      const json = model.toSafeJSON();
      expect(json.model_inventory_id).toBe(1);
      expect(json.project_id).toBeUndefined();
      expect(json.framework_id).toBeUndefined();
    });

    it("should not include timestamps", () => {
      const model = new TestModelInventoryProjectFrameworkModel({
        model_inventory_id: 1,
        project_id: 5,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const json = model.toSafeJSON();
      expect(json).not.toHaveProperty("created_at");
      expect(json).not.toHaveProperty("updated_at");
    });
  });

  describe("fromJSON", () => {
    it("should create instance from JSON object", () => {
      const json = {
        model_inventory_id: 1,
        project_id: 5,
        framework_id: 3,
      };

      const model = TestModelInventoryProjectFrameworkModel.fromJSON(json);
      expect(model).toBeInstanceOf(TestModelInventoryProjectFrameworkModel);
      expect(model.model_inventory_id).toBe(1);
      expect(model.project_id).toBe(5);
      expect(model.framework_id).toBe(3);
    });

    it("should handle partial JSON", () => {
      const model = TestModelInventoryProjectFrameworkModel.fromJSON({
        model_inventory_id: 10,
      });

      expect(model.model_inventory_id).toBe(10);
      expect(model.project_id).toBeUndefined();
      expect(model.framework_id).toBeUndefined();
    });
  });
});
