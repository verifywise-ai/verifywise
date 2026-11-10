/**
 * The connector factory of the list kit (kit/fileConnector.ts): it downloads the files of a list,
 * checks where they came from, hands them to the list's reader, keeps the rows as one canonical
 * JSON body, and builds the records of that body with the allowance for rows that do not parse.
 * The tests use a small list of three columns, and a fake fetch: no network.
 */
import logger from "../../../../../../utils/logger/fileLogger";
import { FetchError } from "../../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../../types";
import { ZipError } from "../../../zip";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "../../__tests__/helpers/kitContract";
import {
  BodyTooLargeError,
  type ConnectorFetch,
  NotTheListError,
  type Snapshot,
} from "../../types";
import { dayText, lineOf } from "../clean";
import {
  type Fetched,
  type ListSpec,
  type ReadResult,
  createFileConnector,
} from "../fileConnector";
import { UnreadableEntry, recordOf } from "../record";
import { cellAt, columnsOf, readCsvText } from "../table";

jest.setTimeout(30_000);

jest.mock("../../../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const MARK = "Example list (example.org)";
const URL_ONE = "https://data.example.org/lists/entries.csv";
const URL_TWO = "https://data.example.org/lists/aliases.csv";

interface Row {
  id: string;
  name: string;
  day: string | null;
}

const MAX_ROWS = 1_000_000;
const MAX_COLUMNS = 1000;

/** The list: `id,name,day`, one entry a row. */
function readWith(maxRows: number, maxColumns: number) {
  return (fetched: Fetched): ReadResult<Row> | null => {
    const csv = readCsvText(fetched.buffers[0].toString("utf8"), maxRows, maxColumns);
    const [header, ...body] = csv.rows;
    if (header === undefined) return null;
    const columns = columnsOf(header, { id: "id", name: "name", day: "day" });
    if (columns === null) return null;
    const rows: Row[] = [];
    let unreadable = 0;
    for (const cells of body) {
      const id = lineOf(cellAt(cells, columns.id), 100);
      if (id === "") {
        unreadable += 1;
        continue;
      }
      rows.push({
        id,
        name: lineOf(cellAt(cells, columns.name), 200),
        day: dayText(cellAt(cells, columns.day)),
      });
    }
    // A reader that stopped at its limit of rows, at a quote that was never closed or at a row of
    // too many columns has read part of the list, and says so.
    return {
      rows,
      total: body.length,
      unreadable,
      complete: !csv.more && !csv.cut && !csv.wide,
    };
  };
}

const read = readWith(MAX_ROWS, MAX_COLUMNS);

/** An entry as a record; an entry with no name is unreadable. */
const toRecords = (rows: readonly Row[]) =>
  rows.map((row) =>
    recordOf({
      id: row.id,
      type: "restricted_party",
      title: row.name,
      summary: `${MARK}. Entry: ${row.name}.`,
      url: `https://example.org/entries/${encodeURIComponent(row.id)}`,
      identifiers: { id: row.id },
      names: [row.name],
      publishedAt: row.day,
    }),
  );

const SPEC: ListSpec<Row> = {
  id: "kev",
  version: 3,
  root: "entries.csv",
  sortKey: (row) => row.id,
  files: [{ url: URL_ONE, maxBytes: 1024 * 1024, contentTypes: ["text/csv", "text/plain"] }],
  pin: { hosts: ["data.example.org"], pathPrefixes: ["/lists/"] },
  read,
  toRecords,
  sourceVersion: (rows) =>
    rows.reduce<string | null>(
      (newest, { day }) => (day !== null && (newest === null || day > newest) ? day : newest),
      null,
    ),
};

const specWith = (over: Partial<ListSpec<Row>>): ListSpec<Row> => ({ ...SPEC, ...over });

const ROWS: Array<[string, string, string]> = [
  ["E-3", "Gamma Optics Ltd", "2026-03-01"],
  ["E-1", "Alpha Robotics Ltd", "2026-01-05"],
  ["E-2", "Beta Analytics Inc", ""],
];

const quote = (cell: string): string =>
  /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
const csvOf = (rows: ReadonlyArray<readonly string[]>): string =>
  `${["id,name,day", ...rows.map((row) => row.map(quote).join(","))].join("\n")}\n`;

const CSV = csvOf(ROWS);
const filesOf = (body = CSV, over: Partial<FakeFile> = {}): Record<string, FakeFile> => ({
  [URL_ONE]: { body, contentType: "text/csv", ...over },
});

const SORTED_ROWS: Row[] = [
  { id: "E-1", name: "Alpha Robotics Ltd", day: "2026-01-05" },
  { id: "E-2", name: "Beta Analytics Inc", day: null },
  { id: "E-3", name: "Gamma Optics Ltd", day: "2026-03-01" },
];

const bodyWith = (rows: readonly Row[], total = rows.length, unreadable = 0): string =>
  JSON.stringify({ v: 1, rows, total, unreadable });

const snapshotOf = (body: string): Snapshot => ({
  bodies: [body],
  etag: null,
  lastModified: null,
  bytes: Buffer.byteLength(body),
});

/** The failure of a promise, or undefined when it did not fail. */
const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

const MIB = 1024 * 1024;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createFileConnector", () => {
  describe("the connector it makes", () => {
    it("is a snapshot connector of the list, at the version of its reading", () => {
      const connector = createFileConnector(SPEC);
      expect(connector.id).toBe("kev");
      expect(connector.version).toBe(3);
      expect(connector.kind).toBeUndefined();
      expect(typeof connector.download).toBe("function");
      expect(typeof connector.parse).toBe("function");
    });

    it("is refused, at once, when the spec has no way to fetch, or fetches without a pin", () => {
      expect(() => createFileConnector(specWith({ pin: undefined }))).toThrow(Error);
      expect(() => createFileConnector(specWith({ files: undefined }))).toThrow(Error);
      expect(() => createFileConnector(specWith({ files: [] }))).toThrow(Error);
      expect(() => createFileConnector(specWith({ files: undefined, pin: undefined }))).toThrow(
        Error,
      );
      let message = "";
      try {
        createFileConnector(specWith({ pin: undefined }));
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toContain("example.org");
      expect(message).not.toContain("https");
    });

    it("needs no files and no pin when the spec fetches for itself", () => {
      const fetchFiles = jest.fn();
      expect(() =>
        createFileConnector(specWith({ files: undefined, pin: undefined, fetchFiles })),
      ).not.toThrow();
    });

    describe("the path prefixes of the pin (review finding 16)", () => {
      const pinWith = (pathPrefixes: readonly string[]) => ({
        hosts: ["data.example.org"],
        pathPrefixes,
      });

      it.each([
        ["no slash at the end: /lists would let /lists-other/ through", ["/lists"]],
        ["a prefix without it among others that have it", ["/lists/", "/other"]],
        ["an empty text", [""]],
        ["no slash at the start, which no path has", ["lists/"]],
        ["a slash at the start and none at the end, of a deeper directory", ["/odi/ffdd"]],
      ])("is refused, at once, when it has %s", (_name, pathPrefixes) => {
        expect(() => createFileConnector(specWith({ pin: pinWith(pathPrefixes) }))).toThrow(Error);
      });

      it("is refused whatever the spec fetches with: a pin of a spec that fetches for itself is checked too", () => {
        const fetchFiles = jest.fn();
        expect(() =>
          createFileConnector(specWith({ files: undefined, fetchFiles, pin: pinWith(["/lists"]) })),
        ).toThrow(Error);
      });

      it("is refused with a message that names no host, no path and no prefix", () => {
        let message = "";
        try {
          createFileConnector(specWith({ pin: pinWith(["/zqx-token-path"]) }));
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message).not.toBe("");
        for (const part of ["example.org", "zqx", "token", "https", "data."]) {
          expect(message).not.toContain(part);
        }
      });

      it.each([
        ["no prefixes at all, which is every path", undefined],
        ["the root", ["/"]],
        ["directories that end with a slash", ["/lists/", "/other/deeper/"]],
      ])("is accepted with %s", (_name, pathPrefixes) => {
        const pin =
          pathPrefixes === undefined ? { hosts: ["data.example.org"] } : pinWith(pathPrefixes);
        expect(() => createFileConnector(specWith({ pin }))).not.toThrow();
      });
    });
  });

  describe("download of one file", () => {
    it("asks the file once, with the validators it stored (without its prefix) and the limits of the file", async () => {
      const fetch = fakeFetch(filesOf());
      // The etag that this version stored: behind the prefix of the version (3).
      const validators = { etag: 'k3:"stored"', lastModified: "Wed, 01 Jan 2025 00:00:00 GMT" };

      await createFileConnector(SPEC).download(fetch, validators);

      expect(fetch.calls).toEqual([
        {
          url: URL_ONE,
          validators: { etag: '"stored"', lastModified: "Wed, 01 Jan 2025 00:00:00 GMT" },
          limits: {
            maxBytes: MIB,
            allowedContentTypes: ["text/csv", "text/plain"],
            totalTimeoutMs: 120_000,
          },
        },
      ]);
    });

    it("takes the time limit of the file when it has one", async () => {
      const fetch = fakeFetch(filesOf());
      const files = [{ ...SPEC.files![0], timeoutMs: 45_000 }];

      await createFileConnector(specWith({ files })).download(fetch, {});

      expect(fetch.calls[0].limits.totalTimeoutMs).toBe(45_000);
    });

    it("gives one snapshot: the canonical body, the validators of the file and the bytes", async () => {
      const fetch = fakeFetch(
        filesOf(CSV, { etag: '"e1"', lastModified: "Thu, 15 Oct 2026 12:30:03 GMT" }),
      );

      const snapshot = await createFileConnector(SPEC).download(fetch, {});

      expect(snapshot).toEqual({
        bodies: [bodyWith(SORTED_ROWS, 3, 0)],
        etag: 'k3:"e1"',
        lastModified: "Thu, 15 Oct 2026 12:30:03 GMT",
        bytes: Buffer.byteLength(CSV),
      });
    });

    it("gives the prefix of the version alone, and no date, when the file has no validators", async () => {
      const snapshot = await createFileConnector(SPEC).download(fakeFetch(filesOf()), {});
      expect(snapshot).toMatchObject({ etag: "k3:", lastModified: null });
    });

    it("counts the bytes that were downloaded, not the characters of the rows", async () => {
      const body = csvOf([["E-1", "Caf\u{e9} \u{1f600}", "2026-01-05"]]);
      const snapshot = await createFileConnector(SPEC).download(fakeFetch(filesOf(body)), {});
      expect((snapshot as Snapshot).bytes).toBe(Buffer.byteLength(body));
      expect((snapshot as Snapshot).bytes).toBeGreaterThan(body.length);
    });

    it("hands the reader what was downloaded: the bytes, the types and the validators", async () => {
      let given: Fetched | undefined;
      const spec = specWith({
        read: (fetched) => {
          given = fetched;
          return read(fetched);
        },
      });
      const fetch = fakeFetch(
        filesOf(CSV, { contentType: "text/csv; charset=utf-8", etag: '"e1"', lastModified: "x" }),
      );

      await createFileConnector(spec).download(fetch, {});

      expect(given).toEqual({
        buffers: [Buffer.from(CSV)],
        contentTypes: ["text/csv; charset=utf-8"],
        etag: '"e1"',
        lastModified: "x",
        bytes: Buffer.byteLength(CSV),
      });
    });

    it("answers unchanged when the file says that it is, and reads nothing", async () => {
      const reader = jest.fn(read);
      const fetch = fakeFetch(filesOf(CSV, { etag: '"e1"' }));

      const answer = await createFileConnector(specWith({ read: reader })).download(fetch, {
        etag: 'k3:"e1"',
      });

      expect(answer).toBe("unchanged");
      expect(reader).not.toHaveBeenCalled();
    });

    it("fails an answer of unchanged that came from another address, as not allowed", async () => {
      const fetch = fakeFetch(
        filesOf(CSV, { etag: '"e1"', url: "https://evil.example.net/lists/entries.csv" }),
      );

      const failure = await failureOf(
        createFileConnector(SPEC).download(fetch, { etag: 'k3:"e1"' }),
      );

      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("not_allowed");
    });

    it.each([
      ["another host", "https://evil.example.net/lists/entries.csv"],
      [
        "a host that only starts like it",
        "https://data.example.org.attacker.net/lists/entries.csv",
      ],
      ["plain http", "http://data.example.org/lists/entries.csv"],
      ["another port", "https://data.example.org:8443/lists/entries.csv"],
      ["a user name", "https://user:secret@data.example.org/lists/entries.csv"],
      ["another directory", "https://data.example.org/other/entries.csv"],
      ["a climb out of the directory", "https://data.example.org/lists/../other/entries.csv"],
    ])("refuses an answer that came from %s, naming no address", async (_name, from) => {
      const fetch = fakeFetch(filesOf(CSV, { url: from }));

      const failure = await failureOf(createFileConnector(SPEC).download(fetch, {}));

      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("not_allowed");
      const message = (failure as FetchError).message;
      for (const part of ["evil", "attacker", "secret", "example.org", "https", "lists"]) {
        expect(message).not.toContain(part);
      }
    });

    it("refuses an answer whose address is no address at all, naming none (the fake fetch gives only addresses, so this one is written by hand)", async () => {
      for (const notModified of [false, true]) {
        const fetch: ConnectorFetch = async () =>
          notModified
            ? { notModified: true, url: "not an address" }
            : {
                notModified: false,
                url: "not an address",
                status: 200,
                contentType: "text/csv",
                body: Buffer.from(CSV),
                truncated: false,
                etag: null,
                lastModified: null,
              };
        const failure = await failureOf(createFileConnector(SPEC).download(fetch, {}));
        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("not_allowed");
        expect((failure as FetchError).message).not.toContain("not an address");
      }
    });

    it("accepts an answer from another file of the pinned directory, after a redirect", async () => {
      const fetch = fakeFetch(
        filesOf(CSV, { url: "https://data.example.org/lists/archive/2026/entries.csv" }),
      );
      expect(await createFileConnector(SPEC).download(fetch, {})).not.toBe("unchanged");
    });

    it("fails a file cut at its limit as too large, before it reads it", async () => {
      const reader = jest.fn(read);
      const fetch = fakeFetch(filesOf(CSV, { truncated: true }));

      const failure = await failureOf(
        createFileConnector(specWith({ read: reader })).download(fetch, {}),
      );

      expect(failure).toBeInstanceOf(BodyTooLargeError);
      expect(reader).not.toHaveBeenCalled();
    });

    it("fails a file that is not the list as such, whatever it is", async () => {
      for (const body of [
        "",
        "<html>not a list</html>",
        "id,other\n1,2\n",
        "a,b,c\n",
        `"unclosed`,
      ]) {
        const failure = await failureOf(
          createFileConnector(SPEC).download(fakeFetch(filesOf(body)), {}),
        );
        expect(failure).toBeInstanceOf(NotTheListError);
        expect((failure as Error).message).toBe("The file is not the list.");
      }
    });

    it("lets a failure of the fetch through as it is", async () => {
      const failure = await failureOf(createFileConnector(SPEC).download(fakeFetch({}), {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");
    });

    it("lets the fetch's own failures through, with their reasons and no change", async () => {
      const rejecting: ConnectorFetch = async () => {
        throw new FetchError("blocked_by_site", undefined, { status: 429, retryAfterMs: 5000 });
      };
      const failure = await failureOf(createFileConnector(SPEC).download(rejecting, {}));
      expect(failure).toMatchObject({ reason: "blocked_by_site", status: 429, retryAfterMs: 5000 });
    });
  });

  describe("the version of the reading and the validators of a file (review finding 1)", () => {
    const DATE = "Thu, 15 Oct 2026 12:30:03 GMT";
    const FILE = (): Record<string, FakeFile> => filesOf(CSV, { etag: '"e1"', lastModified: DATE });

    it("stores the etag of a file behind the version of the reading, and its date as it is", async () => {
      const snapshot = await createFileConnector(SPEC).download(fakeFetch(FILE()), {});
      expect(snapshot).toMatchObject({ etag: 'k3:"e1"', lastModified: DATE });
    });

    it("asks with the stored validators, and the server answers that nothing changed", async () => {
      const fetch = fakeFetch(FILE());
      const answer = await createFileConnector(SPEC).download(fetch, {
        etag: 'k3:"e1"',
        lastModified: DATE,
      });
      expect(fetch.calls[0].validators).toEqual({ etag: '"e1"', lastModified: DATE });
      expect(answer).toBe("unchanged");
    });

    it("asks with the date alone when the file had no etag, and is told that nothing changed", async () => {
      const fetch = fakeFetch(filesOf(CSV, { lastModified: DATE }));
      const stored = (await createFileConnector(SPEC).download(fetch, {})) as Snapshot;
      expect(stored.etag).toBe("k3:");

      const again = await createFileConnector(SPEC).download(fetch, {
        etag: stored.etag,
        lastModified: stored.lastModified,
      });
      expect(fetch.calls[1].validators).toEqual({ etag: null, lastModified: DATE });
      expect(again).toBe("unchanged");
    });

    it("sends no validators after a version bump, so that a file that the server calls current is read again", async () => {
      // The last download was made by version 2 of the reading, and the server still says "current".
      const stored = { etag: 'k2:"e1"', lastModified: DATE };
      const fetch = fakeFetch(FILE());

      const answer = await createFileConnector(SPEC).download(fetch, stored);

      expect(fetch.calls[0].validators).toEqual({});
      expect(answer).not.toBe("unchanged");
      expect(answer).toMatchObject({ etag: 'k3:"e1"', lastModified: DATE });
      expect((answer as Snapshot).bodies).toEqual([bodyWith(SORTED_ROWS, 3, 0)]);
    });

    it("takes the new version's own etag from then on: the first download after the bump, and the next one", async () => {
      const bumped = createFileConnector(specWith({ version: 4 }));
      const fetch = fakeFetch(FILE());
      // Stored by version 3.
      const first = (await bumped.download(fetch, {
        etag: 'k3:"e1"',
        lastModified: DATE,
      })) as Snapshot;
      expect(first.etag).toBe('k4:"e1"');
      expect(fetch.calls[0].validators).toEqual({});

      const second = await bumped.download(fetch, {
        etag: first.etag,
        lastModified: first.lastModified,
      });
      expect(fetch.calls[1].validators).toEqual({ etag: '"e1"', lastModified: DATE });
      expect(second).toBe("unchanged");
    });

    it("sends no validators for an etag that older code stored, which has no prefix", async () => {
      const fetch = fakeFetch(FILE());
      const answer = await createFileConnector(SPEC).download(fetch, {
        etag: '"e1"',
        lastModified: DATE,
      });
      expect(fetch.calls[0].validators).toEqual({});
      expect(answer).not.toBe("unchanged");
    });

    it("sends no validators, not even the date, when only the date was stored", async () => {
      const fetch = fakeFetch(FILE());
      await createFileConnector(SPEC).download(fetch, { lastModified: DATE });
      await createFileConnector(SPEC).download(fetch, { etag: null, lastModified: DATE });
      expect(fetch.calls.map((call) => call.validators)).toEqual([{}, {}]);
    });

    it("does not take the prefix of a version for another: k3: is not k30: and not k:", async () => {
      const fetch = fakeFetch(FILE());
      for (const etag of ['k30:"e1"', 'k:"e1"', 'K3:"e1"', ' k3:"e1"', 'k3"e1"', 'xk3:"e1"']) {
        await createFileConnector(SPEC).download(fetch, { etag, lastModified: DATE });
      }
      expect(fetch.calls.map((call) => call.validators)).toEqual(Array(6).fill({}));
    });

    it("sends the stored etag whole, whatever it holds after the prefix", async () => {
      const weak = 'W/"abc:def"';
      const fetch = fakeFetch(filesOf(CSV, { etag: weak }));
      const stored = (await createFileConnector(SPEC).download(fetch, {})) as Snapshot;
      expect(stored.etag).toBe(`k3:${weak}`);
      await createFileConnector(SPEC).download(fetch, { etag: stored.etag });
      expect(fetch.calls[1].validators).toEqual({ etag: weak, lastModified: null });
    });

    it("reads the file again after a bump that fixes what the records are made of: the body is parsed anew", async () => {
      const first = createFileConnector(SPEC);
      const snapshot = (await first.download(fakeFetch(FILE()), {})) as Snapshot;
      const fixed = createFileConnector(
        specWith({
          version: 4,
          toRecords: (rows) =>
            toRecords(rows).map((record) => ({ ...record, title: `${record.title} (fixed)` })),
        }),
      );
      const again = (await fixed.download(fakeFetch(FILE()), {
        etag: snapshot.etag,
        lastModified: snapshot.lastModified,
      })) as Snapshot;
      expect(fixed.parse(again).records[0].title).toBe("Alpha Robotics Ltd (fixed)");
    });

    it("gives a list of several files the prefix alone, and sends them nothing, whatever was stored", async () => {
      const files = [
        { url: URL_ONE, maxBytes: 1000, contentTypes: ["text/csv"] },
        { url: URL_TWO, maxBytes: 1000, contentTypes: ["text/csv"] },
      ];
      const fetch = fakeFetch({
        [URL_ONE]: { body: CSV, contentType: "text/csv", etag: '"one"' },
        [URL_TWO]: { body: "alias,id\n", contentType: "text/csv", etag: '"two"' },
      });
      const snapshot = await createFileConnector(specWith({ files })).download(fetch, {
        etag: 'k3:"one"',
        lastModified: DATE,
      });
      expect(fetch.calls.map((call) => call.validators)).toEqual([{}, {}]);
      expect(snapshot).toMatchObject({ etag: "k3:", lastModified: null });
    });
  });

  describe("a read that did not take in the whole list (review finding 6)", () => {
    const download = (spec: ListSpec<Row>, csv = CSV) =>
      createFileConnector(spec).download(fakeFetch(filesOf(csv)), {});

    it("fails the download as too large when the reader says that it is not complete", async () => {
      const spec = specWith({ read: (fetched) => ({ ...read(fetched)!, complete: false }) });
      const failure = await failureOf(download(spec));
      expect(failure).toBeInstanceOf(BodyTooLargeError);
      expect((failure as Error).message).toBe("The file is larger than its limit.");
    });

    it("builds no body and sorts nothing for a reader that is not complete", async () => {
      const sortKey = jest.fn((row: Row) => row.id);
      const spec = specWith({
        sortKey,
        read: (fetched) => ({ ...read(fetched)!, complete: false }),
      });
      await failureOf(download(spec));
      expect(sortKey).not.toHaveBeenCalled();
    });

    it("fails a reader that stopped at its limit of rows: the first rows of a list are not the list", async () => {
      // The file has a header and three rows; the reader may take three lines.
      const spec = specWith({ read: readWith(3, MAX_COLUMNS) });
      expect(await failureOf(download(spec))).toBeInstanceOf(BodyTooLargeError);
    });

    it("reads the list when the limit of rows is just enough, header included", async () => {
      expect(await download(specWith({ read: readWith(4, MAX_COLUMNS) }))).not.toBe("unchanged");
      expect(
        await failureOf(download(specWith({ read: readWith(3, MAX_COLUMNS) }))),
      ).toBeInstanceOf(BodyTooLargeError);
    });

    it("fails a reader that stopped at a quote that was never closed", async () => {
      const cut = `${csvOf(ROWS)}E-9,"Unfinished`;
      expect(await failureOf(download(SPEC, cut))).toBeInstanceOf(BodyTooLargeError);
    });

    it("fails a reader that stopped at a row of more columns than it takes", async () => {
      const wide = `${csvOf(ROWS)}E-9,Wide,2026-01-01,x,y,z\n`;
      expect(
        await failureOf(download(specWith({ read: readWith(MAX_ROWS, 5) }), wide)),
      ).toBeInstanceOf(BodyTooLargeError);
      expect(await download(specWith({ read: readWith(MAX_ROWS, 6) }), wide)).not.toBe("unchanged");
    });

    it("fails a reader that gives no bit of completeness, or one that is not true: only yes is yes", async () => {
      for (const complete of [undefined, null, 0, 1, "true", "yes", {}, []]) {
        const spec = specWith({
          read: () =>
            ({ rows: [], total: 0, unreadable: 0, complete }) as unknown as ReadResult<Row>,
        });
        expect(await failureOf(download(spec))).toBeInstanceOf(BodyTooLargeError);
      }
      const missing = specWith({
        read: () => ({ rows: [], total: 0, unreadable: 0 }) as unknown as ReadResult<Row>,
      });
      expect(await failureOf(download(missing))).toBeInstanceOf(BodyTooLargeError);
    });

    it("checks the completeness after the list: a reader that finds no list is not the list, whatever else it says", async () => {
      const spec = specWith({ read: () => null });
      expect(await failureOf(download(spec))).toBeInstanceOf(NotTheListError);
    });

    it("applies to a spec that fetches for itself as to one that has files: its reader may stop at a page", async () => {
      const spec = specWith({
        files: undefined,
        pin: undefined,
        fetchFiles: async () => ({
          buffers: [Buffer.from(CSV)],
          contentTypes: ["text/csv"],
          etag: null,
          lastModified: null,
          bytes: CSV.length,
        }),
        read: (fetched) => ({ ...read(fetched)!, complete: false }),
      });
      expect(await failureOf(download(spec))).toBeInstanceOf(BodyTooLargeError);
    });
  });

  describe("the counts of the reader (review finding 5)", () => {
    const rowsOf = (count: number): Row[] =>
      Array.from({ length: count }, (_, at) => ({ id: `R-${at}`, name: `Name ${at}`, day: null }));
    const downloadOf = (result: unknown) =>
      createFileConnector(specWith({ read: () => result as ReadResult<Row> })).download(
        fakeFetch(filesOf()),
        {},
      );

    it.each([
      ["a total below the rows it gives", { rows: rowsOf(3), total: 2, unreadable: 0 }],
      ["a total of 0 for rows that exist", { rows: rowsOf(1), total: 0, unreadable: 0 }],
      [
        "a total below the rows it gives and the rows it could not read",
        { rows: rowsOf(3), total: 3, unreadable: 1 },
      ],
      ["a total below the unreadable rows alone", { rows: [], total: 4, unreadable: 5 }],
      ["a negative total", { rows: [], total: -1, unreadable: 0 }],
      ["a fractional total", { rows: rowsOf(1), total: 1.5, unreadable: 0 }],
      ["a total that is NaN", { rows: [], total: Number.NaN, unreadable: 0 }],
      ["a total that is infinite", { rows: [], total: Number.POSITIVE_INFINITY, unreadable: 0 }],
      ["a total that is a text", { rows: [], total: "0", unreadable: 0 }],
      ["a negative count of unreadable rows", { rows: [], total: 5, unreadable: -1 }],
      ["a fractional count of unreadable rows", { rows: [], total: 5, unreadable: 0.5 }],
      ["no count of unreadable rows", { rows: [], total: 0 }],
      ["no total", { rows: [], unreadable: 0 }],
      ["rows that are no array", { rows: "abc", total: 3, unreadable: 0 }],
      ["no rows", { total: 0, unreadable: 0 }],
      ["rows that are an object", { rows: {}, total: 0, unreadable: 0 }],
    ])(
      "fails a reader that gives %s, as not the list, as parse would refuse its body",
      async (_name, partial) => {
        const failure = await failureOf(downloadOf({ ...partial, complete: true }));
        expect(failure).toBeInstanceOf(NotTheListError);
      },
    );

    it.each([
      ["nothing at all", undefined],
      ["a text", "rows"],
      ["a number", 5],
      ["an array", []],
    ])(
      "fails a reader that gives %s in place of a result, as not the list",
      async (_name, result) => {
        expect(await failureOf(downloadOf(result))).toBeInstanceOf(NotTheListError);
      },
    );

    it("takes a total that is just enough: the rows and the unreadable rows, or more", async () => {
      for (const total of [3, 4, 1000]) {
        const snapshot = await downloadOf({
          rows: rowsOf(3),
          total,
          unreadable: total === 3 ? 0 : 1,
          complete: true,
        });
        expect(snapshot).not.toBe("unchanged");
      }
      expect(await downloadOf({ rows: [], total: 0, unreadable: 0, complete: true })).toMatchObject(
        {
          bodies: [bodyWith([], 0, 0)],
        },
      );
    });

    it("keeps in the body the counts that the reader gave, as they are", async () => {
      const snapshot = (await downloadOf({
        rows: rowsOf(2),
        total: 10_000,
        unreadable: 7,
        complete: true,
      })) as Snapshot;
      expect(JSON.parse(snapshot.bodies[0])).toMatchObject({ total: 10_000, unreadable: 7 });
    });

    describe("the basis of the allowance, which a reader that counts its unreadable rows in raw rows may give", () => {
      /** Three entities from 10 raw rows, one raw row of which could not be read, and the basis the test gives. */
      const withBasis = (allowanceBasis: unknown) =>
        downloadOf({ rows: rowsOf(3), total: 10, unreadable: 1, allowanceBasis, complete: true });

      it.each([
        ["a basis that is negative", -1],
        ["a basis with a fraction", 2.5],
        ["a basis that is NaN", Number.NaN],
        ["a basis that is infinite", Number.POSITIVE_INFINITY],
        ["a basis that is a text", "10"],
        ["a basis that is null", null],
        ["a basis that is a boolean", true],
        ["a basis that is an object", { count: 10 }],
        ["a basis that is a list", [10]],
        ["a basis above the total, which counts the rows that the reader saw", 11],
      ])("fails a reader that gives %s, as not the list", async (_name, allowanceBasis) => {
        expect(await failureOf(withBasis(allowanceBasis))).toBeInstanceOf(NotTheListError);
      });

      it.each([0, 4, 9, 10])(
        "takes a basis of %s, a count that is not above the total",
        async (basis) => {
          expect(await withBasis(basis)).not.toBe("unchanged");
        },
      );

      it("keeps the basis in the body next to the total, before the unreadable rows", async () => {
        const body = ((await withBasis(10)) as Snapshot).bodies[0];
        expect(Object.keys(JSON.parse(body))).toEqual([
          "v",
          "rows",
          "total",
          "allowanceBasis",
          "unreadable",
        ]);
        expect(JSON.parse(body)).toMatchObject({ total: 10, allowanceBasis: 10, unreadable: 1 });
        expect(body).toContain('"total":10,"allowanceBasis":10,"unreadable":1}');
      });

      it("writes no basis for a reader that gives none, so that the body is what it always was", async () => {
        const absent = (
          (await downloadOf({
            rows: rowsOf(3),
            total: 10,
            unreadable: 1,
            complete: true,
          })) as Snapshot
        ).bodies[0];
        const undef = ((await withBasis(undefined)) as Snapshot).bodies[0];

        expect(Object.keys(JSON.parse(absent))).toEqual(["v", "rows", "total", "unreadable"]);
        expect(absent).not.toContain("allowanceBasis");
        expect(absent).toBe(bodyWith(rowsOf(3), 10, 1));
        // A basis that is undefined is none.
        expect(undef).toBe(absent);
      });
    });
  });

  describe("an error thrown by the reader (review finding 13)", () => {
    const failing = (error: unknown) =>
      failureOf(
        createFileConnector(
          specWith({
            read: () => {
              throw error;
            },
          }),
        ).download(fakeFetch(filesOf()), {}),
      );

    it.each([
      ["a SyntaxError of JSON.parse, as for an HTML page", () => JSON.parse("<html>")],
      ["a RangeError of a date", () => new Date(Number.NaN).toISOString()],
      ["a TypeError", () => (null as unknown as { x: string }).x.length],
      ["an UnreadableEntry", () => new UnreadableEntry()],
      ["an Error of its own", () => new Error("a message with https://example.org/secret in it")],
      [
        "a ZipError (the archive helpers map the limits to BodyTooLargeError themselves)",
        () => new ZipError("corrupt"),
      ],
    ])("becomes NotTheListError, the one the sync maps to wrong_root: %s", async (_name, make) => {
      let error: unknown;
      try {
        error = make();
      } catch (thrown) {
        error = thrown;
      }
      const failure = await failing(error);
      expect(failure).toBeInstanceOf(NotTheListError);
      expect((failure as Error).message).toBe("The file is not the list.");
    });

    it("becomes NotTheListError when what is thrown is no error at all", async () => {
      for (const thrown of ["a text", 5, null, undefined, { reason: "x" }]) {
        expect(await failing(thrown)).toBeInstanceOf(NotTheListError);
      }
    });

    it("lets a FetchError, a BodyTooLargeError and a NotTheListError through as they are", async () => {
      const fetchError = new FetchError("blocked_by_site", undefined, { status: 429 });
      const tooLarge = new BodyTooLargeError();
      const notTheList = new NotTheListError();
      expect(await failing(fetchError)).toBe(fetchError);
      expect(await failing(tooLarge)).toBe(tooLarge);
      expect(await failing(notTheList)).toBe(notTheList);
    });
  });

  describe("an error out of the sort key, of JSON or of a fetch (the retry case, review F2)", () => {
    // The sync does not retry NotTheListError, and does retry an error that it does not know: an
    // error that the same file will make again must be the first.
    const SECRET = "zqx-secret-row-text";

    /** What the sync must see: the one error it does not retry, in fixed words and holding nothing of the failure. */
    const expectNotTheList = (failure: unknown): void => {
      expect(failure).toBeInstanceOf(NotTheListError);
      const error = failure as Error & { cause?: unknown };
      expect(error.message).toBe("The file is not the list.");
      expect(error.name).toBe("NotTheListError");
      expect(error.cause).toBeUndefined();
      expect(String(failure)).not.toContain(SECRET);
    };
    const downloadOf = (spec: ListSpec<Row>) =>
      failureOf(createFileConnector(spec).download(fakeFetch(filesOf()), {}));
    /** A spec whose reader gives these rows, whatever the file holds. */
    const specOfRows = (rows: unknown[]) =>
      specWith({
        read: () => ({ rows: rows as Row[], total: rows.length, unreadable: 0, complete: true }),
      });
    const syntaxError = (): unknown => {
      try {
        JSON.parse("<html>");
      } catch (error) {
        return error;
      }
      return undefined;
    };

    describe("the sort key", () => {
      const THROWN: Array<[string, unknown]> = [
        ["an Error whose message holds the text of a row", new Error(`no key for ${SECRET}`)],
        ["a TypeError", new TypeError("x is not a function")],
        ["a RangeError", new RangeError("Invalid string length")],
        ["a text", `a text with ${SECRET}`],
        ["nothing at all", undefined],
      ];

      it.each(THROWN)("becomes NotTheListError when it throws %s", async (_name, error) => {
        const spec = specWith({
          sortKey: () => {
            throw error;
          },
        });
        expectNotTheList(await downloadOf(spec));
      });

      it("fails the whole download when it throws for one row alone: a list with a row that cannot be sorted is no list", async () => {
        const spec = specWith({
          sortKey: (row) => {
            if (row.id === "E-2") throw new TypeError(`bad row ${SECRET}`);
            return row.id;
          },
        });
        expectNotTheList(await downloadOf(spec));
      });

      it("becomes NotTheListError whatever it throws, an error of a download too: a sort key has no business failing a download as anything else", async () => {
        const spec = specWith({
          sortKey: () => {
            throw new BodyTooLargeError();
          },
        });
        expectNotTheList(await downloadOf(spec));
      });
    });

    describe("a row that JSON cannot write", () => {
      const cyclic = (): unknown => {
        const row: Record<string, unknown> = { id: "E-1", name: "Alpha" };
        row[SECRET] = row;
        return row;
      };

      it.each([
        ["a bigint", () => ({ id: "E-1", name: "Alpha", day: BigInt(10) })],
        ["a cycle, with a property named after the text of the row", cyclic],
        [
          "a toJSON that throws",
          () => ({
            id: "E-1",
            toJSON() {
              throw new Error(`toJSON failed on ${SECRET}`);
            },
          }),
        ],
        [
          "a toJSON that gives a bigint",
          () => ({
            id: "E-1",
            toJSON() {
              return { big: BigInt(1) };
            },
          }),
        ],
      ])("becomes NotTheListError for %s", async (_name, make) => {
        expectNotTheList(await downloadOf(specOfRows([make()])));
      });

      it("fails the download for one such row among good ones", async () => {
        const good = { id: "E-0", name: "Good", day: null };
        expectNotTheList(await downloadOf(specOfRows([good, { ...good, day: BigInt(1) }, good])));
      });

      it("still writes a row that JSON writes as nothing, as a null (not a failure)", async () => {
        const spec = specWith({
          sortKey: (row) => row?.id ?? "",
          read: () => ({
            rows: [{ id: "a", name: "kept", day: null }, undefined] as unknown as Row[],
            total: 2,
            unreadable: 0,
            complete: true,
          }),
        });
        const snapshot = await createFileConnector(spec).download(fakeFetch(filesOf()), {});
        expect(JSON.parse((snapshot as Snapshot).bodies[0]).rows).toEqual([
          null,
          { id: "a", name: "kept", day: null },
        ]);
      });
    });

    describe("a fetch of the spec's own", () => {
      const failingWith = (error: unknown) =>
        downloadOf(
          specWith({
            files: undefined,
            pin: undefined,
            fetchFiles: async () => {
              throw error;
            },
          }),
        );

      it.each([
        [
          "a TypeError with an address in its message",
          new TypeError(`cannot read ${URL_ONE}?token=abc`),
        ],
        ["a SyntaxError of JSON.parse, as for an HTML page", syntaxError()],
        ["a RangeError", new RangeError("Invalid array length")],
        [
          "an Error of its own, with an address and a row in its message",
          new Error(`failed at https://data.example.org/lists/ on ${SECRET}`),
        ],
        ["an UnreadableEntry", new UnreadableEntry()],
        ["a text", `a text with ${SECRET}`],
        ["an object that is no error", { reason: "x" }],
        ["nothing at all", undefined],
        ["null", null],
      ])("becomes NotTheListError when it throws %s", async (_name, error) => {
        const failure = await failingWith(error);
        expectNotTheList(failure);
        for (const part of ["example.org", "token", "https", "lists/"]) {
          expect(String(failure)).not.toContain(part);
        }
      });

      it("becomes NotTheListError when it throws before it returns a promise: a fetch that is no async function", async () => {
        const spec = specWith({
          files: undefined,
          pin: undefined,
          fetchFiles: () => {
            throw new TypeError(`sync ${SECRET}`);
          },
        });
        expectNotTheList(await downloadOf(spec));
      });

      it("lets a FetchError through as it is, with its reason, its status and the wait it asks for", async () => {
        const error = new FetchError("blocked_by_site", undefined, {
          status: 429,
          retryAfterMs: 5000,
        });
        const failure = await failingWith(error);
        expect(failure).toBe(error);
        expect(failure).toMatchObject({
          reason: "blocked_by_site",
          status: 429,
          retryAfterMs: 5000,
        });
      });

      it("lets a FetchError through as it is when it is thrown before a promise is returned", async () => {
        const error = new FetchError("unreachable");
        const spec = specWith({
          files: undefined,
          pin: undefined,
          fetchFiles: () => {
            throw error;
          },
        });
        expect(await downloadOf(spec)).toBe(error);
      });

      it("lets a BodyTooLargeError and a NotTheListError through as they are: the sync gives each its own code", async () => {
        for (const error of [new BodyTooLargeError(), new NotTheListError()]) {
          expect(await failingWith(error)).toBe(error);
        }
      });

      it.each(["not_zip", "corrupt", "unsupported", "too_large", "too_deep"] as const)(
        "lets a ZipError of code %s through as it is, so that the sync keeps its own code for it",
        async (code) => {
          const error = new ZipError(code);
          const failure = await failingWith(error);
          expect(failure).toBe(error);
          expect(failure).toMatchObject({ code });
        },
      );

      it("does not let a ZipError through out of the reader: that one is the file's and stays NotTheListError", async () => {
        const spec = specWith({
          read: () => {
            throw new ZipError("corrupt");
          },
        });
        expectNotTheList(await downloadOf(spec));
      });
    });

    describe("the files of the spec", () => {
      const TWO_FILES = specWith({
        files: [
          { url: URL_ONE, maxBytes: 1000, contentTypes: ["text/csv"] },
          { url: URL_TWO, maxBytes: 1000, contentTypes: ["text/csv"] },
        ],
      });

      it("turns an error of the sync's fetch that is not the download's own into NotTheListError", async () => {
        const fetch: ConnectorFetch = async () => {
          throw new TypeError(`fetch broke at ${URL_ONE} with ${SECRET}`);
        };
        for (const spec of [SPEC, TWO_FILES]) {
          const failure = await failureOf(createFileConnector(spec).download(fetch, {}));
          expectNotTheList(failure);
          expect(String(failure)).not.toContain("example.org");
        }
      });

      it("turns an answer that is no answer into NotTheListError: the spec is asked for a file and the fetch gave nothing", async () => {
        const fetch = (async () => undefined) as unknown as ConnectorFetch;
        expectNotTheList(await failureOf(createFileConnector(SPEC).download(fetch, {})));
      });

      it("lets the fetch's own failures through as they are, the same objects", async () => {
        for (const error of [
          new FetchError("not_found"),
          new FetchError("blocked_by_site", undefined, { status: 429, retryAfterMs: 5000 }),
          new BodyTooLargeError(),
        ]) {
          const fetch: ConnectorFetch = async () => {
            throw error;
          };
          expect(await failureOf(createFileConnector(SPEC).download(fetch, {}))).toBe(error);
        }
      });

      it("keeps the failures that the factory itself makes: not allowed, too large, unreachable", async () => {
        const outside = fakeFetch(
          filesOf(CSV, { url: "https://evil.example.net/lists/entries.csv" }),
        );
        expect(await failureOf(createFileConnector(SPEC).download(outside, {}))).toMatchObject({
          reason: "not_allowed",
        });
        const cut = fakeFetch(filesOf(CSV, { truncated: true }));
        expect(await failureOf(createFileConnector(SPEC).download(cut, {}))).toBeInstanceOf(
          BodyTooLargeError,
        );
        expect(
          await failureOf(createFileConnector(SPEC).download(fakeFetch({}), {})),
        ).toMatchObject({ reason: "unreachable" });
      });
    });
  });

  describe("the sort key (review finding 15)", () => {
    it.each([
      ["undefined", undefined],
      ["null", null],
      ["a number", 5],
      ["a boolean", true],
      ["an object", { id: "a" }],
      ["an array", ["a"]],
    ])("fails the download as not the list when it is %s", async (_name, key) => {
      const spec = specWith({ sortKey: () => key as unknown as string });
      const failure = await failureOf(createFileConnector(spec).download(fakeFetch(filesOf()), {}));
      expect(failure).toBeInstanceOf(NotTheListError);
    });

    it("takes an empty text for a key, and puts the rows with it first", async () => {
      const spec = specWith({ sortKey: (row) => (row.id === "E-3" ? "" : row.id) });
      const snapshot = await createFileConnector(spec).download(fakeFetch(filesOf()), {});
      const ids = JSON.parse((snapshot as Snapshot).bodies[0]).rows.map((row: Row) => row.id);
      expect(ids).toEqual(["E-3", "E-1", "E-2"]);
    });

    it("is asked once for each row, and with that row alone", async () => {
      const sortKey = jest.fn((row: Row) => row.id);
      await createFileConnector(specWith({ sortKey })).download(fakeFetch(filesOf()), {});
      expect(sortKey).toHaveBeenCalledTimes(3);
      expect(sortKey.mock.calls.map(([row]) => row.id).sort()).toEqual(["E-1", "E-2", "E-3"]);
    });
  });

  describe("download of several files", () => {
    const TWO = specWith({
      files: [
        { url: URL_ONE, maxBytes: 1000, contentTypes: ["text/csv"], timeoutMs: 10_000 },
        { url: URL_TWO, maxBytes: 2000, contentTypes: ["text/plain"] },
      ],
    });
    const BOTH = {
      [URL_ONE]: {
        body: CSV,
        contentType: "text/csv",
        etag: '"one"',
        lastModified: "Thu, 01 Jan 2026",
      },
      [URL_TWO]: { body: "alias,id\n", contentType: "text/plain", etag: '"two"' },
    };

    it("asks each file in order, with no validators, and the limits of each", async () => {
      const fetch = fakeFetch(BOTH);

      await createFileConnector(TWO).download(fetch, { etag: '"stored"', lastModified: "x" });

      expect(fetch.calls).toEqual([
        {
          url: URL_ONE,
          validators: {},
          limits: { maxBytes: 1000, allowedContentTypes: ["text/csv"], totalTimeoutMs: 10_000 },
        },
        {
          url: URL_TWO,
          validators: {},
          limits: { maxBytes: 2000, allowedContentTypes: ["text/plain"], totalTimeoutMs: 120_000 },
        },
      ]);
    });

    it("hands the reader the files in order, and gives the snapshot no validators of the files (the prefix of the version alone)", async () => {
      let given: Fetched | undefined;
      const spec = specWith({
        ...TWO,
        read: (fetched) => {
          given = fetched;
          return read(fetched);
        },
      });

      const snapshot = await createFileConnector(spec).download(fakeFetch(BOTH), {});

      expect(given).toEqual({
        buffers: [Buffer.from(CSV), Buffer.from("alias,id\n")],
        contentTypes: ["text/csv", "text/plain"],
        etag: null,
        lastModified: null,
        bytes: Buffer.byteLength(CSV) + Buffer.byteLength("alias,id\n"),
      });
      expect(snapshot).toEqual({
        bodies: [bodyWith(SORTED_ROWS, 3, 0)],
        etag: "k3:",
        lastModified: null,
        bytes: Buffer.byteLength(CSV) + Buffer.byteLength("alias,id\n"),
      });
    });

    it.each([
      ["the first", URL_ONE],
      ["the second", URL_TWO],
    ])(
      "fails as unreachable when %s answers that nothing changed, since it sent nothing to compare",
      async (_name, notModifiedUrl) => {
        const base = fakeFetch(BOTH);
        const fetch: ConnectorFetch = async (url, validators, limits) =>
          url === notModifiedUrl ? { notModified: true, url } : base(url, validators, limits);

        const failure = await failureOf(createFileConnector(TWO).download(fetch, {}));

        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("unreachable");
      },
    );

    it("fails as unreachable for an answer of unchanged whatever address it came from", async () => {
      const fetch: ConnectorFetch = async () => ({
        notModified: true,
        url: "https://evil.example.net/x",
      });
      const failure = await failureOf(createFileConnector(TWO).download(fetch, {}));
      expect((failure as FetchError).reason).toBe("unreachable");
    });

    it("fails an answer of any file from outside the pin, naming no address", async () => {
      const fetch = fakeFetch({
        ...BOTH,
        [URL_TWO]: { ...BOTH[URL_TWO], url: "https://evil.example.net/lists/aliases.csv" },
      });

      const failure = await failureOf(createFileConnector(TWO).download(fetch, {}));

      expect((failure as FetchError).reason).toBe("not_allowed");
      expect((failure as FetchError).message).not.toContain("evil");
    });

    it("fails a file cut at its limit, whichever it is", async () => {
      for (const url of [URL_ONE, URL_TWO] as const) {
        const fetch = fakeFetch({ ...BOTH, [url]: { ...BOTH[url], truncated: true } });
        expect(await failureOf(createFileConnector(TWO).download(fetch, {}))).toBeInstanceOf(
          BodyTooLargeError,
        );
      }
    });

    it("asks no more files after one failed", async () => {
      const fetch = fakeFetch({ [URL_ONE]: { ...BOTH[URL_ONE], truncated: true } });
      await failureOf(createFileConnector(TWO).download(fetch, {}));
      expect(fetch.calls.map((call) => call.url)).toEqual([URL_ONE]);
    });

    it("fails the files that are not the list as such", async () => {
      const fetch = fakeFetch({ ...BOTH, [URL_ONE]: { ...BOTH[URL_ONE], body: "x,y\n" } });
      expect(await failureOf(createFileConnector(TWO).download(fetch, {}))).toBeInstanceOf(
        NotTheListError,
      );
    });
  });

  describe("download by a fetch of the spec's own", () => {
    const fetched: Fetched = {
      buffers: [Buffer.from(CSV)],
      contentTypes: ["text/csv"],
      etag: '"own"',
      lastModified: "Fri, 02 Jan 2026",
      bytes: 777,
    };

    it("is given the fetch and the validators without the prefix of the version, and uses what it returns, files and pin aside", async () => {
      const fetchFiles = jest.fn(async () => fetched);
      const fetch = fakeFetch({});
      const validators = { etag: 'k3:"stored"', lastModified: "Thu, 01 Jan 2026" };

      const snapshot = await createFileConnector(specWith({ fetchFiles })).download(
        fetch,
        validators,
      );

      expect(fetchFiles).toHaveBeenCalledTimes(1);
      expect(fetchFiles).toHaveBeenCalledWith(fetch, {
        etag: '"stored"',
        lastModified: "Thu, 01 Jan 2026",
      });
      expect(fetch.calls).toEqual([]);
      // Its own etag comes out as it is in `Fetched`, and goes into the snapshot behind the prefix.
      expect(snapshot).toEqual({
        bodies: [bodyWith(SORTED_ROWS, 3, 0)],
        etag: 'k3:"own"',
        lastModified: "Fri, 02 Jan 2026",
        bytes: 777,
      });
    });

    it("is given no validators when the stored ones are those of another version, or of none", async () => {
      for (const stored of [
        { etag: 'k2:"stored"', lastModified: "Thu, 01 Jan 2026" },
        { etag: '"older code"', lastModified: "Thu, 01 Jan 2026" },
        { etag: null, lastModified: "Thu, 01 Jan 2026" },
        { lastModified: "Thu, 01 Jan 2026" },
        {},
      ]) {
        const fetchFiles = jest.fn(async () => fetched);
        const fetch = fakeFetch({});
        await createFileConnector(specWith({ fetchFiles })).download(fetch, stored);
        expect(fetchFiles).toHaveBeenCalledWith(fetch, {});
      }
    });

    it("is given the date alone, as no etag, when the stored etag is the prefix alone", async () => {
      const fetchFiles = jest.fn(async () => fetched);
      const fetch = fakeFetch({});
      await createFileConnector(specWith({ fetchFiles })).download(fetch, {
        etag: "k3:",
        lastModified: "Thu, 01 Jan 2026",
      });
      expect(fetchFiles).toHaveBeenCalledWith(fetch, {
        etag: null,
        lastModified: "Thu, 01 Jan 2026",
      });
    });

    it("stores the prefix alone when what it returns has no etag", async () => {
      const spec = specWith({ fetchFiles: async () => ({ ...fetched, etag: null }) });
      const snapshot = await createFileConnector(spec).download(fakeFetch({}), {});
      expect(snapshot).toMatchObject({ etag: "k3:", lastModified: "Fri, 02 Jan 2026" });
    });

    it("is called as a method of the spec, which can keep what it needs to fetch there", async () => {
      let receiver: unknown;
      const spec = specWith({
        fetchFiles(this: unknown) {
          receiver = this;
          return Promise.resolve(fetched);
        },
      });

      await createFileConnector(spec).download(fakeFetch({}), {});

      expect(receiver).toBe(spec);
    });

    it("does no check of its own on what was fetched: the spec pins what it asks", async () => {
      const fetchFiles = async () => ({ ...fetched, etag: null, lastModified: null });
      const spec = specWith({ files: undefined, pin: undefined, fetchFiles });
      expect(await createFileConnector(spec).download(fakeFetch({}), {})).not.toBe("unchanged");
    });

    it("answers unchanged when the spec does, and reads nothing", async () => {
      const reader = jest.fn(read);
      const spec = specWith({ read: reader, fetchFiles: async () => "unchanged" });
      expect(await createFileConnector(spec).download(fakeFetch({}), {})).toBe("unchanged");
      expect(reader).not.toHaveBeenCalled();
    });

    it("fails what it fetched that is not the list, as such", async () => {
      const spec = specWith({ read: () => null, fetchFiles: async () => fetched });
      expect(await failureOf(createFileConnector(spec).download(fakeFetch({}), {}))).toBeInstanceOf(
        NotTheListError,
      );
    });

    it("lets the failures of the spec's fetch through as they are", async () => {
      const spec = specWith({
        fetchFiles: async () => {
          throw new BodyTooLargeError();
        },
      });
      expect(await failureOf(createFileConnector(spec).download(fakeFetch({}), {}))).toBeInstanceOf(
        BodyTooLargeError,
      );
    });
  });

  describe("the body of the snapshot", () => {
    const bodyOf = async (csv: string): Promise<string> => {
      const snapshot = await createFileConnector(SPEC).download(fakeFetch(filesOf(csv)), {});
      return (snapshot as Snapshot).bodies[0];
    };

    it("is one canonical JSON text: v, the rows sorted, the total and the unreadable", async () => {
      const body = await bodyOf(CSV);
      expect(Object.keys(JSON.parse(body))).toEqual(["v", "rows", "total", "unreadable"]);
      expect(JSON.parse(body)).toEqual({ v: 1, rows: SORTED_ROWS, total: 3, unreadable: 0 });
      expect(body).toBe(bodyWith(SORTED_ROWS, 3, 0));
    });

    it("counts the rows that the reader could not read", async () => {
      const body = await bodyOf(csvOf([...ROWS, ["", "No id", ""], [" ", "Blank id", ""]]));
      expect(JSON.parse(body)).toMatchObject({ total: 5, unreadable: 2 });
      expect(JSON.parse(body).rows).toHaveLength(3);
    });

    it("does not depend on the order of the rows of the file", async () => {
      const forward = await bodyOf(csvOf(ROWS));
      const reversed = await bodyOf(csvOf([...ROWS].reverse()));
      const shuffled = await bodyOf(csvOf([ROWS[1], ROWS[2], ROWS[0]]));
      expect(reversed).toBe(forward);
      expect(shuffled).toBe(forward);
    });

    it("sorts by UTF-16 unit, as compareText does, and not by locale", async () => {
      const spec = specWith({
        read: () => ({
          rows: [
            { id: "b", name: "n", day: null },
            { id: "a", name: "n", day: null },
            { id: "B", name: "n", day: null },
            { id: `${"\u{e9}"}`, name: "n", day: null },
            { id: "z", name: "n", day: null },
          ],
          total: 5,
          unreadable: 0,
          complete: true,
        }),
      });
      const snapshot = await createFileConnector(spec).download(fakeFetch(filesOf()), {});
      const ids = JSON.parse((snapshot as Snapshot).bodies[0]).rows.map((row: Row) => row.id);
      expect(ids).toEqual(["B", "a", "b", "z", "\u{e9}"]);
    });

    describe("rows of one sort key: the canonical text of the row decides, and never the file (review finding 3)", () => {
      const SAME: Row[] = ["third", "first", "second", "fourth"].map((name) => ({
        id: "same",
        name,
        day: null,
      }));
      const bodyOfRows = async (rows: readonly Row[]): Promise<string> => {
        const spec = specWith({
          read: () => ({ rows: [...rows], total: rows.length, unreadable: 0, complete: true }),
        });
        const snapshot = await createFileConnector(spec).download(fakeFetch(filesOf()), {});
        return (snapshot as Snapshot).bodies[0];
      };
      const namesIn = (body: string): string[] => JSON.parse(body).rows.map((row: Row) => row.name);
      const permutationsOf = <T>(items: readonly T[]): T[][] =>
        items.length <= 1
          ? [[...items]]
          : items.flatMap((item, at) =>
              permutationsOf([...items.slice(0, at), ...items.slice(at + 1)]).map((rest) => [
                item,
                ...rest,
              ]),
            );

      it("puts them in the order of the text of the rows, not in the order of the file", async () => {
        expect(namesIn(await bodyOfRows(SAME))).toEqual(["first", "fourth", "second", "third"]);
      });

      it("gives one body for every order of the rows in the file (all 24 orders of four rows)", async () => {
        const bodies = new Set<string>();
        for (const order of permutationsOf(SAME)) bodies.add(await bodyOfRows(order));
        expect(permutationsOf(SAME)).toHaveLength(24);
        expect(bodies.size).toBe(1);
      });

      it("gives one body for two orders of two rows that differ in a later key of the row alone", async () => {
        const a: Row = { id: "same", name: "n", day: "2026-01-01" };
        const b: Row = { id: "same", name: "n", day: "2026-01-02" };
        expect(await bodyOfRows([a, b])).toBe(await bodyOfRows([b, a]));
      });

      it("compares the text of the rows by UTF-16 unit, as the keys: B is before a, which a locale would not say", async () => {
        const rows: Row[] = [
          { id: "same", name: "a", day: null },
          { id: "same", name: "B", day: null },
          { id: "same", name: "\u{e9}", day: null },
          { id: "same", name: "z", day: null },
        ];
        expect(namesIn(await bodyOfRows(rows))).toEqual(["B", "a", "z", "\u{e9}"]);
      });

      it("keeps the order of the sort keys first: the text of the row decides only between rows of one key", async () => {
        const rows: Row[] = [
          { id: "b", name: "A first by name", day: null },
          { id: "a", name: "Z last by name", day: null },
          { id: "a", name: "B middle by name", day: null },
        ];
        const parsed = JSON.parse(await bodyOfRows(rows)).rows as Row[];
        expect(parsed.map((row) => [row.id, row.name])).toEqual([
          ["a", "B middle by name"],
          ["a", "Z last by name"],
          ["b", "A first by name"],
        ]);
      });

      it("writes the text of each row once, and makes the body of those texts", async () => {
        let calls = 0;
        const rows = SAME.map((row) => ({
          ...row,
          toJSON() {
            calls += 1;
            return { id: row.id, name: row.name, day: row.day };
          },
        }));
        const body = await bodyOfRows(rows);
        expect(calls).toBe(rows.length);
        expect(body).toBe(
          bodyWith(
            ["first", "fourth", "second", "third"].map((name) => ({ id: "same", name, day: null })),
          ),
        );
      });

      it("treats a row that JSON writes as nothing as a null in the body, as JSON does", async () => {
        const rows = [
          { id: "a", name: "kept", day: null },
          undefined,
          undefined,
        ] as unknown as Row[];
        const spec = specWith({
          sortKey: (row) => row?.id ?? "",
          read: () => ({ rows, total: 3, unreadable: 0, complete: true }),
        });
        const snapshot = await createFileConnector(spec).download(fakeFetch(filesOf()), {});
        expect(JSON.parse((snapshot as Snapshot).bodies[0]).rows).toEqual([null, null, rows[0]]);
      });
    });

    it("is sorted by the key the spec gives, whatever the row holds", async () => {
      const spec = specWith({ sortKey: (row) => row.name });
      const snapshot = await createFileConnector(spec).download(fakeFetch(filesOf()), {});
      const names = JSON.parse((snapshot as Snapshot).bodies[0]).rows.map((row: Row) => row.name);
      expect(names).toEqual(["Alpha Robotics Ltd", "Beta Analytics Inc", "Gamma Optics Ltd"]);
    });

    it("holds nothing but the rows, the total and the count: no address, no validator, no day of the run", async () => {
      const body = await bodyOf(CSV);
      expect(body).not.toContain("example.org");
      expect(body).not.toContain("https");
    });

    it("is made of 200,000 rows in little time", async () => {
      const rows: Row[] = Array.from({ length: 200_000 }, (_, at) => ({
        id: `ID-${(at * 7919) % 200_000}`,
        name: `Name ${at}`,
        day: "2026-01-05",
      }));
      const spec = specWith({
        read: () => ({ rows, total: rows.length, unreadable: 0, complete: true }),
      });
      const start = Date.now();
      const snapshot = await createFileConnector(spec).download(fakeFetch(filesOf()), {});
      expect(Date.now() - start).toBeLessThan(10_000);
      expect(JSON.parse((snapshot as Snapshot).bodies[0]).rows).toHaveLength(200_000);
    });

    it("makes the same snapshots of the same fixture in two orders (the kit's own contract)", async () => {
      await expectDeterministic(createFileConnector(SPEC), (reversed) =>
        fakeFetch(filesOf(csvOf(reversed ? [...ROWS].reverse() : ROWS))),
      );
    });
  });

  describe("parse", () => {
    const connector = createFileConnector(SPEC);

    const parseOf = async (csv: string) =>
      connector.parse((await connector.download(fakeFetch(filesOf(csv)), {})) as Snapshot);

    it("makes the records of the rows, in the order of their sort keys", async () => {
      const result = await parseOf(CSV);
      expect(result.records.map((record) => record.sourceRecordId)).toEqual(["E-1", "E-2", "E-3"]);
      expect(result.records[0]).toMatchObject({
        sourceRecordId: "E-1",
        recordType: "restricted_party",
        title: "Alpha Robotics Ltd",
        publishedAt: "2026-01-05",
        matchKeys: ["name:alpharoboticsltd", "name:alpharobotics"],
      });
      expect(result.records[1].publishedAt).toBeNull();
    });

    it("gives the root of the list, the version the spec reads, and no error", async () => {
      expect(await parseOf(CSV)).toMatchObject({
        errors: 0,
        skipped: 0,
        root: "entries.csv",
        sourceVersion: "2026-03-01",
      });
    });

    it("gives no version when the spec reads none", async () => {
      const bare = createFileConnector(specWith({ sourceVersion: undefined }));
      const snapshot = (await bare.download(fakeFetch(filesOf()), {})) as Snapshot;
      expect(bare.parse(snapshot).sourceVersion).toBeNull();
    });

    it("hands the spec's version every row, whatever became of it", async () => {
      const seen: Row[][] = [];
      const spec = specWith({
        sourceVersion: (rows) => {
          seen.push([...rows]);
          return "v";
        },
      });
      const body = bodyWith([...SORTED_ROWS, { id: "E-9", name: "", day: null }]);
      createFileConnector(spec).parse(snapshotOf(body));
      expect(seen).toHaveLength(1);
      expect(seen[0]).toHaveLength(4);
    });

    it("builds the records of a row at a time, so that a row that cannot be read leaves out that row only", () => {
      const sizes: number[] = [];
      const spec = specWith({
        toRecords: (rows) => {
          sizes.push(rows.length);
          return toRecords(rows);
        },
      });
      createFileConnector(spec).parse(snapshotOf(bodyWith(SORTED_ROWS)));
      expect(sizes).toEqual([1, 1, 1]);
    });

    it("keeps the first of the records that have one id, in the order of the body, and counts the one it drops", () => {
      const spec = specWith({
        toRecords: (rows) =>
          rows.map((row) => ({ ...toRecords([{ ...row, id: "SAME" }])[0], title: row.name })),
      });
      const rows: Row[] = [
        { id: "x", name: "Second", day: null },
        { id: "y", name: "First", day: null },
      ];
      const result = createFileConnector(spec).parse(snapshotOf(bodyWith(rows)));
      expect(result.records.map((record) => record.title)).toEqual(["Second"]);
      // The record that was dropped differs from the one kept: it is a row that could not be read.
      expect(result).toMatchObject({ errors: 0, skipped: 1 });
    });

    it("keeps, of two entries of one id in a file, the same one whatever the order of the file (review finding 3)", async () => {
      const entries = [
        ["E-1", "Beta", ""],
        ["E-1", "Alpha", ""],
        ["E-0", "Zero", ""],
      ];
      const forward = await parseOf(csvOf(entries));
      const reversed = await parseOf(csvOf([...entries].reverse()));
      const shuffled = await parseOf(csvOf([entries[1], entries[2], entries[0]]));
      expect(reversed).toEqual(forward);
      expect(shuffled).toEqual(forward);
      // The row whose canonical text is the first of the two is the one kept.
      expect(forward.records.map((record) => [record.sourceRecordId, record.title])).toEqual([
        ["E-0", "Zero"],
        ["E-1", "Alpha"],
      ]);
    });

    it("gives the same bodies and the same records for two entries of one id in both orders (the kit's contract)", async () => {
      await expectDeterministic(createFileConnector(SPEC), (reversed) => {
        const entries = [
          ["E-1", "Beta", ""],
          ["E-1", "Alpha", ""],
        ];
        return fakeFetch(filesOf(csvOf(reversed ? [...entries].reverse() : entries)));
      });
    });

    describe("the records of one id (review finding 4)", () => {
      const named = (rows: ReadonlyArray<[string, string]>): Row[] =>
        rows.map(([id, name]) => ({ id, name, day: null }));

      it("counts a later record of an id that is not the one kept as a row that could not be read", () => {
        const rows = named([
          ["E-1", "Alpha"],
          ["E-1", "Beta"],
          ["E-2", "Gamma"],
        ]);
        const result = connector.parse(snapshotOf(bodyWith(rows)));
        expect(result.records.map((record) => record.title)).toEqual(["Alpha", "Gamma"]);
        // Three rows allow one: it is skipped, and the sync applies the rest.
        expect(result).toMatchObject({ errors: 0, skipped: 1 });
      });

      it("fails the list when 1,000 rows share one id: a connector that took its ids from the wrong column", () => {
        const rows = Array.from({ length: 1000 }, (_, at) => ({
          id: "ONE",
          name: `Name ${at}`,
          day: null,
        }));
        const result = connector.parse(snapshotOf(bodyWith(rows)));
        expect(result.records).toHaveLength(1);
        expect(result).toMatchObject({ errors: 999, skipped: 0, root: "entries.csv" });
      });

      it("fails the list when 200 rows take 2 ids between them", () => {
        const rows = Array.from({ length: 200 }, (_, at) => ({
          id: at % 2 === 0 ? "EVEN" : "ODD",
          name: `Name ${at}`,
          day: null,
        }));
        const result = connector.parse(snapshotOf(bodyWith(rows)));
        expect(result.records).toHaveLength(2);
        expect(result.errors).toBe(198);
      });

      it("lets one lost record pass in a long list: it is skipped, within the allowance", () => {
        const rows = [
          ...Array.from({ length: 199 }, (_, at) => ({
            id: `G-${String(at).padStart(3, "0")}`,
            name: `Good ${at}`,
            day: null,
          })),
          { id: "G-000", name: "Another entry of the first id", day: null },
        ];
        const result = connector.parse(snapshotOf(bodyWith(rows)));
        expect(result.records).toHaveLength(199);
        expect(result).toMatchObject({ errors: 0, skipped: 1 });
      });

      it("drops without a word a record that is equal to the one kept", () => {
        // Rows that differ in a column the record does not hold make equal records.
        const spec = specWith({
          toRecords: (rows) => toRecords(rows.map((row) => ({ ...row, day: null }))),
        });
        const rows = Array.from({ length: 1000 }, (_, at) => ({
          id: "ONE",
          name: "Same name",
          day: `2026-01-${String((at % 28) + 1).padStart(2, "0")}`,
        }));
        const result = createFileConnector(spec).parse(snapshotOf(bodyWith(rows)));
        expect(result.records).toHaveLength(1);
        expect(result).toMatchObject({ errors: 0, skipped: 0 });
      });

      it("drops without a word two equal rows of one id", () => {
        const row = { id: "E-1", name: "Alpha", day: null };
        const result = connector.parse(snapshotOf(bodyWith([row, row, row], 3, 0)));
        expect(result.records).toHaveLength(1);
        expect(result).toMatchObject({ errors: 0, skipped: 0 });
      });

      it("takes two records for equal when only the order of their keys differs: it compares the data, not the text", () => {
        const first = toRecords(named([["E-1", "Alpha"]]))[0];
        const reordered = Object.fromEntries(
          Object.entries(first).reverse(),
        ) as unknown as ParsedRecord;
        expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(first));
        const spec = specWith({
          toRecords: (rows) => (rows[0].name === "Alpha" ? [first] : [reordered]),
        });
        const result = createFileConnector(spec).parse(
          snapshotOf(
            bodyWith(
              named([
                ["E-1", "Alpha"],
                ["E-1", "Beta"],
              ]),
            ),
          ),
        );
        expect(result.records).toHaveLength(1);
        expect(result).toMatchObject({ errors: 0, skipped: 0 });
      });

      it("takes two records for different when an identifier, a key or a date differs", () => {
        const first = toRecords(named([["E-1", "Alpha"]]))[0];
        const variants: ParsedRecord[] = [
          { ...first, identifiers: { id: "E-1", more: "x" } },
          { ...first, matchKeys: [...first.matchKeys, "name:other"] },
          { ...first, publishedAt: "2026-02-02" },
          { ...first, sourceUpdatedAt: "2026-02-02T00:00:00.000Z" },
          { ...first, url: `${first.url}?x=1` },
        ];
        for (const variant of variants) {
          const spec = specWith({
            toRecords: (rows) => (rows[0].name === "Alpha" ? [first] : [variant]),
          });
          const result = createFileConnector(spec).parse(
            snapshotOf(
              bodyWith(
                named([
                  ["E-1", "Alpha"],
                  ["E-1", "Beta"],
                ]),
              ),
            ),
          );
          expect(result.records).toHaveLength(1);
          expect(result).toMatchObject({ errors: 0, skipped: 1 });
        }
      });

      it("counts the records that a row makes twice with different contents: one row, two records of one id", () => {
        const spec = specWith({
          toRecords: (rows) => {
            const [one] = toRecords(rows);
            return [one, { ...one, title: `${one.title} again` }];
          },
        });
        const result = createFileConnector(spec).parse(snapshotOf(bodyWith(SORTED_ROWS)));
        expect(result.records).toHaveLength(3);
        // Three records are lost, from three rows: that is more than one in ten of three rows.
        expect(result).toMatchObject({ errors: 3, skipped: 0 });
      });

      it("counts the dropped records with the rows that could not be read, in one allowance", () => {
        // 100 rows: 6 refused by toRecords, 4 lost as a second record of an id: ten, the allowance.
        const good = Array.from({ length: 90 }, (_, at) => ({
          id: `G-${String(at).padStart(3, "0")}`,
          name: `Good ${at}`,
          day: null,
        }));
        const bad = Array.from({ length: 6 }, (_, at) => ({ id: `B-${at}`, name: "", day: null }));
        const twins = Array.from({ length: 4 }, (_, at) => ({
          id: "G-000",
          name: `Twin ${at}`,
          day: null,
        }));
        expect(
          connector.parse(snapshotOf(bodyWith([...good, ...bad, ...twins], 100, 0))),
        ).toMatchObject({ errors: 0, skipped: 10 });
        // One twin more: 101 rows allow ten, and eleven were lost.
        const another = { id: "G-000", name: "Twin 9", day: null };
        expect(
          connector.parse(snapshotOf(bodyWith([...good, ...bad, ...twins, another], 101, 0))),
        ).toMatchObject({ errors: 11, skipped: 0 });
      });
    });

    it("gives a record for each of the records a row makes, and none for a row that makes none", () => {
      const spec = specWith({
        toRecords: (rows) =>
          rows[0].id === "E-2"
            ? []
            : [...toRecords(rows), ...toRecords([{ ...rows[0], id: `${rows[0].id}b` }])],
      });
      const result = createFileConnector(spec).parse(snapshotOf(bodyWith(SORTED_ROWS)));
      expect(result.records.map((record) => record.sourceRecordId)).toEqual([
        "E-1",
        "E-1b",
        "E-3",
        "E-3b",
      ]);
    });

    describe("the rows that cannot be read", () => {
      /** `good` rows and `bad` ones (no name: the record builder refuses them). */
      const rowsOf = (good: number, bad: number): Row[] => [
        ...Array.from({ length: good }, (_, at) => ({
          id: `G-${String(at).padStart(5, "0")}`,
          name: `Good ${at}`,
          day: null,
        })),
        ...Array.from({ length: bad }, (_, at) => ({
          id: `B-${String(at).padStart(5, "0")}`,
          name: "",
          day: null,
        })),
      ];

      it("are left out and counted, and the list is read, within the allowance of ten", () => {
        const result = connector.parse(snapshotOf(bodyWith(rowsOf(95, 3), 100, 2)));
        expect(result.records).toHaveLength(95);
        expect(result).toMatchObject({ errors: 0, skipped: 5 });
      });

      it("are ten at most while the list is short", () => {
        const ten = connector.parse(snapshotOf(bodyWith(rowsOf(990, 10), 1000, 0)));
        expect(ten).toMatchObject({ errors: 0, skipped: 10 });
        const eleven = connector.parse(snapshotOf(bodyWith(rowsOf(989, 11), 1000, 0)));
        expect(eleven).toMatchObject({ errors: 11, skipped: 0 });
        expect(eleven.records).toHaveLength(989);
      });

      it("are a hundredth of the rows at most when that is more", () => {
        const twenty = connector.parse(snapshotOf(bodyWith(rowsOf(1980, 20), 2000, 0)));
        expect(twenty).toMatchObject({ errors: 0, skipped: 20 });
        const twentyOne = connector.parse(snapshotOf(bodyWith(rowsOf(1979, 21), 2000, 0)));
        expect(twentyOne).toMatchObject({ errors: 21, skipped: 0 });
      });

      it("count those of the reader with those of the records", () => {
        // 92 rows are in the body and 8 could not be read by the reader: 100 rows, ten allowed, ten lost.
        expect(connector.parse(snapshotOf(bodyWith(rowsOf(90, 2), 100, 8)))).toMatchObject({
          errors: 0,
          skipped: 10,
        });
        // One more that the records refuse: 101 rows, ten allowed, eleven lost.
        expect(connector.parse(snapshotOf(bodyWith(rowsOf(90, 3), 101, 8)))).toMatchObject({
          errors: 11,
          skipped: 0,
        });
        // The reader's alone: 111 rows, ten allowed, eleven lost.
        expect(connector.parse(snapshotOf(bodyWith(rowsOf(100, 0), 111, 11)))).toMatchObject({
          errors: 11,
          skipped: 0,
        });
      });

      it("are measured against the rows that are in the body and those that the reader could not read", () => {
        // 989 are in the body and 11 could not be read: 1,000 rows, ten allowed.
        expect(connector.parse(snapshotOf(bodyWith(rowsOf(989, 0), 1000, 11)))).toMatchObject({
          errors: 11,
        });
        expect(connector.parse(snapshotOf(bodyWith(rowsOf(990, 0), 1000, 10)))).toMatchObject({
          errors: 0,
          skipped: 10,
        });
      });

      it("are not measured against the raw rows of the reader, which counts in entities when it groups (review finding 5)", () => {
        // 10,000 raw rows in 100 entities, 99 of which cannot be read: all but one is lost.
        const grouped = connector.parse(snapshotOf(bodyWith(rowsOf(1, 99), 10_000, 0)));
        expect(grouped.errors).toBe(99);
        expect(grouped.records).toHaveLength(1);
        // One entity of 100 that cannot be read is within the allowance.
        expect(connector.parse(snapshotOf(bodyWith(rowsOf(99, 1), 10_000, 0)))).toMatchObject({
          errors: 0,
          skipped: 1,
        });
        // 100 entities kept and 50 that the reader saw and could not read: 150 entities, fifteen at most.
        expect(connector.parse(snapshotOf(bodyWith(rowsOf(100, 0), 5000, 50)))).toMatchObject({
          errors: 50,
          skipped: 0,
        });
      });

      describe("with the basis of the allowance that a reader gives (raw rows)", () => {
        const snapshotWith = (
          rows: readonly Row[],
          total: number,
          unreadable: number,
          allowanceBasis?: number,
        ): Snapshot =>
          snapshotOf(JSON.stringify({ v: 1, rows, total, allowanceBasis, unreadable }));

        it("are measured against the raw rows: a hundredth of them, and at least ten", () => {
          // 100 entities from 150,000 raw rows, of which 1,500 could not be read: a hundredth of them.
          expect(
            connector.parse(snapshotWith(rowsOf(100, 0), 150_000, 1_500, 150_000)),
          ).toMatchObject({ errors: 0, skipped: 1_500 });
          expect(
            connector.parse(snapshotWith(rowsOf(100, 0), 150_000, 1_501, 150_000)),
          ).toMatchObject({ errors: 1_501, skipped: 0 });
          // A body with no basis is measured over the rows and the unreadable rows alone, as it was: 1,600 rows allow 16.
          expect(connector.parse(snapshotWith(rowsOf(100, 0), 150_000, 1_500))).toMatchObject({
            errors: 1_500,
            skipped: 0,
          });
          expect(connector.parse(snapshotWith(rowsOf(100, 0), 150_000, 10))).toMatchObject({
            errors: 0,
            skipped: 10,
          });
          expect(connector.parse(snapshotWith(rowsOf(100, 0), 150_000, 11))).toMatchObject({
            errors: 11,
            skipped: 0,
          });
          // With the basis, eleven of the same body are well within a hundredth of 150,000.
          expect(connector.parse(snapshotWith(rowsOf(100, 0), 150_000, 11, 150_000))).toMatchObject(
            { errors: 0, skipped: 11 },
          );
        });

        it("are ten at least, whatever a small basis says, and a tenth of the basis at most", () => {
          expect(connector.parse(snapshotWith(rowsOf(2, 0), 500, 10, 500))).toMatchObject({
            errors: 0,
            skipped: 10,
          });
          expect(connector.parse(snapshotWith(rowsOf(2, 0), 500, 11, 500))).toMatchObject({
            errors: 11,
            skipped: 0,
          });
          // 50 raw rows allow 5, never more than a tenth: a short list cannot leave out most of itself.
          expect(connector.parse(snapshotWith(rowsOf(2, 0), 50, 5, 50))).toMatchObject({
            errors: 0,
            skipped: 5,
          });
          expect(connector.parse(snapshotWith(rowsOf(2, 0), 50, 6, 50))).toMatchObject({
            errors: 6,
            skipped: 0,
          });
        });

        it("are not the allowance of the entities that the record builder refuses: those are measured over the entities", () => {
          // 12 of 100 entities refused: more than the ten that 100 allow, whatever the raw rows that the reader saw would allow.
          for (const basis of [undefined, 150_000]) {
            expect(connector.parse(snapshotWith(rowsOf(88, 12), 150_000, 0, basis))).toMatchObject({
              errors: 12,
              skipped: 0,
            });
          }
        });

        it("fail a list of which the record builder refuses every entity, however many raw rows the reader saw", () => {
          // 583 entities from 154,460 raw rows, all refused: the entities allow ten, and the raw rows would allow 1,544.
          const result = connector.parse(snapshotWith(rowsOf(0, 583), 154_460, 0, 154_460));
          expect(result).toMatchObject({ errors: 583, skipped: 0, records: [] });
        });

        it.each([
          // Ten at least (the 583 of the NHTSA investigations file today), a hundredth of the entities, and a tenth at most.
          { entities: 583, allowed: 10 },
          { entities: 100, allowed: 10 },
          { entities: 2_000, allowed: 20 },
          { entities: 50, allowed: 5 },
        ])(
          "$entities entities allow $allowed to be refused by the record builder, and not one more",
          ({ entities, allowed }) => {
            const within = connector.parse(
              snapshotWith(rowsOf(entities - allowed, allowed), 150_000, 0, 150_000),
            );
            expect(within).toMatchObject({ errors: 0, skipped: allowed });
            expect(within.records).toHaveLength(entities - allowed);
            const over = connector.parse(
              snapshotWith(rowsOf(entities - allowed - 1, allowed + 1), 150_000, 0, 150_000),
            );
            expect(over).toMatchObject({ errors: allowed + 1, skipped: 0 });
            expect(over.records).toHaveLength(entities - allowed - 1);
          },
        );

        it("measure each kind within its own allowance, and count both: the lines of the reader over the raw rows, the refused entities over the entities", () => {
          // 2,000 entities and 1,500 lines that the reader could not read: the lines allow 1,500 of 150,000, and the
          // refused entities allow 35, which is a hundredth of the 3,500 that the entities and those lines make.
          const within = connector.parse(snapshotWith(rowsOf(1_965, 35), 150_000, 1_500, 150_000));
          expect(within).toMatchObject({ errors: 0, skipped: 1_535 });
          expect(within.records).toHaveLength(1_965);
          // One more entity refused, or one more line that the reader could not read: the parse fails, and both are counted.
          const entity = connector.parse(snapshotWith(rowsOf(1_964, 36), 150_000, 1_500, 150_000));
          expect(entity).toMatchObject({ errors: 1_536, skipped: 0 });
          expect(entity.records).toHaveLength(1_964);
          const line = connector.parse(snapshotWith(rowsOf(1_965, 35), 150_000, 1_501, 150_000));
          expect(line).toMatchObject({ errors: 1_536, skipped: 0 });
          expect(line.records).toHaveLength(1_965);
        });

        it("measure the refused entities over the entities and the lines that the reader could not read, as it was before the basis", () => {
          // 2,000 entities and 400 lines that the reader could not read: the 2,400 allow 24, where the 2,000 alone would allow 20.
          expect(
            connector.parse(snapshotWith(rowsOf(1_976, 24), 150_000, 400, 150_000)),
          ).toMatchObject({ errors: 0, skipped: 424 });
          expect(
            connector.parse(snapshotWith(rowsOf(1_975, 25), 150_000, 400, 150_000)),
          ).toMatchObject({ errors: 425, skipped: 0 });
        });

        it("count a record that is lost to an id among the entities that the record builder refuses", () => {
          const withTwins = (twins: number): Row[] => [
            ...Array.from({ length: 100 - twins }, (_, at) => ({
              id: `G-${String(at).padStart(3, "0")}`,
              name: `Good ${at}`,
              day: null,
            })),
            ...Array.from({ length: twins }, (_, at) => ({
              id: "G-000",
              name: `Twin ${at}`,
              day: null,
            })),
          ];
          expect(connector.parse(snapshotWith(withTwins(10), 150_000, 0, 150_000))).toMatchObject({
            errors: 0,
            skipped: 10,
          });
          const over = connector.parse(snapshotWith(withTwins(11), 150_000, 0, 150_000));
          expect(over).toMatchObject({ errors: 11, skipped: 0 });
          expect(over.records).toHaveLength(89);
        });

        it("measure the sum of the two kinds against one allowance when the reader gives no basis, and each against its own when it gives one", () => {
          // 100 entities, 5 lines that the reader could not read and 6 entities that the record builder refuses: 11 lost, and 105 allow ten.
          expect(connector.parse(snapshotWith(rowsOf(94, 6), 105, 5))).toMatchObject({
            errors: 11,
            skipped: 0,
          });
          // With a basis, the 5 lines are far within what the raw rows allow, and the 6 entities within the ten that 105 allow.
          expect(connector.parse(snapshotWith(rowsOf(94, 6), 150_000, 5, 150_000))).toMatchObject({
            errors: 0,
            skipped: 11,
          });
          // A basis of 0 is a basis (a count that adds nothing): the two kinds are measured apart as well, each over the 105.
          expect(connector.parse(snapshotWith(rowsOf(94, 6), 105, 5, 0))).toMatchObject({
            errors: 0,
            skipped: 11,
          });
        });

        it("measure the lines of the reader over the larger of the basis and the rows that the body holds, never over a smaller basis", () => {
          // 100 entities and 10 lines that the reader could not read: the 110 allow ten, where a basis of 20 would allow two.
          expect(connector.parse(snapshotWith(rowsOf(100, 0), 110, 10, 20))).toMatchObject({
            errors: 0,
            skipped: 10,
          });
          expect(connector.parse(snapshotWith(rowsOf(100, 0), 111, 11, 20))).toMatchObject({
            errors: 11,
            skipped: 0,
          });
        });

        it("has no effect when it is below the rows and the unreadable rows that the body holds", () => {
          // 150 rows in the body, ten allowed: a basis that is smaller, or the same, changes nothing.
          for (const basis of [0, 20, 149, 150]) {
            expect(connector.parse(snapshotWith(rowsOf(140, 10), 150, 0, basis))).toMatchObject({
              errors: 0,
              skipped: 10,
            });
            expect(connector.parse(snapshotWith(rowsOf(139, 11), 150, 0, basis))).toMatchObject({
              errors: 11,
              skipped: 0,
            });
          }
        });
      });

      it("allow a tenth of a short list at most: 12 rows allow 2, 100 allow 10, 5,000 allow 50", () => {
        const lost = (kept: number, refused: number) =>
          connector.parse(snapshotOf(bodyWith(rowsOf(kept, refused), kept + refused, 0)));
        expect(lost(10, 2)).toMatchObject({ errors: 0, skipped: 2 });
        expect(lost(9, 3)).toMatchObject({ errors: 3, skipped: 0 });
        expect(lost(90, 10)).toMatchObject({ errors: 0, skipped: 10 });
        expect(lost(4950, 50)).toMatchObject({ errors: 0, skipped: 50 });
        expect(lost(4949, 51)).toMatchObject({ errors: 51, skipped: 0 });
      });

      it("fail a short list of which no row can be read: three rows allow one", () => {
        const result = connector.parse(snapshotOf(bodyWith(rowsOf(0, 3), 3, 0)));
        expect(result).toMatchObject({ errors: 3, skipped: 0, records: [] });
      });

      it("fail the list when there are more, and give the records that could be read", () => {
        const result = connector.parse(snapshotOf(bodyWith(rowsOf(10, 40), 50, 0)));
        expect(result.errors).toBe(40);
        expect(result.records).toHaveLength(10);
        expect(result.root).toBe("entries.csv");
      });

      it("are only the rows that the record builder refuses: any other failure goes through", () => {
        const spec = specWith({
          toRecords: () => {
            throw new TypeError("a bug of the spec");
          },
        });
        expect(() => createFileConnector(spec).parse(snapshotOf(bodyWith(SORTED_ROWS)))).toThrow(
          TypeError,
        );
        // A row that the builder refuses is left out and counted: of three rows, one is allowed.
        const refusing = specWith({
          toRecords: (rows) => {
            if (rows[0].id === "E-2") throw new UnreadableEntry();
            return toRecords(rows);
          },
        });
        const result = createFileConnector(refusing).parse(snapshotOf(bodyWith(SORTED_ROWS)));
        expect(result).toMatchObject({ errors: 0, skipped: 1 });
        expect(result.records.map((record) => record.sourceRecordId)).toEqual(["E-1", "E-3"]);
        // Every row refused is more than a short list may leave out (three rows allow one).
        const refusingAll = specWith({
          toRecords: () => {
            throw new UnreadableEntry();
          },
        });
        expect(
          createFileConnector(refusingAll).parse(snapshotOf(bodyWith(SORTED_ROWS))),
        ).toMatchObject({ errors: 3, skipped: 0, records: [] });
      });
    });

    describe("a body that is not the one the download makes", () => {
      const NOT_THE_LIST = { records: [], errors: 1, sourceVersion: null, root: null };

      it.each([
        ["no text", ""],
        ["text that is not JSON", "not json"],
        ["a JSON text that is cut", '{"v":1,"rows":['],
        ["null", "null"],
        ["a number", "5"],
        ["an array", "[]"],
        ["an empty object", "{}"],
        ["another version", '{"v":2,"rows":[],"total":0,"unreadable":0}'],
        ["no version", '{"rows":[],"total":0,"unreadable":0}'],
        ["rows that are no array", '{"v":1,"rows":"x","total":0,"unreadable":0}'],
        ["rows that are an object", '{"v":1,"rows":{},"total":0,"unreadable":0}'],
        ["no rows", '{"v":1,"total":0,"unreadable":0}'],
        ["no total", '{"v":1,"rows":[],"unreadable":0}'],
        ["no count of unreadable rows", '{"v":1,"rows":[],"total":0}'],
        ["a total that is no number", '{"v":1,"rows":[],"total":"3","unreadable":0}'],
        ["a negative total", '{"v":1,"rows":[],"total":-1,"unreadable":0}'],
        ["a fractional total", '{"v":1,"rows":[],"total":1.5,"unreadable":0}'],
        ["a negative count of unreadable rows", '{"v":1,"rows":[],"total":0,"unreadable":-2}'],
        ["a fractional count of unreadable rows", '{"v":1,"rows":[],"total":0,"unreadable":0.5}'],
        [
          "a count of unreadable rows that is null",
          '{"v":1,"rows":[],"total":0,"unreadable":null}',
        ],
        [
          "a count of unreadable rows that is NaN, as text",
          '{"v":1,"rows":[],"total":0,"unreadable":"NaN"}',
        ],
        // The basis of the allowance is a count of the raw rows, and none above the total that counts them.
        [
          "a basis that is a text",
          '{"v":1,"rows":[],"total":5,"allowanceBasis":"5","unreadable":0}',
        ],
        [
          "a basis that is negative",
          '{"v":1,"rows":[],"total":5,"allowanceBasis":-1,"unreadable":0}',
        ],
        [
          "a basis with a fraction",
          '{"v":1,"rows":[],"total":5,"allowanceBasis":2.5,"unreadable":0}',
        ],
        [
          "a basis that is null",
          '{"v":1,"rows":[],"total":5,"allowanceBasis":null,"unreadable":0}',
        ],
        [
          "a basis that is true",
          '{"v":1,"rows":[],"total":5,"allowanceBasis":true,"unreadable":0}',
        ],
        [
          "a basis that is a list",
          '{"v":1,"rows":[],"total":5,"allowanceBasis":[5],"unreadable":0}',
        ],
        [
          "a basis above the total",
          '{"v":1,"rows":[],"total":5,"allowanceBasis":6,"unreadable":0}',
        ],
        // The reader's total counts the rows it saw, those it could not read included (review finding 5).
        ["a total below the rows that the body holds", bodyWith(SORTED_ROWS, 2, 0)],
        ["a total of 0 for rows that the body holds", bodyWith(SORTED_ROWS, 0, 0)],
        ["a total below the unreadable rows alone", bodyWith([], 4, 5)],
        ["a total below the rows and the unreadable rows together", bodyWith(SORTED_ROWS, 3, 1)],
      ])("is not the list: %s", (_name, body) => {
        expect(connector.parse(snapshotOf(body))).toEqual(NOT_THE_LIST);
      });

      it.each([
        ["a total that is the rows alone", bodyWith(SORTED_ROWS, 3, 0)],
        ["a total that is the rows and the unreadable ones", bodyWith(SORTED_ROWS, 5, 2)],
        [
          "a total above them, as a grouping reader's raw rows are",
          bodyWith(SORTED_ROWS, 10_000, 0),
        ],
        ["no rows and no total", bodyWith([], 0, 0)],
        ["a basis of 0", '{"v":1,"rows":[],"total":5,"allowanceBasis":0,"unreadable":0}'],
        [
          "a basis that is the total",
          '{"v":1,"rows":[],"total":5,"allowanceBasis":5,"unreadable":0}',
        ],
        [
          "a basis below the total",
          '{"v":1,"rows":[],"total":5,"allowanceBasis":3,"unreadable":2}',
        ],
      ])("is the list: %s", (_name, body) => {
        expect(connector.parse(snapshotOf(body)).root).toBe("entries.csv");
      });

      it("is not the list when the snapshot holds no body, or two", () => {
        const body = bodyWith(SORTED_ROWS);
        expect(connector.parse({ ...snapshotOf(body), bodies: [] })).toEqual(NOT_THE_LIST);
        expect(connector.parse({ ...snapshotOf(body), bodies: [body, body] })).toEqual(
          NOT_THE_LIST,
        );
      });
    });
  });

  describe("what it never does", () => {
    const FAILING: Array<[string, () => Promise<unknown> | unknown]> = [
      [
        "a pin that fails",
        () =>
          createFileConnector(SPEC).download(
            fakeFetch(filesOf(CSV, { url: "https://evil.example.net/lists/entries.csv" })),
            {},
          ),
      ],
      [
        "a pin that fails on a 304",
        () =>
          createFileConnector(SPEC).download(
            fakeFetch(
              filesOf(CSV, { etag: '"e"', url: "https://evil.example.net/lists/entries.csv" }),
            ),
            { etag: 'k3:"e"' },
          ),
      ],
      [
        "a file that is cut",
        () => createFileConnector(SPEC).download(fakeFetch(filesOf(CSV, { truncated: true })), {}),
      ],
      [
        "a file that is not the list",
        () => createFileConnector(SPEC).download(fakeFetch(filesOf("x")), {}),
      ],
      ["an address that is unknown", () => createFileConnector(SPEC).download(fakeFetch({}), {})],
      [
        "an answer of unchanged to several files",
        () =>
          createFileConnector(
            specWith({
              files: [
                { url: URL_ONE, maxBytes: 9, contentTypes: ["text/csv"] },
                { url: URL_TWO, maxBytes: 9, contentTypes: ["text/csv"] },
              ],
            }),
          ).download(async (url) => ({ notModified: true, url }), {}),
      ],
      ["a spec with no pin", () => createFileConnector(specWith({ pin: undefined }))],
      [
        "a pin with a path prefix that has no closing slash",
        () =>
          createFileConnector(
            specWith({ pin: { hosts: ["data.example.org"], pathPrefixes: ["/lists"] } }),
          ),
      ],
      [
        "a reader that stopped before the end of the list",
        () =>
          createFileConnector(
            specWith({ read: (fetched) => ({ ...read(fetched)!, complete: false }) }),
          ).download(fakeFetch(filesOf()), {}),
      ],
      [
        "a reader that fails with an address in its message",
        () =>
          createFileConnector(
            specWith({
              read: () => {
                throw new Error(
                  `failed at ${URL_ONE}?token=abc on https://data.example.org/lists/`,
                );
              },
            }),
          ).download(fakeFetch(filesOf()), {}),
      ],
      [
        "a sort key that fails with an address in its message",
        () =>
          createFileConnector(
            specWith({
              sortKey: () => {
                throw new Error(
                  `failed at ${URL_ONE}?token=abc on https://data.example.org/lists/`,
                );
              },
            }),
          ).download(fakeFetch(filesOf()), {}),
      ],
      [
        "a row that JSON cannot write, whose property is named like an address",
        () => {
          const row: Record<string, unknown> = { id: "E-1", name: "Alpha" };
          row[URL_ONE] = row;
          return createFileConnector(
            specWith({
              read: () => ({
                rows: [row as unknown as Row],
                total: 1,
                unreadable: 0,
                complete: true,
              }),
            }),
          ).download(fakeFetch(filesOf()), {});
        },
      ],
      [
        "a fetch of the spec's own that fails with an address in its message",
        () =>
          createFileConnector(
            specWith({
              files: undefined,
              pin: undefined,
              fetchFiles: async () => {
                throw new TypeError(`cannot read ${URL_ONE}?token=abc`);
              },
            }),
          ).download(fakeFetch({}), {}),
      ],
      [
        "a fetch of the sync that fails with an address in its message",
        () =>
          createFileConnector(SPEC).download(async () => {
            throw new TypeError(`cannot read ${URL_ONE}?token=abc`);
          }, {}),
      ],
    ];

    it.each(FAILING)(
      "put an address or a message of its own in the error of %s",
      async (_name, run) => {
        let failure: unknown;
        try {
          await run();
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeInstanceOf(Error);
        const { message, name } = failure as Error;
        for (const text of [message, name, String(failure)]) {
          for (const part of [
            "https:",
            "http:",
            "example.org",
            "evil.example",
            "entries.csv",
            "lists/",
            URL_ONE,
          ]) {
            expect(text).not.toContain(part);
          }
        }
      },
    );

    it("logs: nothing of a download or a parse is written to the logger or the console", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
      );
      try {
        const connector = createFileConnector(SPEC);
        const snapshot = (await connector.download(fakeFetch(filesOf()), {})) as Snapshot;
        connector.parse(snapshot);
        connector.parse(snapshotOf(bodyWith([{ id: "x", name: "", day: null }], 1000, 500)));
        connector.parse(snapshotOf("garbage"));
        for (const [, run] of FAILING) await (async () => run())().catch(() => undefined);
        for (const spy of spies) expect(spy).not.toHaveBeenCalled();
        for (const method of ["info", "warn", "error", "debug"] as const) {
          expect(logger[method]).not.toHaveBeenCalled();
        }
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });
  });

  describe("the records it gives, for the contract that every connector's test calls", () => {
    it("are well formed", async () => {
      const connector = createFileConnector(SPEC);
      const snapshot = (await connector.download(fakeFetch(filesOf()), {})) as Snapshot;
      const { records } = connector.parse(snapshot);
      expect(records).toHaveLength(3);
      expectWellFormedRecords(records, { sourceId: "kev", mark: MARK });
    });
  });
});
