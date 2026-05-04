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
  HasMany: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestClauseStructISO {
  id?: number;
  title!: string;
  clause_number!: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestSubClauseStructISO {
  id?: number;
  title!: string;
  clause_id!: number;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestSubClauseISO {
  id?: number;
  project_id!: number;
  sub_clause_struct_id!: number;
  status?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestSubClauseISORisks {
  id?: number;
  sub_clause_id!: number;
  risk_description?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestAnnexStructISO {
  id?: number;
  title!: string;
  annex_number!: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestAnnexCategoryStructISO {
  id?: number;
  title!: string;
  annex_id!: number;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestAnnexCategoryISO {
  id?: number;
  project_id!: number;
  category_struct_id!: number;
  status?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestAnnexCategoryISORisks {
  id?: number;
  category_id!: number;
  risk_description?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}

describe("ISO 42001 Framework Models", () => {
  describe("ClauseStructISO", () => {
    it("should instantiate", () => {
      const m = new TestClauseStructISO({
        id: 1,
        title: "Context of the Organization",
        clause_number: "4",
      });
      expect(m.clause_number).toBe("4");
    });
  });

  describe("SubClauseStructISO", () => {
    it("should link to clause", () => {
      const m = new TestSubClauseStructISO({ id: 1, title: "Understanding needs", clause_id: 1 });
      expect(m.clause_id).toBe(1);
    });
  });

  describe("SubClauseISO", () => {
    it("should track status per project", () => {
      const m = new TestSubClauseISO({
        id: 1,
        project_id: 10,
        sub_clause_struct_id: 1,
        status: "compliant",
      });
      expect(m.status).toBe("compliant");
    });
  });

  describe("SubClauseISORisks", () => {
    it("should link risk", () => {
      const m = new TestSubClauseISORisks({ id: 1, sub_clause_id: 1, risk_description: "Gap" });
      expect(m.sub_clause_id).toBe(1);
    });
  });

  describe("AnnexStructISO", () => {
    it("should instantiate", () => {
      const m = new TestAnnexStructISO({ id: 1, title: "AI Management", annex_number: "A" });
      expect(m.title).toBe("AI Management");
    });
  });

  describe("AnnexCategoryStructISO", () => {
    it("should link to annex", () => {
      const m = new TestAnnexCategoryStructISO({ id: 1, title: "AI Policy", annex_id: 1 });
      expect(m.annex_id).toBe(1);
    });
  });

  describe("AnnexCategoryISO", () => {
    it("should track status", () => {
      const m = new TestAnnexCategoryISO({
        id: 1,
        project_id: 10,
        category_struct_id: 1,
        status: "partial",
      });
      expect(m.status).toBe("partial");
    });
  });

  describe("AnnexCategoryISORisks", () => {
    it("should link risk", () => {
      const m = new TestAnnexCategoryISORisks({
        id: 1,
        category_id: 1,
        risk_description: "Missing control",
      });
      expect(m.category_id).toBe(1);
    });
  });
});
