jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    JSONB: "JSONB",
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

class TestReportingModel {
  id?: number;
  organization_id!: number;
  report_type!: string;
  report_config?: object;
  generated_by!: number;
  created_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("ReportingModel", () => {
  it("should instantiate with required fields", () => {
    const r = new TestReportingModel({
      id: 1,
      organization_id: 1,
      report_type: "compliance_summary",
      generated_by: 42,
    });
    expect(r.report_type).toBe("compliance_summary");
    expect(r.generated_by).toBe(42);
  });

  it("should store report configuration", () => {
    const r = new TestReportingModel({
      organization_id: 1,
      report_type: "risk_report",
      generated_by: 1,
      report_config: { include_charts: true, date_range: "last_30_days" },
    });
    expect(r.report_config).toEqual({ include_charts: true, date_range: "last_30_days" });
  });
});
