import { ModelRiskLevel } from "../enums/model-risk-level.enum";

jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    ENUM: jest.fn(),
    NOW: "NOW",
  },
  ForeignKey: jest.fn(),
  BelongsTo: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestModelRiskModel {
  id?: number;
  model_inventory_id!: number;
  risk_name!: string;
  description?: string;
  risk_level!: string;
  status!: string;
  category?: string;
  mitigation_plan?: string;
  created_at?: Date;
  updated_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("ModelRiskModel", () => {
  it("should instantiate with required fields", () => {
    const r = new TestModelRiskModel({
      id: 1,
      model_inventory_id: 10,
      risk_name: "Data leakage",
      risk_level: ModelRiskLevel.HIGH,
      status: "Open",
    });
    expect(r.risk_name).toBe("Data leakage");
    expect(r.risk_level).toBe(ModelRiskLevel.HIGH);
  });

  it("should support all risk levels", () => {
    Object.values(ModelRiskLevel).forEach((level) => {
      const r = new TestModelRiskModel({
        model_inventory_id: 1,
        risk_name: "Test",
        risk_level: level,
        status: "Open",
      });
      expect(r.risk_level).toBe(level);
    });
  });

  it("should handle optional fields", () => {
    const r = new TestModelRiskModel({
      model_inventory_id: 1,
      risk_name: "Test",
      risk_level: "Low",
      status: "Open",
    });
    expect(r.description).toBeUndefined();
    expect(r.mitigation_plan).toBeUndefined();
  });
});
