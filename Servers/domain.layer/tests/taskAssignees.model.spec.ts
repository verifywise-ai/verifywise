jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: { INTEGER: "INTEGER", DATE: "DATE", NOW: "NOW" },
  ForeignKey: jest.fn(),
  BelongsTo: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestTaskAssigneesModel {
  id?: number;
  task_id!: number;
  user_id!: number;
  assigned_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("TaskAssigneesModel", () => {
  it("should create assignment", () => {
    const a = new TestTaskAssigneesModel({ id: 1, task_id: 10, user_id: 42 });
    expect(a.task_id).toBe(10);
    expect(a.user_id).toBe(42);
  });

  it("should handle assigned_at", () => {
    const now = new Date();
    const a = new TestTaskAssigneesModel({ task_id: 1, user_id: 1, assigned_at: now });
    expect(a.assigned_at).toEqual(now);
  });
});
