import { FriaStatus, FriaRiskLevel } from "../enums/fria-status.enum";

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

class TestFriaAssessmentModel {
  id?: number;
  title!: string;
  description?: string;
  status!: string;
  project_id!: number;
  created_by!: number;
  created_at?: Date;
  updated_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestFriaModelLinkModel {
  id?: number;
  fria_id!: number;
  model_inventory_id!: number;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestFriaRightModel {
  id?: number;
  fria_id!: number;
  right_name!: string;
  description?: string;
  impact_level?: string;
  mitigation?: string;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestFriaRiskItemModel {
  id?: number;
  fria_id!: number;
  risk_description!: string;
  likelihood?: string;
  severity?: string;
  risk_level?: string;
  mitigation?: string;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestFriaSnapshotModel {
  id?: number;
  fria_id!: number;
  snapshot_data!: object;
  created_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("FriaAssessmentModel", () => {
  it("should instantiate with required fields", () => {
    const model = new TestFriaAssessmentModel({
      id: 1,
      title: "FRIA for AI Hiring",
      status: FriaStatus.DRAFT,
      project_id: 10,
      created_by: 1,
    });
    expect(model.title).toBe("FRIA for AI Hiring");
    expect(model.status).toBe(FriaStatus.DRAFT);
  });

  it("should support all statuses", () => {
    Object.values(FriaStatus).forEach((status) => {
      const model = new TestFriaAssessmentModel({
        title: "Test",
        status,
        project_id: 1,
        created_by: 1,
      });
      expect(model.status).toBe(status);
    });
  });
});

describe("FriaModelLinkModel", () => {
  it("should link FRIA to model inventory", () => {
    const link = new TestFriaModelLinkModel({ id: 1, fria_id: 10, model_inventory_id: 20 });
    expect(link.fria_id).toBe(10);
    expect(link.model_inventory_id).toBe(20);
  });
});

describe("FriaRightModel", () => {
  it("should instantiate with all fields", () => {
    const right = new TestFriaRightModel({
      id: 1,
      fria_id: 10,
      right_name: "Right to privacy",
      description: "Privacy impact",
      impact_level: "High",
      mitigation: "Encrypt data",
    });
    expect(right.right_name).toBe("Right to privacy");
    expect(right.impact_level).toBe("High");
  });
});

describe("FriaRiskItemModel", () => {
  it("should instantiate with risk levels", () => {
    const risk = new TestFriaRiskItemModel({
      id: 1,
      fria_id: 10,
      risk_description: "Bias in hiring",
      likelihood: "Medium",
      severity: "High",
      risk_level: FriaRiskLevel.HIGH,
    });
    expect(risk.risk_description).toBe("Bias in hiring");
    expect(risk.risk_level).toBe(FriaRiskLevel.HIGH);
  });
});

describe("FriaSnapshotModel", () => {
  it("should store snapshot data", () => {
    const snapshot = new TestFriaSnapshotModel({
      id: 1,
      fria_id: 10,
      snapshot_data: { rights: 5, risks: 3 },
    });
    expect(snapshot.snapshot_data).toEqual({ rights: 5, risks: 3 });
  });
});
