import { computeExpiryDate, resolveEvidenceExpiryDate } from "../evidenceRetention.utils";
import { getEvidenceHubOrgSettings } from "../evidenceHubSettings.utils";

jest.mock("../evidenceHubSettings.utils", () => ({
  getEvidenceHubOrgSettings: jest.fn(),
}));

const mockGetSettings = getEvidenceHubOrgSettings as jest.Mock;

const BASE = new Date("2026-01-15T12:00:00.000Z");

describe("computeExpiryDate", () => {
  it("adds day-based periods", () => {
    expect(computeExpiryDate("30_days", BASE)?.toISOString()).toBe("2026-02-14T12:00:00.000Z");
    expect(computeExpiryDate("90_days", BASE)?.toISOString()).toBe("2026-04-15T12:00:00.000Z");
  });

  it("adds month-based periods", () => {
    expect(computeExpiryDate("6_months", BASE)?.toISOString()).toBe("2026-07-15T12:00:00.000Z");
    expect(computeExpiryDate("1_year", BASE)?.toISOString()).toBe("2027-01-15T12:00:00.000Z");
    expect(computeExpiryDate("7_years", BASE)?.toISOString()).toBe("2033-01-15T12:00:00.000Z");
  });

  it("treats indefinite, null, undefined, and unknown values as no expiry", () => {
    expect(computeExpiryDate("indefinite", BASE)).toBeNull();
    expect(computeExpiryDate(null, BASE)).toBeNull();
    expect(computeExpiryDate(undefined, BASE)).toBeNull();
    expect(computeExpiryDate("not_a_period", BASE)).toBeNull();
  });

  it("does not mutate the base date", () => {
    const base = new Date(BASE);
    computeExpiryDate("1_year", base);
    expect(base.toISOString()).toBe(BASE.toISOString());
  });
});

describe("resolveEvidenceExpiryDate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockResolvedValue({
      organization_id: 1,
      default_retention_period: "1_year",
      archive_on_expiry: false,
    });
  });

  it("explicit expiry_date always wins and never reads org settings", async () => {
    const result = await resolveEvidenceExpiryDate(1, "2030-06-01", "30_days", BASE);
    expect(result?.toISOString()).toBe("2030-06-01T00:00:00.000Z");
    expect(mockGetSettings).not.toHaveBeenCalled();
  });

  it("falls back to the per-evidence retention policy", async () => {
    const result = await resolveEvidenceExpiryDate(1, null, "90_days", BASE);
    expect(result?.toISOString()).toBe("2026-04-15T12:00:00.000Z");
    expect(mockGetSettings).not.toHaveBeenCalled();
  });

  it("falls back to the org default when no policy is given", async () => {
    const result = await resolveEvidenceExpiryDate(1, null, null, BASE);
    expect(result?.toISOString()).toBe("2027-01-15T12:00:00.000Z");
  });

  it("returns null when neither policy nor org default exists", async () => {
    mockGetSettings.mockResolvedValue({
      organization_id: 1,
      default_retention_period: null,
      archive_on_expiry: false,
    });
    expect(await resolveEvidenceExpiryDate(1, null, null, BASE)).toBeNull();
  });

  it("treats an invalid explicit expiry as no expiry rather than erroring", async () => {
    expect(await resolveEvidenceExpiryDate(1, "not-a-date", "30_days", BASE)).toBeNull();
  });

  it("indefinite per-evidence policy overrides the org default to no expiry", async () => {
    expect(await resolveEvidenceExpiryDate(1, null, "indefinite", BASE)).toBeNull();
  });
});
