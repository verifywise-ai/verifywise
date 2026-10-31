/**
 * The zip reader of the vendor risk database (M2 Task 7): the CVE Program publishes its records as
 * zips of JSON files, and its baseline is a zip inside a zip. A zip is third-party data: it is read
 * within the limits its caller fixes, a broken or hostile one is a ZipError with a code, and no
 * name in it becomes a path. The zips are written by the test (helpers/zipWriter.ts).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { ZipError, type ZipLimits, forEachZipEntry, readZip, readZipFile } from "../zip";
import { writeZip } from "./helpers/zipWriter";

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
