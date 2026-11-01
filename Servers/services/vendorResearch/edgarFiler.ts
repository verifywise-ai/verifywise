/**
 * Who filed an EDGAR filing (Q28, spec D3.2 step 5). The address of a filing names the folder it is
 * shown under, and EDGAR shows a filing under every party's CIK: a Schedule 13G that an investor
 * files about a company, and a Form 4 that an insider files for it, sit in the company's folder
 * beside the company's own 10-K. So a filing under the CIK stored on the vendor is the vendor's own
 * word only when the vendor filed it, and the header of the filing, which names every party and its
 * role, says so.
 *
 * - **The roles.** FILER, FILED-BY and REPORTING-OWNER file; SUBJECT-COMPANY and ISSUER are what
 *   others file about. A CIK that holds a filing role is the filer (`vendor`); a CIK that holds only
 *   the other two, or that the header does not name, is not (`other`). A co-registrant filing names
 *   several filers, and a company that tenders for its own shares is both the subject and the filer.
 * - **The header.** `<accession>.hdr.sgml` in the filing's folder holds it, one value to a line.
 *   A header names a role as a tag that opens a block (`<FILER>`) with the CIK a line below it
 *   (`<CIK>`), or as the label of a line of the submission's text header (`FILER:`) with `CENTRAL
 *   INDEX KEY:` below it. Either form is read, so that the answer does not depend on which of them
 *   the file is written in. The scan needs no closing tag, goes one line at a time over at most
 *   256 KB, and keeps the roles and the digits of the CIKs only: no name and no address of a party,
 *   which are the filer's text.
 * - **The request.** One request for each accession, on a turn of the SEC's limit that every worker
 *   shares (records/sharedSpacer.ts), naming the contact of Q4 in its User-Agent. A body that was
 *   cut is not read: half a CIK is another company's. The answer is kept for 24 hours, as the
 *   parties of the filing and not as an answer for one CIK, since a filing never changes and two
 *   vendors of two organizations can be two of its parties. The memory holds 1,000 filings.
 * - **What it does not know.** Without the contact of Q4 (the gate is closed), when the SEC's turn
 *   is refused (it is busy, not down), when the request fails or the body was cut, the answer is
 *   null, and a null is not kept: the next run asks again. The filing is then the filer's document,
 *   as any other filing is (classify.ts, step 6). Nothing here throws. A failure is logged by its
 *   kind in fixed words, never with an address, an accession or a CIK.
 */
import logger from "../../utils/logger/fileLogger";
import { ANY_CONTENT_TYPE, FetchError, guardedFetch } from "../webResearch/guardedFetch";
import { isOnDomain } from "../webResearch/publicUrl";
import { createMemo } from "./records/memo";
import {
  SEC_LIMITS,
  SEC_SPACER_KEY,
  applicationRedis,
  createSharedSpacer,
} from "./records/sharedSpacer";
import type { Spacer } from "./records/spacer";
import type { EdgarFiler } from "./sourceRegistry/classify";
import { secUserAgent } from "./vrdb/connectors/sec";
import { SEC_CONTACT } from "./vrdb/gates";

/** The roles of a party in a filing that the header names; others are left out. */
export const FILING_ROLES = [
  "FILER",
  "FILED-BY",
  "REPORTING-OWNER",
  "SUBJECT-COMPANY",
  "ISSUER",
] as const;
export type FilingRole = (typeof FILING_ROLES)[number];

/** The roles of a party that filed the filing; the others are the subject of what others filed. */
const FILING_PARTY_ROLES: ReadonlySet<FilingRole> = new Set<FilingRole>([
  "FILER",
  "FILED-BY",
  "REPORTING-OWNER",
]);

/** A party of a filing: its role and its CIK as ten digits. Nothing else of it is kept. */
export interface FilingParty {
  role: FilingRole;
  cik: string;
}

const SEC_HOST = "sec.gov";

/** The most of a header that is requested, and read; a header with more is cut, and not read. */
const MAX_HEADER_BYTES = 256 * 1024;
/** A line of the header is far shorter; a longer one is not a role or a CIK, and is not looked at. */
const MAX_LINE_CHARS = 200;
const DAY_MS = 24 * 60 * 60_000;
const MAX_REMEMBERED_FILINGS = 1000;

/** The folder of a filing in the archive: 18 digits, its accession number without the dashes. */
const ARCHIVE_FOLDER = /^\/?Archives\/edgar\/data\/\d{1,10}\/(\d{18})(?:\/|$)/;
const ACCESSION = /^\d{10}-\d{2}-\d{6}$/;
const CIK_DIGITS = /^\d{1,10}$/;

/** `000190010126000007` is the accession number `0001900101-26-000007`. */
const withDashes = (folder: string): string =>
  `${folder.slice(0, 10)}-${folder.slice(10, 12)}-${folder.slice(12)}`;

function accessionInPath(path: string | null): string | null {
  const match = path === null ? null : ARCHIVE_FOLDER.exec(path);
  return match === null ? null : withDashes(match[1]);
}

/**
 * The accession number, with its dashes, of the filing at an address of the SEC: the folder of 18
 * digits after /Archives/edgar/data/<cik>/, the accession_number parameter of /cgi-bin/viewer, or
 * the path in the `doc` parameter of the inline viewers (/ix, /ixviewer/ix.html). Null for any
 * other address, another host and an address that cannot be read.
 */
export function accessionOfFiling(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (!isOnDomain(url.hostname, SEC_HOST)) return null;
  if (/^\/ix(?:viewer\/ix\.html)?$/.test(url.pathname)) {
    return accessionInPath(url.searchParams.get("doc"));
  }
  if (url.pathname === "/cgi-bin/viewer") {
    const accession = url.searchParams.get("accession_number") ?? "";
    return ACCESSION.test(accession) ? accession : null;
  }
  return accessionInPath(url.pathname);
}

/** The header of a filing: in the folder of a CIK that is one of its parties, named by the accession. */
export const secHeaderUrl = (cik: string, accession: string): string =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/${accession}.hdr.sgml`;

/** The roles by the name a header gives them: a tag (`FILED-BY`) or the label of a line (`FILED BY`). */
const ROLE_OF: ReadonlyMap<string, FilingRole> = new Map<string, FilingRole>([
  ["FILER", "FILER"],
  ["FILED-BY", "FILED-BY"],
  ["FILED BY", "FILED-BY"],
  ["REPORTING-OWNER", "REPORTING-OWNER"],
  ["REPORTING OWNER", "REPORTING-OWNER"],
  ["SUBJECT-COMPANY", "SUBJECT-COMPANY"],
  ["SUBJECT COMPANY", "SUBJECT-COMPANY"],
  ["ISSUER", "ISSUER"],
]);

const CIK_TAG = "<CIK>";
const CIK_CLOSING_TAG = "</CIK>";
const CIK_LABEL = "CENTRAL INDEX KEY:";

/** The CIK of the rest of a CIK line, as ten digits; null when it is not one to ten digits. */
function cikOf(rest: string): string | null {
  const bare = (
    rest.endsWith(CIK_CLOSING_TAG) ? rest.slice(0, -CIK_CLOSING_TAG.length) : rest
  ).trim();
  return CIK_DIGITS.test(bare) ? bare.padStart(10, "0") : null;
}

/**
 * The parties a header names, in its order, each with its role and its CIK. The scan is line by
 * line: a line that opens a role (`<FILER>`, or `FILER:` in the text header) sets the current role,
 * and the next CIK line (`<CIK>0001900101`, or `CENTRAL INDEX KEY: 0001900101`) gives that role's
 * CIK and ends it; a closing tag of a role ends it too. Every other line is passed over, so the
 * scan does not depend on the closing tags, on the other tags of the header or on their order. It
 * reads at most 256 KB; when the text is longer, the line the limit cuts is dropped, since half of
 * a CIK is another company's. A line is looked at only up to MAX_LINE_CHARS and no pattern is
 * matched over it, so a hostile text of any shape is read in linear time. It never throws.
 */
export function parseFilingRoles(text: string): FilingParty[] {
  if (typeof text !== "string") return [];
  const cut = text.length > MAX_HEADER_BYTES;
  const body = cut ? text.slice(0, MAX_HEADER_BYTES) : text;
  // The line the limit falls in is whole only when the next character is the end of it.
  const end =
    cut && text.charAt(MAX_HEADER_BYTES) !== "\n" ? body.lastIndexOf("\n") + 1 : body.length;

  const parties: FilingParty[] = [];
  let role: FilingRole | null = null;
  for (let start = 0; start < end;) {
    const lineEnd = body.indexOf("\n", start);
    const stop = lineEnd < 0 ? end : lineEnd;
    const from = start;
    start = stop + 1;
    if (stop - from > MAX_LINE_CHARS) continue;

    const line = body.slice(from, stop).trim().toUpperCase();
    if (line.startsWith(CIK_TAG) || line.startsWith(CIK_LABEL)) {
      const cik = cikOf(line.slice(line.startsWith(CIK_TAG) ? CIK_TAG.length : CIK_LABEL.length));
      if (role !== null && cik !== null) parties.push({ role, cik });
      role = null;
    } else if (line.startsWith("</") && line.endsWith(">")) {
      if (ROLE_OF.has(line.slice(2, -1))) role = null;
    } else if (line.startsWith("<") && line.endsWith(">")) {
      role = ROLE_OF.get(line.slice(1, -1)) ?? role;
    } else if (line.endsWith(":")) {
      role = ROLE_OF.get(line.slice(0, -1).trim()) ?? role;
    }
  }
  return parties;
}

/**
 * Who filed the filing at an address, for the vendor whose stored CIK is given: `vendor` when that
 * CIK holds a filing role in it, `other` when it does not, null when that is not known. Never
 * throws.
 */
export type EdgarFilerResolver = (
  url: string,
  storedCik: string,
  signal: AbortSignal,
) => Promise<EdgarFiler | null>;

export interface EdgarFilerDeps {
  /**
   * The contact the SEC's User-Agent names (Q4); null while the gate is closed, and then nothing is
   * asked. Default SEC_CONTACT.
   */
  contact?: string | null;
  /** Takes the SEC's turns; by default those that every worker shares. */
  spacer?: Spacer;
  /** The guarded fetch of a public address; tests replace it. */
  fetch?: typeof guardedFetch;
  /** The time in milliseconds, for the memory. */
  clock?: () => number;
}

/** What stops the answer from being known without being a failure to log as one. */
class NotKnown extends Error {
  constructor(readonly why: "busy" | "too_long") {
    super(why);
  }
}

/** The name of an error, for a log line: its message can carry an address. */
function errorName(error: unknown): string {
  return error instanceof Error && /^[A-Za-z_$][\w$.]{0,59}$/.test(error.name)
    ? error.name
    : "unknown";
}

function logFailure(error: unknown): void {
  if (error instanceof NotKnown) {
    // A refused turn says the SEC is busy, which happens; there is nothing to say of it.
    if (error.why === "too_long") {
      logger.warn(
        "vendor research: the header of an EDGAR filing is longer than it is read, so its filer is not known",
      );
    }
    return;
  }
  // The reason of a fetch failure is one of a closed set of words.
  const what = error instanceof FetchError ? `reason ${error.reason}` : `error ${errorName(error)}`;
  logger.warn(`vendor research: the header of an EDGAR filing could not be read (${what})`);
}

/**
 * The resolver of who filed a filing (see the header). Make one for the process: its memory is the
 * 24 hours that a filing's header is kept, for every run.
 */
export function createEdgarFilerResolver(deps: EdgarFilerDeps = {}): EdgarFilerResolver {
  const contact = deps.contact === undefined ? SEC_CONTACT : deps.contact;
  const userAgent = contact === null ? null : secUserAgent(contact);
  const spacer =
    deps.spacer ?? createSharedSpacer(SEC_LIMITS, { redis: applicationRedis, key: SEC_SPACER_KEY });
  const fetchHeader = deps.fetch ?? guardedFetch;
  // The CIKs that filed each accession. An accession never changes; a failure is not remembered.
  const filers = createMemo<ReadonlySet<number>>(
    DAY_MS,
    MAX_REMEMBERED_FILINGS,
    deps.clock ?? Date.now,
  );

  async function filersOf(
    accession: string,
    cik: string,
    agent: string,
    signal: AbortSignal,
  ): Promise<ReadonlySet<number>> {
    if (!(await spacer(signal))) throw new NotKnown("busy");
    const response = await fetchHeader(secHeaderUrl(cik, accession), {
      signal,
      userAgent: agent,
      allowedContentTypes: ["text/plain", ANY_CONTENT_TYPE],
      maxBytes: MAX_HEADER_BYTES,
    });
    if (response.truncated) throw new NotKnown("too_long");
    const parties = parseFilingRoles(response.body.toString("utf8"));
    if (parties.length === 0) {
      // The SEC answered, and the answer holds no party: a header in a form this does not read.
      logger.warn("vendor research: the header of an EDGAR filing named no party");
    }
    return new Set(
      parties
        .filter(({ role }) => FILING_PARTY_ROLES.has(role))
        .map(({ cik: party }) => Number(party)),
    );
  }

  return async function filerRoleOf(url, storedCik, signal) {
    if (userAgent === null) return null;
    const accession = accessionOfFiling(url);
    if (accession === null || !CIK_DIGITS.test(storedCik)) return null;
    try {
      const filing = await filers.get(accession, () =>
        filersOf(accession, storedCik, userAgent, signal),
      );
      return filing.has(Number(storedCik)) ? "vendor" : "other";
    } catch (error) {
      logFailure(error);
      return null;
    }
  };
}
