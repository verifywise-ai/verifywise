import type { EvalCase } from "../types";
import { NOW, finish, page, read, result, search } from "./builders";

const POST =
  "https://medium.com/@datawatcher-example/an-open-database-at-brackenridge-analytics-7c1e2b9d";

/**
 * Worked case 5 of the credibility rule (spec D5.7): a single post on a platform where anyone
 * publishes says that the vendor left a database open, and the run reads it. The source registry
 * holds the platform as unverified, so the label is Low (`unverified`), however clear the post is.
 *
 * If this case fails, a post of a user is taken for the word of a publisher.
 */
export const USER_CONTENT_ONLY: EvalCase = {
  id: "user-content-only",
  title: "A single post of a user says the vendor left a database open",
  reproduces:
    "Worked case 5 of the credibility rule: a breach that only a post of a user reports is no more than unverified.",
  vendor: {
    name: "Brackenridge Analytics",
    website: "brackenridge.example",
    provides: "Marketing analytics",
  },
  now: NOW,
  recording: {
    steps: [
      search("security_incidents", "Brackenridge Analytics data leak", "web"),
      read("security_incidents", POST, "Read the post about the database"),
      finish(),
    ],
    searches: [
      {
        kind: "web",
        query: "Brackenridge Analytics data leak",
        results: [
          result(
            POST,
            "An open database at Brackenridge Analytics",
            "I found an open database that belongs to Brackenridge Analytics, with about 50,000 email addresses in it.",
          ),
        ],
      },
    ],
    pages: [
      {
        url: POST,
        page: page(
          POST,
          "An open database at Brackenridge Analytics",
          "I found an open database that belongs to Brackenridge Analytics. It held the email addresses of about 50,000 people who had signed up to the newsletters of its customers. I wrote to Brackenridge Analytics twice and heard nothing; the database was closed a week later.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "A post says that a database of Brackenridge Analytics was left open with the email addresses of about 50,000 newsletter subscribers of its customers.",
          impact_description:
            "The email addresses of the people on our lists may have been exposed if we send them to the vendor.",
          likelihood: "Possible",
          risk_severity: "Moderate",
          action_plan: "Ask the vendor whether a database was left open and whose data it held.",
          rationale:
            "One post by an unknown author reports it, and the vendor has not confirmed it.",
          evidence: [
            { source_id: "S1", quote: "an open database that belongs to Brackenridge Analytics" },
          ],
        },
      ],
      category_notes: [],
    },
  },
  expected: {
    findings: [
      { category: "security_incidents", anyOf: ["left open", "50,000"], credibility: "low" },
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
