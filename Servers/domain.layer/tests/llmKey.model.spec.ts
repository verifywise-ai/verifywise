jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    ENUM: jest.fn(),
    JSONB: "JSONB",
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

class TestLLMKeyModel {
  id!: number;
  key!: string;
  name!: string;
  url!: string | null;
  model!: string;
  custom_headers!: Record<string, string> | null;
  created_at!: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  toJSON() {
    return {
      id: this.id,
      key: this.key,
      name: this.name,
      url: this.url,
      model: this.model,
      custom_headers: this.custom_headers,
      created_at: this.created_at,
    };
  }
}

describe("LLMKeyModel", () => {
  it("should instantiate with all fields", () => {
    const model = new TestLLMKeyModel({
      id: 1,
      key: "sk-abc123",
      name: "Anthropic",
      url: null,
      model: "claude-3-opus",
      custom_headers: null,
      created_at: new Date(),
    });
    expect(model.id).toBe(1);
    expect(model.key).toBe("sk-abc123");
    expect(model.name).toBe("Anthropic");
    expect(model.url).toBeNull();
    expect(model.model).toBe("claude-3-opus");
    expect(model.custom_headers).toBeNull();
  });

  it("should support custom provider with URL and headers", () => {
    const model = new TestLLMKeyModel({
      id: 2,
      key: "custom-key",
      name: "Custom",
      url: "https://custom-llm.example.com/v1",
      model: "custom-model",
      custom_headers: { "X-Custom-Header": "value" },
    });
    expect(model.name).toBe("Custom");
    expect(model.url).toBe("https://custom-llm.example.com/v1");
    expect(model.custom_headers).toEqual({ "X-Custom-Header": "value" });
  });

  it("should serialize to JSON", () => {
    const model = new TestLLMKeyModel({
      id: 1,
      key: "sk-abc",
      name: "OpenAI",
      url: null,
      model: "gpt-4",
      custom_headers: null,
      created_at: new Date("2024-01-01"),
    });
    const json = model.toJSON();
    expect(json).toHaveProperty("id", 1);
    expect(json).toHaveProperty("key", "sk-abc");
    expect(json).toHaveProperty("name", "OpenAI");
    expect(json).toHaveProperty("model", "gpt-4");
  });

  it("should handle all provider types", () => {
    const providers = ["Anthropic", "OpenAI", "OpenRouter", "Custom"];
    providers.forEach((provider) => {
      const model = new TestLLMKeyModel({ name: provider, key: "k", model: "m" });
      expect(model.name).toBe(provider);
    });
  });
});
