import type { EvalCase } from "../types";
import { NOW, finish, page, read, result, search } from "./builders";

const POST =
  "https://www.forbes.com/sites/examplecontributor/2026/09/28/ravensworth-data-left-shopper-profiles-open/";

/**
 * Worked case 14 of the credibility rule (spec D5.7): a post under forbes.com/sites/, where
 * contributors publish under the name of the publisher. The source registry holds Forbes as trusted
 * press but downgrades that path (the pages of its staff excepted), so the post is unverified and
 * the label is Low (`unverified`), as it would be anywhere else.
 *
 * If this case fails, a contributor's post takes the credit of the publisher that hosts it.
 */
export const CONTRIBUTOR_PAGE: EvalCase = {
  id: "contributor-page",
  title: "A contributor's post on the site of a trusted publisher reports a breach",
  reproduces:
    "Worked case 14 of the credibility rule: a contributor's post is not the word of the publisher that hosts it.",
  vendor: {
    name: "Ravensworth Data",
    website: "ravensworth.example",
    provides: "Customer data platform",
  },
  now: NOW,
  recording: {
    steps: [
      search("security_incidents", "Ravensworth Data exposed", "news"),
      read("security_incidents", POST, "Read the post about the server"),
      finish(),
    ],
    searches: [
      {
        kind: "news",
        query: "Ravensworth Data exposed",
        results: [
          result(
            POST,
            "Ravensworth Data left shopper profiles open for two weeks",
            "Ravensworth Data left a storage server open for two weeks in September, a researcher says.",
            "2026-09-28",
            "Forbes",
          ),
        ],
      },
    ],
    pages: [
      {
        url: POST,
        page: page(
          POST,
          "Ravensworth Data left shopper profiles open for two weeks",
          "Ravensworth Data, which builds customer profiles for retailers, left a storage server open for two weeks in September, according to a researcher I spoke to. The server held the profiles of about 2 million shoppers. Ravensworth Data did not answer my questions.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "A post says that Ravensworth Data left a storage server with the profiles of about 2 million shoppers open for two weeks in September 2026.",
          impact_description:
            "The profiles of our customers may have been exposed if we send them to the vendor.",
          likelihood: "Possible",
          risk_severity: "Major",
          action_plan: "Ask the vendor whether a server was left open and whose profiles it held.",
          rationale: "One article reports it, and the vendor did not answer.",
          evidence: [
            { source_id: "S1", quote: "left a storage server open for two weeks in September" },
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
        anyOf: ["storage server", "2 million"],
        credibility: "low",
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
