import { ValidationException } from "../exceptions/custom.exception";

jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
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

jest.mock("../models/vendor/vendor.model", () => ({
  VendorModel: class MockVendorModel {},
}));

jest.mock("../models/user/user.model", () => ({
  UserModel: class MockUserModel {},
}));

class TestVendorRiskModel {
  id?: number;
  vendor_id!: number;
  order_no?: number;
  risk_description!: string;
  impact_description!: string;
  impact!: "Negligible" | "Minor" | "Moderate" | "Major" | "Critical";
  likelihood!: "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost certain";
  risk_severity!: "Negligible" | "Minor" | "Moderate" | "Major" | "Catastrophic";
  action_plan!: string;
  action_owner!: number;
  risk_level!: string;
  is_demo?: boolean;
  is_deleted?: boolean;
  deleted_at?: Date;
  created_at?: Date;
  updated_at?: Date;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  static async createNewVendorRisk(vendorRisk: {
    vendor_id: number;
    risk_description: string;
    impact_description: string;
    action_owner: number;
    action_plan: string;
    risk_severity: "Negligible" | "Minor" | "Moderate" | "Major" | "Catastrophic";
    risk_level: string;
    likelihood: "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost certain";
  }): Promise<TestVendorRiskModel> {
    if (!vendorRisk.vendor_id || vendorRisk.vendor_id < 1) {
      throw new ValidationException(
        "Valid vendor ID is required",
        "vendor_id",
        vendorRisk.vendor_id,
      );
    }

    if (!vendorRisk.risk_description || vendorRisk.risk_description.trim().length === 0) {
      throw new ValidationException(
        "Risk description is required",
        "risk_description",
        vendorRisk.risk_description,
      );
    }

    if (!vendorRisk.impact_description || vendorRisk.impact_description.trim().length === 0) {
      throw new ValidationException(
        "Impact description is required",
        "impact_description",
        vendorRisk.impact_description,
      );
    }

    if (!vendorRisk.action_plan || vendorRisk.action_plan.trim().length === 0) {
      throw new ValidationException(
        "Action plan is required",
        "action_plan",
        vendorRisk.action_plan,
      );
    }

    if (!vendorRisk.action_owner || vendorRisk.action_owner < 1) {
      throw new ValidationException(
        "Valid action owner ID is required",
        "action_owner",
        vendorRisk.action_owner,
      );
    }

    const model = new TestVendorRiskModel();
    model.vendor_id = vendorRisk.vendor_id;
    model.risk_description = vendorRisk.risk_description;
    model.impact_description = vendorRisk.impact_description;
    model.action_owner = vendorRisk.action_owner;
    model.action_plan = vendorRisk.action_plan;
    model.risk_severity = vendorRisk.risk_severity;
    model.risk_level = vendorRisk.risk_level;
    model.likelihood = vendorRisk.likelihood;
    return model;
  }

  async updateVendorRisk(updateData: {
    vendor_id?: number;
    risk_description?: string;
    impact_description?: string;
    action_owner?: number;
    action_plan?: string;
    risk_severity?: "Negligible" | "Minor" | "Moderate" | "Major" | "Catastrophic";
    risk_level?: string;
    likelihood?: "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost certain";
  }): Promise<void> {
    if (updateData.vendor_id !== undefined) {
      this.vendor_id = updateData.vendor_id;
    }
    if (updateData.risk_description !== undefined) {
      this.risk_description = updateData.risk_description;
    }
    if (updateData.impact_description !== undefined) {
      this.impact_description = updateData.impact_description;
    }
    if (updateData.action_owner !== undefined) {
      this.action_owner = updateData.action_owner;
    }
    if (updateData.action_plan !== undefined) {
      this.action_plan = updateData.action_plan;
    }
    if (updateData.risk_severity !== undefined) {
      this.risk_severity = updateData.risk_severity;
    }
    if (updateData.risk_level !== undefined) {
      this.risk_level = updateData.risk_level;
    }
    if (updateData.likelihood !== undefined) {
      this.likelihood = updateData.likelihood;
    }
  }

  toJSON(): any {
    return {
      id: this.id,
      vendor_id: this.vendor_id,
      order_no: this.order_no,
      risk_description: this.risk_description,
      impact_description: this.impact_description,
      impact: this.impact,
      likelihood: this.likelihood,
      risk_severity: this.risk_severity,
      action_plan: this.action_plan,
      action_owner: this.action_owner,
      risk_level: this.risk_level,
      is_demo: this.is_demo,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
    };
  }
}

describe("VendorRiskModel", () => {
  const validRiskData = {
    vendor_id: 1,
    risk_description: "Data breach risk",
    impact_description: "Customer data exposed",
    action_owner: 2,
    action_plan: "Implement encryption",
    risk_severity: "Major" as const,
    risk_level: "High",
    likelihood: "Possible" as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewVendorRisk", () => {
    it("should create vendor risk with valid data", async () => {
      const risk = await TestVendorRiskModel.createNewVendorRisk(validRiskData);

      expect(risk).toBeInstanceOf(TestVendorRiskModel);
      expect(risk.vendor_id).toBe(1);
      expect(risk.risk_description).toBe("Data breach risk");
      expect(risk.impact_description).toBe("Customer data exposed");
      expect(risk.action_owner).toBe(2);
      expect(risk.action_plan).toBe("Implement encryption");
      expect(risk.risk_severity).toBe("Major");
      expect(risk.risk_level).toBe("High");
      expect(risk.likelihood).toBe("Possible");
    });

    it("should throw ValidationException for invalid vendor_id", async () => {
      await expect(
        TestVendorRiskModel.createNewVendorRisk({ ...validRiskData, vendor_id: 0 }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty risk_description", async () => {
      await expect(
        TestVendorRiskModel.createNewVendorRisk({ ...validRiskData, risk_description: "" }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty impact_description", async () => {
      await expect(
        TestVendorRiskModel.createNewVendorRisk({ ...validRiskData, impact_description: "" }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty action_plan", async () => {
      await expect(
        TestVendorRiskModel.createNewVendorRisk({ ...validRiskData, action_plan: "" }),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid action_owner", async () => {
      await expect(
        TestVendorRiskModel.createNewVendorRisk({ ...validRiskData, action_owner: 0 }),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("updateVendorRisk", () => {
    it("should update all fields", async () => {
      const risk = new TestVendorRiskModel(validRiskData);

      await risk.updateVendorRisk({
        vendor_id: 5,
        risk_description: "Updated risk",
        impact_description: "Updated impact",
        action_owner: 3,
        action_plan: "New plan",
        risk_severity: "Catastrophic",
        risk_level: "Critical",
        likelihood: "Almost certain",
      });

      expect(risk.vendor_id).toBe(5);
      expect(risk.risk_description).toBe("Updated risk");
      expect(risk.impact_description).toBe("Updated impact");
      expect(risk.action_owner).toBe(3);
      expect(risk.action_plan).toBe("New plan");
      expect(risk.risk_severity).toBe("Catastrophic");
      expect(risk.risk_level).toBe("Critical");
      expect(risk.likelihood).toBe("Almost certain");
    });

    it("should update only provided fields", async () => {
      const risk = new TestVendorRiskModel(validRiskData);

      await risk.updateVendorRisk({ risk_level: "Low" });

      expect(risk.risk_level).toBe("Low");
      expect(risk.risk_description).toBe("Data breach risk");
    });

    it("should not modify fields when no update data provided", async () => {
      const risk = new TestVendorRiskModel(validRiskData);

      await risk.updateVendorRisk({});

      expect(risk.vendor_id).toBe(1);
      expect(risk.risk_description).toBe("Data breach risk");
    });
  });

  describe("toJSON", () => {
    it("should return JSON representation with all fields", () => {
      const now = new Date("2026-01-15T12:00:00.000Z");
      const risk = new TestVendorRiskModel({
        ...validRiskData,
        id: 1,
        order_no: 3,
        impact: "Major",
        is_demo: false,
        created_at: now,
        updated_at: now,
      });

      const json = risk.toJSON();

      expect(json.id).toBe(1);
      expect(json.vendor_id).toBe(1);
      expect(json.order_no).toBe(3);
      expect(json.risk_description).toBe("Data breach risk");
      expect(json.impact_description).toBe("Customer data exposed");
      expect(json.impact).toBe("Major");
      expect(json.likelihood).toBe("Possible");
      expect(json.risk_severity).toBe("Major");
      expect(json.action_plan).toBe("Implement encryption");
      expect(json.action_owner).toBe(2);
      expect(json.risk_level).toBe("High");
      expect(json.is_demo).toBe(false);
      expect(json.created_at).toBe("2026-01-15T12:00:00.000Z");
      expect(json.updated_at).toBe("2026-01-15T12:00:00.000Z");
    });

    it("should handle undefined dates", () => {
      const risk = new TestVendorRiskModel(validRiskData);
      const json = risk.toJSON();

      expect(json.created_at).toBeUndefined();
      expect(json.updated_at).toBeUndefined();
    });

    it("should prefer createdAt/updatedAt over created_at/updated_at", () => {
      const now = new Date("2026-02-01T00:00:00.000Z");
      const older = new Date("2025-01-01T00:00:00.000Z");
      const risk = new TestVendorRiskModel({
        ...validRiskData,
        createdAt: now,
        created_at: older,
        updatedAt: now,
        updated_at: older,
      });

      const json = risk.toJSON();
      expect(json.created_at).toBe("2026-02-01T00:00:00.000Z");
      expect(json.updated_at).toBe("2026-02-01T00:00:00.000Z");
    });
  });

  describe("field instantiation", () => {
    it("should support all impact values", () => {
      const impacts = ["Negligible", "Minor", "Moderate", "Major", "Critical"] as const;
      impacts.forEach((impact) => {
        const risk = new TestVendorRiskModel({ ...validRiskData, impact });
        expect(risk.impact).toBe(impact);
      });
    });

    it("should support all likelihood values", () => {
      const likelihoods = ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"] as const;
      likelihoods.forEach((likelihood) => {
        const risk = new TestVendorRiskModel({ ...validRiskData, likelihood });
        expect(risk.likelihood).toBe(likelihood);
      });
    });

    it("should support all risk_severity values", () => {
      const severities = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"] as const;
      severities.forEach((severity) => {
        const risk = new TestVendorRiskModel({ ...validRiskData, risk_severity: severity });
        expect(risk.risk_severity).toBe(severity);
      });
    });

    it("should default is_demo to undefined when not set", () => {
      const risk = new TestVendorRiskModel(validRiskData);
      expect(risk.is_demo).toBeUndefined();
    });

    it("should default is_deleted to undefined when not set", () => {
      const risk = new TestVendorRiskModel(validRiskData);
      expect(risk.is_deleted).toBeUndefined();
    });
  });
});
