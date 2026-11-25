/**
 * The bundles of the vendor risk database (bundle.ts): one gzipped JSON file per list and a
 * manifest beside them. The same list gives the same bytes, so an unchanged list shows no diff in a
 * release, and a loader refuses a file that is missing, unreadable, of another format or of another
 * list. Every test writes in a directory of its own under the system's temporary directory.
 */
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { gzipSync } from "zlib";
import {
  BUNDLE_FORMAT,
  BundleError,
  MANIFEST_FILE,
  type ManifestEntry,
  type VrdbBundle,
  bundleDir,
  bundleFileOf,
  hashOfBytes,
  readBundle,
  readManifest,
  shippedBundleIds,
  writeBundle,
  writeManifest,
} from "../bundle";
import type { ParsedRecord } from "../types";

const record = (id: string, over: Partial<ParsedRecord> = {}): ParsedRecord => ({
  sourceRecordId: id,
  recordType: "vulnerability",
  title: `Record ${id}`,
  summary: `The summary of ${id}.`,
  url: `https://example.com/${id}`,
  identifiers: { id },
  matchKeys: [`name:vendor${id}`],
  publishedAt: "2026-10-01",
  sourceUpdatedAt: null,
  ...over,
});

const bundleOf = (records: ParsedRecord[], over: Partial<VrdbBundle> = {}): VrdbBundle => ({
  format: BUNDLE_FORMAT,
  sourceId: "kev",
  connectorVersion: 2,
  builtAt: "2026-11-20T08:00:00.000Z",
  sourceVersion: "2026.11.19",
  cursor: null,
  records,
  ...over,
});

const entryOf = (sourceId: ManifestEntry["sourceId"]): ManifestEntry => ({
  sourceId,
  file: bundleFileOf(sourceId),
  builtAt: "2026-11-20T08:00:00.000Z",
  records: 1,
  connectorVersion: 1,
  sourceVersion: null,
  sha256: "0".repeat(64),
});

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vrdb-bundle-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Writes a gzipped JSON value as the bundle file of a list. */
const writeRaw = (id: string, value: unknown) =>
  fs.writeFileSync(
    path.join(dir, `${id}.json.gz`),
    gzipSync(Buffer.from(JSON.stringify(value), "utf8")),
  );

describe("writeBundle and readBundle", () => {
  it("round-trips a bundle, and names the file after its list", () => {
    const bundle = bundleOf([record("CVE-2026-0002"), record("CVE-2026-0001")], {
      cursor: { day: "2026-11-19" },
    });

    const entry = writeBundle(bundle, dir);
    const read = readBundle("kev", dir);

    expect(bundleFileOf("kev")).toBe("kev.json.gz");
    expect(fs.existsSync(path.join(dir, "kev.json.gz"))).toBe(true);
    expect(read.bundle).toEqual({
      ...bundle,
      records: [record("CVE-2026-0001"), record("CVE-2026-0002")],
    });
    expect(read.sha256).toBe(entry.sha256);
    expect(entry).toEqual({
      sourceId: "kev",
      file: "kev.json.gz",
      builtAt: "2026-11-20T08:00:00.000Z",
      records: 2,
      connectorVersion: 2,
      sourceVersion: "2026.11.19",
      sha256: entry.sha256,
    });
  });

  it("gives the hash of the file's bytes, hex", () => {
    const entry = writeBundle(bundleOf([record("a")]), dir);
    const bytes = fs.readFileSync(path.join(dir, "kev.json.gz"));

    expect(entry.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(hashOfBytes(bytes)).toBe(entry.sha256);
    expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("writes the same bytes for the same list, whatever the order of its records", () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "vrdb-bundle-"));
    try {
      const first = writeBundle(bundleOf([record("b"), record("a"), record("c")]), dir);
      const second = writeBundle(bundleOf([record("c"), record("b"), record("a")]), other);

      expect(second.sha256).toBe(first.sha256);
      expect(fs.readFileSync(path.join(other, "kev.json.gz"))).toEqual(
        fs.readFileSync(path.join(dir, "kev.json.gz")),
      );
      // The gzip header carries no time: bytes 4 to 7 are its modification time.
      expect([...fs.readFileSync(path.join(dir, "kev.json.gz")).subarray(4, 8)]).toEqual([
        0, 0, 0, 0,
      ]);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it("stores the records sorted by their id", () => {
    writeBundle(bundleOf([record("b"), record("a"), record("c")]), dir);

    expect(readBundle("kev", dir).bundle.records.map((r) => r.sourceRecordId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("gives a different hash when a record changes", () => {
    const before = writeBundle(bundleOf([record("a")]), dir);
    const after = writeBundle(bundleOf([record("a", { title: "Another title" })]), dir);

    expect(after.sha256).not.toBe(before.sha256);
  });

  it("does not change the records it was given", () => {
    const records = [record("b"), record("a")];

    writeBundle(bundleOf(records), dir);

    expect(records.map((r) => r.sourceRecordId)).toEqual(["b", "a"]);
  });

  it("creates the directory when it does not exist", () => {
    const nested = path.join(dir, "deeper", "vrdb");

    writeBundle(bundleOf([record("a")]), nested);

    expect(readBundle("kev", nested).bundle.records).toHaveLength(1);
  });

  it("reads an absent source version and cursor as null", () => {
    writeRaw("kev", {
      format: BUNDLE_FORMAT,
      sourceId: "kev",
      connectorVersion: 1,
      builtAt: "2026-11-20T08:00:00.000Z",
      records: [record("a")],
    });

    const { bundle } = readBundle("kev", dir);

    expect(bundle.sourceVersion).toBeNull();
    expect(bundle.cursor).toBeNull();
  });
});

describe("readBundle refusals", () => {
  const codeOf = (run: () => unknown): string => {
    try {
      run();
    } catch (error) {
      expect(error).toBeInstanceOf(BundleError);
      return (error as BundleError).code;
    }
    throw new Error("Expected a BundleError");
  };

  it("refuses a list that has no bundle as missing", () => {
    expect(codeOf(() => readBundle("ofac", dir))).toBe("missing");
  });

  it("names the list and the refusal in its message, and is a BundleError", () => {
    let caught: unknown;
    try {
      readBundle("ofac", dir);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleError);
    expect((caught as BundleError).name).toBe("BundleError");
    expect((caught as BundleError).message).toBe("The bundle of ofac is missing");
    expect(new BundleError("wrong_format", "kev").message).toBe(
      "The bundle of kev is wrong format",
    );
  });

  it("refuses a file that is not gzip, and gzip that is not JSON, as unreadable", () => {
    fs.writeFileSync(path.join(dir, "kev.json.gz"), "not gzip at all");
    expect(codeOf(() => readBundle("kev", dir))).toBe("unreadable");

    fs.writeFileSync(path.join(dir, "kev.json.gz"), gzipSync(Buffer.from("{not json")));
    expect(codeOf(() => readBundle("kev", dir))).toBe("unreadable");
  });

  it.each([
    ["another format", { format: 2 }],
    ["no connector version", { connectorVersion: "2" }],
    ["a build time that is not a date", { builtAt: "yesterday" }],
    ["records that are not a list", { records: { a: 1 } }],
    ["a record without an id", { records: [{ matchKeys: [] }] }],
    ["a record without keys", { records: [{ sourceRecordId: "a" }] }],
    ["a record that is null", { records: [null] }],
  ])("refuses a bundle with %s as wrong_format", (_label, over) => {
    writeRaw("kev", { ...bundleOf([record("a")]), ...over });

    expect(codeOf(() => readBundle("kev", dir))).toBe("wrong_format");
  });

  it("refuses JSON that is null or not an object as wrong_format", () => {
    writeRaw("kev", null);
    expect(codeOf(() => readBundle("kev", dir))).toBe("wrong_format");

    writeRaw("kev", [1, 2]);
    expect(codeOf(() => readBundle("kev", dir))).toBe("wrong_format");
  });

  it("refuses the bundle of another list under this list's name as wrong_list", () => {
    writeBundle(bundleOf([record("a")], { sourceId: "kev" }), dir);
    fs.renameSync(path.join(dir, "kev.json.gz"), path.join(dir, "ofac.json.gz"));

    expect(codeOf(() => readBundle("ofac", dir))).toBe("wrong_list");
  });
});

describe("readManifest and writeManifest", () => {
  it("reads an empty manifest where there is none, or one that cannot be read", () => {
    expect(readManifest(dir)).toEqual({ format: BUNDLE_FORMAT, lists: [] });

    fs.writeFileSync(path.join(dir, MANIFEST_FILE), "{broken");
    expect(readManifest(dir)).toEqual({ format: BUNDLE_FORMAT, lists: [] });

    fs.writeFileSync(path.join(dir, MANIFEST_FILE), JSON.stringify({ format: 9, lists: [] }));
    expect(readManifest(dir)).toEqual({ format: BUNDLE_FORMAT, lists: [] });

    fs.writeFileSync(path.join(dir, MANIFEST_FILE), JSON.stringify({ format: 1, lists: {} }));
    expect(readManifest(dir)).toEqual({ format: BUNDLE_FORMAT, lists: [] });
  });

  it("writes the lists in the order of the VRDB ids, whatever the order given, and reads them back", () => {
    const lists = [entryOf("c2pa_conforming"), entryOf("cve"), entryOf("kev"), entryOf("ofac")];

    writeManifest({ format: BUNDLE_FORMAT, lists }, dir);

    expect(readManifest(dir).lists.map((entry) => entry.sourceId)).toEqual([
      "kev",
      "ofac",
      "cve",
      "c2pa_conforming",
    ]);
    expect(readManifest(dir).lists[0]).toEqual(entryOf("kev"));
  });

  it("writes indented JSON with a final newline, so that a release diff reads line by line", () => {
    writeManifest({ format: BUNDLE_FORMAT, lists: [entryOf("kev")] }, dir);

    const text = fs.readFileSync(path.join(dir, MANIFEST_FILE), "utf8");
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toBe(
      `${JSON.stringify({ format: BUNDLE_FORMAT, lists: [entryOf("kev")] }, null, 2)}\n`,
    );
  });

  it("writes the same manifest for the same lists", () => {
    writeManifest({ format: BUNDLE_FORMAT, lists: [entryOf("ofac"), entryOf("kev")] }, dir);
    const first = fs.readFileSync(path.join(dir, MANIFEST_FILE), "utf8");
    writeManifest({ format: BUNDLE_FORMAT, lists: [entryOf("kev"), entryOf("ofac")] }, dir);

    expect(fs.readFileSync(path.join(dir, MANIFEST_FILE), "utf8")).toBe(first);
  });
});

describe("bundleDir", () => {
  const before = process.env.VRDB_BUNDLE_DIR;

  afterEach(() => {
    if (before === undefined) delete process.env.VRDB_BUNDLE_DIR;
    else process.env.VRDB_BUNDLE_DIR = before;
  });

  it("is VRDB_BUNDLE_DIR when it is set, resolved and trimmed", () => {
    process.env.VRDB_BUNDLE_DIR = `  ${dir}  `;
    expect(bundleDir()).toBe(path.resolve(dir));

    process.env.VRDB_BUNDLE_DIR = "relative/vrdb";
    expect(bundleDir()).toBe(path.resolve("relative/vrdb"));
  });

  it("is Servers/data/vrdb from the sources when VRDB_BUNDLE_DIR is unset or blank", () => {
    const servers = path.resolve(__dirname, "../../../..");

    delete process.env.VRDB_BUNDLE_DIR;
    expect(bundleDir()).toBe(path.join(servers, "data", "vrdb"));

    process.env.VRDB_BUNDLE_DIR = "   ";
    expect(bundleDir()).toBe(path.join(servers, "data", "vrdb"));
  });

  it("is where readBundle and writeBundle look by default", () => {
    process.env.VRDB_BUNDLE_DIR = dir;

    writeBundle(bundleOf([record("a")]));
    writeManifest({ format: BUNDLE_FORMAT, lists: [entryOf("kev")] });

    expect(fs.existsSync(path.join(dir, "kev.json.gz"))).toBe(true);
    expect(readBundle("kev").bundle.records).toHaveLength(1);
    expect(readManifest().lists).toHaveLength(1);
  });
});

describe("shippedBundleIds", () => {
  const freshDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "vrdb-shipped-"));

  it("names the lists of the manifest", () => {
    const at = freshDir();
    fs.writeFileSync(
      path.join(at, MANIFEST_FILE),
      JSON.stringify({ format: BUNDLE_FORMAT, lists: [{ sourceId: "kev" }, { sourceId: "ofac" }] }),
    );
    expect(shippedBundleIds(at)).toEqual(new Set(["kev", "ofac"]));
  });

  it("ignores an id it does not know", () => {
    const at = freshDir();
    fs.writeFileSync(
      path.join(at, MANIFEST_FILE),
      JSON.stringify({ format: BUNDLE_FORMAT, lists: [{ sourceId: "kev" }, { sourceId: "nope" }] }),
    );
    expect(shippedBundleIds(at)).toEqual(new Set(["kev"]));
  });

  it("is null with no manifest, an unreadable one, another format or no list, so every list stays covered", () => {
    expect(shippedBundleIds(freshDir())).toBeNull();
    const broken = freshDir();
    fs.writeFileSync(path.join(broken, MANIFEST_FILE), "{");
    expect(shippedBundleIds(broken)).toBeNull();
    const other = freshDir();
    fs.writeFileSync(path.join(other, MANIFEST_FILE), JSON.stringify({ format: 99, lists: [] }));
    expect(shippedBundleIds(other)).toBeNull();
    const empty = freshDir();
    fs.writeFileSync(
      path.join(empty, MANIFEST_FILE),
      JSON.stringify({ format: BUNDLE_FORMAT, lists: [] }),
    );
    expect(shippedBundleIds(empty)).toBeNull();
  });

  it("does not keep a missing manifest: one written later is read", () => {
    const at = freshDir();
    expect(shippedBundleIds(at)).toBeNull();
    fs.writeFileSync(
      path.join(at, MANIFEST_FILE),
      JSON.stringify({ format: BUNDLE_FORMAT, lists: [{ sourceId: "kev" }] }),
    );
    expect(shippedBundleIds(at)).toEqual(new Set(["kev"]));
  });

  it("keeps a manifest that was read", () => {
    const at = freshDir();
    const file = path.join(at, MANIFEST_FILE);
    fs.writeFileSync(file, JSON.stringify({ format: BUNDLE_FORMAT, lists: [{ sourceId: "kev" }] }));
    expect(shippedBundleIds(at)).toEqual(new Set(["kev"]));
    fs.rmSync(file);
    expect(shippedBundleIds(at)).toEqual(new Set(["kev"]));
  });

  it("the release's own manifest ships no bundle of the EU competition cases, whose connector is broken upstream", () => {
    const shipped = shippedBundleIds(path.resolve(__dirname, "../../../../data/vrdb"));
    expect(shipped).not.toBeNull();
    expect(shipped?.has("kev")).toBe(true);
    expect(shipped?.has("eu_dg_comp")).toBe(false);
  });
});
