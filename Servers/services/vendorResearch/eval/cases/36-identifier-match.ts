import { ukConnector } from "../../vrdb/connectors/uk";
import type { EvalCase } from "../types";
import { NOW, copies, finish, page, quietNews, rowsOf } from "./builders";

const SITE = "https://pellmarkanalytics.example";

/**
 * What the copy of the UK list held, as the list's own file run through the connector that reads it
 * (see vrdb/connectors/uk.ts): an entity of the vendor's name whose business registration number is
 * the one the vendor's record holds.
 */
const uk = ukConnector.parse({
  bodies: [
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      "<Designations>",
      "  <DateGenerated>09/10/2026</DateGenerated>",
      "  <Designation>",
      "    <LastUpdated>21/07/2026</LastUpdated>",
      "    <DateDesignated>21/07/2026</DateDesignated>",
      "    <UniqueID>RUS3601</UniqueID>",
      "    <Names>",
      "      <Name>",
      "        <Name6>Pellmark Analytics Limited</Name6>",
      "        <NameType>Primary Name</NameType>",
      "      </Name>",
      "    </Names>",
      "    <RegimeName>Russia</RegimeName>",
      "    <IndividualEntityShip>Entity</IndividualEntityShip>",
      "    <EntityDetails>",
      "      <Entity>",
      "        <TypeOfEntities>",
      "          <TypeOfEntity>Limited company</TypeOfEntity>",
      "        </TypeOfEntities>",
      "        <BusinessRegistrationNumbers>",
      "          <BusinessRegistrationNumber>09876543</BusinessRegistrationNumber>",
      "        </BusinessRegistrationNumbers>",
      "      </Entity>",
      "    </EntityDetails>",
      "  </Designation>",
      "</Designations>",
    ].join("\n"),
  ],
  etag: null,
  lastModified: null,
  bytes: 0,
});

/**
 * Worked case 9 of the spec (D5.7) with an identifier (Q1, D4.4): the vendor's record holds its
 * company registration number, and an entity on the UK Sanctions List has the vendor's name and that
 * number. A registration number is unique within its register only, so it ties the entry to the
 * vendor beside the name: the match is strong, and the finding is High, with no note that it may be
 * another company. Without the number the same entry matches by the name alone, Low, with the note
 * (cases.test.ts runs both).
 *
 * If this case fails, the identifiers a person stores on a vendor do not make its entries the
 * vendor's, or a number alone is taken for the vendor.
 */
export const IDENTIFIER_MATCH: EvalCase = {
  id: "identifier-match",
  title: "An entry on the UK list has the vendor's name and registration number",
  reproduces:
    "An entry that a vendor's own registration number ties to it would be shown as a match by name only, and the finding would read as one that may be about another company.",
  vendor: {
    name: "Pellmark Analytics Ltd",
    website: "pellmarkanalytics.example",
    provides: "Supply chain analytics",
    identifiers: { country: "GB", registrationNumber: "09876543" },
  },
  now: NOW,
  gather: true,
  recording: {
    steps: [finish("The code collected the news, the records and the vendor's pages")],
    // A vendor registered in the United Kingdom: its legal news names the ICO, not the FTC
    // (market.ts).
    searches: [
      ...quietNews("Pellmark Analytics").filter((search) => !search.query.endsWith(" FTC")),
      { kind: "news", query: "Pellmark Analytics ICO fine", results: [] },
    ],
    pages: [
      {
        url: `${SITE}/`,
        page: page(
          `${SITE}/`,
          "Pellmark Analytics",
          "Pellmark Analytics forecasts the demand that our purchasing plans for.",
        ),
      },
    ],
    vrdb: { rows: rowsOf("uk_sanctions", uk.records, 3601), states: copies() },
    analysis: {
      findings: [
        {
          category: "legal_regulatory",
          risk_description:
            "Pellmark Analytics Limited, with the vendor's registration number, is designated on the UK Sanctions List under the Russia regime.",
          impact_description:
            "Paying a designated company would break the sanctions law that applies to us.",
          likelihood: "Likely",
          risk_severity: "Major",
          action_plan:
            "Stop payments to the vendor and ask our legal team to confirm the designation against the vendor's registration.",
          rationale: "The entry has the vendor's name and its registration number.",
          evidence: [{ source_id: "S1", quote: "Regime: Russia" }],
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
        anyOf: ["Pellmark Analytics", "sanctions"],
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
