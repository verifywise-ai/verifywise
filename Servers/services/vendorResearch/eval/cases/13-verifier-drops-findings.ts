import type { EvalCase } from "../types";
import { NOW, finish, page, result, search } from "./builders";

const RANSOMWARE = "https://www.hospitalit.example/orchid-analytics-ransomware";
const OUTAGE = "https://www.martechwire.example/orchid-analytics-outage";
const RECALLED = "https://www.retroledger.example/orchid-analytics-2019";
const FINE = "https://www.dataprotectionnews.example/orchid-analytics-fine";

/**
 * Four candidates pass the checks of the code, and three of them are wrong in a way only a reader
 * can tell. Each source names the vendor and each quote is in its source, so the validation lets
 * them through; the verifier (see verifier.ts) reads the claims and the quotes together:
 *
 * - a hospital software maker of the same name was hit by ransomware: the source is about another
 *   company (`same_company`);
 * - the vendor's dashboards were unavailable for a day, and the finding says that data was lost:
 *   the quote does not say it (`quote_supports_claim`);
 * - a story from 2019 with no date in the search result: the matter is older than the window
 *   (`source_in_window`);
 * - the regulator's fine of the vendor is none of these, and stays, confirmed on its page.
 *
 * If this case fails, a finding about another company, an overstated claim or an old matter is
 * stored for a person to read, or the verifier takes away a finding it should have passed.
 */
export const VERIFIER_DROPS_FINDINGS: EvalCase = {
  id: "verifier-drops-findings",
  title: "The verifier takes away what the code could not tell was wrong",
  reproduces:
    "A source that names the vendor can be about another company, a quote can say less than the claim, and a source with no date can be years old.",
  vendor: {
    name: "Orchid Analytics",
    website: "orchidanalytics.com",
    provides: "Marketing analytics",
  },
  now: NOW,
  verifier: true,
  recording: {
    steps: [
      search("security_incidents", "Orchid Analytics data breach", "news"),
      search("legal_regulatory", "Orchid Analytics fined", "news"),
      finish(),
    ],
    searches: [
      {
        kind: "news",
        query: "Orchid Analytics data breach",
        results: [
          result(
            RANSOMWARE,
            "Orchid Analytics hit by ransomware",
            "Orchid Analytics, a hospital software maker in Ohio, said ransomware encrypted its patient scheduling systems.",
            "2026-08-14",
            "Hospital IT",
          ),
          result(
            OUTAGE,
            "Orchid Analytics dashboard outage",
            "Orchid Analytics, the marketing analytics vendor, said that customer dashboards were unavailable for a day.",
            "2026-09-02",
            "MarTech Wire",
          ),
          result(
            RECALLED,
            "Orchid Analytics breach of 2019 recalled",
            "Orchid Analytics customers were told in 2019 that an employee had sent a customer list to a personal mailbox.",
          ),
        ],
      },
      {
        kind: "news",
        query: "Orchid Analytics fined",
        results: [
          result(
            FINE,
            "Irish regulator fines Orchid Analytics",
            "The Irish Data Protection Commission fined Orchid Analytics, the marketing analytics vendor, 300,000 euros for sending customer data to a processor without a contract.",
            "2026-07-08",
            "Data Protection News",
          ),
        ],
      },
    ],
    pages: [
      {
        url: FINE,
        page: page(
          FINE,
          "Irish regulator fines Orchid Analytics",
          "The Irish Data Protection Commission fined Orchid Analytics, the marketing analytics vendor, 300,000 euros for sending customer data to a processor without a contract. The company said it would not appeal.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description: "Ransomware encrypted the patient scheduling systems in August 2026.",
          impact_description: "Backups and records held there may be exposed.",
          likelihood: "Possible",
          risk_severity: "Moderate",
          action_plan: "Ask the vendor whether our records were on those systems.",
          confidence: "medium",
          rationale: "A ransomware attack is reported, and its reach is not stated.",
          evidence: [
            {
              source_id: "S1",
              quote: "ransomware encrypted its patient scheduling systems",
            },
          ],
        },
        {
          category: "security_incidents",
          risk_description:
            "An outage left customer dashboards unavailable and some stored reports lost.",
          impact_description: "Reports that we rely on for audits may not be recoverable.",
          likelihood: "Possible",
          risk_severity: "Moderate",
          action_plan: "Ask the vendor which reports were lost and whether they can be restored.",
          confidence: "medium",
          rationale: "An outage is reported by the trade press.",
          evidence: [{ source_id: "S2", quote: "customer dashboards were unavailable for a day" }],
        },
        {
          category: "security_incidents",
          risk_description: "A staff member mailed a list of clients to a private account.",
          impact_description: "Contact details of our team may have left the vendor.",
          likelihood: "Unlikely",
          risk_severity: "Moderate",
          action_plan: "Ask the vendor how it controls the export of client lists.",
          confidence: "low",
          rationale: "One story reports it.",
          evidence: [
            {
              source_id: "S3",
              quote: "an employee had sent a customer list to a personal mailbox",
            },
          ],
        },
        {
          category: "legal_regulatory",
          risk_description:
            "The Irish regulator fined the vendor 300,000 euros for passing personal data to a processor without a contract.",
          impact_description:
            "Our data may be processed without the safeguards that the law requires.",
          likelihood: "Likely",
          risk_severity: "Moderate",
          action_plan: "Ask the vendor for its processor contracts and what it changed.",
          confidence: "medium",
          rationale: "The decision of the regulator is reported and not appealed.",
          evidence: [
            {
              source_id: "S4",
              quote: "fined Orchid Analytics, the marketing analytics vendor, 300,000 euros",
            },
          ],
        },
      ],
      category_notes: [],
    },
    verifier: {
      verdicts: [
        { finding: 1, same_company: false, quote_supports_claim: true, source_in_window: true },
        { finding: 2, same_company: true, quote_supports_claim: false, source_in_window: true },
        { finding: 3, same_company: true, quote_supports_claim: true, source_in_window: false },
        { finding: 4, same_company: true, quote_supports_claim: true, source_in_window: true },
      ],
    },
  },
  expected: {
    findings: [{ category: "legal_regulatory", anyOf: ["fined", "regulator"], credibility: "low" }],
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
