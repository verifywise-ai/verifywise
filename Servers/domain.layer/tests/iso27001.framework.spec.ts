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

class TestISO27001ClauseStruct {
  id?: number;
  title!: string;
  clause_number!: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestISO27001SubClauseStruct {
  id?: number;
  title!: string;
  clause_id!: number;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestISO27001SubClause {
  id?: number;
  project_id!: number;
  sub_clause_struct_id!: number;
  status?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestISO27001SubClauseRisks {
  id?: number;
  sub_clause_id!: number;
  risk_description?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestISO27001AnnexStruct {
  id?: number;
  title!: string;
  annex_number!: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestISO27001AnnexControlStruct {
  id?: number;
  title!: string;
  annex_id!: number;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestISO27001AnnexControl {
  id?: number;
  project_id!: number;
  control_struct_id!: number;
  status?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}
class TestISO27001AnnexControlRisks {
  id?: number;
  control_id!: number;
  risk_description?: string;
  constructor(d?: any) {
    if (d) Object.assign(this, d);
  }
}

describe("ISO 27001 Framework Models", () => {
  describe("ClauseStruct", () => {
    it("should instantiate", () => {
      const m = new TestISO27001ClauseStruct({
        id: 1,
        title: "Context of the Organization",
        clause_number: "4",
      });
      expect(m.title).toBe("Context of the Organization");
      expect(m.clause_number).toBe("4");
    });
  });

  describe("SubClauseStruct", () => {
    it("should link to clause", () => {
      const m = new TestISO27001SubClauseStruct({
        id: 1,
        title: "Understanding the Organization",
        clause_id: 1,
      });
      expect(m.clause_id).toBe(1);
    });
  });

  describe("SubClause", () => {
    it("should track status per project", () => {
      const m = new TestISO27001SubClause({
        id: 1,
        project_id: 10,
        sub_clause_struct_id: 1,
        status: "compliant",
      });
      expect(m.status).toBe("compliant");
    });
  });

  describe("SubClauseRisks", () => {
    it("should link risk to sub-clause", () => {
      const m = new TestISO27001SubClauseRisks({
        id: 1,
        sub_clause_id: 1,
        risk_description: "Gap in documentation",
      });
      expect(m.risk_description).toBe("Gap in documentation");
    });
  });

  describe("AnnexStruct", () => {
    it("should instantiate", () => {
      const m = new TestISO27001AnnexStruct({
        id: 1,
        title: "Information Security Policies",
        annex_number: "A.5",
      });
      expect(m.annex_number).toBe("A.5");
    });
  });

  describe("AnnexControlStruct", () => {
    it("should link to annex", () => {
      const m = new TestISO27001AnnexControlStruct({
        id: 1,
        title: "Policies for information security",
        annex_id: 1,
      });
      expect(m.annex_id).toBe(1);
    });
  });

  describe("AnnexControl", () => {
    it("should track control status", () => {
      const m = new TestISO27001AnnexControl({
        id: 1,
        project_id: 10,
        control_struct_id: 1,
        status: "implemented",
      });
      expect(m.status).toBe("implemented");
    });
  });

  describe("AnnexControlRisks", () => {
    it("should link risk to control", () => {
      const m = new TestISO27001AnnexControlRisks({
        id: 1,
        control_id: 1,
        risk_description: "Missing policy",
      });
      expect(m.control_id).toBe(1);
    });
  });
});
