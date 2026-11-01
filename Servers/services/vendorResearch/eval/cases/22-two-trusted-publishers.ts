import type { EvalCase } from "../types";
import { NOW, finish, page, read, result, search } from "./builders";

const REUTERS =
  "https://www.reuters.com/technology/fenwick-ledger-says-supplier-bank-details-stolen-2026-09-22/";
const BBC = "https://www.bbc.co.uk/news/articles/fenwick-ledger-invoice-archive";

/**
 * Worked case 2 of the credibility rule (spec D5.7): two publishers that the source registry
 * reviewed as trusted press, Reuters and the BBC, report one breach of the vendor, and the run reads
 * both pages. Two independent trusted publishers whose pages were read make the label High
 * (`trusted_press_two`).
 *
 * If this case fails, two trusted publishers no longer count as two, a host of the registry is no
 * longer found, or a page that was read is taken for a snippet.
 */
export const TWO_TRUSTED_PUBLISHERS: EvalCase = {
  id: "two-trusted-publishers",
  title: "Two trusted publishers report one breach, and both pages are read",
  reproduces:
    "Worked case 2 of the credibility rule: a breach that Reuters and the BBC both report is the best evidence the press can give.",
  vendor: {
    name: "Fenwick Ledger",
    website: "fenwickledger.example",
    provides: "Accounts payable automation",
  },
  now: NOW,
  recording: {
    steps: [
      search("security_incidents", "Fenwick Ledger data breach", "news"),
      read("security_incidents", REUTERS, "Read the report of the breach"),
      read("security_incidents", BBC, "Read the second report of the breach"),
      finish(),
    ],
    searches: [
      {
        kind: "news",
        query: "Fenwick Ledger data breach",
        results: [
          result(
            REUTERS,
            "Fenwick Ledger says supplier bank details stolen",
            "Fenwick Ledger said attackers had copied supplier bank details from its invoice archive.",
            "2026-09-22",
            "Reuters",
          ),
          result(
            BBC,
            "Fenwick Ledger: invoice archive breach hits 1,200 firms",
            "The accounts payable firm Fenwick Ledger has told about 1,200 customers that supplier bank details were taken.",
            "2026-09-23",
            "BBC News",
          ),
        ],
      },
    ],
    pages: [
      {
        url: REUTERS,
        page: page(
          REUTERS,
          "Fenwick Ledger says supplier bank details stolen",
          "Fenwick Ledger, a provider of accounts payable software, said on Monday that attackers had copied supplier bank details from its invoice archive. The company said about 1,200 customers were affected and that it had informed the regulators.",
        ),
      },
      {
        url: BBC,
        page: page(
          BBC,
          "Fenwick Ledger: invoice archive breach hits 1,200 firms",
          "The accounts payable firm Fenwick Ledger has told about 1,200 business customers that supplier bank details were taken from its invoice archive. Fenwick Ledger said it had closed the archive and called in investigators.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "Attackers copied supplier bank details from the invoice archive of Fenwick Ledger in September 2026; about 1,200 customers were affected.",
          impact_description:
            "The bank details of our suppliers may have been taken if our invoices are in the vendor's archive, which exposes us to payment fraud.",
          likelihood: "Possible",
          risk_severity: "Major",
          action_plan:
            "Ask the vendor whether our invoices were in the archive, and warn the accounts team about requests to change bank details.",
          rationale:
            "Two independent publishers report the breach, and stolen bank details are a direct route to fraud.",
          evidence: [
            {
              source_id: "S1",
              quote: "attackers had copied supplier bank details from its invoice archive",
            },
            { source_id: "S2", quote: "supplier bank details were taken from its invoice archive" },
          ],
        },
      ],
      category_notes: [],
    },
  },
  expected: {
    findings: [
      {
        category: "security_incidents",
        anyOf: ["supplier bank details", "invoice archive"],
        credibility: "high",
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
    maxSnippetOnlyFindings: 0,
    maxMislabelled: 0,
    maxCitationsRejected: 0,
  },
  gaps: {},
};
