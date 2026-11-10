/**
 * The Dutch Algorithm Register (connectors/nlAlgoritmeregister.ts): the register of the algorithms
 * that Dutch public bodies publish, read as the CSV of its bulk download (31 columns, 1,638 rows
 * today) and grouped into one record per provider that the free-text column `provider` names (rule
 * N). One plain GET (the server sends no validator, so the body decides whether the list changed),
 * the host and the path pinned. No network: a fake fetch and synthetic files; every public body,
 * supplier and cell below is invented.
 */
import logger from "../../../../../utils/logger/fileLogger";
import { FetchError } from "../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../types";
import { LINE_INPUT_MAX, lineOf, unreadableAllowed } from "../kit/clean";
import {
  NL_ALGORITMEREGISTER_RECORD_MARK,
  nlAlgoritmeregisterConnector,
} from "../nlAlgoritmeregister";
import { BodyTooLargeError, type ConnectorFetch, NotTheListError, type Snapshot } from "../types";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "./helpers/kitContract";

jest.mock("../../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.setTimeout(30_000);

const MARK = NL_ALGORITMEREGISTER_RECORD_MARK;

/** Characters that a file can hide in a cell, built at run time (an escape would not survive the editor). */
const cp = (...codes: number[]): string => String.fromCodePoint(...codes);
const ZERO_WIDTH_SPACE = cp(0x200b);
const NO_BREAK_SPACE = cp(0xa0);
const RIGHT_TO_LEFT_OVERRIDE = cp(0x202e);
const BYTE_ORDER_MARK = cp(0xfeff);
const TAB = "\t";

const FILE_URL = "https://algoritmes.overheid.nl/api/downloads/NLD?filetype=csv";
const RECORD_URL_PREFIX = "https://algoritmes.overheid.nl/nl/algoritme?searchtext=";
const CANARY = "ZZ-";
const CONTACT_CANARY = `${CANARY}person@example.test`;

const IN_USE = "In gebruik";
const IN_DEVELOPMENT = "In ontwikkeling";
const OUT_OF_USE = "Buiten gebruik";
const OTHER = "Overige algoritmes";
const IMPACT = "Impactvolle algoritmes";
const HIGH_RISK = "Hoog-risico AI-systeem";
/** The one format of the file's publication stamps: a day, a time with microseconds and a zone. */
const PUBLISHED = "2026-01-15 10:00:00.000000+00:00";

// --- the file: the real 31-column header, the seven used columns filled, every other one a canary ---

const COLUMNS = [
  "name",
  "organization",
  "description_short",
  "category",
  "website",
  "status",
  "goal",
  "proportionality",
  "lawful_basis",
  "standard_version",
  "url",
  "contact_email",
  "publiccode",
  "source_data",
  "methods_and_models",
  "human_intervention",
  "risks",
  "provider",
  "process_index_url",
  "tags",
  "source_id",
  "begin_date",
  "end_date",
  "impacttoetsen",
  "publication_category",
  "lawful_basis_grouping",
  "impacttoetsen_grouping",
  "source_data_grouping",
  "algorithm_id",
  "org_id",
  "publication_dt",
];

/** The columns that the connector reads; a file that lacks one is not the list. */
const USED_COLUMNS = [
  "provider",
  "organization",
  "org_id",
  "status",
  "publication_category",
  "publication_dt",
  "algorithm_id",
];

const columnOf = (name: string): number => COLUMNS.indexOf(name);

interface Description {
  organization?: string;
  orgId?: string;
  provider?: string;
  status?: string;
  category?: string;
  id?: string;
  published?: string;
}

/** A description with a canary in every column that is not read, and a contact address in its own. */
function descriptionRow(description: Description = {}, index = 0): string[] {
  const cells = COLUMNS.map((name) => `${CANARY}${name}`);
  cells[columnOf("contact_email")] = CONTACT_CANARY;
  cells[columnOf("organization")] = description.organization ?? "Gemeente Voorbeeldstad";
  cells[columnOf("org_id")] = description.orgId ?? "gm0001";
  cells[columnOf("provider")] = description.provider ?? "";
  cells[columnOf("status")] = description.status ?? IN_USE;
  cells[columnOf("publication_category")] = description.category ?? OTHER;
  cells[columnOf("algorithm_id")] = description.id ?? String(20_000_000 + index);
  cells[columnOf("publication_dt")] = description.published ?? PUBLISHED;
  return cells;
}

/** A description that names no provider (as 22 % of the file's do), short, so that thousands are cheap. */
function leanRow(index = 0, provider = ""): string[] {
  const cells = COLUMNS.map(() => "");
  cells[columnOf("organization")] = "Gemeente Opvulling";
  cells[columnOf("org_id")] = "gm9999";
  cells[columnOf("provider")] = provider;
  cells[columnOf("status")] = IN_USE;
  cells[columnOf("publication_category")] = OTHER;
  cells[columnOf("algorithm_id")] = String(50_000_000 + index);
  cells[columnOf("publication_dt")] = PUBLISHED;
  return cells;
}

const quote = (cell: string): string =>
  /["\r\n,]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;

interface CsvOptions {
  header?: readonly string[];
  eol?: string;
  bom?: boolean;
  finalEol?: boolean;
}

function csvOf(
  rows: ReadonlyArray<readonly string[]>,
  { header = COLUMNS, eol = "\n", bom = true, finalEol = true }: CsvOptions = {},
): string {
  const lines = [header, ...rows].map((row) => row.map(quote).join(","));
  return `${bom ? BYTE_ORDER_MARK : ""}${lines.join(eol)}${finalEol ? eol : ""}`;
}

/** The floor of the reader is 1,000 rows: a file made of a few descriptions is padded with lean ones. */
const PADDED = 1000;

function registerCsv(
  descriptions: readonly Description[],
  options: CsvOptions & { pad?: number } = {},
): string {
  const { pad = PADDED, ...csv } = options;
  const rows = descriptions.map(descriptionRow);
  const lean = Array.from({ length: Math.max(0, pad - rows.length) }, (_, index) => leanRow(index));
  return csvOf([...rows, ...lean], csv);
}

// --- running the connector ---

function filesOf(csv: string | Buffer, file: Partial<FakeFile> = {}): Record<string, FakeFile> {
  return { [FILE_URL]: { body: csv, contentType: "text/csv; charset=utf-8", ...file } };
}

const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

const downloadOf = (csv: string | Buffer, file: Partial<FakeFile> = {}) =>
  nlAlgoritmeregisterConnector.download(fakeFetch(filesOf(csv, file)), {});

async function download(csv: string | Buffer, file: Partial<FakeFile> = {}): Promise<Snapshot> {
  const answer = await downloadOf(csv, file);
  if (answer === "unchanged") throw new Error("The fake fetch answered unchanged.");
  return answer;
}

const parsedOf = async (csv: string | Buffer) =>
  nlAlgoritmeregisterConnector.parse(await download(csv));
const recordsOf = async (csv: string | Buffer) => (await parsedOf(csv)).records;

interface BodyOfRows {
  rows: Array<Record<string, unknown>>;
  total: number;
  unreadable: number;
}
const bodyOf = async (csv: string | Buffer): Promise<BodyOfRows> =>
  JSON.parse((await download(csv)).bodies[0]) as BodyOfRows;

const byId = (records: readonly ParsedRecord[]): Map<string, ParsedRecord> =>
  new Map(records.map((record) => [record.sourceRecordId, record]));

const providerOf = (record: ParsedRecord): string => String(record.identifiers.provider);

/** The providers that a `provider` cell names: id and display, in the order of the ids. */
async function providersOf(cell: string): Promise<Array<[string, string]>> {
  const records = await recordsOf(registerCsv([{ provider: cell }]));
  return records.map((record): [string, string] => [record.sourceRecordId, providerOf(record)]);
}

/** A name of eight letters that is nobody's placeholder: `n` makes it distinct (up to 456,976). */
function providerName(n: number): string {
  const letters = Array.from({ length: 4 }, (_, at) =>
    String.fromCharCode(97 + (Math.floor(n / 26 ** at) % 26)),
  );
  return `Zeta${letters.reverse().join("")}`;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// --- the sample record: one provider, three descriptions of two public bodies ---

const SAMPLE: Description[] = [
  {
    organization: "Gemeente Voorbeeldstad",
    orgId: "gm0001",
    provider: "Acme B.V.",
    status: IN_USE,
    category: IMPACT,
    published: "2026-03-02 09:15:00.000000+00:00",
  },
  {
    organization: "Gemeente Voorbeeldstad",
    orgId: "gm0001",
    provider: "Acme BV",
    status: IN_DEVELOPMENT,
    category: OTHER,
    published: "2026-05-20 11:00:00.000000+00:00",
  },
  {
    organization: "Provincie Voorbeeldland",
    orgId: "pv0001",
    provider: "Acme B.V.",
    status: OUT_OF_USE,
    category: HIGH_RISK,
    published: "2026-04-01 08:30:00.000000+00:00",
  },
];

const FIRST_SENTENCE =
  "Dutch Algorithm Register (algoritmes.overheid.nl), a register or status list.";
const NOT_A_FINDING =
  "A record is Dutch public bodies' own descriptions of algorithms they use that name this " +
  "provider; it says nothing about the provider's conduct or the algorithms' quality, and the " +
  "Dutch government does not endorse it.";
const SOURCE_SENTENCE =
  "Source: Algoritmeregister van de Nederlandse overheid; adapted by VerifyWise.";

const SAMPLE_SUMMARY = [
  FIRST_SENTENCE,
  NOT_A_FINDING,
  "Provider as written: Acme B.V.",
  "3 algorithm descriptions from 2 public bodies name it (1 in use, 1 in development, " +
    "1 out of use); 1 labelled high-risk AI system by the publishing body itself.",
  "Published by Gemeente Voorbeeldstad, Provincie Voorbeeldland; newest published 2026-05-20.",
  SOURCE_SENTENCE,
].join(" ");

describe("nlAlgoritmeregisterConnector", () => {
  describe("what it is", () => {
    it("is the connector of nl_algoritmeregister, a snapshot connector at version 1", () => {
      expect(nlAlgoritmeregisterConnector.id).toBe("nl_algoritmeregister");
      expect(nlAlgoritmeregisterConnector.version).toBe(1);
      expect(nlAlgoritmeregisterConnector.kind).toBeUndefined();
      expect(typeof nlAlgoritmeregisterConnector.download).toBe("function");
      expect(typeof nlAlgoritmeregisterConnector.parse).toBe("function");
    });

    it("exports the mark that every record begins with", () => {
      expect(NL_ALGORITMEREGISTER_RECORD_MARK).toBe("Dutch Algorithm Register");
    });
  });

  describe("the happy path", () => {
    it("makes one record of a provider, from the descriptions that name it, with its text word for word", async () => {
      const parsed = await parsedOf(registerCsv(SAMPLE));

      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(parsed.root).not.toBeNull();
      expect(parsed.sourceVersion).toBe("2026-05-20");
      expect(parsed.records).toHaveLength(1);
      expect(parsed.records[0]).toEqual({
        sourceRecordId: "acme",
        recordType: "algorithm_register_supplier",
        title: "Dutch Algorithm Register: Acme B.V",
        summary: SAMPLE_SUMMARY,
        url: `${RECORD_URL_PREFIX}Acme%20B.V`,
        identifiers: {
          provider: "Acme B.V",
          algorithms: 3,
          bodies: 2,
          bodyNames: ["Gemeente Voorbeeldstad", "Provincie Voorbeeldland"],
        },
        matchKeys: ["name:acmebv", "name:acme"],
        publishedAt: "2026-05-20",
        sourceUpdatedAt: null,
      });
    });

    it("gives records that are well formed and begin with the mark", async () => {
      const records = await recordsOf(registerCsv(SAMPLE));
      expectWellFormedRecords(records, { sourceId: "nl_algoritmeregister", mark: MARK });
      for (const record of records) expect(record.summary.startsWith(MARK)).toBe(true);
    });

    it("gives no record, and no version, for a register in which no description names a provider", async () => {
      const parsed = await parsedOf(registerCsv([]));
      expect(parsed.records).toEqual([]);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(parsed.root).not.toBeNull();
      expect(parsed.sourceVersion).toBeNull();
    });

    it("gives the same bodies and the same records whatever the order of the rows in the file", async () => {
      const descriptions: Description[] = [
        ...SAMPLE,
        // Equal counts everywhere, so that only the rule of the order can decide.
        ...["Acme", "ACME", "acme", "Acme Inc", "ACME Inc", "Acme Ltd", "Acme Corp"].map(
          (provider, index) => ({
            provider,
            organization: `Gemeente ${String.fromCharCode(65 + index)}`,
            orgId: `gm${index}`,
            status: [IN_USE, IN_DEVELOPMENT, OUT_OF_USE][index % 3],
            category: [OTHER, IMPACT, HIGH_RISK][index % 3],
          }),
        ),
        { provider: "Zeta Works / Beta Works en Delta Works; Gamma Works" },
        // Two rows with one id are unreadable, both, whichever comes first.
        { provider: "Twin Works", id: "11111111" },
        { provider: "Twin Alike", id: "11111111" },
        // A row that is excluded, and one that is unreadable.
        { provider: "© Excluded Works" },
        { provider: "Unreadable Works", status: "unknown" },
      ];
      const rows = [
        ...descriptions.map(descriptionRow),
        ...Array.from({ length: PADDED }, (_, index) => leanRow(index)),
      ];
      await expectDeterministic(nlAlgoritmeregisterConnector, (reversed) =>
        fakeFetch(filesOf(csvOf(reversed ? [...rows].reverse() : rows))),
      );
    });
  });

  describe("download: one plain GET, as the server sends no validator", () => {
    const CSV = registerCsv(SAMPLE);

    it("asks the file once, with no validators the first time and the limits of the list", async () => {
      const fetch = fakeFetch(filesOf(CSV));
      await nlAlgoritmeregisterConnector.download(fetch, {});
      expect(fetch.calls).toEqual([
        {
          url: FILE_URL,
          validators: {},
          limits: {
            maxBytes: 33_554_432,
            allowedContentTypes: ["text/csv"],
            totalTimeoutMs: 180_000,
          },
        },
      ]);
    });

    it("gives one snapshot: the body of the providers, the prefix of the version alone as etag, the size", async () => {
      const snapshot = await download(CSV);
      expect(snapshot.bodies).toHaveLength(1);
      expect(snapshot.etag).toBe("k1:");
      expect(snapshot.lastModified).toBeNull();
      expect(snapshot.bytes).toBe(Buffer.byteLength(CSV));
    });

    it("sends no validator on the next run either, and gives the same body again: the body decides", async () => {
      const first = await download(CSV);
      const fetch = fakeFetch(filesOf(CSV));

      const second = await nlAlgoritmeregisterConnector.download(fetch, {
        etag: first.etag,
        lastModified: first.lastModified,
      });

      expect(second).not.toBe("unchanged");
      expect((second as Snapshot).bodies).toEqual(first.bodies);
      expect(fetch.calls).toHaveLength(1);
      // Nothing that a server could answer with a 304: a plain GET.
      expect(fetch.calls[0].validators).toEqual({ etag: null, lastModified: null });
    });

    it("keeps the kit's flow for a server that starts to send a validator: unchanged, with the validator sent back without the prefix", async () => {
      const first = await download(CSV, { etag: 'W/"synthetic"' });
      expect(first.etag).toBe('k1:W/"synthetic"');

      const fetch = fakeFetch(filesOf(CSV, { etag: 'W/"synthetic"' }));
      const answer = await nlAlgoritmeregisterConnector.download(fetch, {
        etag: first.etag,
        lastModified: first.lastModified,
      });

      expect(answer).toBe("unchanged");
      expect(fetch.calls[0].validators).toEqual({ etag: 'W/"synthetic"', lastModified: null });
    });

    it("takes a 304 for unchanged only from the pinned path: a 304 from elsewhere fails as not allowed", async () => {
      const first = await download(CSV, { etag: 'W/"synthetic"' });
      const failure = await failureOf(
        nlAlgoritmeregisterConnector.download(
          fakeFetch(
            filesOf(CSV, {
              etag: 'W/"synthetic"',
              url: "https://algoritmes.overheid.nl/nl/algoritme",
            }),
          ),
          { etag: first.etag, lastModified: first.lastModified },
        ),
      );
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("not_allowed");
    });

    it.each([
      ["another host", "https://example.test/api/downloads/NLD?filetype=csv"],
      [
        "a host that only starts like the register's",
        "https://algoritmes.overheid.nl.evil.test/api/downloads/NLD",
      ],
      [
        "a host that is a subdomain of the register's",
        "https://evil.algoritmes.overheid.nl/api/downloads/NLD",
      ],
      ["another path of the register", "https://algoritmes.overheid.nl/nl/algoritme"],
      [
        "a path that only starts like the downloads'",
        "https://algoritmes.overheid.nl/api/downloads-copy/NLD",
      ],
      ["plain http", "http://algoritmes.overheid.nl/api/downloads/NLD?filetype=csv"],
      ["a climb out of the downloads", "https://algoritmes.overheid.nl/api/downloads/../other/NLD"],
    ])(
      "fails a file that %s answered, as not allowed, naming nothing of the address",
      async (_name, from) => {
        const failure = await failureOf(downloadOf(CSV, { url: from }));
        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("not_allowed");
        expect((failure as Error).message).not.toContain("evil");
        expect((failure as Error).message).not.toContain("overheid");
      },
    );

    it("fails a file cut at its limit as too large, and reads none of it", async () => {
      expect(await failureOf(downloadOf(CSV, { truncated: true }))).toBeInstanceOf(
        BodyTooLargeError,
      );
    });

    it("takes the file as text/csv only, with or without a charset: no other type is the list", async () => {
      expect(await failureOf(downloadOf(CSV, { contentType: "text/csv" }))).toBeUndefined();
      expect(
        await failureOf(downloadOf(CSV, { contentType: "TEXT/CSV; charset=UTF-8" })),
      ).toBeUndefined();
      for (const contentType of [
        "text/plain",
        "text/html",
        "application/json",
        "application/octet-stream",
      ]) {
        const failure = await failureOf(downloadOf(CSV, { contentType }));
        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("unsupported_type");
      }
    });

    it("lets a failure of the fetch through as it is", async () => {
      const failure = await failureOf(nlAlgoritmeregisterConnector.download(fakeFetch({}), {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");

      const refusing: ConnectorFetch = async () => {
        throw new FetchError("blocked_by_site", undefined, { status: 429, retryAfterMs: 60_000 });
      };
      expect(await failureOf(nlAlgoritmeregisterConnector.download(refusing, {}))).toMatchObject({
        reason: "blocked_by_site",
        status: 429,
        retryAfterMs: 60_000,
      });
    });
  });

  describe("the reader: the file as the register publishes it", () => {
    it("reads a file with a byte order mark, LF row ends, quoted cells with commas, quotes and line breaks", async () => {
      const first = descriptionRow({ provider: "Acme B.V., Beta Works" });
      first[columnOf("goal")] = 'A "quoted", multi-line\ntext\nwith commas, and more';
      first[columnOf("risks")] = "line one\r\nline two";
      const csv = csvOf([first, ...Array.from({ length: PADDED }, (_, i) => leanRow(i))]);
      expect(csv.startsWith(BYTE_ORDER_MARK)).toBe(true);
      expect(csv).toContain('"A ""quoted"", multi-line\ntext');
      expect(csv).toContain('"Acme B.V., Beta Works"');

      const records = byId(await recordsOf(csv));
      expect([...records.keys()]).toEqual(["acme", "betaworks"]);
      expectWellFormedRecords([...records.values()], {
        sourceId: "nl_algoritmeregister",
        mark: MARK,
      });
    });

    it("reads CRLF row ends, a file with no byte order mark and one with blank lines at its end", async () => {
      for (const options of [{ eol: "\r\n" }, { bom: false }, { eol: "\n\n" }]) {
        const records = await recordsOf(registerCsv(SAMPLE, options));
        expect(records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
      }
    });

    it("reads the tabs, the no-break spaces, the zero-width characters and the blanks that the cells of the file hold", async () => {
      const csv = registerCsv([
        {
          provider: `${TAB}Acme${NO_BREAK_SPACE}B.V.${ZERO_WIDTH_SPACE} `,
          organization: `Gemeente${NO_BREAK_SPACE}Voorbeeldstad${ZERO_WIDTH_SPACE}`,
          orgId: ` gm0001${ZERO_WIDTH_SPACE}`,
          status: `${NO_BREAK_SPACE}In${NO_BREAK_SPACE}gebruik${TAB}`,
          category: ` ${OTHER} `,
          id: ` 12345678${ZERO_WIDTH_SPACE} `,
          published: ` ${PUBLISHED} `,
        },
      ]);
      const parsed = await parsedOf(csv);
      expect(parsed.errors + (parsed.skipped ?? 0)).toBe(0);
      expect(parsed.records).toHaveLength(1);
      expect(providerOf(parsed.records[0])).toBe("Acme B.V");
      expect(parsed.records[0].identifiers.bodyNames).toEqual(["Gemeente Voorbeeldstad"]);
    });

    describe("the end of the file", () => {
      it("is not the list when the last byte is not a line feed: a stream cut in a row has none", async () => {
        expect(
          await failureOf(downloadOf(registerCsv(SAMPLE, { finalEol: false }))),
        ).toBeInstanceOf(NotTheListError);
        // Cut in the last cell of a row: the bytes before it are a perfect file.
        const csv = registerCsv(SAMPLE);
        const cut = csv.slice(0, csv.length - "00+00:00\n".length);
        expect(await failureOf(downloadOf(cut))).toBeInstanceOf(NotTheListError);
        // A file that ends with a carriage return alone is no file that ends with a line feed.
        expect(
          await failureOf(downloadOf(registerCsv(SAMPLE, { eol: "\r", finalEol: true }))),
        ).toBeInstanceOf(NotTheListError);
        expect(await failureOf(downloadOf(csv))).toBeUndefined();
      });

      it("is not the list when it is empty", async () => {
        expect(await failureOf(downloadOf(""))).toBeInstanceOf(NotTheListError);
        expect(await failureOf(downloadOf(BYTE_ORDER_MARK))).toBeInstanceOf(NotTheListError);
      });

      it("fails as too large a file that ends with a line feed inside a quoted cell: part of a list is no list", async () => {
        const last = descriptionRow({ provider: "Acme" });
        last[columnOf("goal")] = "Line\nbreak";
        const csv = csvOf([...Array.from({ length: PADDED }, (_, i) => leanRow(i)), last]);
        const at = csv.indexOf('"Line\nbreak"');
        expect(at).toBeGreaterThan(0);
        const cut = csv.slice(0, at + '"Line\n'.length);

        expect(cut.endsWith("\n")).toBe(true);
        expect(await failureOf(downloadOf(cut))).toBeInstanceOf(BodyTooLargeError);
        // The same file with the cell closed is read.
        expect(await failureOf(downloadOf(csv))).toBeUndefined();
      });

      it("never gives a shorter list for text that begins a quote and never closes it", async () => {
        expect(await failureOf(downloadOf(`${BYTE_ORDER_MARK}"unclosed\n`))).toBeInstanceOf(
          BodyTooLargeError,
        );
      });
    });

    it.each(USED_COLUMNS)("is not the list when the column %s is missing", async (name) => {
      const at = columnOf(name);
      const header = COLUMNS.filter((_, index) => index !== at);
      const rows = [
        ...SAMPLE.map(descriptionRow),
        ...Array.from({ length: PADDED }, (_, i) => leanRow(i)),
      ].map((row) => row.filter((_, index) => index !== at));
      const failure = await failureOf(downloadOf(csvOf(rows, { header })));
      expect(failure).toBeInstanceOf(NotTheListError);
    });

    it("finds the columns by name, wherever they are, and takes columns that were added", async () => {
      const header = ["new_first", ...[...COLUMNS].reverse(), "new_last"];
      const rows = [
        ...SAMPLE.map(descriptionRow),
        ...Array.from({ length: PADDED }, (_, i) => leanRow(i)),
      ].map((row) => ["x", ...[...row].reverse(), "y"]);
      const records = await recordsOf(csvOf(rows, { header }));
      expect(records).toHaveLength(1);
      expect(records[0].summary).toBe(SAMPLE_SUMMARY);
    });

    it("finds a column whose name has a blank around it, but not one that differs in case", async () => {
      const rows = [
        ...SAMPLE.map(descriptionRow),
        ...Array.from({ length: PADDED }, (_, i) => leanRow(i)),
      ];
      const spaced = COLUMNS.map((name) => (name === "provider" ? ` ${name} ` : name));
      expect(await recordsOf(csvOf(rows, { header: spaced }))).toHaveLength(1);

      const cased = COLUMNS.map((name) => (name === "provider" ? "Provider" : name));
      expect(await failureOf(downloadOf(csvOf(rows, { header: cased })))).toBeInstanceOf(
        NotTheListError,
      );
    });

    it("does not take the column 'category' for 'publication_category': the second is the one that is read", async () => {
      const header = COLUMNS.map((name) =>
        name === "publication_category" ? "pub_category" : name,
      );
      const rows = [
        ...SAMPLE.map(descriptionRow),
        ...Array.from({ length: PADDED }, (_, i) => leanRow(i)),
      ];
      expect(await failureOf(downloadOf(csvOf(rows, { header })))).toBeInstanceOf(NotTheListError);
    });

    it.each(["<html>maintenance</html>\n", "id,other\n1,2\n", "provider,org_id\nAcme,gm0001\n"])(
      "is not the list when the file is %j",
      async (body) => {
        expect(await failureOf(downloadOf(body))).toBeInstanceOf(NotTheListError);
      },
    );

    describe("the rows of the file", () => {
      it("reads 1,000 rows and refuses 999: a file with fewer is not this list", async () => {
        expect(await failureOf(downloadOf(registerCsv(SAMPLE, { pad: 1000 })))).toBeUndefined();
        expect(await failureOf(downloadOf(registerCsv(SAMPLE, { pad: 999 })))).toBeInstanceOf(
          NotTheListError,
        );
      });

      it("reads 20,000 rows, and a file of one row more fails as too large: it never gives a shorter list", async () => {
        const rows = (count: number) => Array.from({ length: count }, (_, i) => leanRow(i));
        const ok = await bodyOf(csvOf(rows(20_000)));
        expect(ok.total).toBe(20_000);
        expect(await failureOf(downloadOf(csvOf(rows(20_001))))).toBeInstanceOf(BodyTooLargeError);
      });

      it("fails as too large a file with a row of more cells than any list of this kind has", async () => {
        const wide = Array.from({ length: 5000 }, (_, index) => `c${index}`);
        const csv = csvOf([...Array.from({ length: PADDED }, (_, i) => leanRow(i)), wide]);
        expect(await failureOf(downloadOf(csv))).toBeInstanceOf(BodyTooLargeError);
      });

      it("reads a row of 100 cells and fails as too large for one of 101", async () => {
        const csvOfWidth = (width: number): string => {
          const header = [...USED_COLUMNS, ...Array.from({ length: width - 7 }, (_, i) => `c${i}`)];
          const row = Array.from({ length: width }, () => "x");
          return csvOf(
            Array.from({ length: PADDED }, () => row),
            { header },
          );
        };
        expect(await failureOf(downloadOf(csvOfWidth(100)))).toBeUndefined();
        expect(await failureOf(downloadOf(csvOfWidth(101)))).toBeInstanceOf(BodyTooLargeError);
      });

      it("counts a row narrower or wider than the header as unreadable, and reads the others", async () => {
        const rows = [
          ...SAMPLE.map(descriptionRow),
          descriptionRow({ provider: "Narrow Works" }, 90).slice(0, 30),
          [...descriptionRow({ provider: "Wide Works" }, 91), "one more cell"],
          ...Array.from({ length: PADDED }, (_, i) => leanRow(i)),
        ];
        const body = await bodyOf(csvOf(rows));
        expect(body.unreadable).toBe(2);
        const parsed = nlAlgoritmeregisterConnector.parse(await download(csvOf(rows)));
        expect(parsed.records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
        // Two unreadable rows against one provider: more than its allowance, so they are errors.
        expect(parsed.errors).toBe(2);
      });

      it("reads 5,000 providers, and a file of 5,001 fails the download as too large: it never gives a shorter list", async () => {
        const csvOfProviders = (count: number): string =>
          csvOf(
            Array.from({ length: Math.max(count, PADDED) }, (_, i) =>
              leanRow(i, i < count ? providerName(i) : ""),
            ),
          );
        const ok = await bodyOf(csvOfProviders(5000));
        expect(ok.rows).toHaveLength(5000);
        expect(await failureOf(downloadOf(csvOfProviders(5001)))).toBeInstanceOf(BodyTooLargeError);
      });

      it("takes the total of the body at the number of providers when a few rows name more of them than there are rows", async () => {
        // 1,000 rows of three providers each: 3,000 providers in 1,000 rows. The body must still pass
        // its own check (total >= rows + unreadable).
        const rows = Array.from({ length: 1000 }, (_, i) =>
          leanRow(
            i,
            `${providerName(3 * i)}, ${providerName(3 * i + 1)}, ${providerName(3 * i + 2)}`,
          ),
        );
        const snapshot = await download(csvOf(rows));
        const body = JSON.parse(snapshot.bodies[0]) as BodyOfRows;
        expect(body.rows).toHaveLength(3000);
        expect(body.total).toBeGreaterThanOrEqual(body.rows.length + body.unreadable);
        expect(nlAlgoritmeregisterConnector.parse(snapshot).records).toHaveLength(3000);
      });

      it("counts the rows that it saw in the total of the body", async () => {
        const body = await bodyOf(registerCsv(SAMPLE));
        expect(body.total).toBe(PADDED);
        expect(body.unreadable).toBe(0);
      });
    });
  });

  describe("a description that cannot be read", () => {
    /** A description that is fine but for one cell, and a provider that must not be counted from it. */
    const flawed = (over: Description): Description => ({ provider: "Gamma Works", ...over });
    const unreadableOf = async (descriptions: Description[]): Promise<BodyOfRows> =>
      bodyOf(registerCsv([...SAMPLE, ...descriptions]));

    it.each([
      ["an empty status", { status: "" }],
      ["a status in lower case", { status: "in gebruik" }],
      ["a status in other capitals", { status: "In Gebruik" }],
      ["a status with a full stop", { status: "In gebruik." }],
      ["a status that is two", { status: "In gebruik, In ontwikkeling" }],
      ["a status that no list has", { status: "Unknown" }],
      ["an empty category", { category: "" }],
      ["a category in lower case", { category: "overige algoritmes" }],
      ["a category that is cut", { category: "Hoog-risico" }],
      ["a category that no list has", { category: "Other" }],
      ["an id of seven digits", { id: "1234567" }],
      ["an id of nine digits", { id: "123456789" }],
      ["an id with a letter", { id: "1234567a" }],
      ["an id with blanks inside", { id: "12 345 678" }],
      ["an id with a sign", { id: "-1234567" }],
      ["an id in exponent form", { id: "1.234e7" }],
      ["an empty id", { id: "" }],
      ["an empty publication stamp", { published: "" }],
      ["a publication stamp that is no day", { published: "2026-13-01 10:00:00+00:00" }],
      [
        "a publication stamp of a day that does not exist",
        { published: "2026-02-30 10:00:00+00:00" },
      ],
      ["a publication stamp of another form", { published: "15-01-2026 10:00" }],
      ["a publication stamp with slashes", { published: "2026/01/15 10:00" }],
      ["a publication stamp that is a word", { published: "yesterday" }],
      ["an empty public body", { organization: "" }],
      ["a public body of blanks", { organization: " \t " }],
      ["an empty org_id", { orgId: "" }],
    ])(
      "counts a description with %s as one that cannot be read, and takes nothing from it",
      async (_name, over) => {
        const body = await unreadableOf([flawed(over)]);
        expect(body.unreadable).toBe(1);
        expect(body.rows.map((row) => row.id)).toEqual(["acme"]);
      },
    );

    it.each([
      ["a day alone", { published: "2026-01-15" }],
      ["a day and a time with a T and a Z", { published: "2026-01-15T10:00:00Z" }],
      [
        "a day and a time with microseconds and a zone",
        { published: "2026-01-15 10:00:00.123456+00:00" },
      ],
      ["an id of eight digits with zeros in front", { id: "00000001" }],
      ["an org_id that is a number", { orgId: "123456" }],
      ["an org_id of a letter prefix and four digits", { orgId: "gm0363" }],
    ])("reads a description with %s", async (_name, over) => {
      const body = await unreadableOf([flawed(over)]);
      expect(body.unreadable).toBe(0);
      expect(body.rows.map((row) => row.id)).toEqual(["acme", "gammaworks"]);
    });

    it("counts both rows of an id that two rows hold as unreadable, whichever comes first, and takes nothing from either", async () => {
      const twins: Description[] = [
        { provider: "Twin Works", id: "11111111" },
        { provider: "Twin Alike", id: "11111111" },
      ];
      const forward = registerCsv([...SAMPLE, ...twins]);
      const backward = registerCsv([...SAMPLE, ...[...twins].reverse()]);
      const a = await bodyOf(forward);
      const b = await bodyOf(backward);
      expect(a.unreadable).toBe(2);
      expect(a.rows.map((row) => row.id)).toEqual(["acme"]);
      expect(b).toEqual(a);
    });

    it("counts every row of an id that three rows hold, and one that is written with blanks as the same id", async () => {
      const body = await unreadableOf([
        { provider: "Twin Works", id: "11111111" },
        { provider: "Twin Alike", id: " 11111111 " },
        { provider: "Twin Lines", id: "11111111" },
        { provider: "Lone Works", id: "22222222" },
      ]);
      expect(body.unreadable).toBe(3);
      expect(body.rows.map((row) => row.id)).toEqual(["acme", "loneworks"]);
    });

    it("does not take the id of a row that is unreadable for another reason as one that another row may not have", async () => {
      // The row with the bad status has the id 33333333; the second row has it too: two rows hold it.
      const body = await unreadableOf([
        { provider: "Bad Works", id: "33333333", status: "unknown" },
        { provider: "Good Works", id: "33333333" },
      ]);
      expect(body.unreadable).toBe(2);
      expect(body.rows.map((row) => row.id)).toEqual(["acme"]);
    });

    describe("the allowance of rows that cannot be read", () => {
      const PROVIDERS = 120;
      const providers = (): Description[] =>
        Array.from({ length: PROVIDERS }, (_, index) => ({ provider: providerName(index) }));
      const csvWith = (count: number): string =>
        csvOf([
          ...providers().map(descriptionRow),
          ...Array.from({ length: count }, (_, index) =>
            descriptionRow({ status: "unknown", provider: "Ragged Works" }, 5000 + index),
          ),
          ...Array.from({ length: PADDED }, (_, index) => leanRow(index)),
        ]);

      it.each([1, 5, 10])("skips %s of them and applies the rest of the list", async (count) => {
        expect(count).toBeLessThanOrEqual(unreadableAllowed(PROVIDERS + count));
        const parsed = nlAlgoritmeregisterConnector.parse(await download(csvWith(count)));
        expect(parsed.errors).toBe(0);
        expect(parsed.skipped).toBe(count);
        expect(parsed.records).toHaveLength(PROVIDERS);
      });

      it("fails the list when there are more than the allowance, and still gives the records that could be read", async () => {
        const count = unreadableAllowed(PROVIDERS + 11) + 1;
        const parsed = nlAlgoritmeregisterConnector.parse(await download(csvWith(count)));
        expect(parsed.errors).toBe(count);
        expect(parsed.skipped).toBe(0);
        expect(parsed.records).toHaveLength(PROVIDERS);
      });
    });
  });

  // `lineOf` reads a cell to LINE_INPUT_MAX units and writes the cut marker on what it read
  // when the cell is longer. A provider cell whose first megabyte reads short was taken for a provider
  // named by the cut text ("Quarkle [shortened]": an id, an address, an identifier), and an org_id that
  // was cut keyed the set of bodies by the cut text, so two ids that share their first units were one
  // body. A text that does not fit is never cut here: the row cannot be read, and it is counted.
  describe("a cell that is read cut", () => {
    const NAME = "Quarkle";
    const ASTRAL = cp(0x20000);
    const OTHER_ASTRAL = cp(0x20001);
    const unreadableOf = async (descriptions: Description[]): Promise<BodyOfRows> =>
      bodyOf(registerCsv([...SAMPLE, ...descriptions]));
    const idsOf = (body: BodyOfRows): unknown[] => body.rows.map((row) => row.id);

    describe("a provider cell of more than LINE_INPUT_MAX units", () => {
      const OVERLONG: Array<[string, string]> = [
        [
          "a name, a megabyte of blanks and a second name",
          `${NAME}${" ".repeat(LINE_INPUT_MAX)}Voorbeeld`,
        ],
        [
          "a first megabyte that ends in a blank after the name",
          `${" ".repeat(LINE_INPUT_MAX - NAME.length - 1)}${NAME} Voorbeeld`,
        ],
        [
          "a surrogate pair that the end of the first megabyte splits",
          `${NAME}${" ".repeat(LINE_INPUT_MAX - NAME.length - 1)}${ASTRAL}`,
        ],
        [
          "a name and a megabyte of hidden characters",
          `${NAME}${ZERO_WIDTH_SPACE.repeat(LINE_INPUT_MAX)}Voorbeeld`,
        ],
        [
          "a restriction sign and a megabyte of blanks: it is not read, so it is not excluded",
          `${cp(0xa9)} Acme${" ".repeat(LINE_INPUT_MAX)}`,
        ],
        [
          "a megabyte of names, which is no name",
          `${"Acme, ".repeat(Math.ceil(LINE_INPUT_MAX / 6))}Zorbix`,
        ],
      ];

      it.each(OVERLONG)(
        "makes the row unreadable and counts it, and makes no provider of the cut text: %s",
        async (_name, provider) => {
          expect(provider.length).toBeGreaterThan(LINE_INPUT_MAX);
          const body = await unreadableOf([{ provider, orgId: "gm0099" }]);
          expect(body.unreadable).toBe(1);
          expect(idsOf(body)).toEqual(["acme"]);
          const parsed = nlAlgoritmeregisterConnector.parse(
            await download(registerCsv([...SAMPLE, { provider, orgId: "gm0099" }])),
          );
          expect(parsed.records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
          expect(parsed.errors + (parsed.skipped ?? 0)).toBe(1);
          expect(JSON.stringify(parsed.records)).not.toMatch(/shortened|quarkle/i);
        },
      );

      it("reads a provider cell of exactly LINE_INPUT_MAX units, and refuses one of a unit more", async () => {
        const edge = `${NAME}${" ".repeat(LINE_INPUT_MAX - NAME.length)}`;
        expect(edge).toHaveLength(LINE_INPUT_MAX);
        const ok = await unreadableOf([{ provider: edge }]);
        expect(ok.unreadable).toBe(0);
        expect(idsOf(ok)).toEqual(["acme", "quarkle"]);

        const over = await unreadableOf([{ provider: `${edge} ` }]);
        expect(over.unreadable).toBe(1);
        expect(idsOf(over)).toEqual(["acme"]);
      });

      it("reads a provider cell that the cell reader cuts at 200 units as a sentence: no provider, and no unreadable row", async () => {
        const sentence =
          "Het algoritme is ontwikkeld door Zorbix Works in opdracht van de gemeente. ".repeat(6);
        expect(sentence.length).toBeGreaterThan(300);
        expect(sentence.length).toBeLessThan(LINE_INPUT_MAX);
        const body = await unreadableOf([{ provider: sentence }]);
        expect(body.unreadable).toBe(0);
        expect(idsOf(body)).toEqual(["acme"]);
      });

      it("counts a row that is unreadable for another reason once, and not twice", async () => {
        const body = await unreadableOf([
          { provider: `${NAME}${" ".repeat(LINE_INPUT_MAX)}x`, status: "unknown" },
        ]);
        expect(body.unreadable).toBe(1);
      });
    });

    describe("an org_id that does not fit its 20 units", () => {
      const TAIL = "a".repeat(19);
      /** Two ids that share their first units, so that a cut at 8 units gives one text for both. */
      const TWINS: Array<[string, string, string]> = [
        ["a cut that falls after a blank", `gm00001 ${TAIL}`, `gm00001 ${"b".repeat(19)}`],
        ["a surrogate pair at the cut", `gm00001${ASTRAL}${TAIL}`, `gm00001${OTHER_ASTRAL}${TAIL}`],
        ["a cut in the middle of a word", `gm00001x${TAIL}`, `gm00001y${TAIL}`],
        // A cut line of 20 units or fewer would pass for a whole id of that length: the ninth unit that is a
        // blank (the cut takes it off), or the first half of a pair (the cut drops the pair).
        ["a blank at the ninth unit", `gm000001 ${TAIL}`, `gm000001 ${"b".repeat(19)}`],
        [
          "a surrogate pair at the ninth unit",
          `gm000001${ASTRAL}${TAIL}`,
          `gm000001${OTHER_ASTRAL}${TAIL}`,
        ],
      ];

      it.each(TWINS)(
        "makes both rows unreadable and counts both, and never one body of two ids: %s",
        async (_name, first, second) => {
          expect(first).not.toBe(second);
          expect(first.length).toBeGreaterThan(20);
          const body = await unreadableOf([
            { provider: "Gamma Works", orgId: first },
            { provider: "Gamma Works", orgId: second },
          ]);
          expect(body.unreadable).toBe(2);
          expect(idsOf(body)).toEqual(["acme"]);
        },
      );

      it("makes the row unreadable for an id whose first megabyte reads short: it is not the id that it reads as", async () => {
        const cell = `gm0001${" ".repeat(LINE_INPUT_MAX)}tail`;
        expect(cell.length).toBeGreaterThan(LINE_INPUT_MAX);
        const body = await unreadableOf([{ provider: "Gamma Works", orgId: cell }]);
        expect(body.unreadable).toBe(1);
        expect(idsOf(body)).toEqual(["acme"]);
      });

      it("reads an org_id of 20 units, and refuses one of 21", async () => {
        const ok = await unreadableOf([{ provider: "Gamma Works", orgId: "x".repeat(20) }]);
        expect(ok.unreadable).toBe(0);
        expect(idsOf(ok)).toEqual(["acme", "gammaworks"]);

        const over = await unreadableOf([{ provider: "Gamma Works", orgId: "x".repeat(21) }]);
        expect(over.unreadable).toBe(1);
        expect(idsOf(over)).toEqual(["acme"]);
      });

      it("counts two ids of 20 units that differ only at their end as two bodies", async () => {
        const records = await recordsOf(
          registerCsv([
            { provider: "Gamma Works", orgId: `${"x".repeat(19)}1` },
            { provider: "Gamma Works", orgId: `${"x".repeat(19)}2` },
          ]),
        );
        expect(records[0].identifiers).toMatchObject({ algorithms: 2, bodies: 2 });
      });
    });
  });

  describe("the providers a cell names (rule N)", () => {
    const KEPT: Array<[string, string, Array<[string, string]>]> = [
      [
        "a name with a legal form, whose last full stop is trimmed",
        "Acme B.V.",
        [["acme", "Acme B.V"]],
      ],
      ["the same name written without dots", "Acme BV", [["acme", "Acme BV"]]],
      [
        "two spellings of one name in one cell are one name, and the first stands",
        "Acme B.V., Acme BV",
        [["acme", "Acme B.V"]],
      ],
      [
        "a slash with blanks",
        "Acme / Beta",
        [
          ["acme", "Acme"],
          ["beta", "Beta"],
        ],
      ],
      [
        "a slash without blanks",
        "Acme/Beta",
        [
          ["acme", "Acme"],
          ["beta", "Beta"],
        ],
      ],
      [
        "the Dutch word for and",
        "Acme en Beta",
        [
          ["acme", "Acme"],
          ["beta", "Beta"],
        ],
      ],
      [
        "the Dutch word for and, in capitals",
        "Acme EN Beta",
        [
          ["acme", "Acme"],
          ["beta", "Beta"],
        ],
      ],
      [
        "a semicolon",
        "Acme; Beta",
        [
          ["acme", "Acme"],
          ["beta", "Beta"],
        ],
      ],
      [
        "a comma",
        "Acme, Beta",
        [
          ["acme", "Acme"],
          ["beta", "Beta"],
        ],
      ],
      [
        "an ampersand inside a name: it is no separator",
        "ZyAcme eDiscovery & Compliance Services B.V.",
        [["zyacmeediscoverycomplianceservices", "ZyAcme eDiscovery & Compliance Services B.V"]],
      ],
      [
        "a hyphen with blanks inside a name: it is no separator",
        "Acme - Beta",
        [["acmebeta", "Acme - Beta"]],
      ],
      [
        "punctuation and blanks at both ends of a name",
        ".Acme:- ; -Beta.",
        [
          ["acme", "Acme"],
          ["beta", "Beta"],
        ],
      ],
      [
        "a name that begins with the letters of de, but is another word",
        "Decolab",
        [["decolab", "Decolab"]],
      ],
      [
        "names that begin with the letters of is, het, er and de, but are other words",
        "Isolab Works; Hetzlab; Ermolab Works; Delamatic",
        [
          ["delamatic", "Delamatic"],
          ["ermolabworks", "Ermolab Works"],
          ["hetzlab", "Hetzlab"],
          ["isolabworks", "Isolab Works"],
        ],
      ],
      [
        "a name that holds a title only inside another word",
        "Professional Services",
        [["professionalservices", "Professional Services"]],
      ],
      ["a name of four characters", "Abcd", [["abcd", "Abcd"]]],
      [
        "a company next to a person with a title: the person goes, the company stays",
        "Acme; Dr. Voorbeeld",
        [["acme", "Acme"]],
      ],
      ["a parenthetical qualifier, which is cut out", "Acme (formerly Beta)", [["acme", "Acme"]]],
      [
        "a parenthetical that is never closed, which runs to the end of the cell",
        "Acme (formerly Beta",
        [["acme", "Acme"]],
      ],
      [
        "a web address inside a cell, which is cut out and gives no host",
        "Acme www.acme.example",
        [["acme", "Acme"]],
      ],
      [
        "a product next to its maker: two names",
        "Acme Cloud, Acme",
        [
          ["acme", "Acme"],
          ["acmecloud", "Acme Cloud"],
        ],
      ],
      [
        "a name of 60 characters",
        `Zeta${"a".repeat(56)}`,
        [[`zeta${"a".repeat(56)}`, `Zeta${"a".repeat(56)}`]],
      ],
      [
        "names that begin with the letters of a title, but are other words: Drone, Irma, Profound",
        "Drone Works; Irma Works; Profound Works",
        [
          ["droneworks", "Drone Works"],
          ["irmaworks", "Irma Works"],
          ["profoundworks", "Profound Works"],
        ],
      ],
      [
        "a name that begins with a title and a digit, which is another word",
        "DR2 Systems; MR3 Works",
        [
          ["dr2systems", "DR2 Systems"],
          ["mr3works", "MR3 Works"],
        ],
      ],
      [
        "a company whose name begins with the bare word ING, as a bank's does: ing is a title only with a period",
        "ING Zorbix N.V.",
        [["ingzorbix", "ING Zorbix N.V"]],
      ],
      ["the same bare word in another case", "Ing Zorbix B.V.", [["ingzorbix", "Ing Zorbix B.V"]]],
      ["a title that ends another word", "AcmeIr Works", [["acmeirworks", "AcmeIr Works"]]],
      [
        "a name with a part cut out of its middle, whose blanks are closed up",
        "Acme (a) Beta",
        [["acmebeta", "Acme Beta"]],
      ],
      [
        "blanks, tabs, no-break spaces and hidden characters in a cell",
        `${TAB}Acme${NO_BREAK_SPACE}B.V.${ZERO_WIDTH_SPACE} `,
        [["acme", "Acme B.V"]],
      ],
    ];

    it.each(KEPT)("gives %s", async (_name, cell, expected) => {
      expect(await providersOf(cell)).toEqual(expected);
    });

    const NONE: Array<[string, string]> = [
      ["an in-house marker", "Intern ontwikkeld"],
      ["an in-house marker, eigen", "Eigen ontwikkeling"],
      ["an in-house marker, zelf", "Zelf gebouwd door de gemeente"],
      ["the public body itself, a municipality", "Gemeente Voorbeeld"],
      ["the public body itself, a province", "Provincie Voorbeeldland"],
      ["a placeholder, n.v.t.", "n.v.t."],
      ["a placeholder, nvt", "NVT"],
      ["a placeholder, niet beschikbaar", "Niet beschikbaar"],
      ["a placeholder, onbekend", "Onbekend"],
      ["a placeholder with words after it, n.v.t.", "n.v.t. leverancier"],
      ["a placeholder, geen", "Geen leverancier"],
      ["the start of a sentence, het", "Het team"],
      ["the start of a sentence, de", "De Voorbeeld Groep"],
      ["the start of a sentence, dit", "Dit is een eigen product"],
      ["the start of a sentence, deze", "Deze applicatie"],
      ["the start of a sentence, er", "Er is geen leverancier"],
      ["the start of a sentence, is", "Is niet bekend"],
      ["a person with a title, after a note", "ontwikkelaar: Prof. Jan Voorbeeld"],
      ["a title, Dr.", "Dr. Voorbeeld"],
      ["a title, Drs", "Drs Voorbeeld"],
      ["a title, Ir.", "Ir. Proefpersoon"],
      ["a title, Mr.", "Mr. Alfa"],
      ["a title, Ing.", "Ing. Beta"],
      // Six cells: lower case, stacked, with initials, with an accented capital.
      ["a stacked title, prof. dr.", "Prof. dr. Jan Voorbeeld"],
      ["a title in lower case, dr.", "dr. Jan Voorbeeld"],
      ["a title with an initial, Dr. J.", "Dr. J. Voorbeeld"],
      ["a title with two initials, Ir. J.P.", "Ir. J.P. Voorbeeld"],
      ["a title before an accented capital, Prof. Émile", "Prof. Émile Voorbeeld"],
      ["a title in lower case, mr.", "mr. Anna Voorbeeld"],
      // More of the same rule: the title is a word at the start or after a separator, in any case,
      // whatever follows it.
      ["a title word, whatever follows it", "Mr works"],
      ["three stacked titles", "prof. dr. ir. Jan Voorbeeld"],
      ["stacked titles with no blanks between them", "Prof.dr.ir.Jan Voorbeeld"],
      ["a title in capitals", "DR. JAN VOORBEELD"],
      ["a title with no period, in lower case", "dr Jan Voorbeeld"],
      ["a title with no period, Prof", "Prof Voorbeeld"],
      ["a title with no period, ir", "ir Jan Voorbeeld"],
      ["a title, ing., in lower case", "ing. J. Voorbeeld"],
      ["a title after a colon and no blank", "ontwikkelaar:dr. Jan Voorbeeld"],
      ["a title after a blank inside the name", "Acme Works t.a.v. dr. Jan Voorbeeld"],
      [
        "a brand that begins with a title: dropped as a person is, which fails closed",
        "Dr. Zorbix Works",
      ],
      ["a sentence of 61 characters", `Zeta${"a".repeat(57)}`],
      ["a web address", "www.acme.example"],
      ["a web address with a scheme", "https://acme.example/path"],
      ["a web address in capitals", "WWW.ACME.EXAMPLE"],
      ["a name in brackets", "(Acme)"],
      ["a name of three characters once its legal form is off", "NEX BV"],
      ["an acronym of three characters", "XYZ"],
      ["an acronym of three characters with a hyphen", "Q-TC"],
      ["a code of three characters", "Q2C"],
      ["nothing but punctuation", ".,;:-"],
      ["an empty cell", ""],
    ];

    it.each(NONE)("gives no provider for %s", async (_name, cell) => {
      expect(await providersOf(cell)).toEqual([]);
    });

    it.each([
      "Ditlab",
      "Dezelab",
      "Geenlab",
      "Nietlab",
      "Nvtlab",
      "Gemeentelab",
      "Provincielab",
      "Islab",
      "Hetlab",
      "Delab",
      "Erlab",
    ])(
      "keeps %s: it begins like a marker of the body itself, but it is another word",
      async (cell) => {
        expect(await providersOf(cell)).toEqual([[cell.toLowerCase(), cell]]);
      },
    );

    it("tells an academic title from the beginning of a word, and a title from a name that is only a word", async () => {
      expect(await providersOf("Prof Voorbeeld")).toEqual([]);
      expect(await providersOf("Professor Works")).toEqual([["professorworks", "Professor Works"]]);
      expect(await providersOf("Mrs Works")).toEqual([["mrsworks", "Mrs Works"]]);
      expect(await providersOf("Ingenieurs Works")).toEqual([
        ["ingenieursworks", "Ingenieurs Works"],
      ]);
    });

    it("drops a token whose first words are in-house markers, whatever follows", async () => {
      expect(await providersOf("Internext Works")).toEqual([]);
      expect(await providersOf("Eigenaar Works")).toEqual([]);
    });

    it("gives a name for a cell of 60 characters and none for one of 61, whatever the cell holds", async () => {
      const sixty = `Acme Works, ${"x".repeat(48)}`;
      const sixtyOne = `Acme Works, ${"x".repeat(49)}`;
      expect(sixty).toHaveLength(60);
      expect((await providersOf(sixty)).map(([id]) => id)).toEqual(["acmeworks", "x".repeat(48)]);
      // The cell is a sentence: the name in it is lost, and none is guessed.
      expect(await providersOf(sixtyOne)).toEqual([]);
    });

    it("closes up the blanks that a cut leaves in a name, in the body as well as in the text", async () => {
      const body = await bodyOf(
        registerCsv([{ provider: "Acme (a) Beta" }, { provider: "Acme  Beta (b)" }]),
      );
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0].names).toEqual(["Acme Beta"]);
      expect(body.rows[0].algorithms).toBe(2);
    });

    it("reads no provider from a long sentence, of up to a cell's length, that names a supplier", async () => {
      expect(
        await providersOf(
          "Het algoritme is ontwikkeld door de medewerkers van Acme Works in opdracht van de gemeente",
        ),
      ).toEqual([]);
    });
  });

  describe("the descriptions that the register's copyright page excludes", () => {
    it.each([
      "© Acme",
      "Acme ©",
      "Acme © 2026",
      "Auteursrecht Acme",
      "AUTEURSRECHT: Acme",
      "Acme (auteursrecht)",
    ])(
      "skips the row whose provider cell is %j: no provider, and no unreadable row",
      async (provider) => {
        const csv = registerCsv([
          ...SAMPLE,
          { provider, organization: "Gemeente Uitgesloten", orgId: "gm0002" },
        ]);
        const body = await bodyOf(csv);
        const parsed = nlAlgoritmeregisterConnector.parse(await download(csv));

        expect(body.unreadable).toBe(0);
        expect(body.total).toBe(PADDED);
        expect(parsed.errors).toBe(0);
        expect(parsed.skipped).toBe(0);
        // The row counts for nothing: the sample's provider is as it was, and no body is added to it.
        expect(parsed.records).toHaveLength(1);
        expect(parsed.records[0].summary).toBe(SAMPLE_SUMMARY);
        expect(JSON.stringify(parsed.records)).not.toContain("Uitgesloten");
      },
    );

    it("keeps the other descriptions that name the same provider", async () => {
      const records = await recordsOf(registerCsv([{ provider: "Acme" }, { provider: "© Acme" }]));
      expect(records).toHaveLength(1);
      expect(records[0].identifiers.algorithms).toBe(1);
    });

    it("counts a row that holds the sign and cannot be read as unreadable all the same", async () => {
      const body = await bodyOf(registerCsv([{ provider: "© Acme", status: "unknown" }]));
      expect(body.unreadable).toBe(1);
    });
  });

  describe("the descriptions whose provider is a person with an academic title", () => {
    it.each([
      "Prof. dr. Jan Voorbeeld",
      "dr. Jan Voorbeeld",
      "Dr. J. Voorbeeld",
      "Ir. J.P. Voorbeeld",
      "Prof. Émile Voorbeeld",
      "mr. Anna Voorbeeld",
    ])(
      "skips the row whose provider cell is %j, as the rows with a title always were: no provider, and no unreadable row",
      async (provider) => {
        const csv = registerCsv([
          ...SAMPLE,
          { provider, organization: "Gemeente Titelhouder", orgId: "gm0002" },
        ]);
        const body = await bodyOf(csv);
        const parsed = nlAlgoritmeregisterConnector.parse(await download(csv));

        expect(body.unreadable).toBe(0);
        expect(body.total).toBe(PADDED);
        expect(parsed.errors).toBe(0);
        expect(parsed.skipped).toBe(0);
        // The row counts for nothing: the sample's provider is as it was, and the person is nowhere.
        expect(parsed.records).toHaveLength(1);
        expect(parsed.records[0].summary).toBe(SAMPLE_SUMMARY);
        expect(JSON.stringify(parsed.records)).not.toContain("Titelhouder");
        expect(JSON.stringify(parsed.records)).not.toContain(provider);
      },
    );

    it("drops the person of a cell and keeps the company that stands next to it", async () => {
      const records = await recordsOf(
        registerCsv([{ provider: "Acme B.V.; prof. dr. Jan Voorbeeld" }]),
      );
      expect(records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
      expect(JSON.stringify(records)).not.toContain("Jan");
    });
  });

  describe("a title that follows the name it qualifies", () => {
    const ACME_BV: Array<[string, string]> = [["acme", "Acme B.V"]];
    const ACME: Array<[string, string]> = [["acme", "Acme"]];

    /** Cells of one person whose title stands after the name, or in brackets after it: no provider at all. */
    const PERSONS: Array<[string, string]> = [
      ["a surname, then a title and initials", "Voorbeeld, dr. J."],
      ["a surname, initials and a title in brackets", "Voorbeeld, J. (Prof.)"],
      ["a full name and a title in brackets", "Jan Voorbeeld (dr.)"],
      ["a surname, a title in capitals and initials", "Voorbeeld, DR. J."],
      ["a surname, initials and a title in capitals in brackets", "Voorbeeld, J. (PROF.)"],
      ["a full name and a title in capitals in brackets", "Jan Voorbeeld (DR.)"],
      ["a title with no blank after the comma", "Voorbeeld,dr.J."],
      ["a title in brackets with no blank before them", "Voorbeeld, J.(Prof.)"],
      ["a full name and brackets with no blank before them", "Jan Voorbeeld(dr.)"],
      ["stacked titles after a surname", "Voorbeeld, prof. dr. ir. J."],
      ["stacked titles in brackets", "Voorbeeld, J. (Prof. dr. ir.)"],
      ["stacked titles with no blanks in brackets", "Jan Voorbeeld (prof.dr.)"],
      ["a title with no period after a surname", "Voorbeeld, dr J."],
      ["a title with no period in brackets", "Jan Voorbeeld (dr)"],
      ["ing. after a surname", "Voorbeeld, ing. J."],
      ["ing. in brackets", "Jan Voorbeeld (ing.)"],
      ["brackets with blanks inside them", "Jan Voorbeeld ( dr. )"],
      ["brackets that are never closed", "Jan Voorbeeld (Prof. dr. J.P."],
      ["a title in brackets that stands alone after a comma", "Voorbeeld, (dr.)"],
      ["an accented surname, then a title", `M${cp(0xe9)}nard, dr. J.`],
      ["a title before an accented capital, after a surname", `Voorbeeld, Prof. ${cp(0xc9)}mile`],
      ["an accented capital before a title in brackets", `${cp(0xc9)}mile Voorbeeld (Prof.)`],
    ];

    it.each(PERSONS)("gives no provider for %s", async (_name, cell) => {
      expect(await providersOf(cell)).toEqual([]);
    });

    it.each(PERSONS)(
      "skips the row whose provider cell is %s, as the rows with a title always were: no unreadable row, and the person nowhere",
      async (_name, provider) => {
        const csv = registerCsv([
          ...SAMPLE,
          { provider, organization: "Gemeente Titelvolger", orgId: "gm0003" },
        ]);
        const body = await bodyOf(csv);
        const parsed = nlAlgoritmeregisterConnector.parse(await download(csv));

        expect(body.unreadable).toBe(0);
        expect(body.total).toBe(PADDED);
        expect(parsed.errors).toBe(0);
        expect(parsed.skipped).toBe(0);
        // The row counts for nothing: the sample's provider is as it was, and no body is added to it.
        expect(parsed.records).toHaveLength(1);
        expect(parsed.records[0].summary).toBe(SAMPLE_SUMMARY);
        expect(JSON.stringify(parsed.records)).not.toContain("Titelvolger");
        expect(JSON.stringify(body)).not.toMatch(/mnard|mile|proefpersoon/i);
      },
    );

    /** Cells of a company and a person: the title takes the surname before it, and the company stays. */
    const COMPANY_STAYS: Array<[string, string, Array<[string, string]>]> = [
      ["a company, a surname and a title", "Acme B.V., Voorbeeld, mr. A.", ACME_BV],
      ["the same in capitals", "Acme B.V., Voorbeeld, MR. A.", ACME_BV],
      ["the same with no blank after the commas", "Acme B.V.,Voorbeeld,mr.A.", ACME_BV],
      ["the same with stacked titles", "Acme B.V., Voorbeeld, prof. dr. ir. A.", ACME_BV],
      ["the same with the title in brackets", "Acme B.V., Voorbeeld, A. (Prof.)", ACME_BV],
      [
        "the same with the title in capitals in brackets",
        "Acme B.V., Voorbeeld, A. (PROF.)",
        ACME_BV,
      ],
      ["the same with no blank before the brackets", "Acme B.V., Voorbeeld, A.(Prof.)", ACME_BV],
      [
        "two companies, then a surname and a title",
        "Acme B.V., Beta Works; Voorbeeld, dr. J.",
        [
          ["acme", "Acme B.V"],
          ["betaworks", "Beta Works"],
        ],
      ],
      [
        "a surname and a title, then a semicolon and a company",
        "Voorbeeld, dr. J.; Acme B.V.",
        ACME_BV,
      ],
      ["a person with a title first, then a company", "dr. J. Voorbeeld, Acme B.V.", ACME_BV],
      [
        "a person with a title in brackets first, then a company",
        "Jan Voorbeeld (dr.), Acme B.V.",
        ACME_BV,
      ],
      [
        "a company, a person with a title in brackets after a semicolon",
        "Acme B.V.; Jan Voorbeeld (dr.)",
        ACME_BV,
      ],
      [
        "the Dutch word for and: two parties, and the earlier one stays",
        "Acme en dr. Voorbeeld",
        ACME,
      ],
      ["the Dutch word for and in capitals", "Acme EN dr. Voorbeeld", ACME],
      ["a semicolon: two parties", "Acme B.V.; dr. Voorbeeld", ACME_BV],
      ["a slash: two parties", "Acme B.V. / dr. Voorbeeld", ACME_BV],
      ["a slash with no blanks", "Acme B.V./dr. Voorbeeld", ACME_BV],
      ["a title in brackets after the Dutch word for and", "Acme en Jan Voorbeeld (dr.)", ACME],
      [
        "a piece that holds a title after other words, which begins with none: no title piece",
        "Acme B.V., Beta Works dr. Voorbeeld",
        ACME_BV,
      ],
      [
        "a piece that holds a title after other words, after a semicolon",
        "Acme B.V.; Beta Works dr. Voorbeeld",
        ACME_BV,
      ],
    ];

    it.each(COMPANY_STAYS)(
      "keeps the company and drops the person: %s",
      async (_name, cell, expected) => {
        expect(await providersOf(cell)).toEqual(expected);
      },
    );

    it("counts a description once for the company that stands beside a person with a title, and keeps the person out of every record", async () => {
      const records = await recordsOf(
        registerCsv([
          {
            provider: "Acme B.V., Voorbeeld, mr. A.",
            organization: "Gemeente Titelvolger",
            orgId: "gm0003",
          },
          { provider: "Acme B.V.", organization: "Gemeente Titelvolger", orgId: "gm0003" },
        ]),
      );
      expect(records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
      expect(records[0].identifiers.algorithms).toBe(2);
      expect(JSON.stringify(records)).not.toMatch(/voorbeeld/i);
    });

    /**
     * What the rule drops although it need not: it fails closed, and a person is never a key. A comma is
     * what separated a surname from its title, so a piece that a comma separates from a title goes with
     * it; brackets that begin with a title drop the piece they belong to.
     */
    it.each([
      ["a company, a comma and a person with a title", "Acme B.V., dr. Voorbeeld"],
      ["a company, a comma and a person with stacked titles", "Acme B.V., prof. dr. Voorbeeld"],
      ["a company, a comma and a person with a title in brackets", "Acme B.V., Voorbeeld (dr.)"],
      ["a company with brackets that begin with a title", "Acme B.V. (dr. J. Voorbeeld)"],
      ["a company with a title in brackets", "Acme B.V. (Prof.)"],
    ])("fails closed for %s: no provider", async (_name, cell) => {
      expect(await providersOf(cell)).toEqual([]);
    });

    /** What the rule leaves alone: brackets that do not begin with a title, and words that only begin like one. */
    it.each([
      [
        "brackets that hold a title after other words",
        "Acme B.V. (contact: dr. J. Voorbeeld)",
        ACME_BV,
      ],
      ["brackets whose first word begins like a title", "Acme (Irma Systems)", ACME],
      ["brackets that hold the word Drone", "Acme (Drone)", ACME],
      ["brackets that hold the word Profound", "Acme (Profound Works)", ACME],
      ["brackets that hold a title and a digit", "Acme (Mr3)", ACME],
      ["brackets that hold the bare word ING, as the bank's name is", "Acme (ING)", ACME],
      [
        "brackets that hold a place",
        "Acme (Amsterdam), Beta Works",
        [
          ["acme", "Acme"],
          ["betaworks", "Beta Works"],
        ],
      ],
      [
        "a company after a comma that begins like a title",
        "Acme B.V., Drone Works",
        [
          ["acme", "Acme B.V"],
          ["droneworks", "Drone Works"],
        ],
      ],
      [
        "a company after a comma that begins with the bare word ING",
        "Acme B.V., ING Zorbix N.V.",
        [
          ["acme", "Acme B.V"],
          ["ingzorbix", "ING Zorbix N.V"],
        ],
      ],
      [
        "two companies with a comma and no title at all",
        "Acme B.V., Beta Works",
        [
          ["acme", "Acme B.V"],
          ["betaworks", "Beta Works"],
        ],
      ],
    ])("leaves alone %s", async (_name, cell, expected) => {
      expect(await providersOf(cell)).toEqual(expected);
    });

    it("takes a control character out of a cell, so that none can stand for a title in brackets (the mark that the reader writes for one)", async () => {
      expect(await providersOf(`Acme${cp(0)}Works`)).toEqual([["acmeworks", "AcmeWorks"]]);
      expect(await providersOf(`Acme B.V.,${cp(0)} Beta Works`)).toEqual([
        ["acme", "Acme B.V"],
        ["betaworks", "Beta Works"],
      ]);
      expect(await providersOf(`Voorbeeld, J.${cp(0)}`)).toEqual([["voorbeeld", "Voorbeeld"]]);
    });

    it("gives the same body whatever the order of the rows that hold the cells", async () => {
      const descriptions: Description[] = [
        ...PERSONS.map(([, provider]) => ({ provider })),
        ...COMPANY_STAYS.map(([, provider]) => ({ provider })),
      ];
      const forward = await download(registerCsv(descriptions));
      const backward = await download(registerCsv([...descriptions].reverse()));
      expect(backward.bodies).toEqual(forward.bodies);
      const body = JSON.parse(forward.bodies[0]) as BodyOfRows;
      expect(body.rows.map((row) => row.id)).toEqual(["acme", "betaworks"]);
    });
  });

  // A title that stands after initials, or after pieces that are a person's, is a title piece too:
  // the pieces before it that are initials or one capitalised word go with it, back to a piece that holds a
  // legal form or an organisation word, or that another separator set apart.
  describe("a title after initials, or after pieces that are a person's", () => {
    const ACME_BV: Array<[string, string]> = [["acme", "Acme B.V"]];
    const ACME: Array<[string, string]> = [["acme", "Acme"]];

    /** Cells of one person whose title stands after initials or after more pieces: no provider at all. */
    const PERSONS: Array<[string, string]> = [
      ["a surname, initials and a title", "Voorbeeld, J. dr."],
      ["a surname, two initials with a stop between them, and a title", "Voorbeeld, J. P., dr."],
      ["a surname, a given name and a title", "Voorbeeld, Jan, dr."],
      ["a surname, initials with no blank between them, and a title", "Testmans, J.P. prof."],
      ["a surname, initials and a title in capitals", "Voorbeeld, J. DR."],
      ["a surname, initials and a title with a capital", "Voorbeeld, J. Dr."],
      ["a surname in capitals, initials and a title", "VOORBEELD, J. DR."],
      ["a title with no blank after the commas", "Voorbeeld,Jan,dr."],
      ["initials and a title with no blank after the comma", "Voorbeeld,J. dr."],
      ["a title with no full stop after initials", "Voorbeeld, J. dr"],
      ["a title with no full stop after a given name", "Voorbeeld, Jan, dr"],
      ["stacked titles after a given name", "Voorbeeld, Jan, prof. dr."],
      ["stacked titles after initials", "Voorbeeld, J. prof. dr."],
      ["three stacked titles after initials with stops", "Voorbeeld, J.P. dr. ir."],
      ["ing. after initials", "Voorbeeld, J. ing."],
      ["the title mr. after initials", "Voorbeeld, J. mr."],
      [
        "a title in brackets after initials, with a given name before them",
        "Voorbeeld, Jan, J. (dr.)",
      ],
      ["a title in brackets with no blank before them", "Voorbeeld, Jan, J.(Prof.)"],
      ["a surname, a given name, initials and a title", "Voorbeeld, Jan, J., dr."],
      ["a surname, a given name, initials with a title after them", "Voorbeeld, Jan, J. dr."],
      ["two surnames and a title after initials", "Quorpel, Voorbeeld, J. dr."],
      ["a given name before a title with initials", "Voorbeeld, Jan, J.P. prof. dr."],
      ["an accented surname, initials and a title", `M${cp(0xe9)}nard, J. dr.`],
      ["an accented given name, then a title", `Voorbeeld, ${cp(0xc9)}mile, dr.`],
      ["a title with initials and a given name", "Voorbeeld, J. Jan dr."],
      ["a hyphenated given name", "Voorbeeld, Jan-Willem, dr."],
      ["a surname with an apostrophe", "O'Voorbeeld, J. dr."],
    ];

    it.each(PERSONS)("gives no provider for %s", async (_name, cell) => {
      expect(await providersOf(cell)).toEqual([]);
    });

    it.each(PERSONS)(
      "skips the row whose provider cell is %s: no unreadable row, and the person nowhere",
      async (_name, provider) => {
        const csv = registerCsv([
          ...SAMPLE,
          { provider, organization: "Gemeente Titelvolger", orgId: "gm0004" },
        ]);
        const body = await bodyOf(csv);
        const parsed = nlAlgoritmeregisterConnector.parse(await download(csv));

        expect(body.unreadable).toBe(0);
        expect(parsed.errors).toBe(0);
        expect(parsed.skipped).toBe(0);
        expect(parsed.records).toHaveLength(1);
        expect(parsed.records[0].summary).toBe(SAMPLE_SUMMARY);
        expect(JSON.stringify(parsed.records)).not.toContain("Titelvolger");
        // The row counts for nothing: the body is the body of the sample alone.
        expect(body).toEqual(await bodyOf(registerCsv(SAMPLE)));
      },
    );

    /** Cells of a company and a person: the person goes, and the company, which the walk back never reaches, stays. */
    const COMPANY_STAYS: Array<[string, string, Array<[string, string]>]> = [
      ["a company, a surname, initials and a title", "Acme B.V., Quorpel, J. Dr.", ACME_BV],
      [
        "the same with two initials and a title after a comma",
        "Acme B.V., Quorpel, J. P., dr.",
        ACME_BV,
      ],
      ["the same with a given name", "Acme B.V., Quorpel, Jan, dr.", ACME_BV],
      [
        "a company without dots in its legal form",
        "Acme BV, Quorpel, J. dr.",
        [["acme", "Acme BV"]],
      ],
      [
        "a company, a surname, a given name, initials and a title",
        "Acme B.V., Quorpel, Jan, J. dr.",
        ACME_BV,
      ],
      [
        "a company and initials with a title: the title piece takes no company before it",
        "Acme B.V., J. dr.",
        ACME_BV,
      ],
      [
        "a company and initials with no blank between them, and a title",
        "Acme B.V., J.P. prof.",
        ACME_BV,
      ],
      [
        "a company, a person with initials and a title in brackets",
        "Acme B.V., Quorpel, J. (Prof.)",
        ACME_BV,
      ],
      ["a semicolon sets a company apart", "Acme; Voorbeeld, J. dr.", ACME],
      ["the Dutch word for and sets a company apart", "Acme en Voorbeeld, Jan, dr.", ACME],
      ["a slash sets a company apart", "Acme / Voorbeeld, J. P., dr.", ACME],
      ["a semicolon, then a person of three pieces", "Acme B.V.; Voorbeeld, Jan, dr.", ACME_BV],
      [
        "a company of two words that is no person's, and a person with initials and a title",
        "Acme B.V., Beta Works, J. dr.",
        [
          ["acme", "Acme B.V"],
          ["betaworks", "Beta Works"],
        ],
      ],
      [
        "a piece that holds a title after other words and is no title piece: it takes no piece before it",
        "Acme B.V., Beta Works dr. Voorbeeld",
        ACME_BV,
      ],
      [
        "a piece that holds a title after other words, after a surname: it takes no piece before it",
        "Quorpel, Beta Works dr. Voorbeeld",
        [["quorpel", "Quorpel"]],
      ],
      ["a legal form on its own stops the walk", "Acme, BV, Voorbeeld, J. dr.", ACME],
      [
        "an organisation word on its own stops the walk, and stays",
        "Acme, Software, Voorbeeld, J. dr.",
        [
          ["acme", "Acme"],
          ["software", "Software"],
        ],
      ],
      ["a person, then a company after a semicolon", "Voorbeeld, J. dr.; Acme B.V.", ACME_BV],
      [
        "a person with initials and a title, then a company after a comma",
        "J. Voorbeeld dr., Acme B.V.",
        ACME_BV,
      ],
    ];

    it.each(COMPANY_STAYS)(
      "keeps the company and drops the person: %s",
      async (_name, cell, expected) => {
        expect(await providersOf(cell)).toEqual(expected);
      },
    );

    it("leaves alone what the rule does not read as a person's, as before: two capitalised words, a particle, a lower-case surname or initial, a title glued to initials (the residuals)", async () => {
      expect(await providersOf("Beta Works, J. dr.")).toEqual([["betaworks", "Beta Works"]]);
      expect(await providersOf("Van Dijk, J. dr.")).toEqual([["vandijk", "Van Dijk"]]);
      expect(await providersOf("van Dijk, J. dr.")).toEqual([["vandijk", "van Dijk"]]);
      expect(await providersOf("quorpel, J. dr.")).toEqual([["quorpel", "quorpel"]]);
      // An initial is one capital; a full stop is no part of it.
      expect(await providersOf("Voorbeeld, j. dr.")).toEqual([["voorbeeld", "Voorbeeld"]]);
      expect(await providersOf("Voorbeeld, j dr.")).toEqual([["voorbeeld", "Voorbeeld"]]);
      expect(await providersOf("Voorbeeld, J dr.")).toEqual([]);
      expect(await providersOf("Voorbeeld, J.P.dr.")).toEqual([
        ["jpdr", "J.P.dr"],
        ["voorbeeld", "Voorbeeld"],
      ]);
    });

    it("keeps out of every record the person that stands after the company, and counts the description once for the company", async () => {
      const records = await recordsOf(
        registerCsv([
          {
            provider: "Acme B.V., Quorpel, J. dr.",
            organization: "Gemeente Titelvolger",
            orgId: "gm0003",
          },
          { provider: "Acme B.V.", organization: "Gemeente Titelvolger", orgId: "gm0003" },
        ]),
      );
      expect(records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
      expect(records[0].identifiers.algorithms).toBe(2);
      expect(JSON.stringify(records)).not.toMatch(/quorpel/i);
    });
  });

  // More markers of a natural person, of the same rule as the academic titles.
  describe("more person markers", () => {
    const ACME_BV: Array<[string, string]> = [["acme", "Acme B.V"]];

    const MARKED: Array<[string, string]> = [
      // Honorifics and the title bc.
      ["the honorific dhr. with initials", "dhr. J. Voorbeeld"],
      ["the honorific dhr. in capitals", "DHR. VOORBEELD"],
      ["the honorific dhr with no full stop", "dhr Jan Voorbeeld"],
      ["the honorific mevr. with a surname", "mevr. Voorbeeld"],
      ["the honorific mevr. with initials, with a capital", "Mevr. J. Voorbeeld"],
      ["the honorific mevr with no full stop", "mevr Jansen"],
      ["the honorific mevrouw", "Mevrouw Voorbeeld"],
      ["the honorific mevrouw in lower case, with initials", "mevrouw J. Voorbeeld"],
      ["the title bc.", "Bc. Jan Voorbeeld"],
      ["the title bc. with initials", "bc. J. Voorbeeld"],
      ["an honorific after a colon", "ontwikkelaar: dhr. J. Voorbeeld"],
      ["an honorific after other words of the piece", "Acme Works t.a.v. mevr. Jan Voorbeeld"],
      ["an honorific after a surname and a comma", "Voorbeeld, dhr. J."],
      ["an honorific after a surname and a comma, with no blank", "Voorbeeld,mevr.J."],
      ["an honorific in brackets after a name", "Jan Voorbeeld (dhr.)"],
      // Post-nominals, after the name.
      ["PhD after initials and a surname", "J. Voorbeeld PhD"],
      ["MSc after a name", "Jan Voorbeeld MSc"],
      ["M.Sc. after a name", "Jan Voorbeeld M.Sc."],
      ["msc in lower case after a name", "Jan Voorbeeld msc"],
      ["MBA after a name", "Jan Voorbeeld MBA"],
      ["M.B.A. after initials and a surname", "J. Voorbeeld M.B.A."],
      ["Ph.D. after a name", "Jan Voorbeeld Ph.D."],
      ["LLM after a name", "Jan Voorbeeld LLM"],
      ["LL.M. after a name", "Jan Voorbeeld LL.M."],
      ["RA after a name", "Jan Voorbeeld RA"],
      ["R.A. after initials and a surname", "J.P. Voorbeeld R.A."],
      ["two post-nominals", "Jan Voorbeeld MSc MBA"],
      ["a post-nominal after one word", "Voorbeeld MSc"],
      ["a post-nominal in capitals after one word", "VOORBEELD MBA"],
      ["a post-nominal as the second word of a brand-like name", "Zorbix MSc"],
      // Post-nominals as pieces of their own.
      ["a surname, initials and MSc after commas", "Voorbeeld, J., MSc"],
      ["a surname, a given name and PhD", "Voorbeeld, Jan, PhD"],
      ["a full name and MSc after a comma", "Jan Voorbeeld, MSc"],
      ["a full name and two post-nominals after commas", "Jan Voorbeeld, MSc, MBA"],
      ["a surname, initials and R.A. after commas", "Voorbeeld, J.P., R.A."],
      [
        "a surname and initials, and a post-nominal with no blank after the comma",
        "Voorbeeld, J.,MSc",
      ],
      // Post-nominals in brackets, and titles in square brackets.
      ["a post-nominal in brackets", "Jan Voorbeeld (MSc)"],
      ["a post-nominal with stops in brackets", "Jan Voorbeeld (M.Sc.)"],
      ["PhD in brackets", "Jan Voorbeeld (PhD)"],
      ["two post-nominals in brackets", "Jan Voorbeeld (MSc, MBA)"],
      ["a post-nominal in brackets that are never closed", "Jan Voorbeeld (MSc"],
      ["a title in square brackets", "Voorbeeld [dr.]"],
      ["a title in square brackets with no blank before them", "Voorbeeld[dr.]"],
      ["a title with a capital in square brackets", "Jan Voorbeeld [Prof.]"],
      ["stacked titles in square brackets", "Jan Voorbeeld [Prof. dr. ir.]"],
      ["square brackets that are never closed", "Jan Voorbeeld [Prof. dr."],
      ["initials and a title in square brackets", "Voorbeeld, J. [Prof.]"],
      ["a given name and a title in square brackets after a comma", "Voorbeeld, Jan [dr.]"],
      [
        "a title after a second opening square bracket, in square brackets that hold no marker",
        "Voorbeeld [x [dr. J.",
      ],
      ["a post-nominal in square brackets", "Jan Voorbeeld [MSc]"],
      ["square brackets with blanks inside them", "Jan Voorbeeld [ dr. ]"],
    ];

    it.each(MARKED)("gives no provider for %s", async (_name, cell) => {
      expect(await providersOf(cell)).toEqual([]);
    });

    it.each(MARKED)(
      "skips the row whose provider cell is %s: no unreadable row, and the person nowhere",
      async (_name, provider) => {
        const csv = registerCsv([
          ...SAMPLE,
          { provider, organization: "Gemeente Titelvolger", orgId: "gm0005" },
        ]);
        const body = await bodyOf(csv);
        const parsed = nlAlgoritmeregisterConnector.parse(await download(csv));

        expect(body.unreadable).toBe(0);
        expect(parsed.errors).toBe(0);
        expect(parsed.records).toHaveLength(1);
        expect(parsed.records[0].summary).toBe(SAMPLE_SUMMARY);
        expect(JSON.stringify(parsed.records)).not.toContain("Titelvolger");
        // The row counts for nothing: the body is the body of the sample alone.
        expect(body).toEqual(await bodyOf(registerCsv(SAMPLE)));
      },
    );

    it.each([
      ["a company and an honorific after a semicolon", "Acme B.V.; dhr. J. Voorbeeld", ACME_BV],
      [
        "a company and an honorific with a given name after a slash",
        "Acme B.V. / mevr. Jansen",
        ACME_BV,
      ],
      [
        "a company and a person with a post-nominal after a semicolon",
        "Acme B.V.; J. Voorbeeld PhD",
        ACME_BV,
      ],
      [
        "a company and a person with a post-nominal after a slash",
        "Acme B.V. / Jan Voorbeeld MSc",
        ACME_BV,
      ],
      [
        "a company and a person with a post-nominal after the Dutch word for and",
        "Acme B.V. en J. Voorbeeld RA",
        ACME_BV,
      ],
      [
        "a company, then a surname with a post-nominal piece after a semicolon",
        "Acme B.V.; Voorbeeld, J., MSc",
        ACME_BV,
      ],
      [
        "a company, a surname and initials with MBA after commas",
        "Acme B.V., Quorpel, J., MBA",
        ACME_BV,
      ],
    ] as Array<[string, string, Array<[string, string]>]>)(
      "keeps the company and drops the person: %s",
      async (_name, cell, expected) => {
        expect(await providersOf(cell)).toEqual(expected);
      },
    );

    /** What is no marker: a post-nominal is one after a name only, and a word that merely holds its letters is a word. */
    it.each([
      [
        "a post-nominal that is the first word of a name: MSC Software",
        "MSC Software",
        [["mscsoftware", "MSC Software"]],
      ],
      ["MBA as the first word of a name", "MBA Systems", [["mbasystems", "MBA Systems"]]],
      ["LLM as the first word of a name", "LLM Labs", [["llmlabs", "LLM Labs"]]],
      ["PhD as the first word of a name", "PhD Works", [["phdworks", "PhD Works"]]],
      ["RA as the first word of a name", "RA Works", [["raworks", "RA Works"]]],
      [
        "a word that begins with the letters of a post-nominal",
        "Acme MScript",
        [["acmemscript", "Acme MScript"]],
      ],
      ["a word that ends in the letters of one", "Acme Terra", [["acmeterra", "Acme Terra"]]],
      [
        "a word that begins with the letters of RA",
        "Acme Rainbow",
        [["acmerainbow", "Acme Rainbow"]],
      ],
      [
        "a word that begins with the letters of MBA",
        "Acme Mbandi",
        [["acmembandi", "Acme Mbandi"]],
      ],
      ["a word that begins with the letters of PhD", "Acme Phdex", [["acmephdex", "Acme Phdex"]]],
      [
        "a word that begins with the letters of LLM",
        "Acme Llmore",
        [["acmellmore", "Acme Llmore"]],
      ],
      [
        "a word that begins with the letters of dhr",
        "Dhrub Works",
        [["dhrubworks", "Dhrub Works"]],
      ],
      [
        "a word that begins with the letters of mevr",
        "Mevrex Works",
        [["mevrexworks", "Mevrex Works"]],
      ],
      [
        "a word that begins with the letters of mevrouw",
        "Mevrouwen Works",
        [["mevrouwenworks", "Mevrouwen Works"]],
      ],
      ["bc with no full stop", "Bc Works", [["bcworks", "Bc Works"]]],
      ["a word that begins with bc", "Bcorp Works", [["bcorpworks", "Bcorp Works"]]],
      ["dhr and a digit", "Dhr2 Works", [["dhr2works", "Dhr2 Works"]]],
      [
        "the bare word ING, as the bank's name is",
        "ING Zorbix N.V.",
        [["ingzorbix", "ING Zorbix N.V"]],
      ],
      [
        "brackets whose first word begins like a post-nominal",
        "Acme (MBA Group)",
        [["acme", "Acme"]],
      ],
      ["brackets that hold LLM and a word", "Acme (LLM provider)", [["acme", "Acme"]]],
      ["brackets whose first word is RA and a word", "Acme (Ra Works)", [["acme", "Acme"]]],
      [
        "square brackets that hold a place",
        "Acme [Amsterdam]",
        [["acmeamsterdam", "Acme [Amsterdam]"]],
      ],
      [
        "square brackets whose first word begins like a title",
        "Acme [Drone]",
        [["acmedrone", "Acme [Drone]"]],
      ],
    ] as Array<[string, string, Array<[string, string]>]>)(
      "leaves alone %s",
      async (_name, cell, expected) => {
        expect(await providersOf(cell)).toEqual(expected);
      },
    );

    /** What fails closed: the markers are no exception, and a company that they stand beside is dropped as a person is. */
    it.each([
      ["a company with a post-nominal after it", "Acme B.V. MSc"],
      ["a company with a post-nominal in brackets", "Acme (RA)"],
      ["a company, a comma and a post-nominal", "Acme B.V., MBA"],
      ["a company with an honorific after other words", "Acme t.a.v. dhr. Jansen"],
    ])("fails closed for %s: no provider", async (_name, cell) => {
      expect(await providersOf(cell)).toEqual([]);
    });

    /**
     * A piece that is nothing but ing. or bc. is a title piece, and the piece before it is the person's
     * whatever it is: the trim of a piece takes its last full stop, so the title is looked for in
     * the piece as written too. A piece before it that no walk back would take (a legal form, two
     * capitalised words) is what shows that the title was seen.
     */
    it.each([
      ["a company and ing.", "Acme B.V., ing."],
      ["a company and bc.", "Acme B.V., bc."],
      ["a company and Ing. with a capital", "Acme B.V., Ing."],
      ["a company and BC. in capitals", "Acme B.V., BC."],
      ["two capitalised words and ing.", "Beta Works, ing."],
      ["two capitalised words and bc.", "Beta Works, bc."],
      ["a company and ing. with no blank after the comma", "Acme B.V.,ing."],
    ])(
      "takes the piece before a piece that is only a title with a full stop: %s",
      async (_name, cell) => {
        expect(await providersOf(cell)).toEqual([]);
      },
    );

    it("leaves the piece before such a title when another separator stands between them", async () => {
      expect(await providersOf("Acme B.V.; ing.")).toEqual(ACME_BV);
      expect(await providersOf("Acme B.V. / bc.")).toEqual(ACME_BV);
      expect(await providersOf("Acme B.V. en ing.")).toEqual(ACME_BV);
    });
  });

  describe("what a record counts", () => {
    it("counts a description once for each provider it names, and once for a provider that its cell names twice", async () => {
      const records = byId(
        await recordsOf(
          registerCsv([
            { provider: "Acme B.V., Acme" },
            { provider: "Acme, Beta Works" },
            { provider: "Beta Works" },
          ]),
        ),
      );
      expect(records.get("acme")?.identifiers.algorithms).toBe(2);
      expect(records.get("betaworks")?.identifiers.algorithms).toBe(2);
    });

    it("counts a body once for each org_id, and names the bodies by the number of their descriptions and then by text", async () => {
      const bodies: Array<[string, string, number]> = [
        ["Body C", "c1", 3],
        ["Body A", "a1", 1],
        ["Body B", "b1", 3],
      ];
      const descriptions = bodies.flatMap(([organization, orgId, count]) =>
        Array.from({ length: count }, () => ({ provider: "Acme", organization, orgId })),
      );
      const records = await recordsOf(registerCsv(descriptions));

      expect(records[0].identifiers).toMatchObject({
        algorithms: 7,
        bodies: 3,
        bodyNames: ["Body B", "Body C", "Body A"],
      });
      expect(records[0].summary).toContain(
        "7 algorithm descriptions from 3 public bodies name it (7 in use).",
      );
      expect(records[0].summary).toContain(
        "Published by Body B, Body C, Body A; newest published 2026-01-15.",
      );
    });

    it("names three bodies and counts the others", async () => {
      const descriptions = ["E", "D", "C", "B", "A"].map((letter) => ({
        provider: "Acme",
        organization: `Body ${letter}`,
        orgId: `b${letter}`,
      }));
      const records = await recordsOf(registerCsv(descriptions));
      expect(records[0].summary).toContain(
        "Published by Body A, Body B, Body C and 2 other public bodies; newest published 2026-01-15.",
      );
      expect(records[0].identifiers.bodies).toBe(5);
    });

    it("counts the bodies by org_id and not by name: two ids with one name are two bodies", async () => {
      const records = await recordsOf(
        registerCsv([
          { provider: "Acme", organization: "Same Name", orgId: "a1" },
          { provider: "Acme", organization: "Same Name", orgId: "a2" },
          { provider: "Acme", organization: "Same Name", orgId: "a2" },
        ]),
      );
      expect(records[0].identifiers).toMatchObject({
        algorithms: 3,
        bodies: 2,
        bodyNames: ["Same Name"],
      });
      expect(records[0].summary).toContain("3 algorithm descriptions from 2 public bodies");
      expect(records[0].summary).toContain("Published by Same Name and 1 other public body;");
    });

    it.each([
      [["b1"], "1 algorithm description from 1 public body names it"],
      [["b1", "b1"], "2 algorithm descriptions from 1 public body name it"],
      [["b1", "b2"], "2 algorithm descriptions from 2 public bodies name it"],
    ] as Array<[string[], string]>)(
      "writes the counts of the descriptions of the bodies %j in the number of their nouns and of the verb",
      async (orgIds, text) => {
        const records = await recordsOf(
          registerCsv(
            orgIds.map((orgId) => ({ provider: "Acme", organization: `Body ${orgId}`, orgId })),
          ),
        );
        expect(records[0].summary).toContain(text);
        expect(records[0].summary).not.toMatch(
          /\b1 (?:algorithm descriptions|public bodies|other public bodies)/,
        );
        expect(records[0].identifiers).toMatchObject({
          algorithms: orgIds.length,
          bodies: new Set(orgIds).size,
        });
      },
    );

    it.each([
      [4, "Published by Body A, Body B, Body C and 1 other public body; newest published"],
      [5, "Published by Body A, Body B, Body C and 2 other public bodies; newest published"],
    ])(
      "writes the bodies that are not named in the number of their noun: %s bodies",
      async (count, text) => {
        const descriptions = ["A", "B", "C", "D", "E"].slice(0, count).map((letter) => ({
          provider: "Acme",
          organization: `Body ${letter}`,
          orgId: `b${letter}`,
        }));
        const records = await recordsOf(registerCsv(descriptions));
        expect(records[0].summary).toContain(text);
        expect(records[0].summary).not.toMatch(/\b1 other public bodies/);
      },
    );

    it("counts the statuses, and leaves a status out of the text when no description is in it", async () => {
      const statuses = [...Array(4).fill(IN_USE), ...Array(2).fill(IN_DEVELOPMENT), OUT_OF_USE];
      const all = await recordsOf(
        registerCsv(statuses.map((status) => ({ provider: "Acme", status }))),
      );
      expect(all[0].summary).toContain(
        "7 algorithm descriptions from 1 public body name it (4 in use, 2 in development, 1 out of use).",
      );

      const some = [
        [[IN_USE, IN_USE], "(2 in use)"],
        [[OUT_OF_USE, OUT_OF_USE, OUT_OF_USE], "(3 out of use)"],
        [[IN_DEVELOPMENT, OUT_OF_USE], "(1 in development, 1 out of use)"],
        [[IN_USE, OUT_OF_USE], "(1 in use, 1 out of use)"],
      ] as const;
      for (const [list, text] of some) {
        const records = await recordsOf(
          registerCsv(list.map((status) => ({ provider: "Acme", status }))),
        );
        expect(records[0].summary).toContain(`name it ${text}.`);
      }
    });

    it("counts the descriptions that the publishing body itself labels a high-risk AI system, and says so only when there are some", async () => {
      const categories = [HIGH_RISK, HIGH_RISK, IMPACT, OTHER, "Hoog-risico AI-systeem "];
      const records = await recordsOf(
        registerCsv(categories.map((category) => ({ provider: "Acme", category }))),
      );
      expect(records[0].summary).toContain(
        "(5 in use); 3 labelled high-risk AI system by the publishing body itself.",
      );

      const none = await recordsOf(registerCsv([{ provider: "Acme", category: IMPACT }]));
      expect(none[0].summary).not.toContain("high-risk");
    });

    it("takes the newest publication day of the descriptions, whatever their order and their times", async () => {
      const stamps = [
        "2026-03-02 23:59:59.000000+00:00",
        "2026-03-03 00:00:01.000000+00:00",
        "2025-12-31 12:00:00.000000+00:00",
      ];
      for (const order of [stamps, [...stamps].reverse()]) {
        const parsed = await parsedOf(
          registerCsv(order.map((published) => ({ provider: "Acme", published }))),
        );
        expect(parsed.records[0].publishedAt).toBe("2026-03-03");
        expect(parsed.records[0].summary).toContain("newest published 2026-03-03.");
        expect(parsed.sourceVersion).toBe("2026-03-03");
      }
    });

    it("takes the version of the list from the newest of its records", async () => {
      const parsed = await parsedOf(
        registerCsv([
          { provider: "Acme", published: "2026-03-02 10:00:00+00:00" },
          { provider: "Beta Works", published: "2026-07-09 10:00:00+00:00" },
          { provider: "Gamma Works", published: "2025-01-01 10:00:00+00:00" },
        ]),
      );
      expect(parsed.sourceVersion).toBe("2026-07-09");
    });

    it("shows the most frequent spelling of a provider, and the first by text of equals; the others are names", async () => {
      const spellings = [
        "Acme B.V.",
        "Acme B.V.",
        "ACME BV",
        "Acme BV",
        "Acme Inc",
        "acme b.v.",
        "Acme Ltd",
        "Acme Corp",
      ];
      const records = await recordsOf(registerCsv(spellings.map((provider) => ({ provider }))));
      expect(records).toHaveLength(1);
      expect(providerOf(records[0])).toBe("Acme B.V");
      // Five names at most: the most frequent first, then in the order of their text.
      expect(records[0].matchKeys).toEqual([
        "name:acmebv",
        "name:acme",
        "name:acmecorp",
        "name:acmeinc",
      ]);

      const tie = await recordsOf(registerCsv([{ provider: "Acme" }, { provider: "ACME" }]));
      expect(providerOf(tie[0])).toBe("ACME");
    });

    it("gives every provider of a cell its own record, and a description of two providers counts for each", async () => {
      const records = byId(await recordsOf(registerCsv([{ provider: "Acme / Beta Works" }])));
      expect([...records.keys()]).toEqual(["acme", "betaworks"]);
      expect(records.get("acme")?.identifiers.algorithms).toBe(1);
      expect(records.get("betaworks")?.identifiers.algorithms).toBe(1);
    });
  });

  // An identifier is never a cut text. The names of the bodies in the
  // identifiers were each cut at 40 units, with the marker, so a name of more than that was written
  // there as its front and the word "shortened". They are the whole names now, as the cell holds them
  // (at most 80 units: a body whose name is longer is no row to read), and only the sentence of the
  // text keeps the 40-unit form.
  describe("the names of the bodies in the identifiers are whole names", () => {
    const ASTRAL = cp(0x20000);
    const SHOWN_MAX = 40;
    const bodyOfName = async (organization: string) =>
      (await recordsOf(registerCsv([{ provider: "Acme", organization, orgId: "gm0007" }])))[0];

    /** Names of more than 40 units: the old cut kept 28 of them, and the cut fell in a word, after a blank, or between a pair. */
    const NAMES: Array<[string, string]> = [
      [
        "a name over the old cut, which the cut left in a word",
        "Regionale Uitvoeringsorganisatie Voorbeeldland",
      ],
      ["a name with a blank at the old cut", "Gemeenschappelijke Regeling Voorbeeldstreek"],
      [
        "a name with a surrogate pair at the old cut",
        `Gemeenschappelijke Regeling${ASTRAL} Voorbeeldstreek`,
      ],
      ["a name of 80 units, the longest that a cell may hold", `Organisatie ${"x".repeat(68)}`],
    ];

    it.each(NAMES)("writes %s whole into the identifiers", async (_name, organization) => {
      const record = await bodyOfName(organization);
      expect(record.identifiers.bodyNames).toEqual([organization]);
      expect(String((record.identifiers.bodyNames as string[])[0]).endsWith("[shortened]")).toBe(
        false,
      );
    });

    it.each(NAMES.slice(0, 3))(
      "keeps the 40-unit form of %s in the sentence of the text, and only there",
      async (_name, organization) => {
        const { summary } = await bodyOfName(organization);
        const form = lineOf(organization, SHOWN_MAX);
        expect(form.endsWith(" [shortened]")).toBe(true);
        expect(form.length).toBeLessThanOrEqual(SHOWN_MAX);
        expect(summary).toContain(`Published by ${form}; newest published`);
        expect(summary).not.toContain(organization);
      },
    );

    it("keeps two names that share their first 28 units as two names, and not as the same cut text twice", async () => {
      const records = await recordsOf(
        registerCsv([
          {
            provider: "Acme",
            organization: "Gemeenschappelijke Regeling Voorbeeldstreek Zuid",
            orgId: "gr01",
          },
          {
            provider: "Acme",
            organization: "Gemeenschappelijke Regeling Voorbeeldstreek Noord",
            orgId: "gr02",
          },
        ]),
      );
      expect(records[0].identifiers.bodyNames).toEqual([
        "Gemeenschappelijke Regeling Voorbeeldstreek Noord",
        "Gemeenschappelijke Regeling Voorbeeldstreek Zuid",
      ]);
    });

    it("refuses a body whose name is longer than its cell may be: the row cannot be read, and no name is cut", async () => {
      const body = await bodyOf(
        registerCsv([
          ...SAMPLE,
          {
            provider: "Gamma Works",
            organization: `Organisatie ${"x".repeat(69)}`,
            orgId: "gm0098",
          },
        ]),
      );
      expect(body.unreadable).toBe(1);
      expect(body.rows.map((row) => row.id)).toEqual(["acme"]);
    });

    it("never writes an angle bracket of a name into the identifiers or the stored row: the quotation marks of the kit stand for them", async () => {
      const csv = registerCsv([
        { provider: "Acme", organization: "<b>Gemeente</b> Voorbeeld", orgId: "gm0007" },
      ]);
      expect(JSON.stringify(await bodyOf(csv))).not.toMatch(/[<>]/);
      const record = await bodyOfName("<b>Gemeente</b> Voorbeeld");
      expect(record.identifiers.bodyNames).toEqual([
        `${cp(0x2039)}b${cp(0x203a)}Gemeente${cp(0x2039)}/b${cp(0x203a)} Voorbeeld`,
      ]);
    });

    it("keeps the names of the bodies of a provider within what the identifiers may hold: as many as fit, each whole", async () => {
      // 60 bodies, each of 80 units: 83 characters of JSON each, and 1,500 are left for them.
      const descriptions: Description[] = Array.from({ length: 60 }, (_, index) => ({
        provider: "Acme Works",
        organization: `Organisatie ${providerName(index)} ${"x".repeat(59)}`,
        orgId: `gm${index}`,
      }));
      const records = await recordsOf(registerCsv(descriptions));
      const names = records[0].identifiers.bodyNames as string[];
      expect(names).toHaveLength(18);
      for (const name of names) {
        expect(name).toHaveLength(80);
        expect(name.endsWith("[shortened]")).toBe(false);
      }
      expect(JSON.stringify(records[0].identifiers).length).toBeLessThanOrEqual(2000);
      expect(records[0].identifiers.bodies).toBe(60);
    });

    // A quote and a backslash take two characters of JSON each, so fewer of the whole names fit
    // (9 of 155 characters, not 18 of 83); the record stays readable and no name is cut for it.
    it.each([
      ["quotes", '"'],
      ["backslashes", cp(0x5c)],
      ["both", `"${cp(0x5c)}`],
    ])(
      "names fewer of the bodies whose whole names of 80 units are mostly %s, and keeps the record readable",
      async (_kind, unit) => {
        const descriptions: Description[] = Array.from({ length: 60 }, (_, index) => ({
          provider: "Acme Works",
          organization: `${unit.repeat(80).slice(0, 72)}${providerName(index)}`,
          orgId: `gm${index}`,
        }));
        const csv = registerCsv(descriptions);
        const records = await recordsOf(csv);

        expect(records).toHaveLength(1);
        const names = records[0].identifiers.bodyNames as string[];
        expect(names).toHaveLength(9);
        for (const name of names) {
          expect(name).toHaveLength(80);
          expect(name.endsWith("[shortened]")).toBe(false);
        }
        expect(JSON.stringify(records[0].identifiers).length).toBeLessThanOrEqual(2000);
        expect(records[0].identifiers.bodies).toBe(60);
        expect((await bodyOf(csv)).unreadable).toBe(0);
      },
    );
  });

  describe("the record", () => {
    it("has an address of its own for each provider: the register's search for the provider, as written", async () => {
      const records = await recordsOf(
        registerCsv([
          { provider: "Acme B.V., Beta Works, Zoë Works" },
          { provider: "Gamma & Sons Works" },
        ]),
      );
      expect(records.length).toBeGreaterThan(2);
      const urls = records.map((record) => record.url);
      expect(new Set(urls).size).toBe(urls.length);
      for (const record of records) {
        expect(record.url).toBe(`${RECORD_URL_PREFIX}${encodeURIComponent(providerOf(record))}`);
      }
      expect(urls).toContain(`${RECORD_URL_PREFIX}Zo%C3%AB%20Works`);
      expect(urls).toContain(`${RECORD_URL_PREFIX}Gamma%20%26%20Sons%20Works`);
    });

    it("is dated by its newest description, for its order only, and not updated", async () => {
      const parsed = await parsedOf(registerCsv(SAMPLE));
      expect(parsed.records[0].publishedAt).toBe("2026-05-20");
      expect(parsed.records[0].sourceUpdatedAt).toBeNull();
    });

    it("says what it is not in its second sentence, and ends with the source sentence, which is never cut", async () => {
      const records = await recordsOf(registerCsv(SAMPLE));
      expect(records[0].summary.startsWith(`${FIRST_SENTENCE} ${NOT_A_FINDING} `)).toBe(true);
      expect(records[0].summary.endsWith(SOURCE_SENTENCE)).toBe(true);
    });

    it("stays within 1,300 characters in the worst case that its caps allow, and keeps its second and its last sentence", async () => {
      // A provider of 60 characters, named by 400 descriptions of 400 bodies whose names are 80 long.
      const display = `A${"b".repeat(59)}`;
      const descriptions: Description[] = Array.from({ length: 400 }, (_, index) => ({
        provider: display,
        organization: `Organisatie ${providerName(index)} ${"x".repeat(59)}`,
        orgId: `org${index}`,
        status: [IN_USE, IN_DEVELOPMENT, OUT_OF_USE][index % 3],
        category: index % 4 === 0 ? HIGH_RISK : OTHER,
        published: "2026-11-09 15:37:14.123456+00:00",
      }));
      const records = await recordsOf(registerCsv(descriptions));

      expect(records).toHaveLength(1);
      const { summary, identifiers } = records[0];
      expect(summary.length).toBeLessThanOrEqual(1300);
      expect(summary).toContain(NOT_A_FINDING);
      expect(summary.endsWith(SOURCE_SENTENCE)).toBe(true);
      expect(summary).toContain("400 algorithm descriptions from 400 public bodies");
      expect(summary).toContain("and 397 other public bodies; newest published 2026-11-09.");
      // The names are whole, 83 characters of JSON each, and 1,500 are left for them: 18 fit.
      expect((identifiers.bodyNames as string[]).length).toBe(18);
      for (const name of identifiers.bodyNames as string[]) {
        expect(name).toHaveLength(80);
        expect(name.endsWith("[shortened]")).toBe(false);
      }
      expect(JSON.stringify(identifiers).length).toBeLessThanOrEqual(2000);
      expectWellFormedRecords(records, { sourceId: "nl_algoritmeregister", mark: MARK });
    });

    it("names 30 of the 78 bodies of a provider in its identifiers, and they stay within 2,000 characters", async () => {
      const descriptions: Description[] = Array.from({ length: 78 }, (_, index) => ({
        provider: "Acme Local Government",
        organization: `Gemeente ${providerName(index)}`,
        orgId: `gm${String(index).padStart(4, "0")}`,
      }));
      const records = await recordsOf(registerCsv(descriptions));

      expect(records).toHaveLength(1);
      const { identifiers, summary } = records[0];
      expect(identifiers.bodies).toBe(78);
      expect((identifiers.bodyNames as string[]).length).toBe(30);
      expect(JSON.stringify(identifiers).length).toBeLessThan(2000);
      expect(summary).toContain("and 75 other public bodies;");
      expectWellFormedRecords(records, { sourceId: "nl_algoritmeregister", mark: MARK });
    });

    it("keeps the identifiers within 2,000 characters for bodies whose names are all quotes, by naming fewer of them", async () => {
      // Each name is 38 characters, 34 of them quotes: 75 characters of JSON each, 2,250 for 30.
      const descriptions: Description[] = Array.from({ length: 60 }, (_, index) => ({
        provider: "Acme Works",
        organization: `${'"'.repeat(34)}${providerName(index).slice(4)}`,
        orgId: `gm${index}`,
      }));
      const records = await recordsOf(registerCsv(descriptions));

      expect(records).toHaveLength(1);
      const names = records[0].identifiers.bodyNames as string[];
      expect(names.length).toBeGreaterThan(10);
      expect(names.length).toBeLessThan(30);
      expect(JSON.stringify(records[0].identifiers).length).toBeLessThanOrEqual(2000);
      expect(records[0].identifiers.bodies).toBe(60);
    });

    it("is the unit of the register: a provider that 120 descriptions name is one record", async () => {
      const records = await recordsOf(
        registerCsv(
          Array.from({ length: 120 }, (_, index) => ({
            provider: "Acme Cloud",
            orgId: `gm${index % 7}`,
            organization: `Gemeente ${index % 7}`,
          })),
        ),
      );
      expect(records).toHaveLength(1);
      expect(records[0].identifiers.algorithms).toBe(120);
      expect(records[0].identifiers.bodies).toBe(7);
    });

    it("gives the name keys of its spellings and nothing else: no domain, whatever the cell held", async () => {
      const records = await recordsOf(
        registerCsv([
          { provider: "Acme (www.acme.example)" },
          { provider: "https://acme.example" },
        ]),
      );
      expect(records.map((record) => record.matchKeys)).toEqual([["name:acme"]]);
    });
  });

  describe("what the file holds that no record may", () => {
    it("never lets the contact address, a prose column, a url column or any other column that is not read reach the body or a record", async () => {
      const csv = registerCsv(SAMPLE);
      expect(csv).toContain(CONTACT_CANARY);
      expect(csv).toContain(`${CANARY}goal`);
      const snapshot = await download(csv);
      const parsed = nlAlgoritmeregisterConnector.parse(snapshot);
      const everything = JSON.stringify([snapshot, parsed]);
      expect(everything).not.toContain(CANARY);
      expect(everything).not.toContain("example.test");
      for (const name of COLUMNS) expect(everything).not.toContain(`${CANARY}${name}`);
    });

    it("never lets the name of an algorithm, a website, a contact or a date column through", async () => {
      const everything = JSON.stringify(await recordsOf(registerCsv(SAMPLE)));
      for (const name of [
        "name",
        "website",
        "contact_email",
        "begin_date",
        "end_date",
        "source_id",
        "tags",
        "url",
      ]) {
        expect(everything).not.toContain(`${CANARY}${name}`);
      }
    });

    it("keeps no algorithm id in a body or a record: they are only counted", async () => {
      const csv = registerCsv([{ provider: "Acme", id: "87654321" }]);
      const everything = JSON.stringify([await download(csv), await recordsOf(csv)]);
      expect(everything).not.toContain("87654321");
    });
  });

  describe("hostile cells", () => {
    it("keeps no control character, hidden character or angle bracket in a record, whatever the cells hold", async () => {
      const hostile = [
        `Acme${cp(0x7, 0x0, 0x1b)} Works`,
        `${RIGHT_TO_LEFT_OVERRIDE}Evil${cp(0x202c)} Works`,
        "<script>alert(1)</script> Script Works",
        `Full${cp(0xff1c)}width${cp(0xff1e)} Works`,
        `Zero${ZERO_WIDTH_SPACE}Width${cp(0x2800)}Works`,
        "<b>Bold</b> Tags",
      ];
      const descriptions: Description[] = hostile.map((provider, index) => ({
        provider,
        organization: `<i>Body</i> ${cp(0x202e)}${index}`,
        orgId: `gm${index}`,
      }));
      const records = await recordsOf(registerCsv(descriptions));

      expect(records.length).toBeGreaterThan(0);
      expectWellFormedRecords(records, { sourceId: "nl_algoritmeregister", mark: MARK });
      for (const record of records) expect(JSON.stringify(record)).not.toMatch(/[<>]/);
    });

    it("reads a cell of 100 KB in little time, and keeps a bounded record", async () => {
      const big = `${"Acme, ".repeat(17_000)}Zulu Works`;
      expect(big.length).toBeGreaterThan(100_000);
      const row = descriptionRow({
        provider: big,
        organization: "y".repeat(100_000),
        orgId: "z".repeat(100_000),
      });
      row[columnOf("goal")] = "g".repeat(100_000);
      const own = descriptionRow({ provider: "Acme Works" }, 1);
      own[columnOf("risks")] = "r".repeat(100_000);
      const started = Date.now();
      const records = await recordsOf(
        csvOf([row, own, ...Array.from({ length: PADDED }, (_, i) => leanRow(i))]),
      );
      expect(Date.now() - started).toBeLessThan(10_000);
      // The first cell is a sentence of 100 KB: no provider. The second row names one.
      expect(records.map((record) => record.sourceRecordId)).toEqual(["acmeworks"]);
      expectWellFormedRecords(records, { sourceId: "nl_algoritmeregister", mark: MARK });
      expect(records[0].summary.length).toBeLessThanOrEqual(1300);
    });

    it("reads bytes that are no valid UTF-8, which no string can hold as a lone surrogate, without failing", async () => {
      const head = Buffer.from(registerCsv([{ provider: "Acme @@ Works" }]));
      const at = head.indexOf("@@");
      const csv = Buffer.concat([
        head.subarray(0, at),
        Buffer.from([0xed, 0xa0, 0x80, 0xff, 0xfe]),
        head.subarray(at + 2),
      ]);
      const records = await recordsOf(csv);
      expect(records.length).toBeGreaterThan(0);
      expectWellFormedRecords(records, { sourceId: "nl_algoritmeregister", mark: MARK });
    });

    it("takes cells of the longest that a name may be, made of separators, brackets or addresses, in little time", async () => {
      const cells = [
        "(".repeat(60),
        ")".repeat(60),
        ",".repeat(60),
        ";".repeat(60),
        "/".repeat(60),
        "a/".repeat(30),
        " en ".repeat(15),
        "Acme (".repeat(10),
        "www.".repeat(15),
        "https://".repeat(7),
        "Prof. ".repeat(10),
        "Dr.Dr.Dr.Dr.Dr.Dr.Dr.Dr.Dr.Dr.Dr.Dr.Dr.Dr.Dr.",
        "dr ".repeat(20),
        " Mr".repeat(20),
        "ing. ".repeat(12),
        "Prof".repeat(15),
        "Drs. ".repeat(12),
        `${cp(0x0301)}Ir`.repeat(20),
        cp(0x301).repeat(60),
        ". ".repeat(30),
        "- ".repeat(30),
        // Titles in brackets and after commas, in runs.
        "(dr.".repeat(15),
        "dr.,".repeat(15),
        "a,dr.".repeat(12),
        "(a)dr.".repeat(10),
        "( dr.)".repeat(10),
        "(Prof.)".repeat(8),
        ", (Prof.)".repeat(6),
        "Voorbeeld, dr. ".repeat(4),
        "J. (Prof.), ".repeat(5),
        `${cp(0)}(dr.)`.repeat(12),
        // The honorifics, bc., the post-nominals and the square brackets, in runs, and title pieces
        // after initials or after many pieces (the walk back goes over every piece before them).
        "dhr. ".repeat(12),
        "mevrouw ".repeat(8),
        "Bc. ".repeat(15),
        "[dr.] ".repeat(10),
        "[".repeat(60),
        "[ dr. ".repeat(10),
        "MSc, ".repeat(12),
        "Jan MSc ".repeat(7),
        "M.Sc. ".repeat(10),
        "a MSc ".repeat(10),
        "R.A. ".repeat(12),
        "ph.d,".repeat(12),
        "(MSc)".repeat(12),
        "[MSc]".repeat(12),
        `${cp(0x301)}MSc `.repeat(12),
        "J., ".repeat(15),
        `${"J. P., ".repeat(8)}dr.`,
        `${"Ab, ".repeat(14)}dr.`,
        `${"A, ".repeat(19)}dr.`,
        "J.P.".repeat(15),
        "A. ".repeat(20),
      ];
      const csv = csvOf(
        Array.from({ length: PADDED }, (_, index) => leanRow(index, cells[index % cells.length])),
      );
      const started = Date.now();
      await recordsOf(csv);
      expect(Date.now() - started).toBeLessThan(10_000);
    });
  });

  describe("rows that cannot be records", () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: "acme",
      display: "Acme B.V",
      names: ["Acme B.V"],
      algorithms: 1,
      bodies: 1,
      bodyNames: ["Gemeente Voorbeeldstad"],
      status: { inUse: 1, inDevelopment: 0, outOfUse: 0 },
      highRisk: 0,
      newestPublished: "2026-01-15",
      ...over,
    });
    const snapshotOfRows = (rows: unknown[]): Snapshot => {
      const body = JSON.stringify({ v: 1, rows, total: rows.length, unreadable: 0 });
      return { bodies: [body], etag: null, lastModified: null, bytes: body.length };
    };

    it("makes a record of a row of the shape that the reader makes", () => {
      const parsed = nlAlgoritmeregisterConnector.parse(snapshotOfRows([row()]));
      expect(parsed.records).toHaveLength(1);
      expect(parsed.errors).toBe(0);
    });

    it("takes a body name of 80 characters, the longest that a cell may hold, whole, and writes its 40-unit form in the text", () => {
      const name = `Organisatie ${"x".repeat(68)}`;
      expect(name).toHaveLength(80);
      const parsed = nlAlgoritmeregisterConnector.parse(
        snapshotOfRows([row({ bodyNames: [name] })]),
      );
      expect(parsed.records).toHaveLength(1);
      expect(parsed.records[0].identifiers.bodyNames).toEqual([name]);
      expect(parsed.records[0].summary).toContain(`Published by ${lineOf(name, 40)};`);
    });

    it("counts a row whose id cannot be one as skipped, within the allowance, and keeps the others", () => {
      const rows = [
        ...Array.from({ length: 19 }, (_, index) => row({ id: `acme${index}` })),
        row({ id: "" }),
      ];
      const parsed = nlAlgoritmeregisterConnector.parse(snapshotOfRows(rows));
      expect(parsed.records).toHaveLength(19);
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
    });

    it.each([
      ["a display that is no text", { display: 7 }],
      ["a display of more than 80 characters", { display: "x".repeat(81) }],
      ["a display that no address can hold: a lone surrogate", { display: cp(0xd800) }],
      ["names that are no list", { names: "Acme" }],
      ["no name", { names: [] }],
      ["six names", { names: ["a", "b", "c", "d", "e", "f"] }],
      ["a name of more than 60 characters", { names: ["x".repeat(61)] }],
      ["a use count of zero", { algorithms: 0 }],
      ["a count that is no number", { algorithms: "3" }],
      ["a count that is a fraction", { algorithms: 1.5 }],
      ["a body count of zero", { bodies: 0 }],
      ["more bodies than descriptions", { bodies: 2 }],
      ["bodies that are no list", { bodyNames: "Gemeente" }],
      ["no body name", { bodyNames: [] }],
      [
        "31 body names",
        {
          bodies: 31,
          algorithms: 31,
          status: { inUse: 31, inDevelopment: 0, outOfUse: 0 },
          bodyNames: Array.from({ length: 31 }, (_, i) => `Body ${i}`),
        },
      ],
      ["a body name of 81 characters", { bodyNames: ["x".repeat(81)] }],
      ["a body name that is no text", { bodyNames: [3] }],
      ["statuses that are none", { status: null }],
      ["a status count that is negative", { status: { inUse: 2, inDevelopment: -1, outOfUse: 0 } }],
      [
        "statuses that do not add up to the descriptions",
        { algorithms: 3, bodies: 1, status: { inUse: 1, inDevelopment: 0, outOfUse: 0 } },
      ],
      [
        "statuses that add up to more than the descriptions",
        { status: { inUse: 1, inDevelopment: 1, outOfUse: 0 } },
      ],
      ["a status count that is missing", { status: { inUse: 1, inDevelopment: 0 } }],
      ["a high-risk count that is no number", { highRisk: "0" }],
      ["more high-risk descriptions than descriptions", { highRisk: 2 }],
      ["a day that is no text", { newestPublished: 20260115 }],
      ["a day that does not exist", { newestPublished: "2026-02-30" }],
      ["a day with a time", { newestPublished: "2026-01-15 10:00:00" }],
    ])("counts a row with %s as one that cannot be read", (_name, over) => {
      const rows = [
        ...Array.from({ length: 19 }, (_, index) => row({ id: `acme${index}` })),
        row({ id: "acme", ...over }),
      ];
      const parsed = nlAlgoritmeregisterConnector.parse(snapshotOfRows(rows));
      expect(parsed.records).toHaveLength(19);
      expect(parsed.skipped).toBe(1);
    });

    it("fails the list when more rows than the allowance cannot be read", () => {
      const parsed = nlAlgoritmeregisterConnector.parse(
        snapshotOfRows(Array.from({ length: 12 }, () => row({ id: "" }))),
      );
      expect(parsed.records).toHaveLength(0);
      expect(parsed.errors).toBe(12);
    });

    it("has no root for a body that its own download did not make", () => {
      const parsed = nlAlgoritmeregisterConnector.parse({
        bodies: ["not a body"],
        etag: null,
        lastModified: null,
        bytes: 0,
      });
      expect(parsed.root).toBeNull();
      expect(parsed.errors).toBeGreaterThan(0);
    });

    it("counts a row that is no object as one that cannot be read, and takes no version from it", () => {
      const rows = [
        ...Array.from({ length: 40 }, (_, index) => row({ id: `acme${index}` })),
        null,
        5,
        "text",
        [],
      ];
      const parsed = nlAlgoritmeregisterConnector.parse(snapshotOfRows(rows));
      expect(parsed.records).toHaveLength(40);
      expect(parsed.skipped).toBe(4);
      expect(parsed.sourceVersion).toBe("2026-01-15");
    });

    it("gives no version for a body of rows that hold no day", () => {
      const parsed = nlAlgoritmeregisterConnector.parse(
        snapshotOfRows([row({ newestPublished: 7 })]),
      );
      expect(parsed.sourceVersion).toBeNull();
    });
  });

  describe("what it never does", () => {
    it("writes nothing to the logger or the console, whatever it reads and whatever fails", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
      );
      try {
        const snapshot = await download(registerCsv(SAMPLE));
        nlAlgoritmeregisterConnector.parse(snapshot);
        await failureOf(nlAlgoritmeregisterConnector.download(fakeFetch({}), {}));
        await failureOf(
          downloadOf("not a list\n", { url: "https://evil.example.test/x?token=SECRET" }),
        );
        for (const spy of spies) expect(spy).not.toHaveBeenCalled();
        for (const method of ["info", "warn", "error", "debug"] as const) {
          expect(logger[method]).not.toHaveBeenCalled();
        }
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });
  });
});
