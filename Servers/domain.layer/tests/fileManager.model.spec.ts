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
    JSONB: "JSONB",
  },
  ForeignKey: jest.fn(),
  BelongsTo: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestFileManagerModel {
  id?: number;
  file_name!: string;
  file_path!: string;
  file_type!: string;
  file_size!: number;
  uploaded_by!: number;
  organization_id!: number;
  created_at?: Date;
  updated_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestFileAccessLogModel {
  id?: number;
  file_id!: number;
  user_id!: number;
  action!: string;
  accessed_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("FileManagerModel", () => {
  it("should instantiate with required fields", () => {
    const f = new TestFileManagerModel({
      id: 1,
      file_name: "report.pdf",
      file_path: "/uploads/report.pdf",
      file_type: "application/pdf",
      file_size: 2048,
      uploaded_by: 1,
      organization_id: 1,
    });
    expect(f.file_name).toBe("report.pdf");
    expect(f.file_size).toBe(2048);
  });
});

describe("FileAccessLogModel", () => {
  it("should log file access", () => {
    const log = new TestFileAccessLogModel({
      id: 1,
      file_id: 10,
      user_id: 42,
      action: "download",
    });
    expect(log.file_id).toBe(10);
    expect(log.user_id).toBe(42);
    expect(log.action).toBe("download");
  });

  it("should support different actions", () => {
    ["download", "view", "delete"].forEach((action) => {
      const log = new TestFileAccessLogModel({ file_id: 1, user_id: 1, action });
      expect(log.action).toBe(action);
    });
  });
});
