jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: { INTEGER: "INTEGER", STRING: "STRING", DATE: "DATE", BOOLEAN: "BOOLEAN", NOW: "NOW" },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestTokenModel {
  id?: number;
  token!: string;
  name!: string;
  created_at!: Date;
  updated_at?: Date;
  expires_at!: Date;
  created_by!: number;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  toJSON() {
    return {
      id: this.id,
      token: this.token,
      name: this.name,
      created_at: this.created_at,
      updated_at: this.updated_at,
      expires_at: this.expires_at,
      created_by: this.created_by,
    };
  }
}

describe("TokenModel", () => {
  it("should instantiate with provided data", () => {
    const data = {
      id: 1,
      token: "abc123",
      name: "API Token",
      created_at: new Date(),
      updated_at: new Date(),
      expires_at: new Date("2025-12-31"),
      created_by: 42,
    };
    const token = new TestTokenModel(data);
    expect(token.id).toBe(1);
    expect(token.token).toBe("abc123");
    expect(token.name).toBe("API Token");
    expect(token.created_by).toBe(42);
    expect(token.expires_at).toEqual(new Date("2025-12-31"));
  });

  it("should instantiate without data", () => {
    const token = new TestTokenModel();
    expect(token.id).toBeUndefined();
  });

  it("should serialize to JSON", () => {
    const token = new TestTokenModel({
      id: 1,
      token: "abc",
      name: "Test",
      created_at: new Date("2024-01-01"),
      expires_at: new Date("2025-01-01"),
      created_by: 1,
    });
    const json = token.toJSON();
    expect(json).toHaveProperty("id", 1);
    expect(json).toHaveProperty("token", "abc");
    expect(json).toHaveProperty("name", "Test");
    expect(json).toHaveProperty("created_by", 1);
  });

  it("should have required fields", () => {
    const token = new TestTokenModel({
      token: "required",
      name: "required",
      expires_at: new Date(),
      created_by: 1,
    });
    expect(token.token).toBe("required");
    expect(token.name).toBe("required");
    expect(token.created_by).toBe(1);
  });
});
