import { hibpUrl } from "../../records/hibp";
import { KEV_URL } from "../../records/kev";
import { nvdUrl } from "../../records/nvd";
import { NAME_ONLY_LOOKUP_NOTE, OFAC_SDN_URL, parseOfac } from "../../records/ofac";
import { joinSentences } from "../../records/sentence";
import { SEC_TICKERS_URL } from "../../records/sec";
import { statusFeedUrl } from "../../records/statuspage";
import type { RecordsOutcome } from "../../records";
import { ofacSourceOf } from "../../vrdb/connectors/ofac";
import type { EvalCase } from "../types";
import { NOW, finish, page } from "./builders";

const SITE = "https://aldermere-trading.example";

const vendor = { name: "Aldermere Trading Ltd", website: "aldermere-trading.example" };

/**
 * What the sanctions list held, as the two files the Treasury publishes (no header row, `-0- ` for
 * a field with nothing in it), run through the code that reads them (see records/ofac.ts), so that
 * the text of the record is the one a run gets. The list holds an entity of the vendor's name, a
 * vessel and a person with a similar name, and an entity of another name.
 */
const row = (id: number, name: string, type: string, programs: string, remarks: string): string =>
  [id, `"${name}"`, type, `"${programs}"`, ...Array(7).fill("-0- "), remarks].join(",");
const SDN = [
  row(
    40001,
    "ALDERMERE TRADING LIMITED",
    "-0- ",
    "RUSSIA-EO14024",
    '"Organization Established Date 2011; Registration ID 7701234567; a.k.a. ""ALDERMERE TRADE HOUSE""."',
  ),
  row(40002, "ALDERMERE TRADER", '"vessel"', "RUSSIA-EO14024", "-0- "),
  row(40003, "ALDERMERE, Tomas", '"individual"', "SDGT", '"DOB 1971."'),
  row(40004, "CALDWELL OVERSEAS FZE", "-0- ", "IRAN", "-0- "),
].join("\r\n");
const ALT = [
  '40001,61001,"aka","ALDERMERE TRADE HOUSE",-0- ',
  '40004,61002,"aka","CALDWELL",-0- ',
].join("\r\n");

const list = parseOfac(SDN, ALT);
// The entity that has the vendor's name, as a lookup by name writes it: the list's words, the note
// that the match is by name only, and the day of the run, since the list dates no entry.
const entity = list.byId.get(40001);
if (entity === undefined) throw new Error("the list of this case holds the entity of the vendor");
const day = NOW.slice(0, 10);
const sanctions = {
  records: [
    {
      ...ofacSourceOf(entity),
      text: joinSentences([
        ofacSourceOf(entity).text,
        NAME_ONLY_LOOKUP_NOTE,
        `On the list on ${day}.`,
      ]),
      publishedAt: day,
    },
  ],
  omitted: {},
};
const NOW_DATE = new Date(NOW);

const records: RecordsOutcome[] = [
  { source: "kev", url: KEV_URL, outcome: "empty", records: [], omitted: {}, ms: 190 },
  {
    source: "nvd",
    url: nvdUrl("aldermere-trading", NOW_DATE, "2024-10-10"),
    outcome: "empty",
    records: [],
    omitted: {},
    ms: 870,
  },
  {
    source: "hibp",
    url: hibpUrl("aldermere-trading.example"),
    outcome: "empty",
    records: [],
    omitted: {},
    ms: 150,
  },
  { source: "sec", url: SEC_TICKERS_URL, outcome: "empty", records: [], omitted: {}, ms: 320 },
  {
    source: "statuspage",
    url: statusFeedUrl("status.aldermere-trading.example"),
    outcome: "empty",
    records: [],
    omitted: {},
    ms: 410,
  },
  { source: "ofac", url: OFAC_SDN_URL, outcome: "ok", ...sanctions, ms: 35 },
];

/**
 * A vendor of procurement software that has the name of a company on the sanctions list of the
 * United States Treasury. The news has nothing: no article is about the vendor, which is a small
 * company. The code reads the list (two files that the Treasury publishes, kept for the runs of
 * the process) and gives the run the entity that has the vendor's name as a record, with its
 * programs and its remarks in the words of the list and a note that the match is by name only. The
 * vessel and the person with a similar name, and the entity of another name, are not records. The
 * record is a source that was read, so the finding that cites it is no finding on a snippet; it is
 * one page of a publisher that tells nothing of this vendor, so the likelihood is no more than
 * possible, and the action is to find out who the vendor is.
 *
 * Under the credibility rule the label is Low, with the note that the record matched by name only:
 * the list is official, but it matches the vendor by its name alone, which may be another company's
 * (spec D5.6 #13).
 *
 * If this case fails, the list is no longer read or its records no longer reach the evidence, a
 * vessel or a person is let in, or the finding says that the vendor is sanctioned.
 */
export const SANCTIONS_LIST_NAME_MATCH: EvalCase = {
  id: "sanctions-list-name-match",
  title: "A company of the vendor's name is on the sanctions list and the news has nothing",
  reproduces:
    "A company with the vendor's name was on the sanctions list of the Treasury and no search looked there, so the run reported a clean legal record.",
  vendor: {
    name: vendor.name,
    website: vendor.website,
    provides: "Procurement software",
  },
  now: NOW,
  gather: true,
  recording: {
    steps: [finish("The code collected the news, the records and the vendor's pages")],
    searches: [
      { kind: "news", query: "Aldermere Trading data breach", results: [] },
      { kind: "news", query: "Aldermere Trading security incident", results: [] },
      { kind: "news", query: "Aldermere Trading lawsuit", results: [] },
      { kind: "news", query: "Aldermere Trading fined", results: [] },
      { kind: "news", query: "Aldermere Trading FTC", results: [] },
      { kind: "news", query: "Aldermere Trading settlement", results: [] },
      { kind: "news", query: "Aldermere Trading outage", results: [] },
      { kind: "news", query: "Aldermere Trading layoffs", results: [] },
      { kind: "news", query: "Aldermere Trading bankruptcy", results: [] },
      { kind: "news", query: "Aldermere Trading acquisition", results: [] },
    ],
    pages: [
      {
        url: `${SITE}/`,
        page: page(
          `${SITE}/`,
          "Aldermere Trading",
          "Aldermere Trading sells procurement software to mid-sized companies.",
        ),
      },
    ],
    records,
    analysis: {
      findings: [
        {
          category: "legal_regulatory",
          risk_description:
            "A company with the vendor's name, Aldermere Trading Limited, is on the sanctions list of the United States Treasury under the Russia program. The match is by name only, so the entry may be another company.",
          impact_description:
            "If the vendor is the listed company, dealing with it would breach United States sanctions, and paying it or using its service could expose the company to penalties.",
          likelihood: "Possible",
          risk_severity: "Major",
          action_plan:
            "Check the vendor's registered address, country and owners against the entry and its remarks on the sanctions list, and ask the vendor to confirm in writing that it is not the listed company before any contract or payment.",
          rationale:
            "The only source is the entry of the list, matched to the vendor by its name alone, and nothing in it ties it to this vendor.",
          evidence: [
            {
              source_id: "S1",
              quote: 'Entry: "ALDERMERE TRADING LIMITED" (entity).',
            },
          ],
        },
      ],
      category_notes: [
        {
          category: "security_incidents",
          note: "The news search and the databases found no breach.",
        },
        {
          category: "availability",
          note: "The news search and the status page found no outage.",
        },
      ],
    },
  },
  expected: {
    findings: [
      {
        category: "legal_regulatory",
        anyOf: ["sanctions list", "sanctions", "Treasury"],
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
    maxDatedWebResults: 0,
    maxSnippetOnlyFindings: 0,
    maxMislabelled: 0,
    maxDuplicateClusters: 0,
    maxCitationsRejected: 0,
  },
  gaps: {},
};
