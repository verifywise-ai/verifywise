import { nvdRecordsOf } from "../../vrdb/connectors/nvd";
import type { EvalCase } from "../types";
import { NOW, copies, finish, page, quietNews, rowsOf } from "./builders";

const SITE = "https://fernhollownetworks.example";

/** The vendor part of the CPE names of the vendor's products, which the NVD is asked by. */
const TOKEN = "fernhollownetworks";

/**
 * What the NVD answered when it was asked for the vendor's token, as the API's answer run through
 * the connector that reads it (see vrdb/connectors/nvd.ts), so that the record is the one the
 * read-through stored. The answer is written from the documented format, not copied from the API;
 * its description names the vendor and the product, as the NVD's descriptions mostly do, since a
 * source whose text does not name the vendor cannot be cited (validation.ts).
 */
const answer = nvdRecordsOf(
  {
    resultsPerPage: 1,
    startIndex: 0,
    totalResults: 1,
    format: "NVD_CVE",
    version: "2.0",
    vulnerabilities: [
      {
        cve: {
          id: "CVE-2026-37001",
          published: "2026-09-28T14:15:00.000",
          lastModified: "2026-10-03T09:12:00.000",
          vulnStatus: "Analyzed",
          descriptions: [
            {
              lang: "en",
              value:
                "A flaw in the management API of Fernhollow Networks FernOS lets a remote attacker run code on the switch without signing in.",
            },
          ],
          metrics: {
            cvssMetricV31: [{ cvssData: { baseScore: 9.8, baseSeverity: "CRITICAL" } }],
          },
        },
      },
    ],
  },
  TOKEN,
);

/**
 * Worked case 1 of the spec (D5.7) through the read-through of M2 (spec D2.7, Rulings 2 and 3 of
 * the M2 plan): the NVD is asked at run time by the vendor's CPE token, a strong key, and its answer
 * is stored and offered like a record of a copy. It lists a critical flaw in FernOS, the software of
 * Fernhollow Networks' switches. The finding is High, and its line says the day of the answer ("as
 * of"); the coverage says the NVD was checked through the read-through. A run without the answer
 * does not research the NVD (cases.test.ts runs both).
 *
 * If this case fails, a record the NVD answered at run time is not offered, or is not the official
 * record of the vendor's product that it is.
 */
export const NVD_READ_THROUGH: EvalCase = {
  id: "nvd-read-through",
  title: "The NVD, asked by the vendor's CPE token, lists a critical flaw in its software",
  reproduces:
    "A database asked at run time instead of mirrored would offer nothing, or its record would not be labelled as the official record that matched the vendor's own token.",
  vendor: {
    name: "Fernhollow Networks",
    website: "fernhollownetworks.example",
    provides: "Network switches",
  },
  now: NOW,
  gather: true,
  recording: {
    steps: [finish("The code collected the news, the records and the vendor's pages")],
    searches: quietNews("Fernhollow Networks"),
    pages: [
      {
        url: `${SITE}/`,
        page: page(
          `${SITE}/`,
          "Fernhollow Networks",
          "Fernhollow Networks makes the switches of our office networks.",
        ),
      },
    ],
    vrdb: {
      rows: rowsOf("nvd", answer, 3701),
      states: copies(),
      readThrough: [
        {
          id: "nvd",
          key: `cpe:${TOKEN}`,
          weak: false,
          outcome: "fresh",
          fetchedAt: new Date("2026-10-10T08:30:00Z"),
        },
      ],
    },
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "The NVD lists a critical flaw in the management API of FernOS, the software of the vendor's switches, that lets an attacker run code without signing in.",
          impact_description:
            "An attacker who reaches the management API of a switch of ours can take over our office network.",
          likelihood: "Possible",
          risk_severity: "Major",
          action_plan:
            "Ask the vendor whether our switches run a fixed FernOS, and keep their management API off the internet until they do.",
          confidence: "medium",
          rationale:
            "The NVD lists the flaw in the software our switches run; nothing says it is exploited.",
          evidence: [
            {
              source_id: "S1",
              quote:
                "A flaw in the management API of Fernhollow Networks FernOS lets a remote attacker run code on the switch without signing in",
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
        anyOf: ["FernOS", "management API"],
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
