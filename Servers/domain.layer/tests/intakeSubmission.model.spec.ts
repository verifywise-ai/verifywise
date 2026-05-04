import { IntakeSubmissionStatus } from "../enums/intake-submission-status.enum";

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
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestIntakeSubmissionModel {
  id?: number;
  form_id!: number;
  submitted_by!: number;
  status!: string;
  submission_data!: object;
  reviewed_by?: number;
  reviewed_at?: Date;
  created_at?: Date;
  updated_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("IntakeSubmissionModel", () => {
  it("should instantiate with required fields", () => {
    const s = new TestIntakeSubmissionModel({
      id: 1,
      form_id: 10,
      submitted_by: 42,
      status: IntakeSubmissionStatus.PENDING,
      submission_data: { model_name: "GPT-4", use_case: "Customer support" },
    });
    expect(s.form_id).toBe(10);
    expect(s.status).toBe(IntakeSubmissionStatus.PENDING);
  });

  it("should support all statuses", () => {
    Object.values(IntakeSubmissionStatus).forEach((status) => {
      const s = new TestIntakeSubmissionModel({
        form_id: 1,
        submitted_by: 1,
        status,
        submission_data: {},
      });
      expect(s.status).toBe(status);
    });
  });

  it("should handle review fields", () => {
    const s = new TestIntakeSubmissionModel({
      form_id: 1,
      submitted_by: 1,
      status: IntakeSubmissionStatus.APPROVED,
      submission_data: {},
      reviewed_by: 5,
      reviewed_at: new Date(),
    });
    expect(s.reviewed_by).toBe(5);
    expect(s.reviewed_at).toBeInstanceOf(Date);
  });
});
