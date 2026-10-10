/** Fixtures shared by the research findings tests. */

import { APIError } from "../../../../../application/tools/error";
import type {
  AcceptedVendorRisk,
  CategorySummaryEntry,
  VendorResearchRun,
  VendorRiskFinding,
} from "../../../../../domain/interfaces/i.vendorResearch";

export const finding = (overrides: Partial<VendorRiskFinding> = {}): VendorRiskFinding => ({
  id: 1,
  organization_id: 1,
  vendor_id: 7,
  run_id: 5,
  category: "security_incidents",
  risk_description: "Customer data was exposed in a breach",
  impact_description: "Personal data of our customers could be exposed",
  action_plan: "Ask the vendor for its incident report",
  likelihood: "Likely",
  risk_severity: "Major",
  risk_level: "High Risk",
  confidence: "medium",
  sources: [
    {
      url: "https://news.example.com/breach",
      title: "Breach report",
      quote: "The vendor confirmed the incident.",
      published_at: "2026-03-12",
    },
  ],
  status: "pending",
  dismissed_reason: null,
  dismissed_note: null,
  accepted_vendor_risk_id: null,
  decided_by: null,
  decided_at: null,
  created_at: "2026-10-10T09:01:00.000Z",
  vendor_name: "Acme Cloud",
  ...overrides,
});

/** A second, different finding, so that two rows can be told apart. */
export const secondFinding = (overrides: Partial<VendorRiskFinding> = {}) =>
  finding({
    id: 2,
    category: "certifications",
    risk_description: "The ISO 27001 certificate has lapsed",
    impact_description: "Security controls may no longer be audited",
    likelihood: "Possible",
    risk_severity: "Moderate",
    risk_level: "Medium Risk",
    confidence: "high",
    sources: [
      {
        url: "https://registry.example.org/certificates/42",
        title: "Certificate register",
        quote: "Status: expired",
        published_at: null,
      },
    ],
    ...overrides,
  });

export const run = (overrides: Partial<VendorResearchRun> = {}): VendorResearchRun => ({
  id: 5,
  vendor_id: 7,
  status: "completed",
  trigger_type: "manual",
  categories: ["security_incidents", "certifications", "legal_regulatory", "ai_specific"],
  category_summary: [],
  duplicates_dropped: 0,
  error: null,
  started_at: "2026-10-10T09:00:00.000Z",
  finished_at: "2026-10-10T09:01:00.000Z",
  created_at: "2026-10-10T08:59:00.000Z",
  ...overrides,
});

/** One category with each of the four outcomes. */
export const FOUR_OUTCOMES: CategorySummaryEntry[] = [
  { category: "security_incidents", outcome: "findings", note: "2 potential risks found" },
  {
    category: "certifications",
    outcome: "nothing_found",
    note: "No risks found in the search results",
  },
  { category: "legal_regulatory", outcome: "search_failed", note: "search timed out" },
  {
    category: "ai_specific",
    outcome: "skipped",
    note: "Vendor website is missing or not a valid domain",
  },
];

/** What the model wrote for a category where it proposed nothing: untrusted text. */
export const MODEL_NOTE = "Only marketing pages were indexed.";

export const acceptedRisk = (overrides: Partial<AcceptedVendorRisk> = {}): AcceptedVendorRisk => ({
  id: 77,
  vendor_id: 7,
  order_no: null,
  risk_description: "Customer data was exposed in a breach",
  impact_description: "Personal data of our customers could be exposed",
  likelihood: "Likely",
  risk_severity: "Major",
  action_plan: "Ask the vendor for its incident report",
  action_owner: 4,
  risk_level: "High Risk",
  is_demo: false,
  created_at: "2026-10-10T09:02:00.000Z",
  updated_at: "2026-10-10T09:02:00.000Z",
  ...overrides,
});

/** What the repository throws for a refused call: the status, and the body on the original error. */
export const refusal = (status: number, data?: unknown) =>
  new APIError("refused", status, data === undefined ? undefined : { response: { data } });

/** A promise a test settles when it chooses. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
