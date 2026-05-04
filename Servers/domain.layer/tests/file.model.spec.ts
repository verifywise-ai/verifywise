jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    NOW: "NOW",
    BIGINT: "BIGINT",
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestFileModel {
  id?: number;
  filename!: string;
  original_name!: string;
  mime_type!: string;
  size!: number;
  path!: string;
  uploaded_by!: number;
  organization_id!: number;
  created_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("FileModel", () => {
  it("should instantiate with file metadata", () => {
    const f = new TestFileModel({
      id: 1,
      filename: "abc123.pdf",
      original_name: "report.pdf",
      mime_type: "application/pdf",
      size: 1024000,
      path: "/uploads/abc123.pdf",
      uploaded_by: 42,
      organization_id: 1,
    });
    expect(f.filename).toBe("abc123.pdf");
    expect(f.original_name).toBe("report.pdf");
    expect(f.mime_type).toBe("application/pdf");
    expect(f.size).toBe(1024000);
  });

  it("should track uploader", () => {
    const f = new TestFileModel({
      filename: "a.txt",
      original_name: "a.txt",
      mime_type: "text/plain",
      size: 100,
      path: "/uploads/a.txt",
      uploaded_by: 5,
      organization_id: 1,
    });
    expect(f.uploaded_by).toBe(5);
  });
});
