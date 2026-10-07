/** Report fixtures shared by the vendor risk insight tests. */

import type {
  VendorCoverageReport,
  VendorDuplicateReport,
  VendorExposureReport,
} from "../../../../../domain/interfaces/i.riskLink";
import type { VendorRisk } from "../../../../../domain/types/VendorRisk";

export const exposureReport = (
  overrides: Partial<VendorExposureReport> = {},
): VendorExposureReport => ({
  risks: [
    {
      vendor_risk_id: 1,
      children: 2,
      suggested: 0,
      use_cases: [
        { id: 5, name: "Lending" },
        { id: 6, name: "Onboarding" },
      ],
    },
    { vendor_risk_id: 2, children: 0, suggested: 1, use_cases: [] },
    { vendor_risk_id: 3, children: 0, suggested: 0, use_cases: [] },
  ],
  vendors: [
    {
      vendor_id: 10,
      vendor_name: "Acme Cloud",
      vendor_risks: 2,
      linked_vendor_risks: 1,
      inheriting_risks: 2,
      suggested: 1,
      use_cases: [
        { id: 5, name: "Lending" },
        { id: 6, name: "Onboarding" },
      ],
    },
    {
      vendor_id: 11,
      vendor_name: "Zeta Labs",
      vendor_risks: 1,
      linked_vendor_risks: 0,
      inheriting_risks: 0,
      suggested: 0,
      use_cases: [],
    },
  ],
  ...overrides,
});

export const duplicateReport = (
  overrides: Partial<VendorDuplicateReport> = {},
): VendorDuplicateReport => ({
  scanned: 12,
  compared: 30,
  matched: 1,
  truncated: false,
  candidates: [
    {
      vendor: { id: 10, name: "Acme Cloud" },
      risk_a: {
        id: 21,
        risk_description: "Customer data leak",
        risk_level: "High",
        action_owner: 7,
      },
      risk_b: {
        id: 22,
        risk_description: "Leak of customer data",
        risk_level: "High",
        action_owner: null,
      },
      similarity: 0.62,
      shared_tokens: ["customer", "data", "leak"],
    },
  ],
  ...overrides,
});

export const coverageReport = (
  overrides: Partial<VendorCoverageReport> = {},
): VendorCoverageReport => ({
  summary: { total_active_risks: 5, mapped: 3, gap: 1, no_framework: 1 },
  gaps: [
    {
      id: 31,
      risk_description: "Unvetted subprocessor",
      risk_level: "Very high risk",
      action_owner: 7,
      vendor: { id: 10, name: "Acme Cloud" },
      available_frameworks: ["EU AI Act", "ISO 42001"],
    },
  ],
  no_framework: [
    {
      id: 32,
      risk_description: "Weak SLA",
      risk_level: "Low",
      action_owner: null,
      vendor: { id: 11, name: "Zeta Labs" },
      available_frameworks: [],
    },
  ],
  truncated: false,
  ...overrides,
});

export const vendorRisk = (overrides: Partial<VendorRisk>): VendorRisk =>
  ({
    risk_id: 1,
    vendor_id: 10,
    risk_description: "Customer data leak",
    likelihood: "Possible",
    risk_severity: "Major",
    risk_level: "High",
    ...overrides,
  }) as VendorRisk;
