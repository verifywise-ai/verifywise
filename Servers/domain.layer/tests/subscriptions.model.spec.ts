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
  BelongsTo: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestSubscriptionsModel {
  id?: number;
  organization_id!: number;
  tier_id!: number;
  status!: string;
  start_date!: Date;
  end_date?: Date;
  created_at?: Date;
  updated_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  isActive(): boolean {
    return this.status === "active";
  }
}

describe("SubscriptionsModel", () => {
  it("should instantiate with required fields", () => {
    const s = new TestSubscriptionsModel({
      id: 1,
      organization_id: 1,
      tier_id: 2,
      status: "active",
      start_date: new Date("2025-01-01"),
    });
    expect(s.organization_id).toBe(1);
    expect(s.tier_id).toBe(2);
    expect(s.status).toBe("active");
  });

  it("should check active status", () => {
    const active = new TestSubscriptionsModel({
      organization_id: 1,
      tier_id: 1,
      status: "active",
      start_date: new Date(),
    });
    expect(active.isActive()).toBe(true);

    const expired = new TestSubscriptionsModel({
      organization_id: 1,
      tier_id: 1,
      status: "expired",
      start_date: new Date(),
    });
    expect(expired.isActive()).toBe(false);
  });
});
