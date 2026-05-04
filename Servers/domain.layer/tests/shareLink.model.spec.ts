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

class TestShareLinkModel {
  id?: number;
  token!: string;
  entity_type!: string;
  entity_id!: number;
  created_by!: number;
  expires_at?: Date;
  is_active?: boolean;
  created_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  isExpired(): boolean {
    if (!this.expires_at) return false;
    return new Date() > this.expires_at;
  }
}

describe("ShareLinkModel", () => {
  it("should instantiate with required fields", () => {
    const s = new TestShareLinkModel({
      id: 1,
      token: "abc123xyz",
      entity_type: "project",
      entity_id: 10,
      created_by: 42,
      is_active: true,
    });
    expect(s.token).toBe("abc123xyz");
    expect(s.entity_type).toBe("project");
    expect(s.is_active).toBe(true);
  });

  it("should detect expired links", () => {
    const s = new TestShareLinkModel({
      token: "t",
      entity_type: "project",
      entity_id: 1,
      created_by: 1,
      expires_at: new Date("2020-01-01"),
    });
    expect(s.isExpired()).toBe(true);
  });

  it("should detect non-expired links", () => {
    const s = new TestShareLinkModel({
      token: "t",
      entity_type: "project",
      entity_id: 1,
      created_by: 1,
      expires_at: new Date("2030-01-01"),
    });
    expect(s.isExpired()).toBe(false);
  });

  it("should handle links without expiry", () => {
    const s = new TestShareLinkModel({
      token: "t",
      entity_type: "project",
      entity_id: 1,
      created_by: 1,
    });
    expect(s.isExpired()).toBe(false);
  });
});
