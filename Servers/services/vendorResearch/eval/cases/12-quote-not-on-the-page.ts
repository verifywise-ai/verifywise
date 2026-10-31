import type { EvalCase } from "../types";
import { NOW, finish, page, result, search } from "./builders";

const REPORT = "https://www.paymentsdaily.example/heron-pay-fine";
const REPEAT = "https://www.fintechbrief.example/heron-pay-regulator";

/**
 * The finding quotes two snippets, and the page of its best source does not say what its snippet
 * did: the engine's summary of the page joins words of two paragraphs into a fine, and the page
 * tells that the regulator has only opened an investigation. The second publisher repeats the
 * summary, so the evidence looks like two sources and supports a medium confidence.
 *
 * After the analysis the page of the best source is read (see verifySnippets.ts). It does not hold
 * the quote, so the finding is kept, marked as snippet only, with its confidence lowered to low:
 * the person who reads it is told that nobody confirmed it on a page. (A finding whose page holds
 * the quote is the case of the snippets, `snippet-only-quotes`.)
 *
 * If this case fails, a finding that the page contradicts is shown as if the page backed it.
 */
export const QUOTE_NOT_ON_THE_PAGE: EvalCase = {
  id: "quote-not-on-the-page",
  title: "The page does not say what the snippet said",
  reproduces:
    "A quote that is only in the snippet of a search result can say what the page does not.",
  vendor: {
    name: "Heron Pay",
    website: "heronpay.com",
    provides: "Payment processing",
  },
  now: NOW,
  recording: {
    steps: [search("legal_regulatory", "Heron Pay regulator fine", "news"), finish()],
    searches: [
      {
        kind: "news",
        query: "Heron Pay regulator fine",
        results: [
          result(
            REPORT,
            "Heron Pay and its payment screening",
            "The financial regulator fined Heron Pay 4 million euros over its payment screening.",
            "2026-09-20",
            "Payments Daily",
          ),
          result(
            REPEAT,
            "Regulator and Heron Pay",
            "Heron Pay was fined 4 million euros, the regulator said on Tuesday.",
            "2026-09-21",
            "Fintech Brief",
          ),
        ],
      },
    ],
    pages: [
      {
        url: REPORT,
        page: page(
          REPORT,
          "Heron Pay and its payment screening",
          "The financial regulator has opened an investigation into the payment screening of Heron Pay. No fine has been decided, and Heron Pay disputes the findings of the regulator.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "legal_regulatory",
          risk_description:
            "The financial regulator fined Heron Pay 4 million euros over its payment screening.",
          impact_description:
            "Weak screening at the vendor can let payments of ours pass checks that they should fail.",
          likelihood: "Possible",
          risk_severity: "Moderate",
          action_plan: "Ask the vendor what the regulator found and what it has changed.",
          confidence: "medium",
          rationale: "Two publishers report the fine, and the regulator is the source of both.",
          evidence: [
            {
              source_id: "S1",
              quote: "fined Heron Pay 4 million euros over its payment screening",
            },
            { source_id: "S2", quote: "Heron Pay was fined 4 million euros" },
          ],
        },
      ],
      category_notes: [],
    },
  },
  expected: {
    findings: [{ category: "legal_regulatory", anyOf: ["fined", "screening"], credibility: "low" }],
  },
  targets: {
    minPrecision: 1,
    minRecall: 1,
    maxKept: 1,
    maxIrrelevantSources: 0,
    maxDuplicateSources: 0,
    maxBadUrls: 0,
    maxDatedWebResults: 0,
    // The finding stays, marked: it is the one that is still resting on a snippet.
    maxSnippetOnlyFindings: 1,
    maxOverconfident: 0,
    maxMislabelled: 0,
    maxDuplicateClusters: 0,
    maxCitationsRejected: 0,
  },
  gaps: {},
};
