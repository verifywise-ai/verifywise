import type { EvalCase } from "../types";
import { NOW, finish, page, read, result, search } from "./builders";

const PRESS =
  "https://cobaltline.example/press/cobaltline-payments-achieves-iso-27001-certification";

/**
 * Worked case 6 of the credibility rule (spec D5.7): the vendor's own press release says that it
 * holds ISO 27001, and nothing else does. A finding about a certification that cites the vendor's
 * newsroom cites what the vendor claims of itself, and a self-claim is never independent support
 * (rule V), so the label is Low (`self_claim`).
 *
 * If this case fails, a vendor's claim about itself raises the label of a finding.
 */
export const VENDOR_SELF_CLAIM: EvalCase = {
  id: "vendor-self-claim",
  title: "The vendor's own press release is the only source of its certification",
  reproduces:
    "Worked case 6 of the credibility rule: what a vendor claims of itself in its newsroom supports nothing.",
  vendor: {
    name: "Cobaltline Payments",
    website: "cobaltline.example",
    provides: "Payment gateway",
  },
  now: NOW,
  recording: {
    steps: [
      search("certifications", "Cobaltline Payments ISO 27001", "web"),
      read("certifications", PRESS, "Read the vendor's announcement of its certification"),
      finish(),
    ],
    searches: [
      {
        kind: "web",
        query: "Cobaltline Payments ISO 27001",
        results: [
          result(
            PRESS,
            "Cobaltline Payments achieves ISO 27001 certification",
            "Cobaltline Payments announced today that it has achieved ISO 27001 certification for its payment gateway.",
          ),
        ],
      },
    ],
    pages: [
      {
        url: PRESS,
        page: page(
          PRESS,
          "Cobaltline Payments achieves ISO 27001 certification",
          "Cobaltline Payments announced today that it has achieved ISO 27001 certification for its payment gateway. Security has always been at the heart of what we do, the company said. Customers can ask their account manager for more information.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "certifications",
          risk_description:
            "Cobaltline Payments says that it holds ISO 27001 certification, but the only source is its own press release, which names no certification body, no certificate and no scope.",
          impact_description:
            "Our contract assumes certified security controls that we cannot verify from the vendor's own announcement.",
          likelihood: "Possible",
          risk_severity: "Moderate",
          action_plan:
            "Ask the vendor for its ISO 27001 certificate, the scope it covers and the name of the certification body.",
          rationale: "The claim comes from the vendor alone, and nothing independent confirms it.",
          evidence: [
            {
              source_id: "S1",
              quote: "it has achieved ISO 27001 certification for its payment gateway",
            },
          ],
        },
      ],
      category_notes: [],
    },
  },
  expected: {
    findings: [{ category: "certifications", anyOf: ["ISO 27001"], credibility: "low" }],
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
