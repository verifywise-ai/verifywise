import { pageParts, selectExcerpt } from "../../../webResearch/pageText";
import type { EvalCase } from "../types";
import { NOW, finish, page, read, readPart } from "./builders";

const POLICY = "https://larkspurdocs.com/legal/privacy";

const CLAUSE =
  "We may use customer content to train and improve our own machine learning models, and customers cannot opt out of this use.";

const section = (n: number) =>
  `Section ${n}. Larkspur Docs describes how the service is run, how accounts are kept and how people can reach the company. `
    .repeat(12)
    .trim();

/**
 * A privacy policy of about 30,000 characters. The clause that matters is in section 15, past the
 * 8,000 characters that a first read shows.
 */
export const POLICY_TEXT = [
  ...Array.from({ length: 14 }, (_, n) => section(n + 1)),
  `Section 15. Use of content. ${CLAUSE}`,
  ...Array.from({ length: 10 }, (_, n) => section(n + 16)),
].join("\n\n");

/** The number of the part of the policy that holds the clause. */
export const CLAUSE_PART = pageParts(POLICY_TEXT).findIndex((part) => part.includes(CLAUSE)) + 1;

/**
 * The model reads the vendor's privacy policy and sees its first 8,000 characters, which say
 * nothing about training. The page has more parts (the result says how many), so the model asks
 * for the part that holds section 15 and quotes the clause from it. The part is taken from the page
 * the run already holds, so no second request is made, and the part is kept in the evidence behind
 * the first excerpt: the quote is found there, and the finding stands.
 *
 * Under the credibility rule the label is High: the clause is on the vendor's own privacy policy,
 * which is the vendor's statement of what binds it (rule V), and the model's own low no longer
 * counts (spec D5.6 #1).
 *
 * If this case fails, a clause in the second half of a long page can never be cited: the model is
 * shown text that the evidence does not hold, or is not shown it at all.
 */
export const LONG_POLICY_PART: EvalCase = {
  id: "long-policy-part",
  title: "The clause is in a later part of a long policy",
  reproduces:
    "A long page was shown up to its first 8,000 characters and the rest could not be read, so a clause deep in a privacy policy or a data processing agreement was never seen.",
  vendor: {
    name: "Larkspur Docs",
    website: "larkspurdocs.com",
    provides: "Document collaboration",
  },
  now: NOW,
  recording: {
    steps: [
      read("ai_specific", POLICY, "Read the privacy policy"),
      readPart("ai_specific", POLICY, CLAUSE_PART, "The first part says nothing about training"),
      finish(),
    ],
    searches: [],
    pages: [{ url: POLICY, page: page(POLICY, "Larkspur Docs privacy policy", POLICY_TEXT) }],
    analysis: {
      findings: [
        {
          category: "ai_specific",
          risk_description:
            "The vendor may use customer content to train its own machine learning models, and customers cannot opt out.",
          impact_description:
            "What we store with the vendor could shape models that other customers use.",
          likelihood: "Likely",
          risk_severity: "Major",
          action_plan: "Ask the vendor for an opt-out, or a contract term that forbids the use.",
          confidence: "low",
          rationale: "The vendor's own privacy policy says so; no other source was read.",
          evidence: [
            {
              source_id: "S1",
              quote:
                "We may use customer content to train and improve our own machine learning models",
            },
          ],
        },
      ],
      category_notes: [],
    },
  },
  expected: {
    findings: [
      { category: "ai_specific", anyOf: ["train", "machine learning"], credibility: "high" },
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

// The case is only a test of the parts when the first view does not show the clause.
if (selectExcerpt(POLICY_TEXT).excerpt.includes(CLAUSE) || CLAUSE_PART < 2) {
  throw new Error("the policy of the case must hold its clause beyond the first excerpt");
}
