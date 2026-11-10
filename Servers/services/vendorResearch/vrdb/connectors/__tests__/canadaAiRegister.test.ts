/**
 * The Government of Canada AI Register (connectors/canadaAiRegister.ts): a two-step fetch (the
 * dataset record on open.canada.ca, then the file it names, which the portal redirects to a signed
 * address on its storage host) with the portal's 20-second pause between the two requests, read as
 * a CSV of federal AI systems and grouped into one record per vendor. No network: a fake fetch and
 * synthetic files; the sleep is injected, so nothing here waits.
 */
import logger from "../../../../../utils/logger/fileLogger";
import { FetchError } from "../../../../webResearch/guardedFetch";
import type { ParsedRecord } from "../../types";
import {
  CANADA_AI_REGISTER_RECORD_MARK,
  canadaAiRegisterConnector,
  createCanadaAiRegisterConnector,
} from "../canadaAiRegister";
import { LINE_INPUT_MAX, SHORTENED, lineOf, shorten, unreadableAllowed } from "../kit/clean";
import type { Sleep } from "../kit/pause";
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

const MARK = CANADA_AI_REGISTER_RECORD_MARK;

/** Characters that a file can hide in a cell, built at run time (an escape would not survive the editor). */
const cp = (...codes: number[]): string => String.fromCodePoint(...codes);
const ZERO_WIDTH_SPACE = cp(0x200b);
const NO_BREAK_SPACE = cp(0xa0);
const RIGHT_TO_LEFT_OVERRIDE = cp(0x202e);
const BYTE_ORDER_MARK = cp(0xfeff);

// --- the portal's dataset record and file (every value invented, but the pinned dataset id) ---

const DATASET_ID = "fcbc0200-79ba-4fa4-94a6-00e32facea6b";
const PACKAGE_URL = `https://open.canada.ca/data/api/action/package_show?id=${DATASET_ID}`;
const RESOURCE_ID = "5a1c9e22-3b7d-4e0f-9a64-0123456789ab";
const PDF_ID = "9d2e7c10-4f6a-4b8d-8e35-abcdef012345";
const FILE_NAME = "example-register-04-26.csv";
const RESOURCE_URL = `https://open.canada.ca/data/dataset/${DATASET_ID}/resource/${RESOURCE_ID}/download/${FILE_NAME}`;
const SIGNATURE = "ZZ-SIGNED-SECRET";
const BLOB_URL = `https://opencanada.blob.core.windows.net/opengovprod/resources/${RESOURCE_ID}/${FILE_NAME}?sv=2024&sig=${SIGNATURE}`;
const LAST_MODIFIED = "2026-03-14T09:26:53.123456";
const SIZE = 4242;
const COMPOSITE = `${RESOURCE_ID}|${LAST_MODIFIED}|${SIZE}`;
const CANARY = "ZZ-";
const MAINTAINER_CANARY = `${CANARY}maintainer_email`;
const RECORD_URL_PREFIX = `https://open.canada.ca/data/en/dataset/${DATASET_ID}?vendor=`;

interface Resource {
  id: string;
  format: string;
  language: string[];
  url: string;
  last_modified: string;
  size: unknown;
}

const csvResource = (over: Partial<Resource> = {}): Resource => ({
  id: RESOURCE_ID,
  format: "CSV",
  language: ["en", "fr"],
  url: RESOURCE_URL,
  last_modified: LAST_MODIFIED,
  size: SIZE,
  ...over,
});

const pdfResource = (over: Partial<Resource> = {}): Resource => ({
  id: PDF_ID,
  format: "PDF",
  language: ["en", "fr"],
  url: `https://open.canada.ca/data/dataset/${DATASET_ID}/resource/${PDF_ID}/download/change-log.pdf`,
  last_modified: "2026-03-13T18:40:11.222333",
  size: 1234,
  ...over,
});

interface PackageOptions {
  success?: unknown;
  id?: unknown;
  license?: unknown;
  resources?: unknown;
}

const packageText = (over: PackageOptions = {}): string =>
  JSON.stringify({
    success: "success" in over ? over.success : true,
    result: {
      id: "id" in over ? over.id : DATASET_ID,
      license_id: "license" in over ? over.license : "ca-ogl-lgo",
      maintainer_email: MAINTAINER_CANARY,
      resources: "resources" in over ? over.resources : [csvResource(), pdfResource()],
    },
  });

// --- the register: 24 columns, the used ones filled, every other one a canary ---

const COLUMNS = [
  "ai_register_id",
  "name_ai_system_en",
  "name_ai_system_fr",
  "government_organization",
  "description_ai_system_en",
  "description_ai_system_fr",
  "ai_system_primary_users_en",
  "ai_system_primary_users_fr",
  "developed_by_en",
  "developed_by_fr",
  "vendor_information",
  "ai_system_status_en",
  "ai_system_status_fr",
  "status_date",
  "ai_system_capabilities_en",
  "ai_system_capabilities_fr",
  "data_sources_en",
  "data_sources_fr",
  "involves_personal_information",
  "personal_information_banks_en",
  "personal_information_banks_fr",
  "notification_ai",
  "ai_system_results_en",
  "ai_system_results_fr",
];

/** The columns that the connector reads; a file that lacks one is not the list. */
const USED_COLUMNS = [
  "ai_register_id",
  "name_ai_system_en",
  "government_organization",
  "vendor_information",
  "developed_by_en",
  "ai_system_status_en",
];

const columnOf = (name: string): number => COLUMNS.indexOf(name);

const ORG_A = "Department of Examples / Ministère des Exemples";
const ORG_B = "Office of Tests / Bureau des essais";

interface System {
  id?: string;
  name?: string;
  org?: string;
  vendor?: string;
  status?: string;
}

function systemRow(system: System = {}): string[] {
  const cells = COLUMNS.map((name) => `${CANARY}${name}`);
  cells[columnOf("ai_register_id")] = system.id ?? "2526-EX-001";
  cells[columnOf("name_ai_system_en")] = system.name ?? "Example system";
  cells[columnOf("government_organization")] = system.org ?? ORG_A;
  cells[columnOf("vendor_information")] = system.vendor ?? "";
  cells[columnOf("ai_system_status_en")] = system.status ?? "In production";
  return cells;
}

/** Systems that name no vendor, as 244 of the register's 412 do. */
const fillerRows = (count: number, from = 1): string[][] =>
  Array.from({ length: count }, (_, index) =>
    systemRow({
      id: `2526-FILL-${String(from + index).padStart(4, "0")}`,
      name: `Filler system ${from + index}`,
      org: ORG_B,
    }),
  );

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
  { header = COLUMNS, eol = "\r\n", bom = true, finalEol = true }: CsvOptions = {},
): string {
  const lines = [header, ...rows].map((row) => row.map(quote).join(","));
  return `${bom ? BYTE_ORDER_MARK : ""}${lines.join(eol)}${finalEol ? eol : ""}`;
}

/** The floor of the reader is 200 rows: a file made of a few systems is padded with filler ones. */
const PADDED = 205;

function registerCsv(systems: readonly System[], options: CsvOptions & { pad?: number } = {}) {
  const { pad = PADDED, ...csv } = options;
  const rows = systems.map(systemRow);
  return csvOf([...rows, ...fillerRows(Math.max(0, pad - rows.length))], csv);
}

// --- running the connector ---

const sleepMock = (): jest.Mock<Promise<void>, [number]> =>
  jest.fn<Promise<void>, [number]>(async () => undefined);

const newConnector = (sleep: Sleep = sleepMock()) => createCanadaAiRegisterConnector({ sleep });

interface FileOptions {
  packageText?: string;
  packageFile?: Partial<FakeFile>;
  csvFile?: Partial<FakeFile>;
}

function filesOf(csv: string | Buffer, options: FileOptions = {}): Record<string, FakeFile> {
  return {
    [PACKAGE_URL]: {
      body: options.packageText ?? packageText(),
      contentType: "application/json;charset=utf-8",
      ...options.packageFile,
    },
    [RESOURCE_URL]: {
      body: csv,
      contentType: "text/csv",
      url: BLOB_URL,
      etag: '"0x8D0000000000001"',
      lastModified: "Sat, 14 Mar 2026 09:26:53 GMT",
      ...options.csvFile,
    },
  };
}

const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

async function download(
  csv: string | Buffer,
  options: FileOptions = {},
  sleep: Sleep = sleepMock(),
): Promise<Snapshot> {
  const answer = await newConnector(sleep).download(fakeFetch(filesOf(csv, options)), {});
  if (answer === "unchanged") throw new Error("The fake fetch answered unchanged.");
  return answer;
}

const parsedOf = async (csv: string | Buffer, options: FileOptions = {}) =>
  newConnector().parse(await download(csv, options));

const recordsOf = async (csv: string | Buffer, options: FileOptions = {}) =>
  (await parsedOf(csv, options)).records;

const byId = (records: readonly ParsedRecord[]): Map<string, ParsedRecord> =>
  new Map(records.map((record) => [record.sourceRecordId, record]));

const vendorOf = (record: ParsedRecord): string => String(record.identifiers.vendor);

/** The vendors that a vendor_information cell gives: id and display, in the order of the ids. */
async function vendorsOf(cell: string): Promise<Array<[string, string]>> {
  const records = await recordsOf(registerCsv([{ vendor: cell }]));
  return records.map((record): [string, string] => [record.sourceRecordId, vendorOf(record)]);
}

// --- texts that are cut where a cut is hard to see ---

const GRINNING_FACE = cp(0x1f600);

/** Words of three letters, no legal form among them. */
const THREE_LETTERS = [
  "Ace",
  "Bay",
  "Cor",
  "Den",
  "Eko",
  "Fin",
  "Gar",
  "Hux",
  "Ivo",
  "Jax",
  "Kin",
  "Lex",
];

/**
 * A text of `units` units made of words of three letters with a blank between them: the first word is
 * `at % 4` letters long (four when that is 0), so that unit `at` is a blank and so is every fourth unit
 * after it. The last word is made of Z, which no legal form is. Its key (the letters) is three quarters
 * of its length.
 */
function wordsOf(units: number, at: number): string {
  const first = at % 4 === 0 ? 4 : at % 4;
  let text = `${"Q".repeat(first)} `;
  for (let word = 0; text.length + 5 <= units; word += 1) {
    text += `${THREE_LETTERS[word % THREE_LETTERS.length]} `;
  }
  return `${text}${"Z".repeat(units - text.length)}`;
}

/** The text with units `at` and `at + 1` made one astral character: a pair of surrogates that a cut at `at + 1` would split. */
const withPairAt = (text: string, at: number): string =>
  `${text.slice(0, at)}${GRINNING_FACE}${text.slice(at + 2)}`;

/** The key that a name of letters, digits and blanks gives: no blank, lower case. */
const keyOfName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The two places where the cut of `lineOf` leaves a line shorter than its cap. */
const SHORT_CUTS: Array<[string, "blank" | "pair"]> = [
  ["a blank, which the cut takes off", "blank"],
  ["a pair of surrogates, which the cut does not split", "pair"],
];

/** The longest vendor cell that the connector reads whole, as the connector has it. */
const VENDOR_CELL_CAP = 200;

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

// --- the sample record: one vendor, three systems of two departments ---

const SAMPLE_SYSTEMS: System[] = [
  {
    id: "2526-EX-001",
    name: "Alpha Triage Assistant",
    org: ORG_A,
    vendor: "Acme Inc",
    status: "In production",
  },
  {
    id: "2526-EX-002",
    name: "Beta Translator",
    org: ORG_A,
    vendor: "Acme Inc",
    status: "in development",
  },
  { id: "2526-OT-001", name: "Gamma Planner", org: ORG_B, vendor: "Acme Inc", status: "" },
];

const FIRST_SENTENCE =
  "Government of Canada AI Register (open.canada.ca), a register or status list.";
const NOT_A_FINDING =
  "A record is federal departments' own statement that AI systems they use name this vendor in " +
  "their vendor information; it says nothing about the vendor's conduct or the systems' quality.";
const LAST_SENTENCE =
  "The register is not planned to be updated. Contains information licensed under the Open " +
  "Government Licence - Canada; adapted by VerifyWise.";

const SAMPLE_SUMMARY = [
  FIRST_SENTENCE,
  NOT_A_FINDING,
  "Vendor as written: Acme Inc.",
  "Release of 2026-03-14: 3 AI systems name it (in production 1, in development 1, no status 1), " +
    "reported by Department of Examples, Office of Tests.",
  "Systems: Alpha Triage Assistant; Beta Translator; Gamma Planner.",
  LAST_SENTENCE,
].join(" ");

describe("canadaAiRegisterConnector", () => {
  describe("what it is", () => {
    it("is the connector of canada_ai_register, a snapshot connector at version 1", () => {
      for (const connector of [canadaAiRegisterConnector, createCanadaAiRegisterConnector()]) {
        expect(connector.id).toBe("canada_ai_register");
        expect(connector.version).toBe(1);
        expect(connector.kind).toBeUndefined();
        expect(typeof connector.download).toBe("function");
        expect(typeof connector.parse).toBe("function");
      }
    });

    it("exports the mark that every record begins with", () => {
      expect(CANADA_AI_REGISTER_RECORD_MARK).toBe("Government of Canada AI Register");
    });
  });

  describe("the happy path: the record and the file, then the records", () => {
    it("makes one record of a vendor, from its systems, with its text word for word", async () => {
      const parsed = await parsedOf(registerCsv(SAMPLE_SYSTEMS));

      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(parsed.root).not.toBeNull();
      expect(parsed.sourceVersion).toBe("2026-03-14");
      expect(parsed.records).toHaveLength(1);
      const [record] = parsed.records;
      expect(record).toEqual({
        sourceRecordId: "acme",
        recordType: "algorithm_register_supplier",
        title: "Government of Canada AI Register: Acme Inc",
        summary: SAMPLE_SUMMARY,
        url: `${RECORD_URL_PREFIX}acme`,
        identifiers: {
          vendor: "Acme Inc",
          systems: 3,
          release: "2026-03-14",
          registerIds: ["2526-EX-001", "2526-EX-002", "2526-OT-001"],
        },
        matchKeys: ["name:acmeinc", "name:acme"],
        publishedAt: null,
        sourceUpdatedAt: null,
      });
    });

    it("gives records that are well formed and begin with the mark", async () => {
      const records = await recordsOf(registerCsv(SAMPLE_SYSTEMS));
      expectWellFormedRecords(records, { sourceId: "canada_ai_register", mark: MARK });
      for (const record of records) expect(record.summary.startsWith(MARK)).toBe(true);
    });

    it("gives no record for a register in which no system names a vendor, and no version of the list", async () => {
      const parsed = await parsedOf(registerCsv([]));
      expect(parsed.records).toEqual([]);
      expect(parsed.errors).toBe(0);
      expect(parsed.skipped).toBe(0);
      expect(parsed.root).not.toBeNull();
      // The release day is carried by the vendors' rows: with none there is none to name.
      expect(parsed.sourceVersion).toBeNull();
    });

    it("keeps a person-shaped supplier as any other name: a sole trader who is the supplier is the accepted residual", async () => {
      // No rule tells a person from a company in this field (1 of 127 names, a sole trader); none is applied.
      expect(await vendorsOf("Pat Sample")).toEqual([["patsample", "Pat Sample"]]);
    });

    it("makes records that two bodies of the same file in two orders give alike", async () => {
      const systems: System[] = [
        ...SAMPLE_SYSTEMS,
        // Equal counts everywhere, so that only the rule of the order can decide.
        ...["Acme", "ACME", "acme", "Acme Inc", "ACME Inc", "Acme Ltd", "Acme Corp"].map(
          (vendor, index) => ({
            id: `2526-TIE-${String(index).padStart(3, "0")}`,
            name: `Tie system ${index}`,
            org: `Tie department ${index} / Ministère ${index}`,
            vendor,
            status: index % 2 === 0 ? "Retired" : "",
          }),
        ),
        ...Array.from({ length: 25 }, (_, index) => ({
          id: `2526-MANY-${String(index).padStart(3, "0")}`,
          name: `Many system ${index}`,
          vendor: "Many Ids Ltd",
        })),
        { vendor: "Zeta Works, Beta Works / Delta Works" },
      ];
      const rows = [...systems.map(systemRow), ...fillerRows(205)];
      await expectDeterministic(newConnector(), (reversed) =>
        fakeFetch(filesOf(csvOf(reversed ? [...rows].reverse() : rows))),
      );
    });
  });

  describe("download: the dataset record, the pause, the file", () => {
    const CSV = registerCsv(SAMPLE_SYSTEMS);

    it("asks the dataset record, then the file, with no validators and the limits of each", async () => {
      const fetch = fakeFetch(filesOf(CSV));
      await newConnector().download(fetch, {});

      expect(fetch.calls).toEqual([
        {
          url: PACKAGE_URL,
          validators: {},
          limits: {
            maxBytes: 1_048_576,
            allowedContentTypes: ["application/json"],
            totalTimeoutMs: 60_000,
          },
        },
        {
          url: RESOURCE_URL,
          validators: {},
          limits: {
            maxBytes: 8_388_608,
            allowedContentTypes: ["text/csv", "application/octet-stream"],
            totalTimeoutMs: 120_000,
          },
        },
      ]);
    });

    it("waits 20 seconds between the two requests, as open.canada.ca asks: the pause is asked once, after the first and before the second", async () => {
      const fetch = fakeFetch(filesOf(CSV));
      const requestsWhenAsked: number[] = [];
      const sleep = jest.fn<Promise<void>, [number]>(async () => {
        requestsWhenAsked.push(fetch.calls.length);
      });

      await newConnector(sleep).download(fetch, {});

      expect(sleep).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalledWith(20_000);
      expect(requestsWhenAsked).toEqual([1]);
      expect(fetch.calls).toHaveLength(2);
    });

    it("waits the 20 seconds with a real timer when it is given no sleep", async () => {
      jest.useFakeTimers();
      try {
        const fetch = fakeFetch(filesOf(CSV));
        const pending = canadaAiRegisterConnector.download(fetch, {});

        await jest.advanceTimersByTimeAsync(19_999);
        expect(fetch.calls).toHaveLength(1);
        await jest.advanceTimersByTimeAsync(1);
        const snapshot = await pending;

        expect(fetch.calls).toHaveLength(2);
        expect(snapshot).not.toBe("unchanged");
      } finally {
        jest.useRealTimers();
      }
    });

    it("gives one snapshot: the body of the vendors, the prefix of the version, the composite validator, the bytes of both answers", async () => {
      const snapshot = await download(CSV);

      expect(snapshot.bodies).toHaveLength(1);
      expect(snapshot.etag).toBe("k1:");
      expect(snapshot.lastModified).toBe(COMPOSITE);
      expect(snapshot.bytes).toBe(Buffer.byteLength(packageText()) + Buffer.byteLength(CSV));
    });

    it("keeps nothing of the storage host's own validators: the composite is the only one", async () => {
      const snapshot = await download(CSV, {
        csvFile: { etag: '"0xSTORAGE"', lastModified: "Sat, 14 Mar 2026 09:26:53 GMT" },
      });
      expect(snapshot.etag).toBe("k1:");
      expect(snapshot.lastModified).toBe(COMPOSITE);
    });

    describe("the composite validator '<resource id>|<last_modified>|<size>'", () => {
      it("answers unchanged after the first request alone when it equals the stored one: no file, no pause", async () => {
        const sleep = sleepMock();
        const connector = newConnector(sleep);
        const first = await connector.download(fakeFetch(filesOf(CSV)), {});
        expect(first).not.toBe("unchanged");
        const stored = first as Snapshot;
        sleep.mockClear();

        const fetch = fakeFetch(filesOf(CSV));
        const answer = await connector.download(fetch, {
          etag: stored.etag,
          lastModified: stored.lastModified,
        });

        expect(answer).toBe("unchanged");
        expect(fetch.calls.map((call) => call.url)).toEqual([PACKAGE_URL]);
        expect(sleep).not.toHaveBeenCalled();
      });

      it.each([
        ["its last_modified", { last_modified: "2026-06-01T08:00:00.000001" }],
        ["its size", { size: SIZE + 1 }],
        [
          "its resource (a new release is a new resource)",
          {
            id: "7b3d1f44-0c2e-4a9b-9d58-fedcba987654",
            url: `https://open.canada.ca/data/dataset/${DATASET_ID}/resource/7b3d1f44-0c2e-4a9b-9d58-fedcba987654/download/${FILE_NAME}`,
          },
        ],
      ])(
        "asks again, pauses and reads the file when the resource changed %s",
        async (_name, change) => {
          const sleep = sleepMock();
          const connector = newConnector(sleep);
          const stored = (await connector.download(fakeFetch(filesOf(CSV)), {})) as Snapshot;
          sleep.mockClear();

          const resource = csvResource(change);
          const fetch = fakeFetch({
            ...filesOf(CSV, { packageText: packageText({ resources: [resource, pdfResource()] }) }),
            [resource.url]: { body: CSV, contentType: "text/csv", url: BLOB_URL },
          });
          const answer = await connector.download(fetch, {
            etag: stored.etag,
            lastModified: stored.lastModified,
          });

          expect(answer).not.toBe("unchanged");
          expect(fetch.calls).toHaveLength(2);
          expect(sleep).toHaveBeenCalledTimes(1);
          expect((answer as Snapshot).lastModified).not.toBe(stored.lastModified);
        },
      );

      it("is not sent to the file: a stored validator that equals the composite changes nothing about the second request", async () => {
        const fetch = fakeFetch(filesOf(CSV));
        await newConnector().download(fetch, { etag: "k1:", lastModified: "not the composite" });
        expect(fetch.calls.map((call) => call.validators)).toEqual([{}, {}]);
      });

      it("reads the file again after a bump of the version, whatever the stored composite says", async () => {
        const fetch = fakeFetch(filesOf(CSV));
        // Stored by the reading of another version: the kit sends no validators then.
        const answer = await newConnector().download(fetch, {
          etag: "k0:",
          lastModified: COMPOSITE,
        });
        expect(answer).not.toBe("unchanged");
        expect(fetch.calls).toHaveLength(2);
      });

      it("reads the file when the stored etag has no prefix at all (a copy of older code)", async () => {
        const fetch = fakeFetch(filesOf(CSV));
        const answer = await newConnector().download(fetch, {
          etag: null,
          lastModified: COMPOSITE,
        });
        expect(answer).not.toBe("unchanged");
        expect(fetch.calls).toHaveLength(2);
      });
    });
  });

  describe("step 1: the dataset record", () => {
    /** A record that is not the list: refused as such, after one request, before the pause. */
    async function expectNotTheList(options: FileOptions) {
      const sleep = sleepMock();
      const fetch = fakeFetch(filesOf(registerCsv(SAMPLE_SYSTEMS), options));
      const failure = await failureOf(newConnector(sleep).download(fetch, {}));
      expect(failure).toBeInstanceOf(NotTheListError);
      expect((failure as Error).message).toBe("The file is not the list.");
      expect(fetch.calls).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
    }

    it.each([
      ["a licence other than ca-ogl-lgo", packageText({ license: "other-licence" })],
      ["no licence", packageText({ license: undefined })],
      ["a licence in upper case", packageText({ license: "CA-OGL-LGO" })],
      ["success that is not true", packageText({ success: false })],
      ["success as a text", packageText({ success: "true" })],
      ["another dataset id", packageText({ id: "00000000-0000-4000-8000-000000000000" })],
      ["no resources", packageText({ resources: [] })],
      ["resources that are no list", packageText({ resources: { 0: csvResource() } })],
      ["no CSV resource", packageText({ resources: [pdfResource()] })],
      [
        "a CSV resource that is not in English",
        packageText({ resources: [csvResource({ language: ["fr"] }), pdfResource()] }),
      ],
      [
        "a CSV resource with no language",
        packageText({ resources: [csvResource({ language: [] }), pdfResource()] }),
      ],
      [
        "two CSV resources in English",
        packageText({
          resources: [
            csvResource(),
            csvResource({
              id: "7b3d1f44-0c2e-4a9b-9d58-fedcba987654",
              url: `https://open.canada.ca/data/dataset/${DATASET_ID}/resource/7b3d1f44-0c2e-4a9b-9d58-fedcba987654/download/other.csv`,
            }),
          ],
        }),
      ],
      [
        "a resource url on another dataset",
        packageText({
          resources: [
            csvResource({
              url: `https://open.canada.ca/data/dataset/00000000-0000-4000-8000-000000000000/resource/${RESOURCE_ID}/download/${FILE_NAME}`,
            }),
          ],
        }),
      ],
      [
        "a resource url on another host",
        packageText({
          resources: [
            csvResource({
              url: `https://example.test/data/dataset/${DATASET_ID}/resource/${RESOURCE_ID}/download/${FILE_NAME}`,
            }),
          ],
        }),
      ],
      [
        "a resource url without https",
        packageText({
          resources: [
            csvResource({
              url: `http://open.canada.ca/data/dataset/${DATASET_ID}/resource/${RESOURCE_ID}/download/${FILE_NAME}`,
            }),
          ],
        }),
      ],
      [
        "a resource url that is no CSV file",
        packageText({
          resources: [
            csvResource({
              url: `https://open.canada.ca/data/dataset/${DATASET_ID}/resource/${RESOURCE_ID}/download/register.pdf`,
            }),
          ],
        }),
      ],
      [
        "a resource url with a query",
        packageText({ resources: [csvResource({ url: `${RESOURCE_URL}?x=1` })] }),
      ],
      [
        "a resource url with a fragment",
        packageText({ resources: [csvResource({ url: `${RESOURCE_URL}#x` })] }),
      ],
      [
        "a resource url with a deeper path",
        packageText({
          resources: [
            csvResource({
              url: `https://open.canada.ca/data/dataset/${DATASET_ID}/resource/${RESOURCE_ID}/download/a/b.csv`,
            }),
          ],
        }),
      ],
      [
        "a resource url with a port",
        packageText({
          resources: [
            csvResource({
              url: `https://open.canada.ca:8443/data/dataset/${DATASET_ID}/resource/${RESOURCE_ID}/download/${FILE_NAME}`,
            }),
          ],
        }),
      ],
      [
        "a resource url with a user name",
        packageText({
          resources: [
            csvResource({
              url: `https://user@open.canada.ca/data/dataset/${DATASET_ID}/resource/${RESOURCE_ID}/download/${FILE_NAME}`,
            }),
          ],
        }),
      ],
      [
        "a resource url that is relative",
        packageText({
          resources: [
            csvResource({
              url: `/data/dataset/${DATASET_ID}/resource/${RESOURCE_ID}/download/${FILE_NAME}`,
            }),
          ],
        }),
      ],
      [
        "a resource id in upper case",
        packageText({
          resources: [
            csvResource({
              id: RESOURCE_ID.toUpperCase(),
              url: `https://open.canada.ca/data/dataset/${DATASET_ID}/resource/${RESOURCE_ID.toUpperCase()}/download/${FILE_NAME}`,
            }),
          ],
        }),
      ],
      [
        "a file name of more than 200 characters",
        packageText({
          resources: [
            csvResource({
              url: `https://open.canada.ca/data/dataset/${DATASET_ID}/resource/${RESOURCE_ID}/download/${"a".repeat(201)}.csv`,
            }),
          ],
        }),
      ],
      [
        "a resource id that is no id",
        packageText({ resources: [csvResource({ id: "not-an-id" })] }),
      ],
      [
        "no last_modified",
        packageText({
          resources: [csvResource({ last_modified: undefined as unknown as string })],
        }),
      ],
      [
        "a last_modified that is no day",
        packageText({ resources: [csvResource({ last_modified: "yesterday afternoon" })] }),
      ],
      [
        "a last_modified of a day that does not exist",
        packageText({ resources: [csvResource({ last_modified: "2026-02-30T00:00:00" })] }),
      ],
      [
        "a size that makes the composite longer than 200 characters",
        packageText({ resources: [csvResource({ size: "9".repeat(200) })] }),
      ],
      ["a record that is not JSON", "<html>maintenance</html>"],
      ["a record that is an array", "[]"],
      ["a record that is null", "null"],
      ["an empty record", ""],
    ])("is not the list: %s", async (_name, text) => {
      await expectNotTheList({ packageText: text });
    });

    it("takes the CSV resource in English whatever its place, and ignores the others", async () => {
      const fetch = fakeFetch(
        filesOf(registerCsv(SAMPLE_SYSTEMS), {
          packageText: packageText({
            resources: [
              pdfResource({ language: ["en"] }),
              csvResource({ language: ["fr"], id: "11111111-2222-4333-8444-555555555555" }),
              csvResource({ format: " csv " }),
            ],
          }),
        }),
      );
      const answer = await newConnector().download(fetch, {});
      expect(answer).not.toBe("unchanged");
      expect(fetch.calls[1].url).toBe(RESOURCE_URL);
    });

    it("keeps nothing of the record but the release day: the contact address of the record never reaches the snapshot", async () => {
      const snapshot = await download(registerCsv(SAMPLE_SYSTEMS));
      expect(JSON.stringify(snapshot)).not.toContain(MAINTAINER_CANARY);
      expect(JSON.stringify(snapshot)).not.toContain("maintainer");
    });

    it("fails as too large when the record was cut at its limit, and asks no more", async () => {
      const sleep = sleepMock();
      const fetch = fakeFetch(
        filesOf(registerCsv(SAMPLE_SYSTEMS), { packageFile: { truncated: true } }),
      );
      const failure = await failureOf(newConnector(sleep).download(fetch, {}));
      expect(failure).toBeInstanceOf(BodyTooLargeError);
      expect(fetch.calls).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it("fails a record that is not served as JSON, as the guard fails an unsupported type", async () => {
      const fetch = fakeFetch(
        filesOf(registerCsv(SAMPLE_SYSTEMS), { packageFile: { contentType: "text/html" } }),
      );
      const failure = await failureOf(newConnector().download(fetch, {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unsupported_type");
    });

    it.each([
      ["another host", "https://example.test/data/api/action/package_show?id=x"],
      ["another path of the portal", "https://open.canada.ca/data/en/dataset/x"],
      ["plain http", "http://open.canada.ca/data/api/action/package_show?id=x"],
      [
        "a host that only starts like the portal",
        "https://open.canada.ca.evil.test/data/api/action/p",
      ],
    ])("fails a record that %s answered, as not allowed, and asks no more", async (_name, from) => {
      const sleep = sleepMock();
      const fetch = fakeFetch(filesOf(registerCsv(SAMPLE_SYSTEMS), { packageFile: { url: from } }));
      const failure = await failureOf(newConnector(sleep).download(fetch, {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("not_allowed");
      expect((failure as Error).message).not.toContain("evil");
      expect(fetch.calls).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it("lets a failure of the first request through as it is", async () => {
      const failure = await failureOf(newConnector().download(fakeFetch({}), {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");
    });

    it("refuses an answer of unchanged to a request that sent no validator", async () => {
      const fetch: ConnectorFetch = async (url) => ({ notModified: true, url });
      const failure = await failureOf(newConnector().download(fetch, {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");
    });
  });

  describe("step 2: the file and the storage host it is redirected to", () => {
    const CSV = registerCsv(SAMPLE_SYSTEMS);

    it("takes the file from the signed address of the storage host under /opengovprod/resources/, and keeps no part of that address", async () => {
      const snapshot = await download(CSV);
      const kept = JSON.stringify(snapshot);
      for (const part of [SIGNATURE, "sig=", "blob.core.windows.net", "opengovprod", FILE_NAME]) {
        expect(kept).not.toContain(part);
      }
      expect(snapshot.bodies[0]).not.toContain("open.canada.ca");
    });

    it.each([
      ["another host", `https://evil.example.test/opengovprod/resources/x/f.csv?sig=${SIGNATURE}`],
      [
        "the storage host under another path",
        `https://opencanada.blob.core.windows.net/other/resources/x/f.csv?sig=${SIGNATURE}`,
      ],
      [
        "the storage host at the root",
        `https://opencanada.blob.core.windows.net/f.csv?sig=${SIGNATURE}`,
      ],
      [
        "the storage host in a directory that only starts like it",
        `https://opencanada.blob.core.windows.net/opengovprod/resourcesX/f.csv?sig=${SIGNATURE}`,
      ],
      [
        "a climb out of the directory",
        `https://opencanada.blob.core.windows.net/opengovprod/resources/../other/f.csv?sig=${SIGNATURE}`,
      ],
      [
        "a host that only starts like the storage host",
        `https://opencanada.blob.core.windows.net.evil.example.test/opengovprod/resources/x/f.csv?sig=${SIGNATURE}`,
      ],
      [
        "plain http",
        `http://opencanada.blob.core.windows.net/opengovprod/resources/x/f.csv?sig=${SIGNATURE}`,
      ],
      [
        "another port",
        `https://opencanada.blob.core.windows.net:8443/opengovprod/resources/x/f.csv?sig=${SIGNATURE}`,
      ],
      [
        "a user name",
        `https://user:secret@opencanada.blob.core.windows.net/opengovprod/resources/x/f.csv?sig=${SIGNATURE}`,
      ],
      [
        "the portal itself, with no redirect to the storage host",
        `https://open.canada.ca/opengovprod/resources/x/f.csv?sig=${SIGNATURE}`,
      ],
    ])(
      "fails a file that %s answered, as not allowed, naming no part of the address",
      async (_name, from) => {
        const failure = await failureOf(
          newConnector().download(fakeFetch(filesOf(CSV, { csvFile: { url: from } })), {}),
        );
        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("not_allowed");
        const message = (failure as Error).message;
        for (const part of [SIGNATURE, "sig=", "evil", "opengovprod", "blob", "secret", "https"]) {
          expect(message).not.toContain(part);
        }
      },
    );

    it("fails a file cut at its limit as too large, and reads none of it", async () => {
      const failure = await failureOf(
        newConnector().download(fakeFetch(filesOf(CSV, { csvFile: { truncated: true } })), {}),
      );
      expect(failure).toBeInstanceOf(BodyTooLargeError);
    });

    it("takes the file as text/csv or as application/octet-stream, and no other type", async () => {
      for (const contentType of [
        "text/csv",
        "text/csv; charset=utf-8",
        "application/octet-stream",
      ]) {
        const answer = await newConnector().download(
          fakeFetch(filesOf(CSV, { csvFile: { contentType } })),
          {},
        );
        expect(answer).not.toBe("unchanged");
      }
      for (const contentType of ["text/plain", "text/html", "application/json"]) {
        const failure = await failureOf(
          newConnector().download(fakeFetch(filesOf(CSV, { csvFile: { contentType } })), {}),
        );
        expect(failure).toBeInstanceOf(FetchError);
        expect((failure as FetchError).reason).toBe("unsupported_type");
      }
    });

    it("never gives a snapshot when the file cannot be reached: the failure goes through as it is", async () => {
      const files = filesOf(CSV);
      delete files[RESOURCE_URL];
      const failure = await failureOf(newConnector().download(fakeFetch(files), {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");
    });

    it("lets a refusal of the file through with its reason and its wait", async () => {
      const files = filesOf(CSV);
      const inner = fakeFetch(files);
      const refusing: ConnectorFetch = async (url, validators, limits) => {
        if (url === RESOURCE_URL) {
          throw new FetchError("blocked_by_site", undefined, { status: 429, retryAfterMs: 20_000 });
        }
        return inner(url, validators, limits);
      };
      const failure = await failureOf(newConnector().download(refusing, {}));
      expect(failure).toMatchObject({
        reason: "blocked_by_site",
        status: 429,
        retryAfterMs: 20_000,
      });
    });

    it("refuses an answer of unchanged to the request of the file, which sent no validator", async () => {
      const inner = fakeFetch(filesOf(CSV));
      const fetch: ConnectorFetch = async (url, validators, limits) =>
        url === RESOURCE_URL
          ? { notModified: true, url: BLOB_URL }
          : inner(url, validators, limits);
      const failure = await failureOf(newConnector().download(fetch, {}));
      expect(failure).toBeInstanceOf(FetchError);
      expect((failure as FetchError).reason).toBe("unreachable");
    });

    it("fails a file that is not the list as such, whatever it is", async () => {
      for (const body of ["", "<html>maintenance</html>", "id,other\n1,2\n", "a,b,c\n"]) {
        const failure = await failureOf(newConnector().download(fakeFetch(filesOf(body)), {}));
        expect(failure).toBeInstanceOf(NotTheListError);
      }
    });

    it("never gives a shorter list for text that begins a quote and never closes it: that is a cut file", async () => {
      // Nothing of such a text can be checked, so it is not taken for a list that is some other file.
      const failure = await failureOf(
        newConnector().download(fakeFetch(filesOf(`${BYTE_ORDER_MARK}"unclosed`)), {}),
      );
      expect(failure).toBeInstanceOf(BodyTooLargeError);
    });
  });

  describe("the reader: the file as the register publishes it", () => {
    it("reads a file with a byte order mark, CRLF row ends, bare line feeds inside quoted cells and hidden characters", async () => {
      const systems: System[] = [
        {
          id: "2526-EX-001",
          name: "Line\nbreak system",
          vendor: `Acme${ZERO_WIDTH_SPACE}${NO_BREAK_SPACE}Inc,\nBeta Labs`,
          status: "In production ",
        },
        { id: "2526-EX-002", name: "Second", vendor: "Acme Inc", status: "in production" },
        { id: "2526-EX-003", name: "Third", vendor: "Beta Labs", status: "IN DEVELOPMENT" },
      ];
      const csv = registerCsv(systems);
      expect(csv.startsWith(BYTE_ORDER_MARK)).toBe(true);
      expect(csv).toContain("\r\n");
      expect(csv).toContain('"Line\nbreak system"');

      const records = byId(await recordsOf(csv));
      expect([...records.keys()]).toEqual(["acme", "betalabs"]);
      const acme = records.get("acme")!;
      expect(acme.identifiers.systems).toBe(2);
      expect(acme.summary).toContain("2 AI systems name it (in production 2)");
      expect(acme.summary).toContain("Systems: Line break system; Second.");
      const beta = records.get("betalabs")!;
      expect(beta.identifiers.systems).toBe(2);
      expect(beta.summary).toContain("(in production 1, in development 1)");
      expectWellFormedRecords([...records.values()], {
        sourceId: "canada_ai_register",
        mark: MARK,
      });
    });

    it("counts the five spellings of a status as three states and no status: anything else, or nothing, is no status", async () => {
      const statuses = [
        "In production",
        "In production ",
        "in production",
        "In development",
        " in development",
        "Retired",
        "RETIRED",
        "",
        "Suspended",
        "In production soon",
      ];
      const records = await recordsOf(
        registerCsv(
          statuses.map((status, index) => ({ id: `2526-ST-${index}`, vendor: "Acme Inc", status })),
        ),
      );
      expect(records[0].summary).toContain(
        "10 AI systems name it (in production 3, in development 2, retired 2, no status 3)",
      );
    });

    it("leaves a state out of the text when no system is in it", async () => {
      const records = await recordsOf(
        registerCsv([
          { vendor: "Acme Inc", status: "Retired", id: "2526-A-001" },
          { vendor: "Acme Inc", status: "Retired", id: "2526-A-002" },
        ]),
      );
      expect(records[0].summary).toContain("2 AI systems name it (retired 2)");
      expect(records[0].summary).not.toContain("in production 0");
      expect(records[0].summary).not.toContain("no status 0");
    });

    it.each(USED_COLUMNS)("is not the list when the column %s is missing", async (name) => {
      const at = columnOf(name);
      const header = COLUMNS.filter((_, index) => index !== at);
      const rows = [...SAMPLE_SYSTEMS.map(systemRow), ...fillerRows(205)].map((row) =>
        row.filter((_, index) => index !== at),
      );
      const failure = await failureOf(
        newConnector().download(fakeFetch(filesOf(csvOf(rows, { header }))), {}),
      );
      expect(failure).toBeInstanceOf(NotTheListError);
    });

    it("finds the columns by name, wherever they are, and takes a column that was added", async () => {
      const header = ["new_column_first", ...[...COLUMNS].reverse(), "new_column_last"];
      const rows = [...SAMPLE_SYSTEMS.map(systemRow), ...fillerRows(205)].map((row) => [
        "x",
        ...[...row].reverse(),
        "y",
      ]);
      const records = await recordsOf(csvOf(rows, { header }));
      expect(records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
      expect(records[0].summary).toBe(SAMPLE_SUMMARY);
    });

    it("finds a column whose name has a blank around it, but not one that differs in case", async () => {
      const spaced = COLUMNS.map((name) => (name === "vendor_information" ? ` ${name} ` : name));
      const rows = [...SAMPLE_SYSTEMS.map(systemRow), ...fillerRows(205)];
      expect((await recordsOf(csvOf(rows, { header: spaced }))).length).toBe(1);

      const cased = COLUMNS.map((name) =>
        name === "vendor_information" ? "Vendor_Information" : name,
      );
      const failure = await failureOf(
        newConnector().download(fakeFetch(filesOf(csvOf(rows, { header: cased }))), {}),
      );
      expect(failure).toBeInstanceOf(NotTheListError);
    });

    describe("the rows of the file", () => {
      it("reads 200 rows and refuses 199: a file with fewer is not this list", async () => {
        const ok = await failureOf(
          newConnector().download(
            fakeFetch(filesOf(registerCsv(SAMPLE_SYSTEMS, { pad: 200 }))),
            {},
          ),
        );
        expect(ok).toBeUndefined();

        const failure = await failureOf(
          newConnector().download(
            fakeFetch(filesOf(registerCsv(SAMPLE_SYSTEMS, { pad: 199 }))),
            {},
          ),
        );
        expect(failure).toBeInstanceOf(NotTheListError);
      });

      it("reads 5,000 rows, and a file of one row more fails as too large: it never gives a shorter list", async () => {
        const rows = (count: number) => fillerRows(count);
        const ok = await failureOf(
          newConnector().download(fakeFetch(filesOf(csvOf(rows(5000)))), {}),
        );
        expect(ok).toBeUndefined();

        const failure = await failureOf(
          newConnector().download(fakeFetch(filesOf(csvOf(rows(5001)))), {}),
        );
        expect(failure).toBeInstanceOf(BodyTooLargeError);
      });

      it("fails as too large a file that is cut inside a quoted cell: part of a list is no list", async () => {
        // The last row has a name with a line break in it, so that it is quoted; the file ends in it.
        const rows = [
          ...SAMPLE_SYSTEMS.map(systemRow),
          ...fillerRows(205),
          systemRow({ id: "2526-CUT-001", name: "Line\nbreak" }),
        ];
        const csv = csvOf(rows);
        const at = csv.indexOf('"Line\nbreak"');
        expect(at).toBeGreaterThan(0);
        const cut = csv.slice(0, at + '"Line\nbr'.length);

        const failure = await failureOf(newConnector().download(fakeFetch(filesOf(cut)), {}));
        expect(failure).toBeInstanceOf(BodyTooLargeError);
        // The same file with the cell closed is read.
        expect(
          await failureOf(newConnector().download(fakeFetch(filesOf(csv)), {})),
        ).toBeUndefined();
      });

      it("fails as too large a file with a row of more cells than any list of this kind has", async () => {
        const wide = Array.from({ length: 5000 }, (_, index) => `c${index}`);
        const csv = csvOf([...fillerRows(210), wide]);
        const failure = await failureOf(newConnector().download(fakeFetch(filesOf(csv)), {}));
        expect(failure).toBeInstanceOf(BodyTooLargeError);
      });

      it("reads a row of 100 cells and fails as too large for one of 101", async () => {
        const rowOf = (width: number): string[] => Array.from({ length: width }, () => "x");
        // The header names the six columns and fills up to the width; the rows are as wide.
        const csvOfWidth = (width: number): string => {
          const header = [...USED_COLUMNS, ...Array.from({ length: width - 6 }, (_, i) => `c${i}`)];
          return csvOf(
            Array.from({ length: 210 }, () => rowOf(width)),
            { header },
          );
        };
        expect(
          await failureOf(newConnector().download(fakeFetch(filesOf(csvOfWidth(100))), {})),
        ).toBeUndefined();
        expect(
          await failureOf(newConnector().download(fakeFetch(filesOf(csvOfWidth(101))), {})),
        ).toBeInstanceOf(BodyTooLargeError);
      });

      describe("the vendors of the list", () => {
        /** `count` distinct vendors, 20 to a row, each name of four letters and digits or more. */
        const csvOfVendors = (count: number): string => {
          const names = Array.from(
            { length: count },
            (_, index) => `V${String(index).padStart(5, "0")}`,
          );
          const rows: string[][] = [];
          for (let at = 0; at < names.length; at += 20) {
            rows.push(
              systemRow({ id: `2526-ROW-${at / 20}`, vendor: names.slice(at, at + 20).join(", ") }),
            );
          }
          return csvOf([...rows, ...fillerRows(Math.max(0, 205 - rows.length))]);
        };

        it("reads 5,000 vendors, and 5,001 fail the download as too large: it never gives a shorter list", async () => {
          const ok = await download(csvOfVendors(5000));
          expect(JSON.parse(ok.bodies[0]).rows).toHaveLength(5000);

          const failure = await failureOf(
            newConnector().download(fakeFetch(filesOf(csvOfVendors(5001))), {}),
          );
          expect(failure).toBeInstanceOf(BodyTooLargeError);
        });

        it("takes the total of the body at the number of vendors when a few rows name more of them than there are rows", async () => {
          // 260 vendors in 13 rows of a file of 205 rows: the body must pass its own check.
          const snapshot = await download(csvOfVendors(260));
          const body = JSON.parse(snapshot.bodies[0]);
          expect(body.rows).toHaveLength(260);
          expect(body.total).toBeGreaterThanOrEqual(body.rows.length + body.unreadable);
          expect(newConnector().parse(snapshot).records).toHaveLength(260);
        });
      });

      it("reads a file that ends with no line break, and one with a blank line", async () => {
        const rows = [...SAMPLE_SYSTEMS.map(systemRow), ...fillerRows(205)];
        for (const options of [{ finalEol: false }, { eol: "\r\n\r\n" }, { eol: "\n" }]) {
          const records = await recordsOf(csvOf(rows, options));
          expect(records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
        }
      });

      it("counts a row that is narrower or wider than the header as unreadable, and reads the others", async () => {
        const rows = [
          ...SAMPLE_SYSTEMS.map(systemRow),
          systemRow({ id: "2526-NARROW-1", vendor: "Narrow Works" }).slice(0, 20),
          [...systemRow({ id: "2526-WIDE-1", vendor: "Wide Works" }), "one more cell"],
          ...fillerRows(205),
        ];
        const parsed = newConnector().parse(await download(csvOf(rows)));
        expect(parsed.records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
        // Two unreadable rows against one entity: more than its allowance, so they are errors.
        expect(parsed.errors).toBe(2);
      });

      describe("the allowance of rows that cannot be read", () => {
        const VENDORS = 120;
        const vendors = (): System[] =>
          Array.from({ length: VENDORS }, (_, index) => ({
            id: `2526-V-${String(index).padStart(4, "0")}`,
            name: `System ${index}`,
            vendor: `Vendor${String(index).padStart(4, "0")}`,
          }));
        const ragged = (count: number): string[][] =>
          Array.from({ length: count }, (_, index) =>
            index % 2 === 0
              ? systemRow({ id: `2526-RG-${index}`, vendor: "Ragged Works" }).slice(0, 20)
              : [...systemRow({ id: `2526-RG-${index}`, vendor: "Ragged Works" }), "extra"],
          );
        const csvWith = (count: number): string =>
          csvOf([...vendors().map(systemRow), ...fillerRows(90), ...ragged(count)]);

        it.each([1, 5, 10])("skips %s of them and applies the rest of the list", async (count) => {
          expect(count).toBeLessThanOrEqual(unreadableAllowed(VENDORS + count));
          const parsed = newConnector().parse(await download(csvWith(count)));
          expect(parsed.errors).toBe(0);
          expect(parsed.skipped).toBe(count);
          expect(parsed.records).toHaveLength(VENDORS);
        });

        it("fails the list when there are more than the allowance, and still gives the records that could be read", async () => {
          const count = unreadableAllowed(VENDORS + 11) + 1;
          const parsed = newConnector().parse(await download(csvWith(count)));
          expect(parsed.errors).toBe(count);
          expect(parsed.skipped).toBe(0);
          expect(parsed.records).toHaveLength(VENDORS);
        });
      });
    });
  });

  describe("the vendors a cell names", () => {
    it.each([
      [
        "a comma between two names",
        "Acme Inc, Beta Labs",
        [
          ["acme", "Acme Inc"],
          ["betalabs", "Beta Labs"],
        ],
      ],
      [
        "a comma before a legal form is no separator (Corp, Subs)",
        "Gamma Corp, Subs",
        [["gammacorpsubs", "Gamma Corp, Subs"]],
      ],
      [
        "a slash between blanks",
        "Delta / Epsilon",
        [
          ["delta", "Delta"],
          ["epsilon", "Epsilon"],
        ],
      ],
      [
        "an ampersand between blanks is no separator: a firm named by two names is one name",
        "Zeta & Eta",
        [["zetaeta", "Zeta & Eta"]],
      ],
      [
        "an ampersand between two names of four characters or more is one name as well",
        "Zetaworks & Etaworks",
        [["zetaworksetaworks", "Zetaworks & Etaworks"]],
      ],
      [
        "an ampersand inside a name, next to the separators that stay: a semicolon and a slash",
        "Acme & Sons; Beta Labs / Gamma Works",
        [
          ["acmesons", "Acme & Sons"],
          ["betalabs", "Beta Labs"],
          ["gammaworks", "Gamma Works"],
        ],
      ],
      ["a trailing comma", "Theta,", [["theta", "Theta"]]],
      [
        "a semicolon",
        "Acme; Beta Labs",
        [
          ["acme", "Acme"],
          ["betalabs", "Beta Labs"],
        ],
      ],
      [
        "a line break, which separates as a semicolon does",
        "Acme\nBeta Labs",
        [
          ["acme", "Acme"],
          ["betalabs", "Beta Labs"],
        ],
      ],
      [
        "a line break with a carriage return",
        "Acme\r\nBeta Labs\r\n",
        [
          ["acme", "Acme"],
          ["betalabs", "Beta Labs"],
        ],
      ],
      ["a legal form after a comma: Inc.", "Acme, Inc.", [["acme", "Acme, Inc"]]],
      ["a legal form after a comma: LLC, in capitals", "ACME, LLC", [["acme", "ACME, LLC"]]],
      ["a legal form after a comma: Limited", "Acme, Limited", [["acme", "Acme, Limited"]]],
      ["a legal form after a comma: Ltd.", "Acme, Ltd.", [["acme", "Acme, Ltd"]]],
      [
        "a legal form after a comma: Corporation",
        "Acme, Corporation",
        [["acme", "Acme, Corporation"]],
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
        "a comma before a word that only begins like a legal form (Inc, then 'redible') is a separator",
        "Acme, Incredible Works",
        [
          ["acme", "Acme"],
          ["incredibleworks", "Incredible Works"],
        ],
      ],
      [
        "a comma before a word that begins like 'Corp' and 'Corporation' and is neither is a separator",
        "Acme, Corporate Services",
        [
          ["acme", "Acme"],
          ["corporateservices", "Corporate Services"],
        ],
      ],
      [
        "two legal forms in a row after a comma are both part of the name",
        "Acme, Inc, Ltd",
        [["acme", "Acme, Inc, Ltd"]],
      ],
      [
        "a slash with no blank is no separator",
        "Acme/Beta Labs",
        [["acmebetalabs", "Acme/Beta Labs"]],
      ],
      ["blanks and punctuation at both ends", " - Acme . ", [["acme", "Acme"]]],
      ["a colon and a semicolon at the ends", ": Acme ;", [["acme", "Acme"]]],
      ["the same name twice in one cell", "Acme, Acme", [["acme", "Acme"]]],
      [
        "a hidden character and a no-break space",
        `Acme${ZERO_WIDTH_SPACE}${NO_BREAK_SPACE}Inc`,
        [["acme", "Acme Inc"]],
      ],
      ["a bidirectional override", `Acme${RIGHT_TO_LEFT_OVERRIDE} Inc`, [["acme", "Acme Inc"]]],
      [
        "the name of a government that is not a vendor, beside a vendor",
        "Government of Canada, Acme",
        [["acme", "Acme"]],
      ],
    ] as Array<[string, string, Array<[string, string]>]>)("%s", async (_name, cell, expected) => {
      expect(await vendorsOf(cell)).toEqual(expected);
    });

    it.each([
      ["a placeholder: n/a", "n/a"],
      ["a placeholder: N/A", " N/A "],
      ["a placeholder: na", "NA"],
      ["a placeholder: none", "none"],
      ["a placeholder: Unknown", "Unknown"],
      ["a placeholder: Not applicable", "Not applicable"],
      ["a placeholder: TBD", "TBD"],
      ["a placeholder: in-house", "In-house"],
      ["a placeholder: in house", "in house"],
      ["a placeholder: Internal", "Internal"],
      ["a placeholder: Government of Canada", "Government of Canada"],
      ["a placeholder: Open source", "Open source"],
      ["a name of three characters: QZX", "QZX"],
      ["a name of three characters: W3K", "W3K"],
      ["a name of three characters: VKY", "VKY"],
      ["a name of three characters: JXN", "JXN"],
      ["a name of two characters: H2", "H2"],
      ["a name that is under four characters once its legal form is off", "Ab Inc"],
      ["only punctuation", " ,;. - "],
      ["nothing", ""],
    ])("gives no vendor for %s", async (_name, cell) => {
      expect(await vendorsOf(cell)).toEqual([]);
    });

    it("gives no vendor for a name whose key is longer than 160 characters, and the others of its cell stay", async () => {
      const long = "L".repeat(170);
      expect(await vendorsOf(`${long}; Acme`)).toEqual([["acme", "Acme"]]);
      const keyed = await vendorsOf(`${"L".repeat(160)}; Acme`);
      expect(keyed.map(([id]) => id)).toEqual(["acme", "l".repeat(160)]);
    });

    it("merges 'Open Acme' and 'OpenAcme' into one key, and shows the spelling that is first of equals", async () => {
      const records = await recordsOf(
        registerCsv([
          { id: "2526-OA-001", vendor: "OpenAcme" },
          { id: "2526-OA-002", vendor: "Open Acme" },
        ]),
      );
      expect(records.map((record) => record.sourceRecordId)).toEqual(["openacme"]);
      expect(vendorOf(records[0])).toBe("Open Acme");
      expect(records[0].identifiers.systems).toBe(2);
      expect(records[0].matchKeys).toEqual(["name:openacme"]);
    });

    it("keeps 'Acme Zorbix' apart from 'Acme': a product is not its maker", async () => {
      expect(await vendorsOf("Acme, Acme Zorbix")).toEqual([
        ["acme", "Acme"],
        ["acmezorbix", "Acme Zorbix"],
      ]);
    });

    it("shows the most frequent spelling of a vendor, and the first of equals; the others are names of the record", async () => {
      const spellings = ["Acme Inc", "Acme Inc", "ACME INC", "Acme, Inc"];
      const records = await recordsOf(
        registerCsv(spellings.map((vendor, index) => ({ id: `2526-SP-${index}`, vendor }))),
      );
      expect(records).toHaveLength(1);
      expect(vendorOf(records[0])).toBe("Acme Inc");
      expect(records[0].matchKeys).toEqual(["name:acmeinc", "name:acme"]);
    });

    it("keeps at most five spellings as names, the most frequent first, then in the order of their text", async () => {
      // Seven spellings with seven legal forms: 'Acme Corp' twice, the six others once. The five that
      // are kept are 'Acme Corp' and then the first four of the others by text (UTF-16 order, so
      // that 'Acme LLC' comes before 'Acme Limited' and 'Acme Ltd' is the last): 'Acme', 'Acme
      // Corporation', 'Acme Inc' and 'Acme LLC'. 'Acme Limited' and 'Acme Ltd' are left out.
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
      const records = await recordsOf(
        registerCsv(spellings.map((vendor, index) => ({ id: `2526-SP-${index}`, vendor }))),
      );
      expect(records).toHaveLength(1);
      expect(records[0].identifiers.systems).toBe(8);
      expect(vendorOf(records[0])).toBe("Acme Corp");
      expect(records[0].matchKeys).toEqual([
        "name:acmecorp",
        "name:acme",
        "name:acmecorporation",
        "name:acmeinc",
        "name:acmellc",
      ]);
    });

    it("counts a system once for a vendor that its cell names twice", async () => {
      const records = await recordsOf(registerCsv([{ vendor: "Acme Inc, Acme" }]));
      expect(records[0].identifiers.systems).toBe(1);
    });

    it("keeps the first 188 characters of a cell that is longer than 200, and drops the name that the cut ended", async () => {
      // 30 times 'Acme; ' is 180 characters, and the 188 that are kept end inside the next name:
      // 'Beta Lab' is a fragment of 'Beta Laboratories International', and a fragment is no vendor.
      const cell = `${"Acme; ".repeat(30)}Beta Laboratories International`;
      expect(cell.length).toBeGreaterThan(200);
      const records = await recordsOf(registerCsv([{ vendor: cell }]));
      expect(records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
      for (const record of records) expect(record.matchKeys.join(" ")).not.toContain("shortened");
    });

    it("keeps every name of a cell of 200 characters, which is not cut", async () => {
      // 25 times 'Acme, ' is 150 characters and the last name makes 200: all that the cell holds.
      const last = "B".repeat(50);
      const cell = `${"Acme, ".repeat(25)}${last}`;
      expect(cell.length).toBe(200);
      const records = await recordsOf(registerCsv([{ vendor: cell }]));
      expect(records.map((record) => record.sourceRecordId)).toEqual(["acme", "b".repeat(50)]);
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

        const snapshot = await download(registerCsv([{ vendor: cell }]));
        const records = newConnector().parse(snapshot).records;
        // The names before the cut are whole vendors, and the front of the name that it ended is none.
        expect(records.map((record) => record.sourceRecordId)).toEqual(["abcde", "acme"]);
        const everything = JSON.stringify([snapshot.bodies, records]);
        expect(everything).not.toContain("shortened");
        expect(everything.toLowerCase()).not.toContain("quill");
      },
    );

    // The marker that `lineOf` puts on a cut line begins with a blank. Left on the text that is split,
    // that blank would complete the separator " / " of a cut `/` (the front of `/x`), and the name
    // before it would be kept as a whole one.
    it("does not read the end of a cut line as the separator ' / ': the name before it is no name", async () => {
      const ending = "Beta /";
      const cell = `${leadOf(VENDOR_CELL_CAP - SHORTENED.length - ending.length, "; ")}Beta /x Gadgets Worldwide`;
      expect(lineOf(cell, VENDOR_CELL_CAP).endsWith(`${ending}${SHORTENED}`)).toBe(true);
      const records = await recordsOf(registerCsv([{ vendor: cell }]));
      expect(records.map((record) => record.sourceRecordId)).toEqual(["abcde", "acme"]);
    });

    // A comma before a legal form is part of the name (`Quillar Corp, Subs Quantum Holdings` is
    // one name), and the join is decided by the text after the comma. When the cut of the cell falls
    // right after that comma, or inside the legal form (`Su`), the text after it is empty or is no legal
    // form yet, and `Quillar Corp` would stand alone as a whole name: id `quillar`, key `quillarcorp`,
    // `identifiers.vendor` `Quillar Corp`, with no marker to give it away. A cell that was cut is read
    // only up to its last real separator (a semicolon, a line break, ` / `): its last name goes whole,
    // whatever commas it holds. No real cell is that long (the longest has 95 units).
    describe("a cell that was cut in or right after a legal form that follows a comma", () => {
      // `Subs` and `LLC` are legal forms of this reader (LEGAL_FORM_AHEAD): a comma before one joins.
      const WHOLE = "Quillar Corp, Subs Quantum Holdings";
      const WHOLE_LLC = "Quillar Corp, LLC Quantum Holdings";
      const WHOLE_ID = "quillarcorpsubsquantumholdings";
      const CUT_AFTER: Array<[string, string, string]> = [
        ["the comma", "Quillar Corp,", WHOLE],
        ["the comma and the blank after it, which the cut takes off", "Quillar Corp, ", WHOLE],
        ["the first letter of a legal form (Subs)", "Quillar Corp, S", WHOLE],
        ["two letters of a legal form (Subs)", "Quillar Corp, Su", WHOLE],
        ["three letters of a legal form (Subs)", "Quillar Corp, Sub", WHOLE],
        ["the whole legal form (Subs)", "Quillar Corp, Subs", WHOLE],
        ["a word after the legal form (Subs)", "Quillar Corp, Subs Quantum", WHOLE],
        ["the first letter of a legal form (LLC)", "Quillar Corp, L", WHOLE_LLC],
        ["two letters of a legal form (LLC)", "Quillar Corp, LL", WHOLE_LLC],
        ["the whole legal form (LLC)", "Quillar Corp, LLC", WHOLE_LLC],
      ];
      const SEPARATORS: Array<[string, string]> = [
        ["a semicolon", "; "],
        ["a slash with a blank on each side", " / "],
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

          const snapshot = await download(registerCsv([{ vendor: cell }]));
          const records = newConnector().parse(snapshot).records;
          expect(records.map((record) => record.sourceRecordId)).toEqual(["abcde", "acme"]);
          // No id, key, name or identifier is the front of the name, `quillar` or `quillarcorp`, or holds the marker.
          const everything = JSON.stringify([snapshot.bodies, records]).toLowerCase();
          expect(everything).not.toContain("quillar");
          expect(everything).not.toContain("shortened");
        },
      );

      // A line break is a semicolon for the reader (it is made one before the cell is cut), so a cut
      // cell is cut back to its last line break as it is to its last semicolon.
      it("cuts a cell back to its last line break too: the names before it stay and the last name goes", async () => {
        const ending = "Quillar Corp, Su";
        const lead = leadOf(VENDOR_CELL_CAP - SHORTENED.length - ending.length, "\n");
        const cell = `${lead}${WHOLE}\nZorbix Quill`;
        expect(keptOf(cell.replace(/\n/g, ";")).endsWith(ending)).toBe(true);
        const snapshot = await download(registerCsv([{ vendor: cell }]));
        const records = newConnector().parse(snapshot).records;
        expect(records.map((record) => record.sourceRecordId)).toEqual(["abcde", "acme"]);
        const everything = JSON.stringify([snapshot.bodies, records]).toLowerCase();
        expect(everything).not.toContain("quillar");
        expect(everything).not.toContain("shortened");
      });

      it("drops everything of a cut cell that has no separator but commas: the names of a list cannot be told from the parts of one name", async () => {
        const ending = "Quillar Corp, Su";
        const lead = leadOf(VENDOR_CELL_CAP - SHORTENED.length - ending.length, ", ");
        const cell = `${lead}${WHOLE}, Zorbix Quill`;
        expect(keptOf(cell).endsWith(ending)).toBe(true);
        const snapshot = await download(registerCsv([{ vendor: cell }]));
        // Fail closed: no real separator stands before the last name, so the whole cell is its tail.
        expect(newConnector().parse(snapshot).records).toEqual([]);
        expect(JSON.stringify(snapshot.bodies).toLowerCase()).not.toContain("shortened");
      });

      it("drops the whole tail after the last real separator, the names of a comma list in it too, and keeps the names before the separator", async () => {
        const ending = "Alphalabs, Betalabs, Quillar Corp, Su";
        const whole = `Alphalabs, Betalabs, ${WHOLE}`;
        const cell = `${leadOf(VENDOR_CELL_CAP - SHORTENED.length - ending.length, "; ")}${whole}; Zorbix Quill`;
        expect(keptOf(cell).endsWith(ending)).toBe(true);
        const snapshot = await download(registerCsv([{ vendor: cell }]));
        const records = newConnector().parse(snapshot).records;
        expect(records.map((record) => record.sourceRecordId)).toEqual(["abcde", "acme"]);
        const everything = JSON.stringify([snapshot.bodies, records]).toLowerCase();
        for (const fragment of ["alphalabs", "betalabs", "quillar", "shortened"]) {
          expect(everything).not.toContain(fragment);
        }
      });

      it("reads a cell that was not cut as before: the name with a legal form after a comma is one name, whole", async () => {
        // The same lead and the same name, 185 and 200 units: the cell is not cut, and the whole name is a vendor.
        for (const lead of [150, VENDOR_CELL_CAP - WHOLE.length]) {
          const cell = `${leadOf(lead, "; ")}${WHOLE}`;
          expect(cell.length).toBeLessThanOrEqual(VENDOR_CELL_CAP);
          expect(lineOf(cell, VENDOR_CELL_CAP).endsWith(SHORTENED)).toBe(false);
          const records = await recordsOf(registerCsv([{ vendor: cell }]));
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
        const records = await recordsOf(registerCsv([{ vendor: over }]));
        expect(records.map((record) => record.sourceRecordId)).toEqual(["abcde", "acme"]);
      });

      it("reads a cut cell that is a list with only commas as no vendor at all, whatever its names", async () => {
        // 30 times 'Acme, ' and the front of another name: no semicolon, no line break, no ' / '.
        const cell = `${"Acme, ".repeat(30)}Beta Laboratories International`;
        expect(lineOf(cell, VENDOR_CELL_CAP).endsWith(SHORTENED)).toBe(true);
        expect(await recordsOf(registerCsv([{ vendor: cell }]))).toEqual([]);
      });
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
        const snapshot = await download(
          registerCsv([
            { id: "2526-OVER-001", vendor: cell },
            { id: "2526-FINE-001", vendor: "Beta Labs" },
          ]),
        );
        expect(JSON.parse(snapshot.bodies[0]).unreadable).toBe(1);
        const parsed = newConnector().parse(snapshot);
        // No name of the row is a vendor, and the row is counted as one that could not be read (skipped: it is within the allowance).
        expect(parsed.records.map((record) => record.sourceRecordId)).toEqual(["betalabs"]);
        expect(parsed.errors + (parsed.skipped ?? 0)).toBe(1);
      },
    );

    it("reads a vendor cell of exactly the limit, and refuses one of a unit more", async () => {
      const edge = `${" ".repeat(LINE_INPUT_MAX - NAME.length)}${NAME}`;
      expect(edge).toHaveLength(LINE_INPUT_MAX);
      const ok = await download(registerCsv([{ vendor: edge }]));
      expect(JSON.parse(ok.bodies[0]).unreadable).toBe(0);
      expect(
        newConnector()
          .parse(ok)
          .records.map((record) => record.sourceRecordId),
      ).toEqual(["zorbixalphaworks"]);

      const over = await download(registerCsv([{ vendor: ` ${edge}` }]));
      expect(JSON.parse(over.bodies[0]).unreadable).toBe(1);
      expect(newConnector().parse(over).records).toEqual([]);
    });
  });

  describe("what a record counts", () => {
    it("names the three departments with the most systems, then counts the others", async () => {
      const departments = [
        ...Array(3).fill("Dept One"),
        ...Array(2).fill("Dept Two"),
        "Dept Five",
        "Dept Four",
        "Dept Three",
      ];
      const records = await recordsOf(
        registerCsv(
          departments.map((name, index) => ({
            id: `2526-D-${index}`,
            org: `${name} / Ministère ${index}`,
            vendor: "Acme Inc",
          })),
        ),
      );
      expect(records[0].summary).toContain(
        "8 AI systems name it (in production 8), reported by Dept One, Dept Two, Dept Five and 2 other departments.",
      );
    });

    it("names all the departments when there are three or fewer, and takes the part before the slash", async () => {
      const records = await recordsOf(
        registerCsv([
          { id: "2526-D-1", org: "Dept Only / Dept unique", vendor: "Acme Inc" },
          { id: "2526-D-2", org: "Dept Lone", vendor: "Acme Inc" },
        ]),
      );
      expect(records[0].summary).toContain("reported by Dept Lone, Dept Only.");
    });

    // The departments are counted by the whole English part of the cell (the part before
    // ' / '), never by a cut text, and only the names that are shown are cut, at 80 units. A cell
    // that does not fit its cap of 300 units (the French part included) is left out of the count, and
    // the system still counts.
    const STEM =
      "Department of Synthetic Example Affairs and Imaginary Regulatory Coordination Services";
    const DEPARTMENT_CAP = 300;
    /** Five departments whose names differ only after their first 68 units. */
    const SIBLINGS = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].map(
      (tail) => `${STEM} ${tail}`,
    );
    const siblingSystems = (): System[] =>
      SIBLINGS.map((name, index) => ({
        id: `2526-D-${index}`,
        org: `${name} / Ministère ${index}`,
        vendor: "Acme Inc",
      }));

    it("counts departments that share their first 68 units as many, and cuts only the names that it shows", async () => {
      // The three that are shown are the first three by text, and every one of them is cut to the same text.
      const shown = shorten(SIBLINGS[0], 80);
      expect(shown.endsWith(SHORTENED)).toBe(true);
      for (const name of SIBLINGS) expect(shorten(name, 80)).toBe(shown);

      const records = await recordsOf(registerCsv(siblingSystems()));
      expect(records[0].summary).toContain(
        `5 AI systems name it (in production 5), reported by ${shown}, ${shown}, ${shown} and 2 other departments.`,
      );
    });

    it("gives the same record for departments that share their first 68 units, whatever the order of the rows", async () => {
      const rows = [...siblingSystems().map(systemRow), ...fillerRows(205)];
      await expectDeterministic(newConnector(), (reversed) =>
        fakeFetch(filesOf(csvOf(reversed ? [...rows].reverse() : rows))),
      );
    });

    it("counts a department of 300 units, leaves out one of 301, and counts the system of either", async () => {
      const fits = `${STEM} ${"Q".repeat(DEPARTMENT_CAP - STEM.length - 1)}`;
      expect(fits).toHaveLength(DEPARTMENT_CAP);
      const over = `${fits}Q`;

      const both = await recordsOf(
        registerCsv([
          { id: "2526-D-1", org: fits, vendor: "Acme Inc" },
          { id: "2526-D-2", org: over, vendor: "Acme Inc" },
        ]),
      );
      expect(both[0].identifiers.systems).toBe(2);
      expect(both[0].summary).toContain(
        `2 AI systems name it (in production 2), reported by ${shorten(fits, 80)}.`,
      );
      expect(both[0].summary).not.toContain("other department");

      const only = await recordsOf(
        registerCsv([{ id: "2526-D-2", org: over, vendor: "Acme Inc" }]),
      );
      expect(only[0].identifiers.systems).toBe(1);
      expect(only[0].summary).toContain("1 AI system names it (in production 1).");
      expect(only[0].summary).not.toContain("reported by");
    });

    it("leaves a department out of the count when its cell does not fit, though its English part does: the cell is bounded by its cap", async () => {
      const french = "F".repeat(DEPARTMENT_CAP);
      const records = await recordsOf(
        registerCsv([{ org: `Dept One / ${french}`, vendor: "Acme Inc" }]),
      );
      expect(records[0].identifiers.systems).toBe(1);
      expect(records[0].summary).not.toContain("reported by");
    });

    // The cut of `lineOf` takes a blank before it off and never splits a pair of surrogates, so
    // `lineOf(cell, 301)` of a cell that is too long can be 300 units long and end in the marker: the
    // length alone takes it for a whole cell, which would be counted as a department cut in two.
    it.each(SHORT_CUTS)(
      "leaves out a department that does not fit when the cut of its cell would fall after %s",
      async (_label, where) => {
        const text = wordsOf(310, 288);
        const cell = where === "blank" ? text : withPairAt(text, 288);
        const naive = lineOf(cell, DEPARTMENT_CAP + 1);
        expect(naive.endsWith(SHORTENED)).toBe(true);
        expect(naive.length).toBeLessThanOrEqual(DEPARTMENT_CAP);

        const records = await recordsOf(registerCsv([{ org: cell, vendor: "Acme Inc" }]));
        expect(records[0].identifiers.systems).toBe(1);
        expect(records[0].summary).not.toContain("reported by");
        expect(JSON.stringify(records)).not.toContain("shortened");
      },
    );

    it("writes the angle brackets of a department as angle quotation marks: none is left in the body, and the text shows the marks", async () => {
      const less = cp(0x3c);
      const greater = cp(0x3e);
      const org = `Dept ${less}b${greater}One${less}/b${greater} / Ministère`;
      const snapshot = await download(registerCsv([{ org, vendor: "Acme Inc" }]));
      expect(snapshot.bodies.join("")).not.toMatch(/[<>]/);

      const records = newConnector().parse(snapshot).records;
      const shown = `Dept ${cp(0x2039)}b${cp(0x203a)}One${cp(0x2039)}/b${cp(0x203a)}`;
      expect(records[0].summary).toContain(`reported by ${shown}.`);
    });

    it("lists the names of three systems at most: production first, then development, retired and no status, then by text, each name once", async () => {
      const systems: System[] = [
        { id: "2526-S-1", name: "Zulu", status: "Retired" },
        { id: "2526-S-2", name: "Yankee", status: "" },
        { id: "2526-S-3", name: "X-ray", status: "in development" },
        { id: "2526-S-4", name: "Whiskey", status: "In production" },
        { id: "2526-S-5", name: "Victor", status: "In production" },
        { id: "2526-S-6", name: "Victor", status: "In production" },
        { id: "2526-S-7", name: "Uniform", status: "In development" },
      ].map((system) => ({ ...system, vendor: "Acme Inc" }));
      const records = await recordsOf(registerCsv(systems));
      expect(records[0].summary).toContain("Systems: Victor; Whiskey; Uniform.");
      expect(records[0].identifiers.systems).toBe(7);
    });

    it("ranks a system name by the best status of the systems that have it, whatever their order in the file", async () => {
      // 'Sierra' is retired in the first row and in production in the second; 'Tango' the other way
      // round. Either way each is a name in production, which comes before 'Uniform' in development.
      const systems: System[] = [
        { id: "2526-R-1", name: "Sierra", status: "Retired" },
        { id: "2526-R-2", name: "Tango", status: "In production" },
        { id: "2526-R-3", name: "Uniform", status: "In development" },
        { id: "2526-R-4", name: "Sierra", status: "In production" },
        { id: "2526-R-5", name: "Tango", status: "Retired" },
      ].map((system) => ({ ...system, vendor: "Acme Inc" }));
      for (const order of [systems, [...systems].reverse()]) {
        const records = await recordsOf(registerCsv(order));
        expect(records[0].summary).toContain("Systems: Sierra; Tango; Uniform.");
      }
    });

    it("leaves the list of systems out when no system has a name", async () => {
      const records = await recordsOf(registerCsv([{ vendor: "Acme Inc", name: " " }]));
      expect(records[0].summary).not.toContain("Systems:");
    });

    it("leaves 'reported by' out when no system names its department", async () => {
      const records = await recordsOf(registerCsv([{ vendor: "Acme Inc", org: " " }]));
      expect(records[0].summary).toContain("names it (in production 1).");
      expect(records[0].summary).not.toContain("reported by");
    });

    it.each([
      [1, "1 AI system names it (in production 1)."],
      [2, "2 AI systems name it (in production 2)."],
    ])(
      "writes the count of systems in the number of its noun and its verb: %s",
      async (count, text) => {
        const systems = Array.from({ length: count }, (_, index) => ({
          id: `2526-N-${index}`,
          name: `System ${index}`,
          org: " ",
          vendor: "Acme Inc",
        }));
        const records = await recordsOf(registerCsv(systems));
        expect(records[0].summary).toContain(text);
        expect(records[0].summary).not.toMatch(/\b1 AI systems/);
        expect(records[0].identifiers.systems).toBe(count);
      },
    );

    it.each([
      [4, "reported by Dept A, Dept B, Dept C and 1 other department."],
      [5, "reported by Dept A, Dept B, Dept C and 2 other departments."],
    ])(
      "writes the departments that are not named in the number of its noun: %s departments",
      async (count, text) => {
        const departments = ["A", "B", "C", "D", "E"].slice(0, count);
        const records = await recordsOf(
          registerCsv(
            departments.map((letter, index) => ({
              id: `2526-O-${index}`,
              org: `Dept ${letter} / Ministère ${index}`,
              vendor: "Acme Inc",
            })),
          ),
        );
        expect(records[0].summary).toContain(text);
        expect(records[0].summary).not.toMatch(/\b1 other departments/);
      },
    );

    it("keeps the register ids that look like one, as they are, and leaves the others out; the system still counts", async () => {
      const ids = [
        ["2526-AcRe-AcRe-001", true],
        ["2526-QuZa-VeXo-007", true],
        ["bad id", false],
        ["", false],
        ["25-ABC", false],
        ["2526-AB", false],
        ["2526-ABC", true],
        [`2526-${"A".repeat(60)}`, true],
        [`2526-${"A".repeat(61)}`, false],
        ["2526-AB CD", false],
      ] as Array<[string, boolean]>;
      const records = await recordsOf(
        registerCsv(
          ids.map(([id], index) => ({ id, name: `System ${index}`, vendor: "Acme Inc" })),
        ),
      );
      expect(records[0].identifiers.systems).toBe(10);
      expect(records[0].identifiers.registerIds).toEqual(
        ids
          .filter(([, keep]) => keep)
          .map(([id]) => id)
          .sort(),
      );
    });

    it("keeps at most 20 register ids, the first of them in the order of their text", async () => {
      const records = await recordsOf(
        registerCsv(
          Array.from({ length: 25 }, (_, index) => ({
            id: `2526-MANY-${String(24 - index).padStart(3, "0")}`,
            vendor: "Acme Inc",
          })),
        ),
      );
      const ids = records[0].identifiers.registerIds as string[];
      expect(ids).toHaveLength(20);
      expect(ids[0]).toBe("2526-MANY-000");
      expect(ids[19]).toBe("2526-MANY-019");
      expect(records[0].identifiers.systems).toBe(25);
    });
  });

  describe("the record", () => {
    it("has an address of its own for each vendor: the portal's page of the dataset with the vendor's key", async () => {
      const records = await recordsOf(
        registerCsv([{ vendor: "Acme Inc, Beta Labs, Élan Zéta" }, { vendor: "Gamma Works" }]),
      );
      expect(records.length).toBeGreaterThan(2);
      const urls = records.map((record) => record.url);
      expect(new Set(urls).size).toBe(urls.length);
      for (const record of records) {
        expect(record.url).toBe(`${RECORD_URL_PREFIX}${encodeURIComponent(record.sourceRecordId)}`);
      }
      expect(byId(records).get("élanzéta")?.url).toBe(`${RECORD_URL_PREFIX}%C3%A9lanz%C3%A9ta`);
    });

    it("is dated by the release of the file, which is in the text, in the identifiers and in the version of the list, and by no day of its own", async () => {
      const parsed = await parsedOf(registerCsv(SAMPLE_SYSTEMS), {
        packageText: packageText({
          resources: [csvResource({ last_modified: "2026-07-15T01:02:03.000004" })],
        }),
        csvFile: { url: BLOB_URL },
      });
      expect(parsed.sourceVersion).toBe("2026-07-15");
      expect(parsed.records[0].summary).toContain("Release of 2026-07-15:");
      expect(parsed.records[0].identifiers.release).toBe("2026-07-15");
      expect(parsed.records[0].publishedAt).toBeNull();
      expect(parsed.records[0].sourceUpdatedAt).toBeNull();
    });

    it("keeps the sentence that says what it is not, second, and never cuts it", async () => {
      const records = await recordsOf(registerCsv(SAMPLE_SYSTEMS));
      const sentences = records[0].summary.split(". ");
      expect(records[0].summary.startsWith(`${FIRST_SENTENCE} ${NOT_A_FINDING} `)).toBe(true);
      expect(sentences.length).toBeGreaterThan(5);
      expect(records[0].summary.endsWith(LAST_SENTENCE)).toBe(true);
    });

    it("stays within 1,300 characters in the worst case that its caps allow, and keeps the sentence that says what it is not and the licence sentence", async () => {
      const departments = Array.from(
        { length: 40 },
        (_, index) => `${String(index).padStart(2, "0")} ${"D".repeat(100)}`,
      );
      const systems: System[] = Array.from({ length: 41 }, (_, index) => ({
        id: `2526-W-${String(index).padStart(3, "0")}`,
        name: `${String(index).padStart(2, "0")} ${"N".repeat(90)}`,
        org: `${departments[index % 40]} / Ministère ${index}`,
        vendor: "Q".repeat(120),
        status: ["In production", "In development", "Retired", ""][index % 4],
      }));
      const records = await recordsOf(registerCsv(systems));

      expect(records).toHaveLength(1);
      const { summary } = records[0];
      expect(summary.length).toBeLessThanOrEqual(1300);
      expect(summary).toContain(NOT_A_FINDING);
      expect(summary.endsWith(LAST_SENTENCE)).toBe(true);
      expect(summary).toContain("and 37 other departments");
      expect(summary).toContain(" [shortened]");
      expect(JSON.stringify(records[0].identifiers).length).toBeLessThanOrEqual(2000);
      expectWellFormedRecords(records, { sourceId: "canada_ai_register", mark: MARK });
    });

    it("is the unit of the list: a vendor named by 45 systems is one record", async () => {
      const records = await recordsOf(
        registerCsv(
          Array.from({ length: 45 }, (_, index) => ({
            id: `2526-M-${String(index).padStart(3, "0")}`,
            vendor: "Acme Cloud",
          })),
        ),
      );
      expect(records).toHaveLength(1);
      expect(records[0].identifiers.systems).toBe(45);
    });

    // An identifier is never a cut text. The id and the keys of a vendor hold its
    // whole name, which may be up to 200 units (its key, the letters, at most 160), and so does
    // `identifiers.vendor`; only the title and the summary show the name cut at 80 units.
    const NAME_SHAPES: Array<[string, number, "plain" | "blank" | "pair"]> = [
      ["81 units, a letter at the cut of the display", 81, "plain"],
      ["81 units, a blank at the cut of the display", 81, "blank"],
      ["81 units, a pair of surrogates at the cut of the display", 81, "pair"],
      ["188 units, a letter at the cut of the display", 188, "plain"],
      ["188 units, a blank at the cut of the display", 188, "blank"],
      ["188 units, a pair of surrogates at the cut of the display", 188, "pair"],
      ["200 units, the longest cell that is not cut", 200, "plain"],
    ];

    it.each(NAME_SHAPES)(
      "keeps the whole first spelling in the identifiers, and shows it cut in the title and the summary: %s",
      async (_label, units, shape) => {
        // The display keeps 68 units and the marker; a blank at unit 67 is taken off the cut, and a pair that stands across it is not split.
        const name =
          shape === "plain"
            ? wordsOf(units, 66)
            : shape === "blank"
              ? wordsOf(units, 67)
              : withPairAt(wordsOf(units, 67), 67);
        expect(name).toHaveLength(units);
        const display = lineOf(name, 80);
        expect(display.endsWith(SHORTENED)).toBe(true);
        expect(display).toHaveLength(shape === "plain" ? 80 : 79);

        const records = await recordsOf(registerCsv([{ vendor: name }]));
        expect(records).toHaveLength(1);
        const [record] = records;
        const key = keyOfName(name);
        // The id and the key are the whole name's.
        expect(record.sourceRecordId).toBe(key);
        expect(record.matchKeys).toEqual([`name:${key}`]);
        // The identifier is the whole spelling; the title and the summary show it cut.
        expect(record.identifiers.vendor).toBe(name);
        expect(JSON.stringify(record.identifiers)).not.toContain("shortened");
        expect(record.title).toBe(`${MARK}: ${display}`);
        expect(record.summary).toContain(`Vendor as written: ${display}.`);
      },
    );

    it("keeps the identifiers within 2,000 characters in the worst case that the caps allow: the longest spelling, characters that JSON writes in two, 20 register ids of 65 units", async () => {
      const name = `${'"'.repeat(VENDOR_CELL_CAP - 4)}Zorb`;
      expect(name).toHaveLength(VENDOR_CELL_CAP);
      const systems: System[] = Array.from({ length: 20 }, (_, index) => ({
        id: `2526-${"A".repeat(58)}${String(index).padStart(2, "0")}`,
        name: `System ${index}`,
        vendor: name,
      }));
      const records = await recordsOf(registerCsv(systems));

      expect(records).toHaveLength(1);
      const [record] = records;
      expect(record.identifiers.vendor).toBe(name);
      expect(record.identifiers.registerIds).toHaveLength(20);
      expect(JSON.stringify(record.identifiers).length).toBeLessThanOrEqual(2000);
    });
  });

  describe("what the file holds that no record may", () => {
    it("never lets a prose column, a French column or another column of the file reach the body or a record", async () => {
      const csv = registerCsv(SAMPLE_SYSTEMS);
      expect(csv).toContain(`${CANARY}description_ai_system_en`);
      const snapshot = await download(csv);
      const parsed = newConnector().parse(snapshot);
      const everything = JSON.stringify([snapshot, parsed]);
      for (const name of COLUMNS) expect(everything).not.toContain(`${CANARY}${name}`);
      expect(everything).not.toContain(CANARY);
      expect(everything).not.toContain("Ministère");
    });

    it("never lets the contact address of the dataset record, or the address of the file, reach the body or a record", async () => {
      const snapshot = await download(registerCsv(SAMPLE_SYSTEMS));
      const everything = JSON.stringify([snapshot, newConnector().parse(snapshot)]);
      for (const part of [MAINTAINER_CANARY, SIGNATURE, RESOURCE_URL, BLOB_URL, FILE_NAME]) {
        expect(everything).not.toContain(part);
      }
    });
  });

  describe("hostile cells", () => {
    it("keeps no control character, hidden character or angle bracket in a record, whatever the cells hold", async () => {
      const hostile = [
        `Acme${cp(0x7, 0x0, 0x1b)} Inc`,
        `${RIGHT_TO_LEFT_OVERRIDE}Evil${cp(0x202c)} Works`,
        "<script>alert(1)</script> Script Works",
        `Full${cp(0xff1c)}width${cp(0xff1e)} Works`,
        `Zero${ZERO_WIDTH_SPACE}Width${cp(0x2800)}Works`,
      ];
      const systems: System[] = hostile.map((vendor, index) => ({
        id: `2526-H-${index}`,
        name: `<b>${vendor}</b> system`,
        org: `<i>${vendor}</i> / Ministère`,
        vendor,
      }));
      const records = await recordsOf(registerCsv(systems));

      expect(records.length).toBeGreaterThan(0);
      expectWellFormedRecords(records, { sourceId: "canada_ai_register", mark: MARK });
      for (const record of records) {
        expect(JSON.stringify(record)).not.toMatch(/[<>]/);
      }
    });

    it("reads a cell of 100 KB in little time, and keeps a bounded record", async () => {
      const big = `${"Acme; ".repeat(17_000)}Zulu Works`;
      expect(big.length).toBeGreaterThan(100_000);
      const started = Date.now();
      const records = await recordsOf(
        registerCsv([{ vendor: big, name: "n".repeat(100_000), org: "o".repeat(100_000) }]),
      );
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(records.map((record) => record.sourceRecordId)).toEqual(["acme"]);
      expectWellFormedRecords(records, { sourceId: "canada_ai_register", mark: MARK });
      expect(records[0].summary.length).toBeLessThanOrEqual(1300);
    });

    it("reads bytes that are no valid UTF-8, which no string can hold as a lone surrogate, without failing", async () => {
      const head = Buffer.from(
        registerCsv([{ vendor: "Acme Inc" }]).replace("Acme Inc", "Acme @@ Inc"),
      );
      const at = head.indexOf("@@");
      const csv = Buffer.concat([
        head.subarray(0, at),
        Buffer.from([0xed, 0xa0, 0x80, 0xff, 0xfe]),
        head.subarray(at + 2),
      ]);
      const records = await recordsOf(csv);
      expect(records.length).toBeGreaterThan(0);
      expectWellFormedRecords(records, { sourceId: "canada_ai_register", mark: MARK });
    });

    it("takes a long run of separators, blanks or parentheses in a cell in little time", async () => {
      const cells = [
        ",".repeat(100_000),
        " ".repeat(100_000),
        ";".repeat(100_000),
        "(".repeat(100_000),
        "Acme ,".repeat(30_000),
      ];
      const started = Date.now();
      for (const cell of cells) {
        await recordsOf(registerCsv([{ vendor: cell }]));
      }
      expect(Date.now() - started).toBeLessThan(10_000);
    });
  });

  describe("rows that cannot be records", () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: "acme",
      display: "Acme Inc",
      names: ["Acme Inc"],
      systems: 1,
      status: { production: 1, development: 0, retired: 0, none: 0 },
      departments: ["Dept One"],
      departmentCount: 1,
      systemNames: ["Alpha"],
      registerIds: ["2526-EX-001"],
      release: "2026-03-14",
      ...over,
    });
    const snapshotOfRows = (rows: unknown[]): Snapshot => {
      const body = JSON.stringify({ v: 1, rows, total: rows.length, unreadable: 0 });
      return { bodies: [body], etag: null, lastModified: null, bytes: body.length };
    };

    it("counts a row whose id cannot be one as skipped, within the allowance, and keeps the others", () => {
      const rows = [
        ...Array.from({ length: 19 }, (_, index) => row({ id: `acme${index}` })),
        row({ id: "" }),
      ];
      const parsed = canadaAiRegisterConnector.parse(snapshotOfRows(rows));
      expect(parsed.records).toHaveLength(19);
      expect(parsed.skipped).toBe(1);
      expect(parsed.errors).toBe(0);
    });

    it("counts a row that is no row of this list as one that cannot be read", () => {
      const rows = [
        ...Array.from({ length: 19 }, (_, index) => row({ id: `acme${index}` })),
        { id: "acme", display: 7 },
      ];
      const parsed = canadaAiRegisterConnector.parse(snapshotOfRows(rows));
      expect(parsed.records).toHaveLength(19);
      expect(parsed.skipped).toBe(1);
    });

    it("counts a row with no spelling of its vendor as one that cannot be read: its identifier is the first spelling", () => {
      const rows = [
        ...Array.from({ length: 19 }, (_, index) => row({ id: `acme${index}` })),
        row({ id: "acme", names: [] }),
      ];
      const parsed = canadaAiRegisterConnector.parse(snapshotOfRows(rows));
      expect(parsed.records).toHaveLength(19);
      expect(parsed.skipped).toBe(1);
    });

    it("fails the list when more rows than the allowance cannot be read", () => {
      const rows = Array.from({ length: 12 }, () => row({ id: "" }));
      const parsed = canadaAiRegisterConnector.parse(snapshotOfRows(rows));
      expect(parsed.records).toHaveLength(0);
      expect(parsed.errors).toBe(12);
    });

    it("has no root for a body that its own download did not make", () => {
      const parsed = canadaAiRegisterConnector.parse({
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
        const snapshot = await download(registerCsv(SAMPLE_SYSTEMS));
        newConnector().parse(snapshot);
        await failureOf(newConnector().download(fakeFetch({}), {}));
        await failureOf(
          newConnector().download(
            fakeFetch(
              filesOf("not a list", {
                csvFile: { url: `https://evil.example.test/x?sig=${SIGNATURE}` },
              }),
            ),
            {},
          ),
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
