import type { EvalCase } from "../types";
import { NOW, finish, page, read, result, search } from "./builders";

const REPORT = "https://www.dailyfinance.example.com/kestrel-hr-fine";
const OTHER = "https://www.hrweekly.com/kestrel-hr-regulator";

/**
 * The model never reads the article: its finding quotes the short text the search engine showed.
 * The page would say more, or less, and nobody has looked, until the analysis is over: then the
 * page of the best source of the finding is read (see verifySnippets.ts), and it holds the quote,
 * so the finding is kept as it was. (The finding whose page does not hold the quote is the case
 * `quote-not-on-the-page`.)
 *
 * Under the credibility rule both publishers are unknown to the registry, so the label is Low (spec
 * D5.6 #4).
 */
export const SNIPPET_ONLY_QUOTES: EvalCase = {
  id: "snippet-only-quotes",
  title: "A finding that rests on a snippet",
  reproduces: "11 of 15 quotes come from snippets of about 200 characters.",
  vendor: {
    name: "Kestrel HR",
    website: "kestrelhr.com",
    provides: "Recruiting software",
  },
  now: NOW,
  recording: {
    steps: [
      search("security_incidents", "Kestrel HR data breach", "news"),
      search("legal_regulatory", "Kestrel HR fine", "news"),
      read("certifications", "https://kestrelhr.com/security"),
      read("ai_specific", "https://kestrelhr.com/privacy"),
      finish(),
    ],
    searches: [
      { kind: "news", query: "Kestrel HR data breach", results: [] },
      {
        kind: "news",
        query: "Kestrel HR fine",
        results: [
          result(
            REPORT,
            "Kestrel HR fined over candidate data",
            "A regulator fined Kestrel HR 200,000 euros for keeping the data of rejected candidates longer than it told them.",
            "2026-05-02",
            "Daily Finance",
          ),
          result(
            OTHER,
            "Kestrel HR and the regulator",
            "Kestrel HR said it would appeal the decision.",
            "2026-05-03",
            "HR Weekly",
          ),
        ],
      },
    ],
    pages: [
      {
        url: REPORT,
        page: page(
          REPORT,
          "Kestrel HR fined over candidate data",
          "A regulator fined Kestrel HR 200,000 euros for keeping the data of rejected candidates longer than it told them. The fine was reduced to 50,000 euros on appeal in July.",
        ),
      },
      {
        url: "https://kestrelhr.com/security",
        page: page(
          "https://kestrelhr.com/security",
          "Security",
          "Kestrel HR has an ISO 27001 certificate.",
        ),
      },
      {
        url: "https://kestrelhr.com/privacy",
        page: page(
          "https://kestrelhr.com/privacy",
          "Privacy",
          "We never train models on candidate data.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "legal_regulatory",
          risk_description:
            "A regulator fined Kestrel HR 200,000 euros for keeping candidate data too long.",
          impact_description: "Our candidates' data may be kept longer than we promised them.",
          likelihood: "Possible",
          risk_severity: "Moderate",
          action_plan:
            "Ask the vendor for its retention periods and compare them with our notices.",
          rationale: "The lawsuit is reported by one source and its effect on us is limited.",
          evidence: [
            {
              source_id: "S2",
              quote:
                "fined Kestrel HR 200,000 euros for keeping the data of rejected candidates longer",
            },
            { source_id: "S3", quote: "said it would appeal the decision" },
          ],
        },
      ],
      category_notes: [],
    },
  },
  expected: {
    findings: [
      { category: "legal_regulatory", anyOf: ["fined", "candidate data"], credibility: "low" },
    ],
  },
  targets: {
    minPrecision: 1,
    minRecall: 1,
    maxKept: 1,
    maxSnippetOnlyFindings: 0,
    maxMislabelled: 0,
  },
  gaps: {},
};
