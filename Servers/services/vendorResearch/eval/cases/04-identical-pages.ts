import type { EvalCase } from "../types";
import { NOW, finish, page, read, result, search } from "./builders";

const PLAIN = "https://www.lawwire.com/quanta-billing-class-action";
const TRACKED =
  "https://www.lawwire.com/quanta-billing-class-action?utm_source=newsletter&utm_medium=email";
const SNIPPET =
  "A class action filed in Delaware says Quanta Billing charged small businesses for a premium plan they never ordered, and asks for a refund of about 3 million dollars.";

/**
 * A search that returns one article twice: once as the plain address and once with the tracking
 * parameters of a newsletter. The two have one text and give the evidence two entries.
 */
export const IDENTICAL_PAGES: EvalCase = {
  id: "identical-pages",
  title: "One article under two addresses",
  reproduces: "Two URLs returned identical text and both went into the evidence.",
  vendor: {
    name: "Quanta Billing",
    website: "quantabilling.com",
    provides: "Subscription billing",
  },
  now: NOW,
  recording: {
    steps: [
      search("security_incidents", "Quanta Billing data breach", "news"),
      search("legal_regulatory", "Quanta Billing lawsuit", "news"),
      read("certifications", "https://quantabilling.com/security"),
      read("ai_specific", "https://quantabilling.com/legal"),
      finish(),
    ],
    searches: [
      { kind: "news", query: "Quanta Billing data breach", results: [] },
      {
        kind: "news",
        query: "Quanta Billing lawsuit",
        results: [
          result(
            PLAIN,
            "Quanta Billing sued over unordered upgrades",
            SNIPPET,
            "2026-08-20",
            "Law Wire",
          ),
          result(
            TRACKED,
            "Quanta Billing sued over unordered upgrades",
            SNIPPET,
            "2026-08-20",
            "Law Wire",
          ),
        ],
      },
    ],
    pages: [
      {
        url: "https://quantabilling.com/security",
        page: page(
          "https://quantabilling.com/security",
          "Security",
          "Quanta Billing completed its SOC 2 Type II audit in June.",
        ),
      },
      {
        url: "https://quantabilling.com/legal",
        page: page(
          "https://quantabilling.com/legal",
          "Legal",
          "Customer data is not used to train models.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "legal_regulatory",
          risk_description:
            "A class action in Delaware says Quanta Billing charged small businesses for plans they never ordered.",
          impact_description:
            "A settlement could raise prices, and unordered charges could appear on our own invoices.",
          likelihood: "Possible",
          risk_severity: "Moderate",
          action_plan: "Check our invoices for plan changes we did not order.",
          confidence: "medium",
          rationale: "The case is still open, but its effect on the service we buy is limited.",
          evidence: [
            {
              source_id: "S2",
              quote: "charged small businesses for a premium plan they never ordered",
            },
            { source_id: "S3", quote: "asks for a refund of about 3 million dollars" },
          ],
        },
      ],
      category_notes: [],
    },
  },
  expected: {
    findings: [{ category: "legal_regulatory", anyOf: ["class action"], credibility: "low" }],
  },
  targets: { minPrecision: 1, minRecall: 1, maxKept: 1, maxDuplicateSources: 0, maxMislabelled: 0 },
  gaps: {},
};
