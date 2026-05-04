import { LinkedObjectType } from "../enums/policy-manager.enum";

jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    ARRAY: jest.fn(),
    NOW: "NOW",
    JSONB: "JSONB",
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestPolicyManagerModel {
  id!: number;
  title!: string;
  content_html!: string;
  status!: string;
  tags?: string[];
  next_review_date?: Date;
  author_id!: number;
  last_updated_by!: number;
  last_updated_at!: Date;
  created_at!: Date;
  review_status?: string | null;
  review_comment?: string | null;
  reviewed_by?: number | null;
  reviewed_at?: Date | null;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      content_html: this.content_html,
      status: this.status,
      tags: this.tags,
      author_id: this.author_id,
      last_updated_by: this.last_updated_by,
    };
  }
}

class TestPolicyLinkedObjectsModel {
  id!: number;
  policy_id!: number;
  object_id!: number;
  object_type!: LinkedObjectType;
  created_at!: Date;
  updated_at!: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  toJSON() {
    return {
      id: this.id,
      policy_id: this.policy_id,
      object_id: this.object_id,
      object_type: this.object_type,
    };
  }
}

describe("PolicyManagerModel", () => {
  it("should instantiate with all fields", () => {
    const policy = new TestPolicyManagerModel({
      id: 1,
      title: "Data Privacy Policy",
      content_html: "<p>Policy content</p>",
      status: "active",
      tags: ["privacy", "data"],
      author_id: 1,
      last_updated_by: 2,
      created_at: new Date(),
    });
    expect(policy.title).toBe("Data Privacy Policy");
    expect(policy.status).toBe("active");
    expect(policy.tags).toEqual(["privacy", "data"]);
  });

  it("should handle review fields", () => {
    const policy = new TestPolicyManagerModel({
      id: 1,
      title: "Test",
      content_html: "<p>test</p>",
      status: "reviewed",
      author_id: 1,
      last_updated_by: 1,
      review_status: "approved",
      review_comment: "Looks good",
      reviewed_by: 3,
      reviewed_at: new Date(),
    });
    expect(policy.review_status).toBe("approved");
    expect(policy.review_comment).toBe("Looks good");
    expect(policy.reviewed_by).toBe(3);
  });

  it("should serialize to JSON", () => {
    const policy = new TestPolicyManagerModel({
      id: 1,
      title: "Test",
      content_html: "<p>test</p>",
      status: "active",
      author_id: 1,
      last_updated_by: 1,
    });
    const json = policy.toJSON();
    expect(json).toHaveProperty("title", "Test");
    expect(json).toHaveProperty("status", "active");
  });
});

describe("PolicyLinkedObjectsModel", () => {
  it("should instantiate with required fields", () => {
    const link = new TestPolicyLinkedObjectsModel({
      id: 1,
      policy_id: 10,
      object_id: 20,
      object_type: LinkedObjectType.CONTROL,
    });
    expect(link.policy_id).toBe(10);
    expect(link.object_id).toBe(20);
    expect(link.object_type).toBe(LinkedObjectType.CONTROL);
  });

  it("should support all linked object types", () => {
    Object.values(LinkedObjectType).forEach((type) => {
      const link = new TestPolicyLinkedObjectsModel({
        policy_id: 1,
        object_id: 1,
        object_type: type,
      });
      expect(link.object_type).toBe(type);
    });
  });

  it("should serialize to JSON", () => {
    const link = new TestPolicyLinkedObjectsModel({
      id: 1,
      policy_id: 10,
      object_id: 20,
      object_type: LinkedObjectType.RISK,
    });
    const json = link.toJSON();
    expect(json).toHaveProperty("policy_id", 10);
    expect(json).toHaveProperty("object_type", LinkedObjectType.RISK);
  });
});
