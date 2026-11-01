import type { EvalCase } from "../types";
import { NOW, finish, page, result } from "./builders";

const SITE = "https://tessellate-billing.example";
const LAYOFFS = "https://www.ledgerwire.example/tessellate-billing-cuts-40-percent-of-staff";
const SALE = "https://www.fintechbrief.example/tessellate-billing-explores-a-sale";

/**
 * A vendor of subscription billing software whose finances are in trouble: it laid off two in five
 * of its people, and a second publisher reports that a funding round fell through and that the
 * company is looking for a buyer. Nothing in security, the law or the service is wrong, so before
 * the category `financial_health` existed no search looked for this, and the register showed a
 * vendor whose continuity was at risk as a clean one. The code makes the three searches about the
 * finances (`<name> layoffs`, `bankruptcy` and `acquisition`) with the others, reads the best
 * articles, and the model raises one finding in the category: a possible risk to the continuity of
 * the service, on two publishers that are not credible by themselves.
 *
 * Under the credibility rule both publishers are unknown to the registry, so the label is Low (spec
 * D5.6 #4).
 *
 * If this case fails, the finances are no longer searched, the category is lost on the way to the
 * evidence or the validation, or a finding about a vendor in trouble is raised with a label that
 * two ordinary articles do not support.
 */
export const FINANCIAL_HEALTH_LAYOFFS_AND_SALE: EvalCase = {
  id: "financial-health-layoffs-and-sale",
  title: "The vendor laid off two in five of its people and is looking for a buyer",
  reproduces:
    "A vendor that laid off a large part of its staff and was for sale was shown as a clean record, since no search looked at its finances.",
  vendor: {
    name: "Tessellate Billing, Inc.",
    website: "tessellate-billing.example",
    provides: "Subscription billing software",
  },
  now: NOW,
  gather: true,
  recording: {
    steps: [finish("The code collected the news and the vendor's pages")],
    searches: [
      { kind: "news", query: "Tessellate Billing data breach", results: [] },
      { kind: "news", query: "Tessellate Billing security incident", results: [] },
      { kind: "news", query: "Tessellate Billing lawsuit", results: [] },
      { kind: "news", query: "Tessellate Billing fined", results: [] },
      { kind: "news", query: "Tessellate Billing FTC", results: [] },
      { kind: "news", query: "Tessellate Billing settlement", results: [] },
      { kind: "news", query: "Tessellate Billing outage", results: [] },
      {
        kind: "news",
        query: "Tessellate Billing layoffs",
        results: [
          result(
            LAYOFFS,
            "Tessellate Billing cuts 40% of its staff and pauses new features",
            "Tessellate Billing laid off about 40% of its 310 employees this week, the company confirmed.",
            "2026-09-18",
            "Ledgerwire",
          ),
        ],
      },
      { kind: "news", query: "Tessellate Billing bankruptcy", results: [] },
      {
        kind: "news",
        query: "Tessellate Billing acquisition",
        results: [
          result(
            SALE,
            "Tessellate Billing explores a sale after its funding round fell through",
            "Tessellate Billing is looking for a buyer after a funding round that was meant to last until 2028 fell through.",
            "2026-09-29",
            "FinTech Brief",
          ),
        ],
      },
    ],
    pages: [
      {
        url: `${SITE}/`,
        page: page(
          `${SITE}/`,
          "Tessellate Billing",
          "Tessellate Billing sells subscription billing software to software companies.",
        ),
      },
      {
        url: LAYOFFS,
        page: page(
          LAYOFFS,
          "Tessellate Billing cuts 40% of its staff and pauses new features",
          "Tessellate Billing laid off about 40% of its 310 employees this week, the company confirmed. The cuts fall mostly on engineering and customer support, and the company has paused work on new features while it reviews its costs.",
        ),
      },
      {
        url: SALE,
        page: page(
          SALE,
          "Tessellate Billing explores a sale after its funding round fell through",
          "Tessellate Billing is looking for a buyer after a funding round that was meant to last until 2028 fell through, two people familiar with the matter said. The company has hired an adviser to approach larger billing vendors.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "financial_health",
          risk_description:
            "Tessellate Billing laid off about 40% of its staff in September 2026 and is looking for a buyer after a funding round fell through.",
          impact_description:
            "Support and development of the billing software we rely on may slow or stop, and a sale could change its price, its terms or its availability.",
          likelihood: "Possible",
          risk_severity: "Major",
          action_plan:
            "Ask the vendor for its continuity plan, check that our contract lets us export our data and end it if the vendor is sold, and find out how we would replace the service.",
          rationale:
            "Two publishers report the layoffs and the search for a buyer, and the company confirmed the layoffs; nobody says that the service is about to stop.",
          evidence: [
            {
              source_id: "S1",
              quote: "Tessellate Billing laid off about 40% of its 310 employees this week",
            },
            {
              source_id: "S2",
              quote:
                "Tessellate Billing is looking for a buyer after a funding round that was meant to last until 2028 fell through",
            },
          ],
        },
      ],
      category_notes: [
        {
          category: "security_incidents",
          note: "The news searches found no breach.",
        },
        {
          category: "availability",
          note: "The news search found no outage.",
        },
      ],
    },
  },
  expected: {
    findings: [{ category: "financial_health", anyOf: ["laid off", "buyer"], credibility: "low" }],
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
    maxMislabelled: 0,
    maxDuplicateClusters: 0,
    maxCitationsRejected: 0,
  },
  gaps: {},
};
