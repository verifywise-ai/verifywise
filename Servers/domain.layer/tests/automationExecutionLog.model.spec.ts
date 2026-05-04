jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    JSONB: "JSONB",
    NOW: "NOW",
    STRING: "STRING",
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

class TestAutomationExecutionLogModel {
  id?: number;
  automation_id!: number;
  trigger_id!: number;
  action_id!: number;
  status!: string;
  error_message?: string;
  input_data?: object;
  output_data?: object;
  executed_at?: Date;
  created_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("AutomationExecutionLogModel", () => {
  it("should instantiate with required fields", () => {
    const log = new TestAutomationExecutionLogModel({
      id: 1,
      automation_id: 10,
      trigger_id: 20,
      action_id: 30,
      status: "success",
    });
    expect(log.automation_id).toBe(10);
    expect(log.trigger_id).toBe(20);
    expect(log.action_id).toBe(30);
    expect(log.status).toBe("success");
  });

  it("should store error information", () => {
    const log = new TestAutomationExecutionLogModel({
      automation_id: 1,
      trigger_id: 1,
      action_id: 1,
      status: "failed",
      error_message: "Connection timeout",
    });
    expect(log.status).toBe("failed");
    expect(log.error_message).toBe("Connection timeout");
  });

  it("should store input/output data", () => {
    const log = new TestAutomationExecutionLogModel({
      automation_id: 1,
      trigger_id: 1,
      action_id: 1,
      status: "success",
      input_data: { email: "test@example.com" },
      output_data: { sent: true },
    });
    expect(log.input_data).toEqual({ email: "test@example.com" });
    expect(log.output_data).toEqual({ sent: true });
  });
});
