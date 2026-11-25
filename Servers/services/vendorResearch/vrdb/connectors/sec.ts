/**
 * SEC EDGAR as a read-through source of the vendor risk database, behind Q4 (M2, spec D2.8,
 * Rulings 2, 4 and 14 of the M2 plan). The vendor is asked by the CIK a person stored on it, a
 * strong key, or else by the CIK of the one registrant of the SEC's tickers file whose name is a
 * name of the vendor (records/sec.ts `registrantOf`), which is weak (Q3): a registrant of that name
 * may be another company. The answer is the vendor's Form 8-K filings under Item 1.05, the newest
 * three of any age (the lookback applies when they are offered), each with the text of its Item
 * 1.05 when the run reads pages and the filing can be read.
 *
 * Every request to the SEC names the contact of Q4 in its User-Agent, as the SEC asks of automated
 * access: those of its API, and those that read a filing, which the connector makes with a page
 * reader of its own, since the reader of a run sends the bot's User-Agent, which has no address.
 * Every request but robots.txt takes a turn of the SEC's limit, which all the workers share
 * (records/sharedSpacer.ts): the read-through takes the turn of the list of filings (readThrough.ts),
 * and the connector one for the tickers file and one for each filing it reads. A refused turn of
 * the tickers file finds no key, and one of a filing leaves its record without the text. The
 * tickers file and the text of a filing are kept a day in the memory of the connector, which is one
 * for the process (lookup.ts). A run that reads no pages (it gives no reader) gets no text.
 */
import { FetchError, guardedFetch } from "../../../webResearch/guardedFetch";
import { type PageReader, createPageReader } from "../../../webResearch/readPage";
import { nameKeys } from "../../records/match";
import { createMemo } from "../../records/memo";
import {
  type Filing,
  type Registrant,
  SEC_SUBMISSIONS_MAX_BYTES,
  SEC_TICKERS_MAX_BYTES,
  SEC_TICKERS_URL,
  type Submissions,
  filingUrl,
  incidentFilings,
  item105Text,
  parseSubmissions,
  parseTickers,
  registrantOf,
  secRecord,
  secSubmissionsUrl,
  storedCikOf,
} from "../../records/sec";
import {
  SEC_LIMITS,
  SEC_SPACER_KEY,
  applicationRedis,
  createSharedSpacer,
} from "../../records/sharedSpacer";
import type { Spacer } from "../../records/spacer";
import type { FetchJson } from "../../records/types";
import { withoutHiddenCharacters } from "../../text";
import { cikKey } from "../keys";
import type { ParsedRecord } from "../types";
import type { ReadThroughConnector } from "./types";

const CIK_PREFIX = "cik:";
const CIK = /^\d{10}$/;
/** The SEC updates its tickers file daily, and a filing never changes once it is filed. */
const DAY_MS = 24 * 60 * 60_000;
/** How long the connector's page reader is kept (see `readerOf`). */
const READER_LIFETIME_MS = 60 * 60_000;

/** The User-Agent the SEC asks of automated access: who asks, and an address to reach them (Q4). */
export const secUserAgent = (contact: string): string => `VerifyWise ${contact}`;

/** The SEC's turn was too far off: it is busy, not down. */
class TurnRefused extends Error {}

export interface SecConnectorDeps {
  /** Takes the SEC's turns; by default those that every worker shares. */
  spacer?: Spacer;
  /** The time in milliseconds, for the memory of the tickers file and of the filings' text. */
  clock?: () => number;
  /**
   * The guarded fetch under the connector's own page reader, which reads the filings; the page
   * guard's by default.
   */
  fetchPage?: typeof guardedFetch;
}

function recordOf(
  submissions: Submissions,
  filing: Filing,
  key: string,
  excerpt: string | null,
): ParsedRecord {
  const { url, title, text } = secRecord(submissions, filing, excerpt);
  return {
    sourceRecordId: filing.accession,
    recordType: "sec_filing",
    // The company's name is the SEC's text: the characters nobody sees go (its summary is made of
    // sentences, which lose them already).
    title: withoutHiddenCharacters(title),
    summary: text,
    url,
    identifiers: {
      cik: submissions.cik,
      accessionNumber: filing.accession,
      form: filing.form,
      items: filing.items,
    },
    matchKeys: [key],
    publishedAt: filing.filedAt,
    sourceUpdatedAt: null,
  };
}

/** The SEC as a read-through source, whose requests name `contact`, the address of Q4. */
export function secConnector(contact: string, deps: SecConnectorDeps = {}): ReadThroughConnector {
  const userAgent = secUserAgent(contact);
  const spacer =
    deps.spacer ?? createSharedSpacer(SEC_LIMITS, { redis: applicationRedis, key: SEC_SPACER_KEY });
  const clock = deps.clock ?? Date.now;
  const fetchPage = deps.fetchPage ?? guardedFetch;
  const registrants = createMemo<Registrant[]>(DAY_MS, 1, clock);
  const excerpts = createMemo<string | null>(DAY_MS, 200, clock);

  /**
   * The SEC's turn for the run of `signal`. The shared spacer answers false, and does not reject,
   * when that run is stopped before or during its wait on Redis: the refusal is then the run's
   * abort, not a busy SEC, so it fails with the abort's reason. A load that other runs share tells
   * them so (`registrantsOf` asks again for a run whose own signal is live).
   */
  const turn = async (signal: AbortSignal): Promise<void> => {
    if (await spacer(signal)) return;
    signal.throwIfAborted();
    throw new TurnRefused();
  };

  /**
   * The page reader that reads the filings: every request of it, robots.txt and the page, names the
   * contact (the SEC asks for it of all automated access). One for the connector, kept an hour: a
   * reader keeps the robots.txt of an origin for its life, and a robots.txt that could not be read
   * once allows nothing, so a reader kept for the life of the process would leave the archive
   * unread until a restart, and one kept a day would leave it unread for every run of that day,
   * and with nothing in the log but the missing text.
   */
  let pages: { read: PageReader; since: number } | undefined;
  const readerOf = (): PageReader => {
    const now = clock();
    if (pages === undefined || now - pages.since >= READER_LIFETIME_MS) {
      pages = {
        read: createPageReader({
          fetch: (url, options) => fetchPage(url, { ...options, userAgent }),
        }),
        since: now,
      };
    }
    return pages.read;
  };

  /**
   * The text of Item 1.05 of a filing; none when it cannot be read, which is no failure, and none
   * when the run reads no pages: the run's reader says that it does, and the connector reads with
   * its own, whose User-Agent the SEC accepts.
   *
   * The load is shared by the runs that ask for the filing at once (`excerpts`), and it waits on
   * the signal of the run that started it. When that run is stopped, the others get its abort: an
   * excerpt is optional, so a run whose own signal is live takes that, like any other failure of
   * the load, for no text, and its answer is saved as it would be without it. Only a run that was
   * stopped itself fails.
   */
  async function excerptOf(
    url: string,
    signal: AbortSignal,
    runReadsPages: boolean,
  ): Promise<string | null> {
    if (!runReadsPages) return null;
    try {
      return await excerpts.get(url, async () => {
        await turn(signal);
        return item105Text((await readerOf()(url, signal)).text);
      });
    } catch (error) {
      if (signal.aborted) throw error;
      return null;
    }
  }

  /**
   * The SEC's list of registrants, shared by the runs that ask for it at once (`registrants`). The
   * load waits on the signal of the run that started it, so its failure may be another run's
   * abort: a run whose own signal is live asks once more (a failed load is forgotten at once), with
   * a load of its own signal or one another run started since, and a second failure is its own. A
   * turn the SEC's spacer refused to a live run and an answer of the SEC (a status: 403, 429) are
   * no abort, and are not asked again: the SEC would be asked twice for one failure. A turn refused
   * because the run that started the load was stopped fails with that run's abort (`turn`).
   */
  async function registrantsOf(signal: AbortSignal, fetchJson: FetchJson): Promise<Registrant[]> {
    const load = () =>
      registrants.get(SEC_TICKERS_URL, async () => {
        await turn(signal);
        return parseTickers(
          await fetchJson(SEC_TICKERS_URL, { maxBytes: SEC_TICKERS_MAX_BYTES, signal, userAgent }),
        );
      });
    try {
      return await load();
    } catch (error) {
      const notAnAbort =
        error instanceof TurnRefused || (error instanceof FetchError && error.status !== undefined);
      if (signal.aborted || notAnAbort) throw error;
      return load();
    }
  }

  return {
    id: "sec",
    async keyOf(target, { signal, fetchJson }) {
      const stored = storedCikOf(target);
      if (stored !== null) return { key: cikKey(stored), weak: false };
      // The names of the vendor alone: the brand of its domain is no name of a company.
      const names = nameKeys({ ...target, domain: null });
      if (names.length === 0) return null;
      const list = await registrantsOf(signal, fetchJson);
      const registrant = registrantOf(list, names);
      return registrant === null ? null : { key: cikKey(registrant.cik), weak: true };
    },
    async fetch(key, { signal, fetchJson, readPage }) {
      const cik = key.slice(CIK_PREFIX.length);
      if (!key.startsWith(CIK_PREFIX) || !CIK.test(cik)) {
        throw new Error("The SEC is asked by a CIK");
      }
      const submissions = parseSubmissions(
        await fetchJson(secSubmissionsUrl(cik), {
          maxBytes: SEC_SUBMISSIONS_MAX_BYTES,
          signal,
          userAgent,
        }),
      );
      // A document that is no list of filings, or the list of another registrant, is not the answer.
      if (submissions === null || submissions.cik !== cik) {
        throw new FetchError("unsupported_type");
      }
      const { filings } = incidentFilings(submissions, {});
      const records = await Promise.all(
        filings.map(async (filing) =>
          recordOf(
            submissions,
            filing,
            key,
            await excerptOf(filingUrl(submissions.cik, filing), signal, readPage !== undefined),
          ),
        ),
      );
      // A filing is never taken back, so an answer that lacks one tells nothing of it.
      return { records, coversSince: null };
    },
  };
}
