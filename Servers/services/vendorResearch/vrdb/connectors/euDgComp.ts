/**
 * The European Commission's competition case data (DG COMP open data) as a mirrored list of the
 * vendor risk database. DG Competition publishes its cases as whole JSON objects keyed by case
 * number, rewritten every day, in the portal's S3 bucket. Two of them are read: the antitrust and
 * cartel file (`case-data-AT.json`, "AT.nnnnn") and the Digital Markets Act file
 * (`case-data-DMA.json`, "DMA.nnnnnn"). The merger file (42 MB, no company field) and the state-aid
 * file are never requested.
 *
 * The record is an UNDERTAKING, not a case: every company that a case names becomes a row of its
 * own (one case names up to 42 in a cartel), grouped by the compact form of its name without the
 * legal form (the key the match uses), with the number of its cases, how many are cartel, antitrust
 * and DMA cases, the years they were opened and the three newest. The record says that the
 * Commission's open data NAMES the undertaking as a party; it is no finding against it (a case list
 * holds the parties, the complainants and the cases that were closed or rejected), and its closing
 * sentence says so.
 *
 * Natural persons. A case names its parties as free text, and an antitrust case can name a person.
 * The rule is the one that was measured on this list (`euOrgEvidence`, kit/persons.ts): a DMA case
 * and a cartel case keep every name; in any other antitrust case a name is kept when it shows an
 * organisation (a digit or a symbol, a legal form, an organisation word, an acronym) or when the
 * same name occurs in two cases or more of the two files (counted before the rule). A name that
 * shows none is a person's, and it is dropped before anything is built: it is not stored and not
 * even counted. The title of an antitrust case that is no cartel can carry a complainant's surname,
 * so it is never copied; the title of a cartel and of a DMA case is.
 *
 * Long names. A company name that is longer than 120 characters once folded names no undertaking:
 * it is left out of its case before anything is counted or grouped, so that it is never cut into a
 * key or an id (a cut would make two long names that share a stem one undertaking). Like a name of fewer than four
 * characters it is neither a record nor an unreadable case, and the other companies of the case
 * stay. The name that is SHOWN is cut at 100 characters; its id, its keys and its identifier are the
 * whole name. The length is decided by `lineWithin` (kit/clean.ts), which gives a name that fits or
 * nothing and never a cut one: a name that is only read with a character to spare could be cut to
 * the limit by a blank or a pair of surrogates at the cut, and pass for a name that fits.
 *
 * What is read of a case (everything else is never copied): the number, the file's kind, the
 * companies, the day it was opened, the label of its legal basis, the title (cartel and DMA cases),
 * and of each decision its day and the label of its type. Every metadata value is an array whose
 * first value is read, and the legal basis and the decision type are JSON text inside a string (a
 * placeholder `{}` has no label).
 *
 * Download. The two files are asked one after the other, in full, every time (the kit sends no
 * validators for two files, and a snapshot holds one pair), through a fetch of this connector's own
 * (`fetchFiles`): the kit's pin cannot say that an answer must come from the exact object that was
 * asked. The answer must come from the bucket's host and from the path of the file that was asked
 * (a redirect to the merger file, or the state-aid file, or to the other file of the list, fails as
 * not allowed). The bucket's robots.txt answers 403 (no rules), so the house pause of one second
 * (`HOST_PAUSE_MS` of kit/pause.ts) is waited ONCE between the two requests: not before the first,
 * not after the second, and never when the first request has failed or its answer was refused. The
 * sleep is injected (`createEuDgCompConnector({ sleep })`, a test hands it one that does not wait);
 * the connector that the module exports waits for real.
 *
 * Read. A file that is not an object of case numbers, that has fewer readable cases than the
 * floor, or whose earliest opening is after the floor's day, is not the list (the AT file reaches
 * back to 1974 and the DMA file to the first designations of 2022). A file of more than 5,000
 * cases is no whole list the reader takes: the download fails as too large and never gives a
 * shorter list. A case that does not have the shape (a key that is not its number, a value that is
 * no array where the portal writes one, more than 60 companies or 30 decisions) is unreadable: it
 * is counted, and more than the allowance (kit/clean.ts) fails the parse.
 *
 * The body counts the rows the kit asks for: its total is the number of cases that were seen, or
 * the number of undertakings and unreadable cases when those are more (one case names many
 * undertakings, and the kit refuses a total below the rows it holds).
 *
 * Nothing is logged, and no address, case or name enters an error.
 */
import { FetchError } from "../../../webResearch/guardedFetch";
import { shortName } from "../../identity";
import { compactName } from "../../records/match";
import { joinSentences, sentence } from "../../records/sentence";
import type { Pin } from "./kit/address";
import { compareText, dayText, isObject, lineOf, lineWithin, withoutAngles } from "./kit/clean";
import {
  type Fetched,
  type FileSpec,
  type ReadResult,
  createFileConnector,
} from "./kit/fileConnector";
import { jsonOf } from "./kit/json";
import { pinnedFetch } from "./kit/paging";
import { type Sleep, pauseFor, realSleep } from "./kit/pause";
import { euOrgEvidence } from "./kit/persons";
import { RECORD_SUMMARY_MAX, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { textOf } from "./kit/text";
import type { Connector, ConnectorFetch } from "./types";

/** What the text of a record begins with, and what the analysis prompt names the list by. */
export const EU_DG_COMP_RECORD_MARK = "European Commission competition cases";

const MIB = 1024 * 1024;
const BUCKET_HOST = "compcases-open-data-portal-files-prod.s3.eu-west-1.amazonaws.com";
/** The host only: the exact object is checked by the download (`fetchFiles`). */
const PIN: Pin = { hosts: [BUCKET_HOST], pathPrefixes: ["/"] };

/** The two files, in the order they are asked and read: the AT file, then the DMA file. */
const FILES: readonly FileSpec[] = [
  {
    url: `https://${BUCKET_HOST}/case-data-AT.json`,
    maxBytes: 8 * MIB,
    contentTypes: ["application/octet-stream", "application/json"],
    timeoutMs: 120_000,
  },
  {
    url: `https://${BUCKET_HOST}/case-data-DMA.json`,
    maxBytes: 4 * MIB,
    contentTypes: ["application/octet-stream", "application/json"],
    timeoutMs: 120_000,
  },
];

type FileName = "AT" | "DMA";
const FILE_NAMES: readonly FileName[] = ["AT", "DMA"];

/** The key of a case of each file: the case number, which the case also says of itself. */
const CASE_KEY: Record<FileName, RegExp> = {
  AT: /^AT\.[0-9]{4,6}$/,
  DMA: /^DMA\.[0-9]{6}$/,
};

/**
 * What makes a file the list: the readable cases it must have, and the day by which its earliest
 * case was opened (the AT file holds cases from 1974 on, the DMA file from 2022).
 */
const FLOORS: Record<FileName, { cases: number; openedBy: string }> = {
  AT: { cases: 600, openedBy: "1980-12-31" },
  DMA: { cases: 40, openedBy: "2022-12-31" },
};

/** The most cases that a file may hold: the AT file holds about 760 today. */
const CASES_MAX = 5000;
const COMPANIES_MAX = 60;
const DECISIONS_MAX = 30;

/** The longest company name (once folded) that is an undertaking: a longer one is left out of its case. */
const NAME_MAX = 120;
const TITLE_MAX = 120;
const LEGAL_BASIS_MAX = 60;
const DECISION_TYPE_MAX = 60;
const DISPLAY_MAX = 100;
const SPELLINGS_MAX = 5;
const NUMBERS_MAX = 10;
const NEWEST_MAX = 3;
/** What an undertaking's name must have, compact, to be a key (kit/keys: four characters). */
const ID_MIN = 4;

/** What the summary shows of a case, at the most (the row holds more). */
const TITLE_SHOWN = 60;
const LEGAL_BASIS_SHOWN = 40;
const DECISION_TYPE_SHOWN = 50;

const DOCUMENTATION_URL =
  "https://competition-policy.ec.europa.eu/about/news/dg-competitions-case-data-available-open-data-2025-03-18_en";

const FIRST_SENTENCE = `${EU_DG_COMP_RECORD_MARK} (competition-policy.ec.europa.eu), an enforcement or case list.`;

const CLOSING =
  "A case listing is not a finding of infringement against a listed party unless a decision " +
  "addressed to it says so; mergers are not in this list. Source: European Commission, DG " +
  "Competition case data, (c) European Union, CC BY 4.0; adapted by VerifyWise.";

type Kind = "cartel" | "antitrust" | "DMA";

/** What a row shows of one case of an undertaking. */
export interface EuCaseFacts {
  case: string;
  kind: Kind;
  /** Only for a cartel and a DMA case: the title of any other is never copied. */
  title: string;
  legalBasis: string;
  /** The undertakings that the case names (those the person rule kept). */
  parties: number;
  /** The decisions of the case that have a day. */
  decisions: number;
  latest: { day: string; type: string } | null;
  initiation: string | null;
}

/** One undertaking: the row that the body holds. */
export interface EuUndertaking {
  /** The compact name without the legal form. */
  id: string;
  display: string;
  names: string[];
  cases: number;
  cartel: number;
  antitrust: number;
  dma: number;
  firstYear: number | null;
  lastYear: number | null;
  /** The numbers of the newest cases, at most ten. */
  caseNumbers: string[];
  newest: EuCaseFacts[];
  /** The day of the newest activity of its cases (the latest decision, else the opening). */
  publishedAt: string | null;
}

/** A case as it is read, before its companies are grouped. */
interface CaseFacts {
  number: string;
  kind: Kind;
  title: string;
  legalBasis: string;
  /** The companies as cleaned lines; those that name nobody are left out. */
  companies: string[];
  initiation: string | null;
  decisions: number;
  latest: { day: string; type: string } | null;
}

/** The cases of a file that could be read, and how many it held. */
interface CaseFile {
  cases: CaseFacts[];
  seen: number;
  unreadable: number;
}

/** A path with no query: what an answer is compared with, as the file asked. */
const pathOf = (address: string): string => new URL(address).pathname;

/**
 * The two files, in full, one after the other, with the pause of the host between the requests (the
 * second is asked only when the answer to the first has been taken, so that a failed or refused
 * first request waits for nothing). Each answer must come from the bucket's host and from the very
 * object that was asked: the pin of the kit can say a host and a directory, and the
 * bucket holds the merger and the state-aid files beside these. A 304 cannot be the answer, since
 * no validator was sent (from the right object it fails as unreachable, from another as not
 * allowed). An answer that was cut is refused by the pin of the kit before the object is looked at:
 * it fails as too large, whichever object of the bucket it came from. Nothing is named in an error.
 */
async function fetchFiles(fetch: ConnectorFetch, sleep: Sleep): Promise<Fetched> {
  const ask = pinnedFetch(fetch, PIN);
  const buffers: Buffer[] = [];
  const contentTypes: string[] = [];
  let bytes = 0;
  for (let index = 0; index < FILES.length; index += 1) {
    const file = FILES[index];
    // Once, between the first request and the second: the first one has been taken by now.
    if (index > 0) await pauseFor(BUCKET_HOST, sleep);
    const response = await ask(
      file.url,
      {},
      {
        maxBytes: file.maxBytes,
        allowedContentTypes: file.contentTypes,
        totalTimeoutMs: file.timeoutMs ?? 120_000,
      },
    );
    // The object comes first: an answer from another object is refused as such, a 304 included.
    if (pathOf(response.url) !== pathOf(file.url)) throw new FetchError("not_allowed");
    if (response.notModified) throw new FetchError("unreachable");
    buffers.push(response.body);
    contentTypes.push(response.contentType);
    bytes += response.body.length;
  }
  return { buffers, contentTypes, etag: null, lastModified: null, bytes };
}

/** The values of a metadata key: none when it is absent; null when it is there and is no array. */
function valuesOf(source: Record<string, unknown>, key: string): readonly unknown[] | null {
  const value = source[key];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : null;
}

/** The day that a text of a date starts with: its first ten characters, or null. */
const dayOfDate = (value: unknown): string | null =>
  typeof value === "string" ? dayText(value.slice(0, 10)) : null;

/**
 * The label of a JSON text such as `{"code":"LB-1","label":"Art. 101 TFEU"}`; an empty line for a
 * placeholder (`{}`, `{"items":[{}]}`), for text that is not JSON and for a label that is no text.
 */
function labelOf(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const parsed = jsonOf(value);
  return isObject(parsed) ? lineOf(parsed.label, max) : "";
}

/** The decisions of a case: how many have a day, and the latest (of one day, the greater type). */
function decisionsOf(
  list: readonly unknown[],
): { count: number; latest: { day: string; type: string } | null } | null {
  let count = 0;
  let latest: { day: string; type: string } | null = null;
  for (const decision of list) {
    if (!isObject(decision) || !isObject(decision.metadata)) return null;
    const days = valuesOf(decision.metadata, "decisionAdoptionDate");
    const types = valuesOf(decision.metadata, "decisionTypes");
    if (days === null || types === null) return null;
    const day = dayOfDate(days[0]);
    // A decision that says no day cannot be dated: it is left out.
    if (day === null) continue;
    const type = labelOf(types[0], DECISION_TYPE_MAX);
    count += 1;
    if (
      latest === null ||
      day > latest.day ||
      (day === latest.day && compareText(type, latest.type) > 0)
    ) {
      latest = { day, type };
    }
  }
  return { count, latest };
}

/** A case as `CaseFacts`, or null when it does not have the shape of a case of its file. */
function caseOf(key: string, value: unknown, file: FileName): CaseFacts | null {
  if (!CASE_KEY[file].test(key) || !isObject(value) || !isObject(value.metadata)) return null;
  const { metadata } = value;
  const numbers = valuesOf(metadata, "caseNumber");
  const companies = valuesOf(metadata, "caseCompanies");
  const openings = valuesOf(metadata, "caseInitiationDate");
  const cartels = valuesOf(metadata, "caseCartel");
  const titles = valuesOf(metadata, "caseTitle");
  const bases = valuesOf(metadata, "caseLegalBasis");
  const list = value.decisions === undefined ? [] : value.decisions;
  if (
    numbers === null ||
    companies === null ||
    openings === null ||
    cartels === null ||
    titles === null ||
    bases === null ||
    !Array.isArray(list)
  ) {
    return null;
  }
  // The key is the case's number, and the case says the same.
  if (numbers[0] !== key) return null;
  if (companies.length > COMPANIES_MAX || list.length > DECISIONS_MAX) return null;

  const names: string[] = [];
  for (const company of companies) {
    if (typeof company !== "string") return null;
    // A name that is longer than a name may be is left out of the case here, before anything is
    // counted or grouped: it is never cut into a key or an id (the cut text of two long names with
    // one stem would be one id). `lineWithin` gives the name as it is, or nothing, and never a cut.
    const name = lineWithin(company, NAME_MAX);
    // A text with no letter and no digit names nobody.
    if (name !== null && compactName(name) !== "") names.push(name);
  }
  const decisions = decisionsOf(list);
  if (decisions === null) return null;

  // Only an AT case whose caseCartel says exactly "Cartel" is a cartel: any other is not, and the
  // rule of persons and the rule of the titles then apply.
  const kind: Kind = file === "DMA" ? "DMA" : cartels[0] === "Cartel" ? "cartel" : "antitrust";
  return {
    number: key,
    kind,
    title: kind === "antitrust" ? "" : lineOf(titles[0], TITLE_MAX),
    legalBasis: labelOf(bases[0], LEGAL_BASIS_MAX),
    companies: names,
    initiation: dayOfDate(openings[0]),
    decisions: decisions.count,
    latest: decisions.latest,
  };
}

/** The cases of the object of a file, and how many keys it held. */
function readCases(root: Record<string, unknown>, file: FileName): CaseFile {
  const cases: CaseFacts[] = [];
  let seen = 0;
  let unreadable = 0;
  for (const [key, value] of Object.entries(root)) {
    seen += 1;
    const facts = caseOf(key, value, file);
    if (facts === null) unreadable += 1;
    else cases.push(facts);
  }
  return { cases, seen, unreadable };
}

/** Whether the cases are those of the list: enough of them, and the earliest opened early enough. */
function isTheList(read: CaseFile, file: FileName): boolean {
  const floor = FLOORS[file];
  if (read.cases.length < floor.cases) return false;
  let earliest: string | null = null;
  for (const facts of read.cases) {
    if (facts.initiation !== null && (earliest === null || facts.initiation < earliest)) {
      earliest = facts.initiation;
    }
  }
  return earliest !== null && earliest <= floor.openedBy;
}

/** The companies of a case that the rule of persons keeps (see the comment of the file). */
function keptCompanies(facts: CaseFacts, occurrences: ReadonlyMap<string, number>): string[] {
  if (facts.kind !== "antitrust") return facts.companies;
  return facts.companies.filter(
    (name) => euOrgEvidence(name) !== null || (occurrences.get(compactName(name)) ?? 0) >= 2,
  );
}

/** The cases that name an undertaking, and how it is written. */
interface Group {
  spellings: Map<string, number>;
  cases: Map<string, { facts: CaseFacts; parties: number }>;
}

/** The day of the newest activity of a case: its latest decision, else its opening. */
const activityOf = (facts: CaseFacts): string | null => facts.latest?.day ?? facts.initiation;

/** Newest first; a case that has no day last; of one day the greater number first. */
function newestFirst(a: CaseFacts, b: CaseFacts): number {
  const dayA = activityOf(a);
  const dayB = activityOf(b);
  if (dayA !== dayB) {
    if (dayA === null) return 1;
    if (dayB === null) return -1;
    return compareText(dayB, dayA);
  }
  return compareText(b.number, a.number);
}

function rowOf(id: string, group: Group): EuUndertaking {
  // The most frequent spelling first; of equal frequency, the first in the order of the texts.
  const spellings = [...group.spellings]
    .sort(([textA, countA], [textB, countB]) => countB - countA || compareText(textA, textB))
    .map(([text]) => text);
  const entries = [...group.cases.values()].sort((a, b) => newestFirst(a.facts, b.facts));
  const years = entries
    .map(({ facts }) => facts.initiation)
    .filter((day): day is string => day !== null)
    .map((day) => Number(day.slice(0, 4)));
  const count = (kind: Kind): number => entries.filter(({ facts }) => facts.kind === kind).length;
  return {
    id,
    display: lineOf(spellings[0], DISPLAY_MAX),
    names: spellings.slice(0, SPELLINGS_MAX),
    cases: entries.length,
    cartel: count("cartel"),
    antitrust: count("antitrust"),
    dma: count("DMA"),
    firstYear: years.length === 0 ? null : Math.min(...years),
    lastYear: years.length === 0 ? null : Math.max(...years),
    caseNumbers: entries.slice(0, NUMBERS_MAX).map(({ facts }) => facts.number),
    newest: entries.slice(0, NEWEST_MAX).map(({ facts, parties }) => ({
      case: facts.number,
      kind: facts.kind,
      title: facts.title,
      legalBasis: facts.legalBasis,
      parties,
      decisions: facts.decisions,
      latest: facts.latest,
      initiation: facts.initiation,
    })),
    publishedAt: entries.length === 0 ? null : activityOf(entries[0].facts),
  };
}

/** The undertakings that the cases name, one row each. */
function undertakingsOf(cases: readonly CaseFacts[]): EuUndertaking[] {
  // How many cases name each company, counted before the rule of persons.
  const occurrences = new Map<string, number>();
  for (const facts of cases) {
    for (const key of new Set(facts.companies.map(compactName))) {
      occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
    }
  }

  const groups = new Map<string, Group>();
  for (const facts of cases) {
    const inCase = new Map<string, Set<string>>();
    for (const name of keptCompanies(facts, occurrences)) {
      const id = compactName(shortName(name));
      if (id === "") continue;
      const spellings = inCase.get(id);
      if (spellings === undefined) inCase.set(id, new Set([name]));
      else spellings.add(name);
    }
    // The undertakings that the case names, a case counting once for each of them.
    const parties = inCase.size;
    for (const [id, spellings] of inCase) {
      let group = groups.get(id);
      if (group === undefined) {
        group = { spellings: new Map(), cases: new Map() };
        groups.set(id, group);
      }
      for (const spelling of spellings) {
        group.spellings.set(spelling, (group.spellings.get(spelling) ?? 0) + 1);
      }
      group.cases.set(facts.number, { facts, parties });
    }
  }

  const rows: EuUndertaking[] = [];
  for (const [id, group] of groups) {
    // An undertaking whose name is too short to be a key is no entity of the list.
    if (id.length >= ID_MIN) rows.push(rowOf(id, group));
  }
  return rows;
}

function read(fetched: Fetched): ReadResult<EuUndertaking> | null {
  const roots: Array<Record<string, unknown>> = [];
  for (let index = 0; index < FILE_NAMES.length; index += 1) {
    const root = jsonOf(textOf(fetched, index));
    if (!isObject(root)) return null;
    roots.push(root);
  }
  // A file of more cases than the reader takes is not read: no part of a list is a list.
  const complete = roots.every((root) => Object.keys(root).length <= CASES_MAX);
  if (!complete) return { rows: [], total: 0, unreadable: 0, complete };

  const files = roots.map((root, index) => readCases(root, FILE_NAMES[index]));
  if (!files.every((file, index) => isTheList(file, FILE_NAMES[index]))) return null;

  const rows = undertakingsOf(files.flatMap((file) => file.cases));
  const unreadable = files.reduce((sum, file) => sum + file.unreadable, 0);
  const seen = files.reduce((sum, file) => sum + file.seen, 0);
  // One case names many undertakings, and a total below the rows is no body: the cases seen, or
  // the rows and the cases that could not be read when those are more.
  return { rows, total: Math.max(seen, rows.length + unreadable), unreadable, complete };
}

/** The case as the summary tells it: its number, its kind and what is known of it. */
function caseText(facts: EuCaseFacts): string {
  const parts = [
    facts.title === "" ? facts.kind : `${facts.kind}, "${lineOf(facts.title, TITLE_SHOWN)}"`,
  ];
  if (facts.legalBasis !== "") parts.push(lineOf(facts.legalBasis, LEGAL_BASIS_SHOWN));
  parts.push(facts.parties === 1 ? "1 party" : `${facts.parties} parties`);
  if (facts.latest === null) {
    parts.push(
      facts.initiation === null
        ? "no decision recorded"
        : `no decision recorded, opened ${facts.initiation}`,
    );
  } else {
    const type = lineOf(facts.latest.type, DECISION_TYPE_SHOWN);
    parts.push(`latest decision${type === "" ? "" : ` "${type}"`} adopted ${facts.latest.day}`);
  }
  return `${facts.case} (${parts.join("; ")})`;
}

/** What the files say of the undertaking: its cases by kind, and the years they were opened. */
function countsText(row: EuUndertaking): string {
  const kinds = [
    [row.cartel, "cartel"],
    [row.antitrust, "antitrust"],
    [row.dma, "DMA"],
  ]
    .filter(([count]) => count !== 0)
    .map(([count, label]) => `${count} ${label}`);
  let opened = "";
  if (row.firstYear !== null && row.lastYear !== null) {
    opened =
      row.firstYear === row.lastYear
        ? `, opened in ${row.firstYear}`
        : `, opened from ${row.firstYear} to ${row.lastYear}`;
  }
  return (
    "The European Commission's open case data for antitrust, cartel and Digital Markets Act " +
    `cases names it as a party in ${row.cases === 1 ? "1 case" : `${row.cases} cases`} ` +
    `(${kinds.join(", ")})${opened}.`
  );
}

/**
 * The summary of an undertaking. When the sentences are longer than a summary may be, the oldest
 * of the newest cases are left out one at a time (the third, then the second), so that the closing
 * sentence, which says that a listing is no finding, always stays whole and last.
 */
function summaryOf(row: EuUndertaking): string {
  const head = [
    FIRST_SENTENCE,
    sentence("Undertaking", lineOf(row.display, DISPLAY_MAX)),
    countsText(row),
  ];
  const sentencesFor = (shown: number): string[] => [
    ...head,
    shown === 0 ? "" : `Newest: ${row.newest.slice(0, shown).map(caseText).join("; ")}.`,
  ];
  let shown = row.newest.length;
  while (
    shown > 1 &&
    joinSentences([...sentencesFor(shown), CLOSING]).length > RECORD_SUMMARY_MAX
  ) {
    shown -= 1;
  }
  return summaryWithClosing(sentencesFor(shown), CLOSING, RECORD_SUMMARY_MAX);
}

/**
 * The connector, with the pause between the two requests injectable: a test hands it a sleep that
 * does not wait.
 */
export function createEuDgCompConnector({ sleep = realSleep }: { sleep?: Sleep } = {}): Connector {
  return createFileConnector<EuUndertaking>({
    id: "eu_dg_comp",
    version: 1,
    root: "case-data",
    sortKey: (row) => row.id,
    fetchFiles: (fetch) => fetchFiles(fetch, sleep),
    read,
    toRecords: (rows) =>
      rows.map((row) =>
        recordOf({
          id: row.id,
          type: "eu_competition_cases",
          title: `${EU_DG_COMP_RECORD_MARK}: ${row.display}`,
          summary: summaryOf(row),
          // One address for each undertaking: the page that describes the list, and the undertaking.
          url: `${DOCUMENTATION_URL}?undertaking=${encodeURIComponent(row.id)}`,
          // The name as it is written, not as it is shown: a cut text is never an identifier.
          identifiers: {
            undertaking: withoutAngles(row.names[0] ?? row.display),
            cases: row.caseNumbers,
          },
          names: row.names,
          publishedAt: row.publishedAt,
          sourceUpdatedAt: null,
        }),
      ),
  });
}

export const euDgCompConnector: Connector = createEuDgCompConnector();
