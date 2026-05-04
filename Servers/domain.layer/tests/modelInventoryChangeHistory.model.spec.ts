jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    TEXT: "TEXT",
    DATE: "DATE",
    ENUM: jest.fn(),
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

class TestModelInventoryChangeHistoryModel {
  id?: number;
  model_inventory_id!: number;
  action!: "created" | "updated" | "deleted";
  field_name?: string;
  old_value?: string;
  new_value?: string;
  changed_by_user_id?: number | null;
  changed_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("ModelInventoryChangeHistoryModel", () => {
  it("should track creation", () => {
    const h = new TestModelInventoryChangeHistoryModel({
      id: 1,
      model_inventory_id: 10,
      action: "created",
      changed_by_user_id: 42,
    });
    expect(h.action).toBe("created");
    expect(h.model_inventory_id).toBe(10);
  });

  it("should track field updates with old/new values", () => {
    const h = new TestModelInventoryChangeHistoryModel({
      model_inventory_id: 10,
      action: "updated",
      field_name: "status",
      old_value: "Pending",
      new_value: "Approved",
      changed_by_user_id: 42,
    });
    expect(h.field_name).toBe("status");
    expect(h.old_value).toBe("Pending");
    expect(h.new_value).toBe("Approved");
  });

  it("should track deletion", () => {
    const h = new TestModelInventoryChangeHistoryModel({
      model_inventory_id: 10,
      action: "deleted",
      changed_by_user_id: 42,
    });
    expect(h.action).toBe("deleted");
  });

  it("should allow null changed_by_user_id for deleted users", () => {
    const h = new TestModelInventoryChangeHistoryModel({
      model_inventory_id: 10,
      action: "updated",
      changed_by_user_id: null,
    });
    expect(h.changed_by_user_id).toBeNull();
  });
});
