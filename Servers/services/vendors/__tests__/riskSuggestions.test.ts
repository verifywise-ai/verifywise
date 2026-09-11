import {
  getVendorRiskSuggestions,
  VENDOR_SUGGESTION_SUPPRESS_THRESHOLD,
} from "../riskSuggestions";
import { getVendorByIdQuery } from "../../../utils/vendor.utils";
import { getVendorRisksByVendorIdQuery } from "../../../utils/vendorRisk.utils";
import { IVendor } from "../../../domain.layer/interfaces/i.vendor";
import { IVendorRisk } from "../../../domain.layer/interfaces/i.vendorRisk";

jest.mock("../../../utils/vendor.utils", () => ({
  getVendorByIdQuery: jest.fn(),
}));
jest.mock("../../../utils/vendorRisk.utils", () => ({
  getVendorRisksByVendorIdQuery: jest.fn(),
}));

const mockVendor = getVendorByIdQuery as jest.Mock;
const mockRisks = getVendorRisksByVendorIdQuery as jest.Mock;

const VENDOR_DEFAULTS = {
  id: 1,
  vendor_name: "Demo Vendor",
  vendor_provides: "Services",
  assignee: 1,
  website: "https://example.com",
  vendor_contact_person: "Contact",
  data_sensitivity: "None",
  business_criticality: "Low (vendor supports non-core functions)",
  past_issues: "None",
  regulatory_exposure: "None",
};

const vendor = (overrides: Record<string, unknown> = {}): IVendor =>
  ({ ...VENDOR_DEFAULTS, ...overrides }) as IVendor;

const risk = (overrides: Record<string, unknown> & { id: number }): IVendorRisk =>
  ({
    risk_description: "Unrelated existing risk text",
    impact_description: "Impact",
    likelihood: "Possible",
    risk_severity: "Major",
    action_plan: "Plan",
    action_owner: 1,
    risk_level: "High Risk",
    ...overrides,
  }) as IVendorRisk;

beforeEach(() => {
  jest.clearAllMocks();
  mockRisks.mockResolvedValue([]);
});

describe("getVendorRiskSuggestions", () => {
  it("returns one suggestion per triggering dimension, four in total", async () => {
    mockVendor.mockResolvedValue(
      vendor({
        data_sensitivity: "Financial data",
        business_criticality: "High (critical to core services or products)",
        past_issues: "Major incident (e.g. data breach, legal issue)",
        regulatory_exposure: "GDPR (EU)",
      }),
    );

    const report = await getVendorRiskSuggestions(1, 7);

    expect(report).not.toBeNull();
    expect(report!.questionnaire_complete).toBe(true);
    expect(report!.suggestions).toHaveLength(4);
    expect(report!.suggestions.map((s) => s.archetype).sort()).toEqual(
      [
        "business_criticality",
        "data_sensitivity",
        "past_issues",
        "regulatory_exposure",
      ].sort(),
    );
  });

  it("returns no suggestions for a completed questionnaire with no exposure", async () => {
    mockVendor.mockResolvedValue(vendor());

    const report = await getVendorRiskSuggestions(1, 7);

    expect(report).not.toBeNull();
    expect(report!.questionnaire_complete).toBe(true);
    expect(report!.suggestions).toHaveLength(0);
    expect(report!.suppressed).toHaveLength(0);
  });

  it("distinguishes an unassessed vendor: incomplete flag, empty suggestions", async () => {
    mockVendor.mockResolvedValue(
      vendor({
        data_sensitivity: null,
        business_criticality: null,
        past_issues: null,
        regulatory_exposure: null,
      }),
    );

    const report = await getVendorRiskSuggestions(1, 7);

    expect(report).not.toBeNull();
    expect(report!.questionnaire_complete).toBe(false);
    expect(report!.suggestions).toHaveLength(0);
  });

  it("treats Internal only as no exposure but PII as exposure", async () => {
    mockVendor.mockResolvedValue(vendor({ data_sensitivity: "Internal only" }));
    const internal = await getVendorRiskSuggestions(1, 7);
    expect(internal!.suggestions.map((s) => s.archetype)).not.toContain("data_sensitivity");

    mockVendor.mockResolvedValue(
      vendor({ data_sensitivity: "Personally identifiable information (PII)" }),
    );
    const pii = await getVendorRiskSuggestions(1, 7);
    expect(pii!.suggestions.map((s) => s.archetype)).toContain("data_sensitivity");
  });

  it("suppresses an archetype a matching existing risk already covers", async () => {
    mockVendor.mockResolvedValue(vendor({ data_sensitivity: "Health data (e.g. HIPAA)" }));
    mockRisks.mockResolvedValue([
      risk({
        id: 99,
        risk_description: "Health data processed by this vendor lacks documented safeguards",
      }),
    ]);

    const report = await getVendorRiskSuggestions(1, 7);

    expect(report!.suggestions.find((s) => s.archetype === "data_sensitivity")).toBeUndefined();
    expect(report!.suppressed).toEqual([
      { archetype: "data_sensitivity", matched_vendor_risk_id: 99 },
    ]);
  });

  it("derives risk_level from the matrix instead of hardcoding it", async () => {
    mockVendor.mockResolvedValue(vendor({ data_sensitivity: "Health data (e.g. HIPAA)" }));

    const report = await getVendorRiskSuggestions(1, 7);
    const [suggestion] = report!.suggestions;

    expect(suggestion.risk_severity).toBe("Catastrophic");
    expect(suggestion.likelihood).toBe("Possible");
    expect(suggestion.risk_level).toBe("High Risk");
    expect(suggestion.reasons).toEqual(["data_sensitivity: Health data (e.g. HIPAA)"]);
  });

  it("orders worst level first and is stable for equal levels", async () => {
    mockVendor.mockResolvedValue(
      vendor({
        data_sensitivity: "Health data (e.g. HIPAA)",
        business_criticality: "High (critical to core services or products)",
        past_issues: "Major incident (e.g. data breach, legal issue)",
        regulatory_exposure: "HIPAA (US)",
      }),
    );

    const report = await getVendorRiskSuggestions(1, 7);

    // A and C are High; B and D are Medium. Equal levels fall back to A/B/C/D.
    expect(report!.suggestions.map((s) => s.archetype)).toEqual([
      "data_sensitivity",
      "past_issues",
      "business_criticality",
      "regulatory_exposure",
    ]);
    expect(VENDOR_SUGGESTION_SUPPRESS_THRESHOLD).toBe(0.25);
  });
});
