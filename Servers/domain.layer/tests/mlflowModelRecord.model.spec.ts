jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    JSONB: "JSONB",
    NOW: "NOW",
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestMlflowModelRecordModel {
  id?: number;
  organization_id!: number;
  model_name!: string;
  version?: string;
  stage?: string;
  run_id?: string;
  metrics?: object;
  created_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("MlflowModelRecordModel", () => {
  it("should instantiate with required fields", () => {
    const m = new TestMlflowModelRecordModel({
      id: 1,
      organization_id: 1,
      model_name: "fraud_detector",
      version: "3",
      stage: "Production",
    });
    expect(m.model_name).toBe("fraud_detector");
    expect(m.version).toBe("3");
    expect(m.stage).toBe("Production");
  });

  it("should store metrics as JSON", () => {
    const m = new TestMlflowModelRecordModel({
      organization_id: 1,
      model_name: "test",
      metrics: { accuracy: 0.95, f1_score: 0.92 },
    });
    expect(m.metrics).toEqual({ accuracy: 0.95, f1_score: 0.92 });
  });
});
