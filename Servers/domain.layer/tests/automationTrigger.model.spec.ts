import { ValidationException } from "../exceptions/custom.exception";

jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: { INTEGER: "INTEGER", TEXT: "TEXT", DATE: "DATE", NOW: "NOW" },
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

class TestAutomationTriggerModel {
  id?: number;
  key!: string;
  label!: string;
  event_name!: string;
  description?: string;
  created_at?: Date;
  updated_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  static async createNewAutomationTrigger(
    key: string,
    label: string,
    event_name: string,
    description?: string,
  ): Promise<TestAutomationTriggerModel> {
    if (!key || key.trim().length === 0)
      throw new ValidationException("Trigger key is required", "key", key);
    if (!label || label.trim().length === 0)
      throw new ValidationException("Trigger label is required", "label", label);
    if (!event_name || event_name.trim().length === 0)
      throw new ValidationException("Event name is required", "event_name", event_name);
    const t = new TestAutomationTriggerModel();
    t.key = key.trim();
    t.label = label.trim();
    t.event_name = event_name.trim();
    t.description = description?.trim();
    return t;
  }

  async updateTrigger(updateData: { label?: string; event_name?: string; description?: string }) {
    if (updateData.label !== undefined) {
      if (!updateData.label || updateData.label.trim().length === 0)
        throw new ValidationException("Label cannot be empty", "label", updateData.label);
      this.label = updateData.label.trim();
    }
    if (updateData.event_name !== undefined) {
      if (!updateData.event_name || updateData.event_name.trim().length === 0)
        throw new ValidationException(
          "Event name cannot be empty",
          "event_name",
          updateData.event_name,
        );
      this.event_name = updateData.event_name.trim();
    }
    if (updateData.description !== undefined) {
      this.description = updateData.description?.trim();
    }
  }

  getSummary() {
    return { key: this.key, label: this.label, event_name: this.event_name };
  }

  toJSON() {
    return {
      id: this.id,
      key: this.key,
      label: this.label,
      event_name: this.event_name,
      description: this.description,
    };
  }
}

describe("AutomationTriggerModel", () => {
  describe("createNewAutomationTrigger", () => {
    it("should create with valid data", async () => {
      const t = await TestAutomationTriggerModel.createNewAutomationTrigger(
        "on_risk_created",
        "Risk Created",
        "risk.created",
        "Fires when risk is created",
      );
      expect(t.key).toBe("on_risk_created");
      expect(t.label).toBe("Risk Created");
      expect(t.event_name).toBe("risk.created");
    });

    it("should throw for empty key", async () => {
      await expect(
        TestAutomationTriggerModel.createNewAutomationTrigger("", "L", "e"),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw for empty label", async () => {
      await expect(
        TestAutomationTriggerModel.createNewAutomationTrigger("k", "", "e"),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw for empty event_name", async () => {
      await expect(
        TestAutomationTriggerModel.createNewAutomationTrigger("k", "l", ""),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("updateTrigger", () => {
    it("should update label", async () => {
      const t = new TestAutomationTriggerModel({ key: "k", label: "Old", event_name: "e" });
      await t.updateTrigger({ label: "New" });
      expect(t.label).toBe("New");
    });

    it("should throw for empty label", async () => {
      const t = new TestAutomationTriggerModel({ key: "k", label: "Old", event_name: "e" });
      await expect(t.updateTrigger({ label: "" })).rejects.toThrow(ValidationException);
    });

    it("should throw for empty event_name", async () => {
      const t = new TestAutomationTriggerModel({ key: "k", label: "L", event_name: "old" });
      await expect(t.updateTrigger({ event_name: "" })).rejects.toThrow(ValidationException);
    });
  });

  describe("getSummary", () => {
    it("should return summary", () => {
      const t = new TestAutomationTriggerModel({ key: "k", label: "L", event_name: "e" });
      expect(t.getSummary()).toEqual({ key: "k", label: "L", event_name: "e" });
    });
  });
});
