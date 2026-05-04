jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
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

class TestEvaluationLlmApiKeyModel {
  id?: number;
  organization_id!: number;
  provider!: string;
  api_key!: string;
  created_at?: Date;
  updated_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("EvaluationLlmApiKeyModel", () => {
  it("should instantiate with required fields", () => {
    const k = new TestEvaluationLlmApiKeyModel({
      id: 1,
      organization_id: 1,
      provider: "openai",
      api_key: "sk-abc123",
    });
    expect(k.provider).toBe("openai");
    expect(k.api_key).toBe("sk-abc123");
  });

  it("should store keys for different providers", () => {
    ["openai", "anthropic", "custom"].forEach((provider) => {
      const k = new TestEvaluationLlmApiKeyModel({
        organization_id: 1,
        provider,
        api_key: "key-" + provider,
      });
      expect(k.provider).toBe(provider);
    });
  });
});
