import {
  AIIncidentManagementApprovalStatus,
  AIIncidentManagementStatus,
  IncidentType,
  Severity,
} from "../enums/ai-incident-management.enum";
import { AIIncidentManagementModel } from "../models/incidentManagement/incidemtManagement.model";

jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    ENUM: jest.fn(),
    ARRAY: jest.fn(),
    NOW: "NOW",
  },
  Table: jest.fn(),
  Model: class MockModel {
    dataValues: Record<string, unknown>;
    constructor(data?: any) {
      this.dataValues = { ...(data || {}) };
      if (data) Object.assign(this, data);
    }
    getDataValue(key: string) {
      return this.dataValues[key];
    }
  },
}));

const baseData = {
  ai_project: "Fraud Detection System",
  type: IncidentType.MODEL_DRIFT,
  severity: Severity.SERIOUS,
  status: AIIncidentManagementStatus.OPEN,
  occurred_date: new Date("2025-01-10"),
  date_detected: new Date("2025-01-12"),
  reporter: "Ada Lovelace",
  categories_of_harm: ["Financial Impact"],
  description: "Drift detected",
  relationship_causality: "Retraining cycle",
  approval_status: AIIncidentManagementApprovalStatus.PENDING,
};

describe("AIIncidentManagementModel — issue #4583 FK linkage", () => {
  describe("createNewIncident", () => {
    it("carries the optional FK fields when provided", () => {
      const incident = AIIncidentManagementModel.createNewIncident({
        ...baseData,
        model_inventory_id: 7,
        project_id: 3,
        assignee_id: 11,
      });
      expect(incident.model_inventory_id).toBe(7);
      expect(incident.project_id).toBe(3);
      expect(incident.assignee_id).toBe(11);
    });

    it("defaults the FK fields to null when not provided (no forced backfill)", () => {
      const incident = AIIncidentManagementModel.createNewIncident(baseData);
      expect(incident.model_inventory_id).toBeNull();
      expect(incident.project_id).toBeNull();
      expect(incident.assignee_id).toBeNull();
    });
  });

  describe("updateIncident", () => {
    it("updates the FK fields", () => {
      const existing = AIIncidentManagementModel.createNewIncident(baseData);
      const updated = AIIncidentManagementModel.updateIncident(existing, {
        model_inventory_id: 9,
        assignee_id: 4,
      });
      expect(updated.model_inventory_id).toBe(9);
      expect(updated.assignee_id).toBe(4);
      expect(updated.project_id).toBeNull();
    });
  });

  describe("serializers", () => {
    it("toSafeJSON exposes FK ids and joined display names", () => {
      const incident = AIIncidentManagementModel.createNewIncident({
        ...baseData,
        model_inventory_id: 7,
        assignee_id: 11,
      });
      incident.dataValues["model_inventory_name"] = "OpenAI GPT-4";
      incident.dataValues["project_title"] = "Fraud Detection System";
      incident.dataValues["assignee_name"] = "Ada Lovelace";

      const json = incident.toSafeJSON();
      expect(json.model_inventory_id).toBe(7);
      expect(json.project_id).toBeNull();
      expect(json.assignee_id).toBe(11);
      expect(json.model_inventory_name).toBe("OpenAI GPT-4");
      expect(json.project_title).toBe("Fraud Detection System");
      expect(json.assignee_name).toBe("Ada Lovelace");
    });

    it("serializes nulls for unlinked incidents (backward compatibility)", () => {
      const incident = AIIncidentManagementModel.createNewIncident(baseData);
      const json = incident.toJSON();
      expect(json.model_inventory_id).toBeNull();
      expect(json.project_id).toBeNull();
      expect(json.assignee_id).toBeNull();
      expect(json.model_inventory_name).toBeNull();
      expect(json.assignee_name).toBeNull();
    });
  });
});
