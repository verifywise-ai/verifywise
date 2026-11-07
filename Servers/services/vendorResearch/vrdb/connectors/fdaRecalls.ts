/**
 * The FDA recalls of AI-enabled medical devices (spec D2.20, Q34): the recalls that the FDA's
 * device recall dataset (openFDA) holds for the devices on the FDA list of AI-enabled medical
 * devices (connectors/fda.ts). A recall is a firm's correction or removal of a device, so it is the
 * one keyless, official adverse-event signal that is specific to AI. openFDA's device recall data
 * is CC0 1.0 (credit requested, not required). The GMDN content of a product (its `openfda` block)
 * is licensed separately: the block is never read, stored or used for the join. openFDA says its
 * results are unvalidated and not for decisions about medical care, and every record says so.
 *
 * There is no file to copy: the dataset holds tens of thousands of products and the list names some
 * sixteen hundred devices. A download joins them. It reads the AI list (unconditionally, 141 KB),
 * asks openFDA for the K numbers of the list (`k_numbers`, in batches of 50) and for its PMA
 * numbers (`pma_numbers`, in batches of 30), and keeps the products that carry one of them. The
 * real list is 32 batches and one, so a download is 35 requests with the probe and the list
 * itself, 500 ms apart (about 120 a minute, half of what openFDA allows without a key). A download
 * is at most 80 requests and 96 MiB. Nothing is returned before every request has succeeded, so a
 * part of a join never reaches the copy.
 *
 * What is searched, and what a product must say to be joined. A K number is searched as the list
 * writes it. A PMA number is searched as written (`P123456`), and a supplement (`P123456/S001`)
 * with the slash taken out (`P123456S001`), which is how the dataset writes one: the base number of
 * a supplement is not searched, since it would join the recalls of every other supplement of that
 * PMA. A De Novo number (`DEN123456`) is not searched: the dataset holds none in `k_numbers`. A
 * product is joined to a row of the list only when one of its own `k_numbers` or `pma_numbers`
 * equals the row's term exactly, so a recall that cites only the base number of an AI-listed
 * supplement is not joined (a known limit), and whatever else openFDA's search returns is dropped.
 *
 * The probe. openFDA answers 404 when a search finds nothing, so a 404 is "no match" for a batch.
 * That is safe only because the same download first asked the endpoint for one product and got the
 * dataset's own metadata back (a day of the last update, and a total of more than 10,000): without
 * the probe, an endpoint that had moved would read as "no recalls", and only the sync's shrink
 * check would notice. A 404 of the probe itself, and any other failure of any request, is thrown as
 * it is (a 429 with its Retry-After), and the sync fails. A 404 of a page after the first of a
 * search is not a "no match" either: the first page said there were more, so the search did not
 * page as it was asked, and the download fails as not the list.
 *
 * Validators. A snapshot holds one pair, and neither source's own tells whether the join would
 * change; the day of the dataset's last update and the text of the AI list together do. So
 * `lastModified` carries `recalls:{last_updated};list:{16 hex of the list's sha256}` (the column is
 * text: it is kept as it is and never sent as a header, since every request here is unconditional),
 * and `etag` is null. When the stored value equals the new one, the download answers `unchanged`
 * before the join, so the join's requests are made only when openFDA or the list changed.
 *
 * Projection. Each answer is cut down to what a record uses at once, before the next request is
 * made: the recall number, the event number, the recalling firm, the three days, the status, the
 * root cause, the reason, the product description and the AI-list numbers it matched. The lot and
 * serial numbers (`code_info`), every address and contact field, the distribution and the
 * quantity, the instructions to consignees (`action`), the firm's FEI number, the page id and the
 * `openfda` block are never carried, nor is a number of the product that is not on the list. Text
 * is cleaned (control characters, zero-width and bidirectional characters out, white space
 * collapsed) and capped, and a cut says so (` [shortened]`): the reason of a recall is free text
 * that a firm wrote, and it ends up in a model's prompt. The bodies are one canonical JSON
 * (products and joined rows sorted), so that they do not depend on the order of the answers and
 * the sync's hash tells an unchanged join.
 *
 * Records. One record per recall event (`res_event_number`): an event is one firm's recall and may
 * cover many products (one firm has 67 recalled products on the list), so a record per product
 * would let one firm flood a run. The text names the recalling firm and the company of the AI
 * list, who may be different (a subsidiary or a distributor recalls the device of a maker). It says
 * that the recall page shows the class, which the API does not carry, and that a recall is not a
 * finding that the AI caused the problem. A vendor is matched by those names alone, so a match is
 * weak. A recall is an event, dated by the earliest day of initiation of its products.
 *
 * A product that cannot be read (a recall number or an event number of another form, no readable
 * day of initiation) is left out and counted (`skipped`), up to ten or a hundredth of the rows
 * when that is more, as the CVE records are (connectors/cve.ts); more is a new format, and they
 * are reported as `errors`. No address enters an error; the only address in a record is the page
 * of its event.
 */
import { createHash } from "crypto";
import { FetchError } from "../../../webResearch/guardedFetch";
import { joinSentences, sentence } from "../../records/sentence";
import { cleanText, cutAtCodePoint } from "../../text";
import { nameKeysOf } from "../keys";
import type { ParsedRecord } from "../types";
import {
  FDA_MAX_BYTES,
  FDA_TOTAL_TIMEOUT_MS,
  FDA_TYPES,
  FDA_URL,
  type FdaListRow,
  isFdaAddress,
  readFdaListRows,
} from "./fda";
import {
  BodyTooLargeError,
  type Connector,
  type ConnectorFetch,
  NotTheListError,
  bodyText,
  dayOf,
} from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const FDA_RECALL_RECORD_MARK = "FDA medical device recalls (openFDA)";

/** The only host the recalls may come from, after redirects. */
const API_HOST = "api.fda.gov";
const RECALL_ENDPOINT = `https://${API_HOST}/device/recall.json`;
const PROBE_URL = `${RECALL_ENDPOINT}?limit=1`;
/** The page of a recall event, which shows the recall's class (the API has no class field). */
const EVENT_PAGE =
  "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm?start_search=1&event_id=";
/** The root of the document: the endpoint. */
const ROOT = "device/recall.json";

type Limits = Parameters<ConnectorFetch>[2];
const JSON_TYPES = ["application/json"];
const PROBE_LIMITS: Limits = {
  maxBytes: 1024 * 1024,
  allowedContentTypes: JSON_TYPES,
  totalTimeoutMs: 30_000,
};
const JOIN_LIMITS: Limits = {
  maxBytes: 16 * 1024 * 1024,
  allowedContentTypes: JSON_TYPES,
  totalTimeoutMs: 60_000,
};
/** The limits of the AI list's own connector (fda.ts). */
const LIST_LIMITS: Limits = {
  maxBytes: FDA_MAX_BYTES,
  allowedContentTypes: FDA_TYPES,
  totalTimeoutMs: FDA_TOTAL_TIMEOUT_MS,
};

/** The dataset holds some 59,000 products: a probe that reports no more than this is not it. */
const MIN_DATASET_TOTAL = 10_000;
/** The numbers of one search: 50 K numbers, or 30 PMA numbers (a PMA number is longer). */
const K_BATCH = 50;
const PMA_BATCH = 30;
/** A batch whose answer is too large is split in half while it holds more numbers than this. */
const MIN_SPLIT = 5;
/** openFDA's page: the `limit` and the step of `skip`. A search of more pages is not the list. */
const PAGE_SIZE = 1000;
const MAX_PAGES = 5;
/** The wait between two requests of a download. */
const REQUEST_GAP_MS = 500;
/** The most requests and the most bytes of answers of one download. */
const MAX_REQUESTS = 80;
const MAX_ANSWER_BYTES = 96 * 1024 * 1024;

/** The most events of a list (164 on 2026-11-07); more is not the list. */
const MAX_EVENTS = 5000;
/** The most name keys of a record. */
const MAX_KEYS = 50;
const MAX_SUMMARY_CHARS = 4000;
/**
 * The text cells, cut at these lengths in characters (UTF-16 units), the marker included. A
 * company is at most 200 characters on the AI list (fda.ts), and a device 150 in a text.
 */
const MAX_FIRM_CHARS = 200;
const MAX_STATUS_CHARS = 40;
const MAX_CAUSE_CHARS = 100;
const MAX_REASON_CHARS = 600;
const MAX_PRODUCT_CHARS = 200;
const MAX_DEVICE_CHARS = 150;
const MAX_COMPANY_CHARS = 200;
/** What a cell that was cut ends with, so that nobody takes the part kept for the whole. */
const SHORTENED = " [shortened]";
/** What a text lists before it says "and n more", and what an identifier lists. */
const FIRMS_SHOWN = 3;
const CAUSES_SHOWN = 3;
const PRODUCTS_SHOWN = 3;
const DEVICES_SHOWN = 3;
const NUMBERS_SHOWN = 5;
const IDENTIFIERS_SHOWN = 20;
/** The rows that do not parse and may be left out whatever the size of the list. */
const MAX_UNREADABLE = 10;

/**
 * Said at the end of every text (Q34): what a recall is, that it is no finding about the AI, and
 * openFDA's own disclaimer.
 */
const CLOSING =
  "A recall is a firm's correction or removal of a device, classified by the FDA; it is not a finding that the device's AI caused the problem. openFDA says its results are unvalidated and are not to be relied on for decisions about medical care.";
const CLASS_NOTE = "The FDA's recall page shows the recall's class.";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** `Z-1234-2026`, or `Z-1234-04` as the recalls of 2002 to 2006 are numbered. */
const RECALL_NUMBER = /^Z-\d{4}-(\d{2}|\d{4})$/;
const EVENT_NUMBER = /^\d{1,12}$/;
const K_NUMBER = /^K\d{6}$/;
const PMA_NUMBER = /^P\d{6}$/;
const PMA_SUPPLEMENT = /^(P\d{6})\/(S\d+)$/;
/** A searched term as a product carries it: a K number, a PMA number, a supplement without its slash. */
const TERM = /^(?:K\d{6}|P\d{6}(?:S\d+)?)$/;

/** Characters no reader sees: zero-width, bidirectional, soft hyphen, byte order mark, tags, variation selectors. */
const HIDDEN = /[\p{Cf}\p{Variation_Selector}]/gu;
/** White space, and the controls that are left, as one blank. */
const BREAKS = /[\s\p{Cc}]+/gu;

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * A text as one line of plain text: the control characters and the lone surrogates dealt with
 * (`cleanText`), the characters nobody sees out, and white space collapsed to one blank, none around
 * it. Every step is linear in the length of the text, whatever it holds.
 */
const lineOf = (value: string): string =>
  cleanText(value).replace(HIDDEN, "").replace(BREAKS, " ").trim();

/** The text as it is when it has at most `max` characters, else cut so that it and the marker have. */
function shorten(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${cutAtCodePoint(value, max - SHORTENED.length).trimEnd()}${SHORTENED}`;
}

const stringOf = (value: unknown): string => (typeof value === "string" ? value : "");

/** A cell of an answer: one clean line of at most `max` characters; empty when it is no text. */
const cellOf = (value: unknown, max: number): string => shorten(lineOf(stringOf(value)), max);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A day of an answer: `YYYY-MM-DD`, and a day that exists; null for anything else. */
function dayText(value: unknown): string | null {
  const text = lineOf(stringOf(value));
  return DAY.test(text) && dayOf(text) === text ? text : null;
}

/** The rows that may be left out: ten, or a hundredth of the rows when that is more. */
const unreadableAllowed = (rows: number): number =>
  Math.max(MAX_UNREADABLE, Math.floor(rows / 100));

/** A number of the AI list as the dataset is searched for it: the field and the exact term. */
interface Term {
  field: "k_numbers" | "pma_numbers";
  text: string;
}

/**
 * The term a submission number of the AI list is searched by, or null when it is not searched: a K
 * number as written, a PMA number as written, a supplement without its slash. A De Novo number and
 * any other form are not searched.
 */
function termOf(submission: string): Term | null {
  if (K_NUMBER.test(submission)) return { field: "k_numbers", text: submission };
  if (PMA_NUMBER.test(submission)) return { field: "pma_numbers", text: submission };
  const supplement = PMA_SUPPLEMENT.exec(submission);
  return supplement === null
    ? null
    : { field: "pma_numbers", text: `${supplement[1]}${supplement[2]}` };
}

/** The terms of the list, once each and in order: the K numbers, and the PMA numbers. */
function searchedOf(rows: readonly FdaListRow[]): { k: string[]; pma: string[] } {
  const k = new Set<string>();
  const pma = new Set<string>();
  for (const row of rows) {
    const term = termOf(row.submission);
    if (term !== null) (term.field === "k_numbers" ? k : pma).add(term.text);
  }
  return { k: [...k].sort(compareText), pma: [...pma].sort(compareText) };
}

/**
 * A recall product as the connector keeps it: the fields a record uses, under the names the dataset
 * gives them, cleaned and capped, and the terms of the AI list that the product carries.
 */
interface Product {
  product_res_number: string;
  res_event_number: string;
  recalling_firm: string;
  event_date_initiated: string;
  event_date_posted: string | null;
  event_date_terminated: string | null;
  recall_status: string;
  root_cause_description: string;
  reason_for_recall: string;
  product_description: string;
  matched: string[];
}

/**
 * A product of an answer, or of the projection, as a `Product`; null when it cannot be read: the
 * recall number or the event number is not of its form, or the day of initiation is none. Only
 * these fields are read: nothing else of the product is looked at.
 */
function productOf(raw: Record<string, unknown>, matched: readonly string[]): Product | null {
  const number = lineOf(stringOf(raw.product_res_number));
  const event = lineOf(stringOf(raw.res_event_number));
  const initiated = dayText(raw.event_date_initiated);
  if (!RECALL_NUMBER.test(number) || !EVENT_NUMBER.test(event) || initiated === null) return null;
  return {
    product_res_number: number,
    res_event_number: event,
    recalling_firm: cellOf(raw.recalling_firm, MAX_FIRM_CHARS),
    event_date_initiated: initiated,
    event_date_posted: dayText(raw.event_date_posted),
    event_date_terminated: dayText(raw.event_date_terminated),
    recall_status: cellOf(raw.recall_status, MAX_STATUS_CHARS),
    root_cause_description: cellOf(raw.root_cause_description, MAX_CAUSE_CHARS),
    reason_for_recall: cellOf(raw.reason_for_recall, MAX_REASON_CHARS),
    product_description: cellOf(raw.product_description, MAX_PRODUCT_CHARS),
    matched: [...matched],
  };
}

/**
 * The terms of the list that a product of an answer carries in its own numbers, in order: its
 * `k_numbers` against the K numbers, its `pma_numbers` against the PMA numbers, each exactly. Its
 * `openfda` block holds numbers too, which are no part of the product's own and are not read.
 */
function matchedOf(
  raw: Record<string, unknown>,
  searched: { k: ReadonlySet<string>; pma: ReadonlySet<string> },
): string[] {
  const found = new Set<string>();
  for (const [numbers, wanted] of [
    [raw.k_numbers, searched.k],
    [raw.pma_numbers, searched.pma],
  ] as const) {
    if (!Array.isArray(numbers)) continue;
    for (const number of numbers) {
      if (typeof number === "string" && wanted.has(number)) found.add(number);
    }
  }
  return [...found].sort(compareText);
}

/** A row of the AI list that a recall joined, as the projection and the text hold it. */
type AiRow = FdaListRow;

const byRow = (a: AiRow, b: AiRow): number =>
  compareText(a.submission, b.submission) ||
  compareText(a.company, b.company) ||
  compareText(a.device, b.device);

/** What a download keeps and `parse` reads, as one canonical JSON. */
interface Projection {
  lastUpdated: string;
  /** The products of the answers that carried a term of the list and could not be read. */
  skipped: number;
  /** Sorted by recall number. */
  products: Product[];
  /** The rows of the AI list whose term a product carries, sorted. */
  aiRows: AiRow[];
}

/** The rows of the list whose term is among `matched`, cleaned and capped, once each, sorted. */
function joinedRowsOf(rows: readonly FdaListRow[], matched: ReadonlySet<string>): AiRow[] {
  const joined = new Map<string, AiRow>();
  for (const row of rows) {
    const term = termOf(row.submission);
    if (term === null || !matched.has(term.text)) continue;
    const entry: AiRow = {
      submission: row.submission,
      device: cellOf(row.device, MAX_DEVICE_CHARS),
      company: cellOf(row.company, MAX_COMPANY_CHARS),
    };
    joined.set(JSON.stringify(entry), entry);
  }
  return [...joined.values()].sort(byRow);
}

/** The product of the projection as `productOf` reads it; null when it is not one. */
function readProduct(value: unknown): Product | null {
  if (!isObject(value) || !Array.isArray(value.matched)) return null;
  const matched = value.matched.filter(
    (term): term is string => typeof term === "string" && TERM.test(term),
  );
  // A product that carries no term of the list was never joined, and a term that is none is not one.
  if (matched.length === 0 || matched.length !== value.matched.length) return null;
  return productOf(value, matched);
}

/**
 * The row of the AI list in the projection and the term it is joined by; null when it is not one of
 * a searched number, or has no company.
 */
function readAiRow(value: unknown): { row: AiRow; term: string } | null {
  if (!isObject(value)) return null;
  const submission = lineOf(stringOf(value.submission));
  const term = termOf(submission);
  const company = cellOf(value.company, MAX_COMPANY_CHARS);
  if (term === null || company === "") return null;
  return {
    row: { submission, device: cellOf(value.device, MAX_DEVICE_CHARS), company },
    term: term.text,
  };
}

/** The parts of a projection, or null when the text is not one. */
function shapeOf(
  text: string,
): { lastUpdated: string; skipped: number; products: unknown[]; aiRows: unknown[] } | null {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(root)) return null;
  const { lastUpdated, skipped, products, aiRows } = root;
  if (
    typeof lastUpdated !== "string" ||
    !DAY.test(lastUpdated) ||
    dayOf(lastUpdated) !== lastUpdated ||
    typeof skipped !== "number" ||
    !Number.isInteger(skipped) ||
    skipped < 0 ||
    !Array.isArray(products) ||
    !Array.isArray(aiRows)
  ) {
    return null;
  }
  return { lastUpdated, skipped, products, aiRows };
}

/**
 * How open the status of a recall is: the FDA's three, the most open first. A status that is none
 * of them, or missing, is kept as the lowest.
 */
const STATUS_RANKS: ReadonlyMap<string, number> = new Map([
  ["Open, Classified", 3],
  ["Completed", 2],
  ["Terminated", 1],
]);
const TERMINATED = "Terminated";
const rankOf = (status: string): number => STATUS_RANKS.get(status) ?? 0;

/** The most open status of the products; of equal ones, the one that sorts first. */
function openestStatus(statuses: readonly string[]): string {
  let best = "";
  let bestRank = -1;
  for (const status of statuses) {
    const rank = rankOf(status);
    if (rank > bestRank || (rank === bestRank && compareText(status, best) < 0)) {
      best = status;
      bestRank = rank;
    }
  }
  return best;
}

/** The values that are not empty, once each, in the order they first appear. */
const distinct = (values: readonly string[]): string[] => [
  ...new Set(values.filter((value) => value !== "")),
];

/** The first `shown` of the items as one list, and how many more there are. */
function listOf(items: readonly string[], shown: number): string {
  const rest = items.length - shown;
  const head = items.slice(0, shown).join("; ");
  return rest > 0 ? `${head}, and ${rest} more` : head;
}

const deviceText = (row: AiRow): string =>
  `${row.device === "" ? "Unnamed device" : row.device} (${row.submission}, ${row.company})`;

/**
 * The text of a record, at most MAX_SUMMARY_CHARS long. When the whole is longer, the sentences
 * before the closing one are cut and say so: the closing sentence always ends the text.
 */
function summaryOf(sentences: readonly string[]): string {
  const whole = joinSentences([...sentences, CLOSING]);
  if (whole.length <= MAX_SUMMARY_CHARS) return whole;
  const kept = shorten(joinSentences(sentences), MAX_SUMMARY_CHARS - CLOSING.length - 1);
  return `${kept} ${CLOSING}`;
}

/** The record of one event: its products (sorted by recall number) and the rows of the AI list by term. */
function recordOf(
  eventNumber: string,
  products: readonly Product[],
  rowsByTerm: ReadonlyMap<string, readonly AiRow[]>,
): ParsedRecord {
  const firms = distinct(products.map((product) => product.recalling_firm));
  const status = openestStatus(products.map((product) => product.recall_status));
  const initiated = products
    .map((product) => product.event_date_initiated)
    .reduce((first, day) => (day < first ? day : first));
  const posted = products.reduce<string | null>(
    (first, { event_date_posted: day }) =>
      day !== null && (first === null || day < first) ? day : first,
    null,
  );
  // The event ended when its products did: the day one product ended among open ones is no day of
  // the event.
  const terminated =
    status === TERMINATED
      ? products.reduce<string | null>(
          (last, { event_date_terminated: day }) =>
            day !== null && (last === null || day > last) ? day : last,
          null,
        )
      : null;
  const reason = products.find((product) => product.reason_for_recall !== "")?.reason_for_recall;
  const numbers = products.map((product) => product.product_res_number);

  const covered = new Map<string, AiRow>();
  for (const term of new Set(products.flatMap((product) => product.matched))) {
    for (const row of rowsByTerm.get(term) ?? []) covered.set(JSON.stringify(row), row);
  }
  const devices = [...covered.values()].sort(byRow);
  const companies = distinct(devices.map((row) => row.company));
  const submissions = distinct(devices.map((row) => row.submission));

  return {
    sourceRecordId: eventNumber,
    recordType: "ai_device_recall",
    title: `FDA recall of an AI-enabled device: ${firms[0] ?? "unnamed firm"} (event ${eventNumber})`,
    summary: summaryOf([
      `${FDA_RECALL_RECORD_MARK}, joined to the FDA list of AI-enabled medical devices.`,
      sentence("Recall event", eventNumber),
      sentence("Recalling firm", listOf(firms, FIRMS_SHOWN)),
      sentence("Initiated", initiated),
      sentence("Posted", posted ?? ""),
      sentence("Terminated", terminated ?? ""),
      sentence("Status", status),
      sentence(
        "Root cause, as the FDA records it",
        listOf(distinct(products.map((product) => product.root_cause_description)), CAUSES_SHOWN),
      ),
      sentence("Reason for the recall", reason ?? ""),
      sentence(
        "Products recalled",
        [
          String(products.length),
          ...distinct(products.map((product) => product.product_description)).slice(
            0,
            PRODUCTS_SHOWN,
          ),
        ].join("; "),
      ),
      sentence(
        "Devices on the FDA AI list that the recall covers",
        listOf(devices.map(deviceText), DEVICES_SHOWN),
      ),
      sentence("Recall numbers", listOf(numbers, NUMBERS_SHOWN)),
      CLASS_NOTE,
    ]),
    url: `${EVENT_PAGE}${eventNumber}`,
    identifiers: {
      eventNumber,
      recallingFirms: firms.slice(0, IDENTIFIERS_SHOWN),
      productResNumbers: numbers.slice(0, IDENTIFIERS_SHOWN),
      submissionNumbers: submissions.slice(0, IDENTIFIERS_SHOWN),
      status,
    },
    // The names of the recalling firms and of the companies of the AI list, and nothing else: no
    // address and no FEI number is a key.
    matchKeys: nameKeysOf([...firms, ...companies]).slice(0, MAX_KEYS),
    publishedAt: initiated,
    sourceUpdatedAt: null,
  };
}

const NOT_THE_LIST = { records: [], errors: 1, sourceVersion: null, root: null };

/** Event numbers as numbers: the shorter first, then by text. */
const byEvent = (a: string, b: string): number => a.length - b.length || compareText(a, b);

const parse: Connector["parse"] = (snapshot) => {
  const shape = snapshot.bodies.length === 1 ? shapeOf(snapshot.bodies[0]) : null;
  if (shape === null) return NOT_THE_LIST;

  let unreadable = shape.skipped;
  const products = new Map<string, Product>();
  for (const value of shape.products) {
    const product = readProduct(value);
    if (product === null) unreadable += 1;
    else if (!products.has(product.product_res_number)) {
      products.set(product.product_res_number, product);
    }
  }
  const rowsByTerm = new Map<string, AiRow[]>();
  for (const value of shape.aiRows) {
    const read = readAiRow(value);
    if (read === null) {
      unreadable += 1;
      continue;
    }
    const sameTerm = rowsByTerm.get(read.term);
    if (sameTerm === undefined) rowsByTerm.set(read.term, [read.row]);
    else sameTerm.push(read.row);
  }

  const events = new Map<string, Product[]>();
  for (const product of [...products.values()].sort((a, b) =>
    compareText(a.product_res_number, b.product_res_number),
  )) {
    const event = events.get(product.res_event_number);
    if (event === undefined) events.set(product.res_event_number, [product]);
    else event.push(product);
  }
  // More events than the dataset has recalls of the AI-listed devices, by far: it is not the list.
  if (events.size > MAX_EVENTS) return NOT_THE_LIST;

  const rows = shape.skipped + shape.products.length + shape.aiRows.length;
  const refused = unreadable > unreadableAllowed(rows);
  return {
    records: [...events.entries()]
      .sort(([a], [b]) => byEvent(a, b))
      .map(([eventNumber, event]) => recordOf(eventNumber, event, rowsByTerm)),
    errors: refused ? unreadable : 0,
    skipped: refused ? 0 : unreadable,
    sourceVersion: shape.lastUpdated,
    root: ROOT,
  };
};

/** Whether an address is the API's: https, the host api.fda.gov, no port other than 443, no user. */
function isApiAddress(text: string): boolean {
  try {
    const url = new URL(text);
    return (
      url.protocol === "https:" &&
      url.hostname === API_HOST &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

function chunksOf<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let at = 0; at < items.length; at += size) chunks.push(items.slice(at, at + size));
  return chunks;
}

function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new NotTheListError();
  }
}

/**
 * The day of the dataset's last update, from the probe's answer. The answer is the dataset's when
 * it has that day (`YYYY-MM-DD`) and says that the dataset holds more than 10,000 products.
 */
function lastUpdatedOf(text: string): string {
  const root = jsonOf(text);
  const meta = isObject(root) ? root.meta : undefined;
  const lastUpdated = isObject(meta) ? meta.last_updated : undefined;
  const counts = isObject(meta) ? meta.results : undefined;
  const total = isObject(counts) ? counts.total : undefined;
  if (
    typeof lastUpdated !== "string" ||
    !DAY.test(lastUpdated) ||
    dayOf(lastUpdated) !== lastUpdated ||
    typeof total !== "number" ||
    !(total > MIN_DATASET_TOTAL)
  ) {
    throw new NotTheListError();
  }
  return lastUpdated;
}

/** The products and the total of one answer of a search; not the list when it has neither. */
function answerOf(text: string): { results: unknown[]; total: number } {
  const root = jsonOf(text);
  const results = isObject(root) ? root.results : undefined;
  const meta = isObject(root) ? root.meta : undefined;
  const counts = isObject(meta) ? meta.results : undefined;
  const total = isObject(counts) ? counts.total : undefined;
  if (
    !Array.isArray(results) ||
    typeof total !== "number" ||
    !Number.isInteger(total) ||
    total < 0
  ) {
    throw new NotTheListError();
  }
  return { results, total };
}

const searchUrl = (field: Term["field"], terms: readonly string[], skip: number): string =>
  `${RECALL_ENDPOINT}?search=${field}:(${terms.join("+OR+")})&limit=${PAGE_SIZE}${
    skip === 0 ? "" : `&skip=${skip}`
  }`;

/** Waits `ms` milliseconds. */
export type Sleep = (ms: number) => Promise<void>;
const wait: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The connector, with the wait between requests injectable: a test hands it a function that does
 * not wait.
 */
export function createFdaRecallsConnector({ sleep = wait }: { sleep?: Sleep } = {}): Connector {
  return {
    id: "fda_device_recalls",
    version: 1,
    async download(fetch, validators) {
      let requests = 0;
      let bytes = 0;

      /**
       * One GET with no validators: paced, counted against the caps of the download, and from the
       * host it was asked of after redirects. A 304 is no answer to a request that sent nothing to
       * be compared.
       */
      const ask = async (url: string, limits: Limits, isPinned: (address: string) => boolean) => {
        if (requests >= MAX_REQUESTS) throw new BodyTooLargeError();
        if (requests > 0) await sleep(REQUEST_GAP_MS);
        requests += 1;
        const response = await fetch(url, {}, limits);
        if (response.notModified) throw new FetchError("unreachable");
        if (!isPinned(response.url)) throw new NotTheListError();
        bytes += response.body.length;
        if (bytes > MAX_ANSWER_BYTES) throw new BodyTooLargeError();
        return response;
      };

      // 1. The probe: the endpoint is the dataset. Every 404 below is read in this light.
      const lastUpdated = lastUpdatedOf(bodyText(await ask(PROBE_URL, PROBE_LIMITS, isApiAddress)));

      // 2. The AI list, whole and unconditionally.
      const csv = bodyText(await ask(FDA_URL, LIST_LIMITS, isFdaAddress));
      const rows = readFdaListRows(csv);
      if (rows === null) throw new NotTheListError();

      // 3. The composite validator: nothing is joined when neither source changed.
      const validator = `recalls:${lastUpdated};list:${createHash("sha256")
        .update(csv)
        .digest("hex")
        .slice(0, 16)}`;
      if (validators.lastModified === validator) return "unchanged";

      // 4. The join, and 5. the projection of each answer as it comes.
      const searched = searchedOf(rows);
      const wanted = { k: new Set(searched.k), pma: new Set(searched.pma) };
      const products = new Map<string, Product>();
      let skipped = 0;

      /**
       * The products of one answer that carry a term of the list, cut down at once to what a record
       * uses, and how many of them could not be read. A product that carries no term of the list is
       * not one the search was for.
       */
      const project = (results: readonly unknown[]): { found: Product[]; unreadable: number } => {
        const found: Product[] = [];
        let unreadable = 0;
        for (const raw of results) {
          if (!isObject(raw)) {
            unreadable += 1;
            continue;
          }
          const matched = matchedOf(raw, wanted);
          if (matched.length === 0) continue;
          const product = productOf(raw, matched);
          if (product === null) unreadable += 1;
          else found.push(product);
        }
        return { found, unreadable };
      };

      /**
       * The pages of one search; "too_large" when an answer was cut at its limit. What it found
       * joins only when its last page has been read: a batch that is split is asked again, and its
       * products are not counted twice.
       */
      const search = async (field: Term["field"], terms: readonly string[]) => {
        const found: Product[] = [];
        let unreadable = 0;
        let pages = 1;
        for (let page = 0; page < pages; page += 1) {
          let response: Awaited<ReturnType<typeof ask>>;
          try {
            response = await ask(
              searchUrl(field, terms, page * PAGE_SIZE),
              JOIN_LIMITS,
              isApiAddress,
            );
          } catch (error) {
            if (error instanceof FetchError && error.reason === "not_found") {
              // No match for this search: the probe has shown that the endpoint is the dataset. A
              // page after the first that is missing is no match, it is a search that did not page
              // as it was asked, and a part of a join never reaches the copy.
              if (page === 0) return "done";
              throw new NotTheListError();
            }
            throw error;
          }
          if (response.truncated) return "too_large";
          const { results, total } = answerOf(bodyText(response));
          if (page === 0) {
            if (total > MAX_PAGES * PAGE_SIZE) throw new NotTheListError();
            pages = Math.ceil(total / PAGE_SIZE);
          }
          // A page that is not the last and is not full: the API did not page as it was asked.
          if (page + 1 < pages && results.length < PAGE_SIZE) throw new NotTheListError();
          const answered = project(results);
          found.push(...answered.found);
          unreadable += answered.unreadable;
        }
        for (const product of found) {
          // A product that two searches return is the same product, matched to the same terms: the
          // first answer describes it.
          if (!products.has(product.product_res_number)) {
            products.set(product.product_res_number, product);
          }
        }
        skipped += unreadable;
        return "done";
      };

      /** A batch, split in half when its answer is too large, down to MIN_SPLIT numbers. */
      const join = async (field: Term["field"], terms: readonly string[]): Promise<void> => {
        if ((await search(field, terms)) === "done") return;
        if (terms.length <= MIN_SPLIT) throw new BodyTooLargeError();
        const half = Math.ceil(terms.length / 2);
        await join(field, terms.slice(0, half));
        await join(field, terms.slice(half));
      };

      for (const batch of chunksOf(searched.k, K_BATCH)) await join("k_numbers", batch);
      for (const batch of chunksOf(searched.pma, PMA_BATCH)) await join("pma_numbers", batch);

      const joined = [...products.values()].sort((a, b) =>
        compareText(a.product_res_number, b.product_res_number),
      );
      const projection: Projection = {
        lastUpdated,
        skipped,
        products: joined,
        aiRows: joinedRowsOf(rows, new Set(joined.flatMap((product) => product.matched))),
      };
      return { bodies: [JSON.stringify(projection)], etag: null, lastModified: validator, bytes };
    },
    parse,
  };
}

export const fdaRecallsConnector: Connector = createFdaRecallsConnector();
