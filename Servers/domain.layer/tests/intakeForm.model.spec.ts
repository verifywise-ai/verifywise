import { IntakeFormStatus } from "../enums/intake-form-status.enum";

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
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestIntakeFormModel {
  id?: number;
  title!: string;
  description?: string;
  status!: string;
  form_schema!: object;
  organization_id!: number;
  created_by!: number;
  created_at?: Date;
  updated_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("IntakeFormModel", () => {
  it("should instantiate with required fields", () => {
    const f = new TestIntakeFormModel({
      id: 1,
      title: "AI Model Intake",
      status: IntakeFormStatus.ACTIVE,
      form_schema: { fields: [{ name: "model_name", type: "text" }] },
      organization_id: 1,
      created_by: 42,
    });
    expect(f.title).toBe("AI Model Intake");
    expect(f.status).toBe(IntakeFormStatus.ACTIVE);
  });

  it("should support all statuses", () => {
    Object.values(IntakeFormStatus).forEach((status) => {
      const f = new TestIntakeFormModel({
        title: "T",
        status,
        form_schema: {},
        organization_id: 1,
        created_by: 1,
      });
      expect(f.status).toBe(status);
    });
  });
});
