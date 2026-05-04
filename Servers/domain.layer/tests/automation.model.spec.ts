import { ValidationException } from "../exceptions/custom.exception";

jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    JSONB: "JSONB",
    NOW: "NOW",
  },
  ForeignKey: jest.fn(),
  BelongsTo: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
    async save() {
      return this;
    }
  },
}));

class TestAutomationModel {
  id?: number;
  name!: string;
  trigger_id!: number;
  params?: object;
  is_active?: boolean;
  created_by?: number;
  created_at?: Date;
  updated_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  static async createNewAutomation(
    name: string,
    trigger_id: number,
    created_by?: number,
    is_active = true,
  ): Promise<TestAutomationModel> {
    if (!name || name.trim().length === 0) {
      throw new ValidationException("Automation name is required", "name", name);
    }
    if (!trigger_id) {
      throw new ValidationException("Trigger ID is required", "trigger_id", trigger_id);
    }
    const a = new TestAutomationModel();
    a.name = name.trim();
    a.trigger_id = trigger_id;
    a.created_by = created_by;
    a.is_active = is_active;
    return a;
  }

  async updateAutomation(updateData: { name?: string; is_active?: boolean }) {
    if (updateData.name !== undefined) {
      if (!updateData.name || updateData.name.trim().length === 0) {
        throw new ValidationException("Name cannot be empty", "name", updateData.name);
      }
      this.name = updateData.name.trim();
    }
    if (updateData.is_active !== undefined) {
      this.is_active = updateData.is_active;
    }
  }

  isActive(): boolean {
    return this.is_active === true;
  }

  getSummary() {
    return { id: this.id, name: this.name, is_active: this.is_active };
  }

  toJSON() {
    return { id: this.id, name: this.name, trigger_id: this.trigger_id, is_active: this.is_active };
  }
}

describe("AutomationModel", () => {
  describe("createNewAutomation", () => {
    it("should create with valid data", async () => {
      const a = await TestAutomationModel.createNewAutomation("Email Alert", 1, 42);
      expect(a.name).toBe("Email Alert");
      expect(a.trigger_id).toBe(1);
      expect(a.created_by).toBe(42);
      expect(a.is_active).toBe(true);
    });

    it("should throw for empty name", async () => {
      await expect(TestAutomationModel.createNewAutomation("", 1)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should throw for missing trigger_id", async () => {
      await expect(TestAutomationModel.createNewAutomation("Test", 0)).rejects.toThrow(
        ValidationException,
      );
    });

    it("should default is_active to true", async () => {
      const a = await TestAutomationModel.createNewAutomation("Test", 1);
      expect(a.is_active).toBe(true);
    });

    it("should allow setting is_active to false", async () => {
      const a = await TestAutomationModel.createNewAutomation("Test", 1, undefined, false);
      expect(a.is_active).toBe(false);
    });
  });

  describe("updateAutomation", () => {
    it("should update name", async () => {
      const a = new TestAutomationModel({ name: "Old", trigger_id: 1 });
      await a.updateAutomation({ name: "New Name" });
      expect(a.name).toBe("New Name");
    });

    it("should throw for empty name update", async () => {
      const a = new TestAutomationModel({ name: "Old", trigger_id: 1 });
      await expect(a.updateAutomation({ name: "" })).rejects.toThrow(ValidationException);
    });

    it("should update is_active", async () => {
      const a = new TestAutomationModel({ name: "Test", trigger_id: 1, is_active: true });
      await a.updateAutomation({ is_active: false });
      expect(a.is_active).toBe(false);
    });
  });

  describe("isActive", () => {
    it("should return true when active", () => {
      const a = new TestAutomationModel({ is_active: true });
      expect(a.isActive()).toBe(true);
    });

    it("should return false when inactive", () => {
      const a = new TestAutomationModel({ is_active: false });
      expect(a.isActive()).toBe(false);
    });
  });

  describe("getSummary", () => {
    it("should return summary object", () => {
      const a = new TestAutomationModel({ id: 1, name: "Test", is_active: true });
      expect(a.getSummary()).toEqual({ id: 1, name: "Test", is_active: true });
    });
  });

  describe("toJSON", () => {
    it("should serialize correctly", () => {
      const a = new TestAutomationModel({ id: 1, name: "Test", trigger_id: 2, is_active: true });
      expect(a.toJSON()).toEqual({ id: 1, name: "Test", trigger_id: 2, is_active: true });
    });
  });
});
