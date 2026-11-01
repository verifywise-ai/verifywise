import { ofacConnector } from "../../vrdb/connectors/ofac";
import type { EvalCase } from "../types";
import { NOW, copies, finish, page, quietNews, rowsOf } from "./builders";

const SITE = "https://harrowgatefreight.example";

/**
 * What the copy of the sanctions list held, as the two files the Treasury publishes (no header
 * row, `-0- ` for a field with nothing in it) run through the connector that reads them (see
 * vrdb/connectors/ofac.ts). The entity was taken off the list after the copy first held it, so the
 * sync marked it delisted.
 */
const row = (id: number, name: string, programs: string, remarks: string): string =>
  [id, `"${name}"`, "-0- ", `"${programs}"`, ...Array(7).fill("-0- "), remarks].join(",");
const list = ofacConnector.parse({
  bodies: [
    row(
      29001,
      "HARROWGATE FREIGHT LIMITED",
      "RUSSIA-EO14024",
      '"Organization Established Date 2014; Registration ID 5512345678."',
    ),
    "",
  ],
  etag: null,
  lastModified: null,
  bytes: 0,
});

/**
 * Worked case 11 of the spec (D5.7): a sanctions entry that its list no longer holds. The entity is
 * missing from today's full file, so the sync made it `delisted` on the day it went (vrdb/sync.ts).
 *
 * An entity of the name of Harrowgate Freight was on the OFAC list and was taken off it. A run after
 * that is not offered the record, and the news has nothing, so it reports nothing. While the list
 * held the entry the same run reported it, Low, by name only (cases.test.ts runs both).
 *
 * If this case fails, a designation that was lifted reaches the evidence.
 */
export const DELISTED_SANCTIONS_ENTRY: EvalCase = {
  id: "delisted-sanctions-entry",
  title: "The sanctions list took the entry of the vendor's name off",
  reproduces:
    "A designation that was lifted would still be shown to the model, and a run would report a sanction that no longer stands.",
  vendor: {
    name: "Harrowgate Freight Ltd",
    website: "harrowgatefreight.example",
    provides: "Freight forwarding",
  },
  now: NOW,
  gather: true,
  recording: {
    steps: [finish("The code collected the news, the records and the vendor's pages")],
    searches: quietNews("Harrowgate Freight"),
    pages: [
      {
        url: `${SITE}/`,
        page: page(
          `${SITE}/`,
          "Harrowgate Freight",
          "Harrowgate Freight moves containers between the ports of northern Europe.",
        ),
      },
    ],
    vrdb: { rows: rowsOf("ofac", list.records, 2901, "delisted"), states: copies() },
    // What the model answers when the record is shown to it, as it is while the list holds it.
    analysis: {
      findings: [
        {
          category: "legal_regulatory",
          risk_description:
            "A company named Harrowgate Freight Limited is on the OFAC sanctions list; it may or may not be the vendor.",
          impact_description:
            "Paying a sanctioned company would break the sanctions law that applies to us.",
          likelihood: "Possible",
          risk_severity: "Major",
          action_plan:
            "Check the vendor's registration number, address and owners against the entry before any payment.",
          rationale: "The entry has the vendor's name, and nothing else ties it to the vendor.",
          evidence: [
            {
              source_id: "S1",
              quote: "Organization Established Date 2014; Registration ID 5512345678",
            },
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
  expected: { findings: [] },
  targets: {
    minPrecision: 1,
    minRecall: 1,
    maxKept: 0,
    maxIrrelevantSources: 0,
    maxDuplicateSources: 0,
    maxBadUrls: 0,
    maxSnippetOnlyFindings: 0,
    maxMislabelled: 0,
    maxCitationsRejected: 0,
  },
  gaps: {},
};
