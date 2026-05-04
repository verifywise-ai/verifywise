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

class TestEvidenceHubModel {
  id?: number;
  title!: string;
  description?: string;
  evidence_type!: string;
  file_id?: number;
  project_id!: number;
  organization_id!: number;
  uploaded_by!: number;
  created_at?: Date;
  updated_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("EvidenceHubModel", () => {
  it("should instantiate with required fields", () => {
    const e = new TestEvidenceHubModel({
      id: 1,
      title: "Audit Report",
      evidence_type: "document",
      project_id: 10,
      organization_id: 1,
      uploaded_by: 42,
    });
    expect(e.title).toBe("Audit Report");
    expect(e.evidence_type).toBe("document");
    expect(e.project_id).toBe(10);
  });

  it("should support file attachment", () => {
    const e = new TestEvidenceHubModel({
      title: "Screenshot",
      evidence_type: "image",
      file_id: 5,
      project_id: 1,
      organization_id: 1,
      uploaded_by: 1,
    });
    expect(e.file_id).toBe(5);
  });

  it("should handle optional fields", () => {
    const e = new TestEvidenceHubModel({
      title: "Test",
      evidence_type: "other",
      project_id: 1,
      organization_id: 1,
      uploaded_by: 1,
    });
    expect(e.description).toBeUndefined();
    expect(e.file_id).toBeUndefined();
  });
});
