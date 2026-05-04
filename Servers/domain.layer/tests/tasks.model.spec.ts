import { TaskStatus } from "../enums/task-status.enum";
import { TaskPriority } from "../enums/task-priority.enum";

jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    ENUM: jest.fn(),
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

class TestTasksModel {
  id?: number;
  title!: string;
  description?: string;
  status!: string;
  priority!: string;
  due_date?: Date;
  project_id!: number;
  created_by!: number;
  created_at?: Date;
  updated_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("TasksModel", () => {
  it("should instantiate with required fields", () => {
    const t = new TestTasksModel({
      id: 1,
      title: "Review AI model",
      status: TaskStatus.OPEN,
      priority: TaskPriority.HIGH,
      project_id: 10,
      created_by: 42,
    });
    expect(t.title).toBe("Review AI model");
    expect(t.status).toBe(TaskStatus.OPEN);
    expect(t.priority).toBe(TaskPriority.HIGH);
  });

  it("should support all statuses", () => {
    Object.values(TaskStatus).forEach((status) => {
      const t = new TestTasksModel({
        title: "T",
        status,
        priority: "Low",
        project_id: 1,
        created_by: 1,
      });
      expect(t.status).toBe(status);
    });
  });

  it("should support all priorities", () => {
    Object.values(TaskPriority).forEach((priority) => {
      const t = new TestTasksModel({
        title: "T",
        status: "Open",
        priority,
        project_id: 1,
        created_by: 1,
      });
      expect(t.priority).toBe(priority);
    });
  });

  it("should handle due date", () => {
    const dueDate = new Date("2025-12-31");
    const t = new TestTasksModel({
      title: "T",
      status: "Open",
      priority: "Low",
      project_id: 1,
      created_by: 1,
      due_date: dueDate,
    });
    expect(t.due_date).toEqual(dueDate);
  });
});
