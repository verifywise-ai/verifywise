jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    ENUM: jest.fn(),
    JSONB: "JSONB",
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

class TestScanModel {
  id?: number;
  repository_url!: string;
  branch?: string;
  status!: string;
  started_at?: Date;
  completed_at?: Date;
  total_findings?: number;
  organization_id!: number;
  created_by!: number;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestFindingModel {
  id?: number;
  scan_id!: number;
  file_path!: string;
  line_number?: number;
  finding_type!: string;
  severity!: string;
  description?: string;
  recommendation?: string;
  confidence_score?: number;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("ScanModel", () => {
  it("should instantiate with required fields", () => {
    const scan = new TestScanModel({
      id: 1,
      repository_url: "https://github.com/org/repo",
      branch: "main",
      status: "completed",
      total_findings: 5,
      organization_id: 1,
      created_by: 42,
    });
    expect(scan.repository_url).toBe("https://github.com/org/repo");
    expect(scan.status).toBe("completed");
    expect(scan.total_findings).toBe(5);
  });

  it("should handle optional fields", () => {
    const scan = new TestScanModel({
      repository_url: "https://github.com/org/repo",
      status: "pending",
      organization_id: 1,
      created_by: 1,
    });
    expect(scan.branch).toBeUndefined();
    expect(scan.completed_at).toBeUndefined();
  });
});

describe("FindingModel", () => {
  it("should instantiate with required fields", () => {
    const finding = new TestFindingModel({
      id: 1,
      scan_id: 10,
      file_path: "src/model.py",
      line_number: 42,
      finding_type: "ai_usage",
      severity: "high",
      description: "Unvetted AI model usage",
      confidence_score: 0.95,
    });
    expect(finding.file_path).toBe("src/model.py");
    expect(finding.severity).toBe("high");
    expect(finding.confidence_score).toBe(0.95);
  });

  it("should link to scan via scan_id", () => {
    const finding = new TestFindingModel({
      scan_id: 10,
      file_path: "a.py",
      finding_type: "t",
      severity: "low",
    });
    expect(finding.scan_id).toBe(10);
  });
});
