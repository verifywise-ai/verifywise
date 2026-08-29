/**
 * @fileoverview DORA Register of Information field propagation tests for VendorModel.
 *
 * These tests exercise the REAL VendorModel.createNewVendor factory and the
 * REAL VendorModel#updateVendor instance method (not a hand-rolled test
 * double), because the actual bug this covers was that both of those methods
 * silently dropped the 7 DORA fields before they ever reached
 * vendor.utils.ts's SQL builders. A test that only calls the utils layer
 * directly with a pre-populated IVendor cannot catch this class of bug.
 */

// Mock sequelize-typescript decorators so the real VendorModel class can be
// imported and exercised without a live Sequelize connection.
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    TEXT: "TEXT",
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

jest.mock("../models/user/user.model", () => ({
  UserModel: class MockUserModel {},
}));

import { VendorModel } from "../models/vendor/vendor.model";

describe("VendorModel DORA field propagation", () => {
  const requiredArgs = [
    "ACME Cloud", // vendor_name
    "Hosting", // vendor_provides
    1, // assignee
    "https://acme.example", // website
    "Jo", // vendor_contact_person
  ] as const;

  describe("createNewVendor factory", () => {
    it("threads the 7 DORA fields onto the created model when passed positionally", async () => {
      const vendor = await VendorModel.createNewVendor(
        ...requiredArgs,
        undefined, // review_result
        undefined, // review_status
        undefined, // reviewer
        undefined, // review_date
        undefined, // order_no
        false, // is_demo
        undefined, // projects
        undefined, // data_sensitivity
        undefined, // business_criticality
        undefined, // past_issues
        undefined, // regulatory_exposure
        undefined, // risk_score
        true, // is_ict_provider
        "Cloud services", // ict_service_type
        "Critical", // function_criticality
        "Not substitutable", // substitutability
        false, // has_exit_plan
        "IE", // country_of_provision
        "LEI123", // provider_lei
      );

      expect(vendor.is_ict_provider).toBe(true);
      expect(vendor.ict_service_type).toBe("Cloud services");
      expect(vendor.function_criticality).toBe("Critical");
      expect(vendor.substitutability).toBe("Not substitutable");
      expect(vendor.has_exit_plan).toBe(false);
      expect(vendor.country_of_provision).toBe("IE");
      expect(vendor.provider_lei).toBe("LEI123");
    });

    it("defaults the DORA booleans to false when the factory args are omitted", async () => {
      const vendor = await VendorModel.createNewVendor(...requiredArgs);

      expect(vendor.is_ict_provider).toBe(false);
      expect(vendor.has_exit_plan).toBe(false);
      expect(vendor.ict_service_type).toBeUndefined();
      expect(vendor.function_criticality).toBeUndefined();
      expect(vendor.substitutability).toBeUndefined();
      expect(vendor.country_of_provision).toBeUndefined();
      expect(vendor.provider_lei).toBeUndefined();
    });
  });

  describe("updateVendor instance method", () => {
    it("assigns the 7 DORA fields onto the model when provided in updateData", async () => {
      const vendor = new VendorModel({
        vendor_name: "ACME Cloud",
        vendor_provides: "Hosting",
        assignee: 1,
        website: "https://acme.example",
        vendor_contact_person: "Jo",
      });

      await vendor.updateVendor({
        is_ict_provider: true,
        ict_service_type: "Security services",
        function_criticality: "Important",
        substitutability: "Difficult to substitute",
        has_exit_plan: true,
        country_of_provision: "DE",
        provider_lei: "LEI456",
      });

      expect(vendor.is_ict_provider).toBe(true);
      expect(vendor.ict_service_type).toBe("Security services");
      expect(vendor.function_criticality).toBe("Important");
      expect(vendor.substitutability).toBe("Difficult to substitute");
      expect(vendor.has_exit_plan).toBe(true);
      expect(vendor.country_of_provision).toBe("DE");
      expect(vendor.provider_lei).toBe("LEI456");
    });

    it("leaves existing DORA field values untouched when omitted from updateData", async () => {
      const vendor = new VendorModel({
        vendor_name: "ACME Cloud",
        vendor_provides: "Hosting",
        assignee: 1,
        website: "https://acme.example",
        vendor_contact_person: "Jo",
        is_ict_provider: true,
        ict_service_type: "Cloud services",
      });

      await vendor.updateVendor({ vendor_name: "ACME Cloud Renamed" });

      expect(vendor.vendor_name).toBe("ACME Cloud Renamed");
      expect(vendor.is_ict_provider).toBe(true);
      expect(vendor.ict_service_type).toBe("Cloud services");
    });
  });
});
