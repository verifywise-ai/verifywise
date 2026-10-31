/**
 * The SEC as a read-through source of the vendor risk database, behind Q4 (M2, spec D2.8, Rulings
 * 2, 4 and 14 of the M2 plan): the vendor is asked by the CIK a person stored on it, a strong key,
 * or else by the CIK of the one registrant that has a name of the vendor, which is found by the name
 * and so is weak (Q3); every request names the contact in its User-Agent and takes a turn of the
 * SEC's limit; the records are the vendor's Form 8-K filings under Item 1.05. The answers are
 * written from the documented format, not copied from the API.
 */
import { FetchError } from "../../../../webResearch/guardedFetch";
import { PageReadError, type PageReader } from "../../../../webResearch/readPage";
import {
  SEC_SUBMISSIONS_MAX_BYTES,
  SEC_TICKERS_MAX_BYTES,
  SEC_TICKERS_URL,
  secSubmissionsUrl,
} from "../../../records/sec";
import type { FetchJson } from "../../../records/types";
import type { ResearchTarget } from "../../../target";
import { secConnector, secUserAgent } from "../sec";

const NOW = new Date("2026-10-31T12:00:00Z");
const DAY_MS = 24 * 60 * 60_000;
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

/** A page reader that answers every filing with one text, or fails with the error it is given. */
function pages(answer: string | Error = TEXT) {
  const asked: string[] = [];
  const readPage: PageReader = async (url) => {
    asked.push(url);
    if (answer instanceof Error) throw answer;
    return { url, title: "", publishedAt: null, text: answer, links: [] };
  };
  return { readPage, asked };
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

  it("reads the Item 1.05 of a filing through the page reader, on a turn of the SEC", async () => {
    const { fetchJson } = answering({ [SUBMISSIONS]: submissions() });
    const { readPage, asked } = pages();
    const { spacer, taken } = turns();

    const { records } = await secConnector(CONTACT, { spacer }).fetch(
      KEY,
      ctx(fetchJson, readPage),
    );

    expect(records[0].summary).toContain(`Item 1.05: ${EXCERPT}`);
    expect(asked).toEqual([FILING]);
    // The list of filings is asked on the read-through's turn (readThrough.ts); the filing on one of its own.
    expect(taken()).toBe(1);
  });

  it("keeps the text of a filing: its page is read once", async () => {
    const { fetchJson } = answering({ [SUBMISSIONS]: submissions() });
    const { readPage, asked } = pages();
    const connector = secConnector(CONTACT, { spacer: turns().spacer });

    await connector.fetch(KEY, ctx(fetchJson, readPage));
    const { records: again } = await connector.fetch(KEY, ctx(fetchJson, readPage));

    expect(asked).toHaveLength(1);
    expect(again[0].summary).toContain(`Item 1.05: ${EXCERPT}`);
  });

  it("gives the facts alone when the filing's turn is refused or its page cannot be read", async () => {
    const { fetchJson } = answering({ [SUBMISSIONS]: submissions() });
    const busy = pages();
    const down = pages(new PageReadError("unreachable"));

    const { records: refused } = await secConnector(CONTACT, { spacer: turns(false).spacer }).fetch(
      KEY,
      ctx(fetchJson, busy.readPage),
    );
    const { records: unread } = await secConnector(CONTACT, { spacer: turns().spacer }).fetch(
      KEY,
      ctx(fetchJson, down.readPage),
    );

    expect(busy.asked).toEqual([]);
    expect(refused[0].summary).not.toContain("Item 1.05:");
    expect(unread[0].summary).not.toContain("Item 1.05:");
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
