import {
  ValidationException,
  BusinessLogicException,
} from "../exceptions/custom.exception";

// Mock sequelize-typescript decorators so the class can be instantiated in
// isolation without attaching to a real Sequelize instance.
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn((..._args: unknown[]) => "STRING"),
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    TEXT: "TEXT",
    ENUM: jest.fn(),
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

jest.mock("../models/user/user.model", () => ({
  UserModel: class MockUserModel {},
}));

import {
  MasterControlModel,
  MASTER_CONTROL_STATUSES,
  MASTER_CONTROL_RISK_REVIEWS,
} from "../models/masterControl/masterControl.model";
import {
  MasterControlFrameworkMappingModel,
  FRAMEWORKS,
} from "../models/masterControl/masterControlMapping.model";

describe("MasterControlModel", () => {
  describe("createNewMasterControl", () => {
    it("creates a valid master control with defaults", async () => {
      const mc = await MasterControlModel.createNewMasterControl(
        "Risk Management Framework"
      );

      expect(mc).toBeInstanceOf(MasterControlModel);
      expect(mc.title).toBe("Risk Management Framework");
      expect(mc.status).toBe("Waiting");
      expect(mc.is_demo).toBe(false);
      expect(mc.description).toBeNull();
      expect(mc.owner).toBeNull();
      expect(mc.created_at).toBeInstanceOf(Date);
    });

    it("trims whitespace from title, description, implementation_details", async () => {
      const mc = await MasterControlModel.createNewMasterControl(
        "   Access Control   ",
        "   Limit access to authorised personnel.   ",
        "In progress",
        "Acceptable risk",
        1,
        2,
        3,
        null,
        "   Controls enforced via IAM.   "
      );

      expect(mc.title).toBe("Access Control");
      expect(mc.description).toBe("Limit access to authorised personnel.");
      expect(mc.implementation_details).toBe("Controls enforced via IAM.");
    });

    it("rejects empty / whitespace-only title", async () => {
      await expect(
        MasterControlModel.createNewMasterControl("")
      ).rejects.toThrow(ValidationException);
      await expect(
        MasterControlModel.createNewMasterControl("    ")
      ).rejects.toThrow(ValidationException);
    });

    it("rejects title longer than 255 chars", async () => {
      await expect(
        MasterControlModel.createNewMasterControl("x".repeat(256))
      ).rejects.toThrow(/255/);
    });

    it("rejects invalid status values", async () => {
      await expect(
        MasterControlModel.createNewMasterControl(
          "Test",
          undefined,
          "Unknown Status" as any
        )
      ).rejects.toThrow(ValidationException);
    });

    it("accepts every valid status value", async () => {
      for (const status of MASTER_CONTROL_STATUSES) {
        const mc = await MasterControlModel.createNewMasterControl(
          "Test",
          undefined,
          status
        );
        expect(mc.status).toBe(status);
      }
    });

    it("accepts every valid risk_review value", async () => {
      for (const rr of MASTER_CONTROL_RISK_REVIEWS) {
        const mc = await MasterControlModel.createNewMasterControl(
          "Test",
          undefined,
          "Waiting",
          rr
        );
        expect(mc.risk_review).toBe(rr);
      }
    });

    it("rejects invalid risk_review value", async () => {
      await expect(
        MasterControlModel.createNewMasterControl(
          "Test",
          undefined,
          "Waiting",
          "Invalid Risk" as any
        )
      ).rejects.toThrow(ValidationException);
    });

    it("rejects non-positive user reference IDs", async () => {
      await expect(
        MasterControlModel.createNewMasterControl(
          "Test",
          undefined,
          "Waiting",
          undefined,
          0
        )
      ).rejects.toThrow(/owner/i);
      await expect(
        MasterControlModel.createNewMasterControl(
          "Test",
          undefined,
          "Waiting",
          undefined,
          1,
          -5
        )
      ).rejects.toThrow(/reviewer/i);
    });

    it("allows null user references", async () => {
      const mc = await MasterControlModel.createNewMasterControl(
        "Test",
        null,
        "Waiting",
        null,
        null,
        null,
        null
      );
      expect(mc.owner).toBeNull();
      expect(mc.reviewer).toBeNull();
      expect(mc.approver).toBeNull();
    });
  });

  describe("updateMasterControl", () => {
    it("applies partial updates in place", async () => {
      const mc = await MasterControlModel.createNewMasterControl("Original");
      await mc.updateMasterControl({
        title: "Updated Title",
        status: "In progress",
        owner: 42,
      });
      expect(mc.title).toBe("Updated Title");
      expect(mc.status).toBe("In progress");
      expect(mc.owner).toBe(42);
    });

    it("rejects invalid title update", async () => {
      const mc = await MasterControlModel.createNewMasterControl("Original");
      await expect(mc.updateMasterControl({ title: "" })).rejects.toThrow(
        ValidationException
      );
    });

    it("rejects invalid status update", async () => {
      const mc = await MasterControlModel.createNewMasterControl("Original");
      await expect(
        mc.updateMasterControl({ status: "Bogus" as any })
      ).rejects.toThrow(ValidationException);
    });

    it("allows clearing description via empty string", async () => {
      const mc = await MasterControlModel.createNewMasterControl(
        "Original",
        "Has description"
      );
      await mc.updateMasterControl({ description: "" });
      expect(mc.description).toBeNull();
    });

    it("allows clearing risk_review via null", async () => {
      const mc = await MasterControlModel.createNewMasterControl(
        "Original",
        null,
        "Waiting",
        "Acceptable risk"
      );
      await mc.updateMasterControl({ risk_review: null });
      expect(mc.risk_review).toBeNull();
    });
  });

  describe("validateMasterControlData", () => {
    it("passes for a valid instance", async () => {
      const mc = await MasterControlModel.createNewMasterControl("Valid");
      await expect(mc.validateMasterControlData()).resolves.toBeUndefined();
    });

    it("fails when title is missing", async () => {
      const mc = await MasterControlModel.createNewMasterControl("Valid");
      (mc as any).title = "";
      await expect(mc.validateMasterControlData()).rejects.toThrow(
        ValidationException
      );
    });
  });

  describe("demo restriction", () => {
    it("canBeModified throws BusinessLogicException for demo rows", async () => {
      const mc = await MasterControlModel.createNewMasterControl(
        "Demo Ctl",
        undefined,
        "Waiting",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true
      );
      expect(() => mc.canBeModified()).toThrow(BusinessLogicException);
    });

    it("canBeModified returns true for non-demo rows", async () => {
      const mc = await MasterControlModel.createNewMasterControl("Real Ctl");
      expect(mc.canBeModified()).toBe(true);
    });
  });

  describe("status helpers", () => {
    it("isComplete returns true only for Done", async () => {
      const waiting = await MasterControlModel.createNewMasterControl("W");
      const inProg = await MasterControlModel.createNewMasterControl(
        "I",
        undefined,
        "In progress"
      );
      const done = await MasterControlModel.createNewMasterControl(
        "D",
        undefined,
        "Done"
      );
      expect(waiting.isComplete()).toBe(false);
      expect(inProg.isComplete()).toBe(false);
      expect(done.isComplete()).toBe(true);

      expect(waiting.isWaiting()).toBe(true);
      expect(inProg.isInProgress()).toBe(true);
    });
  });

  describe("toJSON", () => {
    it("serializes all expected fields", async () => {
      const mc = await MasterControlModel.createNewMasterControl(
        "Serialize",
        "desc",
        "Done",
        "Residual risk",
        1,
        2,
        3
      );
      const json = mc.toJSON();
      expect(json.title).toBe("Serialize");
      expect(json.status).toBe("Done");
      expect(json.risk_review).toBe("Residual risk");
      expect(json.owner).toBe(1);
      expect(json.reviewer).toBe(2);
      expect(json.approver).toBe(3);
      expect(json.is_demo).toBe(false);
    });
  });
});

describe("MasterControlFrameworkMappingModel", () => {
  describe("createNewMapping", () => {
    it("creates a valid EU AI Act control mapping", async () => {
      const m = await MasterControlFrameworkMappingModel.createNewMapping(
        1,
        "eu_ai_act",
        "control_eu",
        10
      );
      expect(m.master_control_id).toBe(1);
      expect(m.framework).toBe("eu_ai_act");
      expect(m.framework_entity_type).toBe("control_eu");
      expect(m.framework_entity_id).toBe(10);
      expect(m.created_at).toBeInstanceOf(Date);
    });

    it("creates a valid ISO 42001 subclause mapping", async () => {
      const m = await MasterControlFrameworkMappingModel.createNewMapping(
        1,
        "iso_42001",
        "subclause_struct_iso",
        5
      );
      expect(m.framework).toBe("iso_42001");
    });

    it("creates a valid NIST AI RMF mapping", async () => {
      const m = await MasterControlFrameworkMappingModel.createNewMapping(
        1,
        "nist_ai_rmf",
        "subcategory_nist",
        7
      );
      expect(m.framework).toBe("nist_ai_rmf");
    });

    it("rejects invalid framework slug", async () => {
      await expect(
        MasterControlFrameworkMappingModel.createNewMapping(
          1,
          "not_a_framework" as any,
          "control_eu",
          1
        )
      ).rejects.toThrow(ValidationException);
    });

    it("rejects entity_type that does not belong to framework", async () => {
      await expect(
        MasterControlFrameworkMappingModel.createNewMapping(
          1,
          "eu_ai_act",
          "subcategory_nist" as any,
          1
        )
      ).rejects.toThrow(/not valid for framework/);
    });

    it("rejects non-positive master_control_id", async () => {
      await expect(
        MasterControlFrameworkMappingModel.createNewMapping(
          0,
          "eu_ai_act",
          "control_eu",
          1
        )
      ).rejects.toThrow(/master_control_id/);
    });

    it("rejects non-positive framework_entity_id", async () => {
      await expect(
        MasterControlFrameworkMappingModel.createNewMapping(
          1,
          "eu_ai_act",
          "control_eu",
          0
        )
      ).rejects.toThrow(/framework_entity_id/);
    });

    it("exports all supported frameworks", () => {
      expect(FRAMEWORKS).toEqual(
        expect.arrayContaining([
          "eu_ai_act",
          "iso_42001",
          "iso_27001",
          "nist_ai_rmf",
        ])
      );
    });
  });

  describe("toKey", () => {
    it("produces a stable identity string", async () => {
      const m = await MasterControlFrameworkMappingModel.createNewMapping(
        1,
        "iso_27001",
        "iso27001_subclause",
        42
      );
      expect(m.toKey()).toBe("iso_27001:iso27001_subclause:42");
    });
  });
});
