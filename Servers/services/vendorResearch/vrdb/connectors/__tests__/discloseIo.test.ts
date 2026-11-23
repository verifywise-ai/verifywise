/**
 * The disclose.io program list (the repository disclose/diodb) as a mirrored list of the vendor
 * risk database: one JSON array that the project's CI keeps sorted and unique by program name, read
 * whole, one record per organisation and policy host, with a strong domain key only for a policy
 * that sits on the organisation's own apex host and is the only row that uses its address.
 *
 * The files are synthetic: they copy the shape of the real file (a 3-space indented array of flat
 * objects sorted by name, optional keys that are missing on some rows, a boolean and a string in
 * `offers_swag`, an integer in `disclosure_timeline_days`, names with a blank at their end, names
 * that are host names, policy addresses with no scheme), with every name, address and text
 * invented. Every field that the connector must leave out holds a token that starts with `ZZ-`, so
 * that a copy of it anywhere in a body or a record is found. Every character that is hard to type is
 * built with `cp`.
 */
import { createHash } from "crypto";
import { FetchError } from "../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../types";
import {
  DISCLOSE_IO_RECORD_MARK,
  type DiscloseOrganisation,
  discloseIoConnector,
  discloseSummaryOf,
} from "../discloseIo";
import { RECORD_SUMMARY_MAX } from "../kit/record";
import {
  BodyTooLargeError,
  type ConnectorFetch,
  NotTheListError,
  type ParseResult,
  type Snapshot,
} from "../types";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "./helpers/kitContract";

jest.setTimeout(30_000);

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

const DATA_URL = "https://raw.githubusercontent.com/disclose/diodb/master/program-list.json";
const CONTENT_TYPE = "text/plain; charset=utf-8";

const FIRST_SENTENCE = "disclose.io program list (github.com/disclose), a register or status list.";
const CLOSING =
  "Entries are submitted by contributors and are not verified by the organisation or by disclose.io; " +
  "a missing entry says nothing. Attributed as CC BY 4.0 (disclose.io diodb); adapted by VerifyWise.";

/** The tokens of the fields that the connector leaves out: each is in a field that nothing may hold. */
const LEFT_OUT = {
  contactEmail: "zz-contact@sentinel.example",
  contactUrl: "https://sentinel.example/ZZ-CONTACT-URL",
  pgpKey: "https://sentinel.example/ZZ-PGP-KEY",
  hiring: "https://sentinel.example/ZZ-HIRING",
  hallOfFame: "https://sentinel.example/ZZ-HALL-OF-FAME",
  securityTxt: "https://sentinel.example/ZZ-SECURITY-TXT",
  languages: "ZZ-LANGUAGES",
  launchDate: "ZZ-LAUNCH-DATE",
  disclosure: "ZZ-PUBLIC-DISCLOSURE",
  policyPath: "ZZ-POLICY-PATH",
};

interface Spec {
  name: string;
  url: string;
  status?: string;
  safeHarbor?: unknown;
  bounty?: unknown;
  /** Replaces or adds keys of the row as the file has them. */
  over?: Record<string, unknown>;
}

type Row = Record<string, unknown>;

/** A row with the keys of the real file; the optional ones are missing on some rows, as there. */
function rowOf(spec: Spec, index = 0): Row {
  const row: Row = {
    program_name: spec.name,
    policy_url: spec.url,
    launch_date: LEFT_OUT.launchDate,
    offers_bounty: spec.bounty ?? "no",
    // A boolean on some rows and a string on the others: the file has both.
    offers_swag: index % 2 === 0 ? false : "no",
    hall_of_fame: LEFT_OUT.hallOfFame,
    safe_harbor: spec.safeHarbor ?? "partial",
    public_disclosure: LEFT_OUT.disclosure,
    pgp_key: LEFT_OUT.pgpKey,
    hiring: LEFT_OUT.hiring,
    securitytxt_url: LEFT_OUT.securityTxt,
    preferred_languages: LEFT_OUT.languages,
    policy_url_status: spec.status ?? "alive",
    contact_email: LEFT_OUT.contactEmail,
    contact_url: LEFT_OUT.contactUrl,
    disclosure_timeline_days: 90,
  };
  if (index % 3 === 0) delete row.contact_email;
  if (index % 5 === 0) delete row.contact_url;
  if (index % 7 === 0) delete row.disclosure_timeline_days;
  if (index % 11 === 0) delete row.launch_date;
  if (index % 13 === 0) delete row.offers_swag;
  return { ...row, ...spec.over };
}

/** The order of the project's CI (jq): by code point, not by UTF-16 unit. */
function byCodePoint(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const x = left[i].codePointAt(0) ?? 0;
    const y = right[i].codePointAt(0) ?? 0;
    if (x !== y) return x - y;
  }
  return left.length - right.length;
}

const FILLER_COUNT = 1500;

/** Organisations of no interest to a test, each with a policy of its own on a host of its own. */
const FILLERS: Row[] = Array.from({ length: FILLER_COUNT }, (_, i) =>
  rowOf(
    {
      name: `Filler Org ${String(i).padStart(4, "0")}`,
      url: `https://filler${String(i).padStart(4, "0")}.example/vdp`,
    },
    i,
  ),
);

const byName = (a: Row, b: Row): number =>
  byCodePoint(String(a.program_name), String(b.program_name));

/** The rows of a file: the fillers and the given rows, in the order of the file (sorted by name). */
const rowsWith = (specs: readonly Spec[] = [], fillers: readonly Row[] = FILLERS): Row[] =>
  [...fillers, ...specs.map((spec, i) => rowOf(spec, i + 1))].sort(byName);

const isRow = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const hasName = (value: unknown): value is Row =>
  isRow(value) && typeof value.program_name === "string";

/**
 * The fillers and the given rows as a file: a row with a text for a name is sorted in, where the
 * project's CI would put it; any other has no place in the order and goes in at the fifth place.
 */
function fileWith(extra: readonly unknown[]): unknown[] {
  const rows: unknown[] = [...FILLERS, ...extra.filter(hasName)].sort(byName);
  rows.splice(5, 0, ...extra.filter((row) => !hasName(row)));
  return rows;
}

/** The text of a file as the real one is written: 3 spaces of indent and a line feed at the end. */
const textOfRows = (rows: readonly unknown[]): string => `${JSON.stringify(rows, null, 3)}\n`;

const filesOf = (
  body: string | Buffer,
  over: Partial<FakeFile> = {},
): Record<string, FakeFile> => ({
  [DATA_URL]: { body, contentType: CONTENT_TYPE, ...over },
});

async function snapshotOf(body: string | Buffer, over: Partial<FakeFile> = {}): Promise<Snapshot> {
  const snapshot = await discloseIoConnector.download(fakeFetch(filesOf(body, over)), {});
  if (snapshot === "unchanged") throw new Error("The fake fetch answered unchanged.");
  return snapshot;
}

async function parsedOf(
  rows: readonly unknown[],
  over: Partial<FakeFile> = {},
): Promise<ParseResult & { snapshot: Snapshot }> {
  const snapshot = await snapshotOf(textOfRows(rows), over);
  return { ...discloseIoConnector.parse(snapshot), snapshot };
}

const recordOf = (parsed: ParseResult, id: string): ParsedRecord => {
  const found = parsed.records.find((record) => record.sourceRecordId === id);
  if (found === undefined) throw new Error(`No record ${id}`);
  return found;
};

const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

const notTheList = async (body: string | Buffer): Promise<void> => {
  expect(await failureOf(snapshotOf(body))).toBeInstanceOf(NotTheListError);
};

const MIB = 1024 * 1024;

/**
 * The id of an organisation whose key (`<compact name>@<host>`) is longer than 200 characters: the
 * first 183 characters of the key, a tilde and the first 16 hex digits of the SHA-256 of the whole key.
 */
const hashedIdOf = (key: string): string =>
  `${key.slice(0, 183)}~${createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16)}`;

/** A host of the given length: labels of 60 characters at most, then ".example". */
function hostOfLength(length: number): string {
  const labels: string[] = [];
  let left = length - ".example".length;
  while (left > 0) {
    const size = Math.min(60, left);
    labels.push("h".repeat(size));
    left -= size + 1;
  }
  return `${labels.join(".")}.example`;
}

// ---------------------------------------------------------------------------------------------

describe("the connector of disclose_io", () => {
  it("is the snapshot connector of disclose_io at version 1, with the mark of the list", () => {
    expect(discloseIoConnector.id).toBe("disclose_io");
    expect(discloseIoConnector.version).toBe(1);
    expect(discloseIoConnector.kind).toBeUndefined();
    expect(DISCLOSE_IO_RECORD_MARK).toBe("disclose.io program list");
  });

  it("asks the one file with the limits of the list, and no other address", async () => {
    const fetch = fakeFetch(filesOf(textOfRows(rowsWith())));
    await discloseIoConnector.download(fetch, {});
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toBe(DATA_URL);
    expect(fetch.calls[0].limits.maxBytes).toBe(8 * MIB);
    expect(fetch.calls[0].limits.totalTimeoutMs).toBe(60_000);
    expect([...fetch.calls[0].limits.allowedContentTypes].sort()).toEqual([
      "application/json",
      "text/plain",
    ]);
  });
});

describe("download", () => {
  it("gives one body, the validators of the file and its size", async () => {
    const text = textOfRows(rowsWith());
    const snapshot = await discloseIoConnector.download(
      fakeFetch({
        [DATA_URL]: { body: text, contentType: CONTENT_TYPE, etag: 'W/"def456"' },
      }),
      {},
    );
    const taken = snapshot as Snapshot;
    expect(taken.bodies).toHaveLength(1);
    expect(taken.etag).toBe('k1:W/"def456"');
    expect(taken.lastModified).toBeNull();
    expect(taken.bytes).toBe(Buffer.byteLength(text));
  });

  it("reads a file served as text/plain, as GitHub serves it, and as application/json", async () => {
    for (const contentType of ["text/plain; charset=utf-8", "application/json", "TEXT/PLAIN"]) {
      const parsed = await parsedOf(rowsWith(), { contentType });
      expect(parsed.errors).toBe(0);
      expect(parsed.records.length).toBeGreaterThan(1400);
    }
  });

  it("refuses a type that is neither, as the page guard does", async () => {
    const failure = await failureOf(
      snapshotOf(textOfRows(rowsWith()), { contentType: "text/html" }),
    );
    expect(failure).toBeInstanceOf(FetchError);
    expect((failure as FetchError).reason).toBe("unsupported_type");
  });

  it("reads the file with a byte order mark in front of it, and a file that is on one line", async () => {
    const text = textOfRows(rowsWith());
    const withMark = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]);
    const parsed = discloseIoConnector.parse(await snapshotOf(withMark));
    expect(parsed.errors).toBe(0);
    expect(parsed.root).toBe("program-list.json");
    expect(parsed.records.length).toBeGreaterThan(1400);
    const minified = discloseIoConnector.parse(await snapshotOf(JSON.stringify(rowsWith())));
    expect(minified.errors).toBe(0);
    expect(minified.records).toHaveLength(parsed.records.length);
  });

  it("answers unchanged when the server says so, through the validators the factory stored", async () => {
    const fetch = fakeFetch(filesOf(textOfRows(rowsWith()), { etag: 'W/"def456"' }));
    const first = (await discloseIoConnector.download(fetch, {})) as Snapshot;
    const again = await discloseIoConnector.download(fetch, {
      etag: first.etag,
      lastModified: first.lastModified,
    });
    expect(again).toBe("unchanged");
    expect(fetch.calls[1].validators.etag).toBe('W/"def456"');
  });

  it("sends no validators that another version of the reading stored", async () => {
    const fetch = fakeFetch(filesOf(textOfRows(rowsWith()), { etag: 'W/"def456"' }));
    const again = await discloseIoConnector.download(fetch, { etag: 'k0:W/"def456"' });
    expect(again).not.toBe("unchanged");
    expect(fetch.calls[0].validators.etag).toBeUndefined();
  });

  it("answers from the pinned repository only: another host, plain http and another repository are not allowed", async () => {
    const answers = [
      "https://evil.example.net/disclose/diodb/master/program-list.json",
      "https://raw.githubusercontent.com.evil.example.net/disclose/diodb/master/program-list.json",
      "http://raw.githubusercontent.com/disclose/diodb/master/program-list.json",
      // The host is shared by every repository of GitHub: the path prefix is the pin.
      "https://raw.githubusercontent.com/SomeoneElse/diodb/master/program-list.json",
      "https://raw.githubusercontent.com/disclose/another-repository/master/program-list.json",
      "https://raw.githubusercontent.com/disclose/diodb/../other/program-list.json",
    ];
    for (const url of answers) {
      const failure = await failureOf(snapshotOf(textOfRows(rowsWith()), { url }));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("not_allowed");
      expect((failure as FetchError).message).not.toContain("evil");
    }
  });

  it("answers unchanged only from the pinned repository too", async () => {
    const fetch = fakeFetch(
      filesOf(textOfRows(rowsWith()), {
        etag: 'W/"def456"',
        url: "https://raw.githubusercontent.com/SomeoneElse/diodb/master/program-list.json",
      }),
    );
    const failure = await failureOf(discloseIoConnector.download(fetch, { etag: 'k1:W/"def456"' }));
    expect(failure).toBeInstanceOf(FetchError);
    expect((failure as FetchError).reason).toBe("not_allowed");
  });

  it("takes an answer from another path of the pinned repository, as after a redirect inside it", async () => {
    const parsed = await parsedOf(rowsWith(), {
      url: "https://raw.githubusercontent.com/disclose/diodb/refs/heads/master/program-list.json",
    });
    expect(parsed.errors).toBe(0);
  });

  it("fails a file cut at its limit as too large, and never gives a shorter list", async () => {
    const failure = await failureOf(snapshotOf(textOfRows(rowsWith()), { truncated: true }));
    expect(failure).toBeInstanceOf(BodyTooLargeError);
  });

  it("fails a file of more than 8 MiB as too large", async () => {
    const huge = Buffer.alloc(8 * MIB + 1, 0x20);
    expect(await failureOf(snapshotOf(huge))).toBeInstanceOf(BodyTooLargeError);
  });

  it("gives the same body for the same list written another way: the order of the keys, the indent, a line feed at the end", async () => {
    // The file has one order of rows only (the CI sorts it, and another order is refused below), so
    // what differs is the writing of each row, and none of it may reach the body.
    await expectDeterministic(discloseIoConnector, (reversed): ConnectorFetch => {
      const rows = rowsWith([
        { name: "Examplesec", url: "https://www.examplesec.com/vdp" },
        { name: "Sampleworks", url: "https://sampleworks.example/security", safeHarbor: "full" },
      ]);
      const body = reversed
        ? JSON.stringify(rows.map((row) => Object.fromEntries(Object.entries(row).reverse())))
        : textOfRows(rows);
      return fakeFetch(filesOf(body));
    });
  });
});

describe("a file that is not the list", () => {
  it("is refused for text that is not JSON, an HTML page, and a root that is no array", async () => {
    await notTheList("not json at all");
    await notTheList("<html><body>Not found</body></html>");
    await notTheList("");
    await notTheList('{"programs": []}');
    await notTheList("null");
    await notTheList('"text"');
    await notTheList("42");
    await notTheList(`${textOfRows(rowsWith())}trailing text`);
    await notTheList(textOfRows(rowsWith()).slice(0, -50));
  });

  it("is refused for fewer than 1,500 rows, and read for exactly 1,500", async () => {
    await notTheList(textOfRows(FILLERS.slice(0, 1499)));
    const parsed = await parsedOf(FILLERS.slice(0, 1500));
    expect(parsed.errors).toBe(0);
    expect(parsed.records).toHaveLength(1500);
  });

  it("is refused for a name that the file holds twice, next to itself or not", async () => {
    const twice = rowsWith();
    twice.splice(10, 0, { ...twice[9] });
    await notTheList(textOfRows(twice));
    const apart = rowsWith();
    apart.push({ ...apart[0] });
    await notTheList(textOfRows(apart));
  });

  it("is refused for names that are not in order, by one place and wholly reversed", async () => {
    const swapped = rowsWith();
    [swapped[100], swapped[101]] = [swapped[101], swapped[100]];
    await notTheList(textOfRows(swapped));
    await notTheList(textOfRows(rowsWith().reverse()));
  });

  it("checks the order by code point, as the project's CI sorts: a name beyond the BMP follows a name of the BMP", async () => {
    const lower = `Orderkeeper ${cp(0xff5e)}`;
    const upper = `Orderkeeper ${cp(0x1f600)}`;
    // By UTF-16 unit the emoji (D83D) is before U+FF5E; by code point it is after it.
    expect(lower < upper).toBe(false);
    const specs: Spec[] = [
      { name: lower, url: "https://orderkeeper-one.example/vdp" },
      { name: upper, url: "https://orderkeeper-two.example/vdp" },
    ];
    expect((await parsedOf(rowsWith(specs))).errors).toBe(0);
    const bad = rowsWith(specs);
    const at = bad.findIndex((row) => row.program_name === lower);
    [bad[at], bad[at + 1]] = [bad[at + 1], bad[at]];
    await notTheList(textOfRows(bad));
  });

  it("checks the order on the raw names: a blank at the end of one is part of it", async () => {
    const rows = rowsWith([
      { name: "Trailing Space ", url: "https://trailing-space.example/vdp" },
      { name: "Trailing Space Two", url: "https://trailing-space-two.example/vdp" },
    ]);
    // "Trailing Space " is before "Trailing Space Two": the shorter is first.
    const parsed = await parsedOf(rows);
    expect(parsed.errors).toBe(0);
    expect(recordOf(parsed, "trailingspace@trailing-space.example").title).toBe(
      "disclose.io program list: Trailing Space",
    );
    const swapped = [...rows];
    const at = swapped.findIndex((row) => row.program_name === "Trailing Space ");
    [swapped[at], swapped[at + 1]] = [swapped[at + 1], swapped[at]];
    await notTheList(textOfRows(swapped));
  });

  it("does not take a row that is no object, or has no text for a name, into the check of the order", async () => {
    const parsed = await parsedOf(
      fileWith([
        "not an object",
        null,
        42,
        ["x"],
        { policy_url: "https://nameless.example/vdp" },
        { program_name: 7, policy_url: "https://seven.example/vdp" },
      ]),
    );
    expect(parsed.errors).toBe(0);
    expect(parsed.skipped).toBe(6);
  });

  it("is refused for a list nested so that no list of ours is", async () => {
    const nested = JSON.parse(`${"[".repeat(80)}${"]".repeat(80)}`);
    await notTheList(textOfRows([...rowsWith(), nested]));
  });

  it("fails a list of one row over the limit as too large, and not as a file that is not the list", async () => {
    const over = Array.from({ length: 20_001 }, (_, i) => ({ program_name: `Over ${i}` }));
    // Not sorted, and not in any way the list: only a reader that has taken the whole of it would say so.
    expect(await failureOf(snapshotOf(JSON.stringify(over)))).toBeInstanceOf(BodyTooLargeError);
  });

  it("reads a list of exactly 20,000 rows", async () => {
    const rows = Array.from({ length: 20_000 }, (_, i) => ({
      program_name: `Bulk Org ${String(i).padStart(5, "0")}`,
      policy_url: `https://bulk${String(i).padStart(5, "0")}.example/vdp`,
    }));
    const parsed = discloseIoConnector.parse(await snapshotOf(JSON.stringify(rows)));
    expect(parsed.errors).toBe(0);
    expect(parsed.skipped).toBe(0);
    expect(parsed.records).toHaveLength(20_000);
  });
});

describe("the rows that are not read", () => {
  it("drops the rows of a policy address that 50 rows share, and keeps the rows of one that 49 share", async () => {
    const umbrella = Array.from({ length: 50 }, (_, i) => ({
      name: `Umbrella Customer ${String(i).padStart(2, "0")}`,
      url: "https://umbrella.example/report",
    }));
    const family = Array.from({ length: 49 }, (_, i) => ({
      name: `Familybrand Product ${String(i).padStart(2, "0")}`,
      url: "https://familybrand.example/report",
    }));
    const parsed = await parsedOf(rowsWith([...umbrella, ...family]));
    expect(parsed.errors).toBe(0);
    expect(parsed.skipped).toBe(0);
    expect(parsed.records.filter((r) => r.title.includes("Umbrella Customer"))).toHaveLength(0);
    expect(parsed.records.filter((r) => r.title.includes("Familybrand Product"))).toHaveLength(49);
    expect(JSON.stringify(parsed.snapshot.bodies)).not.toContain("Umbrella Customer");
  });

  it("counts the dead rows among those that use an address, so that a family of 49 and one dead row is a scope", async () => {
    const family = Array.from({ length: 49 }, (_, i) => ({
      name: `Deadhelped Product ${String(i).padStart(2, "0")}`,
      url: "https://deadhelped.example/report",
    }));
    const dead = {
      name: "Deadhelped Zombie",
      url: "https://deadhelped.example/report",
      status: "dead",
    };
    const parsed = await parsedOf(rowsWith([...family, dead]));
    expect(parsed.records.filter((r) => r.title.includes("Deadhelped"))).toHaveLength(0);
  });

  it("reads the address as a line, so that a blank or a hidden character does not make a second address", async () => {
    const family = Array.from({ length: 50 }, (_, i) => ({
      name: `Hiddenvariant Product ${String(i).padStart(2, "0")}`,
      url:
        i % 3 === 0
          ? "https://hiddenvariant.example/report"
          : i % 3 === 1
            ? ` https://hiddenvariant.example/report${cp(0x200b)}`
            : `https://hiddenvariant.example/${cp(0x202e)}report `,
    }));
    const parsed = await parsedOf(rowsWith(family));
    expect(parsed.records.filter((r) => r.title.includes("Hiddenvariant"))).toHaveLength(0);
  });

  it("gives the rows of an address that 2 rows share no domain key, whatever their host is", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Twinbrand Alpha", url: "https://twinbrand.example/report" },
        { name: "Twinbrand Beta", url: "https://twinbrand.example/report" },
      ]),
    );
    for (const id of ["twinbrandalpha@twinbrand.example", "twinbrandbeta@twinbrand.example"]) {
      const keys = recordOf(parsed, id).matchKeys;
      expect(keys.some((key) => key.startsWith("domain:"))).toBe(false);
      expect(keys.some((key) => key.startsWith("name:"))).toBe(true);
    }
  });

  it("drops the rows whose link is dead, in any case and with blanks, and keeps those with another word, none, or a word of no kind", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Deadlink One", url: "https://deadlink-one.example/vdp", status: "dead" },
        { name: "Deadlink Two", url: "https://deadlink-two.example/vdp", status: " Dead " },
        { name: "Deadlink Three", url: "https://deadlink-three.example/vdp", status: "DEAD" },
        { name: "Alivelink One", url: "https://alivelink-one.example/vdp", status: "alive" },
        { name: "Alivelink Two", url: "https://alivelink-two.example/vdp", status: "" },
        {
          name: "Alivelink Three",
          url: "https://alivelink-three.example/vdp",
          over: { policy_url_status: 7 },
        },
        {
          name: "Alivelink Four",
          url: "https://alivelink-four.example/vdp",
          over: { policy_url_status: undefined },
        },
        { name: "Alivelink Five", url: "https://alivelink-five.example/vdp", status: "deadline" },
      ]),
    );
    expect(parsed.records.filter((r) => r.title.includes("Deadlink"))).toHaveLength(0);
    expect(parsed.records.filter((r) => r.title.includes("Alivelink"))).toHaveLength(5);
    expect(parsed.skipped).toBe(0);
    expect(parsed.errors).toBe(0);
  });

  it("counts neither a dead row nor one of a scope as a row that could not be read", async () => {
    const dead = Array.from({ length: 30 }, (_, i) => ({
      name: `Gone Org ${String(i).padStart(2, "0")}`,
      url: `https://gone${i}.example/vdp`,
      status: "dead",
    }));
    const parsed = await parsedOf(rowsWith(dead));
    expect(parsed.skipped).toBe(0);
    expect(parsed.errors).toBe(0);
  });

  it("counts a dead row that has no name as one that could not be read: it cannot be told what it is", async () => {
    const parsed = await parsedOf(
      fileWith([{ policy_url: "https://nameless-dead.example/vdp", policy_url_status: "dead" }]),
    );
    expect(parsed.skipped).toBe(1);
  });
});

describe("the counts of the body", () => {
  interface Counted {
    rows: unknown[];
    total: number;
    unreadable: number;
  }

  it("says how many rows the file had, whatever became of them, and never fewer than the organisations and the rows that failed", async () => {
    // A row names one organisation at most, so a file whose rows make MORE organisations than there
    // are rows cannot be built for this list; the total is the larger of the two numbers all the
    // same (the kit refuses a body whose total is below the sum), and what can be built is a file in
    // which rows merge into one organisation, are dropped, or fail.
    const merging = ["Quin tet", "Quin-tet", "Quin.tet", "Quin_tet", "Quin~tet"].map((name, i) =>
      rowOf({ name, url: `https://quintet.example/${i}` }, i + 1),
    );
    const dead = Array.from({ length: 3 }, (_, i) =>
      rowOf({ name: `Gone Org ${i}`, url: `https://gone${i}.example/vdp`, status: "dead" }, i + 1),
    );
    const umbrella = Array.from({ length: 50 }, (_, i) =>
      rowOf(
        {
          name: `Umbrella Customer ${String(i).padStart(2, "0")}`,
          url: "https://umbrella.example/r",
        },
        i + 1,
      ),
    );
    const broken = [
      { policy_url: "https://nameless.example/vdp" },
      { program_name: "Zz addressless" },
      { program_name: 7, policy_url: "https://seven.example/vdp" },
      "a row that is no object",
    ];
    const file = fileWith([...merging, ...dead, ...umbrella, ...broken]);
    const parsed = await parsedOf(file);
    const body = JSON.parse(parsed.snapshot.bodies[0]) as Counted;

    expect(parsed.errors).toBe(0);
    expect(parsed.skipped).toBe(4);
    expect(file).toHaveLength(FILLER_COUNT + 5 + 3 + 50 + 4);
    // Every row of the file, the dropped ones and the failed ones with the rest.
    expect(body.total).toBe(file.length);
    expect(body.unreadable).toBe(4);
    // The fillers and the one organisation that the five spellings make.
    expect(body.rows).toHaveLength(FILLER_COUNT + 1);
    expect(body.total).toBeGreaterThanOrEqual(body.rows.length + body.unreadable);
    expect(body.rows.length + body.unreadable).toBeLessThan(body.total);
  });

  it("says as many rows as the file had when every row is read and none is dropped", async () => {
    const parsed = await parsedOf(rowsWith());
    const body = JSON.parse(parsed.snapshot.bodies[0]) as Counted;
    expect(body.total).toBe(FILLER_COUNT);
    expect(body.unreadable).toBe(0);
    expect(body.rows).toHaveLength(FILLER_COUNT);
  });
});

describe("a row with a field of another type, or none", () => {
  it("ignores offers_swag as a boolean and as a string, a disclosure time as an integer, and the keys that a row lacks", async () => {
    const parsed = await parsedOf(
      rowsWith([
        {
          name: "Typesmix",
          url: "https://typesmix.example/vdp",
          over: {
            offers_swag: true,
            disclosure_timeline_days: 45,
            hiring: undefined,
            contact_email: undefined,
            launch_date: 2017,
          },
        },
      ]),
    );
    expect(parsed.errors).toBe(0);
    expect(parsed.skipped).toBe(0);
    expect(recordOf(parsed, "typesmix@typesmix.example").summary).not.toContain("45");
  });

  it("counts the rows with no text for the name or the address as unreadable, within the allowance", async () => {
    const parsed = await parsedOf(
      fileWith([
        { policy_url: "https://nameless.example/vdp" },
        { program_name: "Zz addressless" },
        { program_name: 7, policy_url: "https://seven.example/vdp" },
        { program_name: "Zz numeric address", policy_url: 7 },
        { program_name: "   ", policy_url: "https://blank-name.example/vdp" },
        { program_name: "Zz blank address", policy_url: "   " },
        { program_name: "!!!", policy_url: "https://punctuation-name.example/vdp" },
        "a row that is no object",
        null,
        ["a row that is no object either"],
      ]),
    );
    // Ten rows of 1,510 are ten of the fifteen that the allowance gives (a hundredth of the rows).
    expect(parsed.errors).toBe(0);
    expect(parsed.skipped).toBe(10);
    expect(parsed.records).toHaveLength(FILLER_COUNT);
  });

  it("fails the list when more rows than the allowance cannot be read: a new format of the file", async () => {
    const broken = Array.from({ length: 17 }, (_, i) => ({ program_name: 7, policy_url: i }));
    const parsed = await parsedOf(fileWith(broken));
    expect(parsed.errors).toBe(17);
    expect(parsed.skipped).toBe(0);
  });
});

describe("a text that does not fit its limit", () => {
  // `lineOf(text, limit + 1)` followed by a length compare passes a text that was cut: the cut takes
  // the blank before it off, and a cut line of `limit` units or fewer ends in the marker. The names
  // and the addresses below are made so that it would pass them: a blank at the place of the cut.
  const unreadableRow = async (row: Record<string, unknown>): Promise<void> => {
    const parsed = await parsedOf(fileWith([row]));
    expect(parsed.errors).toBe(0);
    expect(parsed.skipped).toBe(1);
    expect(parsed.records).toHaveLength(FILLER_COUNT);
    expect(parsed.snapshot.bodies[0]).not.toContain("shortened");
  };

  it("reads a name of 80 characters whole, and leaves unread a row whose name has 81 or more", async () => {
    const exact = `N${"a".repeat(79)}`;
    const parsed = await parsedOf(
      rowsWith([{ name: exact, url: "https://exactname.example/vdp" }]),
    );
    expect(parsed.skipped).toBe(0);
    const record = recordOf(parsed, `${exact.toLowerCase()}@exactname.example`);
    expect(record.title).toBe(`disclose.io program list: ${exact}`);
    expect(record.title.includes("shortened")).toBe(false);
    await unreadableRow({
      program_name: `N${"a".repeat(80)}`,
      policy_url: "https://overname.example/vdp",
    });
  });

  it("leaves unread a row whose name was cut by a blank at the cut: a cut line of 80 units that ends in the marker is not a name", async () => {
    // 68 letters, a blank, 20 letters: the line is 89 units, and a cut at 81 would leave 80.
    await unreadableRow({
      program_name: `${"a".repeat(68)} ${"b".repeat(20)}`,
      policy_url: "https://blankname.example/vdp",
    });
  });

  it("reads an address of 2,048 characters whole, and leaves unread a row whose address has 2,049 or more", async () => {
    const head = "https://exactaddr.example/";
    const exact = `${head}${"p".repeat(2048 - head.length)}`;
    expect(exact).toHaveLength(2048);
    const parsed = await parsedOf(rowsWith([{ name: "Exactaddr", url: exact }]));
    expect(parsed.skipped).toBe(0);
    expect(recordOf(parsed, "exactaddr@exactaddr.example").matchKeys).toContain(
      "domain:exactaddr.example",
    );
    await unreadableRow({
      program_name: "Overaddr",
      policy_url: `${head}${"p".repeat(2049 - head.length)}`,
    });
  });

  it("leaves unread a row whose address was cut by a blank at the cut: the host that is left may be the end of a longer one", async () => {
    const head = "https://blankcut.example/";
    await unreadableRow({
      program_name: "Blankcut",
      policy_url: `${head}${"p".repeat(2036 - head.length)} ${"q".repeat(100)}`,
    });
  });

  it("does not take a status that begins with dead for dead, nor a long word for a word of the policy: the cell is no more than a word", async () => {
    // Cells that are only compared with a word are cut for the compare, and a cut line is none of them.
    const parsed = await parsedOf(
      rowsWith([
        {
          name: "Longstatus",
          url: "https://longstatus.example/vdp",
          status: `dead ${"x".repeat(60)}`,
          safeHarbor: `full ${"x".repeat(60)}`,
          bounty: `yes ${"x".repeat(60)}`,
        },
      ]),
    );
    expect(parsed.skipped).toBe(0);
    const record = recordOf(parsed, "longstatus@longstatus.example");
    expect(record.summary).toContain("(safe harbor: not stated; bounty: not stated)");
  });
});

describe("the host of a policy as a strong key", () => {
  const keysOf = async (spec: Spec, id: string): Promise<string[]> => {
    const parsed = await parsedOf(rowsWith([spec]));
    return recordOf(parsed, id).matchKeys.filter((key) => key.startsWith("domain:"));
  };

  it("is the apex host of a policy that has its own address, written with its scheme and without it", async () => {
    expect(
      await keysOf(
        { name: "Examplesec", url: "https://www.examplesec.com/vdp" },
        "examplesec@examplesec.com",
      ),
    ).toEqual(["domain:examplesec.com"]);
    // No scheme: the host is read as if the address began with https://.
    expect(
      await keysOf(
        { name: "Examplesec", url: "www.examplesec.de/bug.html" },
        "examplesec@examplesec.de",
      ),
    ).toEqual(["domain:examplesec.de"]);
    expect(
      await keysOf(
        { name: "Examplesec", url: "http://EXAMPLESEC.com./vdp?a=1#b" },
        "examplesec@examplesec.com",
      ),
    ).toEqual(["domain:examplesec.com"]);
    expect(
      await keysOf(
        { name: "Examplesec", url: "examplesec.com:8443/vdp" },
        "examplesec@examplesec.com",
      ),
    ).toEqual(["domain:examplesec.com"]);
  });

  it("is written in ASCII when the address is in Unicode", async () => {
    expect(
      await keysOf(
        { name: "Examplesec", url: `https://m${cp(0xfc)}nchen-sec.example/vdp` },
        "examplesec@xn--mnchen-sec-9db.example",
      ),
    ).toEqual(["domain:xn--mnchen-sec-9db.example"]);
  });

  it("is none on a platform of bug bounty programs or documents", async () => {
    for (const [url, host] of [
      ["https://bugcrowd.com/examplesec", "bugcrowd.com"],
      ["https://hackerone.com/examplesec", "hackerone.com"],
      ["https://federacy.com/examplesec", "federacy.com"],
      ["https://www.openbugbounty.org/examplesec", "openbugbounty.org"],
      ["https://yeswehack.com/programs/examplesec", "yeswehack.com"],
      ["https://intigriti.com/programs/examplesec", "intigriti.com"],
      ["https://examplesec.helpdesk.example.cobalt.io/x", "examplesec.helpdesk.example.cobalt.io"],
      ["https://firebounty.com/examplesec", "firebounty.com"],
      ["https://zerocopter.com/examplesec", "zerocopter.com"],
      ["https://bountyfactory.io/examplesec", "bountyfactory.io"],
      ["https://responsibledisclosure.com/examplesec", "responsibledisclosure.com"],
      ["https://notion.so/examplesec", "notion.so"],
      ["https://docs.google.com/document/d/examplesec", "docs.google.com"],
      ["https://drive.google.com/file/d/examplesec", "drive.google.com"],
    ]) {
      expect(await keysOf({ name: "Examplesec", url }, `examplesec@${host}`)).toEqual([]);
    }
  });

  it("is none on a host where many have pages, and on a subdomain of the organisation's own host", async () => {
    expect(
      await keysOf(
        { name: "Examplesec", url: "https://examplesec.github.io/x" },
        "examplesec@examplesec.github.io",
      ),
    ).toEqual([]);
    expect(
      await keysOf(
        { name: "Examplesec", url: "https://github.com/examplesec/policy" },
        "examplesec@github.com",
      ),
    ).toEqual([]);
    expect(
      await keysOf(
        { name: "Examplesec", url: "https://security.examplesec.com/x" },
        "examplesec@security.examplesec.com",
      ),
    ).toEqual([]);
  });

  it("takes a host of three labels as the apex when its last two labels are a suffix of a country", async () => {
    expect(
      await keysOf(
        { name: "Examplesec", url: "https://www.examplesec.co.uk/vdp" },
        "examplesec@examplesec.co.uk",
      ),
    ).toEqual(["domain:examplesec.co.uk"]);
    expect(
      await keysOf(
        { name: "Examplesec", url: "https://examplesec.com.au/vdp" },
        "examplesec@examplesec.com.au",
      ),
    ).toEqual(["domain:examplesec.com.au"]);
    expect(
      await keysOf(
        { name: "Examplesec", url: "https://security.examplesec.co.uk/vdp" },
        "examplesec@security.examplesec.co.uk",
      ),
    ).toEqual([]);
    expect(
      await keysOf(
        { name: "Examplesec", url: "https://examplesec.example.org/vdp" },
        "examplesec@examplesec.example.org",
      ),
    ).toEqual([]);
  });

  it("is none for a host that is itself a suffix of a country: it is no apex of anyone, and the record keeps its name key", async () => {
    // The suffixes of the connector's list, written out. A public suffix is the name of no organisation.
    const suffixes = [
      "co.uk",
      "org.uk",
      "gov.uk",
      "ac.uk",
      "com.au",
      "net.au",
      "gov.au",
      "co.nz",
      "co.jp",
      "co.in",
      "com.br",
      "com.sg",
      "co.za",
      "com.mx",
      "com.cn",
      "co.il",
      "com.tr",
      "co.kr",
      "com.tw",
      "com.hk",
    ];
    const nameOf = (index: number): string => `suffixprogram${String.fromCharCode(97 + index)}`;
    const parsed = await parsedOf(
      rowsWith(
        suffixes.map((suffix, index) => ({
          name: `Suffixprogram ${String.fromCharCode(97 + index)}`,
          url: `https://${suffix}/vdp`,
        })),
      ),
    );
    expect(parsed.skipped).toBe(0);
    suffixes.forEach((suffix, index) => {
      // The name key is all that is left; no row would have been kept for anything else.
      expect(recordOf(parsed, `${nameOf(index)}@${suffix}`).matchKeys).toEqual([
        `name:${nameOf(index)}`,
      ]);
    });
    // The body says the same: the decision is made before it is written, and the twenty rows are there.
    const rows = (JSON.parse(parsed.snapshot.bodies[0]) as { rows: DiscloseOrganisation[] }).rows;
    const ofSuffixes = rows.filter((row) => suffixes.includes(row.host));
    expect(ofSuffixes).toHaveLength(suffixes.length);
    expect(ofSuffixes.every((row) => row.keyed === false)).toBe(true);
  });

  it("is none for a country suffix written with a prefix, a port, a path or capitals, and still the key of an organisation under it", async () => {
    for (const url of [
      "https://www.com.au/vdp",
      "com.au",
      "HTTP://COM.AU./a?b=1#c",
      "com.au:8443/vdp",
    ]) {
      expect(await keysOf({ name: "Suffixprogram", url }, "suffixprogram@com.au")).toEqual([]);
    }
    // The same suffix with a label in front of it is an apex, as before.
    expect(
      await keysOf(
        { name: "Suffixprogram", url: "https://suffixprogram.com.au/vdp" },
        "suffixprogram@suffixprogram.com.au",
      ),
    ).toEqual(["domain:suffixprogram.com.au"]);
  });

  it("gives a record of the name alone for an address that holds no host: a mailbox, a text, a name of one label, an address of the network", async () => {
    for (const url of [
      "mailto:security@examplesec.com",
      "security@examplesec.com",
      "javascript:alert(1)",
      "data:text/html,examplesec",
      "https://",
      "localhost",
      "https://ex!ample.com/vdp",
      "https://a..b.com/vdp",
      "https://[::1]/vdp",
      "https://192.168.10.20/vdp",
      "not an address at all",
    ]) {
      const parsed = await parsedOf(rowsWith([{ name: "Examplesec", url }]));
      const record = recordOf(parsed, "examplesec@none");
      expect(record.matchKeys).toEqual(["name:examplesec"]);
      expect(record.summary).not.toContain("published on");
      expect(record.summary).toContain("for Examplesec (safe harbor: partial; bounty: no).");
    }
  });

  it("does not take a host where many have pages for a key, in the row of the snapshot too", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Examplesec", url: "https://github.com/examplesec/policy" },
        { name: "Sampleworks", url: "https://sampleworks.github.io/security" },
        { name: "Tricksec", url: "https://tricksec.example/vdp" },
      ]),
    );
    const rows = JSON.parse(parsed.snapshot.bodies[0]).rows as Array<{
      id: string;
      keyed: boolean;
    }>;
    const keyedOf = (id: string): boolean | undefined => rows.find((row) => row.id === id)?.keyed;
    expect(keyedOf("examplesec@github.com")).toBe(false);
    expect(keyedOf("sampleworks@sampleworks.github.io")).toBe(false);
    expect(keyedOf("tricksec@tricksec.example")).toBe(true);
  });

  it("takes a host for a platform's only when it is that host or one under it, not when it only ends like it", async () => {
    expect(
      await keysOf(
        { name: "Examplesec", url: "https://examplenotion.so/vdp" },
        "examplesec@examplenotion.so",
      ),
    ).toEqual(["domain:examplenotion.so"]);
    expect(
      await keysOf(
        { name: "Examplesec", url: "https://mybugcrowd.com/vdp" },
        "examplesec@mybugcrowd.com",
      ),
    ).toEqual(["domain:mybugcrowd.com"]);
  });

  it("reads the first part of an address that holds several, and no host from a text that comes before an address", async () => {
    expect(
      await keysOf(
        { name: "Examplesec", url: "https://examplesec.com/vdp, https://other.example/b" },
        "examplesec@examplesec.com",
      ),
    ).toEqual(["domain:examplesec.com"]);
    const parsed = await parsedOf(
      rowsWith([{ name: "Examplesec", url: "see https://examplesec.com/vdp" }]),
    );
    expect(recordOf(parsed, "examplesec@none").matchKeys).toEqual(["name:examplesec"]);
  });

  it("gives no host for a name of more than 253 characters, which no host is", async () => {
    const host = `${["a", "b", "c", "d", "e"].map((c) => c.repeat(63)).join(".")}.example`;
    expect(host.length).toBeGreaterThan(253);
    const parsed = await parsedOf(
      rowsWith([{ name: "Overlong Host", url: `https://${host}/vdp` }]),
    );
    expect(recordOf(parsed, "overlonghost@none").matchKeys).toEqual(["name:overlonghost"]);
  });

  it("reads the host as the address goes to it: the scheme is not asked, and a user name and password are never read", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Examplesec", url: "ftp://examplesec.com/vdp" },
        { name: "Sampleworks", url: "https://user:ZZ-SECRET@sampleworks.example/vdp" },
        { name: "Tricksec", url: "https://tricksec.example@sampleworks-two.example/vdp" },
      ]),
    );
    expect(recordOf(parsed, "examplesec@examplesec.com").matchKeys).toContain(
      "domain:examplesec.com",
    );
    expect(recordOf(parsed, "sampleworks@sampleworks.example").matchKeys).toContain(
      "domain:sampleworks.example",
    );
    // The part before the at sign is a user name: the host is the one after it.
    const tricked = recordOf(parsed, "tricksec@sampleworks-two.example");
    expect(tricked.matchKeys).toContain("domain:sampleworks-two.example");
    expect(tricked.matchKeys).not.toContain("domain:tricksec.example");
    const everything = `${parsed.snapshot.bodies.join("")}${JSON.stringify(parsed.records)}`;
    expect(everything).not.toContain("ZZ-SECRET");
  });

  it("keeps the key of the one row that uses its address, in a file where other rows use others", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Soloone", url: "https://soloone.example/vdp" },
        { name: "Solotwo", url: "https://solotwo.example/vdp?lang=en" },
      ]),
    );
    expect(recordOf(parsed, "soloone@soloone.example").matchKeys).toContain(
      "domain:soloone.example",
    );
    expect(recordOf(parsed, "solotwo@solotwo.example").matchKeys).toContain(
      "domain:solotwo.example",
    );
  });

  it("keys each organisation by its own address: of three on one host, the one that has an address of its own", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Mixedkeys Alpha", url: "https://mixedkeys.example/a" },
        { name: "Mixedkeys Beta", url: "https://mixedkeys.example/shared" },
        { name: "Mixedkeys Gamma", url: "https://mixedkeys.example/shared" },
      ]),
    );
    expect(recordOf(parsed, "mixedkeysalpha@mixedkeys.example").matchKeys).toContain(
      "domain:mixedkeys.example",
    );
    expect(recordOf(parsed, "mixedkeysbeta@mixedkeys.example").matchKeys).not.toContain(
      "domain:mixedkeys.example",
    );
  });

  it("keys an organisation when a program that the record does not show has an address of its own", async () => {
    // Five spellings of one name on one host: the first four share an address, the fifth has its own.
    const shared = "https://quinary.example/shared";
    const parsed = await parsedOf(
      rowsWith([
        { name: "Quin ary", url: shared },
        { name: "Quin-ary", url: shared },
        { name: "Quin.ary", url: shared },
        { name: "Quin_ary", url: shared },
        { name: "Quin~ary", url: "https://quinary.example/own" },
      ]),
    );
    const record = recordOf(parsed, "quinary@quinary.example");
    expect((record.identifiers as { programs: string[] }).programs).toEqual([
      "Quin ary",
      "Quin-ary",
      "Quin.ary",
    ]);
    expect(record.matchKeys).toEqual(["name:quinary", "domain:quinary.example"]);
  });
});

describe("one record for each organisation and policy host", () => {
  it("is one record for two spellings of a name on one host, with two programs, and a key for each", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Example Sec", url: "https://examplesec.com/vdp-one", safeHarbor: "full" },
        { name: "ExampleSec", url: "https://examplesec.com/vdp-two", bounty: "yes" },
      ]),
    );
    const record = recordOf(parsed, "examplesec@examplesec.com");
    expect(parsed.records.filter((r) => r.sourceRecordId.startsWith("examplesec@"))).toHaveLength(
      1,
    );
    expect(record.identifiers).toEqual({ programs: ["Example Sec", "ExampleSec"] });
    expect(record.title).toBe("disclose.io program list: Example Sec");
    expect(record.matchKeys).toEqual(["name:examplesec", "domain:examplesec.com"]);
    expect(record.summary).toBe(
      `${FIRST_SENTENCE} Program: Example Sec. ` +
        "The community-maintained disclose.io list holds a vulnerability disclosure policy for Example Sec, published on examplesec.com (safe harbor: full; bounty: no). " +
        "The community-maintained disclose.io list holds a vulnerability disclosure policy for ExampleSec, published on examplesec.com (safe harbor: partial; bounty: yes). " +
        CLOSING,
    );
  });

  it("is one record for names that differ in the legal form and the article, with the keys of both forms", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Acme Widgets Inc.", url: "https://acmewidgets.example/a" },
        { name: "Acme Widgets, Inc", url: "https://acmewidgets.example/b" },
        { name: "The Acme Widgets Co.", url: "https://acmewidgets.example/c" },
      ]),
    );
    const record = recordOf(parsed, "acmewidgets@acmewidgets.example");
    expect((record.identifiers as { programs: string[] }).programs).toEqual([
      "Acme Widgets Inc.",
      "Acme Widgets, Inc",
      "The Acme Widgets Co.",
    ]);
    expect(record.matchKeys).toContain("name:acmewidgets");
    expect(record.matchKeys).toContain("name:acmewidgetsinc");
    expect(record.matchKeys).toContain("name:theacmewidgetsco");
  });

  it("is two records for two names that compact alike on two hosts: the other organisation's name is never shown", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Ex-Ample", url: "https://ex-ample.com/vdp" },
        { name: "Example", url: "https://example.com/vdp" },
      ]),
    );
    const dashed = recordOf(parsed, "example@ex-ample.com");
    const plain = recordOf(parsed, "example@example.com");
    expect(dashed.summary).toContain("for Ex-Ample, published on ex-ample.com");
    expect(dashed.summary).not.toContain("for Example,");
    expect(dashed.matchKeys).toContain("domain:ex-ample.com");
    expect(plain.summary).toContain("for Example, published on example.com");
    expect(plain.summary).not.toContain("Ex-Ample");
    expect(plain.matchKeys).toContain("domain:example.com");
    expect(dashed.url).not.toBe(plain.url);
  });

  it("is one record for names that differ in case, and shows the first of them in the order of the file", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Casecheck.io", url: "https://casecheck.io/vdp" },
        { name: "casecheck.io", url: "https://casecheck.io/vdp-lower" },
      ]),
    );
    const record = recordOf(parsed, "casecheckio@casecheck.io");
    // "C" is before "c" by code point, and the file is sorted so.
    expect(record.title).toBe("disclose.io program list: Casecheck.io");
    expect((record.identifiers as { programs: string[] }).programs).toEqual([
      "Casecheck.io",
      "casecheck.io",
    ]);
  });

  it("shows three programs at most, and keys by the names of those three", async () => {
    const parsed = await parsedOf(
      rowsWith(
        ["Quin tet", "Quin-tet", "Quin.tet", "Quin_tet", "Quin~tet"].map((name, i) => ({
          name,
          url: `https://quintet.example/${i}`,
        })),
      ),
    );
    const record = recordOf(parsed, "quintet@quintet.example");
    expect((record.identifiers as { programs: string[] }).programs).toEqual([
      "Quin tet",
      "Quin-tet",
      "Quin.tet",
    ]);
    expect(record.summary.match(/holds a vulnerability disclosure policy for/g)).toHaveLength(3);
    expect(record.summary).not.toContain("Quin_tet");
    expect(record.summary).not.toContain("Quin~tet");
  });

  it("gives a key longer than 200 characters an id of 200, and keeps the record", async () => {
    const host = hostOfLength(251);
    expect(host.length).toBeLessThanOrEqual(253);
    const parsed = await parsedOf(
      rowsWith([{ name: "Longhost Organisation", url: `https://${host}/vdp` }]),
    );
    const key = `longhostorganisation@${host}`;
    expect(key.length).toBeGreaterThan(200);
    const record = recordOf(parsed, hashedIdOf(key));
    expect(record.sourceRecordId).toHaveLength(200);
    expect(record.sourceRecordId.startsWith("longhostorganisation@")).toBe(true);
    expectWellFormedRecords(parsed.records, {
      sourceId: "disclose_io",
      mark: DISCLOSE_IO_RECORD_MARK,
    });
  });

  it("makes the id of the compact name, an at sign and the host, and the same id for the same organisation in any file", async () => {
    const first = await parsedOf(
      rowsWith([{ name: "Idsample Ltd.", url: "https://idsample.example/vdp" }]),
    );
    const second = await parsedOf(
      rowsWith([
        { name: "Aaa Before", url: "https://aaa-before.example/vdp" },
        { name: "Idsample Ltd.", url: "https://www.idsample.example/other-page" },
      ]),
    );
    expect(recordOf(first, "idsample@idsample.example")).toBeDefined();
    expect(recordOf(second, "idsample@idsample.example").sourceRecordId).toBe(
      "idsample@idsample.example",
    );
  });

  it("keeps the letters of any script in the id, and writes them as percent escapes in the address", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: `M${cp(0xfc)}ller Testhaus`, url: "https://mueller-testhaus.example/vdp" },
      ]),
    );
    const id = `m${cp(0xfc)}llertesthaus@mueller-testhaus.example`;
    const record = recordOf(parsed, id);
    expect(record.url).toBe(
      "https://github.com/disclose/diodb?program=m%C3%BCllertesthaus%40mueller-testhaus.example",
    );
    expectWellFormedRecords(parsed.records, {
      sourceId: "disclose_io",
      mark: DISCLOSE_IO_RECORD_MARK,
    });
  });

  it("holds a record of a name alone, with @none for its host, for an address that gives no host", async () => {
    const parsed = await parsedOf(
      rowsWith([{ name: "Hostless Organisation", url: "mailto:x@y.example" }]),
    );
    const record = recordOf(parsed, "hostlessorganisation@none");
    expect(record.summary).toContain(
      "for Hostless Organisation (safe harbor: partial; bounty: no).",
    );
  });
});

describe("the id of an organisation whose key is longer than 200 characters", () => {
  const LABEL = "h".repeat(60);
  const longHost = (tail: string): string => `${LABEL}.${LABEL}.${LABEL}.${tail}.example`;
  /** The compact name of 80 characters that both spellings below make. */
  const COMPACT = `longname${"x".repeat(72)}`;
  const LOWER = COMPACT;
  const UPPER = `LONGNAME${"X".repeat(72)}`;
  const ONE = longHost("one");
  const TWO = longHost("two");

  /** The two spellings, the first of them (UPPER sorts first) on the first host given. */
  const fileOf = (firstHost: string, secondHost: string): Row[] =>
    rowsWith([
      { name: UPPER, url: `https://${firstHost}/vdp` },
      { name: LOWER, url: `https://${secondHost}/vdp` },
    ]);

  const idOfHost = (parsed: ParseResult, host: string): string | undefined =>
    parsed.records.find((record) => record.summary.includes(`published on ${host}`))
      ?.sourceRecordId;

  it("is a record of its own for each of two organisations whose keys differ only after the 200th character", async () => {
    const keyOne = `${COMPACT}@${ONE}`;
    const keyTwo = `${COMPACT}@${TWO}`;
    // The same 200 characters, then a difference (a cut at 200 would give one id).
    expect(keyOne.length).toBeGreaterThan(200);
    expect(keyOne.slice(0, 200)).toBe(keyTwo.slice(0, 200));
    expect(keyOne).not.toBe(keyTwo);

    const parsed = await parsedOf(fileOf(ONE, TWO));
    expect(parsed.errors).toBe(0);
    expect(parsed.skipped).toBe(0);
    expect(parsed.records).toHaveLength(FILLER_COUNT + 2);
    const ids = [hashedIdOf(keyOne), hashedIdOf(keyTwo)];
    expect(ids[0]).not.toBe(ids[1]);
    for (const id of ids) {
      expect(id).toHaveLength(200);
      expect(recordOf(parsed, id).sourceRecordId).toBe(id);
    }
    expect(recordOf(parsed, ids[0]).summary).toContain(`published on ${ONE}`);
    expect(recordOf(parsed, ids[1]).summary).toContain(`published on ${TWO}`);
    // The body holds one row for each, with the ids that the records have.
    const rows = (JSON.parse(parsed.snapshot.bodies[0]) as { rows: Array<{ id: string }> }).rows;
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining(ids));
    expectWellFormedRecords(parsed.records, {
      sourceId: "disclose_io",
      mark: DISCLOSE_IO_RECORD_MARK,
    });
  });

  it("is the first 183 characters of the key, a tilde, and 16 hex digits of the SHA-256 of the whole key", async () => {
    const parsed = await parsedOf(fileOf(ONE, TWO));
    const id = idOfHost(parsed, ONE) ?? "";
    expect(id.slice(0, 183)).toBe(`${COMPACT}@${ONE}`.slice(0, 183));
    expect(id.charAt(183)).toBe("~");
    expect(id.slice(184)).toMatch(/^[0-9a-f]{16}$/);
    // The two digests, written out: a change of the recipe is a change of every long id.
    expect(id.slice(184)).toBe("22a94b3185d0258b");
    expect((idOfHost(parsed, TWO) ?? "").slice(184)).toBe("d3fa4207756e8d2e");
  });

  it("belongs to the organisation and not to its place in the file: the same ids when the spellings swap hosts", async () => {
    // The order of the rows of a file is one order (another is refused), so the order of two
    // organisations changes by changing which name each host has.
    const first = await parsedOf(fileOf(ONE, TWO));
    const second = await parsedOf(fileOf(TWO, ONE));
    for (const host of [ONE, TWO]) {
      expect(idOfHost(first, host)).toBeDefined();
      expect(idOfHost(second, host)).toBe(idOfHost(first, host));
    }
    expect(second.skipped).toBe(0);
  });

  it("gives the same bodies and records for the same list written another way", async () => {
    await expectDeterministic(discloseIoConnector, (reversed): ConnectorFetch => {
      const rows = fileOf(ONE, TWO);
      const body = reversed
        ? JSON.stringify(rows.map((row) => Object.fromEntries(Object.entries(row).reverse())))
        : textOfRows(rows);
      return fakeFetch(filesOf(body));
    });
  });

  it("keeps the key itself as the id up to 200 characters, and hashes it from 201", async () => {
    // "Boundary case" makes the compact name `boundarycase`, 12 characters, and "@" is one more.
    for (const [hostLength, hashed] of [
      [187, false],
      [188, true],
    ] as const) {
      const host = hostOfLength(hostLength);
      const key = `boundarycase@${host}`;
      expect(key.length).toBe(hostLength + 13);
      const parsed = await parsedOf(
        rowsWith([{ name: "Boundary case", url: `https://${host}/vdp` }]),
      );
      const record = recordOf(parsed, hashed ? hashedIdOf(key) : key);
      expect(record.sourceRecordId).toHaveLength(200);
      expect(record.sourceRecordId.includes("~")).toBe(hashed);
      if (hashed) expect(record.sourceRecordId.slice(184)).toBe("3b400d3eadc4c7f6");
      expect(parsed.skipped).toBe(0);
    }
  });

  it("is unchanged for every key of 200 characters or fewer, and none of them has a tilde", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Examplesec", url: "https://www.examplesec.com/vdp" },
        { name: "Hostless Organisation", url: "mailto:x@y.example" },
      ]),
    );
    expect(recordOf(parsed, "examplesec@examplesec.com")).toBeDefined();
    expect(recordOf(parsed, "hostlessorganisation@none")).toBeDefined();
    expect(parsed.records.some((record) => record.sourceRecordId.includes("~"))).toBe(false);
  });
});

describe("a host as a strong key when one record carries it", () => {
  const domainKeysOf = (parsed: ParseResult, id: string): string[] =>
    recordOf(parsed, id).matchKeys.filter((key) => key.startsWith("domain:"));
  const nameKeysOf = (parsed: ParseResult, id: string): string[] =>
    recordOf(parsed, id).matchKeys.filter((key) => key.startsWith("name:"));
  /** What the body says of each organisation: the decision is made before the body is written. */
  const keyedInBody = (
    parsed: ParseResult & { snapshot: Snapshot },
    id: string,
  ): boolean | undefined =>
    (
      JSON.parse(parsed.snapshot.bodies[0]) as { rows: Array<{ id: string; keyed: boolean }> }
    ).rows.find((row) => row.id === id)?.keyed;

  it("is no key of either of two programs with different names on one host, and both keep their name keys", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Alphabrand Reports", url: "https://parenthost.example/alpha" },
        { name: "Betabrand Reports", url: "https://parenthost.example/beta" },
      ]),
    );
    expect(parsed.skipped).toBe(0);
    for (const [id, name] of [
      ["alphabrandreports@parenthost.example", "name:alphabrandreports"],
      ["betabrandreports@parenthost.example", "name:betabrandreports"],
    ]) {
      expect(domainKeysOf(parsed, id)).toEqual([]);
      expect(nameKeysOf(parsed, id)).toEqual([name]);
      expect(keyedInBody(parsed, id)).toBe(false);
    }
  });

  it("is no key of any of three programs on one host", async () => {
    const parsed = await parsedOf(
      rowsWith(
        ["Triobrand One", "Triobrand Two", "Triobrand Three"].map((name, i) => ({
          name,
          url: `https://triohost.example/${i}`,
        })),
      ),
    );
    for (const id of [
      "triobrandone@triohost.example",
      "triobrandtwo@triohost.example",
      "triobrandthree@triohost.example",
    ]) {
      expect(domainKeysOf(parsed, id)).toEqual([]);
      expect(nameKeysOf(parsed, id)).toHaveLength(1);
    }
  });

  it("is the key of a program that is alone on its host, as before, whatever the other hosts hold", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Soloprogram", url: "https://solohost.example/vdp" },
        { name: "Alphabrand Reports", url: "https://parenthost.example/alpha" },
        { name: "Betabrand Reports", url: "https://parenthost.example/beta" },
      ]),
    );
    expect(recordOf(parsed, "soloprogram@solohost.example").matchKeys).toEqual([
      "name:soloprogram",
      "domain:solohost.example",
    ]);
    expect(keyedInBody(parsed, "soloprogram@solohost.example")).toBe(true);
  });

  it("is the key of one record that two rows make with two spellings of a name on one host, when each row has an address of its own", async () => {
    // One group is one record: it is the only record that carries the host, whatever its rows are.
    const parsed = await parsedOf(
      rowsWith([
        { name: "Same Brand", url: "https://samebrand.example/one" },
        { name: "SameBrand", url: "https://samebrand.example/two" },
      ]),
    );
    const id = "samebrand@samebrand.example";
    expect(
      parsed.records.filter((record) => record.sourceRecordId.startsWith("samebrand@")),
    ).toHaveLength(1);
    expect((recordOf(parsed, id).identifiers as { programs: string[] }).programs).toEqual([
      "Same Brand",
      "SameBrand",
    ]);
    expect(domainKeysOf(parsed, id)).toEqual(["domain:samebrand.example"]);
  });

  it("is no key of the record that those two rows make when they use one address: the rule of the address is as it was", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Same Brand", url: "https://samebrand.example/one" },
        { name: "SameBrand", url: "https://samebrand.example/one" },
      ]),
    );
    const id = "samebrand@samebrand.example";
    expect(domainKeysOf(parsed, id)).toEqual([]);
    expect(nameKeysOf(parsed, id)).toEqual(["name:samebrand"]);
  });

  it("is the key of the one program whose address nobody else uses, when the other programs of the host share an address", async () => {
    // Only a program that would carry the key counts: the two that share an address never could.
    const parsed = await parsedOf(
      rowsWith([
        { name: "Ownbrand Reports", url: "https://mixedhost.example/own" },
        { name: "Sharedone Reports", url: "https://mixedhost.example/shared" },
        { name: "Sharedtwo Reports", url: "https://mixedhost.example/shared" },
      ]),
    );
    expect(domainKeysOf(parsed, "ownbrandreports@mixedhost.example")).toEqual([
      "domain:mixedhost.example",
    ]);
    expect(domainKeysOf(parsed, "sharedonereports@mixedhost.example")).toEqual([]);
    expect(domainKeysOf(parsed, "sharedtworeports@mixedhost.example")).toEqual([]);
    expect(nameKeysOf(parsed, "sharedonereports@mixedhost.example")).toHaveLength(1);
  });

  it("is no key of either program whichever of them comes first in the file", async () => {
    // The rows of a file have one order (the CI sorts them, another order is refused), so the two
    // orders of two programs are made by swapping which name each address has.
    const names = ["Firstorg Reports", "Secondorg Reports"];
    const ids = ["firstorgreports@orderhost.example", "secondorgreports@orderhost.example"];
    for (const swapped of [false, true]) {
      const [a, b] = swapped ? [names[1], names[0]] : names;
      const parsed = await parsedOf(
        rowsWith([
          { name: a, url: "https://orderhost.example/one" },
          { name: b, url: "https://orderhost.example/two" },
        ]),
      );
      for (const id of ids) {
        expect(domainKeysOf(parsed, id)).toEqual([]);
        expect(nameKeysOf(parsed, id)).toHaveLength(1);
      }
    }
  });

  it("makes no record of a program whose only key was its host, when another program on the host takes it away", async () => {
    // Names of fewer than four letters have no name key. Neither of these is a record any more, and
    // a group that makes no record is not a row that failed.
    const parsed = await parsedOf(
      rowsWith([
        { name: "Abc", url: "https://shortpair.example/one" },
        { name: "Abd", url: "https://shortpair.example/two" },
      ]),
    );
    expect(
      parsed.records.some((record) => record.sourceRecordId.endsWith("@shortpair.example")),
    ).toBe(false);
    expect(parsed.skipped).toBe(0);
    expect(parsed.errors).toBe(0);
    expect(parsed.records).toHaveLength(FILLER_COUNT);
  });

  it("gives the same body and records for the same list written another way", async () => {
    await expectDeterministic(discloseIoConnector, (reversed): ConnectorFetch => {
      const rows = rowsWith([
        { name: "Soloprogram", url: "https://solohost.example/vdp" },
        { name: "Alphabrand Reports", url: "https://parenthost.example/alpha" },
        { name: "Betabrand Reports", url: "https://parenthost.example/beta" },
        { name: "Ownbrand Reports", url: "https://mixedhost.example/own" },
        { name: "Sharedone Reports", url: "https://mixedhost.example/shared" },
        { name: "Sharedtwo Reports", url: "https://mixedhost.example/shared" },
      ]);
      const body = reversed
        ? JSON.stringify(rows.map((row) => Object.fromEntries(Object.entries(row).reverse())))
        : textOfRows(rows);
      return fakeFetch(filesOf(body));
    });
  });
});

describe("the records", () => {
  it("are well formed, for every record of the list, and begin and end as the template says", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Examplesec", url: "https://www.examplesec.com/vdp" },
        { name: "Platformed", url: "https://bugcrowd.com/platformed" },
      ]),
    );
    expect(parsed.errors).toBe(0);
    expect(parsed.skipped).toBe(0);
    expectWellFormedRecords(parsed.records, {
      sourceId: "disclose_io",
      mark: DISCLOSE_IO_RECORD_MARK,
    });
    for (const record of parsed.records) {
      expect(record.recordType).toBe("disclosure_program");
      expect(record.summary.startsWith(`${FIRST_SENTENCE} Program: `)).toBe(true);
      expect(record.summary.endsWith(CLOSING)).toBe(true);
      expect(record.summary).not.toContain("raw.githubusercontent.com");
      expect(record.summary.startsWith(DISCLOSE_IO_RECORD_MARK)).toBe(true);
      expect(record.publishedAt).toBeNull();
      expect(record.sourceUpdatedAt).toBeNull();
    }
  });

  it("link to the repository with the key of the organisation, and never to an address that a contributor wrote", async () => {
    const parsed = await parsedOf(
      rowsWith([{ name: "Examplesec", url: `https://www.examplesec.com/${LEFT_OUT.policyPath}` }]),
    );
    const record = recordOf(parsed, "examplesec@examplesec.com");
    expect(record.url).toBe(
      "https://github.com/disclose/diodb?program=examplesec%40examplesec.com",
    );
    expect(new Set(parsed.records.map((r) => r.url)).size).toBe(parsed.records.length);
    for (const r of parsed.records) {
      expect(r.url.startsWith("https://github.com/disclose/diodb?program=")).toBe(true);
    }
  });

  it("say which kind of list it is: the host of the operator's repository, not that of the file", async () => {
    const parsed = await parsedOf(rowsWith());
    expect(parsed.records[0].summary.startsWith(FIRST_SENTENCE)).toBe(true);
    expect(parsed.records[0].summary).not.toContain("raw.githubusercontent.com");
  });

  it("carry no version of the list: the file has none", async () => {
    const parsed = await parsedOf(rowsWith());
    expect(parsed.sourceVersion).toBeNull();
    expect(parsed.root).toBe("program-list.json");
  });

  it("are made for an organisation that has a name key or a domain key, and not for one that has neither", async () => {
    const parsed = await parsedOf(
      rowsWith([
        { name: "Qxa", url: "https://bugcrowd.com/qxa-program" },
        { name: "Qxb", url: "https://hackerone.com/qxb-program" },
        { name: "Qxc", url: "https://qxc-vdp.example/x" },
      ]),
    );
    // The first two have no key at all: a name of fewer than four characters, on a platform.
    expect(parsed.records.some((r) => r.sourceRecordId === "qxa@bugcrowd.com")).toBe(false);
    expect(parsed.records.some((r) => r.sourceRecordId === "qxb@hackerone.com")).toBe(false);
    // The third has the host of its own policy: a domain key alone.
    expect(recordOf(parsed, "qxc@qxc-vdp.example").matchKeys).toEqual(["domain:qxc-vdp.example"]);
  });

  it("do not count an organisation without a key as a row that could not be read: thirty of them are no failure", async () => {
    const keyless = Array.from({ length: 30 }, (_, i) => ({
      name: `K${String(i).padStart(2, "0")}`,
      url: `https://bugcrowd.com/keyless-${i}`,
    }));
    const parsed = await parsedOf(rowsWith(keyless));
    expect(parsed.errors).toBe(0);
    expect(parsed.skipped).toBe(0);
    expect(parsed.records).toHaveLength(FILLER_COUNT);
  });
});

describe("the words of a policy", () => {
  const summaryOf = async (over: Record<string, unknown>): Promise<string> => {
    const parsed = await parsedOf(
      rowsWith([{ name: "Wordcheck", url: "https://wordcheck.example/vdp", over }]),
    );
    return recordOf(parsed, "wordcheck@wordcheck.example").summary;
  };
  const NOT_STATED = "(safe harbor: not stated; bounty: not stated)";

  it("reads safe_harbor and offers_bounty in lower case and trimmed, and maps only the words that the project uses", async () => {
    expect(await summaryOf({ safe_harbor: "Partial", offers_bounty: " Yes " })).toContain(
      "(safe harbor: partial; bounty: yes)",
    );
    expect(await summaryOf({ safe_harbor: "FULL", offers_bounty: "partial" })).toContain(
      "(safe harbor: full; bounty: partial)",
    );
    expect(await summaryOf({ safe_harbor: " none\t", offers_bounty: "NO" })).toContain(
      "(safe harbor: none; bounty: no)",
    );
  });

  it("reads any other word, an empty text and a value of another type as not stated, and 'yes' as a safe harbor too", async () => {
    expect(await summaryOf({ safe_harbor: "yes", offers_bounty: "unknown" })).toContain(NOT_STATED);
    expect(await summaryOf({ safe_harbor: "", offers_bounty: "" })).toContain(NOT_STATED);
    expect(await summaryOf({ safe_harbor: true, offers_bounty: 1 })).toContain(NOT_STATED);
    expect(await summaryOf({ safe_harbor: null, offers_bounty: ["yes"] })).toContain(NOT_STATED);
    expect(
      await summaryOf({ safe_harbor: "full and more", offers_bounty: "yes, sometimes" }),
    ).toContain(NOT_STATED);
  });

  it("does not take a word for another: bounty has no 'full' and safe harbor no 'no'", async () => {
    expect(await summaryOf({ safe_harbor: "no", offers_bounty: "full" })).toContain(NOT_STATED);
    expect(await summaryOf({ safe_harbor: "none", offers_bounty: "none" })).toContain(
      "(safe harbor: none; bounty: not stated)",
    );
  });

  it("reads a row that lacks both keys as not stated", async () => {
    expect(await summaryOf({ safe_harbor: undefined, offers_bounty: undefined })).toContain(
      NOT_STATED,
    );
  });
});

describe("what the file holds that no record may hold", () => {
  it("copies no field that is left out, in the body of the snapshot or in a record", async () => {
    const parsed = await parsedOf(
      rowsWith([{ name: "Leftout", url: `https://www.leftout.com/${LEFT_OUT.policyPath}?x=1` }]),
    );
    const body = parsed.snapshot.bodies.join("\n");
    const records = JSON.stringify(parsed.records);
    for (const token of Object.values(LEFT_OUT)) {
      expect(body).not.toContain(token);
      expect(records).not.toContain(token);
    }
    for (const text of [body, records]) {
      expect(text).not.toContain("sentinel.example");
      // Of the policy address only the host is kept, and only as the host.
      expect(text).not.toContain("https://www.leftout.com");
      expect(text).not.toContain("/vdp");
    }
    expect(recordOf(parsed, "leftout@leftout.com").summary).toContain("published on leftout.com");
  });

  it("holds no e-mail address and no contact address in the body or the records, whatever the row has", async () => {
    const parsed = await parsedOf(rowsWith());
    const everything = `${parsed.snapshot.bodies.join("")}${JSON.stringify(parsed.records)}`;
    expect(everything).not.toContain("@sentinel");
    expect(everything).not.toContain("contact_");
    expect(everything).not.toContain("sentinel.example");
  });

  it("holds no field of the row but its name, its policy host and its two words", async () => {
    const parsed = await parsedOf(rowsWith());
    const first = JSON.parse(parsed.snapshot.bodies[0]).rows[0] as Record<string, unknown>;
    expect(Object.keys(first).sort()).toEqual(["display", "host", "id", "keyed", "programs"]);
    expect(Object.keys((first.programs as Array<Record<string, unknown>>)[0]).sort()).toEqual([
      "bounty",
      "name",
      "safeHarbor",
    ]);
  });
});

describe("a file that is hostile", () => {
  const HOSTILE = `Evil${cp(0x7)}${cp(0x202e)}Corp${cp(0x200b)} <script>alert(1)</script> ${cp(0xd800)} ${cp(0xff1c)}b${cp(0xff1e)}`;

  it("is cleaned in every cell it names: controls, bidirectional and zero-width characters, markup, a lone surrogate", async () => {
    const parsed = await parsedOf(
      rowsWith([
        {
          name: HOSTILE,
          url: `https://hostile-${cp(0x200b)}host.example/${cp(0x7)}vdp`,
          safeHarbor: `full${cp(0x202e)}`,
          bounty: `<b>yes</b>`,
        },
      ]),
    );
    expect(parsed.errors).toBe(0);
    expectWellFormedRecords(parsed.records, {
      sourceId: "disclose_io",
      mark: DISCLOSE_IO_RECORD_MARK,
    });
    const hostile = parsed.records.find((record) => record.title.includes("Evil"));
    expect(hostile).toBeDefined();
    const text = `${hostile?.title}${hostile?.summary}`;
    expect(text).not.toMatch(/[<>]/);
    for (const code of [0x7, 0x202e, 0x200b, 0xd800]) expect(text).not.toContain(cp(code));
    // A hidden character around a word is not part of it; a word with markup around it is none.
    expect(hostile?.summary).toContain("published on hostile-host.example");
    expect(hostile?.summary).toContain("(safe harbor: full; bounty: not stated)");
    expect(hostile?.matchKeys).toContain("domain:hostile-host.example");
  });

  it("leaves a row unread whose name or address does not fit its limit, whatever the size of the cell: a name and an address of 100 KB", async () => {
    // A cut name would be an id, a key and a title with the marker of the cut in them, and a cut
    // address a host that may end inside the host: neither is read in part.
    const big = "A".repeat(100_000);
    const parsed = await parsedOf(
      fileWith([
        { program_name: `Bigname ${big}`, policy_url: "https://bigname.example/vdp" },
        { program_name: "Bigaddress", policy_url: `https://bigaddress.example/${big}` },
      ]),
    );
    expect(parsed.errors).toBe(0);
    expect(parsed.skipped).toBe(2);
    expect(parsed.records).toHaveLength(FILLER_COUNT);
    expect(parsed.snapshot.bodies[0].length).toBeLessThan(1_000_000);
    expect(parsed.snapshot.bodies[0]).not.toContain("Bigname");
    expect(parsed.snapshot.bodies[0]).not.toContain("Bigaddress");
    expect(parsed.snapshot.bodies[0]).not.toContain("shortened");
  });

  it("reads a file of 8 MB of addresses of a thousand parts each in a fraction of a second: only the first part is parsed", async () => {
    // Each address is unique (a count of 1 each, so none is dropped as a scope) and is as long as the
    // reader reads it; reading the host of every part cost seconds, for a file of this size.
    const rows = Array.from({ length: 3900 }, (_, i) => ({
      program_name: `Parts Org ${String(i).padStart(5, "0")}`,
      policy_url: `${i},${"[,".repeat(998)}`,
    }));
    const body = JSON.stringify(rows);
    expect(body.length).toBeGreaterThan(7_500_000);
    const started = Date.now();
    const parsed = discloseIoConnector.parse(await snapshotOf(body));
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(parsed.errors).toBe(0);
    expect(parsed.records).toHaveLength(3900);
  });

  it("does not take an organisation from a name that the cleaning left of nothing", async () => {
    const parsed = await parsedOf(
      rowsWith([{ name: `${cp(0x200b)}${cp(0x202e)}`, url: "https://nothing.example/vdp" }]),
    );
    expect(parsed.skipped).toBe(1);
  });

  it("keeps a key of the object that no row reads: a __proto__ key and a constructor are keys like the others", async () => {
    const text = textOfRows(rowsWith()).replace(
      '"program_name"',
      '"__proto__": {"policy_url_status": "dead"}, "constructor": {"prototype": {"x": 1}}, "program_name"',
    );
    const parsed = discloseIoConnector.parse(await snapshotOf(text));
    expect(parsed.errors).toBe(0);
    expect(parsed.records).toHaveLength(FILLER_COUNT);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe("the summary of an organisation that fills every limit", () => {
  const program = (n: number) => ({
    name: `${n}`.repeat(80),
    safeHarbor: "not stated" as const,
    bounty: "not stated" as const,
  });
  const organisation = (over: Partial<DiscloseOrganisation> = {}): DiscloseOrganisation => ({
    id: "worstcase@host",
    display: "D".repeat(80),
    host: hostOfLength(60),
    keyed: false,
    programs: [program(1), program(2), program(3)],
    ...over,
  });

  it("keeps the three programs when they fit", () => {
    const summary = discloseSummaryOf(organisation());
    expect(summary.length).toBe(1228);
    for (const n of [1, 2, 3]) expect(summary).toContain(`${n}`.repeat(80));
    expect(summary.startsWith(FIRST_SENTENCE)).toBe(true);
    expect(summary.endsWith(CLOSING)).toBe(true);
  });

  it("leaves the third program out when the three do not fit, and never the closing sentence", () => {
    const summary = discloseSummaryOf(organisation({ host: hostOfLength(100) }));
    expect(summary.length).toBe(1019);
    expect(summary).toContain("1".repeat(80));
    expect(summary).toContain("2".repeat(80));
    expect(summary).not.toContain("3".repeat(80));
    expect(summary.endsWith(CLOSING)).toBe(true);
  });

  it("leaves the second out as well when two do not fit: the longest host of a website and 80 characters of name", () => {
    const summary = discloseSummaryOf(organisation({ host: hostOfLength(251) }));
    expect(summary.length).toBe(841);
    expect(summary).toContain("1".repeat(80));
    expect(summary).not.toContain("2".repeat(80));
    expect(summary.endsWith(CLOSING)).toBe(true);
  });

  it("is never longer than the limit, whatever the host and the names are", () => {
    for (let host = 20; host <= 253; host += 7) {
      for (const name of [8, 40, 80]) {
        const programs = [1, 2, 3].map((n) => ({ ...program(n), name: `${n}`.repeat(name) }));
        const summary = discloseSummaryOf(organisation({ host: hostOfLength(host), programs }));
        expect(summary.length).toBeLessThanOrEqual(RECORD_SUMMARY_MAX);
        expect(summary.endsWith(CLOSING)).toBe(true);
      }
    }
  });

  it("cuts the sentences before the closing one, and keeps it whole, when even one program is too long", () => {
    const huge = organisation({
      display: "D".repeat(3000),
      host: "x".repeat(3000),
      programs: [{ ...program(1), name: "N".repeat(3000) }],
    });
    const cut = discloseSummaryOf(huge);
    expect(cut.length).toBeLessThanOrEqual(RECORD_SUMMARY_MAX);
    expect(cut.endsWith(CLOSING)).toBe(true);
    expect(cut).toContain(" [shortened] ");
  });

  it("is within the limit for a record made from a file whose cells fill every limit, with its closing sentence", async () => {
    const host = hostOfLength(251);
    // Three spellings of one name, 76 characters long, on the longest host: one record of three programs.
    const spellings = ["!", "?", ","].map((mark) => `${"W".repeat(75)}${mark}`);
    const parsed = await parsedOf(
      rowsWith(spellings.map((name, i) => ({ name, url: `https://${host}/vdp-${i}` }))),
    );
    const record = parsed.records.find((r) => r.sourceRecordId.startsWith("www"));
    expect(record).toBeDefined();
    expect((record?.identifiers as { programs: string[] }).programs).toHaveLength(3);
    expect(record?.summary.length).toBeLessThanOrEqual(RECORD_SUMMARY_MAX);
    expect(record?.summary.endsWith(CLOSING)).toBe(true);
    expectWellFormedRecords(parsed.records, {
      sourceId: "disclose_io",
      mark: DISCLOSE_IO_RECORD_MARK,
    });
  });
});

describe("a file the size of the real one", () => {
  it("gives a record for every organisation, no error and no skipped row, a body of a few hundred kilobytes", async () => {
    const parsed = await parsedOf(rowsWith());
    expect(parsed.records).toHaveLength(FILLER_COUNT);
    expect(parsed.errors).toBe(0);
    expect(parsed.skipped).toBe(0);
    expect(parsed.snapshot.bodies[0].length).toBeLessThan(1_000_000);
    for (const record of parsed.records) {
      expect(record.summary.endsWith(CLOSING)).toBe(true);
      expect(record.summary.length).toBeLessThanOrEqual(RECORD_SUMMARY_MAX);
    }
  });
});
