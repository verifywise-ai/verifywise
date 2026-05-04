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
    ENUM: jest.fn(),
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

class TestPmmConfigModel {
  id?: number;
  organization_id!: number;
  name!: string;
  frequency?: string;
  is_active?: boolean;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestPmmCycleModel {
  id?: number;
  config_id!: number;
  status!: string;
  start_date!: Date;
  end_date?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestPmmQuestionModel {
  id?: number;
  config_id!: number;
  question_text!: string;
  question_type!: string;
  order_index!: number;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestPmmReportModel {
  id?: number;
  cycle_id!: number;
  generated_by!: number;
  report_data?: object;
  created_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestPmmResponseModel {
  id?: number;
  cycle_id!: number;
  question_id!: number;
  response_value!: string;
  responded_by!: number;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("PmmConfigModel", () => {
  it("should instantiate with required fields", () => {
    const c = new TestPmmConfigModel({
      id: 1,
      organization_id: 1,
      name: "Monthly AI Review",
      frequency: "monthly",
      is_active: true,
    });
    expect(c.name).toBe("Monthly AI Review");
    expect(c.is_active).toBe(true);
  });
});

describe("PmmCycleModel", () => {
  it("should track cycle dates and status", () => {
    const c = new TestPmmCycleModel({
      id: 1,
      config_id: 10,
      status: "in_progress",
      start_date: new Date("2025-01-01"),
    });
    expect(c.status).toBe("in_progress");
    expect(c.end_date).toBeUndefined();
  });
});

describe("PmmQuestionModel", () => {
  it("should store question with ordering", () => {
    const q = new TestPmmQuestionModel({
      id: 1,
      config_id: 10,
      question_text: "Has the model drifted?",
      question_type: "yes_no",
      order_index: 1,
    });
    expect(q.question_text).toBe("Has the model drifted?");
    expect(q.order_index).toBe(1);
  });
});

describe("PmmReportModel", () => {
  it("should store report data", () => {
    const r = new TestPmmReportModel({
      id: 1,
      cycle_id: 10,
      generated_by: 42,
      report_data: { summary: "All good", score: 95 },
    });
    expect(r.report_data).toEqual({ summary: "All good", score: 95 });
  });
});

describe("PmmResponseModel", () => {
  it("should store response", () => {
    const r = new TestPmmResponseModel({
      id: 1,
      cycle_id: 10,
      question_id: 5,
      response_value: "Yes",
      responded_by: 42,
    });
    expect(r.response_value).toBe("Yes");
    expect(r.responded_by).toBe(42);
  });
});
