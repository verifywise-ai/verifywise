import { kevConnector } from "../../vrdb/connectors/kev";
import type { EvalCase } from "../types";
import { NOW, copies, finish, page, quietNews, rowsOf } from "./builders";

const SITE = "https://larkspursystems.example";

/**
 * What the copy of the CISA catalog held, as the catalog's own file run through the connector that
 * reads it (see vrdb/connectors/kev.ts), so that the record is the one a sync stores. CISA took the
 * entry out of the catalog after the copy first held it, so the sync marked it withdrawn.
 */
const catalog = kevConnector.parse({
  bodies: [
    JSON.stringify({
      catalogVersion: "2026.10.09",
      vulnerabilities: [
        {
          cveID: "CVE-2026-28001",
          vendorProject: "Larkspur Systems",
          product: "LarkOS",
          vulnerabilityName: "Larkspur Systems LarkOS Command Injection Vulnerability",
          dateAdded: "2026-09-02",
          shortDescription:
            "LarkOS contains a command injection vulnerability in its web console that allows a remote attacker to run commands on the gateway.",
          requiredAction:
            "Apply mitigations per vendor instructions or discontinue use of the product if mitigations are unavailable.",
          dueDate: "2026-09-23",
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
 * Worked case 10 of the spec (D5.7): a CVE that its list no longer stands by. In M1 the copy of the
 * CISA catalog marks an entry the catalog dropped `withdrawn` (vrdb/sync.ts); a CVE that the CVE
 * Program rejects becomes `rejected` with the CVE mirror of M2, and is offered no more than this.
 *
 * The catalog listed a flaw in the firmware of Larkspur Systems' gateways and then took the entry
 * out. A run after that is not offered the record, and the news has nothing, so it reports nothing.
 * While the catalog held the entry the same run reported the flaw, High (cases.test.ts runs both).
 *
 * If this case fails, a record that its list no longer holds reaches the evidence.
 */
export const REJECTED_CVE: EvalCase = {
  id: "rejected-cve",
  title: "The catalog withdrew the entry of the vendor's flaw",
  reproduces:
    "A record that a public list no longer stands by would still be shown to the model, and a run would report a flaw that its own source took back.",
  vendor: {
    name: "Larkspur Systems",
    website: "larkspursystems.example",
    provides: "Industrial IoT gateways",
  },
  now: NOW,
  gather: true,
  recording: {
    steps: [finish("The code collected the news, the records and the vendor's pages")],
    searches: quietNews("Larkspur Systems"),
    pages: [
      {
        url: `${SITE}/`,
        page: page(
          `${SITE}/`,
          "Larkspur Systems",
          "Larkspur Systems builds gateways that connect factory machines to the cloud.",
        ),
      },
    ],
    vrdb: { rows: rowsOf("kev", catalog.records, 2801, "withdrawn"), states: copies() },
    // What the model answers when the record is shown to it, as it is while the catalog holds it.
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "CISA lists a command injection flaw in LarkOS, the firmware of the vendor's gateways, as exploited.",
          impact_description:
            "An attacker who reaches the web console of a gateway of ours that is not updated can run commands on it.",
          likelihood: "Likely",
          risk_severity: "Major",
          action_plan:
            "Find out whether we run LarkOS gateways, apply the vendor's update and keep their web consoles off the internet.",
          confidence: "medium",
          rationale:
            "The catalog lists only flaws that are exploited, but it concerns a product and nothing says our gateways are affected.",
          evidence: [
            {
              source_id: "S1",
              quote: "LarkOS contains a command injection vulnerability in its web console",
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
