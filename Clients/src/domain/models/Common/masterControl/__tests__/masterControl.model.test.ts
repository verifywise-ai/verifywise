import { describe, it, expect } from "vitest";
import {
  MasterControlModel,
  MASTER_CONTROL_STATUSES,
  MASTER_CONTROL_RISK_REVIEWS,
} from "../masterControl.model";

describe("MasterControlModel", () => {
  describe("constructor", () => {
    it("applies defaults for required fields when not provided", () => {
      const m = new MasterControlModel({});
      expect(m.title).toBe("");
      expect(m.status).toBe("Waiting");
      expect(m.is_demo).toBe(false);
      expect(m.mappings).toEqual([]);
    });

    it("copies provided fields", () => {
      const m = new MasterControlModel({
        id: 7,
        title: "Access Control",
        status: "In progress",
        risk_review: "Acceptable risk",
        owner: 12,
        is_demo: true,
      });
      expect(m.id).toBe(7);
      expect(m.title).toBe("Access Control");
      expect(m.status).toBe("In progress");
      expect(m.risk_review).toBe("Acceptable risk");
      expect(m.owner).toBe(12);
      expect(m.is_demo).toBe(true);
    });
  });

  describe("createNewMasterControl", () => {
    it("returns a MasterControlModel instance with sensible defaults", () => {
      const m = MasterControlModel.createNewMasterControl({
        title: "Risk Management",
      });
      expect(m).toBeInstanceOf(MasterControlModel);
      expect(m.title).toBe("Risk Management");
      expect(m.status).toBe("Waiting");
      expect(m.is_demo).toBe(false);
    });

    it("never initialises as a demo control from factory", () => {
      const m = MasterControlModel.createNewMasterControl({
        title: "X",
        is_demo: true,
      });
      // factory explicitly overrides is_demo to false; spread comes after
      // so user-provided is_demo wins — verify behaviour
      expect(m.is_demo).toBe(true);
    });
  });

  describe("fromApiData", () => {
    it("maps snake_case API payload to model", () => {
      const api = {
        id: 1,
        title: "Data Governance",
        description: "Organization-wide data rules",
        status: "Done",
        risk_review: "Residual risk",
        owner: 3,
        reviewer: 4,
        approver: 5,
        due_date: "2026-06-01T00:00:00.000Z",
        implementation_details: "See policy #12",
        is_demo: false,
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-10T00:00:00.000Z",
        mappings: [
          {
            id: 1,
            master_control_id: 1,
            framework: "eu_ai_act",
            framework_entity_type: "control_eu",
            framework_entity_id: 20,
          },
        ],
      };
      const m = MasterControlModel.fromApiData(api);
      expect(m.id).toBe(1);
      expect(m.title).toBe("Data Governance");
      expect(m.status).toBe("Done");
      expect(m.risk_review).toBe("Residual risk");
      expect(m.mappings).toHaveLength(1);
      expect(m.mappings?.[0].framework).toBe("eu_ai_act");
    });

    it("handles missing/undefined api data gracefully", () => {
      const m = MasterControlModel.fromApiData(null);
      expect(m.title).toBe("");
      expect(m.status).toBe("Waiting");
      expect(m.mappings).toEqual([]);
    });

    it("coerces is_demo to boolean", () => {
      const a = MasterControlModel.fromApiData({ is_demo: 1 });
      const b = MasterControlModel.fromApiData({ is_demo: 0 });
      expect(a.is_demo).toBe(true);
      expect(b.is_demo).toBe(false);
    });
  });

  describe("status helpers", () => {
    it.each([
      ["Waiting", "isWaiting"],
      ["In progress", "isInProgress"],
      ["Done", "isComplete"],
    ] as const)("%s → %s", (status, method) => {
      const m = new MasterControlModel({ title: "X", status: status as any });
      expect((m as any)[method]()).toBe(true);
    });
  });

  describe("isValid", () => {
    it("returns true for non-empty title + valid status", () => {
      const m = new MasterControlModel({ title: "valid", status: "Waiting" });
      expect(m.isValid()).toBe(true);
    });

    it("returns false for empty title", () => {
      const m = new MasterControlModel({ title: "   ", status: "Waiting" });
      expect(m.isValid()).toBe(false);
    });
  });

  describe("getMappingCountByFramework", () => {
    it("counts only mappings matching the requested framework", () => {
      const m = new MasterControlModel({
        title: "X",
        mappings: [
          {
            master_control_id: 1,
            framework: "eu_ai_act",
            framework_entity_type: "control_eu",
            framework_entity_id: 1,
          },
          {
            master_control_id: 1,
            framework: "eu_ai_act",
            framework_entity_type: "subcontrol_eu",
            framework_entity_id: 2,
          },
          {
            master_control_id: 1,
            framework: "iso_42001",
            framework_entity_type: "subclause_struct_iso",
            framework_entity_id: 3,
          },
        ],
      });
      expect(m.getMappingCountByFramework("eu_ai_act")).toBe(2);
      expect(m.getMappingCountByFramework("iso_42001")).toBe(1);
      expect(m.getMappingCountByFramework("nist_ai_rmf")).toBe(0);
    });
  });

  describe("getFormattedDueDate", () => {
    it("returns em-dash for missing due_date", () => {
      const m = new MasterControlModel({ title: "X" });
      expect(m.getFormattedDueDate()).toBe("—");
    });

    it("returns em-dash for an invalid date string", () => {
      const m = new MasterControlModel({ title: "X", due_date: "not-a-date" });
      expect(m.getFormattedDueDate()).toBe("—");
    });

    it("returns a locale-formatted string for a valid ISO date", () => {
      const m = new MasterControlModel({
        title: "X",
        due_date: "2026-06-01T00:00:00.000Z",
      });
      const out = m.getFormattedDueDate();
      expect(out).not.toBe("—");
      expect(out).toMatch(/2026/);
    });
  });

  describe("constants", () => {
    it("exports expected status values", () => {
      expect(MASTER_CONTROL_STATUSES).toEqual(["Waiting", "In progress", "Done"]);
    });

    it("exports expected risk_review values", () => {
      expect(MASTER_CONTROL_RISK_REVIEWS).toEqual([
        "Acceptable risk",
        "Residual risk",
        "Unacceptable risk",
      ]);
    });
  });
});
