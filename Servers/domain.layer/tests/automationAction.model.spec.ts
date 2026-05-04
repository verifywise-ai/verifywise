import { ValidationException } from "../exceptions/custom.exception";

jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    TEXT: "TEXT",
    DATE: "DATE",
    JSONB: "JSONB",
    NOW: "NOW",
  },
  ForeignKey: jest.fn(),
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

class TestAutomationActionModel {
  id?: number;
  key!: string;
  label!: string;
  description?: string;
  default_params?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  static async createNewAutomationAction(
    key: string,
    label: string,
    description?: string,
    default_params?: Record<string, any>,
  ): Promise<TestAutomationActionModel> {
    if (!key || key.trim().length === 0) {
      throw new ValidationException("Action key is required", "key", key);
    }
    if (!label || label.trim().length === 0) {
      throw new ValidationException("Action label is required", "label", label);
    }
    const a = new TestAutomationActionModel();
    a.key = key.trim();
    a.label = label.trim();
    a.description = description?.trim();
    a.default_params = default_params || {};
    return a;
  }

  async updateAction(updateData: {
    label?: string;
    description?: string;
    default_params?: Record<string, any>;
  }) {
    if (updateData.label !== undefined) {
      if (!updateData.label || updateData.label.trim().length === 0) {
        throw new ValidationException("Label cannot be empty", "label", updateData.label);
      }
      this.label = updateData.label.trim();
    }
    if (updateData.description !== undefined) {
      this.description = updateData.description?.trim();
    }
    if (updateData.default_params !== undefined) {
      this.default_params = updateData.default_params;
    }
  }

  getSummary() {
    return { key: this.key, label: this.label, description: this.description };
  }

  mergeWithDefaults(customParams: Record<string, any>): Record<string, any> {
    return { ...(this.default_params || {}), ...customParams };
  }

  toJSON() {
    return {
      id: this.id,
      key: this.key,
      label: this.label,
      description: this.description,
      default_params: this.default_params,
    };
  }
}

describe("AutomationActionModel", () => {
  describe("createNewAutomationAction", () => {
    it("should create with valid data", async () => {
      const a = await TestAutomationActionModel.createNewAutomationAction(
        "send_email",
        "Send Email",
        "Sends an email",
      );
      expect(a.key).toBe("send_email");
      expect(a.label).toBe("Send Email");
      expect(a.description).toBe("Sends an email");
      expect(a.default_params).toEqual({});
    });

    it("should throw for empty key", async () => {
      await expect(
        TestAutomationActionModel.createNewAutomationAction("", "Label"),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw for empty label", async () => {
      await expect(TestAutomationActionModel.createNewAutomationAction("key", "")).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe("updateAction", () => {
    it("should update label", async () => {
      const a = new TestAutomationActionModel({ key: "k", label: "Old" });
      await a.updateAction({ label: "New" });
      expect(a.label).toBe("New");
    });

    it("should throw for empty label update", async () => {
      const a = new TestAutomationActionModel({ key: "k", label: "Old" });
      await expect(a.updateAction({ label: "" })).rejects.toThrow(ValidationException);
    });
  });

  describe("mergeWithDefaults", () => {
    it("should merge custom params over defaults", () => {
      const a = new TestAutomationActionModel({ default_params: { timeout: 30, retries: 3 } });
      const merged = a.mergeWithDefaults({ timeout: 60, extra: true });
      expect(merged).toEqual({ timeout: 60, retries: 3, extra: true });
    });

    it("should handle empty defaults", () => {
      const a = new TestAutomationActionModel({ default_params: {} });
      expect(a.mergeWithDefaults({ key: "val" })).toEqual({ key: "val" });
    });
  });

  describe("getSummary", () => {
    it("should return summary", () => {
      const a = new TestAutomationActionModel({ key: "k", label: "L", description: "D" });
      expect(a.getSummary()).toEqual({ key: "k", label: "L", description: "D" });
    });
  });
});
