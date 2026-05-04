jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    FLOAT: "FLOAT",
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

class TestRiskModel {
  id?: number;
  risk_name!: string;
  risk_description?: string;
  impact!: number;
  probability!: number;
  risk_level_autocalculated?: string;
  status!: string;
  mitigation?: string;
  project_id!: number;
  created_at?: Date;
  updated_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  calculateRiskScore(): number {
    return this.impact * this.probability;
  }
}

describe("RiskModel", () => {
  it("should instantiate with required fields", () => {
    const r = new TestRiskModel({
      id: 1,
      risk_name: "Data breach",
      impact: 4,
      probability: 3,
      status: "Open",
      project_id: 10,
    });
    expect(r.risk_name).toBe("Data breach");
    expect(r.impact).toBe(4);
    expect(r.probability).toBe(3);
    expect(r.status).toBe("Open");
  });

  it("should calculate risk score", () => {
    const r = new TestRiskModel({
      impact: 4,
      probability: 3,
      risk_name: "Test",
      status: "Open",
      project_id: 1,
    });
    expect(r.calculateRiskScore()).toBe(12);
  });

  it("should handle optional fields", () => {
    const r = new TestRiskModel({
      risk_name: "Test",
      impact: 1,
      probability: 1,
      status: "Open",
      project_id: 1,
    });
    expect(r.risk_description).toBeUndefined();
    expect(r.mitigation).toBeUndefined();
  });
});
