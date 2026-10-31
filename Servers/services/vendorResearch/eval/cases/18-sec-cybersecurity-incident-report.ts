import { hibpUrl } from "../../records/hibp";
import { KEV_URL } from "../../records/kev";
import { nameKeys } from "../../records/match";
import { nvdUrl } from "../../records/nvd";
import {
  incidentFilings,
  item105Text,
  parseSubmissions,
  parseTickers,
  registrantOf,
  secRecord,
  secSubmissionsUrl,
} from "../../records/sec";
import type { RecordsOutcome } from "../../records";
import { buildTarget } from "../../target";
import type { EvalCase } from "../types";
import { NOW, finish, page } from "./builders";

const SITE = "https://marlowcloud.example";

const vendor = { name: "Marlow Cloud Services, Inc.", website: "marlowcloud.example" };
const target = buildTarget({
  vendor_name: vendor.name,
  website: vendor.website,
  vendor_provides: "Hosted backup and file sharing",
});

/**
 * What the SEC held for the vendor, as its own documents, run through the code that reads them
 * (see records/sec.ts), so that the text of a record is the one a run gets. The list of registrants
 * holds another company whose name begins with the vendor's; it is not the vendor.
 */
const registrants = parseTickers({
  "0": { cik_str: 1999001, ticker: "MRLW", title: "Marlow Cloud Services, Inc." },
  "1": { cik_str: 1999002, ticker: "MRLS", title: "Marlow Staffing Group" },
});
const registrant = registrantOf(registrants, nameKeys({ ...target, domain: null }));

const submissions = parseSubmissions({
  cik: registrant?.cik,
  name: registrant?.title,
  filings: {
    recent: {
      accessionNumber: ["0001999001-26-000007", "0001999001-26-000004", "0001999001-26-000002"],
      filingDate: ["2026-09-18", "2026-08-05", "2026-05-12"],
      form: ["8-K", "8-K", "10-Q"],
      items: ["1.05,9.01", "2.02,9.01", ""],
      primaryDocument: ["marlow-20260918.htm", "marlow-20260805.htm", "marlow-20260512.htm"],
    },
  },
});

/** The main document of the 8-K, as the page reader gives it. */
const FILING =
  "UNITED STATES SECURITIES AND EXCHANGE COMMISSION Washington, D.C. FORM 8-K CURRENT REPORT " +
  "Pursuant to Section 13 or 15(d) of the Securities Exchange Act of 1934. Date of Report: September 18, 2026. " +
  "Marlow Cloud Services, Inc. Item 1.05 Material Cybersecurity Incidents. On September 14, 2026, Marlow Cloud " +
  "Services, Inc. (the Company) detected that an unauthorized third party had obtained access to a part of the " +
  "environment in which it hosts customer backups. The Company took the affected systems offline, activated its " +
  "incident response plan and engaged outside forensic advisers. The Company has not yet determined whether the " +
  "incident has had or is reasonably likely to have a material impact on its financial condition or results of " +
  "operations. Item 9.01 Financial Statements and Exhibits. SIGNATURE Pursuant to the requirements of the " +
  "Securities Exchange Act of 1934, the registrant has duly caused this report to be signed on its behalf.";

const NOW_DATE = new Date(NOW);
const filed =
  submissions === null
    ? { filings: [], omitted: {} }
    : incidentFilings(submissions, { cutoff: "2024-10-10" });
const sec = {
  records:
    submissions === null
      ? []
      : filed.filings.map((filing) => secRecord(submissions, filing, item105Text(FILING))),
  omitted: filed.omitted,
};

const records: RecordsOutcome[] = [
  { source: "kev", url: KEV_URL, outcome: "empty", records: [], omitted: {}, ms: 190 },
  {
    source: "nvd",
    url: nvdUrl("marlowcloud", NOW_DATE, "2024-10-10"),
    outcome: "empty",
    records: [],
    omitted: {},
    ms: 870,
  },
  {
    source: "hibp",
    url: hibpUrl("marlowcloud.example"),
    outcome: "empty",
    records: [],
    omitted: {},
    ms: 150,
  },
  {
    source: "sec",
    url: secSubmissionsUrl(registrant?.cik ?? ""),
    outcome: "ok",
    ...sec,
    ms: 340,
  },
];

/**
 * A listed company that told its investors, in a Form 8-K, that an unauthorized party had got into
 * the environment in which it hosts customer backups. The news search has nothing: no article
 * mentions the report. The filing is in the public database of the SEC, and the code looks it up by
 * the name of the vendor and reads Item 1.05, where the company describes the incident in its own
 * words. The record is a source that was read, so the finding that cites it is no finding on a
 * snippet.
 *
 * Under the credibility rule the label is Low, with the note that the record matched by name only:
 * the SEC finds a registrant by its name, which may be another company's, so the filing supports no
 * more than Low (spec D5.6 #13).
 *
 * If this case fails, the filings of the SEC are no longer looked up or their text no longer
 * reaches the evidence, the filing of a company with a similar name is let in, or a filing is
 * counted as a snippet.
 */
export const SEC_CYBERSECURITY_INCIDENT_REPORT: EvalCase = {
  id: "sec-cybersecurity-incident-report",
  title: "The vendor reported the incident to the SEC and the news has nothing",
  reproduces:
    "A company had told its investors in a filing with the SEC that it had a material cybersecurity incident, and the run reported a clean record because no article mentioned it.",
  vendor: {
    name: vendor.name,
    website: vendor.website,
    provides: "Hosted backup and file sharing",
  },
  now: NOW,
  gather: true,
  recording: {
    steps: [finish("The code collected the news, the records and the vendor's pages")],
    searches: [
      { kind: "news", query: "Marlow Cloud Services data breach", results: [] },
      { kind: "news", query: "Marlow Cloud Services security incident", results: [] },
      { kind: "news", query: "Marlow Cloud Services lawsuit", results: [] },
      { kind: "news", query: "Marlow Cloud Services fined", results: [] },
      { kind: "news", query: "Marlow Cloud Services FTC", results: [] },
      { kind: "news", query: "Marlow Cloud Services settlement", results: [] },
      { kind: "news", query: "Marlow Cloud Services outage", results: [] },
      { kind: "news", query: "Marlow Cloud Services layoffs", results: [] },
      { kind: "news", query: "Marlow Cloud Services bankruptcy", results: [] },
      { kind: "news", query: "Marlow Cloud Services acquisition", results: [] },
    ],
    pages: [
      {
        url: `${SITE}/`,
        page: page(
          `${SITE}/`,
          "Marlow Cloud Services",
          "Marlow Cloud Services hosts backups and shared files for mid-sized companies.",
        ),
      },
    ],
    records,
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "In a Form 8-K filed on 18 September 2026 the vendor reported to the SEC a material cybersecurity incident: an unauthorized third party had obtained access to part of the environment in which it hosts customer backups.",
          impact_description:
            "Backups of ours that the vendor hosts may have been exposed, and the vendor has not said whether customer data was taken.",
          likelihood: "Likely",
          risk_severity: "Major",
          action_plan:
            "Ask the vendor in writing whether our backups were in the affected environment, what data was accessed and when it will report its findings, and check what we can restore without its systems.",
          confidence: "medium",
          rationale:
            "The vendor itself filed the report with a regulator, but the filing says the scope of the incident is not yet determined.",
          evidence: [
            {
              source_id: "S1",
              quote:
                "an unauthorized third party had obtained access to a part of the environment in which it hosts customer backups",
            },
          ],
        },
      ],
      category_notes: [
        {
          category: "certifications",
          note: "The vendor's website was not searched for certifications in this case.",
        },
        {
          category: "legal_regulatory",
          note: "The news search found no fine or lawsuit.",
        },
      ],
    },
  },
  expected: {
    findings: [
      {
        category: "security_incidents",
        anyOf: ["Form 8-K", "unauthorized third party"],
        credibility: "low",
        nameOnly: true,
      },
    ],
  },
  targets: {
    minPrecision: 1,
    minRecall: 1,
    maxKept: 1,
    maxIrrelevantSources: 0,
    maxDuplicateSources: 0,
    maxBadUrls: 0,
    maxDatedWebResults: 0,
    maxSnippetOnlyFindings: 0,
    maxOverconfident: 0,
    maxMislabelled: 0,
    maxDuplicateClusters: 0,
    maxCitationsRejected: 0,
  },
  gaps: {},
};
