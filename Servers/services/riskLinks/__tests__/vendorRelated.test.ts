import {
  planVendorRiskLinks,
  scoreVendorRiskPair,
  vendorRiskWords,
  VENDOR_WORDING_SIMILAR,
  VENDOR_WORDING_STRONG,
} from "../vendorRelated";
import { LINK_SCORE_THRESHOLD, MAX_LINKS_PER_RISK } from "../recompute";
import { VendorRiskScoringRow } from "../../../utils/vendorRiskLink.utils";

const row = (overrides: Partial<VendorRiskScoringRow> & { id: number }): VendorRiskScoringRow => ({
  vendor_id: 10,
  risk_description: null,
  impact_description: null,
  frameworks: [],
  use_cases: [],
  ...overrides,
});

const score = (a: VendorRiskScoringRow, b: VendorRiskScoringRow) =>
  scoreVendorRiskPair(a, b, vendorRiskWords(a), vendorRiskWords(b));

describe("vendorRiskWords", () => {
  it("reads description and impact, and drops stopwords and short words", () => {
    expect([
      ...vendorRiskWords(
        row({
          id: 1,
          risk_description: "The portal leaks data with an AI bug",
          impact_description: "Fines for the bank",
        }),
      ),
    ]).toEqual(["portal", "leaks", "data", "bug", "fines", "bank"]);
  });
});

describe("scoreVendorRiskPair", () => {
  const strong = { risk_description: "Customer records exposed through support portal" };
  // Three of eleven distinct words shared: similar, not strong.
  const similar = {
    risk_description: "Customer records exposed in billing exports, nightly batch jobs, archives",
  };

  it("relates nothing without shared wording, whatever else they share", () => {
    const a = row({ id: 1, risk_description: "Late invoices", frameworks: ["EU AI Act"] });
    const b = row({ id: 2, risk_description: "Sign-on outage", frameworks: ["EU AI Act"] });

    expect(score(a, b)).toBeNull();
  });

  it("needs two shared words, not one", () => {
    const a = row({ id: 1, risk_description: "Outage" });
    const b = row({ id: 2, risk_description: "Outage risk" });

    expect(score(a, b)).toBeNull();
  });

  it("scores strong wording 3 and adds the same vendor", () => {
    const a = row({ id: 1, ...strong });
    const b = row({ id: 2, risk_description: "Support portal: customer records exposed" });

    const result = score(a, b)!;

    expect(result.score).toBe(4);
    expect(result.reasons).toEqual([
      {
        signal: "similar_wording",
        weight: 3,
        detail: "customer, exposed, portal, records, support",
      },
      { signal: "same_vendor", weight: 1 },
    ]);
  });

  it("scores similar wording 2, below the threshold on its own", () => {
    const a = row({ id: 1, vendor_id: 10, ...strong });
    const b = row({ id: 2, vendor_id: 11, ...similar });

    const result = score(a, b)!;

    expect(result.reasons[0]).toMatchObject({ signal: "similar_wording", weight: 2 });
    expect(result.score).toBe(2);
    expect(result.score).toBeLessThan(LINK_SCORE_THRESHOLD);
  });

  it("counts a shared use case across vendors, by name, but never within one vendor", () => {
    const lending = { id: 5, name: "Lending" };
    const claims = { id: 6, name: "Claims" };
    const a = row({ id: 1, vendor_id: 10, ...strong, use_cases: [lending, claims] });
    const b = row({ id: 2, vendor_id: 11, ...similar, use_cases: [claims, lending] });
    const sameVendor = row({ id: 3, vendor_id: 10, ...similar, use_cases: [lending] });

    expect(score(a, b)!.reasons[1]).toEqual({
      signal: "shared_use_case",
      weight: 1,
      detail: "Claims, Lending",
    });
    expect(score(a, sameVendor)!.reasons.map((r) => r.signal)).toEqual([
      "similar_wording",
      "same_vendor",
    ]);
  });

  it("counts shared frameworks once, naming them", () => {
    const a = row({ id: 1, vendor_id: 10, ...strong, frameworks: ["EU AI Act", "ISO 42001"] });
    const b = row({ id: 2, vendor_id: 11, ...similar, frameworks: ["ISO 42001", "EU AI Act"] });

    expect(score(a, b)!.reasons[1]).toEqual({
      signal: "shared_framework",
      weight: 1,
      detail: "EU AI Act, ISO 42001",
    });
    expect(score(a, b)!.score).toBe(3);
  });

  it("treats two vendor risks with no vendor as different vendors", () => {
    const a = row({ id: 1, vendor_id: null, ...strong });
    const b = row({ id: 2, vendor_id: null, ...strong });

    expect(score(a, b)!.reasons.map((r) => r.signal)).toEqual(["similar_wording"]);
  });

  it("keeps the wording bands in order", () => {
    expect(VENDOR_WORDING_SIMILAR).toBeLessThan(VENDOR_WORDING_STRONG);
  });
});

describe("planVendorRiskLinks", () => {
  it("keeps pairs at the threshold, best first, ties by id, and never the subject", () => {
    const subject = row({ id: 5, vendor_id: 10, risk_description: "Customer records exposed" });
    const rows = [
      subject,
      row({ id: 9, vendor_id: 10, risk_description: "Customer records exposed" }),
      row({ id: 7, vendor_id: 10, risk_description: "Customer records exposed" }),
      row({ id: 8, vendor_id: 11, risk_description: "Customer records exposed in exports" }),
      row({ id: 6, vendor_id: 11, risk_description: "Unrelated invoice dispute" }),
    ];

    const { scored, keepers } = planVendorRiskLinks(subject, rows);

    expect(keepers.map((k) => k.targetVendorRiskId)).toEqual([7, 9, 8]);
    expect(keepers.map((k) => k.score)).toEqual([4, 4, 3]);
    expect(scored.has(5)).toBe(false);
    expect(scored.has(6)).toBe(false);
  });

  it("caps the keepers per vendor risk", () => {
    const subject = row({ id: 1, risk_description: "Customer records exposed" });
    const rows = [
      subject,
      ...Array.from({ length: MAX_LINKS_PER_RISK + 5 }, (_, i) =>
        row({ id: i + 2, risk_description: "Customer records exposed" }),
      ),
    ];

    const { scored, keepers } = planVendorRiskLinks(subject, rows);

    expect(keepers).toHaveLength(MAX_LINKS_PER_RISK);
    // Scored past the cap, so recompute can still refresh or keep those rows.
    expect(scored.size).toBe(MAX_LINKS_PER_RISK + 5);
  });
});
