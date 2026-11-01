/**
 * The SEC as a read-through source of the vendor risk database, behind Q4 (M2, spec D2.8, Rulings
 * 2, 4 and 14 of the M2 plan): the vendor is asked by the CIK a person stored on it, a strong key,
 * or else by the CIK of the one registrant that has a name of the vendor, which is found by the name
 * and so is weak (Q3); every request names the contact in its User-Agent and takes a turn of the
 * SEC's limit; the records are the vendor's Form 8-K filings under Item 1.05, each with its text
 * when the run reads pages, read by a page reader of the connector's own so that the requests that
 * read a filing name the contact too. The answers are written from the documented format, not
 * copied from the API.
 */
import { FetchError, type guardedFetch } from "../../../../webResearch/guardedFetch";
import type { PageReader } from "../../../../webResearch/readPage";
import {
  SEC_SUBMISSIONS_MAX_BYTES,
  SEC_TICKERS_MAX_BYTES,
  SEC_TICKERS_URL,
  secSubmissionsUrl,
} from "../../../records/sec";
import type { FetchJson } from "../../../records/types";
import type { ResearchTarget } from "../../../target";
import { SEC_CONTACT } from "../../gates";
import { secConnector, secUserAgent } from "../sec";

const NOW = new Date("2026-10-31T12:00:00Z");
const DAY_MS = 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;
const CONTACT = "sec@company.example";
const USER_AGENT = "VerifyWise sec@company.example";
const BRISE: ResearchTarget = {
  name: "Brise Networks, Inc.",
  domain: "brisenetworks.example",
  provides: "Network gear",
};
const CIK = "0001262039";
const KEY = `cik:${CIK}`;
const SUBMISSIONS = secSubmissionsUrl(CIK);
const FILING =
  "https://www.sec.gov/Archives/edgar/data/1262039/000126203926000003/brise-20261005.htm";

const tickers = {
  "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  "1": { cik_str: 1262039, ticker: "BRSE", title: "Brise Networks, Inc." },
};
const row = (over: Record<string, string> = {}) => ({
  accessionNumber: "0001262039-26-000003",
  filingDate: "2026-10-05",
  form: "8-K",
  items: "1.05,9.01",
  primaryDocument: "brise-20261005.htm",
  ...over,
});
const submissions = (rows = [row()], cik = CIK) => ({
  cik,
  name: "Brise Networks, Inc.",
  filings: {
    recent: {
      accessionNumber: rows.map((it) => it.accessionNumber),
      filingDate: rows.map((it) => it.filingDate),
      form: rows.map((it) => it.form),
      items: rows.map((it) => it.items),
      primaryDocument: rows.map((it) => it.primaryDocument),
    },
  },
});

const TEXT =
  "FORM 8-K CURRENT REPORT Item 1.05 Material Cybersecurity Incidents. On October 2, 2026, Brise Networks " +
  "detected unauthorized access to a part of its network and took the affected systems offline. " +
  "Item 9.01 Exhibits.";
const EXCERPT =
  "Material Cybersecurity Incidents. On October 2, 2026, Brise Networks detected unauthorized access " +
  "to a part of its network and took the affected systems offline.";

/** A fetch that answers from a table and keeps what it was asked: an address not in it is not found. */
function answering(answers: Record<string, unknown>) {
  const asked: Array<{ url: string; maxBytes: number; userAgent?: string }> = [];
  const fetchJson: FetchJson = async (url, { maxBytes, userAgent }) => {
    asked.push({ url, maxBytes, userAgent });
    const answer = answers[url];
    if (answer instanceof Error) throw answer;
    if (!(url in answers)) throw new FetchError("not_found");
    return answer;
  };
  return { fetchJson, asked };
}

/** A spacer that grants, or refuses, every turn, and counts them. */
function turns(grant = true) {
  let taken = 0;
  const spacer = async () => {
    taken += 1;
    return grant;
  };
  return { spacer, taken: () => taken };
}

const ROBOTS = "https://www.sec.gov/robots.txt";

/**
 * The page reader of a run. The connector reads a filing with a reader of its own, whose requests
 * name the contact, so the run's is no more than the sign that the run reads pages: one that is
 * called fails the test.
 */
const runReader: PageReader = async () => {
  throw new Error("the connector reads a filing with a reader of its own");
};

/**
 * The guarded fetch under the connector's own page reader, written from what the real one does: it
 * calls `beforeRequest`, which is where the reader checks robots.txt, and only then sends the
 * request, and it keeps the User-Agent of each request it sends. robots.txt is a missing file unless
 * `state.robots` gives a text, and every filing is an HTML page holding `state.filing`; an Error in
 * either is thrown.
 */
function archive() {
  const state: { filing: string | Error; robots: string | Error } = {
    filing: TEXT,
    robots: new FetchError("not_found"),
  };
  const asked: Array<{ url: string; userAgent?: string }> = [];
  const fetchPage: typeof guardedFetch = async (url, options) => {
    await options?.beforeRequest?.(new URL(url));
    asked.push({ url, userAgent: options?.userAgent });
    const isRobots = url === ROBOTS;
    const answer = isRobots ? state.robots : state.filing;
    if (answer instanceof Error) throw answer;
    return {
      url,
      status: 200,
      contentType: isRobots ? "text/plain" : "text/html; charset=utf-8",
      body: Buffer.from(isRobots ? answer : `<html><body><p>${answer}</p></body></html>`),
      truncated: false,
    };
  };
  return { fetchPage, asked, state };
}

const signal = new AbortController().signal;
const ctx = (fetchJson: FetchJson, readPage?: PageReader) => ({
  now: NOW,
  signal,
  fetchJson,
  ...(readPage === undefined ? {} : { readPage }),
});

describe("secConnector", () => {
  it("the User-Agent carries the contact", async () => {
    const { fetchJson, asked } = answering({
      [SEC_TICKERS_URL]: tickers,
      [SUBMISSIONS]: submissions(),
    });
    const connector = secConnector(CONTACT, { spacer: turns().spacer });

    const found = await connector.keyOf(BRISE, { signal, fetchJson });
    await connector.fetch(found!.key, ctx(fetchJson));

    expect(secUserAgent(CONTACT)).toBe(USER_AGENT);
    expect(asked).toEqual([
      { url: SEC_TICKERS_URL, maxBytes: SEC_TICKERS_MAX_BYTES, userAgent: USER_AGENT },
      { url: SUBMISSIONS, maxBytes: SEC_SUBMISSIONS_MAX_BYTES, userAgent: USER_AGENT },
    ]);
  });

  it("a stored CIK is asked directly, with no tickers file", async () => {
    const { fetchJson, asked } = answering({});
    const { spacer, taken } = turns();
    const stored = { ...BRISE, name: "Zed Holdings", identifiers: { secCik: CIK } };

    const found = await secConnector(CONTACT, { spacer }).keyOf(stored, { signal, fetchJson });

    expect(found).toEqual({ key: KEY, weak: false });
    expect(asked).toEqual([]);
    expect(taken()).toBe(0);
  });

  it("a CIK found by name is a weak match", async () => {
    const { fetchJson } = answering({ [SEC_TICKERS_URL]: tickers });
    const connector = secConnector(CONTACT, { spacer: turns().spacer });

    expect(await connector.keyOf(BRISE, { signal, fetchJson })).toEqual({ key: KEY, weak: true });
    // The names of the vendor are looked for, never the brand of its domain.
    expect(
      await connector.keyOf({ ...BRISE, name: "Zed Holdings" }, { signal, fetchJson }),
    ).toBeNull();
  });

  it("a stored value that is no CIK is no key of its own: the name is looked for", async () => {
    const { fetchJson, asked } = answering({ [SEC_TICKERS_URL]: tickers });
    const connector = secConnector(CONTACT, { spacer: turns().spacer });

    const found = await connector.keyOf(
      { ...BRISE, identifiers: { secCik: "CIK 12" } },
      { signal, fetchJson },
    );

    expect(found).toEqual({ key: KEY, weak: true });
    expect(asked.map((it) => it.url)).toEqual([SEC_TICKERS_URL]);
  });

  it("finds no key when two registrants have the name", async () => {
    const { fetchJson } = answering({
      [SEC_TICKERS_URL]: {
        "0": { cik_str: 1262039, ticker: "BRSE", title: "Brise Networks, Inc." },
        "1": { cik_str: 999, ticker: "BRS", title: "Brise Networks" },
      },
    });

    expect(
      await secConnector(CONTACT, { spacer: turns().spacer }).keyOf(BRISE, { signal, fetchJson }),
    ).toBeNull();
  });

  it("keeps the tickers file a day, for every vendor, and takes a turn of the SEC to ask for it", async () => {
    const { fetchJson, asked } = answering({ [SEC_TICKERS_URL]: tickers });
    const { spacer, taken } = turns();
    let clock = 1_000_000;
    const connector = secConnector(CONTACT, { spacer, clock: () => clock });

    await connector.keyOf(BRISE, { signal, fetchJson });
    await connector.keyOf({ ...BRISE, name: "Apple Inc." }, { signal, fetchJson });
    clock += DAY_MS - 1;
    await connector.keyOf(BRISE, { signal, fetchJson });
    const withinTheDay = asked.length;
    clock += 1;
    await connector.keyOf(BRISE, { signal, fetchJson });

    expect(withinTheDay).toBe(1);
    expect(asked.filter((it) => it.url === SEC_TICKERS_URL)).toHaveLength(2);
    expect(taken()).toBe(2);
  });

  it("asks nothing when the SEC's turn is refused, and finds no key", async () => {
    const { fetchJson, asked } = answering({ [SEC_TICKERS_URL]: tickers });

    await expect(
      secConnector(CONTACT, { spacer: turns(false).spacer }).keyOf(BRISE, { signal, fetchJson }),
    ).rejects.toThrow();
    expect(asked).toEqual([]);
  });

  it("only Item 1.05 filings are records", async () => {
    const { fetchJson } = answering({
      [SUBMISSIONS]: submissions([
        row(),
        row({ accessionNumber: "0001262039-26-000004", items: "2.02,9.01" }),
        row({ accessionNumber: "0001262039-26-000005", form: "10-K", items: "1.05" }),
      ]),
    });

    const { records, coversSince } = await secConnector(CONTACT, {
      spacer: turns().spacer,
    }).fetch(KEY, ctx(fetchJson));

    // A filing is never taken back, so the answer covers no window: a stored filing it lacks stays.
    expect(coversSince).toBeNull();
    expect(records).toEqual([
      {
        sourceRecordId: "0001262039-26-000003",
        recordType: "sec_filing",
        title:
          "Brise Networks, Inc.: Form 8-K, Item 1.05 (material cybersecurity incident), filed 2026-10-05",
        summary:
          "SEC EDGAR (sec.gov). Company: Brise Networks, Inc. Form: 8-K. Filed: 2026-10-05. " +
          "Items reported: 1.05 (Material Cybersecurity Incidents), 9.01.",
        url: FILING,
        identifiers: {
          cik: CIK,
          accessionNumber: "0001262039-26-000003",
          form: "8-K",
          items: ["1.05", "9.01"],
        },
        matchKeys: [KEY],
        publishedAt: "2026-10-05",
        sourceUpdatedAt: null,
      },
    ]);
  });

  it("keeps a filing of any age, the newest three: the lookback applies when they are offered", async () => {
    const rows = ["2024-02-01", "2024-09-01", "2025-03-01", "2025-11-01"].map((day, n) =>
      row({
        accessionNumber: `0001262039-2${n}-00000${n}`,
        filingDate: day,
        primaryDocument: `brise-${n}.htm`,
      }),
    );
    const { fetchJson } = answering({ [SUBMISSIONS]: submissions(rows) });

    const { records } = await secConnector(CONTACT, { spacer: turns().spacer }).fetch(
      KEY,
      ctx(fetchJson),
    );

    expect(records.map((record) => record.publishedAt)).toEqual([
      "2025-11-01",
      "2025-03-01",
      "2024-09-01",
    ]);
  });

  it("reads the Item 1.05 of a filing with a page reader of its own, on a turn of the SEC", async () => {
    const { fetchJson } = answering({ [SUBMISSIONS]: submissions() });
    const { fetchPage, asked } = archive();
    const { spacer, taken } = turns();

    const { records } = await secConnector(CONTACT, { spacer, fetchPage }).fetch(
      KEY,
      ctx(fetchJson, runReader),
    );

    expect(records[0].summary).toContain(`Item 1.05: ${EXCERPT}`);
    // The robots.txt of the archive first, as a page reader always asks for it, then the filing.
    expect(asked.map((request) => request.url)).toEqual([ROBOTS, FILING]);
    // The list of filings is asked on the read-through's turn (readThrough.ts); the filing on one of its own.
    expect(taken()).toBe(1);
  });

  it("names the contact in the requests that read a filing, as in those of the API", async () => {
    const { fetchJson } = answering({ [SUBMISSIONS]: submissions() });
    const { fetchPage, asked } = archive();

    await secConnector(CONTACT, { spacer: turns().spacer, fetchPage }).fetch(
      KEY,
      ctx(fetchJson, runReader),
    );

    // Neither the robots.txt of sec.gov nor the filing goes out with the bot's User-Agent, which has
    // no address to write to.
    expect(asked).toEqual([
      { url: ROBOTS, userAgent: USER_AGENT },
      { url: FILING, userAgent: USER_AGENT },
    ]);
  });

  it("with the contact of Q4, every request names tech@verifywise.ai: the tickers, the filings and the text of a filing", async () => {
    // The identity the SEC sees, in the form it asks for: the name of the company, then an e-mail address.
    expect(SEC_CONTACT).toBe("tech@verifywise.ai");
    const contact = SEC_CONTACT as string;
    expect(secUserAgent(contact)).toBe("VerifyWise tech@verifywise.ai");
    const api = answering({ [SEC_TICKERS_URL]: tickers, [SUBMISSIONS]: submissions() });
    const files = archive();
    const connector = secConnector(contact, { spacer: turns().spacer, fetchPage: files.fetchPage });

    const found = await connector.keyOf(BRISE, { signal, fetchJson: api.fetchJson });
    await connector.fetch(found!.key, ctx(api.fetchJson, runReader));

    expect(
      [...api.asked, ...files.asked].map((request) => [request.url, request.userAgent]),
    ).toEqual([
      [SEC_TICKERS_URL, "VerifyWise tech@verifywise.ai"],
      [SUBMISSIONS, "VerifyWise tech@verifywise.ai"],
      [ROBOTS, "VerifyWise tech@verifywise.ai"],
      [FILING, "VerifyWise tech@verifywise.ai"],
    ]);
  });

  it("reads no filing when the run reads no pages: no reader, no excerpt", async () => {
    const { fetchJson } = answering({ [SUBMISSIONS]: submissions() });
    const { fetchPage, asked } = archive();
    const { spacer, taken } = turns();

    const { records } = await secConnector(CONTACT, { spacer, fetchPage }).fetch(
      KEY,
      ctx(fetchJson),
    );

    expect(records[0].summary).not.toContain("Item 1.05:");
    expect(asked).toEqual([]);
    expect(taken()).toBe(0);
  });

  it("keeps the text of a filing: its page is read once", async () => {
    const { fetchJson } = answering({ [SUBMISSIONS]: submissions() });
    const { fetchPage, asked } = archive();
    const connector = secConnector(CONTACT, { spacer: turns().spacer, fetchPage });

    await connector.fetch(KEY, ctx(fetchJson, runReader));
    const { records: again } = await connector.fetch(KEY, ctx(fetchJson, runReader));

    expect(asked.filter((request) => request.url === FILING)).toHaveLength(1);
    expect(again[0].summary).toContain(`Item 1.05: ${EXCERPT}`);
  });

  it("asks for robots.txt once, whatever the number of filings it reads", async () => {
    const second = row({
      accessionNumber: "0001262039-26-000004",
      filingDate: "2026-10-06",
      primaryDocument: "brise-20261006.htm",
    });
    const { fetchJson } = answering({ [SUBMISSIONS]: submissions([row(), second]) });
    const { fetchPage, asked } = archive();

    const { records } = await secConnector(CONTACT, { spacer: turns().spacer, fetchPage }).fetch(
      KEY,
      ctx(fetchJson, runReader),
    );

    expect(records.every((record) => record.summary.includes("Item 1.05:"))).toBe(true);
    expect(asked.filter((request) => request.url === ROBOTS)).toHaveLength(1);
    expect(asked.map((request) => request.url).sort()).toEqual(
      [
        ROBOTS,
        FILING,
        "https://www.sec.gov/Archives/edgar/data/1262039/000126203926000004/brise-20261006.htm",
      ].sort(),
    );
  });

  it("gives the facts alone when the turn of the filing is refused: nothing is asked", async () => {
    const { fetchJson } = answering({ [SUBMISSIONS]: submissions() });
    const busy = archive();

    const { records } = await secConnector(CONTACT, {
      spacer: turns(false).spacer,
      fetchPage: busy.fetchPage,
    }).fetch(KEY, ctx(fetchJson, runReader));

    expect(busy.asked).toEqual([]);
    expect(records[0].summary).not.toContain("Item 1.05:");
    expect(records[0].summary).toContain("Form: 8-K.");
  });

  it("gives the facts alone when the page of the filing cannot be read", async () => {
    const { fetchJson } = answering({ [SUBMISSIONS]: submissions() });
    const down = archive();
    down.state.filing = new FetchError("unreachable");

    const { records } = await secConnector(CONTACT, {
      spacer: turns().spacer,
      fetchPage: down.fetchPage,
    }).fetch(KEY, ctx(fetchJson, runReader));

    expect(records[0].summary).not.toContain("Item 1.05:");
    expect(records[0].summary).toContain("Form: 8-K.");
  });

  it("leaves the filing unread when the robots.txt of the archive does not allow it", async () => {
    const { fetchJson } = answering({ [SUBMISSIONS]: submissions() });
    const closed = archive();
    closed.state.robots = "User-agent: *\nDisallow: /Archives/";

    const { records } = await secConnector(CONTACT, {
      spacer: turns().spacer,
      fetchPage: closed.fetchPage,
    }).fetch(KEY, ctx(fetchJson, runReader));

    expect(closed.asked.map((request) => request.url)).toEqual([ROBOTS]);
    expect(records[0].summary).not.toContain("Item 1.05:");
  });

  it("asks for robots.txt again after an hour: one request that failed does not close the archive for long", async () => {
    const { fetchJson } = answering({ [SUBMISSIONS]: submissions() });
    const flaky = archive();
    flaky.state.robots = new FetchError("unreachable");
    let clock = 1_000_000;
    const connector = secConnector(CONTACT, {
      spacer: turns().spacer,
      fetchPage: flaky.fetchPage,
      clock: () => clock,
    });

    // A robots.txt that cannot be read allows nothing (RFC 9309), so the filing is left unread ...
    const { records: first } = await connector.fetch(KEY, ctx(fetchJson, runReader));
    flaky.state.robots = new FetchError("not_found");
    // ... and it stays unread while the hour lasts: the reader keeps what it learned of robots.txt ...
    clock += HOUR_MS - 1;
    const { records: within } = await connector.fetch(KEY, ctx(fetchJson, runReader));
    clock += 1;
    const { records: later } = await connector.fetch(KEY, ctx(fetchJson, runReader));

    expect(first[0].summary).not.toContain("Item 1.05:");
    expect(within[0].summary).not.toContain("Item 1.05:");
    // ... but an hour after the first request the connector asks again: a site with no robots.txt
    // allows everything. A day would leave the archive unread for every run until then.
    expect(later[0].summary).toContain(`Item 1.05: ${EXCERPT}`);
    expect(flaky.asked.map((request) => request.url)).toEqual([ROBOTS, ROBOTS, FILING]);
  });

  it("asks nothing for a key that is not a CIK", async () => {
    const { fetchJson, asked } = answering({});

    await expect(
      secConnector(CONTACT, { spacer: turns().spacer }).fetch("cpe:brisenetworks", ctx(fetchJson)),
    ).rejects.toThrow("The SEC is asked by a CIK");
    expect(asked).toEqual([]);
  });

  it("cannot read a document that is no list of filings, or the list of another registrant", async () => {
    const connector = secConnector(CONTACT, { spacer: turns().spacer });
    const none = answering({ [SUBMISSIONS]: { cik: CIK } });
    const other = answering({ [SUBMISSIONS]: submissions([row()], "0000320193") });

    await expect(connector.fetch(KEY, ctx(none.fetchJson))).rejects.toMatchObject({
      reason: "unsupported_type",
    });
    await expect(connector.fetch(KEY, ctx(other.fetchJson))).rejects.toMatchObject({
      reason: "unsupported_type",
    });
  });
});
