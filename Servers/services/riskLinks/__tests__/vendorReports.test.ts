import {
  findVendorDuplicateCandidates,
  findVendorExposure,
  findVendorFrameworkCoverage,
  MAX_VENDOR_COVERAGE_ROWS,
  vendorCoverageState,
  vendorRiskLevelRank,
} from "../vendorReports";
import {
  getVendorCoverageScanRowsQuery,
  getVendorDuplicateScanRowsQuery,
  getVendorExposureRowsQuery,
  VendorCoverageScanRow,
  VendorDuplicateScanRow,
  VendorExposureRow,
} from "../../../utils/vendorRiskReport.utils";
import { MAX_DUPLICATE_SCAN } from "../duplicates";

jest.mock("../../../utils/vendorRiskReport.utils", () => ({
  getVendorExposureRowsQuery: jest.fn(),
  getVendorDuplicateScanRowsQuery: jest.fn(),
  getVendorCoverageScanRowsQuery: jest.fn(),
}));

const mockExposureRows = getVendorExposureRowsQuery as jest.Mock;
const mockDuplicateRows = getVendorDuplicateScanRowsQuery as jest.Mock;
const mockCoverageRows = getVendorCoverageScanRowsQuery as jest.Mock;

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// Exposure
// ---------------------------------------------------------------------------

const exposureRow = (overrides: Partial<VendorExposureRow>): VendorExposureRow => ({
  vendor_risk_id: 1,
  vendor_id: 10,
  vendor_name: "Acme",
  child_ids: [],
  suggested: 0,
  use_cases: [],
  ...overrides,
});

describe("findVendorExposure", () => {
  it("rolls each vendor's risks up into one reach, counting a child once", async () => {
    mockExposureRows.mockResolvedValue([
      exposureRow({
        vendor_risk_id: 1,
        child_ids: [100, 101],
        use_cases: [{ id: 5, name: "Lending" }],
      }),
      // 101 inherits through a second Acme risk too: still one project risk.
      exposureRow({
        vendor_risk_id: 2,
        child_ids: [101],
        suggested: 2,
        use_cases: [
          { id: 6, name: "Claims" },
          { id: 5, name: "Lending" },
        ],
      }),
      exposureRow({ vendor_risk_id: 3 }),
    ]);

    const report = await findVendorExposure(7);

    expect(mockExposureRows).toHaveBeenCalledWith(7);
    expect(report.risks).toEqual([
      { vendor_risk_id: 1, children: 2, suggested: 0, use_cases: [{ id: 5, name: "Lending" }] },
      {
        vendor_risk_id: 2,
        children: 1,
        suggested: 2,
        use_cases: [
          { id: 6, name: "Claims" },
          { id: 5, name: "Lending" },
        ],
      },
      { vendor_risk_id: 3, children: 0, suggested: 0, use_cases: [] },
    ]);
    expect(report.vendors).toEqual([
      {
        vendor_id: 10,
        vendor_name: "Acme",
        vendor_risks: 3,
        linked_vendor_risks: 2,
        inheriting_risks: 2,
        suggested: 2,
        use_cases: [
          { id: 6, name: "Claims" },
          { id: 5, name: "Lending" },
        ],
      },
    ]);
  });

  it("puts the widest reach first, then the most use cases, then the name", async () => {
    mockExposureRows.mockResolvedValue([
      exposureRow({ vendor_risk_id: 1, vendor_id: 1, vendor_name: "Zeta" }),
      exposureRow({ vendor_risk_id: 2, vendor_id: 2, vendor_name: "Beta" }),
      exposureRow({
        vendor_risk_id: 3,
        vendor_id: 3,
        vendor_name: "Gamma",
        child_ids: [9],
        use_cases: [{ id: 1, name: "A" }],
      }),
      exposureRow({
        vendor_risk_id: 4,
        vendor_id: 4,
        vendor_name: "Delta",
        child_ids: [8],
        use_cases: [
          { id: 1, name: "A" },
          { id: 2, name: "B" },
        ],
      }),
    ]);

    const report = await findVendorExposure(7);

    expect(report.vendors.map((v) => v.vendor_name)).toEqual(["Delta", "Gamma", "Beta", "Zeta"]);
  });

  it("lists a vendor risk with no vendor but leaves it out of the vendor rollup", async () => {
    mockExposureRows.mockResolvedValue([
      exposureRow({ vendor_risk_id: 1, vendor_id: null, vendor_name: null, child_ids: [5] }),
    ]);

    const report = await findVendorExposure(7);

    expect(report.risks).toHaveLength(1);
    expect(report.vendors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

const scanRow = (overrides: Partial<VendorDuplicateScanRow>): VendorDuplicateScanRow => ({
  id: 1,
  vendor_id: 10,
  vendor_name: "Acme",
  risk_description: null,
  impact_description: null,
  risk_level: "High",
  action_owner: 3,
  ...overrides,
});

describe("findVendorDuplicateCandidates", () => {
  it("pairs two risks of one vendor that read alike, with the words they share", async () => {
    mockDuplicateRows.mockResolvedValue([
      scanRow({ id: 1, risk_description: "Customer data leaked through the support portal" }),
      scanRow({
        id: 2,
        risk_description: "Support portal leaked customer data",
        impact_description: "Regulatory fines",
      }),
      scanRow({ id: 3, risk_description: "Late invoices from the vendor" }),
    ]);

    const report = await findVendorDuplicateCandidates(7);

    expect(mockDuplicateRows).toHaveBeenCalledWith(7, MAX_DUPLICATE_SCAN);
    expect(report).toMatchObject({ scanned: 3, compared: 3, matched: 1, truncated: false });
    expect(report.candidates).toHaveLength(1);
    const [pair] = report.candidates;
    expect(pair.vendor).toEqual({ id: 10, name: "Acme" });
    expect(pair.risk_a.id).toBe(1);
    expect(pair.risk_b).toEqual({
      id: 2,
      risk_description: "Support portal leaked customer data",
      risk_level: "High",
      action_owner: 3,
    });
    expect(pair.shared_tokens).toEqual(["customer", "data", "leaked", "portal", "support"]);
    expect(pair.similarity).toBeGreaterThan(0.25);
    expect(Math.round(pair.similarity * 100) / 100).toBe(pair.similarity);
  });

  // The same risk carried by two suppliers is a pattern, not a duplicate.
  it("never compares risks across vendors", async () => {
    mockDuplicateRows.mockResolvedValue([
      scanRow({ id: 1, vendor_id: 10, risk_description: "Customer data leaked" }),
      scanRow({ id: 2, vendor_id: 11, risk_description: "Customer data leaked" }),
    ]);

    const report = await findVendorDuplicateCandidates(7);

    expect(report.compared).toBe(0);
    expect(report.candidates).toEqual([]);
  });

  it("skips risks with no vendor or no usable words", async () => {
    mockDuplicateRows.mockResolvedValue([
      scanRow({ id: 1, vendor_id: null, risk_description: "Customer data leaked" }),
      scanRow({ id: 2, vendor_id: null, risk_description: "Customer data leaked" }),
      scanRow({ id: 3, risk_description: "a b" }),
      scanRow({ id: 4, risk_description: "Customer data leaked" }),
    ]);

    const report = await findVendorDuplicateCandidates(7);

    expect(report.compared).toBe(0);
    expect(report.candidates).toEqual([]);
  });

  it("lists the closest pair first", async () => {
    mockDuplicateRows.mockResolvedValue([
      scanRow({ id: 1, risk_description: "Model outage stops loan approvals" }),
      scanRow({ id: 2, risk_description: "Model outage stops loan approvals entirely" }),
      scanRow({ id: 3, risk_description: "Model outage delays reporting" }),
    ]);

    const report = await findVendorDuplicateCandidates(7);

    expect(report.candidates[0]).toMatchObject({ risk_a: { id: 1 }, risk_b: { id: 2 } });
    const scores = report.candidates.map((c) => c.similarity);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("flags a scan that hit the row cap", async () => {
    mockDuplicateRows.mockResolvedValue(
      Array.from({ length: MAX_DUPLICATE_SCAN }, (_, i) =>
        scanRow({ id: i + 1, vendor_id: i, risk_description: `Unique risk ${i}` }),
      ),
    );

    const report = await findVendorDuplicateCandidates(7);

    expect(report.truncated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Framework coverage
// ---------------------------------------------------------------------------

const coverageRow = (overrides: Partial<VendorCoverageScanRow>): VendorCoverageScanRow => ({
  id: 1,
  risk_description: "Risk",
  risk_level: "Medium",
  action_owner: null,
  vendor_id: 10,
  vendor_name: "Acme",
  mapped_frameworks: [],
  available_frameworks: [],
  ...overrides,
});

describe("vendorCoverageState", () => {
  it("calls a mapped risk covered, whatever its vendor serves", () => {
    expect(vendorCoverageState(coverageRow({ mapped_frameworks: ["ISO 42001"] }))).toBe("mapped");
  });

  it("calls an unmapped risk a gap only when there was a framework to map to", () => {
    expect(vendorCoverageState(coverageRow({ available_frameworks: ["EU AI Act"] }))).toBe("gap");
    expect(vendorCoverageState(coverageRow({}))).toBe("no_framework");
  });
});

describe("vendorRiskLevelRank", () => {
  it("ranks level words, very high above high and very low below low", () => {
    expect(
      ["Low", "Very high risk", "Medium", "Very low", "High", "Critical", "Moderate"].map(
        vendorRiskLevelRank,
      ),
    ).toEqual([2, 5, 3, 1, 4, 5, 3]);
  });

  it("puts an unknown or empty level last", () => {
    expect(vendorRiskLevelRank(null)).toBe(0);
    expect(vendorRiskLevelRank("Unrated")).toBe(0);
  });
});

describe("findVendorFrameworkCoverage", () => {
  it("counts every state and lists the unmapped ones worst first", async () => {
    mockCoverageRows.mockResolvedValue([
      coverageRow({ id: 1, mapped_frameworks: ["ISO 42001"] }),
      coverageRow({ id: 2, risk_level: "Low", available_frameworks: ["EU AI Act"] }),
      coverageRow({ id: 3, risk_level: "Very high", available_frameworks: ["EU AI Act"] }),
      coverageRow({ id: 4, risk_level: "Medium" }),
      coverageRow({ id: 5, risk_level: "High", vendor_id: null, vendor_name: null }),
    ]);

    const report = await findVendorFrameworkCoverage(7);

    expect(mockCoverageRows).toHaveBeenCalledWith(7);
    expect(report.summary).toEqual({ total_active_risks: 5, mapped: 1, gap: 2, no_framework: 2 });
    expect(report.gaps.map((r) => r.id)).toEqual([3, 2]);
    expect(report.no_framework.map((r) => r.id)).toEqual([5, 4]);
    expect(report.gaps[0]).toEqual({
      id: 3,
      risk_description: "Risk",
      risk_level: "Very high",
      action_owner: null,
      vendor: { id: 10, name: "Acme" },
      available_frameworks: ["EU AI Act"],
    });
    expect(report.no_framework[0].vendor).toEqual({ id: null, name: null });
    expect(report.truncated).toBe(false);
  });

  it("caps each list but keeps the counts whole", async () => {
    mockCoverageRows.mockResolvedValue(
      Array.from({ length: MAX_VENDOR_COVERAGE_ROWS + 3 }, (_, i) => coverageRow({ id: i + 1 })),
    );

    const report = await findVendorFrameworkCoverage(7);

    expect(report.summary.no_framework).toBe(MAX_VENDOR_COVERAGE_ROWS + 3);
    expect(report.no_framework).toHaveLength(MAX_VENDOR_COVERAGE_ROWS);
    expect(report.truncated).toBe(true);
  });
});
