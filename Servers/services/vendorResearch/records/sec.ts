/**
 * SEC EDGAR: the filings of the companies that report to the United States Securities and Exchange
 * Commission. Since December 2023 a company that has a material cybersecurity incident reports it
 * to its investors in a Form 8-K under Item 1.05, and that is the record this module reads: the
 * vendor's own report of an incident in its own systems, filed with a regulator. The data needs no
 * key (the SEC asks automated clients to name themselves, which the bot's User-Agent does), and the
 * documents of the archive are open to robots (`Allow: /Archives/edgar/data`).
 *
 * A vendor is a registrant only when the name of the registrant is a name of the vendor, letter
 * for letter (see match.ts), and only the names of the vendor are tried, never the brand of its
 * domain: a registrant of the same name that is another company would give its filings to the
 * wrong vendor, and a vendor that is not found gets no record, which is no harm. A CIK a person
 * stored on the vendor names its registrant, and then no name is tried.
 */
import { shortName } from "../identity";
import type { ResearchTarget } from "../target";
import { cleanText } from "../text";
import { matchesVendor } from "./match";
import { joinSentences, sentence } from "./sentence";
import { MAX_RECORDS, type SourceRecord } from "./types";

export const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
/** The file is 0.8 MB today. */
export const SEC_TICKERS_MAX_BYTES = 4 * 1024 * 1024;
/** The filings of a large registrant are 160 KB today. */
export const SEC_SUBMISSIONS_MAX_BYTES = 4 * 1024 * 1024;

/** The item of Form 8-K for a material cybersecurity incident. */
const INCIDENT_ITEM = "1.05";
const MAX_SECTION_CHARS = 2500;
/** A heading with less after it than this is a mention and not the item. */
const MIN_SECTION_CHARS = 80;

/** The address of the filings of a registrant, by its CIK of ten digits. */
export const secSubmissionsUrl = (cik: string): string =>
  `https://data.sec.gov/submissions/CIK${cik}.json`;

const textOf = (value: unknown): string => (typeof value === "string" ? value : "");

const CIK = /^\d{1,10}$/;
/** A CIK of ten digits, from a number or a text of digits; null for anything else. */
function cikOf(value: unknown): string | null {
  const text = typeof value === "number" ? String(value) : textOf(value).trim();
  return CIK.test(text) ? text.padStart(10, "0") : null;
}

/**
 * The CIK a person stored on the vendor, as ten digits: it names the registrant, so the vendor is
 * asked by it and not by its name (Ruling 14 of the M2 plan). Null when none is stored, or when
 * what is stored is no CIK.
 */
export const storedCikOf = (target: ResearchTarget): string | null =>
  target.identifiers?.secCik === undefined ? null : cikOf(target.identifiers.secCik);

export interface Registrant {
  /** Ten digits. */
  cik: string;
  title: string;
}

/** The registrants of the file that the SEC publishes of its companies with a ticker. */
export function parseTickers(body: unknown): Registrant[] {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return [];
  const registrants: Registrant[] = [];
  for (const item of Object.values(body)) {
    if (typeof item !== "object" || item === null) continue;
    const fields = item as Record<string, unknown>;
    const cik = cikOf(fields.cik_str);
    const title = textOf(fields.title).trim();
    if (cik === null || title === "") continue;
    registrants.push({ cik, title });
  }
  return registrants;
}

const nameMatches = (name: string, keys: readonly string[]): boolean =>
  matchesVendor(name, keys) || matchesVendor(shortName(name), keys);

/**
 * The registrant that has a name of the vendor. Several entries of one CIK (the classes of shares)
 * are one registrant; entries of different CIKs are not, and then it is not known which is meant.
 */
export function registrantOf(
  registrants: readonly Registrant[],
  keys: readonly string[],
): Registrant | null {
  const found = new Map<string, Registrant>();
  for (const registrant of registrants) {
    if (nameMatches(registrant.title, keys) && !found.has(registrant.cik)) {
      found.set(registrant.cik, registrant);
    }
  }
  return found.size === 1 ? [...found.values()][0] : null;
}

export interface Filing {
  /** `0001262039-26-000003` */
  accession: string;
  form: string;
  /** YYYY-MM-DD */
  filedAt: string;
  items: string[];
  /** The file name of the main document. */
  document: string;
}

export interface Submissions {
  cik: string;
  name: string;
  /** The Form 8-K filings that report Item 1.05. */
  filings: Filing[];
}

const ACCESSION = /^\d{10}-\d{2}-\d{6}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A name of a file in the archive, and nothing that moves to another directory. */
const DOCUMENT = /^[A-Za-z0-9._-]+$/;
const FORMS: ReadonlySet<string> = new Set(["8-K", "8-K/A"]);

/** The filings of a registrant that report a material cybersecurity incident; null for a document that is no such list. */
export function parseSubmissions(body: unknown): Submissions | null {
  if (typeof body !== "object" || body === null) return null;
  const root = body as Record<string, unknown>;
  const cik = cikOf(root.cik);
  const name = textOf(root.name).trim();
  const recent = (root.filings as { recent?: unknown } | null | undefined)?.recent;
  if (cik === null || name === "" || typeof recent !== "object" || recent === null) return null;
  const columns = ["accessionNumber", "filingDate", "form", "items", "primaryDocument"].map(
    (key) => (recent as Record<string, unknown>)[key],
  );
  if (!columns.every(Array.isArray)) return null;
  const [accessions, days, forms, itemLists, documents] = columns as unknown[][];
  const filings: Filing[] = [];
  // A column shorter than the first gives an empty text, and an empty text is not a filing.
  for (let index = 0; index < accessions.length; index += 1) {
    const accession = textOf(accessions[index]);
    const filedAt = textOf(days[index]);
    const form = textOf(forms[index]);
    const document = textOf(documents[index]);
    const items = textOf(itemLists[index])
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "");
    if (
      !ACCESSION.test(accession) ||
      !DAY.test(filedAt) ||
      !FORMS.has(form) ||
      !DOCUMENT.test(document) ||
      !items.includes(INCIDENT_ITEM)
    ) {
      continue;
    }
    filings.push({ accession, form, filedAt, items, document });
  }
  return { cik, name, filings };
}

/**
 * The filings to write out: those filed since `cutoff`, the newest first (one day by the greater
 * accession number), at most MAX_RECORDS.sec of them. What was left out is counted.
 */
export function incidentFilings(
  submissions: Submissions,
  input: { cutoff?: string },
): { filings: Filing[]; omitted: { old?: number; more?: number } } {
  const recent = submissions.filings.filter(
    (filing) => input.cutoff === undefined || filing.filedAt >= input.cutoff,
  );
  recent.sort(
    (a, b) => b.filedAt.localeCompare(a.filedAt) || b.accession.localeCompare(a.accession),
  );
  const filings = recent.slice(0, MAX_RECORDS.sec);
  const old = submissions.filings.length - recent.length;
  const more = recent.length - filings.length;
  return {
    filings,
    omitted: { ...(old > 0 ? { old } : {}), ...(more > 0 ? { more } : {}) },
  };
}

/** The main document of a filing, in the archive of its registrant. */
export const filingUrl = (cik: string, filing: Filing): string =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${filing.accession.replace(/-/g, "")}/${filing.document}`;

const ITEM_HEADING = /\bItem\s*(\d{1,2}\.\d{2})\b/gi;

/**
 * The text of Item 1.05 in the text of a filing: from the first heading of the item that has a
 * text of its own to the heading of the next item, at most MAX_SECTION_CHARS. A mention of the
 * item inside another one, or a heading with next to nothing after it, is passed over. Null when
 * there is none.
 */
export function item105Text(text: string): string | null {
  const flat = cleanText(text).replace(/\s+/g, " ");
  const headings = [...flat.matchAll(ITEM_HEADING)];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (heading[1] !== INCIDENT_ITEM) continue;
    const start = heading.index + heading[0].length;
    const next = headings.slice(index + 1).find((other) => other[1] !== INCIDENT_ITEM);
    const section = flat
      .slice(start, next === undefined ? flat.length : next.index)
      .replace(/^[\s.:–—-]+/, "")
      .slice(0, MAX_SECTION_CHARS)
      .trim();
    if (section.length >= MIN_SECTION_CHARS) return section;
  }
  return null;
}

const itemsSentence = (items: readonly string[]): string =>
  items
    .map((item) => (item === INCIDENT_ITEM ? `${item} (Material Cybersecurity Incidents)` : item))
    .join(", ");

/** A filing as a source: its facts and, when its text could be read, the text of Item 1.05. */
export function secRecord(
  submissions: Submissions,
  filing: Filing,
  excerpt: string | null,
): SourceRecord {
  return {
    url: filingUrl(submissions.cik, filing),
    title: `${submissions.name}: Form ${filing.form}, Item 1.05 (material cybersecurity incident), filed ${filing.filedAt}`,
    text: joinSentences([
      "SEC EDGAR (sec.gov).",
      sentence("Company", submissions.name),
      sentence("Form", filing.form),
      sentence("Filed", filing.filedAt),
      sentence("Items reported", itemsSentence(filing.items)),
      excerpt === null ? "" : sentence("Item 1.05", excerpt),
    ]),
    publishedAt: filing.filedAt,
  };
}
