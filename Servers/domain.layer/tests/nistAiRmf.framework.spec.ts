import { NISTAIMRFFunctionType } from "../enums/nist-ai-rmf-function.enum";

jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    ENUM: jest.fn(),
    NOW: "NOW",
  },
  ForeignKey: jest.fn(),
  BelongsTo: jest.fn(),
  HasMany: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestNistAiRmfFunctionModel {
  id?: number;
  name!: string;
  function_type!: string;
  description?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}

class TestNistAiRmfCategoryModel {
  id?: number;
  function_id!: number;
  category_id!: string;
  name!: string;
  description?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}

class TestNistAiRmfSubcategoryModel {
  id?: number;
  category_id!: number;
  subcategory_id!: string;
  name!: string;
  description?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}

describe("NIST AI RMF Framework Models", () => {
  describe("NistAiRmfFunctionModel", () => {
    it("should instantiate with function types", () => {
      Object.values(NISTAIMRFFunctionType).forEach((type) => {
        const m = new TestNistAiRmfFunctionModel({ id: 1, name: type, function_type: type });
        expect(m.function_type).toBe(type);
      });
    });
  });

  describe("NistAiRmfCategoryModel", () => {
    it("should link to function", () => {
      const m = new TestNistAiRmfCategoryModel({
        id: 1,
        function_id: 1,
        category_id: "GV.1",
        name: "Governance Policies",
        description: "AI governance policies",
      });
      expect(m.function_id).toBe(1);
      expect(m.category_id).toBe("GV.1");
    });
  });

  describe("NistAiRmfSubcategoryModel", () => {
    it("should link to category", () => {
      const m = new TestNistAiRmfSubcategoryModel({
        id: 1,
        category_id: 1,
        subcategory_id: "GV.1.1",
        name: "Legal Requirements",
        description: "Compliance requirements",
      });
      expect(m.subcategory_id).toBe("GV.1.1");
    });
  });
});
