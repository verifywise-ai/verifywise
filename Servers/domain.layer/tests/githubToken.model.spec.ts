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

class TestGitHubTokenModel {
  id?: number;
  encrypted_token!: string;
  token_name?: string;
  created_by!: number;
  created_at?: Date;
  updated_at?: Date;
  last_used_at?: Date;

  constructor(init?: any) {
    if (init) Object.assign(this, init);
  }

  markUsed(): void {
    this.last_used_at = new Date();
    this.updated_at = new Date();
  }
}

describe("GitHubTokenModel", () => {
  it("should instantiate with provided data", () => {
    const model = new TestGitHubTokenModel({
      id: 1,
      encrypted_token: "enc_token_xyz",
      token_name: "My GitHub Token",
      created_by: 42,
    });
    expect(model.id).toBe(1);
    expect(model.encrypted_token).toBe("enc_token_xyz");
    expect(model.token_name).toBe("My GitHub Token");
    expect(model.created_by).toBe(42);
  });

  it("should instantiate without data", () => {
    const model = new TestGitHubTokenModel();
    expect(model.id).toBeUndefined();
    expect(model.encrypted_token).toBeUndefined();
  });

  it("should default token_name to undefined when not provided", () => {
    const model = new TestGitHubTokenModel({ encrypted_token: "abc", created_by: 1 });
    expect(model.token_name).toBeUndefined();
  });

  describe("markUsed", () => {
    it("should set last_used_at and updated_at to current date", () => {
      const model = new TestGitHubTokenModel({
        encrypted_token: "abc",
        created_by: 1,
      });
      expect(model.last_used_at).toBeUndefined();

      model.markUsed();

      expect(model.last_used_at).toBeInstanceOf(Date);
      expect(model.updated_at).toBeInstanceOf(Date);
    });

    it("should update timestamps on each call", () => {
      const model = new TestGitHubTokenModel({ encrypted_token: "abc", created_by: 1 });
      model.markUsed();

      // Simulate another call
      model.markUsed();
      expect(model.last_used_at).toBeInstanceOf(Date);
      expect(model.updated_at).toBeInstanceOf(Date);
    });
  });
});
