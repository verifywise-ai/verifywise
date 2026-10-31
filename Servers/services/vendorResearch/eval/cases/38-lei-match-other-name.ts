import { euConnector } from "../../vrdb/connectors/eu";
import type { EvalCase } from "../types";
import { NOW, copies, finish, page, quietNews, rowsOf } from "./builders";

const SITE = "https://corvanelogistics.example";

/** A made-up LEI: 18 characters that name no real entity, and the check digits ISO 17442 gives them. */
const LEI = "TEST00CORVANELOG0151";

/**
 * What the copy of the EU list held, as the list's own file run through the connector that reads it
 * (see vrdb/connectors/eu.ts): an enterprise under a name the vendor's record does not carry, whose
 * identification number is the vendor's LEI.
 */
const eu = euConnector.parse({
  bodies: [
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<export xmlns="http://eu.europa.ec/fpi/fsd/export" generationDate="2026-10-09T15:10:13.000+02:00" globalFileId="9038">',
      '  <sanctionEntity logicalId="3801" euReferenceNumber="EU.3801.38" designationDate="2026-03-12">',
      '    <regulation programme="RUS" />',
      '    <subjectType code="enterprise" classificationCode="E" />',
      '    <nameAlias wholeName="Ostmark Freight Holding" />',
      `    <identification number="${LEI}" identificationTypeCode="other" />`,
      "  </sanctionEntity>",
      "</export>",
    ].join("\n"),
  ],
  etag: null,
  lastModified: null,
  bytes: 0,
});

/**
 * Worked case 9 of the spec (D5.7) with an LEI (Q1, D4.4): the vendor's record holds its LEI, and an
 * enterprise on the EU list carries that LEI under a name the record does not hold, such as a former
 * or a holding name. An LEI names one legal entity, so it ties the entry to the vendor on its own:
 * the match is strong, the entry's text shows the number, and the finding that cites it is High.
 * Without the LEI the entry matches nothing and is not offered (cases.test.ts runs both).
 *
 * If this case fails, an entry that only the vendor's LEI found is offered but its citations are
 * refused as not about the vendor, and the run says the list found a match while it shows no
 * finding.
 */
export const LEI_MATCH_OTHER_NAME: EvalCase = {
  id: "lei-match-other-name",
  title: "An entry on the EU list carries the vendor's LEI under another name",
  reproduces:
    "An entry found by the vendor's LEI alone would be offered, and the finding that cites it would be dropped because the entry does not name the vendor.",
  vendor: {
    name: "Corvane Logistics",
    website: "corvanelogistics.example",
    provides: "Warehouse management",
    identifiers: { lei: LEI },
  },
  now: NOW,
  gather: true,
  recording: {
    steps: [finish("The code collected the news, the records and the vendor's pages")],
    searches: quietNews("Corvane Logistics"),
    pages: [
      {
        url: `${SITE}/`,
        page: page(
          `${SITE}/`,
          "Corvane Logistics",
          "Corvane Logistics runs the warehouses that our orders ship from.",
        ),
      },
    ],
    vrdb: { rows: rowsOf("eu_fsf", eu.records, 3801), states: copies() },
    analysis: {
      findings: [
        {
          category: "legal_regulatory",
          risk_description:
            "Ostmark Freight Holding, which carries the vendor's LEI, is on the EU consolidated list of financial sanctions under the RUS programme.",
          impact_description:
            "Paying a sanctioned company would break the sanctions law that applies to us.",
          likelihood: "Likely",
          risk_severity: "Major",
          action_plan:
            "Stop payments to the vendor and ask our legal team to confirm the designation against the vendor's LEI.",
          confidence: "high",
          rationale: "The entry carries the vendor's LEI.",
          evidence: [{ source_id: "S1", quote: `Identification number: ${LEI}` }],
        },
      ],
      category_notes: [
        {
          category: "security_incidents",
          note: "The news search found no incident.",
        },
      ],
    },
  },
  expected: {
    findings: [
      {
        category: "legal_regulatory",
        anyOf: ["LEI", "sanctions"],
        credibility: "high",
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
