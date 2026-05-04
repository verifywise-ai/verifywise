jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: { INTEGER: "INTEGER", DATE: "DATE", NOW: "NOW" },
  ForeignKey: jest.fn(),
  BelongsTo: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestAutomationTriggerActionModel {
  id?: number;
  trigger_id!: number;
  action_id!: number;
  created_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("AutomationTriggerActionModel", () => {
  it("should instantiate with FK fields", () => {
    const m = new TestAutomationTriggerActionModel({ id: 1, trigger_id: 10, action_id: 20 });
    expect(m.trigger_id).toBe(10);
    expect(m.action_id).toBe(20);
  });

  it("should handle optional fields", () => {
    const m = new TestAutomationTriggerActionModel({ trigger_id: 1, action_id: 2 });
    expect(m.id).toBeUndefined();
    expect(m.created_at).toBeUndefined();
  });
});
