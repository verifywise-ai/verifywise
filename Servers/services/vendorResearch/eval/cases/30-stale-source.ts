import { kevConnector } from "../../vrdb/connectors/kev";
import type { EvalCase } from "../types";
import { NOW, copies, finish, page, quietNews, rowsOf } from "./builders";

const SITE = "https://tamsinrobotics.example";

/** The catalog's own file, run through the connector that reads it (vrdb/connectors/kev.ts). */
const catalog = kevConnector.parse({
  bodies: [
    JSON.stringify({
      catalogVersion: "2026.10.07",
      vulnerabilities: [
        {
          cveID: "CVE-2026-30001",
          vendorProject: "Tamsin Robotics",
          product: "TamsinOS",
          vulnerabilityName: "Tamsin Robotics TamsinOS Missing Authentication Vulnerability",
          dateAdded: "2026-09-15",
          shortDescription:
            "TamsinOS contains a missing authentication vulnerability in its fleet API that allows a remote attacker to send commands to the robots.",
          requiredAction:
            "Apply mitigations per vendor instructions or discontinue use of the product if mitigations are unavailable.",
          dueDate: "2026-10-06",
          knownRansomwareCampaignUse: "Unknown",
        },
      ],
    }),
  ],
  etag: null,
  lastModified: null,
  bytes: 0,
});

/**
 * Worked case 12 of the spec (D5.7): a list whose copy is out of date. The syncs of the CISA
 * catalog and of the OFAC list have failed for three days, so both copies are older than the 48
 * hours after which a copy is stale (vrdb/sources.ts); the catalog's copy still holds the entry of
 * Tamsin Robotics' fleet software.
 *
 * The label stays: the record is offered and the finding is High, as the record is official and
 * names the vendor's product, and the line says the day of the copy and that it is not up to date.
 * The coverage of the run lists both lists as out of date, the OFAC list too, which found nothing.
 *
 * If this case fails, a stale copy is dropped or lowers the label, or the run stops saying that it
 * is out of date.
 */
export const STALE_SOURCE: EvalCase = {
  id: "stale-source",
  title: "The copy of the catalog is three days old and still lists the flaw",
  reproduces:
    "A run would either drop what an out-of-date copy holds or use it without saying how old it is.",
  vendor: {
    name: "Tamsin Robotics",
    website: "tamsinrobotics.example",
    provides: "Warehouse robots",
  },
  now: NOW,
  gather: true,
  recording: {
    steps: [finish("The code collected the news, the records and the vendor's pages")],
    searches: quietNews("Tamsin Robotics"),
    pages: [
      {
        url: `${SITE}/`,
        page: page(
          `${SITE}/`,
          "Tamsin Robotics",
          "Tamsin Robotics makes the robots that pick orders in our warehouses.",
        ),
      },
    ],
    vrdb: {
      rows: rowsOf("kev", catalog.records, 3001),
      states: copies({
        kev: { lastSuccessAt: new Date("2026-10-07T09:23:00Z"), lastOutcome: "failed" },
        ofac: { lastSuccessAt: new Date("2026-10-07T09:41:00Z"), lastOutcome: "failed" },
      }),
    },
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "CISA lists a missing authentication flaw in the fleet API of TamsinOS, the software of the vendor's robots, as exploited.",
          impact_description:
            "An attacker who reaches the fleet API can send commands to the robots in our warehouses.",
          likelihood: "Likely",
          risk_severity: "Major",
          action_plan:
            "Ask the vendor whether our fleet runs a fixed TamsinOS, and keep the fleet API off the internet until it does.",
          rationale:
            "The catalog lists only flaws that are exploited, and the flaw is in the software our robots run.",
          evidence: [
            {
              source_id: "S1",
              quote: "TamsinOS contains a missing authentication vulnerability in its fleet API",
            },
          ],
        },
      ],
      category_notes: [
        {
          category: "legal_regulatory",
          note: "The news search found no fine or lawsuit.",
        },
      ],
    },
  },
  expected: {
    findings: [
      {
        category: "security_incidents",
        anyOf: ["TamsinOS", "fleet API"],
        credibility: "high",
      },
    ],
    coverage: { stale: ["kev", "ofac"] },
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
