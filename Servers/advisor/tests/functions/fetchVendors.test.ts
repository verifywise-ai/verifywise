import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as vendorUtils from "../../../utils/vendor.utils";
import { availableVendorTools } from "../../functions/vendorFunctions";
import { createMockTenant } from "../../mocks/mockTenant";

jest.mock("../../../utils/vendor.utils");

const mockVendors = [
  {
    id: 1,
    vendor_name: "Acme AI Solutions",
    vendor_provides: "ML Infrastructure",
    review_status: "Reviewed",
    review_date: "2026-01-15",
    data_sensitivity: "High",
    business_criticality: "Critical",
    regulatory_exposure: "High",
    risk_score: 75,
  },
  {
    id: 2,
    vendor_name: "Global Data Partners",
    vendor_provides: "Data Enrichment",
    review_status: "In review",
    review_date: "2026-02-20",
    data_sensitivity: "Medium",
    business_criticality: "High",
    regulatory_exposure: "Medium",
    risk_score: 45,
  },
  {
    id: 3,
    vendor_name: "SecureCloud Inc",
    vendor_provides: "Cloud Hosting",
    review_status: "Not started",
    review_date: null,
    data_sensitivity: "Low",
    business_criticality: "Medium",
    regulatory_exposure: "Low",
    risk_score: 30,
  },
];

describe("Advisor Functions: fetchVendors", () => {
  const mockTenant = createMockTenant();
  const fetchVendors = availableVendorTools["fetch_vendors"];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should fetch all vendors when no filters provided", async () => {
    jest.spyOn(vendorUtils, "getAllVendorsQuery").mockResolvedValue(mockVendors as any);

    const result = await fetchVendors({}, mockTenant);

    expect(vendorUtils.getAllVendorsQuery).toHaveBeenCalledWith(mockTenant);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ vendor_name: "Acme AI Solutions" });
  });

  it("should filter vendors by review_status", async () => {
    jest.spyOn(vendorUtils, "getAllVendorsQuery").mockResolvedValue(mockVendors as any);

    const result = await fetchVendors({ review_status: "Reviewed" }, mockTenant);

    expect(result).toHaveLength(1);
    expect(result[0].review_status).toBe("Reviewed");
  });

  it("should filter vendors by data_sensitivity", async () => {
    jest.spyOn(vendorUtils, "getAllVendorsQuery").mockResolvedValue(mockVendors as any);

    const result = await fetchVendors({ data_sensitivity: "High" }, mockTenant);

    expect(result).toHaveLength(1);
    expect(result[0].data_sensitivity).toBe("High");
  });

  it("should filter vendors by business_criticality", async () => {
    jest.spyOn(vendorUtils, "getAllVendorsQuery").mockResolvedValue(mockVendors as any);

    const result = await fetchVendors({ business_criticality: "Critical" }, mockTenant);

    expect(result).toHaveLength(1);
    expect(result[0].business_criticality).toBe("Critical");
  });

  it("should filter vendors by vendor_name substring (case insensitive)", async () => {
    jest.spyOn(vendorUtils, "getAllVendorsQuery").mockResolvedValue(mockVendors as any);

    const result = await fetchVendors({ vendor_name: "acme" }, mockTenant);

    expect(result).toHaveLength(1);
    expect(result[0].vendor_name).toBe("Acme AI Solutions");
  });

  it("should limit results when limit is provided", async () => {
    jest.spyOn(vendorUtils, "getAllVendorsQuery").mockResolvedValue(mockVendors as any);

    const result = await fetchVendors({ limit: 2 }, mockTenant);

    expect(result).toHaveLength(2);
  });

  it("should apply multiple filters simultaneously", async () => {
    jest.spyOn(vendorUtils, "getAllVendorsQuery").mockResolvedValue(mockVendors as any);

    const result = await fetchVendors(
      { review_status: "Reviewed", data_sensitivity: "High" },
      mockTenant,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      vendor_name: "Acme AI Solutions",
      review_status: "Reviewed",
      data_sensitivity: "High",
    });
  });

  it("should return lightweight projections with only required fields", async () => {
    jest.spyOn(vendorUtils, "getAllVendorsQuery").mockResolvedValue(mockVendors as any);

    const result = await fetchVendors({}, mockTenant);

    const keys = Object.keys(result[0]);
    expect(keys).toEqual([
      "id",
      "vendor_name",
      "vendor_provides",
      "review_status",
      "review_date",
      "data_sensitivity",
      "business_criticality",
      "regulatory_exposure",
      "risk_score",
    ]);
  });

  it("should return empty array when no vendors match filters", async () => {
    jest.spyOn(vendorUtils, "getAllVendorsQuery").mockResolvedValue(mockVendors as any);

    const result = await fetchVendors({ review_status: "Requires follow-up" }, mockTenant);

    expect(result).toEqual([]);
  });

  it("should throw when database query fails", async () => {
    jest
      .spyOn(vendorUtils, "getAllVendorsQuery")
      .mockRejectedValue(new Error("DB connection lost"));

    await expect(fetchVendors({}, mockTenant)).rejects.toThrow("Failed to fetch vendors");
  });
});
