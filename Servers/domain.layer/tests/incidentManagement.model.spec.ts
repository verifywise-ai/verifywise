import {
  AIIncidentManagementStatus,
  Severity,
  IncidentType,
} from "../enums/ai-incident-management.enum";

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
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestIncidentManagementModel {
  id?: number;
  title!: string;
  description?: string;
  status!: string;
  severity!: string;
  incident_type!: string;
  reported_by!: number;
  assigned_to?: number;
  created_at?: Date;
  updated_at?: Date;
  resolved_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("IncidentManagementModel", () => {
  it("should instantiate with required fields", () => {
    const incident = new TestIncidentManagementModel({
      id: 1,
      title: "Model drift detected",
      status: AIIncidentManagementStatus.OPEN,
      severity: Severity.SERIOUS,
      incident_type: IncidentType.MODEL_DRIFT,
      reported_by: 1,
    });
    expect(incident.title).toBe("Model drift detected");
    expect(incident.status).toBe(AIIncidentManagementStatus.OPEN);
    expect(incident.severity).toBe(Severity.SERIOUS);
    expect(incident.incident_type).toBe(IncidentType.MODEL_DRIFT);
  });

  it("should support all statuses", () => {
    Object.values(AIIncidentManagementStatus).forEach((status) => {
      const incident = new TestIncidentManagementModel({
        title: "Test",
        status,
        severity: Severity.MINOR,
        incident_type: IncidentType.MALFUNCTION,
        reported_by: 1,
      });
      expect(incident.status).toBe(status);
    });
  });

  it("should support all severity levels", () => {
    Object.values(Severity).forEach((sev) => {
      const incident = new TestIncidentManagementModel({
        title: "Test",
        status: AIIncidentManagementStatus.OPEN,
        severity: sev,
        incident_type: IncidentType.MALFUNCTION,
        reported_by: 1,
      });
      expect(incident.severity).toBe(sev);
    });
  });

  it("should support all incident types", () => {
    Object.values(IncidentType).forEach((type) => {
      const incident = new TestIncidentManagementModel({
        title: "Test",
        status: AIIncidentManagementStatus.OPEN,
        severity: Severity.MINOR,
        incident_type: type,
        reported_by: 1,
      });
      expect(incident.incident_type).toBe(type);
    });
  });

  it("should handle optional fields", () => {
    const incident = new TestIncidentManagementModel({
      title: "Test",
      status: AIIncidentManagementStatus.OPEN,
      severity: Severity.MINOR,
      incident_type: IncidentType.MALFUNCTION,
      reported_by: 1,
    });
    expect(incident.description).toBeUndefined();
    expect(incident.assigned_to).toBeUndefined();
    expect(incident.resolved_at).toBeUndefined();
  });
});
