import { resolveFileExpiryOnCreate } from "../retention.utils";
import { getFileOrgSettings } from "../fileOrgSettings.utils";

jest.mock("../fileOrgSettings.utils", () => ({
  getFileOrgSettings: jest.fn(),
}));

const mockOrgSettings = getFileOrgSettings as jest.Mock;
// Noon UTC so this base date reads as Jan 15 in every real timezone; that
// keeps computeExpiryDate's local-time setDate math from crossing midnight.
const BASE = new Date("2026-01-15T12:00:00.000Z");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("resolveFileExpiryOnCreate precedence", () => {
  it("explicit expiry_date wins outright, even when retention_policy is present", async () => {
    // Precedence rule 1 — an explicit expiry_date is never re-derived.
    const result = await resolveFileExpiryOnCreate(1, "2027-01-01", "30_days", BASE);
    expect(result).toEqual({ expiry_date: "2027-01-01", retention_policy: "30_days" });
    expect(mockOrgSettings).not.toHaveBeenCalled();
  });

  it("explicit expiry_date with no retention keeps retention_policy null", async () => {
    const result = await resolveFileExpiryOnCreate(1, "2027-01-01", null, BASE);
    expect(result).toEqual({ expiry_date: "2027-01-01", retention_policy: null });
    expect(mockOrgSettings).not.toHaveBeenCalled();
  });

  it("explicit retention_policy derives expiry_date and short-circuits org lookup", async () => {
    // Precedence rule 2.
    const result = await resolveFileExpiryOnCreate(1, null, "1_year", BASE);
    expect(result).toEqual({ expiry_date: "2027-01-15", retention_policy: "1_year" });
    expect(mockOrgSettings).not.toHaveBeenCalled();
  });

  it("indefinite retention resolves to null expiry, still short-circuits org lookup", async () => {
    const result = await resolveFileExpiryOnCreate(1, null, "indefinite", BASE);
    expect(result).toEqual({ expiry_date: null, retention_policy: "indefinite" });
    expect(mockOrgSettings).not.toHaveBeenCalled();
  });

  it("falls back to the org default when neither explicit value is present", async () => {
    // Precedence rule 3.
    mockOrgSettings.mockResolvedValueOnce({
      organization_id: 1,
      default_retention_policy: "90_days",
    });
    const result = await resolveFileExpiryOnCreate(1, null, null, BASE);
    expect(result).toEqual({ expiry_date: "2026-04-15", retention_policy: "90_days" });
    expect(mockOrgSettings).toHaveBeenCalledWith(1);
  });

  it("returns nulls when nothing is set at any level", async () => {
    // Precedence rule 4.
    mockOrgSettings.mockResolvedValueOnce({
      organization_id: 1,
      default_retention_policy: null,
    });
    const result = await resolveFileExpiryOnCreate(1, null, null, BASE);
    expect(result).toEqual({ expiry_date: null, retention_policy: null });
  });

  it("garbage retention_policy is ignored and falls through to org default", async () => {
    mockOrgSettings.mockResolvedValueOnce({
      organization_id: 1,
      default_retention_policy: "30_days",
    });
    const result = await resolveFileExpiryOnCreate(1, null, "bogus_value", BASE);
    expect(result).toEqual({ expiry_date: "2026-02-14", retention_policy: "30_days" });
  });

  it("invalid explicit expiry_date resolves expiry_date to null but still short-circuits", async () => {
    const result = await resolveFileExpiryOnCreate(1, "not-a-date", null, BASE);
    expect(result).toEqual({ expiry_date: null, retention_policy: null });
    expect(mockOrgSettings).not.toHaveBeenCalled();
  });
});
