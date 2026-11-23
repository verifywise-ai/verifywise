/**
 * The zip reader of the vendor risk database (M2 Task 7): the CVE Program publishes its records as
 * zips of JSON files, and its baseline is a zip inside a zip. A zip is third-party data: it is read
 * within the limits its caller fixes, a broken or hostile one is a ZipError with a code, and no
 * name in it becomes a path. The zips are written by the test (helpers/zipWriter.ts); the streaming
 * reader's cases that the writer cannot express (a data descriptor, a deflate stream that is cut,
 * bytes that are no deflate stream) are written by hand, byte by byte, in `rawZip` below.
 */
import fs from "fs";
import os from "os";
import path from "path";
import v8 from "v8";
import vm from "vm";
import zlib from "zlib";
import {
  ZipError,
  type ZipLimits,
  type ZipStreamOptions,
  forEachZipEntry,
  readZip,
  readZipFile,
  streamZipEntry,
} from "../zip";
import { writeZip } from "./helpers/zipWriter";

jest.setTimeout(30_000);

const LIMITS: ZipLimits = { maxEntries: 10, maxEntryBytes: 4_096, maxTotalBytes: 16_384 };
const all = () => true;
const record = (id: number) =>
  JSON.stringify({ dataType: "CVE_RECORD", cveMetadata: { cveId: `CVE-2026-${id}` } });

type Entry = { name: string; data: Buffer };
const textOf = (entries: readonly Entry[]) =>
  entries.map(({ name, data }) => [name, data.toString("utf8")]);

function codeOf(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof ZipError) return error.code;
    throw error;
  }
  throw new Error("Expected a ZipError");
}

async function codeOfFile(read: () => Promise<unknown>): Promise<string> {
  try {
    await read();
  } catch (error) {
    if (error instanceof ZipError) return error.code;
    throw error;
  }
  throw new Error("Expected a ZipError");
}

const DELTA = writeZip([
  { name: "deltaCves/", data: "", method: 0 },
  { name: "deltaCves/CVE-2026-1.json", data: record(1) },
  { name: "deltaCves/CVE-2026-2.json", data: record(2), method: 0 },
]);

describe("readZip", () => {
  it("reads deflate and stored entries", () => {
    expect(textOf(readZip(DELTA, all, LIMITS))).toEqual([
      ["deltaCves/CVE-2026-1.json", record(1)],
      ["deltaCves/CVE-2026-2.json", record(2)],
    ]);
  });

  it("gives only the entries the caller accepts, and never a directory", () => {
    const zip = writeZip([
      { name: "README.md", data: "# Deltas" },
      { name: "deltaCves/CVE-2026-1.json", data: record(1) },
    ]);
    const asked: string[] = [];

    const entries = readZip(
      zip,
      (name) => {
        asked.push(name);
        return name.endsWith(".json");
      },
      LIMITS,
    );

    expect(textOf(entries)).toEqual([["deltaCves/CVE-2026-1.json", record(1)]]);
    expect(asked).toEqual(["README.md", "deltaCves/CVE-2026-1.json"]);
  });

  it("reads a Zip64 directory", () => {
    const zip = writeZip(
      [
        { name: "CVE-2026-1.json", data: record(1) },
        { name: "CVE-2026-2.json", data: record(2), method: 0 },
      ],
      { zip64: true, comment: "end of day" },
    );

    expect(textOf(readZip(zip, all, LIMITS))).toEqual([
      ["CVE-2026-1.json", record(1)],
      ["CVE-2026-2.json", record(2)],
    ]);
  });

  it("reads a zip inside a zip", () => {
    const inner = writeZip([{ name: "cves/2026/1xxx/CVE-2026-1.json", data: record(1) }]);
    const outer = writeZip([
      { name: "2026-10-30_all_CVEs_at_midnight.zip", data: inner },
      { name: "CVE-2026-2.json", data: record(2) },
    ]);

    expect(textOf(readZip(outer, all, LIMITS))).toEqual([
      ["cves/2026/1xxx/CVE-2026-1.json", record(1)],
      ["CVE-2026-2.json", record(2)],
    ]);
    // A zip the caller does not accept is not opened.
    expect(textOf(readZip(outer, (name) => name.endsWith(".json"), LIMITS))).toEqual([
      ["CVE-2026-2.json", record(2)],
    ]);
  });

  it("a second level of nesting is refused", () => {
    const deeper = writeZip([{ name: "CVE-2026-1.json", data: record(1) }]);
    const inner = writeZip([{ name: "deeper.zip", data: deeper }]);
    const outer = writeZip([{ name: "inner.zip", data: inner }]);

    expect(codeOf(() => readZip(outer, all, LIMITS))).toBe("too_deep");
  });

  it("a cut zip is corrupt", () => {
    expect(codeOf(() => readZip(DELTA.subarray(0, DELTA.length - 10), all, LIMITS))).toBe(
      "corrupt",
    );
    expect(
      codeOf(() =>
        readZip(Buffer.concat([DELTA.subarray(0, 40), DELTA.subarray(80)]), all, LIMITS),
      ),
    ).toBe("corrupt");
  });

  it("a body that is not a zip is not_zip", () => {
    expect(codeOf(() => readZip(Buffer.from("<html>Not found</html>"), all, LIMITS))).toBe(
      "not_zip",
    );
    expect(codeOf(() => readZip(Buffer.alloc(0), all, LIMITS))).toBe("not_zip");
  });

  it("an entry past its limit is too_large", () => {
    const big = "x".repeat(5_000);
    expect(codeOf(() => readZip(writeZip([{ name: "a.json", data: big }]), all, LIMITS))).toBe(
      "too_large",
    );
    // A directory that says less than the data holds: the inflating stops at the limit.
    expect(
      codeOf(() =>
        readZip(writeZip([{ name: "a.json", data: big, claimedSize: 10 }]), all, LIMITS),
      ),
    ).toBe("too_large");
    // Entries within their limit that are more than the limit of all of them.
    const many = [1, 2, 3, 4, 5].map((n) => ({ name: `${n}.json`, data: "y".repeat(4_000) }));
    expect(codeOf(() => readZip(writeZip(many), all, LIMITS))).toBe("too_large");
  });

  it("an entry with more bytes than its limit could inflate from is too_large, unread", () => {
    // A deflate stream that ends early, and bytes after it that the inflating would never read.
    const padded = writeZip([{ name: "a.json", data: record(1), trailing: Buffer.alloc(10_000) }]);

    expect(codeOf(() => readZip(padded, all, LIMITS))).toBe("too_large");
  });

  it("more entries than the limit is too_large, whether or not they are accepted", () => {
    const eleven = Array.from({ length: 11 }, (_, n) => ({ name: `${n}.txt`, data: "z" }));

    expect(codeOf(() => readZip(writeZip(eleven), () => false, LIMITS))).toBe("too_large");
  });

  it("an unknown method is unsupported, and so is an encrypted entry", () => {
    expect(
      codeOf(() => readZip(writeZip([{ name: "a.json", data: "{}", method: 12 }]), all, LIMITS)),
    ).toBe("unsupported");
    expect(
      codeOf(() => readZip(writeZip([{ name: "a.json", data: "{}", flags: 0x0001 }]), all, LIMITS)),
    ).toBe("unsupported");
  });

  it("a size or a checksum the data does not have is corrupt", () => {
    expect(
      codeOf(() =>
        readZip(
          writeZip([{ name: "a.json", data: record(1), method: 0, claimedSize: 3 }]),
          all,
          LIMITS,
        ),
      ),
    ).toBe("corrupt");
    expect(
      codeOf(() =>
        readZip(writeZip([{ name: "a.json", data: record(1), claimedSize: 5 }]), all, LIMITS),
      ),
    ).toBe("corrupt");
    const flipped = Buffer.from(writeZip([{ name: "a.json", data: record(1), method: 0 }]));
    flipped[30 + "a.json".length] ^= 0xff;
    expect(codeOf(() => readZip(flipped, all, LIMITS))).toBe("corrupt");
  });
});

describe("forEachZipEntry", () => {
  it("hands each accepted entry to the caller as it is read, in the order of the directory", () => {
    const seen: string[] = [];

    const result = forEachZipEntry(DELTA, all, LIMITS, ({ name, data }) => {
      seen.push(`${name}=${data.toString("utf8")}`);
    });

    expect(result).toBeUndefined();
    expect(seen).toEqual([
      `deltaCves/CVE-2026-1.json=${record(1)}`,
      `deltaCves/CVE-2026-2.json=${record(2)}`,
    ]);
  });

  it("stops at the first entry the limits refuse, after handing out those before it", () => {
    const zip = writeZip([
      { name: "deltaCves/CVE-2026-1.json", data: record(1) },
      { name: "deltaCves/CVE-2026-2.json", data: "x".repeat(LIMITS.maxEntryBytes + 1) },
      { name: "deltaCves/CVE-2026-3.json", data: record(3) },
    ]);
    const seen: string[] = [];

    expect(codeOf(() => forEachZipEntry(zip, all, LIMITS, ({ name }) => seen.push(name)))).toBe(
      "too_large",
    );
    expect(seen).toEqual(["deltaCves/CVE-2026-1.json"]);
  });
});

describe("readZipFile", () => {
  let dir: string;
  let temp: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vrdb-zip-test-"));
    temp = path.join(dir, "temp");
    fs.mkdirSync(temp);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const fileOf = (zip: Buffer, name = "release.zip") => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, zip);
    return file;
  };

  async function readAll(file: string, accept: (name: string) => boolean = all) {
    const entries: Entry[] = [];
    const tempFiles: number[] = [];
    await readZipFile(
      file,
      accept,
      LIMITS,
      async (entry) => {
        entries.push(entry);
        tempFiles.push(fs.readdirSync(temp).length);
      },
      { tempDir: temp },
    );
    return { entries, tempFiles };
  }

  it("the file reader gives the same entries as the buffer reader and deletes its temporary file", async () => {
    const inner = writeZip(
      [
        { name: "cves/CVE-2026-1.json", data: record(1) },
        { name: "cves/CVE-2026-3.json", data: record(3), method: 0 },
      ],
      { zip64: true },
    );
    const outer = writeZip([
      { name: "CVE-2026-2.json", data: record(2) },
      { name: "cves.zip", data: inner },
    ]);

    const { entries, tempFiles } = await readAll(fileOf(outer));

    expect(textOf(entries)).toEqual(textOf(readZip(outer, all, LIMITS)));
    expect(textOf(entries)).toHaveLength(3);
    // The inner zip was a file of its own while its entries were read, and is gone after.
    expect(tempFiles).toEqual([0, 1, 1]);
    expect(fs.readdirSync(temp)).toEqual([]);
  });

  it("refuses what the buffer reader refuses, and deletes its temporary file", async () => {
    const deeper = writeZip([{ name: "CVE-2026-1.json", data: record(1) }]);
    const nested = writeZip([
      { name: "inner.zip", data: writeZip([{ name: "deeper.zip", data: deeper }]) },
    ]);
    const big = writeZip([{ name: "a.json", data: "x".repeat(5_000), claimedSize: 10 }]);

    expect(await codeOfFile(() => readAll(fileOf(DELTA.subarray(0, DELTA.length - 10))))).toBe(
      "corrupt",
    );
    expect(await codeOfFile(() => readAll(fileOf(Buffer.from("<html></html>"))))).toBe("not_zip");
    expect(await codeOfFile(() => readAll(fileOf(nested)))).toBe("too_deep");
    expect(await codeOfFile(() => readAll(fileOf(big)))).toBe("too_large");
    expect(fs.readdirSync(temp)).toEqual([]);
  });

  it("a nested zip too large for all the entries is too_large, and its file is deleted", async () => {
    const inner = writeZip([{ name: "a.txt", data: "q".repeat(20_000), method: 0 }]);
    const outer = writeZip([{ name: "inner.zip", data: inner }]);

    expect(await codeOfFile(() => readAll(fileOf(outer)))).toBe("too_large");
    expect(codeOf(() => readZip(outer, all, LIMITS))).toBe("too_large");
    // A directory that says less than the nested zip holds: the inflating stops at the limit.
    const lying = writeZip([{ name: "inner.zip", data: inner, claimedSize: 100 }]);
    expect(await codeOfFile(() => readAll(fileOf(lying, "lying.zip")))).toBe("too_large");
    expect(codeOf(() => readZip(lying, all, LIMITS))).toBe("too_large");
    expect(fs.readdirSync(temp)).toEqual([]);
  });

  it("a nested zip whose bytes are not those of the directory is corrupt", async () => {
    const inner = writeZip([{ name: "CVE-2026-1.json", data: record(1) }]);
    const wrongCrc = writeZip([{ name: "inner.zip", data: inner, claimedCrc: 1 }]);
    const wrongSize = writeZip([{ name: "inner.zip", data: inner, claimedSize: inner.length - 1 }]);

    for (const zip of [wrongCrc, wrongSize]) {
      expect(await codeOfFile(() => readAll(fileOf(zip)))).toBe("corrupt");
      expect(codeOf(() => readZip(zip, all, LIMITS))).toBe("corrupt");
    }
    expect(fs.readdirSync(temp)).toEqual([]);
  });

  it("a nested zip named with .. is written to the reader's own temporary file", async () => {
    const inner = writeZip([{ name: "CVE-2026-1.json", data: record(1) }]);
    const outer = writeZip([{ name: "../../escape.zip", data: inner }]);

    const { entries } = await readAll(fileOf(outer));

    expect(textOf(entries)).toEqual([["CVE-2026-1.json", record(1)]]);
    expect(fs.existsSync(path.join(dir, "escape.zip"))).toBe(false);
    expect(fs.existsSync(path.join(path.dirname(dir), "escape.zip"))).toBe(false);
    expect(fs.readdirSync(temp)).toEqual([]);
  });
});

/** An entry of a zip that the test writes by hand: its bytes lie in the zip as the entry says. */
interface RawEntry {
  name: string;
  /** What the entry inflates to: the size and the CRC-32 of the headers, unless the entry sets them. */
  data?: Buffer;
  /** The bytes after the local header: the deflated `data`, unless the entry gives others. */
  stored?: Buffer;
  method?: number;
  /** The general purpose flags, in place of 0x0800 (names in UTF-8). */
  flags?: number;
  size?: number;
  crc?: number;
  /** Flag bit 3: the local header holds no CRC and no sizes, and a data descriptor follows the data. */
  descriptor?: boolean;
}

const word = (value: number, bytes: 2 | 4): Buffer => {
  const buffer = Buffer.alloc(bytes);
  if (bytes === 2) buffer.writeUInt16LE(value);
  else buffer.writeUInt32LE(value);
  return buffer;
};

/** A zip of the entries, written as PKWARE's APPNOTE lays it out, with no Zip64 and no comment. */
function rawZip(entries: readonly RawEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const data = entry.data ?? Buffer.alloc(0);
    const stored = entry.stored ?? zlib.deflateRawSync(data);
    const name = Buffer.from(entry.name, "utf8");
    const method = entry.method ?? 8;
    const descriptor = entry.descriptor === true;
    const flags = (entry.flags ?? 0x0800) | (descriptor ? 0x0008 : 0);
    const size = entry.size ?? data.length;
    const crc = entry.crc ?? zlib.crc32(data);
    const local = Buffer.concat([
      word(0x04034b50, 4),
      word(20, 2),
      word(flags, 2),
      word(method, 2),
      word(0, 2),
      word(0x21, 2),
      word(descriptor ? 0 : crc, 4),
      word(descriptor ? 0 : stored.length, 4),
      word(descriptor ? 0 : size, 4),
      word(name.length, 2),
      word(0, 2),
      name,
      stored,
      descriptor
        ? Buffer.concat([word(0x08074b50, 4), word(crc, 4), word(stored.length, 4), word(size, 4)])
        : Buffer.alloc(0),
    ]);
    centrals.push(
      Buffer.concat([
        word(0x02014b50, 4),
        word(20, 2),
        word(20, 2),
        word(flags, 2),
        word(method, 2),
        word(0, 2),
        word(0x21, 2),
        word(crc, 4),
        word(stored.length, 4),
        word(size, 4),
        word(name.length, 2),
        word(0, 2),
        word(0, 2),
        word(0, 2),
        word(0, 2),
        word(0, 4),
        word(offset, 4),
        name,
      ]),
    );
    locals.push(local);
    offset += local.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.concat([
    word(0x06054b50, 4),
    word(0, 2),
    word(0, 2),
    word(entries.length, 2),
    word(entries.length, 2),
    word(directory.length, 4),
    word(offset, 4),
    word(0, 2),
  ]);
  return Buffer.concat([...locals, directory, end]);
}

describe("streamZipEntry", () => {
  const BIG: ZipLimits = { maxEntries: 10, maxEntryBytes: 4_194_304, maxTotalBytes: 4_194_304 };
  const MIB = 1_048_576;

  /** `count` lines of text that deflates well, each different: about 34 bytes a line. */
  const linesOf = (count: number): Buffer =>
    Buffer.from(
      `${Array.from({ length: count }, (_, n) => `line ${n}: 0123456789abcdef`).join("\n")}\n`,
    );

  async function collect(
    zip: Buffer,
    options?: ZipStreamOptions,
    limits: ZipLimits = BIG,
    accept: (name: string) => boolean = all,
  ) {
    const chunks: Buffer[] = [];
    const result = await streamZipEntry(
      zip,
      accept,
      limits,
      (chunk) => {
        // A chunk is the callback's during the call only: what is kept is copied.
        chunks.push(Buffer.from(chunk));
      },
      options,
    );
    return { chunks, data: Buffer.concat(chunks), result };
  }

  async function streamCode(
    zip: Buffer,
    options?: ZipStreamOptions,
    limits: ZipLimits = BIG,
    accept: (name: string) => boolean = all,
  ): Promise<string> {
    try {
      await streamZipEntry(zip, accept, limits, () => undefined, options);
    } catch (error) {
      if (error instanceof ZipError) return error.code;
      throw error;
    }
    throw new Error("Expected a ZipError");
  }

  const sizesOf = (chunks: readonly Buffer[]) => chunks.map((chunk) => chunk.length);
  const sum = (numbers: readonly number[]) => numbers.reduce((total, number) => total + number, 0);
  /** The sizes of the pieces that `total` bytes are cut into: whole pieces, then what is left. */
  const piecesOf = (total: number, piece: number): number[] => [
    ...Array<number>(Math.floor(total / piece)).fill(piece),
    ...(total % piece === 0 ? [] : [total % piece]),
  ];

  describe("an entry that can be read", () => {
    it("hands the data of a deflated entry out in pieces, and then gives its name and size", async () => {
      const data = linesOf(12_000);

      const { chunks, data: got, result } = await collect(writeZip([{ name: "FLAT.txt", data }]));

      expect(got.equals(data)).toBe(true);
      expect(chunks.length).toBeGreaterThan(1);
      expect(result).toEqual({ name: "FLAT.txt", bytes: data.length });
    });

    it("reads a stored entry the same way, in pieces of the size asked for", async () => {
      const data = linesOf(500);
      const zip = writeZip([{ name: "a.txt", data, method: 0 }]);

      const { chunks, data: got, result } = await collect(zip, { pieceBytes: 1_000 });

      expect(got.equals(data)).toBe(true);
      expect(sizesOf(chunks)).toEqual(piecesOf(data.length, 1_000));
      expect(result).toEqual({ name: "a.txt", bytes: data.length });
      // The default piece is 64 KiB.
      const big = linesOf(12_000);
      const bigZip = writeZip([{ name: "b.txt", data: big, method: 0 }]);
      expect(sizesOf((await collect(bigZip)).chunks)).toEqual(piecesOf(big.length, 65_536));
      expect(big.length).toBeGreaterThan(3 * 65_536);
    });

    it("hands a Buffer to the callback, in the order of the data", async () => {
      const kinds: boolean[] = [];

      await streamZipEntry(
        writeZip([{ name: "a.txt", data: linesOf(12_000) }]),
        all,
        BIG,
        (chunk) => {
          kinds.push(Buffer.isBuffer(chunk) && chunk.length > 0);
        },
      );

      expect(kinds.length).toBeGreaterThan(1);
      expect(kinds.every(Boolean)).toBe(true);
    });

    it.each([
      ["deflated", 8],
      ["stored", 0],
    ])("an empty %s entry gives no chunk and no bytes", async (_label, method) => {
      const { chunks, result } = await collect(writeZip([{ name: "empty.txt", data: "", method }]));

      expect(chunks.length).toBe(0);
      expect(result).toEqual({ name: "empty.txt", bytes: 0 });
    });

    it("no chunk is longer than 64 KiB, however large the entry", async () => {
      const data = linesOf(60_000);

      const deflated = await collect(writeZip([{ name: "a.txt", data }]));
      const stored = await collect(writeZip([{ name: "a.txt", data, method: 0 }]));

      for (const { chunks, data: got } of [deflated, stored]) {
        expect(got.equals(data)).toBe(true);
        expect(Math.max(...sizesOf(chunks))).toBeLessThanOrEqual(65_536);
        expect(chunks.length).toBeGreaterThanOrEqual(Math.floor(data.length / 65_536));
      }
    });

    it("reads an entry whose sizes are in a data descriptor (general purpose bit 3)", async () => {
      const data = linesOf(2_000);
      const zip = rawZip([{ name: "FLAT_INV.txt", data, descriptor: true }]);

      // The local header holds no CRC and no sizes: only the central directory has them.
      expect(zip.readUInt16LE(6) & 0x0008).toBe(0x0008);
      expect([zip.readUInt32LE(14), zip.readUInt32LE(18), zip.readUInt32LE(22)]).toEqual([0, 0, 0]);
      const { data: got, result } = await collect(zip);

      expect(got.equals(data)).toBe(true);
      expect(result).toEqual({ name: "FLAT_INV.txt", bytes: data.length });
      expect(readZip(zip, all, BIG)[0].data.equals(data)).toBe(true);
    });

    it("reads a Zip64 directory", async () => {
      const data = linesOf(2_000);
      const zip = writeZip([{ name: "a.txt", data }], { zip64: true, comment: "end of day" });

      const { data: got, result } = await collect(zip);

      expect(got.equals(data)).toBe(true);
      expect(result.bytes).toBe(data.length);
    });

    it("leaves a folder entry out: a folder and one file are one file", async () => {
      const data = linesOf(100);
      const zip = writeZip([
        { name: "flat/", data: "", method: 0 },
        { name: "flat/a.txt", data },
      ]);

      const { data: got, result } = await collect(zip);

      expect(got.equals(data)).toBe(true);
      expect(result.name).toBe("flat/a.txt");
    });

    it("gives the bytes the buffer reader gives, and a trailing run after the deflate stream is as harmless", async () => {
      const data = linesOf(2_000);
      const zip = writeZip([{ name: "a.txt", data, trailing: Buffer.alloc(100, 0xff) }]);
      const [entry] = readZip(zip, all, BIG);

      // Tiny pieces: the trailing bytes reach the inflater as writes of their own, after its end.
      const { data: got } = await collect(zip, { pieceBytes: 7 });

      expect(got.equals(entry.data)).toBe(true);
      expect(got.equals(data)).toBe(true);
    });

    it("two reads at once keep nothing of each other", async () => {
      const first = linesOf(9_000);
      const second = Buffer.from(linesOf(9_000).toString("utf8").replace(/line/g, "item"));

      const [a, b] = await Promise.all([
        collect(writeZip([{ name: "a.txt", data: first }])),
        collect(writeZip([{ name: "b.txt", data: second }])),
      ]);

      expect(a.data.equals(first)).toBe(true);
      expect(b.data.equals(second)).toBe(true);
      expect([a.result.name, b.result.name]).toEqual(["a.txt", "b.txt"]);
    });
  });

  describe("an entry that is refused for what the zip is", () => {
    const one = (name = "a.txt", data = "a") => writeZip([{ name, data }]);

    it("a zip of no file, of a folder only, or of two files is unsupported", async () => {
      expect(await streamCode(writeZip([]))).toBe("unsupported");
      expect(await streamCode(writeZip([{ name: "flat/", data: "", method: 0 }]))).toBe(
        "unsupported",
      );
      expect(
        await streamCode(
          writeZip([
            { name: "a.txt", data: "a" },
            { name: "b.txt", data: "b" },
          ]),
        ),
      ).toBe("unsupported");
    });

    it("the caller is asked about the one file only, and refuses it as unsupported", async () => {
      const asked: string[] = [];
      const refuse = (name: string) => {
        asked.push(name);
        return false;
      };

      expect(await streamCode(one("FLAT.txt"), undefined, BIG, refuse)).toBe("unsupported");
      expect(asked).toEqual(["FLAT.txt"]);
      asked.length = 0;
      await streamCode(
        writeZip([
          { name: "a.txt", data: "a" },
          { name: "b.txt", data: "b" },
        ]),
        undefined,
        BIG,
        refuse,
      );
      expect(asked).toEqual([]);
    });

    it("a zip inside the zip is unsupported, whatever its size", async () => {
      const inner = writeZip([{ name: "a.txt", data: "a" }]);

      expect(await streamCode(writeZip([{ name: "inner.zip", data: inner }]))).toBe("unsupported");
      expect(await streamCode(writeZip([{ name: "INNER.ZIP", data: inner }]))).toBe("unsupported");
      // The name is looked at before the size: a nested zip over the limit is not too_large.
      expect(
        await streamCode(writeZip([{ name: "inner.zip", data: inner, claimedSize: 10 * MIB }])),
      ).toBe("unsupported");
    });

    it("deflatedOnly refuses a stored entry, and asks nothing of a deflated one", async () => {
      const stored = writeZip([{ name: "a.txt", data: "stored", method: 0 }]);
      const deflated = writeZip([{ name: "a.txt", data: "deflated" }]);

      expect(await streamCode(stored, { deflatedOnly: true })).toBe("unsupported");
      expect((await collect(stored)).data.toString("utf8")).toBe("stored");
      expect((await collect(deflated, { deflatedOnly: true })).data.toString("utf8")).toBe(
        "deflated",
      );
    });

    it("an encrypted entry and a method nobody knows are unsupported", async () => {
      expect(await streamCode(writeZip([{ name: "a.txt", data: "{}", flags: 0x0001 }]))).toBe(
        "unsupported",
      );
      expect(await streamCode(writeZip([{ name: "a.txt", data: "{}", method: 12 }]))).toBe(
        "unsupported",
      );
    });

    it("a zip that has more entries than the limit is too_large, a cut one corrupt, a body that is no zip not_zip", async () => {
      const eleven = Array.from({ length: 11 }, (_, n) => ({ name: `${n}.txt`, data: "z" }));

      expect(await streamCode(writeZip(eleven), undefined, LIMITS)).toBe("too_large");
      expect(await streamCode(DELTA.subarray(0, DELTA.length - 10))).toBe("corrupt");
      expect(await streamCode(Buffer.from("<html>Not found</html>"))).toBe("not_zip");
      expect(await streamCode(Buffer.alloc(0))).toBe("not_zip");
    });
  });

  describe("an entry that is refused for its size, before a byte of it is inflated", () => {
    async function refusedUnread(zip: Buffer, limits: ZipLimits): Promise<string> {
      let calls = 0;
      try {
        await streamZipEntry(zip, all, limits, () => {
          calls += 1;
        });
      } catch (error) {
        expect(calls).toBe(0);
        if (error instanceof ZipError) return error.code;
        throw error;
      }
      throw new Error("Expected a ZipError");
    }

    it("a size above the limit of an entry is too_large, however it is said", async () => {
      const big = "x".repeat(5_000);

      expect(await refusedUnread(writeZip([{ name: "a.txt", data: big }]), LIMITS)).toBe(
        "too_large",
      );
      expect(
        await refusedUnread(writeZip([{ name: "a.txt", data: "a", claimedSize: 5_000 }]), LIMITS),
      ).toBe("too_large");
    });

    it("a size above what is left of the total is too_large, and so is more compressed data than the limit could inflate from", async () => {
      const small: ZipLimits = { maxEntries: 10, maxEntryBytes: 10_000, maxTotalBytes: 1_000 };

      expect(
        await refusedUnread(writeZip([{ name: "a.txt", data: "y".repeat(2_000) }]), small),
      ).toBe("too_large");
      const padded = writeZip([{ name: "a.txt", data: record(1), trailing: Buffer.alloc(10_000) }]);
      expect(await refusedUnread(padded, LIMITS)).toBe("too_large");
    });
  });

  describe("an entry whose bytes are not what the directory says", () => {
    it("a size smaller than the data is corrupt, and no more than the size is handed out", async () => {
      const data = linesOf(12_000);
      const delivered: number[] = [];

      await expect(
        streamZipEntry(
          writeZip([{ name: "a.txt", data, claimedSize: 100_000 }]),
          all,
          BIG,
          (chunk) => delivered.push(chunk.length),
        ),
      ).rejects.toMatchObject({ code: "corrupt" });

      expect(sum(delivered)).toBeGreaterThan(0);
      expect(sum(delivered)).toBeLessThanOrEqual(100_000);
      expect(data.length).toBeGreaterThan(300_000);
    });

    it("a size of nothing for an entry that holds data lets no byte out", async () => {
      const delivered: number[] = [];

      await expect(
        streamZipEntry(
          writeZip([{ name: "a.txt", data: linesOf(2_000), claimedSize: 0 }]),
          all,
          BIG,
          (chunk) => delivered.push(chunk.length),
        ),
      ).rejects.toMatchObject({ code: "corrupt" });

      expect(delivered).toEqual([]);
    });

    it("a size larger than the data is corrupt, once the data has ended", async () => {
      const data = linesOf(2_000);

      expect(
        await streamCode(writeZip([{ name: "a.txt", data, claimedSize: data.length + 1 }])),
      ).toBe("corrupt");
      expect(
        await streamCode(
          writeZip([{ name: "a.txt", data, method: 0, claimedSize: data.length + 1 }]),
        ),
      ).toBe("corrupt");
    });

    it("a CRC-32 that is not the data's is corrupt", async () => {
      const data = linesOf(2_000);

      expect(await streamCode(writeZip([{ name: "a.txt", data, claimedCrc: 1 }]))).toBe("corrupt");
      expect(await streamCode(writeZip([{ name: "a.txt", data, method: 0, claimedCrc: 1 }]))).toBe(
        "corrupt",
      );
      const flipped = Buffer.from(writeZip([{ name: "a.txt", data: record(1), method: 0 }]));
      flipped[30 + "a.txt".length] ^= 0xff;
      expect(await streamCode(flipped)).toBe("corrupt");
    });

    const data = linesOf(2_000);
    const deflated = zlib.deflateRawSync(data);

    it.each([
      ["a deflate stream cut near its end", deflated.subarray(0, deflated.length - 5)],
      ["a deflate stream cut in half", deflated.subarray(0, deflated.length >> 1)],
      ["no compressed bytes at all", Buffer.alloc(0)],
      ["bytes that are no deflate stream", Buffer.alloc(64, 0xff)],
    ])("%s is corrupt, as the buffer reader finds it", async (_label, stored) => {
      const zip = rawZip([{ name: "a.txt", data, stored }]);

      expect(await streamCode(zip)).toBe("corrupt");
      expect(codeOf(() => readZip(zip, all, BIG))).toBe("corrupt");
    });
  });

  describe("an error of the caller's callback", () => {
    const zip = writeZip([{ name: "a.txt", data: linesOf(12_000) }]);

    it.each([
      ["an Error", new Error("stop")],
      [
        "an Error that has the code of a zlib error",
        Object.assign(new Error("z"), { code: "Z_DATA_ERROR" }),
      ],
      ["a ZipError", new ZipError("too_large")],
      ["a string", "stop"],
      ["undefined", undefined],
      ["null", null],
    ])("%s comes back as it was thrown, and no chunk follows it", async (_label, thrown) => {
      let calls = 0;

      const rejection = await streamZipEntry(zip, all, BIG, () => {
        calls += 1;
        if (calls === 2) throw thrown;
      }).then(
        () => {
          throw new Error("The read did not fail");
        },
        (error: unknown) => error,
      );

      expect(rejection).toBe(thrown);
      expect(calls).toBe(2);
      // The streams are torn down: nothing arrives later.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(calls).toBe(2);
    });
  });

  describe("pieceBytes", () => {
    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      "%s is a RangeError, before the zip is looked at",
      async (pieceBytes) => {
        await expect(streamCode(Buffer.from("not a zip"), { pieceBytes })).rejects.toBeInstanceOf(
          RangeError,
        );
      },
    );
  });

  describe("a large entry", () => {
    /**
     * A function that makes V8 collect garbage, which Jest has no flag for: the one the engine gives
     * a new context once it is told to. A collection is what tells a held entry from a streamed one,
     * since a Buffer is not on the heap that `heapUsed` counts, and garbage that is not yet collected
     * is not what the test is after.
     */
    function collector(): () => void {
      v8.setFlagsFromString("--expose_gc");
      const gc: unknown = vm.runInNewContext("gc");
      if (typeof gc !== "function") throw new Error("V8 gave no way to collect garbage.");
      return gc as () => void;
    }

    it("streams 48 MB of text with a memory that does not grow with it, in under a minute", async () => {
      const gc = collector();
      const block = linesOf(37_000);
      let data: Buffer | null = Buffer.concat(Array<Buffer>(48).fill(block));
      const size = data.length;
      const zip = writeZip([{ name: "FLAT.txt", data }]);
      const expectedCrc = zlib.crc32(data);
      data = null;
      const limits: ZipLimits = {
        maxEntries: 10,
        maxEntryBytes: 64 * MIB,
        maxTotalBytes: 64 * MIB,
      };
      const liveBytes = () => {
        const { heapUsed, external } = process.memoryUsage();
        return heapUsed + external;
      };
      // The backing store of a Buffer is freed after the collection that finds it dead, on the
      // engine's own time: the baseline is taken once the source of the zip is really gone.
      for (let round = 0; round < 5; round += 1) {
        gc();
        await new Promise((resolve) => setImmediate(resolve));
      }
      const startHeap = process.memoryUsage().heapUsed;
      const startLive = liveBytes();
      let heapGrowth = 0;
      let liveGrowth = 0;
      let longest = 0;
      let chunks = 0;
      let crc = 0;
      const began = Date.now();

      const result = await streamZipEntry(zip, all, limits, (chunk) => {
        chunks += 1;
        heapGrowth = Math.max(heapGrowth, process.memoryUsage().heapUsed - startHeap);
        if (chunks % 64 === 0) {
          gc();
          liveGrowth = Math.max(liveGrowth, liveBytes() - startLive);
        }
        longest = Math.max(longest, chunk.length);
        crc = zlib.crc32(chunk, crc);
      });

      expect(size).toBeGreaterThan(48_000_000);
      expect(result).toEqual({ name: "FLAT.txt", bytes: size });
      expect(crc).toBe(expectedCrc);
      expect(longest).toBeLessThanOrEqual(65_536);
      expect(chunks).toBeGreaterThanOrEqual(Math.floor(size / 65_536));
      expect(Date.now() - began).toBeLessThan(60_000);
      // The heap, as the engine counts it without a collection, stays far below the entry...
      expect(heapGrowth).toBeLessThan(60 * MIB);
      // ...and what is alive after a collection, Buffers included, is not half of it: an entry that
      // is held (as `forEachZipEntry` holds it) is all of it.
      expect(liveGrowth).toBeLessThan(24 * MIB);
    }, 120_000);
  });
});
