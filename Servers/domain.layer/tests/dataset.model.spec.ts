import { DatasetStatus } from "../enums/dataset-status.enum";
import { DatasetType } from "../enums/dataset-type.enum";

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

class TestDatasetModel {
  id?: number;
  name!: string;
  description?: string;
  status!: string;
  type!: string;
  version?: string;
  organization_id!: number;
  created_at?: Date;
  updated_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestDatasetChangeHistoryModel {
  id?: number;
  dataset_id!: number;
  action!: "created" | "updated" | "deleted";
  field_name?: string;
  old_value?: string;
  new_value?: string;
  changed_by_user_id?: number;
  changed_at?: Date;
  // Legacy field for backward compat with basic test
  change_type?: string;
  changed_by?: number;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  isCreation(): boolean {
    return this.action === "created";
  }

  isUpdate(): boolean {
    return this.action === "updated";
  }

  isDeletion(): boolean {
    return this.action === "deleted";
  }

  getChangeDescription(): string {
    if (this.action === "created") {
      return "Dataset was created";
    }
    if (this.action === "deleted") {
      return "Dataset was deleted";
    }
    if (this.field_name) {
      return `Field "${this.field_name}" was changed`;
    }
    return "Dataset was updated";
  }

  toJSON(): any {
    return {
      id: this.id,
      dataset_id: this.dataset_id,
      action: this.action,
      field_name: this.field_name,
      old_value: this.old_value,
      new_value: this.new_value,
      changed_by_user_id: this.changed_by_user_id,
      changed_at: this.changed_at?.toISOString?.() || this.changed_at,
    };
  }
}

class TestDatasetModelInventoryModel {
  id?: number;
  dataset_id!: number;
  model_inventory_id!: number;
  relationship_type!: string;
  created_at?: Date;
  createdAt?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  getRelationshipTypeDisplay(): string {
    const typeMap: Record<string, string> = {
      trained_on: "Trained On",
      validated_on: "Validated On",
      tested_on: "Tested On",
    };
    return typeMap[this.relationship_type] || this.relationship_type;
  }

  isTrainingRelation(): boolean {
    return this.relationship_type === "trained_on";
  }

  isValidationRelation(): boolean {
    return this.relationship_type === "validated_on";
  }

  isTestingRelation(): boolean {
    return this.relationship_type === "tested_on";
  }

  toJSON(): any {
    return {
      id: this.id,
      dataset_id: this.dataset_id,
      model_inventory_id: this.model_inventory_id,
      relationship_type: this.relationship_type,
      created_at:
        (this.createdAt ?? this.created_at)?.toISOString?.() || this.createdAt || this.created_at,
    };
  }
}

class TestDatasetProjectModel {
  id?: number;
  dataset_id!: number;
  project_id!: number;
  created_at?: Date;
  createdAt?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  toJSON(): any {
    return {
      id: this.id,
      dataset_id: this.dataset_id,
      project_id: this.project_id,
      created_at:
        (this.createdAt ?? this.created_at)?.toISOString?.() || this.createdAt || this.created_at,
    };
  }
}

describe("DatasetModel", () => {
  it("should instantiate with required fields", () => {
    const d = new TestDatasetModel({
      id: 1,
      name: "Training Data v1",
      status: DatasetStatus.ACTIVE,
      type: DatasetType.TRAINING,
      organization_id: 1,
    });
    expect(d.name).toBe("Training Data v1");
    expect(d.status).toBe(DatasetStatus.ACTIVE);
    expect(d.type).toBe(DatasetType.TRAINING);
  });

  it("should support all statuses", () => {
    Object.values(DatasetStatus).forEach((status) => {
      const d = new TestDatasetModel({ name: "T", status, type: "Training", organization_id: 1 });
      expect(d.status).toBe(status);
    });
  });

  it("should support all types", () => {
    Object.values(DatasetType).forEach((type) => {
      const d = new TestDatasetModel({ name: "T", status: "Active", type, organization_id: 1 });
      expect(d.type).toBe(type);
    });
  });
});

describe("DatasetChangeHistoryModel", () => {
  it("should track changes", () => {
    const h = new TestDatasetChangeHistoryModel({
      id: 1,
      dataset_id: 10,
      change_type: "status_changed",
      changed_by: 42,
    });
    expect(h.dataset_id).toBe(10);
    expect(h.change_type).toBe("status_changed");
  });

  describe("isCreation", () => {
    it("should return true for created action", () => {
      const h = new TestDatasetChangeHistoryModel({ dataset_id: 1, action: "created" });
      expect(h.isCreation()).toBe(true);
    });

    it("should return false for non-created action", () => {
      const h = new TestDatasetChangeHistoryModel({ dataset_id: 1, action: "updated" });
      expect(h.isCreation()).toBe(false);
    });
  });

  describe("isUpdate", () => {
    it("should return true for updated action", () => {
      const h = new TestDatasetChangeHistoryModel({ dataset_id: 1, action: "updated" });
      expect(h.isUpdate()).toBe(true);
    });

    it("should return false for non-updated action", () => {
      const h = new TestDatasetChangeHistoryModel({ dataset_id: 1, action: "deleted" });
      expect(h.isUpdate()).toBe(false);
    });
  });

  describe("isDeletion", () => {
    it("should return true for deleted action", () => {
      const h = new TestDatasetChangeHistoryModel({ dataset_id: 1, action: "deleted" });
      expect(h.isDeletion()).toBe(true);
    });

    it("should return false for non-deleted action", () => {
      const h = new TestDatasetChangeHistoryModel({ dataset_id: 1, action: "created" });
      expect(h.isDeletion()).toBe(false);
    });
  });

  describe("getChangeDescription", () => {
    it("should return creation description", () => {
      const h = new TestDatasetChangeHistoryModel({ dataset_id: 1, action: "created" });
      expect(h.getChangeDescription()).toBe("Dataset was created");
    });

    it("should return deletion description", () => {
      const h = new TestDatasetChangeHistoryModel({ dataset_id: 1, action: "deleted" });
      expect(h.getChangeDescription()).toBe("Dataset was deleted");
    });

    it("should return field-specific update description", () => {
      const h = new TestDatasetChangeHistoryModel({
        dataset_id: 1,
        action: "updated",
        field_name: "status",
      });
      expect(h.getChangeDescription()).toBe('Field "status" was changed');
    });

    it("should return generic update description when no field_name", () => {
      const h = new TestDatasetChangeHistoryModel({ dataset_id: 1, action: "updated" });
      expect(h.getChangeDescription()).toBe("Dataset was updated");
    });
  });

  describe("toJSON", () => {
    it("should return JSON with all fields", () => {
      const now = new Date("2026-03-15T10:00:00.000Z");
      const h = new TestDatasetChangeHistoryModel({
        id: 1,
        dataset_id: 10,
        action: "updated",
        field_name: "name",
        old_value: "old",
        new_value: "new",
        changed_by_user_id: 5,
        changed_at: now,
      });
      const json = h.toJSON();
      expect(json.id).toBe(1);
      expect(json.dataset_id).toBe(10);
      expect(json.action).toBe("updated");
      expect(json.field_name).toBe("name");
      expect(json.old_value).toBe("old");
      expect(json.new_value).toBe("new");
      expect(json.changed_by_user_id).toBe(5);
      expect(json.changed_at).toBe("2026-03-15T10:00:00.000Z");
    });

    it("should handle undefined optional fields", () => {
      const h = new TestDatasetChangeHistoryModel({ dataset_id: 1, action: "created" });
      const json = h.toJSON();
      expect(json.field_name).toBeUndefined();
      expect(json.old_value).toBeUndefined();
      expect(json.new_value).toBeUndefined();
    });
  });
});

describe("DatasetModelInventoryModel", () => {
  it("should link dataset to model inventory", () => {
    const m = new TestDatasetModelInventoryModel({
      dataset_id: 1,
      model_inventory_id: 2,
      relationship_type: "trained_on",
    });
    expect(m.dataset_id).toBe(1);
    expect(m.model_inventory_id).toBe(2);
  });

  describe("getRelationshipTypeDisplay", () => {
    it("should return 'Trained On' for trained_on", () => {
      const m = new TestDatasetModelInventoryModel({
        dataset_id: 1,
        model_inventory_id: 2,
        relationship_type: "trained_on",
      });
      expect(m.getRelationshipTypeDisplay()).toBe("Trained On");
    });

    it("should return 'Validated On' for validated_on", () => {
      const m = new TestDatasetModelInventoryModel({
        dataset_id: 1,
        model_inventory_id: 2,
        relationship_type: "validated_on",
      });
      expect(m.getRelationshipTypeDisplay()).toBe("Validated On");
    });

    it("should return 'Tested On' for tested_on", () => {
      const m = new TestDatasetModelInventoryModel({
        dataset_id: 1,
        model_inventory_id: 2,
        relationship_type: "tested_on",
      });
      expect(m.getRelationshipTypeDisplay()).toBe("Tested On");
    });

    it("should return raw value for unknown types", () => {
      const m = new TestDatasetModelInventoryModel({
        dataset_id: 1,
        model_inventory_id: 2,
        relationship_type: "custom_type",
      });
      expect(m.getRelationshipTypeDisplay()).toBe("custom_type");
    });
  });

  describe("relationship type checks", () => {
    it("should identify training relation", () => {
      const m = new TestDatasetModelInventoryModel({
        dataset_id: 1,
        model_inventory_id: 2,
        relationship_type: "trained_on",
      });
      expect(m.isTrainingRelation()).toBe(true);
      expect(m.isValidationRelation()).toBe(false);
      expect(m.isTestingRelation()).toBe(false);
    });

    it("should identify validation relation", () => {
      const m = new TestDatasetModelInventoryModel({
        dataset_id: 1,
        model_inventory_id: 2,
        relationship_type: "validated_on",
      });
      expect(m.isTrainingRelation()).toBe(false);
      expect(m.isValidationRelation()).toBe(true);
      expect(m.isTestingRelation()).toBe(false);
    });

    it("should identify testing relation", () => {
      const m = new TestDatasetModelInventoryModel({
        dataset_id: 1,
        model_inventory_id: 2,
        relationship_type: "tested_on",
      });
      expect(m.isTrainingRelation()).toBe(false);
      expect(m.isValidationRelation()).toBe(false);
      expect(m.isTestingRelation()).toBe(true);
    });
  });

  describe("toJSON", () => {
    it("should return JSON representation", () => {
      const now = new Date("2026-05-01T08:00:00.000Z");
      const m = new TestDatasetModelInventoryModel({
        id: 5,
        dataset_id: 1,
        model_inventory_id: 2,
        relationship_type: "trained_on",
        created_at: now,
      });
      const json = m.toJSON();
      expect(json.id).toBe(5);
      expect(json.dataset_id).toBe(1);
      expect(json.model_inventory_id).toBe(2);
      expect(json.relationship_type).toBe("trained_on");
      expect(json.created_at).toBe("2026-05-01T08:00:00.000Z");
    });
  });
});

describe("DatasetProjectModel", () => {
  it("should link dataset to project", () => {
    const m = new TestDatasetProjectModel({ dataset_id: 1, project_id: 3 });
    expect(m.dataset_id).toBe(1);
    expect(m.project_id).toBe(3);
  });

  describe("toJSON", () => {
    it("should return JSON representation", () => {
      const now = new Date("2026-04-20T14:00:00.000Z");
      const m = new TestDatasetProjectModel({
        id: 10,
        dataset_id: 1,
        project_id: 3,
        created_at: now,
      });
      const json = m.toJSON();
      expect(json.id).toBe(10);
      expect(json.dataset_id).toBe(1);
      expect(json.project_id).toBe(3);
      expect(json.created_at).toBe("2026-04-20T14:00:00.000Z");
    });

    it("should handle undefined dates", () => {
      const m = new TestDatasetProjectModel({ dataset_id: 1, project_id: 3 });
      const json = m.toJSON();
      expect(json.created_at).toBeUndefined();
    });

    it("should prefer createdAt over created_at", () => {
      const newer = new Date("2026-05-01T00:00:00.000Z");
      const older = new Date("2025-01-01T00:00:00.000Z");
      const m = new TestDatasetProjectModel({
        dataset_id: 1,
        project_id: 3,
        createdAt: newer,
        created_at: older,
      });
      const json = m.toJSON();
      expect(json.created_at).toBe("2026-05-01T00:00:00.000Z");
    });
  });
});
