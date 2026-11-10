/**
 * What the two NHTSA lists share (connectors/nhtsaFlat.ts): the streaming download of a zip that
 * inflates to 300 to 400 MB (the conditional GET through the kit's pin, the zip gate, the inflate
 * with a byte cap and a line cap, the line reader), the cleaning of cells and names, the day of the
 * flat files, the grouping of names into entities, and the pieces of the summaries. Every file is
 * invented by the test; the zips are written by hand (helpers/zipFixtures.ts). No network.
 */
import zlib from "zlib";
import { FetchError } from "../../../../webResearch/guardedFetch";
import { streamZipEntry } from "../../zip";
import { nameKeysOf } from "../../keys";
import { lineOf, withoutAngles } from "../kit/clean";
import type { Fetched } from "../kit/fileConnector";
import {
  ENTITY_ID_MAX,
  ENTITY_NAME_MAX,
  ENVELOPE_BYTES_MAX,
  ENVELOPE_CONTENT_TYPE,
  FLAT_LINES_MAX,
  FLAT_LINE_BYTES_MAX,
  type FlatFile,
  type FlatLimits,
  NHTSA_DOCUMENTATION_URL,
  NHTSA_SENTENCE_HOST,
  byYearOf,
  cellCleaner,
  checkZipDirectory,
  countPhrase,
  entityKeyOf,
  envelopeOf,
  firstSentence,
  flatMetaOf,
  hasNameKey,
  isCleanLine,
  isCount,
  isDriverAssistance,
  isEntityId,
  isPlaceholderName,
  isStoredDay,
  isYear,
  keyNamesOf,
  nameCleaner,
  namesOfSpelling,
  optionalDay,
  plausibleDay,
  readEnvelope,
  streamFlatFile,
  topSpellings,
  withThousands,
  yearsSentence,
} from "../nhtsaFlat";
import { BodyTooLargeError, NotTheListError } from "../types";
import { fakeFetch } from "./helpers/kitContract";
import { flatZip, zipOf } from "./helpers/zipFixtures";

jest.setTimeout(30_000);

const URL = "https://static.nhtsa.gov/odi/ffdd/inv/FLAT_INV.zip";
const ENTRY = "FLAT_INV.txt";
const OCTETS = "application/octet-stream";

const FILE: FlatFile = {
  url: URL,
  pin: { hosts: ["static.nhtsa.gov"], pathPrefixes: ["/odi/ffdd/inv/"] },
  entryName: ENTRY,
  contentTypes: [OCTETS, "application/zip"],
  timeoutMs: 120_000,
};

const LIMITS: FlatLimits = { maxZipBytes: 1 << 20, maxInflatedBytes: 1 << 20, maxLines: 1_000 };

const served = (body: Buffer, over: Record<string, unknown> = {}) => ({
  [URL]: {
    body,
    contentType: OCTETS,
    etag: '"e1"',
    lastModified: "Tue, 03 Mar 2026 14:20:05 GMT",
    ...over,
  },
});

/** The lines the reader gave, as text (a line is valid during the call only: it is decoded here). */
async function run(
  zip: Buffer,
  limits: Partial<FlatLimits> = {},
  files: Record<string, unknown> = {},
  validators = {},
) {
  const lines: Array<string | null> = [];
  const fetch = fakeFetch({ ...served(zip), ...files } as Parameters<typeof fakeFetch>[0]);
  const result = await streamFlatFile(fetch, validators, FILE, { ...LIMITS, ...limits }, (line) => {
    lines.push(line === null ? null : line.toString("utf8"));
  });
  return { lines, result, fetch };
}

const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error("The call did not fail.");
    },
    (error: unknown) => error,
  );

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

describe("streamFlatFile: a zip of text, read as lines without holding it", () => {
  const TEXT = "a\tb\nc\td\r\ne\tf";

  it("gives the lines of the one entry of a zip whose sizes are in a data descriptor, the last one without a line feed", async () => {
    const zip = flatZip(ENTRY, TEXT);
    // The real files have bit 3: the local header holds no sizes, and only the directory has them.
    expect(zip.readUInt16LE(6) & 0x0008).toBe(0x0008);
    expect(zip.readUInt32LE(18)).toBe(0);

    const { lines, result } = await run(zip);

    expect(lines).toEqual(["a\tb", "c\td", "e\tf"]);
    expect(result).toEqual({
      etag: '"e1"',
      lastModified: "Tue, 03 Mar 2026 14:20:05 GMT",
      zipBytes: zip.length,
      inflatedBytes: TEXT.length,
      lines: 3,
    });
  });

  it("asks once, with the validators it was given and the limits of the file", async () => {
    const zip = flatZip(ENTRY, TEXT);
    const validators = { etag: '"old"', lastModified: "Mon, 02 Mar 2026 14:20:05 GMT" };

    const { fetch } = await run(zip, { maxZipBytes: 5_000 }, {}, validators);

    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0]).toEqual({
      url: URL,
      validators,
      limits: {
        maxBytes: 5_000,
        allowedContentTypes: [OCTETS, "application/zip"],
        totalTimeoutMs: 120_000,
      },
    });
  });

  it("answers unchanged for a 304 at the pinned address, and reads nothing", async () => {
    const lines: unknown[] = [];
    const fetch = fakeFetch(served(flatZip(ENTRY, TEXT)));

    const result = await streamFlatFile(fetch, { etag: '"e1"' }, FILE, LIMITS, (line) =>
      lines.push(line),
    );

    expect(result).toBe("unchanged");
    expect(lines).toEqual([]);
  });

  describe("where the answer came from", () => {
    const zip = flatZip(ENTRY, TEXT);
    const places: Array<[string, string]> = [
      ["another host", "https://evil.example.org/odi/ffdd/inv/FLAT_INV.zip"],
      ["a look-alike host", "https://static.nhtsa.gov.evil.example.org/odi/ffdd/inv/FLAT_INV.zip"],
      [
        "a path outside the directory of the list",
        "https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_INV.zip",
      ],
      [
        "a path that only begins like it",
        "https://static.nhtsa.gov/odi/ffdd/inv-other/FLAT_INV.zip",
      ],
      ["plain http", "http://static.nhtsa.gov/odi/ffdd/inv/FLAT_INV.zip"],
    ];

    it.each(places)("a 200 answer from %s is not allowed", async (_label, url) => {
      const error = await failureOf(run(zip, {}, served(zip, { url })));
      expect(error).toBeInstanceOf(FetchError);
      expect(error).toMatchObject({ reason: "not_allowed" });
      // The error holds no address: it can carry a token.
      expect(JSON.stringify(error)).not.toContain("evil");
      expect(String((error as Error).message)).not.toContain("evil");
    });

    it.each(places)("a 304 answer from %s is not allowed either", async (_label, url) => {
      const error = await failureOf(run(zip, {}, served(zip, { url }), { etag: '"e1"' }));
      expect(error).toMatchObject({ name: "FetchError", reason: "not_allowed" });
    });

    it("lets a failure of the fetch through as it is", async () => {
      const fetch = fakeFetch({});
      const error = await failureOf(streamFlatFile(fetch, {}, FILE, LIMITS, () => undefined));
      expect(error).toMatchObject({ name: "FetchError", reason: "unreachable" });
    });

    it("refuses a type that the file does not list", async () => {
      const error = await failureOf(run(zip, {}, served(zip, { contentType: "text/html" })));
      expect(error).toMatchObject({ name: "FetchError", reason: "unsupported_type" });
    });
  });

  describe("the size of the zip", () => {
    it("takes a zip of exactly the limit, and fails a zip one byte over it as too large", async () => {
      const zip = flatZip(ENTRY, TEXT);

      const exact = await run(zip, { maxZipBytes: zip.length });
      expect(exact.lines).toHaveLength(3);

      const error = await failureOf(run(zip, { maxZipBytes: zip.length - 1 }));
      expect(error).toBeInstanceOf(BodyTooLargeError);
    });

    it("fails a body that the page guard says it cut, as too large", async () => {
      const error = await failureOf(
        run(flatZip(ENTRY, TEXT), {}, served(flatZip(ENTRY, TEXT), { truncated: true })),
      );
      expect(error).toBeInstanceOf(BodyTooLargeError);
    });
  });

  describe("the zip gate: what is not the one deflated entry of the list is not the list", () => {
    const refused: Array<[string, () => Buffer]> = [
      [
        "two entries",
        () =>
          zipOf([
            { name: ENTRY, data: TEXT },
            { name: "OTHER.txt", data: "x" },
          ]),
      ],
      [
        "a folder and the entry",
        () =>
          zipOf([
            { name: "flat/", data: "", method: 0 },
            { name: ENTRY, data: TEXT },
          ]),
      ],
      ["no entry at all", () => zipOf([])],
      [
        "an encrypted entry (flag bit 0)",
        () => zipOf([{ name: ENTRY, data: TEXT, flags: 0x0801 }]),
      ],
      ["a stored entry (method 0)", () => zipOf([{ name: ENTRY, data: TEXT, method: 0 }])],
      ["a method that nobody reads (9)", () => zipOf([{ name: ENTRY, data: TEXT, method: 9 }])],
      ["another name", () => zipOf([{ name: "FLAT_RCL.txt", data: TEXT }])],
      ["the name in another case", () => zipOf([{ name: "flat_inv.txt", data: TEXT }])],
      ["the name inside a folder", () => zipOf([{ name: `flat/${ENTRY}`, data: TEXT }])],
      ["the name of a zip inside the zip", () => zipOf([{ name: "FLAT_INV.zip", data: TEXT }])],
      ["a CRC that the data does not have", () => zipOf([{ name: ENTRY, data: TEXT, crc: 1 }])],
      ["a size one byte short", () => zipOf([{ name: ENTRY, data: TEXT, size: TEXT.length - 1 }])],
      ["a size one byte over", () => zipOf([{ name: ENTRY, data: TEXT, size: TEXT.length + 1 }])],
      [
        "a deflate stream that is cut",
        () =>
          zipOf([{ name: ENTRY, data: TEXT, stored: zlib.deflateRawSync(TEXT).subarray(0, 6) }]),
      ],
      [
        "bytes that are no deflate stream",
        () =>
          zipOf([{ name: ENTRY, data: TEXT, stored: Buffer.from("not a deflate stream at all") }]),
      ],
      [
        "a Zip64 end of central directory",
        () => zipOf([{ name: ENTRY, data: TEXT }], { zip64End: true }),
      ],
      ["a Zip64 extra field", () => zipOf([{ name: ENTRY, data: TEXT, zip64Extra: true }])],
      [
        "Zip64 sizes (0xFFFFFFFF) and their extra field",
        () => zipOf([{ name: ENTRY, data: TEXT, zip64Sizes: true }]),
      ],
      ["a page of HTML", () => Buffer.from("<html><body>Not found</body></html>")],
      ["an empty body", () => Buffer.alloc(0)],
      [
        "a zip without its end",
        () => flatZip(ENTRY, TEXT).subarray(0, flatZip(ENTRY, TEXT).length - 30),
      ],
    ];

    it.each(refused)("%s is not the list", async (_label, make) => {
      const lines: unknown[] = [];
      const fetch = fakeFetch(served(make()));
      const error = await failureOf(
        streamFlatFile(fetch, {}, FILE, LIMITS, (line) => lines.push(line)),
      );
      expect(error).toBeInstanceOf(NotTheListError);
      // The error holds no part of the file.
      expect(String((error as Error).message)).not.toContain("OTHER");
    });

    it("lets streamZipEntry take a Zip64 zip, which is why the gate looks at the directory itself", async () => {
      for (const entry of [{ zip64Extra: true }, { zip64Sizes: true }]) {
        const zip = zipOf([{ name: ENTRY, data: TEXT, ...entry }]);
        const limits = { maxEntries: 16, maxEntryBytes: 1 << 20, maxTotalBytes: 1 << 20 };
        const seen: Buffer[] = [];
        const result = await streamZipEntry(
          zip,
          () => true,
          limits,
          (chunk) => seen.push(Buffer.from(chunk)),
        );
        expect(result.bytes).toBe(TEXT.length);
        expect(() => checkZipDirectory(zip)).toThrow(NotTheListError);
      }
    });

    it("takes the zip that the real files are: one deflated entry with a data descriptor", () => {
      expect(() => checkZipDirectory(flatZip(ENTRY, TEXT))).not.toThrow();
      expect(() =>
        checkZipDirectory(zipOf([{ name: ENTRY, data: TEXT }], { comment: "a comment" })),
      ).not.toThrow();
    });
  });

  describe("the caps", () => {
    const lineText = (count: number): string =>
      Array.from({ length: count }, (_, n) => `line ${n}`).join("\n");

    it("fails an entry that inflates to one byte over the cap as too large, before any byte is read, and takes one of exactly the cap", async () => {
      const zip = flatZip(ENTRY, TEXT);

      const exact = await run(zip, { maxInflatedBytes: TEXT.length });
      expect(exact.result).toMatchObject({ inflatedBytes: TEXT.length });

      const lines: unknown[] = [];
      const fetch = fakeFetch(served(zip));
      const error = await failureOf(
        streamFlatFile(fetch, {}, FILE, { ...LIMITS, maxInflatedBytes: TEXT.length - 1 }, (line) =>
          lines.push(line),
        ),
      );
      expect(error).toBeInstanceOf(BodyTooLargeError);
      expect(lines).toEqual([]);
    });

    it("does not let a directory that lies about the size bypass the count: no more than it says is read, and the read fails", async () => {
      const data = Buffer.from(Array.from({ length: 500 }, (_, n) => `row ${n}`).join("\n"));
      const zip = zipOf([{ name: ENTRY, data, size: 100, descriptor: true }]);
      const seen: string[] = [];
      const fetch = fakeFetch(served(zip));

      const error = await failureOf(
        streamFlatFile(fetch, {}, FILE, LIMITS, (line) =>
          seen.push(line === null ? "" : line.toString("utf8")),
        ),
      );

      expect(error).toBeInstanceOf(NotTheListError);
      // The lines given before the check make at most the bytes the directory declared.
      expect(seen.join("\n").length).toBeLessThanOrEqual(100);
    });

    it("takes a file of exactly the cap of lines, and fails a file one line over it as too large, with or without a final line feed", async () => {
      const cap = 5;
      const exact = await run(flatZip(ENTRY, lineText(cap)), { maxLines: cap });
      expect(exact.lines).toHaveLength(cap);
      expect(
        (await run(flatZip(ENTRY, `${lineText(cap)}\n`), { maxLines: cap })).lines,
      ).toHaveLength(cap);

      for (const over of [lineText(cap + 1), `${lineText(cap + 1)}\n`, `${lineText(cap)}\n\n`]) {
        const error = await failureOf(run(flatZip(ENTRY, over), { maxLines: cap }));
        expect(error).toBeInstanceOf(BodyTooLargeError);
      }
    });

    it("keeps the production caps as numbers that the real files are far from", () => {
      expect(FLAT_LINES_MAX).toBe(1_000_000);
      // The real files have 154,460 and 247,176 lines, and lines far shorter than this limit.
      expect(FLAT_LINE_BYTES_MAX).toBeGreaterThanOrEqual(65_536);
    });

    it("counts blank lines, and gives a line past the limit of bytes as one null, going on with the next", async () => {
      const long = "x".repeat(FLAT_LINE_BYTES_MAX + 1);
      const { lines, result } = await run(flatZip(ENTRY, `one\n\n${long}\ntwo`));

      expect(lines).toEqual(["one", "", null, "two"]);
      expect(result).toMatchObject({ lines: 4 });
    });

    it("takes a line of exactly the limit of bytes", async () => {
      const exact = "y".repeat(FLAT_LINE_BYTES_MAX);
      const { lines } = await run(flatZip(ENTRY, `${exact}\nafter`));
      expect(lines).toEqual([exact, "after"]);
    });
  });

  describe("what the reader of lines throws", () => {
    it("comes out as it was thrown, and nothing after it is read", async () => {
      const mistake = new RangeError("a mistake of the reader");
      const fetch = fakeFetch(served(flatZip(ENTRY, lineText3())));
      let given = 0;

      const error = await failureOf(
        streamFlatFile(fetch, {}, FILE, LIMITS, () => {
          given += 1;
          throw mistake;
        }),
      );

      expect(error).toBe(mistake);
      expect(given).toBe(1);
    });

    it("keeps a BodyTooLargeError that the reader throws (a state that grows without end is too large)", async () => {
      const fetch = fakeFetch(served(flatZip(ENTRY, lineText3())));
      const error = await failureOf(
        streamFlatFile(fetch, {}, FILE, LIMITS, () => {
          throw new BodyTooLargeError();
        }),
      );
      expect(error).toBeInstanceOf(BodyTooLargeError);
    });

    function lineText3(): string {
      return "one\ntwo\nthree";
    }
  });
});

describe("checkZipDirectory", () => {
  it("refuses a directory whose end record names more than one entry, or none", () => {
    const two = zipOf([
      { name: ENTRY, data: "a" },
      { name: "b.txt", data: "b" },
    ]);
    expect(() => checkZipDirectory(two)).toThrow(NotTheListError);
    expect(() => checkZipDirectory(zipOf([]))).toThrow(NotTheListError);
  });

  it("refuses an end record that is not the last bytes of the zip, and a zip with bytes after it", () => {
    const zip = flatZip(ENTRY, "a\nb");
    expect(() => checkZipDirectory(Buffer.concat([zip, Buffer.from("trailing")]))).toThrow(
      NotTheListError,
    );
  });

  it("refuses a directory that lies about where it is", () => {
    const zip = Buffer.from(flatZip(ENTRY, "a\nb"));
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    zip.writeUInt32LE(zip.length + 10, end + 16);
    expect(() => checkZipDirectory(zip)).toThrow(NotTheListError);
  });

  it("refuses a central header that is cut, and one that is no central header", () => {
    const zip = Buffer.from(flatZip(ENTRY, "a\nb"));
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const offset = zip.readUInt32LE(end + 16);

    const cut = Buffer.from(zip);
    cut.writeUInt32LE(20, end + 12);
    expect(() => checkZipDirectory(cut)).toThrow(NotTheListError);

    const wrong = Buffer.from(zip);
    wrong.writeUInt32LE(0xdeadbeef, offset);
    expect(() => checkZipDirectory(wrong)).toThrow(NotTheListError);
  });

  it("refuses an end record of another disk", () => {
    const zip = Buffer.from(flatZip(ENTRY, "a\nb"));
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    zip.writeUInt16LE(1, end + 4);
    expect(() => checkZipDirectory(zip)).toThrow(NotTheListError);
  });

  describe("each fault of a directory is refused by itself: one field of a good zip is wrong, and nothing else", () => {
    /** A zip of one entry that the gate takes, and where its end record and its central header are. */
    const whole = () => {
      const zip = Buffer.from(flatZip(ENTRY, "a\nb"));
      const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
      return { zip, end, offset: zip.readUInt32LE(end + 16) };
    };

    /** The same zip with `extra` as the extra field of its central header, and the lengths that say so. */
    const withExtra = (extra: Buffer): Buffer => {
      const { zip, end, offset } = whole();
      const header = Buffer.from(zip.subarray(offset, offset + 46 + zip.readUInt16LE(offset + 28)));
      header.writeUInt16LE(extra.length, 30);
      const record = Buffer.from(zip.subarray(end));
      record.writeUInt32LE(header.length + extra.length, 12);
      return Buffer.concat([zip.subarray(0, offset), header, extra, record]);
    };

    it("takes the good zip that all the faults below are made of", () => {
      expect(() => checkZipDirectory(whole().zip)).not.toThrow();
    });

    it.each<[string, (zip: Buffer, end: number, offset: number) => void]>([
      ["an end record of another disk", (zip, end) => zip.writeUInt16LE(1, end + 4)],
      ["a directory that starts on another disk", (zip, end) => zip.writeUInt16LE(1, end + 6)],
      [
        "a count on this disk that is not the count of the directory",
        (zip, end) => zip.writeUInt16LE(2, end + 8),
      ],
      [
        "two entries counted, on this disk and in all, over a directory of one header",
        (zip, end) => {
          zip.writeUInt16LE(2, end + 8);
          zip.writeUInt16LE(2, end + 10);
        },
      ],
      [
        "no entry counted, on this disk and in all",
        (zip, end) => {
          zip.writeUInt16LE(0, end + 8);
          zip.writeUInt16LE(0, end + 10);
        },
      ],
      [
        "a directory that runs into the end record (the header says a comment, the end record a length that holds it)",
        (zip, end, offset) => {
          zip.writeUInt16LE(3, offset + 32);
          zip.writeUInt32LE(zip.readUInt32LE(end + 12) + 3, end + 12);
        },
      ],
      [
        "a header with a comment that its directory does not have",
        (zip, _end, offset) => zip.writeUInt16LE(1, offset + 32),
      ],
      [
        "a header with a name length that its directory does not have",
        (zip, _end, offset) => zip.writeUInt16LE(zip.readUInt16LE(offset + 28) + 1, offset + 28),
      ],
      [
        "a compressed size of 0xFFFFFFFF and no extra field",
        (zip, _end, offset) => zip.writeUInt32LE(0xffffffff, offset + 20),
      ],
      [
        "a size of 0xFFFFFFFF and no extra field",
        (zip, _end, offset) => zip.writeUInt32LE(0xffffffff, offset + 24),
      ],
      [
        "a local header offset of 0xFFFFFFFF and no extra field",
        (zip, _end, offset) => zip.writeUInt32LE(0xffffffff, offset + 42),
      ],
    ])("refuses %s", (_label, edit) => {
      const { zip, end, offset } = whole();
      edit(zip, end, offset);

      expect(() => checkZipDirectory(zip)).toThrow(NotTheListError);
    });

    it("refuses a Zip64 locator that stands before an end record whose fields are all ordinary", () => {
      const { zip, end } = whole();
      const locator = Buffer.alloc(20);
      locator.writeUInt32LE(0x07064b50, 0);

      expect(() =>
        checkZipDirectory(Buffer.concat([zip.subarray(0, end), locator, zip.subarray(end)])),
      ).toThrow(NotTheListError);
    });

    it("refuses a directory that is no more than a signature, as the gate's own error and before it reads a header that is not there", () => {
      const { zip, end, offset } = whole();
      const record = Buffer.from(zip.subarray(end));
      record.writeUInt32LE(4, 12);
      const bare = Buffer.concat([
        zip.subarray(0, offset),
        Buffer.from([0x50, 0x4b, 0x01, 0x02]),
        record,
      ]);

      expect(() => checkZipDirectory(bare)).toThrow(NotTheListError);
    });

    it("walks the extra fields of the central header by their lengths, and refuses a Zip64 one wherever it stands", () => {
      const other = Buffer.from([0x0a, 0x00, 0x02, 0x00, 0x00, 0x00]);
      const wide = Buffer.from([0x01, 0x00, 0x00, 0x00]);

      expect(() => checkZipDirectory(withExtra(other))).not.toThrow();
      expect(() => checkZipDirectory(withExtra(wide))).toThrow(NotTheListError);
      expect(() => checkZipDirectory(withExtra(Buffer.concat([other, wide])))).toThrow(
        NotTheListError,
      );
      expect(() => checkZipDirectory(withExtra(Buffer.concat([other, other, wide])))).toThrow(
        NotTheListError,
      );
    });
  });
});

describe("the days of the flat files", () => {
  it.each([
    ["20260131", "2026-01-31"],
    ["20240229", "2024-02-29"],
    ["19000101", "1900-01-01"],
    ["20991231", "2099-12-31"],
  ])("%s is the day %s", (text, day) => {
    expect(plausibleDay(text)).toBe(day);
  });

  it.each([
    ["a day that does not exist", "19800231"],
    ["a year before 1900, such as a sentinel", "18991231"],
    ["a year after 2099, such as a sentinel", "21000101"],
    ["the year 9999", "99991231"],
    ["the year 0001", "00010101"],
    ["seven digits", "2026013"],
    ["a blank before it", " 20260131"],
    ["the day with dashes", "2026-01-31"],
    ["text", "garbage"],
    ["an empty text", ""],
  ])("%s is no day", (_label, text) => {
    expect(plausibleDay(text)).toBeNull();
  });

  it("reads an empty cell as no day, a day as itself, and anything else as a cell that cannot be read", () => {
    expect(optionalDay("")).toBeNull();
    expect(optionalDay("20260131")).toBe("2026-01-31");
    expect(optionalDay("garbage")).toBeUndefined();
    expect(optionalDay("00000000")).toBeUndefined();
    expect(optionalDay("99991231")).toBeUndefined();
    expect(optionalDay(" ")).toBeUndefined();
  });
});

describe("the cleaning of cells and names", () => {
  it("cleans a cell as a line: controls, bidirectional characters, white space, angle brackets, and cuts it with a marker", () => {
    const clean = cellCleaner(40);
    const hostile = `a${cp(0x07)}b${cp(0x202e)}c  \t d <script>x</script>`;

    expect(clean(hostile)).toBe(
      `abc d ${cp(0x2039)}script${cp(0x203a)}x${cp(0x2039)}/script${cp(0x203a)}`,
    );
    expect(clean("x".repeat(100))).toHaveLength(40);
    expect(clean("x".repeat(100)).endsWith(" [shortened]")).toBe(true);
    expect(clean("")).toBe("");
    // A lone surrogate is replaced, never kept.
    expect(clean(`ok${cp(0xd800)}`)).not.toMatch(/[\u{D800}-\u{DFFF}]/u);
  });

  it("gives the same line for the same cell, and reads a cell of 100 KB without keeping it", () => {
    const clean = cellCleaner(80);
    const big = `big ${"z".repeat(100_000)}`;
    const first = clean(big);
    expect(first).toHaveLength(80);
    expect(clean(big)).toBe(first);
    expect(clean("Acme Motors")).toBe(clean("Acme Motors"));
  });

  it("gives a name as a line, and no name for a cell that is empty, a placeholder, or without a letter or a digit", () => {
    const name = nameCleaner();

    expect(name("  Acme   Motor  Co.  ")).toBe("Acme Motor Co.");
    expect(name("")).toBe("");
    expect(name("   ")).toBe("");
    expect(name("UNKNOWN MANUFACTURER")).toBe("");
    expect(name("Generic Manufacturer")).toBe("");
    expect(name("VARIOUS MANUFACTURERS")).toBe("");
    expect(name("Acme Parts redundant - Inactive")).toBe("");
    expect(name("---")).toBe("");
    expect(name("Unknown Motors, Inc.")).toBe("Unknown Motors, Inc.");
  });

  it("gives null, and no cut name, for a name that does not fit in the cap once cleaned, and keeps one of exactly the cap", () => {
    const name = nameCleaner();
    const fits = "x".repeat(ENTITY_NAME_MAX);

    expect(name(fits)).toBe(fits);
    expect(name(`${fits}y`)).toBeNull();
    for (const length of [ENTITY_NAME_MAX + 2, 92, 93, 94, 100, 500, 100_000]) {
      expect(name("x".repeat(length))).toBeNull();
    }
    // The length that counts is that of the clean line: what the cleaning takes out is not counted.
    const padded = `${" ".repeat(200)}Acme${cp(0x200b).repeat(200)}   Motors${"\t".repeat(100)}`;
    expect(name(padded)).toBe("Acme Motors");
    // A cell that names nobody is no name, an empty text, and its line is a readable one: null is only for a name that does not fit.
    for (const text of ["", "   ", cp(0x200b, 0x200b), "---", "UNKNOWN MANUFACTURER"]) {
      expect(name(text)).toBe("");
    }
    // A name of pairs of surrogates is counted in units: 40 of them are 80, and a unit more is too long.
    const letter = cp(0x20000);
    expect(name(letter.repeat(40))).toBe(letter.repeat(40));
    expect(name(`a${letter.repeat(40)}`)).toBeNull();
  });

  it("never gives a cut name: a name whose cut would fall right after a blank, or in the middle of a pair of surrogates, is null too", () => {
    // The cut of `lineOf` takes the blank before it off and never splits a pair, so a cut line can be
    // short of the cap: 68 letters and the marker (12 units) are 80 units, a whole name by the length alone.
    const name = nameCleaner();
    const emoji = cp(0x1f600);
    for (let at = 55; at <= 90; at += 1) {
      expect(name(`${"a".repeat(at)} ${"b".repeat(60)}`)).toBeNull();
      expect(name(`${"a".repeat(at)}${emoji}${"b".repeat(60)}`)).toBeNull();
    }
    // Whatever it gives is never a text that was cut.
    for (let length = 1; length <= 300; length += 1) {
      const text = "ab ".repeat(100).slice(0, length).trim();
      const given = name(text);
      expect(given === null || !given.endsWith("[shortened]")).toBe(true);
      expect(given === null).toBe(text.length > ENTITY_NAME_MAX);
    }
  });

  it("gives null, not an empty text, for a name over the cap that begins with a pair of surrogates: its line is unreadable, and names no entity by being cut", () => {
    // What tells a cell with no text from a name that does not fit is whether the clean line is empty. A
    // test that cuts the line at one unit finds nothing in a name that begins with a pair of surrogates,
    // since the cut never splits a pair, and would take such a name for a cell with no text: no entity,
    // and the line read and not counted, where the line of a name that does not fit is unreadable.
    const name = nameCleaner();
    const emoji = cp(0x1f600);
    const shapes = [
      `${emoji} ${"b".repeat(100)}`,
      `${emoji}${"b".repeat(100)}`,
      `${emoji}${emoji} ${"b".repeat(100)}`,
      `${" ".repeat(7)}${emoji} Acme Motors ${"b".repeat(100)}`,
      `${emoji} ${"b".repeat(ENTITY_NAME_MAX - 2)}`,
    ];
    for (const text of shapes) {
      // The shape: the clean line has a text, and it is longer than the cap, so it is no cell without text.
      expect(lineOf(text, ENTITY_NAME_MAX)).not.toBe("");
      expect(lineOf(text, 1)).toBe("");
      expect(name(text)).toBeNull();
    }
    // The same name within the cap is a name, whole (the pair counts two units).
    const fits = `${emoji} ${"b".repeat(ENTITY_NAME_MAX - 3)}`;
    expect(fits).toHaveLength(ENTITY_NAME_MAX);
    expect(name(fits)).toBe(fits);
    expect(name(`${fits}b`)).toBeNull();
  });

  it.each([
    "UNKNOWN MANUFACTURER",
    "unknown manufacturer",
    "Generic Manufacturer",
    "VARIOUS MANUFACTURERS",
    "Acme Parts redundant - Inactive",
    "REDUNDANT",
  ])("%s is a placeholder", (text) => {
    expect(isPlaceholderName(text)).toBe(true);
  });

  it.each(["Acme Motors", "Unknown Motors, Inc.", "Generic Motors Ltd", "Variousa Trucks"])(
    "%s is no placeholder",
    (text) => {
      expect(isPlaceholderName(text)).toBe(false);
    },
  );
});

describe("isCleanLine: the check of a cell that a download stored", () => {
  it.each([
    "Acme Motors",
    "A",
    "Zeta Motors, Inc.",
    `${cp(0xdc)}n${cp(0xef)}code Stra${cp(0xdf)}e GmbH`,
    `${cp(0x540d, 0x524d)} Motors`,
    `Grin ${cp(0x1f600)} Motors`,
    `Quoted ${cp(0x2039)}name${cp(0x203a)} Co.`,
    "x".repeat(80),
  ])("takes %s", (value) => {
    expect(isCleanLine(value, 80)).toBe(true);
  });

  it.each([
    ["an empty text", ""],
    ["81 units where 80 is the limit", "x".repeat(81)],
    ["a less-than sign", "a<b"],
    ["a greater-than sign", "a>b"],
    ["a full-width less-than sign", `a${cp(0xff1c)}b`],
    ["a small greater-than sign", `a${cp(0xfe65)}b`],
    ["a small less-than sign", `a${cp(0xfe64)}b`],
    ["a full-width greater-than sign", `a${cp(0xff1e)}b`],
    ["a not-less-than sign", `a${cp(0x226e)}b`],
    ["a not-greater-than sign", `a${cp(0x226f)}b`],
    ["a line feed", "a\nb"],
    ["a carriage return", "a\rb"],
    ["a tab", "a\tb"],
    ["a NUL", `a${cp(0)}b`],
    ["a DEL", `a${cp(0x7f)}b`],
    ["a C1 control", `a${cp(0x85)}b`],
    ["a lone high surrogate", `a${cp(0xd800)}b`],
    ["a lone low surrogate", `a${cp(0xdc00)}b`],
    ["a lone surrogate at the end", `ab${cp(0xdbff)}`],
  ])("refuses %s", (_label, value) => {
    expect(isCleanLine(value, 80)).toBe(false);
  });

  it("takes a line of exactly the limit, and refuses one unit more, whatever the limit is", () => {
    expect(isCleanLine("abc", 3)).toBe(true);
    expect(isCleanLine("abcd", 3)).toBe(false);
    expect(isCleanLine(cp(0x1f600, 0x1f600), 4)).toBe(true);
    expect(isCleanLine(cp(0x1f600, 0x1f600), 3)).toBe(false);
  });

  it.each([null, undefined, 5, true, [], {}, ["a"]])("refuses %p, which is no text", (value) => {
    expect(isCleanLine(value, 80)).toBe(false);
  });

  it("takes the line of every cell that the cleaners make, as they make it", () => {
    const clean = nameCleaner();
    const hostile = [
      `Hostile${cp(0x07)} Motors${cp(0x202e)} <script>alert(1)</script> Inc.`,
      `Zeta${cp(0xad, 0x308)} Motors Inc.`,
      `${cp(0xff1c)}b${cp(0xff1e)} Motors`,
      `Lone${cp(0xd800)} Motors`,
      `${"x".repeat(70)} Motors`,
      `${cp(0x1c4, 0xfb03, 0x2167, 0x2460, 0x338f)} Motors`,
    ];
    for (const raw of hostile) {
      const name = clean(raw);
      expect(name).not.toBe("");
      expect(isCleanLine(name, ENTITY_NAME_MAX)).toBe(true);
    }
  });

  it("takes the line of a name that a second cleaning would change: the download wrote it once, and its reader takes it as written", () => {
    // A soft hyphen between a letter and a combining mark is dropped by the cleaning, which leaves the mark loose;
    // cleaning that line again would compose the mark with the letter, so the line is not a fixed point of the cleaning.
    const once = withoutAngles(lineOf(`Zeta${cp(0xad, 0x308)} Motors Inc.`, ENTITY_NAME_MAX));
    expect(once).toBe(`Zeta${cp(0x308)} Motors Inc.`);
    expect(lineOf(once, ENTITY_NAME_MAX)).not.toBe(once);

    expect(isCleanLine(once, ENTITY_NAME_MAX)).toBe(true);
  });
});

describe("entities: the name as the key, its spellings, and the names a vendor may match", () => {
  it("makes one key of the spellings of one name: no case, no punctuation, no legal form", () => {
    const keys = new Set(
      ["Acme Motor Co.", "ACME MOTOR, INC.", "acme motor", "Acme-Motor LLC"].map(entityKeyOf),
    );
    expect([...keys]).toEqual(["acmemotor"]);
    expect(entityKeyOf("Borealis Robotics, Inc.")).toBe("borealisrobotics");
  });

  it("keeps a name whose legal form would leave nothing", () => {
    expect(entityKeyOf("Inc.")).toBe("inc");
    expect(entityKeyOf("---")).toBe("");
  });

  it("keeps the parenthesis of a name in its key, as the shipped NHTSA list does", () => {
    expect(entityKeyOf("Acme (Acme Motor Co.)")).toBe("acmeacmemotorco");
  });

  it("gives, for a spelling with a parenthesis, the whole, the text before it and the text inside it", () => {
    expect(namesOfSpelling("Acme (Acme Motor Co.)")).toEqual([
      "Acme (Acme Motor Co.)",
      "Acme",
      "Acme Motor Co.",
    ]);
    expect(namesOfSpelling("Plain Motors Inc.")).toEqual(["Plain Motors Inc."]);
    // A parenthesis that is never closed runs to the end.
    expect(namesOfSpelling("Acme (Foo Bar")).toEqual(["Acme (Foo Bar", "Acme", "Foo Bar"]);
    // A parenthesis that does not follow a blank is no part of the name.
    expect(namesOfSpelling("Acme(Foo)")).toEqual(["Acme(Foo)"]);
  });

  it("orders the spellings by how many times they are written, a tie by text, at most five", () => {
    const counts = new Map([
      ["B Motors", 2],
      ["A Motors", 2],
      ["C Motors", 3],
      ["D Motors", 1],
      ["E Motors", 1],
      ["F Motors", 1],
      ["G Motors", 1],
    ]);

    expect(topSpellings(counts)).toEqual([
      "C Motors",
      "A Motors",
      "B Motors",
      "D Motors",
      "E Motors",
    ]);
    expect(topSpellings(counts, 2)).toEqual(["C Motors", "A Motors"]);
    expect(topSpellings(new Map())).toEqual([]);
  });

  it("gives the same spellings whatever the order the counts were made in", () => {
    const forward = new Map([
      ["Z", 1],
      ["Y", 1],
      ["X", 1],
    ]);
    const backward = new Map([
      ["X", 1],
      ["Y", 1],
      ["Z", 1],
    ]);
    expect(topSpellings(forward)).toEqual(topSpellings(backward));
  });

  it("makes the names of an entity of its spellings and their parts, each once", () => {
    expect(keyNamesOf(["Acme (Acme Motor Co.)", "ACME MOTOR CO."])).toEqual([
      "Acme (Acme Motor Co.)",
      "Acme",
      "Acme Motor Co.",
      "ACME MOTOR CO.",
    ]);
  });

  it.each([
    ["a name of four compact characters", ["Acme"]],
    ["a name whose legal form leaves three characters: the full name is the key", ["Abc, Inc."]],
    ["the same with another legal form", ["Abc Corporation"]],
    ["one spelling of three characters and another that has a key", ["ABC", "Abc, Inc."]],
    ["a parenthesis whose text inside has a key", ["Xy (Xy Corporation)"]],
    ["a name of three characters and a legal form after punctuation", ["Q-7 LLC"]],
  ])("has a name that a vendor can be matched by: %s", (_label, spellings) => {
    expect(hasNameKey(spellings)).toBe(true);
  });

  it.each([
    ["a bare name of three characters", ["Zyx"]],
    ["a bare name of two letters and a digit", ["Z0"]],
    ["a bare name in capitals with blanks", ["B I C"]],
    ["two bare spellings of three characters", ["ZYX", "Z.Y.X."]],
    ["a bare name and a parenthesis that is bare too", ["Zy (Q)"]],
    ["no spelling at all", []],
  ])("has no name that a vendor can be matched by: %s", (_label, spellings) => {
    expect(hasNameKey(spellings)).toBe(false);
  });

  it("decides on the keys that a record would have, as keys.ts makes them: whole or without its legal form, four compact characters or more", () => {
    for (const spellings of [["Zyx"], ["Abc, Inc."], ["ABC", "Abc LLC"], ["Zy (Zy Co.)"]]) {
      expect(hasNameKey(spellings)).toBe(nameKeysOf(keyNamesOf(spellings)).length > 0);
    }
  });
});

describe("driver assistance and automated driving", () => {
  it.each([
    "ADAS",
    "FORWARD COLLISION AVOIDANCE: AUTOMATIC EMERGENCY BRAKING",
    "lane departure warning",
    "Lane Keeping assist",
    "ADAPTIVE CRUISE CONTROL",
    "SELF-DRIVING SYSTEM",
    "autonomous vehicle",
    "AUTOMATIC EMERGENCY BRAKING",
  ])("%s is a component of that kind", (component) => {
    expect(isDriverAssistance(component)).toBe(true);
  });

  it.each(["SERVICE BRAKES", "AIR BAGS: FRONTAL", "ELECTRICAL SYSTEM", "", "LANE", "EMERGENCY"])(
    "%s is not",
    (component) => {
      expect(isDriverAssistance(component)).toBe(false);
    },
  );
});

describe("counts by year, and what the summaries say of them", () => {
  it("keeps only the four calendar years that end at the anchor year, in ascending order", () => {
    const counts = new Map([
      [2026, 5],
      [2023, 1],
      [2022, 9],
      [2010, 3],
      [2025, 0],
    ]);

    expect(byYearOf(counts, 2026)).toEqual({ "2023": 1, "2026": 5 });
    expect(Object.keys(byYearOf(counts, 2026))).toEqual(["2023", "2026"]);
    expect(byYearOf(counts, 2023)).toEqual({ "2023": 1, "2022": 9 });
    expect(byYearOf(new Map(), 2026)).toEqual({});
  });

  it("writes them newest year first, only the years that have a count, and nothing when none has", () => {
    expect(yearsSentence("By year opened", 2026, { "2026": 5, "2025": 2, "2023": 1 })).toBe(
      "By year opened: 2026 5, 2025 2, 2023 1.",
    );
    // A year outside the four, and a year with no count, are left out.
    expect(yearsSentence("By report year", 2026, { "2022": 4, "2024": 3 })).toBe(
      "By report year: 2024 3.",
    );
    expect(yearsSentence("By report year", 2026, {})).toBe("");
    expect(yearsSentence("By report year", 2026, { "2020": 4 })).toBe("");
  });

  it("counts in the singular for one and the plural otherwise", () => {
    expect(countPhrase(1, "campaign", "campaigns")).toBe("1 campaign");
    expect(countPhrase(0, "campaign", "campaigns")).toBe("0 campaigns");
    expect(countPhrase(2, "investigation", "investigations")).toBe("2 investigations");
  });

  it.each([
    [0, "0"],
    [7, "7"],
    [999, "999"],
    [1000, "1,000"],
    [12_345, "12,345"],
    [394_000, "394,000"],
    [17_600_000, "17,600,000"],
    [999_999_999, "999,999,999"],
  ])("writes %i as %s", (count, text) => {
    expect(withThousands(count)).toBe(text);
  });

  it("opens a summary with the mark, the host of the operator and the kind of list", () => {
    expect(NHTSA_SENTENCE_HOST).toBe("nhtsa.gov");
    expect(firstSentence("NHTSA defect investigations")).toBe(
      "NHTSA defect investigations (nhtsa.gov), a product safety list.",
    );
    // The page of every record is a query on the page that documents the flat files.
    expect(NHTSA_DOCUMENTATION_URL).toBe("https://www.nhtsa.gov/nhtsa-datasets-and-apis");
  });
});

describe("the hand-over from the download to the reader of the list", () => {
  const META = {
    anchorYear: 2026,
    fileNewestDay: "2026-09-18",
    lines: 12,
    blankLines: 1,
    rows: 11,
    unreadable: 2,
    noEntityRows: 3,
    entities: 4,
  };

  const fetchedOf = (buffer: Buffer, contentType = ENVELOPE_CONTENT_TYPE): Fetched => ({
    buffers: [buffer],
    contentTypes: [contentType],
    etag: null,
    lastModified: null,
    bytes: buffer.length,
  });

  it("is JSON that says its charset, so that no meta tag in a name could choose another", () => {
    const buffer = envelopeOf(META, [{ id: "acme" }]);
    expect(ENVELOPE_CONTENT_TYPE).toBe("application/json; charset=utf-8");
    expect(JSON.parse(buffer.toString("utf8"))).toEqual({
      v: 1,
      meta: META,
      entities: [{ id: "acme" }],
    });
    expect(readEnvelope(fetchedOf(buffer))).toEqual({ meta: META, entities: [{ id: "acme" }] });
  });

  it.each([
    ["JSON that is cut", Buffer.from('{"v":1,"meta":{},"entities":[')],
    ["text that is no JSON", Buffer.from("<html>")],
    ["an array", Buffer.from("[]")],
    ["a null", Buffer.from("null")],
    ["another version", Buffer.from('{"v":2,"meta":{},"entities":[]}')],
    ["no meta", Buffer.from('{"v":1,"entities":[]}')],
    ["a meta that is an array", Buffer.from('{"v":1,"meta":[],"entities":[]}')],
    ["no entities", Buffer.from('{"v":1,"meta":{}}')],
    ["entities that are an object", Buffer.from('{"v":1,"meta":{},"entities":{}}')],
    ["nesting that the parser gives up on", Buffer.from(`${"[".repeat(200_000)}`)],
  ])("reads %s as no envelope", (_label, buffer) => {
    expect(readEnvelope(fetchedOf(buffer))).toBeNull();
  });

  it("reads nothing past its limit of bytes, and nothing that is not exactly one file", () => {
    expect(ENVELOPE_BYTES_MAX).toBe(16 * 1024 * 1024);
    const good = envelopeOf(META, []);
    // A JSON of exactly the limit is read; one byte more is not, though it is still a JSON.
    const padded = (size: number): Buffer =>
      Buffer.concat([good, Buffer.alloc(size - good.length, 0x20)]);
    expect(readEnvelope(fetchedOf(padded(ENVELOPE_BYTES_MAX)))).not.toBeNull();
    expect(readEnvelope(fetchedOf(padded(ENVELOPE_BYTES_MAX + 1)))).toBeNull();
    expect(
      readEnvelope({ ...fetchedOf(good), buffers: [good, good], contentTypes: ["", ""] }),
    ).toBeNull();
    expect(readEnvelope({ ...fetchedOf(good), buffers: [], contentTypes: [] })).toBeNull();
  });

  it("checks the numbers of the meta that every list has", () => {
    expect(flatMetaOf(META)).toEqual(META);
    const bad: Array<[string, unknown]> = [
      ["no object", null],
      ["an array", []],
      ["a negative count", { ...META, rows: -1 }],
      ["a count with a fraction", { ...META, unreadable: 1.5 }],
      ["a count that is no number", { ...META, entities: "4" }],
      ["a count past the safe integers", { ...META, lines: 2 ** 53 }],
      ["a missing count", { ...META, noEntityRows: undefined }],
      ["a day that does not exist", { ...META, fileNewestDay: "2026-02-30" }],
      ["a day that is no text", { ...META, fileNewestDay: 20260918 }],
      ["an anchor year that is not the year of the newest day", { ...META, anchorYear: 2025 }],
      ["an anchor year that is no number", { ...META, anchorYear: "2026" }],
    ];
    for (const [, meta] of bad) expect(flatMetaOf(meta)).toBeNull();
  });

  it.each(["lines", "blankLines", "rows", "unreadable", "noEntityRows", "entities"])(
    "takes %s only as a whole number from zero",
    (field) => {
      for (const value of [-1, 1.5, "1", null, undefined, Number.NaN, 2 ** 53]) {
        expect(flatMetaOf({ ...META, [field]: value })).toBeNull();
      }
      expect(flatMetaOf({ ...META, [field]: 0 })).toEqual({ ...META, [field]: 0 });
    },
  );
});

describe("the checks of the numbers and the ids of a stored row", () => {
  it("takes a count that is a whole number from zero, and nothing else", () => {
    for (const value of [0, 1, 17, Number.MAX_SAFE_INTEGER]) expect(isCount(value)).toBe(true);
    const refused = [-1, 0.5, 2 ** 53, Number.NaN, Infinity, "1", null, undefined, []];
    for (const value of refused) expect(isCount(value)).toBe(false);
  });

  it("takes a year from 1900 to 2099 that is a whole number", () => {
    for (const value of [1900, 1901, 2026, 2098, 2099]) expect(isYear(value)).toBe(true);
    const refused = [1899, 2100, 9999, 2026.5, Number.NaN, "2026", null, undefined];
    for (const value of refused) expect(isYear(value)).toBe(false);
  });

  it("takes a day from the first of 1900 to the last of 2099 written as the lists write it, and nothing else", () => {
    for (const value of ["1900-01-01", "2026-09-18", "2099-12-31", "2024-02-29"]) {
      expect(isStoredDay(value)).toBe(true);
    }
    const refused = [
      "1899-12-31",
      "2100-01-01",
      "2026-02-30",
      "2025-02-29",
      "2026-1-6",
      "20260918",
      "2026-09-18T00:00:00Z",
      20260918,
      null,
    ];
    for (const value of refused) expect(isStoredDay(value)).toBe(false);
  });

  it("takes an entity id that is a compact key of at most 160 units, and nothing else", () => {
    for (const value of ["acme", "a1", "d2dlink", "a".repeat(ENTITY_ID_MAX)]) {
      expect(isEntityId(value)).toBe(true);
    }
    expect(isEntityId("a".repeat(ENTITY_ID_MAX + 1))).toBe(false);
    for (const value of ["", "Acme", "acme motors", "acme-motors", "acme.", 5, null, undefined]) {
      expect(isEntityId(value)).toBe(false);
    }
  });
});
