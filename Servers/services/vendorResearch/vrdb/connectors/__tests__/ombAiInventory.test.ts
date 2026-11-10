/**
 * The US federal AI use case inventory (connectors/ombAiInventory.ts): the 2025 edition of the
 * federal agencies' AI use cases, compiled by the Office of Management and Budget, read as a CSV of
 * 3,611 use cases (36 columns) and grouped into one record per vendor that a use case names in its
 * free-text `vendor_name`. One file, one conditional GET, the host and path pinned. No network: a
 * fake fetch and synthetic files; every agency, vendor and cell below is invented.
 */
import logger from "../../../../../utils/logger/fileLogger";
import { FetchError } from "../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../types";
import { LINE_INPUT_MAX, SHORTENED, lineOf, unreadableAllowed } from "../kit/clean";
import { OMB_AI_INVENTORY_RECORD_MARK, ombAiInventoryConnector } from "../ombAiInventory";
import { BodyTooLargeError, type ConnectorFetch, NotTheListError, type Snapshot } from "../types";
import {
  type FakeFile,
  expectDeterministic,
  expectWellFormedRecords,
  fakeFetch,
} from "./helpers/kitContract";

jest.setTimeout(30_000);

jest.mock("../../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const MARK = OMB_AI_INVENTORY_RECORD_MARK;

/** Characters that a file can hide in a cell, built at run time (an escape would not survive the editor). */
const cp = (...codes: number[]): string => String.fromCodePoint(...codes);
const ZERO_WIDTH_SPACE = cp(0x200b);
const NO_BREAK_SPACE = cp(0xa0);
const RIGHT_TO_LEFT_OVERRIDE = cp(0x202e);
const BYTE_ORDER_MARK = cp(0xfeff);

const REPOSITORY = "2025-Federal-Agency-AI-Use-Case-Inventory";
const FILE_URL = `https://raw.githubusercontent.com/ombegov/${REPOSITORY}/main/Data/2025_individually_reported_AI_use_cases.csv`;
const DOCUMENTATION_URL = `https://github.com/ombegov/${REPOSITORY}`;
const RECORD_URL_PREFIX = `${DOCUMENTATION_URL}?vendor=`;
/** The server's own validator of its full answer: a weak one, as GitHub sends it for a compressed file. */
const ETAG = 'W/"0000synthetic0000"';
const LAST_MODIFIED = "Sat, 14 Mar 2026 09:26:53 GMT";
const CANARY = "ZZ-";
const CONTACT_CANARY = `${CANARY}person@example.test`;

// --- the file: 36 columns, the four used ones filled, every other one a canary ---

const COLUMNS = [
  "agency",
  "agency_name",
  "id",
  "use_case_name",
  "agency_bureau",
  "contact_email",
  "is_withheld",
  "development_stage",
  "is_high_impact",
  "HI_justification",
  "topic_area",
  "classification",
  "problem_solved",
  "benefits",
  "system_outputs",
  "operational_date",
  "contracting_usage",
  "vendor_name",
  "have_ato",
  "system_name_ato",
  "data_description",
  "link_to_data",
  "has_pii",
  "pia_url",
  "demographic_features",
  "has_custom_code",
  "code_url",
  "hi_testing_conducted",
  "hi_assessment_completed",
  "hi_potential_impacts",
  "hi_independent_review",
  "hi_ongoing_monitoring",
  "hi_training_established",
  "hi_failsafe_presence",
  "hi_appeal_process",
  "hi_public_consultation",
];

/** The columns that the connector reads; a file that lacks one is not the list. */
const USED_COLUMNS = ["agency", "vendor_name", "development_stage", "is_high_impact"];

const columnOf = (name: string): number => COLUMNS.indexOf(name);

interface UseCase {
  agency?: string;
  vendor?: string;
  stage?: string;
  impact?: string;
}

/** A use case with a canary in every column that is not read, and a contact address in its own. */
function useCaseRow(useCase: UseCase = {}): string[] {
  const cells = COLUMNS.map((name) => `${CANARY}${name}`);
  cells[columnOf("contact_email")] = CONTACT_CANARY;
  cells[columnOf("agency")] = useCase.agency ?? "AAA";
  cells[columnOf("vendor_name")] = useCase.vendor ?? "";
  cells[columnOf("development_stage")] = useCase.stage ?? "Deployed";
  cells[columnOf("is_high_impact")] = useCase.impact ?? "Not High-impact";
  return cells;
}

/** A use case that names no vendor, as 78 % of the file's do; short, so that thousands of them are cheap. */
function leanRow(agency = "AAA"): string[] {
  const cells = COLUMNS.map(() => "");
  cells[columnOf("agency")] = agency;
  cells[columnOf("development_stage")] = "Deployed";
  cells[columnOf("is_high_impact")] = "Not High-impact";
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

/** The floor of the reader is 2,500 rows: a file made of a few use cases is padded with lean ones. */
const PADDED = 2500;

function inventoryCsv(useCases: readonly UseCase[], options: CsvOptions & { pad?: number } = {}) {
  const { pad = PADDED, ...csv } = options;
  const rows = useCases.map(useCaseRow);
  const lean = leanRow();
  return csvOf(
    [...rows, ...Array.from({ length: Math.max(0, pad - rows.length) }, () => lean)],
    csv,
  );
}

// --- running the connector ---

function filesOf(csv: string | Buffer, file: Partial<FakeFile> = {}): Record<string, FakeFile> {
  return {
    [FILE_URL]: { body: csv, contentType: "text/plain; charset=utf-8", etag: ETAG, ...file },
  };
}

const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

const downloadOf = (csv: string | Buffer, file: Partial<FakeFile> = {}) =>
  ombAiInventoryConnector.download(fakeFetch(filesOf(csv, file)), {});

async function download(csv: string | Buffer, file: Partial<FakeFile> = {}): Promise<Snapshot> {
  const answer = await downloadOf(csv, file);
  if (answer === "unchanged") throw new Error("The fake fetch answered unchanged.");
  return answer;
}

const parsedOf = async (csv: string | Buffer) => ombAiInventoryConnector.parse(await download(csv));
const recordsOf = async (csv: string | Buffer) => (await parsedOf(csv)).records;

const byId = (records: readonly ParsedRecord[]): Map<string, ParsedRecord> =>
  new Map(records.map((record) => [record.sourceRecordId, record]));

const vendorOf = (record: ParsedRecord): string => String(record.identifiers.vendor);

/** The vendors that a `vendor_name` cell gives: id and display, in the order of the ids. */
async function vendorsOf(cell: string): Promise<Array<[string, string]>> {
  const records = await recordsOf(inventoryCsv([{ vendor: cell }]));
  return records.map((record): [string, string] => [record.sourceRecordId, vendorOf(record)]);
}

/** A name of ten letters that is nobody's placeholder and has no digit: `n` makes it distinct. */
function vendorName(n: number): string {
  const letters = Array.from({ length: 4 }, (_, at) =>
    String.fromCharCode(97 + (Math.floor(n / 26 ** at) % 26)),
  );
  return `Zeta${letters.reverse().join("")}`;
}

// --- texts that are cut where a cut is hard to see ---

const GRINNING_FACE = cp(0x1f600);

/** The two places where the cut of `lineOf` leaves a line shorter than its cap. */
const SHORT_CUTS: Array<[string, "blank" | "pair"]> = [
  ["a blank, which the cut takes off", "blank"],
  ["a pair of surrogates, which the cut does not split", "pair"],
];

/** The longest vendor cell that the connector reads whole, as the connector has it. */
const VENDOR_CELL_CAP = 400;

/**
 * A lead of whole names, `Acme` and `Abcde` as often as it takes, each followed by `separator`, of
 * exactly `units` units: the names that stay when the last name of a cell that was cut goes. (An
 * `Abcde` item is one unit longer than an `Acme` one, so a mix of them makes any length from a few
 * dozen units up.) Its ids are `abcde` and `acme`.
 */
function leadOf(units: number, separator: string): string {
  const acme = `Acme${separator}`;
  const abcde = `Abcde${separator}`;
  for (let items = 2; items * acme.length <= units; items += 1) {
    const longer = units - items * acme.length;
    if (longer >= 1 && longer < items) {
      return `${acme.repeat(items - longer)}${abcde.repeat(longer)}`;
    }
  }
  throw new Error(`There is no lead of ${units} units.`);
}

/**
 * A vendor cell that `lineOf` cuts at `cutAt` into a line SHORTER than `cutAt`, with the front of a
 * name at its end: a lead of whole names joined by `; `, then `Quill Laboratories` and the place where
 * the cut falls. The cut keeps `cutAt - 12` units. With `blank` the last of them is the blank after
 * `Laboratories`, which the cut takes off; with `pair` a pair of surrogates stands across the cut, and
 * the cut does not split it. Either way the cut line is `cutAt - 1` units, so a test of its length
 * alone takes it for a whole cell, and its last name is `Quill Laboratories`. A `cutAt` of the cap
 * is the cut that the connector makes; one of the cap and a unit is the cut of a test that asks for
 * a unit more than the cap and compares the length of the line with the cap.
 */
function cutShortCell(cutAt: number, where: "blank" | "pair"): string {
  const joint = where === "blank" ? " " : GRINNING_FACE;
  const lead = leadOf(cutAt - SHORTENED.length - "Quill Laboratories".length - 1, "; ");
  return `${lead}Quill Laboratories${joint}International Holdings Worldwide`;
}

/**
 * A vendor cell that `lineOf` cuts at the cap right after `ending`, the front of its last name
 * `whole`: a lead of whole names joined by `separator`, then `whole`, then one more name, so that the
 * cell is over the cap whatever the ending is. The cut keeps `cap - 12` units, and a blank at the end
 * of them is taken off the line.
 */
function cellCutAfter(ending: string, whole: string, separator = "; "): string {
  const lead = leadOf(VENDOR_CELL_CAP - SHORTENED.length - ending.length, separator);
  return `${lead}${whole}${separator}Zorbix Quill`;
}

/** The text that the cut of `lineOf` keeps of a vendor cell of the cap, before its marker. */
const keptOf = (cell: string): string => lineOf(cell, VENDOR_CELL_CAP).slice(0, -SHORTENED.length);

beforeEach(() => {
  jest.clearAllMocks();
});

// --- the sample record: one vendor, three use cases of two agencies ---

const SAMPLE_USE_CASES: UseCase[] = [
  { agency: "AAA", vendor: "Acme Inc", stage: "Deployed", impact: "High-impact" },
  { agency: "AAA", vendor: "Acme Inc", stage: "Pilot", impact: "Not High-impact" },
  { agency: "BBB", vendor: "Acme Inc", stage: "Pre-deployment", impact: "" },
];

const FIRST_SENTENCE =
  "US federal AI use case inventory (github.com/ombegov), a register or status list.";
const NOT_A_FINDING =
  "A record is US federal agencies' own report, compiled by the Office of Management and Budget, " +
  "that a vendor was involved in developing or maintaining AI use cases they list; it says " +
  "nothing about the vendor's conduct or the systems' quality.";
const SOURCE_SENTENCE =
  "Source: US Office of Management and Budget, 2025 Federal Agency AI Use Case Inventory; " +
  "entries adapted by VerifyWise.";

const SAMPLE_SUMMARY = [
  FIRST_SENTENCE,
  NOT_A_FINDING,
  "Vendor as written: Acme Inc.",
  "2025 edition: 3 use cases from 2 agencies name it (2 deployed or piloted, 1 before deployment); " +
    "1 of them high-impact by the agency's own label.",
  "Agencies: AAA, BBB.",
  SOURCE_SENTENCE,
].join(" ");

describe("ombAiInventoryConnector", () => {
  describe("what it is", () => {
    it("is the connector of omb_ai_inventory, a snapshot connector at version 1", () => {
      expect(ombAiInventoryConnector.id).toBe("omb_ai_inventory");
      expect(ombAiInventoryConnector.version).toBe(1);
      expect(ombAiInventoryConnector.kind).toBeUndefined();
      expect(typeof ombAiInventoryConnector.download).toBe("function");
      expect(typeof ombAiInventoryConnector.parse).toBe("function");
    });

    it("exports the mark that every record begins with", () => {
      expect(OMB_AI_INVENTORY_RECORD_MARK).toBe("US federal AI use case inventory");
    });
  });

  describe("the happy path", () => {
    it("makes one record of a vendor, from its use cases, with its text word for word", async () => {
      const parsed = await parsedOf(inventoryCsv(SAMPLE_USE_CASES));

      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(parsed.root).not.toBeNull();
      expect(parsed.sourceVersion).toBe("2025");
      expect(parsed.records).toHaveLength(1);
      expect(parsed.records[0]).toEqual({
        sourceRecordId: "acme",
        recordType: "algorithm_register_supplier",
        title: "US federal AI use case inventory: Acme Inc",
        summary: SAMPLE_SUMMARY,
        url: `${RECORD_URL_PREFIX}acme`,
        identifiers: { vendor: "Acme Inc", useCases: 3, agencies: 2, edition: "2025" },
        matchKeys: ["name:acmeinc", "name:acme"],
        publishedAt: null,
        sourceUpdatedAt: null,
      });
    });

    it("gives records that are well formed and begin with the mark", async () => {
      const records = await recordsOf(inventoryCsv(SAMPLE_USE_CASES));
      expectWellFormedRecords(records, { sourceId: "omb_ai_inventory", mark: MARK });
      for (const record of records) expect(record.summary.startsWith(MARK)).toBe(true);
    });

    it("gives no record, but the edition, for an inventory in which no use case names a vendor", async () => {
      const parsed = await parsedOf(inventoryCsv([]));
      expect(parsed.records).toEqual([]);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(parsed.root).not.toBeNull();
      expect(parsed.sourceVersion).toBe("2025");
    });

    it("keeps a person-shaped supplier as any other name: the 430 names of the file hold no person", async () => {
      // No rule tells a person from a company here (0 of 30 hits were persons); none is applied.
      expect(await vendorsOf("Pat Sample")).toEqual([["patsample", "Pat Sample"]]);
    });

    it("gives the same bodies and the same records whatever the order of the use cases in the file", async () => {
      const useCases: UseCase[] = [
        ...SAMPLE_USE_CASES,
        // Equal counts everywhere, so that only the rule of the order can decide.
        ...["Acme", "ACME", "acme", "Acme Inc", "ACME Inc", "Acme Ltd", "Acme Corp"].map(
          (vendor, index) => ({
            agency: `T${String.fromCharCode(65 + index)}`,
            vendor,
            stage: ["Deployed", "Pilot", "Retired", "Pre-deployment", ""][index % 5],
            impact: index % 2 === 0 ? "High-impact" : "",
          }),
        ),
        ...Array.from({ length: 12 }, (_, index) => ({
          agency: `M${String.fromCharCode(65 + index)}`,
          vendor: "Many Agencies Ltd",
        })),
        { vendor: "Zeta Works; Beta Works / Delta Works and Gamma Works" },
      ];
      const rows = [
        ...useCases.map(useCaseRow),
        ...Array.from({ length: PADDED }, () => leanRow()),
      ];
      await expectDeterministic(ombAiInventoryConnector, (reversed) =>
        fakeFetch(filesOf(csvOf(reversed ? [...rows].reverse() : rows))),
      );
    });
  });

  describe("download: one file, one conditional GET", () => {
    const CSV = inventoryCsv(SAMPLE_USE_CASES);

    it("asks the file once, with no validators the first time and the limits of the list", async () => {
      const fetch = fakeFetch(filesOf(CSV));
      await ombAiInventoryConnector.download(fetch, {});
      expect(fetch.calls).toEqual([
        {
          url: FILE_URL,
          validators: {},
          limits: {
            maxBytes: 25_165_824,
            allowedContentTypes: ["text/plain"],
            totalTimeoutMs: 120_000,
          },
        },
      ]);
    });

    it("gives one snapshot: the body of the vendors, the prefix of the version and the server's validator, the size", async () => {
      const snapshot = await download(CSV, { lastModified: LAST_MODIFIED });
      expect(snapshot.bodies).toHaveLength(1);
      expect(snapshot.etag).toBe(`k1:${ETAG}`);
      expect(snapshot.lastModified).toBe(LAST_MODIFIED);
      expect(snapshot.bytes).toBe(Buffer.byteLength(CSV));
    });

    it("answers unchanged to the stored validators, through the kit's own flow, and sends them without the prefix", async () => {
      const first = await download(CSV, { lastModified: LAST_MODIFIED });
      const fetch = fakeFetch(filesOf(CSV, { lastModified: LAST_MODIFIED }));

      const answer = await ombAiInventoryConnector.download(fetch, {
        etag: first.etag,
        lastModified: first.lastModified,
      });

      expect(answer).toBe("unchanged");
      expect(fetch.calls).toHaveLength(1);
      expect(fetch.calls[0].validators).toEqual({ etag: ETAG, lastModified: LAST_MODIFIED });
    });

    it("reads the file again when the stored etag is of another version, or of none: no validator is sent", async () => {
      for (const etag of ["k0:" + ETAG, ETAG, null, "k1"]) {
        const fetch = fakeFetch(filesOf(CSV));
        const answer = await ombAiInventoryConnector.download(fetch, { etag, lastModified: null });
        expect(answer).not.toBe("unchanged");
        expect(fetch.calls[0].validators).toEqual({});
      }
    });

    it("reads the file again when the server's validator has changed", async () => {
      const first = await download(CSV);
      const fetch = fakeFetch(filesOf(CSV, { etag: 'W/"another"' }));
      const answer = await ombAiInventoryConnector.download(fetch, {
        etag: first.etag,
        lastModified: first.lastModified,
      });
      expect(answer).not.toBe("unchanged");
    });

    it("takes a 304 for unchanged only from the pinned path: a 304 from elsewhere fails as not allowed", async () => {
      const first = await download(CSV);
      const failure = await failureOf(
        ombAiInventoryConnector.download(
          fakeFetch(
            filesOf(CSV, {
              url: "https://raw.githubusercontent.com/ombegov/another-repository/main/Data/x.csv",
            }),
          ),
          { etag: first.etag, lastModified: first.lastModified },
        ),
      );
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("not_allowed");
    });

    it.each([
      [
        "another host",
        "https://example.test/ombegov/2025-Federal-Agency-AI-Use-Case-Inventory/main/x.csv",
      ],
      [
        "the repository of another edition",
        "https://raw.githubusercontent.com/ombegov/2024-Federal-AI-Use-Case-Inventory/main/x.csv",
      ],
      [
        "another organisation's repository",
        "https://raw.githubusercontent.com/someone/2025-Federal-Agency-AI-Use-Case-Inventory/main/x.csv",
      ],
      [
        "a repository that only starts like the edition's",
        "https://raw.githubusercontent.com/ombegov/2025-Federal-Agency-AI-Use-Case-Inventory-copy/main/x.csv",
      ],
      [
        "plain http",
        "http://raw.githubusercontent.com/ombegov/2025-Federal-Agency-AI-Use-Case-Inventory/main/x.csv",
      ],
      [
        "a host that only starts like GitHub's",
        "https://raw.githubusercontent.com.evil.test/ombegov/2025-Federal-Agency-AI-Use-Case-Inventory/main/x.csv",
      ],
      [
        "a climb out of the repository",
        "https://raw.githubusercontent.com/ombegov/2025-Federal-Agency-AI-Use-Case-Inventory/../other/x.csv",
      ],
    ])(
      "fails a file that %s answered, as not allowed, naming nothing of the address",
      async (_name, from) => {
        const failure = await failureOf(downloadOf(CSV, { url: from }));
        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("not_allowed");
        expect((failure as Error).message).not.toContain("evil");
        expect((failure as Error).message).not.toContain("ombegov");
      },
    );

    it("fails a file cut at its limit as too large, and reads none of it", async () => {
      expect(await failureOf(downloadOf(CSV, { truncated: true }))).toBeInstanceOf(
        BodyTooLargeError,
      );
    });

    it("takes the file as text/plain only: GitHub serves a CSV so, and no other type is the list", async () => {
      expect(await failureOf(downloadOf(CSV, { contentType: "text/plain" }))).toBeUndefined();
      for (const contentType of [
        "text/csv",
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
      const failure = await failureOf(ombAiInventoryConnector.download(fakeFetch({}), {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");

      const refusing: ConnectorFetch = async () => {
        throw new FetchError("blocked_by_site", undefined, { status: 429, retryAfterMs: 60_000 });
      };
      expect(await failureOf(ombAiInventoryConnector.download(refusing, {}))).toMatchObject({
        reason: "blocked_by_site",
        status: 429,
        retryAfterMs: 60_000,
      });
    });
  });

  describe("the reader: the file as the agencies publish it", () => {
    it("reads a file with a byte order mark, LF row ends, quoted cells with commas, quotes and line breaks", async () => {
      const first = useCaseRow({ agency: "AAA", vendor: "Acme Inc\nBeta Labs" });
      first[columnOf("problem_solved")] = 'A "quoted", multi-line\ntext\nwith commas, and more';
      first[columnOf("benefits")] = "line one\r\nline two";
      const rows = [first, useCaseRow({ agency: "BBB", vendor: "Beta Labs" })];
      const csv = csvOf([...rows, ...Array.from({ length: PADDED }, () => leanRow())]);
      expect(csv.startsWith(BYTE_ORDER_MARK)).toBe(true);
      expect(csv).toContain('"A ""quoted"", multi-line\ntext');

      const records = byId(await recordsOf(csv));
      expect([...records.keys()]).toEqual(["acme", "betalabs"]);
      expect(records.get("betalabs")?.identifiers.useCases).toBe(2);
      expectWellFormedRecords([...records.values()], { sourceId: "omb_ai_inventory", mark: MARK });
    });

    it("reads CRLF row ends, and a file that ends with no line break", async () => {
      for (const options of [{ eol: "\r\n" }, { finalEol: false }, { eol: "\n\n" }]) {
        const records = await recordsOf(inventoryCsv(SAMPLE_USE_CASES, options));
        expect(records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
      }
    });

    it.each(USED_COLUMNS)("is not the list when the column %s is missing", async (name) => {
      const at = columnOf(name);
      const header = COLUMNS.filter((_, index) => index !== at);
      const rows = [
        ...SAMPLE_USE_CASES.map(useCaseRow),
        ...Array.from({ length: PADDED }, () => leanRow()),
      ].map((row) => row.filter((_, index) => index !== at));
      const failure = await failureOf(downloadOf(csvOf(rows, { header })));
      expect(failure).toBeInstanceOf(NotTheListError);
    });

    it("finds the columns by name, wherever they are, and takes columns that were added", async () => {
      const header = ["new_first", ...[...COLUMNS].reverse(), "new_last"];
      const rows = [
        ...SAMPLE_USE_CASES.map(useCaseRow),
        ...Array.from({ length: PADDED }, () => leanRow()),
      ].map((row) => ["x", ...[...row].reverse(), "y"]);
      const records = await recordsOf(csvOf(rows, { header }));
      expect(records).toHaveLength(1);
      expect(records[0].summary).toBe(SAMPLE_SUMMARY);
    });

    it("finds a column whose name has a blank around it, but not one that differs in case", async () => {
      const rows = [
        ...SAMPLE_USE_CASES.map(useCaseRow),
        ...Array.from({ length: PADDED }, () => leanRow()),
      ];
      const spaced = COLUMNS.map((name) => (name === "vendor_name" ? ` ${name} ` : name));
      expect(await recordsOf(csvOf(rows, { header: spaced }))).toHaveLength(1);

      const cased = COLUMNS.map((name) => (name === "vendor_name" ? "Vendor_Name" : name));
      expect(await failureOf(downloadOf(csvOf(rows, { header: cased })))).toBeInstanceOf(
        NotTheListError,
      );
    });

    it.each(["", "<html>maintenance</html>", "id,other\n1,2\n", "agency,vendor_name\nAAA,Acme\n"])(
      "is not the list when the file is %j",
      async (body) => {
        expect(await failureOf(downloadOf(body))).toBeInstanceOf(NotTheListError);
      },
    );

    describe("the rows of the file", () => {
      it("reads 2,500 rows and refuses 2,499: a file with fewer is not this list", async () => {
        expect(
          await failureOf(downloadOf(inventoryCsv(SAMPLE_USE_CASES, { pad: 2500 }))),
        ).toBeUndefined();
        expect(
          await failureOf(downloadOf(inventoryCsv(SAMPLE_USE_CASES, { pad: 2499 }))),
        ).toBeInstanceOf(NotTheListError);
      });

      it("reads 10,000 rows, and a file of one row more fails as too large: it never gives a shorter list", async () => {
        const lean = leanRow();
        const rows = (count: number) => Array.from({ length: count }, () => lean);
        expect(await failureOf(downloadOf(csvOf(rows(10_000))))).toBeUndefined();
        expect(await failureOf(downloadOf(csvOf(rows(10_001))))).toBeInstanceOf(BodyTooLargeError);
      });

      it("fails as too large a file that is cut inside a quoted cell: part of a list is no list", async () => {
        // The last row has a use case with a line break in a cell, so that it is quoted; the file ends in it.
        const last = useCaseRow({ vendor: "Acme" });
        last[columnOf("benefits")] = "Line\nbreak";
        const csv = csvOf([...Array.from({ length: PADDED }, () => leanRow()), last]);
        const at = csv.indexOf('"Line\nbreak"');
        expect(at).toBeGreaterThan(0);
        const cut = csv.slice(0, at + '"Line\nbr'.length);

        expect(await failureOf(downloadOf(cut))).toBeInstanceOf(BodyTooLargeError);
        // The same file with the cell closed is read.
        expect(await failureOf(downloadOf(csv))).toBeUndefined();
      });

      it("never gives a shorter list for text that begins a quote and never closes it", async () => {
        expect(await failureOf(downloadOf(`${BYTE_ORDER_MARK}"unclosed`))).toBeInstanceOf(
          BodyTooLargeError,
        );
      });

      it("fails as too large a file with a row of more cells than any list of this kind has", async () => {
        const wide = Array.from({ length: 5000 }, (_, index) => `c${index}`);
        const csv = csvOf([...Array.from({ length: PADDED }, () => leanRow()), wide]);
        expect(await failureOf(downloadOf(csv))).toBeInstanceOf(BodyTooLargeError);
      });

      it("reads a row of 100 cells and fails as too large for one of 101", async () => {
        const csvOfWidth = (width: number): string => {
          const header = [...USED_COLUMNS, ...Array.from({ length: width - 4 }, (_, i) => `c${i}`)];
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
          ...SAMPLE_USE_CASES.map(useCaseRow),
          useCaseRow({ vendor: "Narrow Works" }).slice(0, 30),
          [...useCaseRow({ vendor: "Wide Works" }), "one more cell"],
          ...Array.from({ length: PADDED }, () => leanRow()),
        ];
        const parsed = ombAiInventoryConnector.parse(await download(csvOf(rows)));
        expect(parsed.records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
        // Two unreadable rows against one vendor: more than its allowance, so they are errors.
        expect(parsed.errors).toBe(2);
      });

      describe("a row whose agency is not the abbreviation of one", () => {
        it.each([
          ["lower case", "aaa"],
          ["empty", ""],
          ["more than six letters", "ABCDEFG"],
          ["with a digit", "A1"],
          ["with a blank inside", "A B"],
          ["with a hyphen", "A-B"],
          ["an address", "https://agency.example"],
        ])("is unreadable: %s", async (_name, agency) => {
          const rows = [
            ...SAMPLE_USE_CASES.map(useCaseRow),
            useCaseRow({ agency, vendor: "Gamma Works" }),
            ...Array.from({ length: PADDED }, () => leanRow()),
          ];
          const parsed = ombAiInventoryConnector.parse(await download(csvOf(rows)));
          // The use case is neither counted nor read: no vendor of it, and one row that is unreadable
          // (skipped or an error, as the allowance of a list of one vendor says: the kit's concern).
          expect(parsed.records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
          expect(parsed.errors + (parsed.skipped ?? 0)).toBe(1);
        });

        it("reads one to six capital letters, with blanks around them", async () => {
          for (const agency of ["A", "AB", "ABCDEF", " QRS ", "TUVW"]) {
            const csv = inventoryCsv([{ agency, vendor: "Acme Inc" }]);
            const records = await recordsOf(csv);
            expect(records).toHaveLength(1);
            expect(records[0].summary).toContain(`Agencies: ${agency.trim()}.`);
          }
        });
      });

      describe("the allowance of rows that cannot be read", () => {
        const VENDORS = 120;
        const vendors = (): UseCase[] =>
          Array.from({ length: VENDORS }, (_, index) => ({ vendor: vendorName(index) }));
        const csvWith = (count: number): string => {
          const bad = useCaseRow({ agency: "bad agency", vendor: "Ragged Works" });
          return csvOf([
            ...vendors().map(useCaseRow),
            ...Array.from({ length: count }, () => bad),
            ...Array.from({ length: PADDED }, () => leanRow()),
          ]);
        };

        it.each([1, 5, 10])("skips %s of them and applies the rest of the list", async (count) => {
          expect(count).toBeLessThanOrEqual(unreadableAllowed(VENDORS + count));
          const parsed = ombAiInventoryConnector.parse(await download(csvWith(count)));
          expect(parsed.errors).toBe(0);
          expect(parsed.skipped).toBe(count);
          expect(parsed.records).toHaveLength(VENDORS);
        });

        it("fails the list when there are more than the allowance, and still gives the records that could be read", async () => {
          const count = unreadableAllowed(VENDORS + 11) + 1;
          const parsed = ombAiInventoryConnector.parse(await download(csvWith(count)));
          expect(parsed.errors).toBe(count);
          expect(parsed.skipped).toBe(0);
          expect(parsed.records).toHaveLength(VENDORS);
        });
      });

      describe("the agencies and the vendors of the list", () => {
        /** A code of two capital letters for each number below 676. */
        const agencyCode = (n: number): string =>
          `${String.fromCharCode(65 + Math.floor(n / 26))}${String.fromCharCode(65 + (n % 26))}`;

        it("reads 100 agencies, and a file of 101 is not this list (the 2025 edition has 41)", async () => {
          // The lean rows use 'AAA' as an agency: one more, so that 99 of the others make 100.
          const csvOfAgencies = (count: number): string =>
            inventoryCsv(
              Array.from({ length: count }, (_, n) => ({ agency: agencyCode(n), vendor: "Acme" })),
            );
          expect(await failureOf(downloadOf(csvOfAgencies(99)))).toBeUndefined();
          expect(await failureOf(downloadOf(csvOfAgencies(100)))).toBeInstanceOf(NotTheListError);
        });

        /** `count` distinct vendors, 20 to a row. */
        const csvOfVendors = (count: number): string => {
          const names = Array.from({ length: count }, (_, index) => vendorName(index));
          const rows: UseCase[] = [];
          for (let at = 0; at < names.length; at += 20) {
            rows.push({ vendor: names.slice(at, at + 20).join("; ") });
          }
          return inventoryCsv(rows);
        };

        it("reads 10,000 vendors, and 10,001 fail the download as too large: it never gives a shorter list", async () => {
          const ok = await download(csvOfVendors(10_000));
          expect(JSON.parse(ok.bodies[0]).rows).toHaveLength(10_000);
          expect(await failureOf(downloadOf(csvOfVendors(10_001)))).toBeInstanceOf(
            BodyTooLargeError,
          );
        });

        it("takes the total of the body at the number of vendors when a few rows name more of them than there are rows", async () => {
          // 2,600 vendors in 130 rows of 20 names, and 2,400 lean rows: 2,530 rows hold more vendors
          // than there are rows, and the body must still pass its own check (total >= vendors).
          const names = Array.from({ length: 2600 }, (_, index) => vendorName(index));
          const rows: string[][] = [];
          for (let at = 0; at < names.length; at += 20) {
            rows.push(useCaseRow({ vendor: names.slice(at, at + 20).join("; ") }));
          }
          const snapshot = await download(
            csvOf([...rows, ...Array.from({ length: 2400 }, () => leanRow())]),
          );
          const body = JSON.parse(snapshot.bodies[0]);
          expect(body.rows).toHaveLength(2600);
          expect(body.total).toBeGreaterThanOrEqual(body.rows.length + body.unreadable);
          expect(ombAiInventoryConnector.parse(snapshot).records).toHaveLength(2600);
        });
      });
    });
  });

  describe("the vendors a cell names (rule V)", () => {
    it.each([
      [
        "a comma between two names",
        "Acme Inc, Beta LLC",
        [
          ["acme", "Acme Inc"],
          ["beta", "Beta LLC"],
        ],
      ],
      ["a comma before a legal form is no separator: Inc.", "Acme, Inc.", [["acme", "Acme, Inc"]]],
      ["a comma before a legal form is no separator: LLC", "Acme, LLC", [["acme", "Acme, LLC"]]],
      ["a comma before a legal form is no separator: LLP", "Acme, LLP", [["acme", "Acme, LLP"]]],
      ["a comma before a legal form is no separator: LP", "Acme, LP", [["acme", "Acme, LP"]]],
      ["a comma before a legal form is no separator: Co.", "Acme, Co.", [["acme", "Acme, Co"]]],
      [
        "a comma before a legal form is no separator: ULC (the key keeps it: shortName does not know it)",
        "Acme, ULC",
        [["acmeulc", "Acme, ULC"]],
      ],
      [
        "a comma before a legal form is no separator: Limited",
        "Acme, Limited",
        [["acme", "Acme, Limited"]],
      ],
      [
        "a comma before a legal form is no separator: Incorporated",
        "Acme, Incorporated",
        [["acme", "Acme, Incorporated"]],
      ],
      [
        "a comma before a legal form is no separator: Corporation",
        "Acme, Corporation",
        [["acme", "Acme, Corporation"]],
      ],
      ["a comma before a legal form is no separator: PLC", "Acme, PLC", [["acme", "Acme, PLC"]]],
      ["a comma before a legal form is no separator: GmbH", "Acme, GmbH", [["acme", "Acme, GmbH"]]],
      [
        "a comma before a legal form is no separator: PLLC (the key keeps it)",
        "Acme, PLLC",
        [["acmepllc", "Acme, PLLC"]],
      ],
      [
        "a comma before a legal form is no separator: PC (the key keeps it)",
        "Acme, PC",
        [["acmepc", "Acme, PC"]],
      ],
      [
        "a comma before a word that only begins like a legal form is a separator",
        "Acme, Pcaps",
        [
          ["acme", "Acme"],
          ["pcaps", "Pcaps"],
        ],
      ],
      [
        "a comma before a word that only begins like 'Corp' and 'Corporation' is a separator",
        "Acme, Corporate Services",
        [
          ["acme", "Acme"],
          ["corporateservices", "Corporate Services"],
        ],
      ],
      [
        "a legal form after one comma and a name after the other",
        "Acme, Beta Labs, Inc",
        [
          ["acme", "Acme"],
          ["betalabs", "Beta Labs, Inc"],
        ],
      ],
      [
        "' and ' separates two names",
        "Acme and Beta",
        [
          ["acme", "Acme"],
          ["beta", "Beta"],
        ],
      ],
      [
        "' AND ' separates in any case",
        "Acme AND Beta",
        [
          ["acme", "Acme"],
          ["beta", "Beta"],
        ],
      ],
      [
        "' and ' after a comma",
        "Acme, and Beta",
        [
          ["acme", "Acme"],
          ["beta", "Beta"],
        ],
      ],
      [
        "'and' inside a word is no separator",
        "Sandstone Works",
        [["sandstoneworks", "Sandstone Works"]],
      ],
      [
        "a name that 'and' cuts in two: the known residual (the part under four characters has no key)",
        "Dun and Example",
        [["example", "Example"]],
      ],
      ["an ampersand is no separator", "Acme & Sons", [["acmesons", "Acme & Sons"]]],
      [
        "a slash between blanks",
        "Acme / Beta",
        [
          ["acme", "Acme"],
          ["beta", "Beta"],
        ],
      ],
      [
        "a slash with no blank",
        "Acme/Beta",
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
        "line breaks of every kind separate as a semicolon does",
        "Acme\nBeta\r\nGamma\rDelta",
        [
          ["acme", "Acme"],
          ["beta", "Beta"],
          ["delta", "Delta"],
          ["gamma", "Gamma"],
        ],
      ],
      ["a trailing comma", "Theta Works,", [["thetaworks", "Theta Works"]]],
      ["blanks and punctuation at both ends", " - Acme . ", [["acme", "Acme"]]],
      ["a colon, a hyphen and a tab at the ends", ":\t-Acme-:", [["acme", "Acme"]]],
      ["the same name twice in one cell", "Acme, Acme", [["acme", "Acme"]]],
      ["a parenthetical qualifier is cut", "Acme (prime contractor)", [["acme", "Acme"]]],
      ["an unclosed parenthetical is cut to the end", "Acme (prime contractor", [["acme", "Acme"]]],
      [
        "a parenthetical in the middle",
        "Acme (prime) and Beta (sub)",
        [
          ["acme", "Acme"],
          ["beta", "Beta"],
        ],
      ],
      ["an address is no name", "https://acme.example/x", []],
      ["an address beside a name", "Acme https://acme.example/x", [["acme", "Acme"]]],
      ["an address in brackets", "Acme (https://acme.example/x)", [["acme", "Acme"]]],
      ["an address with its scheme in capitals", "Acme HTTPS://ACME.EXAMPLE/X", [["acme", "Acme"]]],
      [
        "a hidden character and a no-break space",
        `Acme${ZERO_WIDTH_SPACE}${NO_BREAK_SPACE}Works`,
        [["acmeworks", "Acme Works"]],
      ],
      [
        "a bidirectional override",
        `Acme${RIGHT_TO_LEFT_OVERRIDE} Works`,
        [["acmeworks", "Acme Works"]],
      ],
    ] as Array<[string, string, Array<[string, string]>]>)("%s", async (_name, cell, expected) => {
      expect(await vendorsOf(cell)).toEqual(expected);
    });

    it.each([
      ["Not available"],
      ["not applicable"],
      ["N/A"],
      ["n/a"],
      ["NA"],
      ["TBD"],
      ["TBA"],
      ["None"],
      ["Unknown"],
      ["Other"],
      ["Various"],
      ["Multiple"],
      ["Contractor team"],
      ["Contractor teams"],
      ["Contractor"],
      ["Contractors"],
      ["Open source"],
      ["Open-source software"],
      ["OpenSource tools"],
      ["AI Service Provider"],
      ["AI model provider"],
      ["In-house"],
      ["In house"],
      ["In-house development"],
      ["Internal"],
      ["Internal Federal Shared Service"],
      ["Agency developed"],
      ["Federal government"],
      ["Government"],
      ["Law Enforcement Sensitive"],
      ["Commercial off the shelf"],
      ["COTS"],
      ["Vendor"],
      ["Vendors"],
      ["Third party"],
      ["Third-party tools"],
      ["Proprietary"],
    ])("gives no vendor for the placeholder %j", async (cell) => {
      expect(await vendorsOf(cell)).toEqual([]);
    });

    it.each([
      ["a contract number: PIID 47QTCA00000000", "PIID 47QTCA00000000"],
      ["a contract number alone", "47QTCA00000000"],
      ["the word PIID", "Acme PIID"],
      ["a run of five digits", "Acme 12345"],
      ["the Excel artefact of a time", "1899-12-31 11:59:00"],
      ["a name of three characters: QZX", "QZX"],
      ["a name of three characters: VKY", "VKY"],
      ["a name of three characters: NXC", "NXC"],
      ["a name of three characters: SXS", "SXS"],
      ["a name of three characters: qZX", "qZX"],
      ["a name that is under four characters once its legal form is off", "Ab Inc"],
      [
        "a sentence of 70 characters",
        "Used for the analysis of the files that the agency has in its care today",
      ],
      ["only punctuation", " ,;. - "],
      ["nothing", ""],
    ])("gives no vendor for %s", async (_name, cell) => {
      expect(await vendorsOf(cell)).toEqual([]);
    });

    it("keeps what only looks like a placeholder or a number", async () => {
      expect(await vendorsOf("Otherwise Works")).toEqual([["otherwiseworks", "Otherwise Works"]]);
      expect(await vendorsOf("Piidx Works")).toEqual([["piidxworks", "Piidx Works"]]);
      expect(await vendorsOf("Acme 1234")).toEqual([["acme1234", "Acme 1234"]]);
      expect(await vendorsOf("Vendorized")).toEqual([["vendorized", "Vendorized"]]);
    });

    it("keeps a token of 60 characters and drops one of 61", async () => {
      // The hyphens are in the name and not in its key: 4 + 51 + 5 = 60 characters, a key of nine.
      const sixty = `Acme${"-".repeat(51)}Works`;
      const sixtyOne = `Acme${"-".repeat(52)}Works`;
      expect(sixty).toHaveLength(60);
      expect((await vendorsOf(sixty)).map(([id]) => id)).toEqual(["acmeworks"]);
      expect(await vendorsOf(sixtyOne)).toEqual([]);
      // It is no vendor at all, not a vendor that the record then fails to hold: nothing is unreadable.
      const parsed = await parsedOf(inventoryCsv([{ vendor: sixtyOne }]));
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped ?? 0).toBe(0);
    });

    it("keeps a key of 40 characters and drops one of 41", async () => {
      const forty = ["Aaaaa", "Bbbbb", "Ccccc", "Ddddd", "Eeeee", "Fffff", "Ggggg", "Hhhhh"].join(
        " ",
      );
      expect((await vendorsOf(forty)).map(([id]) => id.length)).toEqual([40]);
      expect(await vendorsOf(`${forty}i`)).toEqual([]);
    });

    it("merges 'Open Acme' and 'OpenAcme' into one key, and shows the spelling that is first of equals", async () => {
      const records = await recordsOf(
        inventoryCsv([{ vendor: "OpenAcme" }, { vendor: "Open Acme" }]),
      );
      expect(records.map((record) => record.sourceRecordId)).toEqual(["openacme"]);
      expect(vendorOf(records[0])).toBe("Open Acme");
      expect(records[0].identifiers.useCases).toBe(2);
      expect(records[0].matchKeys).toEqual(["name:openacme"]);
    });

    it("keeps 'Acme Zorbix' apart from 'Acme', and 'Zorbix' from both: a product is not its maker", async () => {
      expect(await vendorsOf("Acme, Acme Zorbix, Zorbix")).toEqual([
        ["acme", "Acme"],
        ["acmezorbix", "Acme Zorbix"],
        ["zorbix", "Zorbix"],
      ]);
    });

    it("shows the most frequent spelling of a vendor, and the first of equals; the others are names of the record", async () => {
      const spellings = ["Salesbridge", "Salesbridge", "SalesBridge", "Salesbridge, Inc"];
      const records = await recordsOf(inventoryCsv(spellings.map((vendor) => ({ vendor }))));
      expect(records).toHaveLength(1);
      expect(vendorOf(records[0])).toBe("Salesbridge");
      expect(records[0].matchKeys).toEqual(["name:salesbridge", "name:salesbridgeinc"]);
    });

    it("keeps at most five spellings as names, the most frequent first, then in the order of their text", async () => {
      // 'Acme Corp' twice and six others once: the kept are 'Acme Corp' and the first four of the
      // others by text, in UTF-16 order ('Acme LLC' before 'Acme Limited' before 'Acme Ltd').
      const spellings = [
        "Acme Ltd",
        "Acme Limited",
        "Acme LLC",
        "Acme Inc",
        "Acme Corporation",
        "Acme",
        "Acme Corp",
        "Acme Corp",
      ];
      const records = await recordsOf(inventoryCsv(spellings.map((vendor) => ({ vendor }))));
      expect(records).toHaveLength(1);
      expect(records[0].identifiers.useCases).toBe(8);
      expect(vendorOf(records[0])).toBe("Acme Corp");
      expect(records[0].matchKeys).toEqual([
        "name:acmecorp",
        "name:acme",
        "name:acmecorporation",
        "name:acmeinc",
        "name:acmellc",
      ]);
    });

    it("keeps the first 400 characters of a cell that is longer than 400, and drops the name that the cut ended", async () => {
      // 62 times 'Acme; ' is 372 characters, and the 388 that are kept end inside the next name:
      // 'Beta Laboratorie' is a fragment of 'Beta Laboratories International', and no vendor.
      const cell = `${"Acme; ".repeat(62)}Beta Laboratories International`;
      expect(cell.length).toBeGreaterThan(400);
      const records = await recordsOf(inventoryCsv([{ vendor: cell }]));
      expect(records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
      for (const record of records) expect(record.matchKeys.join(" ")).not.toContain("shortened");
    });

    it("keeps every name of a cell of 400 characters, which is not cut", async () => {
      const last = "B".repeat(40);
      const cell = `${"Acme, ".repeat(60)}${last}`;
      expect(cell.length).toBe(400);
      const records = await recordsOf(inventoryCsv([{ vendor: cell }]));
      expect(records.map((record) => record.sourceRecordId)).toEqual(["acme", "b".repeat(40)]);
    });

    // The cut of `lineOf` takes a blank before it off and never splits a pair of
    // surrogates, so the line of a cut cell can be SHORTER than the cut that asked for it and still end
    // in the marker. A test of the length alone (`line.length === cap`) takes such a line for a whole
    // cell, and so does a test that asks for a unit more than the cap and compares the length of the
    // line with the cap: the front of the name that the cut ended is kept as a vendor, and its id ends in
    // `shortened`. Both cuts are laid out here, each with a blank and with a pair of surrogates.
    const CUT_SHORT_CASES = SHORT_CUTS.flatMap(([label, where]) => [
      [`${label}, in the cut at the cap`, VENDOR_CELL_CAP, where],
      [`${label}, in the cut at the cap and a unit`, VENDOR_CELL_CAP + 1, where],
    ]) as Array<[string, number, "blank" | "pair"]>;

    it.each(CUT_SHORT_CASES)(
      "drops the front of a name that the cut of a cell ended after %s, though the cut line is shorter than the cap",
      async (_label, cutAt, where) => {
        const cell = cutShortCell(cutAt, where);
        const line = lineOf(cell, cutAt);
        // The shape: a cut line of one unit less than the cut that asked for it, ending in the marker, after the front of a name.
        expect(cell.length).toBeGreaterThan(cutAt);
        expect(line.endsWith(SHORTENED)).toBe(true);
        expect(line).toHaveLength(cutAt - 1);
        expect(line.slice(0, -SHORTENED.length).endsWith("Quill Laboratories")).toBe(true);

        const snapshot = await download(inventoryCsv([{ vendor: cell }]));
        const records = ombAiInventoryConnector.parse(snapshot).records;
        // The names before the cut are whole vendors, and the front of the name that it ended is none.
        expect(records.map((record) => record.sourceRecordId)).toEqual(["abcde", "acme"]);
        const everything = JSON.stringify([snapshot.bodies, records]);
        expect(everything).not.toContain("shortened");
        expect(everything.toLowerCase()).not.toContain("quill");
      },
    );

    // The marker that `lineOf` puts on a cut line begins with a blank. Left on the text that is split,
    // that blank would make a separator of a cut `and` (the front of `android`), and the name before
    // it would be kept as a whole one.
    it("does not read the front of a word that the cut ended as the separator 'and': the name before it is no name", async () => {
      const ending = "Beta and";
      const cell = `${leadOf(VENDOR_CELL_CAP - SHORTENED.length - ending.length, "; ")}Beta android Gadgets Worldwide`;
      expect(lineOf(cell, VENDOR_CELL_CAP).endsWith(`${ending}${SHORTENED}`)).toBe(true);
      const records = await recordsOf(inventoryCsv([{ vendor: cell }]));
      expect(records.map((record) => record.sourceRecordId)).toEqual(["abcde", "acme"]);
    });

    // A comma before a legal form is part of the name (`Zorbix, LLC Quantum Division` is one
    // name), and the join is decided by the text after the comma. When the cut of the cell falls right
    // after that comma, or inside the legal form (`L`, `LL`), the text after it is empty or is no legal
    // form yet, and `Zorbix` would stand alone as a whole name: id `zorbix`, key `zorbix`,
    // `identifiers.vendor` `Zorbix`, with no marker to give it away. A cell that was cut is read only up
    // to its last real separator (a semicolon, a line break, a slash, ` and `): its last name goes
    // whole, whatever commas it holds. No real cell is that long (the longest has 138 units).
    describe("a cell that was cut in or right after a legal form that follows a comma", () => {
      // `LLC` is a legal form of this reader (LEGAL_FORM_AHEAD): a comma before it joins. `Subs` is
      // none: `Zorbix Corp, Subs Quantum Division` is two names even when it is whole, and the cut in
      // it is dropped all the same (the whole tail goes), so that the rule is the same for any word.
      const WHOLE = "Zorbix, LLC Quantum Division";
      const WHOLE_SUBS = "Zorbix Corp, Subs Quantum Division";
      const WHOLE_ID = "zorbixllcquantumdivision";
      const CUT_AFTER: Array<[string, string, string]> = [
        ["the comma", "Zorbix,", WHOLE],
        ["the comma and the blank after it, which the cut takes off", "Zorbix, ", WHOLE],
        ["the first letter of a legal form (LLC)", "Zorbix, L", WHOLE],
        ["two letters of a legal form (LLC)", "Zorbix, LL", WHOLE],
        ["the whole legal form (LLC)", "Zorbix, LLC", WHOLE],
        ["a word after the legal form (LLC)", "Zorbix, LLC Quantum", WHOLE],
        ["the first letter of a word that is no legal form", "Zorbix Corp, S", WHOLE_SUBS],
        ["two letters of a word that is no legal form", "Zorbix Corp, Su", WHOLE_SUBS],
      ];
      const SEPARATORS: Array<[string, string]> = [
        ["a semicolon", "; "],
        ["a slash", "/"],
        ["the word and", " and "],
      ];
      const CASES = SEPARATORS.flatMap(([after, separator]) =>
        CUT_AFTER.map(([where, ending, whole]) => [
          `${where}, after ${after}`,
          separator,
          ending,
          whole,
        ]),
      ) as Array<[string, string, string, string]>;

      it.each(CASES)(
        "drops the whole last name when the cut falls right after %s, and keeps the names before it",
        async (_label, separator, ending, whole) => {
          const cell = cellCutAfter(ending, whole, separator);
          // The shape: the text that the cut keeps ends exactly after the ending, and has no separator after the last real one.
          expect(keptOf(cell).endsWith(ending.trimEnd())).toBe(true);
          expect(lineOf(cell, VENDOR_CELL_CAP).endsWith(SHORTENED)).toBe(true);

          const snapshot = await download(inventoryCsv([{ vendor: cell }]));
          const records = ombAiInventoryConnector.parse(snapshot).records;
          expect(records.map((record) => record.sourceRecordId)).toEqual(["abcde", "acme"]);
          // No id, key, name or identifier is the front of the name, `zorbix`, or holds the marker.
          const everything = JSON.stringify([snapshot.bodies, records]).toLowerCase();
          expect(everything).not.toContain("zorbix");
          expect(everything).not.toContain("shortened");
        },
      );

      // The reader splits at ` and ` whatever its case, and so does the cut-back of a cut cell.
      it.each([
        ["capitals", " AND "],
        ["a capital first letter", " And "],
      ])(
        "reads the word and in %s as a separator of a cut cell too: the name before it stays and the last name goes",
        async (_label, separator) => {
          const ending = "Zorbix, LL";
          const cell = cellCutAfter(ending, WHOLE, separator);
          expect(keptOf(cell).endsWith(ending)).toBe(true);
          const snapshot = await download(inventoryCsv([{ vendor: cell }]));
          const records = ombAiInventoryConnector.parse(snapshot).records;
          expect(records.map((record) => record.sourceRecordId)).toEqual(["abcde", "acme"]);
          const everything = JSON.stringify([snapshot.bodies, records]).toLowerCase();
          expect(everything).not.toContain("zorbix");
          expect(everything).not.toContain("shortened");
        },
      );

      // The addresses and the parentheticals are cut out of the text BEFORE it is cut back. A semicolon,
      // a slash or an ` and ` inside one of them (or inside a parenthetical that the cut ended) is no
      // separator: a cut-back that stops there leaves the front of the last name standing, `Zorbix`,
      // once the rest of that parenthetical or address is cut out.
      const INSIDE_A_CUT_OUT_PART: Array<[string, string, string]> = [
        [
          "a parenthetical that holds a semicolon",
          "Zorbix (formerly Alpha; Beta) Works, LL",
          "Zorbix (formerly Alpha; Beta) Works, LLC Quantum Division",
        ],
        [
          "a parenthetical that holds a slash",
          "Zorbix (Alpha/Beta) Works, LL",
          "Zorbix (Alpha/Beta) Works, LLC Quantum Division",
        ],
        [
          "a parenthetical that holds the word and",
          "Zorbix (Alpha and Beta) Works, LL",
          "Zorbix (Alpha and Beta) Works, LLC Quantum Division",
        ],
        [
          "a parenthetical that the cut ended, after a semicolon in it",
          "Zorbix (formerly Alpha; Be",
          "Zorbix (formerly Alpha; Beta) Works",
        ],
        [
          "a parenthetical that the cut ended, after a slash in it",
          "Zorbix (Alpha/Be",
          "Zorbix (Alpha/Beta) Works",
        ],
        [
          "an address with a path, the cut inside the path",
          "Zorbix Works https://example.com/path/pa",
          "Zorbix Works https://example.com/path/page",
        ],
      ];

      it.each(INSIDE_A_CUT_OUT_PART)(
        "cuts the text back only after the addresses and the parentheticals are cut out of it: %s",
        async (_label, ending, whole) => {
          const cell = cellCutAfter(ending, whole);
          expect(keptOf(cell).endsWith(ending)).toBe(true);
          const snapshot = await download(inventoryCsv([{ vendor: cell }]));
          const records = ombAiInventoryConnector.parse(snapshot).records;
          expect(records.map((record) => record.sourceRecordId)).toEqual(["abcde", "acme"]);
          const everything = JSON.stringify([snapshot.bodies, records]).toLowerCase();
          expect(everything).not.toContain("zorbix");
          expect(everything).not.toContain("shortened");
        },
      );

      // A line break is a semicolon for the reader (it is made one before the cell is cut), so a cut
      // cell is cut back to its last line break as it is to its last semicolon.
      it("cuts a cell back to its last line break too: the names before it stay and the last name goes", async () => {
        const ending = "Zorbix, LL";
        const lead = leadOf(VENDOR_CELL_CAP - SHORTENED.length - ending.length, "\n");
        const cell = `${lead}${WHOLE}\nZorbix Quill`;
        expect(keptOf(cell.replace(/\n/g, ";")).endsWith(ending)).toBe(true);
        const snapshot = await download(inventoryCsv([{ vendor: cell }]));
        const records = ombAiInventoryConnector.parse(snapshot).records;
        expect(records.map((record) => record.sourceRecordId)).toEqual(["abcde", "acme"]);
        const everything = JSON.stringify([snapshot.bodies, records]).toLowerCase();
        expect(everything).not.toContain("zorbix");
        expect(everything).not.toContain("shortened");
      });

      it("drops everything of a cut cell that has no separator but commas: the names of a list cannot be told from the parts of one name", async () => {
        const ending = "Zorbix, LL";
        const lead = leadOf(VENDOR_CELL_CAP - SHORTENED.length - ending.length, ", ");
        const cell = `${lead}${WHOLE}, Zorbix Quill`;
        expect(keptOf(cell).endsWith(ending)).toBe(true);
        const snapshot = await download(inventoryCsv([{ vendor: cell }]));
        // Fail closed: no real separator stands before the last name, so the whole cell is its tail.
        expect(ombAiInventoryConnector.parse(snapshot).records).toEqual([]);
        expect(JSON.stringify(snapshot.bodies).toLowerCase()).not.toContain("shortened");
      });

      it("drops the whole tail after the last real separator, the names of a comma list in it too, and keeps the names before the separator", async () => {
        const ending = "Alphalabs, Betalabs, Zorbix, LL";
        const whole = `Alphalabs, Betalabs, ${WHOLE}`;
        const cell = `${leadOf(VENDOR_CELL_CAP - SHORTENED.length - ending.length, "; ")}${whole}; Zorbix Quill`;
        expect(keptOf(cell).endsWith(ending)).toBe(true);
        const snapshot = await download(inventoryCsv([{ vendor: cell }]));
        const records = ombAiInventoryConnector.parse(snapshot).records;
        expect(records.map((record) => record.sourceRecordId)).toEqual(["abcde", "acme"]);
        const everything = JSON.stringify([snapshot.bodies, records]).toLowerCase();
        for (const fragment of ["alphalabs", "betalabs", "zorbix", "shortened"]) {
          expect(everything).not.toContain(fragment);
        }
      });

      it("reads a cell that was not cut as before: the name with a legal form after a comma is one name, whole", async () => {
        // The same lead and the same name, 300 and 400 units: the cell is not cut, and the whole name is a vendor.
        for (const lead of [272, VENDOR_CELL_CAP - WHOLE.length]) {
          const cell = `${leadOf(lead, "; ")}${WHOLE}`;
          expect(cell.length).toBeLessThanOrEqual(VENDOR_CELL_CAP);
          expect(lineOf(cell, VENDOR_CELL_CAP).endsWith(SHORTENED)).toBe(false);
          const records = await recordsOf(inventoryCsv([{ vendor: cell }]));
          expect(records.map((record) => record.sourceRecordId)).toEqual([
            "abcde",
            "acme",
            WHOLE_ID,
          ]);
          expect(vendorOf(byId(records).get(WHOLE_ID) as ParsedRecord)).toBe(WHOLE);
        }
        // A unit more and the cell is cut inside the name: the tail goes, and no front of it is kept.
        const over = `${leadOf(VENDOR_CELL_CAP + 1 - WHOLE.length, "; ")}${WHOLE}`;
        expect(over).toHaveLength(VENDOR_CELL_CAP + 1);
        const records = await recordsOf(inventoryCsv([{ vendor: over }]));
        expect(records.map((record) => record.sourceRecordId)).toEqual(["abcde", "acme"]);
      });

      it("reads a cut cell that is a list with only commas as no vendor at all, whatever its names", async () => {
        // 62 times 'Acme, ' and the front of another name: no semicolon, no line break, no slash, no ' and '.
        const cell = `${"Acme, ".repeat(62)}Beta Laboratories International`;
        expect(lineOf(cell, VENDOR_CELL_CAP).endsWith(SHORTENED)).toBe(true);
        expect(await recordsOf(inventoryCsv([{ vendor: cell }]))).toEqual([]);
      });
    });

    // `ADDRESSES` reads `https://` and at least one character after the slashes, so an address
    // that the cut ended right after `https:/` or `https://` is no address to it, and its slash would
    // be the last real separator: the name before it, `Zorbix Works` in `Zorbix Works https://`, stood
    // as a whole name with `https` on its end (id `zorbixworkshttps`). What the cut leaves of an
    // address, `https?:` and at most two slashes at the end of the text that it keeps, is taken off
    // before the cut-back, so the slash of a cut address is no separator.
    describe("an address that the cut of a cell ended", () => {
      const ADDRESS = "https://example.com/page";
      // [label, ending, whole]: the text that the cut keeps ends exactly after `ending`.
      const LEAKED: Array<[string, string, string]> = [
        ["https:/", "Zorbix Works https:/", `Zorbix Works ${ADDRESS}`],
        ["https://", "Zorbix Works https://", `Zorbix Works ${ADDRESS}`],
        ["http:/", "Zorbix Works http:/", "Zorbix Works http://example.com/page"],
        ["http://", "Zorbix Works http://", "Zorbix Works http://example.com/page"],
        ["HTTPS:/ in capitals", "Zorbix Works HTTPS:/", "Zorbix Works HTTPS://example.com/page"],
        ["HTTPS:// in capitals", "Zorbix Works HTTPS://", "Zorbix Works HTTPS://example.com/page"],
      ];
      // What was sound before and stays so: no slash at all, an address that `ADDRESSES` reads, a
      // scheme with no colon, and an address that holds another one (the whole run is one address).
      const SOUND: Array<[string, string, string]> = [
        ["https: and no slash", "Zorbix Works https:", `Zorbix Works ${ADDRESS}`],
        [
          "https://e, an address with a character after its slashes",
          "Zorbix Works https://e",
          `Zorbix Works ${ADDRESS}`,
        ],
        ["http and no colon", "Zorbix Works http", `Zorbix Works ${ADDRESS}`],
        [
          "https://https://, an address that holds another one",
          "Zorbix Works https://https://",
          "Zorbix Works https://https://example.com/page",
        ],
      ];

      it.each([...LEAKED, ...SOUND])(
        "drops the last name when the cut falls right after %s, and keeps the names before the last separator",
        async (_label, ending, whole) => {
          const cell = cellCutAfter(ending, whole);
          expect(keptOf(cell).endsWith(ending)).toBe(true);
          const snapshot = await download(inventoryCsv([{ vendor: cell }]));
          const records = ombAiInventoryConnector.parse(snapshot).records;
          expect(records.map((record) => record.sourceRecordId)).toEqual(["abcde", "acme"]);
          // No id, key, name or identifier is `zorbixworks` or `zorbixworkshttps`, or holds the marker.
          const everything = JSON.stringify([snapshot.bodies, records]).toLowerCase();
          expect(everything).not.toContain("zorbix");
          expect(everything).not.toContain("shortened");
        },
      );

      // A real separator before the cut address, or a real slash that the cut ended: the name before
      // the separator is whole and stays, and `https`, which the slash of the cut address used to
      // leave as a name, is no vendor.
      const SEPARATED: Array<[string, string, string]> = [
        [
          "a slash with a blank on each side",
          "Zorbix Works / https://",
          `Zorbix Works / ${ADDRESS}`,
        ],
        ["the word and", "Zorbix Works and https:/", `Zorbix Works and ${ADDRESS}`],
        ["a semicolon", "Zorbix Works; https:/", `Zorbix Works; ${ADDRESS}`],
        [
          "a slash that is the last character of the text",
          "Zorbix Works /",
          "Zorbix Works / Quantum Division",
        ],
      ];

      it.each(SEPARATED)(
        "keeps the name before a real separator that comes before a cut address: %s",
        async (_label, ending, whole) => {
          const cell = cellCutAfter(ending, whole);
          expect(keptOf(cell).endsWith(ending)).toBe(true);
          const records = await recordsOf(inventoryCsv([{ vendor: cell }]));
          expect(records.map((record) => record.sourceRecordId)).toEqual([
            "abcde",
            "acme",
            "zorbixworks",
          ]);
          expect(vendorOf(byId(records).get("zorbixworks") as ParsedRecord)).toBe("Zorbix Works");
          // No key or identifier of any record holds `https`.
          const named = JSON.stringify(
            records.map((record) => [record.matchKeys, record.identifiers]),
          );
          expect(named.toLowerCase()).not.toContain("https");
        },
      );

      // The step is for the end of what a cut keeps. A cell that was typed so and is whole, and an
      // address typed in the middle of a cut cell, are read as typed: the slash separates.
      it("reads a cell that was not cut as before: an address with nothing after its slashes is typed text", async () => {
        const cell = `${leadOf(150, "; ")}Zorbix Works https://`;
        expect(cell.length).toBeLessThanOrEqual(VENDOR_CELL_CAP);
        expect(lineOf(cell, VENDOR_CELL_CAP).endsWith(SHORTENED)).toBe(false);
        expect(await vendorsOf(cell)).toEqual([
          ["abcde", "Abcde"],
          ["acme", "Acme"],
          ["zorbixworkshttps", "Zorbix Works https"],
        ]);
      });

      it("takes off only what the cut left at the end of the text: a partial address typed earlier in a cut cell is read as typed", async () => {
        const typed = "Beta https:/ Gamma; ";
        const ending = "Zorbix Works https://";
        const lead = leadOf(
          VENDOR_CELL_CAP - SHORTENED.length - ending.length - typed.length,
          "; ",
        );
        const cell = `${typed}${lead}Zorbix Works ${ADDRESS}; Zorbix Quill`;
        expect(keptOf(cell).endsWith(ending)).toBe(true);
        expect(await vendorsOf(cell)).toEqual([
          ["abcde", "Abcde"],
          ["acme", "Acme"],
          ["betahttps", "Beta https"],
          ["gamma", "Gamma"],
        ]);
      });
    });

    // The identifiers are whole already: a name is at most 60 units (TOKEN_MAX_CHARS), which the
    // display of 80 units never cuts, so `identifiers.vendor` and the title hold it as it is.
    it("keeps the longest name whole in the identifiers and in the title: a name is at most 60 units, under the 80 of the display", async () => {
      const sixty = `Acme${"-".repeat(51)}Works`;
      expect(sixty).toHaveLength(60);
      const records = await recordsOf(inventoryCsv([{ vendor: sixty }]));
      expect(records).toHaveLength(1);
      expect(records[0].identifiers.vendor).toBe(sixty);
      expect(records[0].title).toBe(`${MARK}: ${sixty}`);
      expect(JSON.stringify(records)).not.toContain("shortened");
    });
  });

  // `lineOf` reads a cell to LINE_INPUT_MAX units and gives an empty line when that part cleans
  // to nothing, with no marker, so a vendor cell whose first megabyte is blank read as naming no vendor
  // and the vendor written after it was lost without a count. Such a cell is no cell to read.
  describe("a vendor cell that lineOf cannot read to its end", () => {
    const NAME = "Zorbix Alpha Works";
    const OVERLONG: Array<[string, string]> = [
      ["blanks", `${" ".repeat(LINE_INPUT_MAX)}${NAME}`],
      ["hidden characters", `${ZERO_WIDTH_SPACE.repeat(LINE_INPUT_MAX)}${NAME}`],
      ["line breaks, which a cell turns into separators", `${"\n".repeat(LINE_INPUT_MAX)}${NAME}`],
      ["names", `${"Acme, ".repeat(Math.ceil(LINE_INPUT_MAX / 6))}${NAME}`],
    ];

    it.each(OVERLONG)(
      "makes the row unreadable and counts it, never a row that names no vendor: %s",
      async (_label, cell) => {
        expect(cell.length).toBeGreaterThan(LINE_INPUT_MAX);
        const snapshot = await download(inventoryCsv([{ vendor: cell }, { vendor: "Beta Labs" }]));
        expect(JSON.parse(snapshot.bodies[0]).unreadable).toBe(1);
        const parsed = ombAiInventoryConnector.parse(snapshot);
        // No name of the row is a vendor, and the row is counted as one that could not be read (skipped: it is within the allowance).
        expect(parsed.records.map((record) => record.sourceRecordId)).toEqual(["betalabs"]);
        expect(parsed.errors + (parsed.skipped ?? 0)).toBe(1);
      },
    );

    it("reads a vendor cell of exactly the limit, and refuses one of a unit more", async () => {
      const edge = `${" ".repeat(LINE_INPUT_MAX - NAME.length)}${NAME}`;
      expect(edge).toHaveLength(LINE_INPUT_MAX);
      const ok = await download(inventoryCsv([{ vendor: edge }]));
      expect(JSON.parse(ok.bodies[0]).unreadable).toBe(0);
      expect(
        ombAiInventoryConnector.parse(ok).records.map((record) => record.sourceRecordId),
      ).toEqual(["zorbixalphaworks"]);

      const over = await download(inventoryCsv([{ vendor: ` ${edge}` }]));
      expect(JSON.parse(over.bodies[0]).unreadable).toBe(1);
      expect(ombAiInventoryConnector.parse(over).records).toEqual([]);
    });

    it("reads nothing of an unreadable row, not even its agency: the agencies of the list are those of the rows that read", async () => {
      // 100 agencies are the most that a list may have, and the lean rows use 'AAA': 99 others make
      // 100. The row of a cell that is too long, with a 101st, must not count its agency, or the file
      // would be no list.
      const agencyCode = (n: number): string =>
        `${String.fromCharCode(65 + Math.floor(n / 26))}${String.fromCharCode(65 + (n % 26))}`;
      const useCases: UseCase[] = [
        ...Array.from({ length: 99 }, (_, n) => ({ agency: agencyCode(n), vendor: "Acme" })),
        { agency: "ZZZ", vendor: `${" ".repeat(LINE_INPUT_MAX)}${NAME}` },
      ];
      const snapshot = await download(inventoryCsv(useCases));
      expect(JSON.parse(snapshot.bodies[0]).unreadable).toBe(1);
      const records = ombAiInventoryConnector.parse(snapshot).records;
      expect(records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
      expect(records[0].identifiers.agencies).toBe(99);
    });
  });

  describe("what a record counts", () => {
    it("counts a use case once for each vendor it names, and once for a vendor that its cell names twice", async () => {
      const records = byId(
        await recordsOf(
          inventoryCsv([
            { vendor: "Acme Inc, Acme" },
            { vendor: "Acme, Beta Labs" },
            { vendor: "Beta Labs" },
          ]),
        ),
      );
      expect(records.get("acme")?.identifiers.useCases).toBe(2);
      expect(records.get("betalabs")?.identifiers.useCases).toBe(2);
    });

    it("counts the stages: deployed and piloted together, before deployment, retired, and no stage for the rest", async () => {
      const stages = [
        "Deployed",
        "Deployed",
        "Pilot",
        "Pre-deployment",
        "Retired",
        "Retired",
        "Retired",
        "",
        "Experimental",
        "deployed",
        "Deployed ",
      ];
      const records = await recordsOf(
        inventoryCsv(stages.map((stage) => ({ vendor: "Acme Inc", stage }))),
      );
      // The last is 'Deployed' with a blank behind it, which is a deployed use case; 'deployed' is not a stage.
      expect(records[0].summary).toContain(
        "11 use cases from 1 agency name it (4 deployed or piloted, 1 before deployment, 3 retired, 3 with no stage)",
      );
    });

    it("leaves a part out of the text when no use case is in it", async () => {
      const records = await recordsOf(
        inventoryCsv([
          { vendor: "Acme Inc", stage: "Retired" },
          { vendor: "Acme Inc", stage: "Retired" },
        ]),
      );
      expect(records[0].summary).toContain("2 use cases from 1 agency name it (2 retired).");
      for (const part of ["deployed or piloted", "before deployment", "with no stage"]) {
        expect(records[0].summary).not.toContain(part);
      }
    });

    it.each([
      [["AA"], "1 use case from 1 agency names it"],
      [["AA", "AA"], "2 use cases from 1 agency name it"],
      [["AA", "BB"], "2 use cases from 2 agencies name it"],
    ] as Array<[string[], string]>)(
      "writes the counts of the use cases of the agencies %j in the number of their nouns and of the verb",
      async (agencies, text) => {
        const records = await recordsOf(
          inventoryCsv(agencies.map((agency) => ({ agency, vendor: "Acme Inc" }))),
        );
        expect(records[0].summary).toContain(text);
        expect(records[0].summary).not.toMatch(/\b1 (?:use cases|agencies)/);
        expect(records[0].identifiers).toMatchObject({
          useCases: agencies.length,
          agencies: new Set(agencies).size,
        });
      },
    );

    it("counts the high-impact use cases by the agency's own label, exactly 'High-impact', and says so only when there are some", async () => {
      const impacts = [
        "High-impact",
        "High-impact ",
        "Not High-impact",
        "Presumed High-Impact, but Not High-impact",
        "high-impact",
        "",
      ];
      const records = await recordsOf(
        inventoryCsv(impacts.map((impact) => ({ vendor: "Acme Inc", impact }))),
      );
      expect(records[0].summary).toContain(
        "(6 deployed or piloted); 2 of them high-impact by the agency's own label.",
      );

      const none = await recordsOf(
        inventoryCsv([{ vendor: "Acme Inc", impact: "Not High-impact" }]),
      );
      expect(none[0].summary).not.toContain("high-impact by");
    });

    it("names the six agencies with the most use cases, then counts the others", async () => {
      const agencies = [
        ...Array(4).fill("AAA"),
        ...Array(3).fill("BBB"),
        ...Array(2).fill("CCC"),
        "FFF",
        "EEE",
        "DDD",
        "HHH",
        "GGG",
        "ZZZ",
      ];
      const records = await recordsOf(
        inventoryCsv(agencies.map((agency) => ({ agency, vendor: "Acme Inc" }))),
      );
      expect(records[0].summary).toContain("from 9 agencies name it");
      expect(records[0].summary).toContain("Agencies: AAA, BBB, CCC, DDD, EEE, FFF and 3 more.");
      expect(records[0].identifiers.agencies).toBe(9);
    });

    it("names all the agencies when there are six or fewer, in the order of their counts and then of their text", async () => {
      const records = await recordsOf(
        inventoryCsv([
          { agency: "ZZ", vendor: "Acme Inc" },
          { agency: "BB", vendor: "Acme Inc" },
          { agency: "BB", vendor: "Acme Inc" },
          { agency: "AA", vendor: "Acme Inc" },
        ]),
      );
      expect(records[0].summary).toContain("Agencies: BB, AA, ZZ.");
    });
  });

  describe("the record", () => {
    it("has an address of its own for each vendor: the repository's page with the vendor's key", async () => {
      const records = await recordsOf(
        inventoryCsv([{ vendor: "Acme Inc, Beta Labs, Élan Zéta" }, { vendor: "Gamma Works" }]),
      );
      expect(records.length).toBeGreaterThan(2);
      const urls = records.map((record) => record.url);
      expect(new Set(urls).size).toBe(urls.length);
      for (const record of records) {
        expect(record.url).toBe(`${RECORD_URL_PREFIX}${encodeURIComponent(record.sourceRecordId)}`);
      }
    });

    it("is not dated: an annual state, with the edition in its text, its identifiers and its list's version", async () => {
      const parsed = await parsedOf(inventoryCsv(SAMPLE_USE_CASES));
      expect(parsed.sourceVersion).toBe("2025");
      expect(parsed.records[0].summary).toContain("2025 edition:");
      expect(parsed.records[0].identifiers.edition).toBe("2025");
      expect(parsed.records[0].publishedAt).toBeNull();
      expect(parsed.records[0].sourceUpdatedAt).toBeNull();
    });

    it("says what it is not in its second sentence, and ends with the source sentence, which is never cut", async () => {
      const records = await recordsOf(inventoryCsv(SAMPLE_USE_CASES));
      expect(records[0].summary.startsWith(`${FIRST_SENTENCE} ${NOT_A_FINDING} `)).toBe(true);
      expect(records[0].summary.endsWith(SOURCE_SENTENCE)).toBe(true);
    });

    it("stays within 1,300 characters in the worst case that its caps allow, and keeps its second and its last sentence", async () => {
      // 100 agencies of six letters each, 3,000 use cases, a name of 60 characters.
      const agencyCode = (n: number): string =>
        `A${String.fromCharCode(65 + (n % 26))}${String.fromCharCode(65 + (Math.floor(n / 26) % 26))}AAA`;
      // A name of 60 characters, the most that a token may have, whose key (the letters) is 30.
      const display = `A${"b".repeat(20)}${"-".repeat(30)}${"c".repeat(9)}`;
      expect(display).toHaveLength(60);
      const useCases: UseCase[] = Array.from({ length: 3000 }, (_, index) => ({
        agency: agencyCode(index % 99),
        vendor: display,
        stage: ["Deployed", "Pilot", "Pre-deployment", "Retired", ""][index % 5],
        impact: index % 3 === 0 ? "High-impact" : "",
      }));
      const records = await recordsOf(inventoryCsv(useCases));

      expect(records).toHaveLength(1);
      const { summary } = records[0];
      expect(summary.length).toBeLessThanOrEqual(1300);
      expect(summary).toContain(NOT_A_FINDING);
      expect(summary.endsWith(SOURCE_SENTENCE)).toBe(true);
      expect(summary).toContain("3000 use cases from 99 agencies");
      expect(summary).toContain("and 93 more.");
      expectWellFormedRecords(records, { sourceId: "omb_ai_inventory", mark: MARK });
    });

    it("is the unit of the list: a vendor named by 120 use cases is one record", async () => {
      const records = await recordsOf(
        inventoryCsv(
          Array.from({ length: 120 }, (_, index) => ({
            vendor: "Acme Cloud",
            agency: index % 2 === 0 ? "AAA" : "BBB",
          })),
        ),
      );
      expect(records).toHaveLength(1);
      expect(records[0].identifiers.useCases).toBe(120);
    });
  });

  describe("what the file holds that no record may", () => {
    it("never lets the contact address, a prose column, a url column or any other column that is not read reach the body or a record", async () => {
      const csv = inventoryCsv(SAMPLE_USE_CASES);
      expect(csv).toContain(CONTACT_CANARY);
      expect(csv).toContain(`${CANARY}use_case_name`);
      const snapshot = await download(csv);
      const parsed = ombAiInventoryConnector.parse(snapshot);
      const everything = JSON.stringify([snapshot, parsed]);
      expect(everything).not.toContain(CANARY);
      expect(everything).not.toContain("example.test");
      for (const name of COLUMNS) expect(everything).not.toContain(`${CANARY}${name}`);
    });

    it("never lets a canary in the column of a vendor's contract, the id, the name of the agency or the dates through", async () => {
      const csv = inventoryCsv([{ vendor: "Acme Inc" }, { vendor: "Beta Labs" }]);
      const everything = JSON.stringify(await recordsOf(csv));
      for (const name of [
        "agency_name",
        "id",
        "operational_date",
        "contracting_usage",
        "link_to_data",
        "pia_url",
        "code_url",
      ]) {
        expect(everything).not.toContain(`${CANARY}${name}`);
      }
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
      const useCases: UseCase[] = hostile.map((vendor, index) => ({
        agency: `H${String.fromCharCode(65 + index)}`,
        vendor,
      }));
      const records = await recordsOf(inventoryCsv(useCases));

      expect(records.length).toBeGreaterThan(0);
      expectWellFormedRecords(records, { sourceId: "omb_ai_inventory", mark: MARK });
      for (const record of records) expect(JSON.stringify(record)).not.toMatch(/[<>]/);
    });

    it("reads a cell of 100 KB in little time, and keeps a bounded record", async () => {
      const big = `${"Acme; ".repeat(17_000)}Zulu Works`;
      expect(big.length).toBeGreaterThan(100_000);
      const started = Date.now();
      const records = await recordsOf(
        inventoryCsv([{ vendor: big, stage: "x".repeat(100_000), impact: "y".repeat(100_000) }]),
      );
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
      expectWellFormedRecords(records, { sourceId: "omb_ai_inventory", mark: MARK });
      expect(records[0].summary.length).toBeLessThanOrEqual(1300);
    });

    it("reads bytes that are no valid UTF-8, which no string can hold as a lone surrogate, without failing", async () => {
      const head = Buffer.from(inventoryCsv([{ vendor: "Acme @@ Works" }]));
      const at = head.indexOf("@@");
      const csv = Buffer.concat([
        head.subarray(0, at),
        Buffer.from([0xed, 0xa0, 0x80, 0xff, 0xfe]),
        head.subarray(at + 2),
      ]);
      const records = await recordsOf(csv);
      expect(records.length).toBeGreaterThan(0);
      expectWellFormedRecords(records, { sourceId: "omb_ai_inventory", mark: MARK });
    });

    it("takes a long run of separators, blanks, parentheses or addresses in a cell in little time", async () => {
      const cells = [
        ",".repeat(100_000),
        " ".repeat(100_000),
        ";".repeat(100_000),
        "(".repeat(100_000),
        "Acme (".repeat(30_000),
        "https://".repeat(30_000),
        "Acme and ".repeat(30_000),
        "a/".repeat(50_000),
      ];
      const started = Date.now();
      for (const cell of cells) await recordsOf(inventoryCsv([{ vendor: cell }]));
      expect(Date.now() - started).toBeLessThan(10_000);
    });
  });

  describe("rows that cannot be records", () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: "acme",
      display: "Acme Inc",
      names: ["Acme Inc"],
      useCases: 1,
      agencies: ["AAA"],
      stages: { deployedOrPiloted: 1, preDeployment: 0, retired: 0, none: 0 },
      highImpact: 0,
      edition: "2025",
      ...over,
    });
    const snapshotOfRows = (rows: unknown[]): Snapshot => {
      const body = JSON.stringify({ v: 1, rows, total: rows.length, unreadable: 0 });
      return { bodies: [body], etag: null, lastModified: null, bytes: body.length };
    };

    it("makes a record of a row of the shape that the reader makes", () => {
      const parsed = ombAiInventoryConnector.parse(snapshotOfRows([row()]));
      expect(parsed.records).toHaveLength(1);
      expect(parsed.errors).toBe(0);
    });

    it("counts a row whose id cannot be one as skipped, within the allowance, and keeps the others", () => {
      const rows = [
        ...Array.from({ length: 19 }, (_, index) => row({ id: `acme${index}` })),
        row({ id: "" }),
      ];
      const parsed = ombAiInventoryConnector.parse(snapshotOfRows(rows));
      expect(parsed.records).toHaveLength(19);
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
    });

    it.each([
      ["a display that is no text", { display: 7 }],
      ["names that are no list", { names: "Acme" }],
      ["a use case count of zero", { useCases: 0 }],
      ["a use case count that is no number", { useCases: "3" }],
      ["agencies that are no list", { agencies: "AAA" }],
      ["agencies that are no texts", { agencies: [1, 2] }],
      ["stages that are none", { stages: null }],
      [
        "a stage count that is negative",
        { stages: { deployedOrPiloted: -1, preDeployment: 0, retired: 0, none: 0 } },
      ],
      [
        "stage counts that do not add up to its use cases",
        { useCases: 3, stages: { deployedOrPiloted: 1, preDeployment: 0, retired: 0, none: 0 } },
      ],
      [
        "stage counts that add up to more than its use cases",
        { useCases: 1, stages: { deployedOrPiloted: 1, preDeployment: 1, retired: 0, none: 0 } },
      ],
      ["a high-impact count that is no number", { highImpact: "0" }],
      ["more high-impact use cases than use cases", { highImpact: 2 }],
      ["an edition that is no text", { edition: 2025 }],
      ["an edition that is no year", { edition: "twenty" }],
    ])("counts a row with %s as one that cannot be read", (_name, over) => {
      const rows = [
        ...Array.from({ length: 19 }, (_, index) => row({ id: `acme${index}` })),
        row({ id: "acme", ...over }),
      ];
      const parsed = ombAiInventoryConnector.parse(snapshotOfRows(rows));
      expect(parsed.records).toHaveLength(19);
      expect(parsed.skipped).toBe(1);
    });

    it("fails the list when more rows than the allowance cannot be read", () => {
      const parsed = ombAiInventoryConnector.parse(
        snapshotOfRows(Array.from({ length: 12 }, () => row({ id: "" }))),
      );
      expect(parsed.records).toHaveLength(0);
      expect(parsed.errors).toBe(12);
    });

    it("has no root for a body that its own download did not make", () => {
      const parsed = ombAiInventoryConnector.parse({
        bodies: ["not a body"],
        etag: null,
        lastModified: null,
        bytes: 0,
      });
      expect(parsed.root).toBeNull();
      expect(parsed.errors).toBeGreaterThan(0);
    });
  });

  describe("what it never does", () => {
    it("writes nothing to the logger or the console, whatever it reads and whatever fails", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
      );
      try {
        const snapshot = await download(inventoryCsv(SAMPLE_USE_CASES));
        ombAiInventoryConnector.parse(snapshot);
        await failureOf(ombAiInventoryConnector.download(fakeFetch({}), {}));
        await failureOf(
          downloadOf("not a list", { url: "https://evil.example.test/x?token=SECRET" }),
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
