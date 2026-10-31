import { ofacConnector } from "../../vrdb/connectors/ofac";
import { ukConnector } from "../../vrdb/connectors/uk";
import type { EvalCase } from "../types";
import { NOW, copies, finish, page, quietNews, rowsOf } from "./builders";

const SITE = "https://corvanelogistics.example";

/**
 * What the copies of two sanctions lists held, as each list's own file run through the connector
 * that reads it (see vrdb/connectors/): an entity of the vendor's name on the OFAC list, and one of
 * the same name on the UK list, which gives no website, so that both match by the name alone.
 */
const ofac = ofacConnector.parse({
  bodies: [
    [
      31001,
      '"CORVANE LOGISTICS LIMITED"',
      "-0- ",
      '"RUSSIA-EO14024"',
      ...Array(7).fill("-0- "),
      '"Organization Established Date 2017; Registration ID 7712345601."',
    ].join(","),
    "",
  ],
  etag: null,
  lastModified: null,
  bytes: 0,
});
const uk = ukConnector.parse({
  bodies: [
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      "<Designations>",
      "  <DateGenerated>09/10/2026</DateGenerated>",
      "  <Designation>",
      "    <LastUpdated>14/05/2026</LastUpdated>",
      "    <DateDesignated>14/05/2026</DateDesignated>",
      "    <UniqueID>RUS3101</UniqueID>",
      "    <Names>",
      "      <Name>",
      "        <Name6>Corvane Logistics Limited</Name6>",
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
 * Worked case 9 of the spec (D5.7), with the OFAC and the UK entries of one name: an entity named
 * Corvane Logistics Limited is on both lists, and nothing but the name ties either to the vendor.
 *
 * Two lists of one name are no second source about the vendor: the model raises one finding citing
 * both entries, and it is Low, with the note that the entries match the vendor by name only.
 *
 * If this case fails, two name-only matches add up to more than one, or the note is lost.
 */
export const SAME_NAME_ON_TWO_LISTS: EvalCase = {
  id: "same-name-on-two-lists",
  title: "An entity of the vendor's name is on the OFAC list and the UK list",
  reproduces:
    "Two sanctions lists that hold an entity of the vendor's name could read as two sources that confirm each other, though neither shows that the entity is the vendor.",
  vendor: {
    name: "Corvane Logistics Ltd",
    website: "corvanelogistics.example",
    provides: "Logistics software",
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
          "Corvane Logistics makes the software that plans our deliveries.",
        ),
      },
    ],
    vrdb: {
      rows: [...rowsOf("ofac", ofac.records, 3101), ...rowsOf("uk_sanctions", uk.records, 3102)],
      states: copies(),
    },
    analysis: {
      findings: [
        {
          category: "legal_regulatory",
          risk_description:
            "A company named Corvane Logistics Limited is on the OFAC and the UK sanctions lists; it may or may not be the vendor.",
          impact_description:
            "Paying a sanctioned company would break the sanctions laws that apply to us.",
          likelihood: "Possible",
          risk_severity: "Major",
          action_plan:
            "Check the vendor's registration number, address and owners against both entries before any payment.",
          confidence: "low",
          rationale:
            "Both entries have the vendor's name, and nothing else ties them to the vendor.",
          evidence: [
            {
              source_id: "S1",
              quote: "Organization Established Date 2017; Registration ID 7712345601",
            },
            { source_id: "S2", quote: "Date designated: 2026-05-14" },
          ],
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
        anyOf: ["Corvane Logistics", "sanctions"],
        credibility: "low",
        nameOnly: true,
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
