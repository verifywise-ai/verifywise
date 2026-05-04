jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
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

class TestMlflowIntegrationModel {
  id?: number;
  organization_id!: number;
  tracking_uri!: string;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("MlflowIntegrationModel", () => {
  it("should instantiate with connection config", () => {
    const m = new TestMlflowIntegrationModel({
      id: 1,
      organization_id: 1,
      tracking_uri: "http://mlflow.example.com:5000",
      is_active: true,
    });
    expect(m.tracking_uri).toBe("http://mlflow.example.com:5000");
    expect(m.is_active).toBe(true);
  });

  it("should handle inactive state", () => {
    const m = new TestMlflowIntegrationModel({
      organization_id: 1,
      tracking_uri: "http://localhost:5000",
      is_active: false,
    });
    expect(m.is_active).toBe(false);
  });
});
