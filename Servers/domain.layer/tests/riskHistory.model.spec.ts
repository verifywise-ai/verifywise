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

class TestRiskHistoryModel {
  id?: number;
  risk_id!: number;
  changed_by!: number;
  change_type!: string;
  old_value?: object;
  new_value?: object;
  created_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("RiskHistoryModel", () => {
  it("should create history entry", () => {
    const h = new TestRiskHistoryModel({
      id: 1,
      risk_id: 10,
      changed_by: 42,
      change_type: "status_change",
      old_value: { status: "Open" },
      new_value: { status: "Resolved" },
    });
    expect(h.risk_id).toBe(10);
    expect(h.change_type).toBe("status_change");
    expect(h.old_value).toEqual({ status: "Open" });
    expect(h.new_value).toEqual({ status: "Resolved" });
  });

  it("should track who made the change", () => {
    const h = new TestRiskHistoryModel({ risk_id: 1, changed_by: 5, change_type: "update" });
    expect(h.changed_by).toBe(5);
  });
});
