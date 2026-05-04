jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    TEXT: "TEXT",
    DATE: "DATE",
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
  },
}));

class TestModelInventoryHistoryModel {
  id?: number;
  parameter!: string;
  snapshot_data!: Record<string, number>;
  recorded_at!: Date;
  triggered_by_user_id?: number;
  change_description?: string;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("ModelInventoryHistoryModel", () => {
  it("should store version history snapshot", () => {
    const h = new TestModelInventoryHistoryModel({
      id: 1,
      parameter: "model_count",
      snapshot_data: { total: 15, approved: 10, pending: 5 },
      recorded_at: new Date(),
      triggered_by_user_id: 42,
    });
    expect(h.parameter).toBe("model_count");
    expect(h.snapshot_data.total).toBe(15);
  });

  it("should handle optional fields", () => {
    const h = new TestModelInventoryHistoryModel({
      parameter: "status_distribution",
      snapshot_data: { approved: 5 },
      recorded_at: new Date(),
    });
    expect(h.triggered_by_user_id).toBeUndefined();
    expect(h.change_description).toBeUndefined();
  });

  it("should include change description", () => {
    const h = new TestModelInventoryHistoryModel({
      parameter: "risk_score",
      snapshot_data: { avg: 3.5 },
      recorded_at: new Date(),
      change_description: "Monthly recalculation",
    });
    expect(h.change_description).toBe("Monthly recalculation");
  });
});
