/** Fixtures shared by the research findings tests. */

import { APIError } from "../../../../../application/tools/error";
import type {
  AcceptedVendorRisk,
  CategorySummaryEntry,
  CoverageSource,
  CredibilitySource,
  RunCoverage,
  RunProgress,
  VendorResearchRun,
  VendorRiskFinding,
  VrdbSourceId,
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
  rationale: "The vendor confirmed the breach, and customer data was involved.",
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

const KEV_URL =
  "https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search_api_fulltext=CVE-2026-28001";

/** The entry of the CISA catalog the credible finding cites, as the credibility rule saw it. */
export const KEV_RECORD: CredibilitySource = {
  url: KEV_URL,
  category: "official",
  publisher: "kev",
  entry: null,
  reviewed: true,
  reading: "read",
  record: {
    source: "kev",
    match: "strong",
    status: "active",
    source_record_id: "CVE-2026-28001",
    as_of: "2026-10-07",
  },
};

/**
 * The first finding as a run of the vendor risk database stores it: High, because an entry of the
 * CISA catalog lists it, with the server's English line, which the screen does not show.
 */
export const credibleFinding = (overrides: Partial<VendorRiskFinding> = {}): VendorRiskFinding =>
  finding({
    credibility: "high",
    credibility_basis: {
      rule: "official_record",
      registry_version: "2026-10-29.1",
      name_only: false,
      sources: [KEV_RECORD],
    },
    credibility_rationale: "The server's own English line.",
    sources: [
      {
        url: KEV_URL,
        title: "CVE-2026-28001",
        quote: "LarkOS contains a command injection vulnerability in its web console.",
        published_at: "2026-09-02",
        category: "official",
        publisher: "kev",
        record: { source_id: "kev", record_id: 41, status: "active", match_strength: "strong" },
      },
    ],
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
    rationale: "A lapsed certificate is a gap in the audits, not an incident.",
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
  categories: [
    "security_incidents",
    "certifications",
    "legal_regulatory",
    "ai_specific",
    "availability",
    "financial_health",
  ],
  category_summary: [],
  duplicates_dropped: 0,
  searches_used: 0,
  pages_read: 0,
  error: null,
  progress: null,
  started_at: "2026-10-10T09:00:00.000Z",
  finished_at: "2026-10-10T09:01:00.000Z",
  created_at: "2026-10-10T08:59:00.000Z",
  ...overrides,
});

/**
 * One list of the vendor risk database as a run saw it: asked, nothing of the vendor in it, a copy
 * from the morning of the run. Its name and its attribution are the server's, which the screen
 * does not show: it words them from the list's id.
 */
export const listCopy = (
  id: VrdbSourceId,
  overrides: Partial<CoverageSource> = {},
): CoverageSource => ({
  id,
  name: "The server's name",
  attribution: "The server's attribution",
  mode: "mirror",
  checked: true,
  outcome: "none",
  strong: 0,
  weak: 0,
  last_success_at: "2026-10-10T08:00:00.000Z",
  stale: false,
  ...overrides,
});

/** What a run of the vendor risk database checked: the CISA catalog held one record of the vendor. */
export const coverage = (overrides: Partial<RunCoverage> = {}): RunCoverage => ({
  registry_version: "2026-10-29.1",
  sources: [
    listCopy("kev", { outcome: "found", strong: 1 }),
    listCopy("ofac"),
    listCopy("uk_sanctions"),
    listCopy("eu_fsf"),
  ],
  lookups: [
    { id: "nvd", outcome: "found" },
    { id: "sec", outcome: "not_researched" },
    { id: "hibp", outcome: "off" },
    { id: "statuspage", outcome: "failed" },
  ],
  cited: { official: 1, trusted_press: 0, vendor: 0, unverified: 0 },
  ...overrides,
});

/** What each list's terms ask a screen that shows its data to say, in the order of the lists. */
export const ATTRIBUTIONS = [
  "CISA Known Exploited Vulnerabilities catalog (CC0 1.0)",
  "OFAC Specially Designated Nationals list, US Department of the Treasury",
  "UK Sanctions List, FCDO. Contains public sector information licensed under the Open Government Licence v3.0.",
  "EU consolidated list of financial sanctions, © European Union",
];

/** Where a running run is: the third turn read a page about certifications. */
export const progress = (overrides: Partial<RunProgress> = {}): RunProgress => ({
  phase: "researching",
  steps: 3,
  action: "read",
  category: "certifications",
  searchesUsed: 2,
  pagesRead: 1,
  categories: ["security_incidents", "certifications"],
  updatedAt: "2026-10-10T09:00:20.000Z",
  ...overrides,
});

/** One category with each of the four outcomes. */
export const FOUR_OUTCOMES: CategorySummaryEntry[] = [
  { category: "security_incidents", outcome: "findings", note: "2 potential risks found" },
  {
    category: "certifications",
    outcome: "nothing_found",
    note: "No risks found in the sources reviewed",
  },
  { category: "legal_regulatory", outcome: "search_failed", note: "The search was not available" },
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

/**
 * What a test changes "on screen" in the stand-in for the vendor risk form before it clicks Save,
 * on top of the values the form opened with (see `vendorRiskFormStub`). Put it back in `beforeEach`.
 */
export const formEdits: { current: Record<string, unknown> } = { current: {} };
