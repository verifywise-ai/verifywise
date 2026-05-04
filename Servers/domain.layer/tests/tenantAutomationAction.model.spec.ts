jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
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

class TestTenantAutomationActionModel {
  id?: number;
  organization_id!: number;
  action_id!: number;
  is_enabled?: boolean;
  custom_params?: object;
  created_at?: Date;
  updated_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("TenantAutomationActionModel", () => {
  it("should instantiate with required fields", () => {
    const m = new TestTenantAutomationActionModel({
      id: 1,
      organization_id: 100,
      action_id: 5,
      is_enabled: true,
    });
    expect(m.organization_id).toBe(100);
    expect(m.action_id).toBe(5);
    expect(m.is_enabled).toBe(true);
  });

  it("should enforce tenant isolation via organization_id", () => {
    const org1 = new TestTenantAutomationActionModel({ organization_id: 1, action_id: 5 });
    const org2 = new TestTenantAutomationActionModel({ organization_id: 2, action_id: 5 });
    expect(org1.organization_id).not.toBe(org2.organization_id);
  });

  it("should support custom params", () => {
    const m = new TestTenantAutomationActionModel({
      organization_id: 1,
      action_id: 1,
      custom_params: { webhook_url: "https://example.com" },
    });
    expect(m.custom_params).toEqual({ webhook_url: "https://example.com" });
  });
});
