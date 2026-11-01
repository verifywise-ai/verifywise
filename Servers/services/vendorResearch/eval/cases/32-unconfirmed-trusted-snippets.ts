import type { EvalCase } from "../types";
import { NOW, finish, result, search } from "./builders";

const REUTERS =
  "https://www.reuters.com/technology/thistledown-software-help-desk-breach-2026-09-30/";
const BBC = "https://www.bbc.com/news/articles/thistledown-software-help-desk-breach";

/**
 * Worked case 13 of the credibility rule (spec D5.7): two trusted publishers, Reuters and the BBC,
 * report a breach, and the run has nothing but their search results: both sites refuse to serve
 * the page. After the analysis the check of the snippets tries both pages (see verifySnippets.ts)
 * and reads neither, so the finding is kept, marked as resting on snippets, and the High that two
 * trusted publishers would earn is capped at Medium (`capped_unconfirmed`): nobody saw what the
 * pages say.
 *
 * If this case fails, a label of High rests on search results that nobody confirmed, or the cap
 * takes away what two trusted publishers do earn.
 */
export const UNCONFIRMED_TRUSTED_SNIPPETS: EvalCase = {
  id: "unconfirmed-trusted-snippets",
  title: "Two trusted publishers report a breach, and neither page can be read",
  reproduces:
    "Worked case 13 of the credibility rule: search results of trusted publishers that nobody confirmed on a page do not make High.",
  vendor: {
    name: "Thistledown Software",
    website: "thistledown.example",
    provides: "Help desk software",
  },
  now: NOW,
  recording: {
    steps: [search("security_incidents", "Thistledown Software breach", "news"), finish()],
    searches: [
      {
        kind: "news",
        query: "Thistledown Software breach",
        results: [
          result(
            REUTERS,
            "Thistledown Software says hackers read customer help desk tickets",
            "Thistledown Software said hackers had read the help desk tickets of about 600 customers, some of which held passwords.",
            "2026-09-30",
            "Reuters",
          ),
          result(
            BBC,
            "Help desk firm Thistledown Software hit by breach",
            "Thistledown Software has told about 600 customers that attackers read their help desk tickets.",
            "2026-10-01",
            "BBC News",
          ),
        ],
      },
    ],
    pages: [
      { url: REUTERS, failure: "blocked_by_site" },
      { url: BBC, failure: "blocked_by_site" },
    ],
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "Hackers read the help desk tickets of about 600 customers of Thistledown Software in September 2026, and some of the tickets held passwords.",
          impact_description:
            "Passwords and details that our staff wrote into support tickets may have been read.",
          likelihood: "Possible",
          risk_severity: "Major",
          action_plan:
            "Ask the vendor whether our tickets were read, and change any password that was ever sent in a ticket.",
          rationale: "Two independent publishers report the breach.",
          evidence: [
            {
              source_id: "S1",
              quote: "hackers had read the help desk tickets of about 600 customers",
            },
            { source_id: "S2", quote: "attackers read their help desk tickets" },
          ],
        },
      ],
      category_notes: [],
    },
  },
  expected: {
    findings: [
      { category: "security_incidents", anyOf: ["help desk tickets"], credibility: "medium" },
    ],
  },
  targets: {
    minPrecision: 1,
    minRecall: 1,
    maxKept: 1,
    maxIrrelevantSources: 0,
    maxDuplicateSources: 0,
    maxBadUrls: 0,
    // The finding stays, marked: no page of its sources could be read.
    maxSnippetOnlyFindings: 1,
    maxMislabelled: 0,
    maxCitationsRejected: 0,
  },
  gaps: {},
};
