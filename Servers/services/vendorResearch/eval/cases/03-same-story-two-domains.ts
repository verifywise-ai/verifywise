import type { EvalCase } from "../types";
import { NOW, finish, page, read, result, search } from "./builders";

const UK = "https://www.bbc.co.uk/news/technology-harbor-analytics";
const COM = "https://www.bbc.com/news/technology-harbor-analytics";

/**
 * One story, on the British and on the international site of one broadcaster. The two are two
 * hostnames but one publisher, so a finding that cites both must not get a High label.
 */
export const SAME_STORY_TWO_DOMAINS: EvalCase = {
  id: "same-story-two-domains",
  title: "One story on two domains of one publisher",
  reproduces: "The same BBC story on bbc.co.uk and bbc.com counted as two hostnames and gave high.",
  vendor: {
    name: "Harbor Analytics",
    website: "harboranalytics.com",
    provides: "Customer analytics platform",
  },
  now: NOW,
  recording: {
    steps: [
      search("security_incidents", "Harbor Analytics data breach", "news"),
      search("legal_regulatory", "Harbor Analytics lawsuit fine", "news"),
      read("certifications", "https://harboranalytics.com/security"),
      read("ai_specific", "https://harboranalytics.com/legal"),
      finish(),
    ],
    searches: [
      {
        kind: "news",
        query: "Harbor Analytics data breach",
        results: [
          result(
            UK,
            "Harbor Analytics hit by cyber-attack",
            "Harbor Analytics said hackers stole customer contact lists from a marketing database last month.",
            "2026-09-12",
            "BBC News",
          ),
          result(
            COM,
            "Harbor Analytics cyber-attack: what we know",
            "The company told its customers on Tuesday that the stolen contact lists included email addresses and company names.",
            "2026-09-12",
            "BBC News",
          ),
        ],
      },
      { kind: "news", query: "Harbor Analytics lawsuit fine", results: [] },
    ],
    pages: [
      {
        url: "https://harboranalytics.com/security",
        page: page(
          "https://harboranalytics.com/security",
          "Security",
          "Harbor Analytics is audited every year against SOC 2 Type II.",
        ),
      },
      {
        url: "https://harboranalytics.com/legal",
        page: page(
          "https://harboranalytics.com/legal",
          "Legal",
          "We never use customer data to train models.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "Hackers stole customer contact lists from a Harbor Analytics marketing database in September 2026.",
          impact_description:
            "Email addresses and company names of our contacts could be used for phishing if the vendor holds them.",
          likelihood: "Possible",
          risk_severity: "Moderate",
          action_plan: "Ask the vendor which of our contacts were in the stolen lists.",
          rationale: "Contact lists were stolen, so the exposure is limited to contact data.",
          evidence: [
            {
              source_id: "S1",
              quote: "hackers stole customer contact lists from a marketing database",
            },
            {
              source_id: "S2",
              quote: "the stolen contact lists included email addresses and company names",
            },
          ],
        },
      ],
      category_notes: [],
    },
  },
  expected: {
    findings: [{ category: "security_incidents", anyOf: ["contact lists"], credibility: "medium" }],
  },
  targets: {
    minPrecision: 1,
    minRecall: 1,
    maxKept: 1,
    maxDuplicateSources: 0,
    maxMislabelled: 0,
  },
  gaps: {},
};
