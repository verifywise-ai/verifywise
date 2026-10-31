import { ukConnector } from "../../vrdb/connectors/uk";
import type { EvalCase } from "../types";
import { NOW, copies, finish, page, quietNews, rowsOf } from "./builders";

/**
 * What the copy of the UK list held, as the list's own file run through the connector that reads it
 * (see vrdb/connectors/uk.ts): an entity of another name, whose Website field gives its own page on
 * the social network that the vendor's page is on.
 */
const uk = ukConnector.parse({
  bodies: [
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      "<Designations>",
      "  <DateGenerated>09/10/2026</DateGenerated>",
      "  <Designation>",
      "    <LastUpdated>02/06/2026</LastUpdated>",
      "    <DateDesignated>02/06/2026</DateDesignated>",
      "    <UniqueID>RUS3401</UniqueID>",
      "    <Names>",
      "      <Name>",
      "        <Name6>Ostrava Trade House LLC</Name6>",
      "        <NameType>Primary Name</NameType>",
      "      </Name>",
      "    </Names>",
      "    <RegimeName>Russia</RegimeName>",
      "    <IndividualEntityShip>Entity</IndividualEntityShip>",
      "    <Websites>",
      "      <Website>www.linkedin.com/company/ostrava-trade-house</Website>",
      "    </Websites>",
      "  </Designation>",
      "</Designations>",
    ].join("\n"),
  ],
  etag: null,
  lastModified: null,
  bytes: 0,
});

/**
 * Important 1 of the final review of M1 (spec D2.3, D4.5: a match by website is strong only
 * against the vendor's verified domain). The vendor's website is its company page on LinkedIn, and
 * an entity of another name on the UK Sanctions List gives its own LinkedIn page as its website.
 * One host holds both pages and says nothing about who either is, and the home page of that host
 * does not name the vendor: the entry is not offered, and nothing is reported.
 *
 * If this case fails, a page on a platform where many have pages ties a sanctioned entity to the
 * vendor.
 */
export const PLATFORM_WEBSITE: EvalCase = {
  id: "platform-website",
  title: "An entity on the UK list gives a page on the platform where the vendor's own page is",
  reproduces:
    "An entry whose website is a page on the social network that holds the vendor's own page would match the vendor as strongly as its own domain, and a run would report the vendor as sanctioned.",
  vendor: {
    name: "Halden Freight Ltd",
    website: "https://www.linkedin.com/company/halden-freight",
    provides: "Freight forwarding",
  },
  now: NOW,
  gather: true,
  recording: {
    steps: [finish("The code collected the news, the records and the vendor's pages")],
    searches: quietNews("Halden Freight"),
    pages: [
      {
        url: "https://linkedin.com/",
        page: page(
          "https://linkedin.com/",
          "LinkedIn: Log In or Sign Up",
          "Welcome to your professional community.",
        ),
      },
    ],
    vrdb: { rows: rowsOf("uk_sanctions", uk.records, 3401), states: copies() },
    // What the model answers when the entry is offered as the vendor's own.
    analysis: {
      findings: [
        {
          category: "legal_regulatory",
          risk_description:
            "Halden Freight is designated on the UK Sanctions List under the Russia regime.",
          impact_description:
            "Paying a designated company would break the sanctions law that applies to us.",
          likelihood: "Likely",
          risk_severity: "Major",
          action_plan: "Stop payments to the vendor until the designation is checked.",
          confidence: "high",
          rationale: "The entry gives the vendor's website.",
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
