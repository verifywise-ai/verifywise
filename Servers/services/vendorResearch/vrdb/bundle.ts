/**
 * The bundled copies of the lists the vendor risk database mirrors. The server downloads none of
 * them: each release ships one file per list under `Servers/data/vrdb/`, built before the release
 * by `scripts/vrdbBundle.ts`, and the worker loads them into the copy at start (loadBundled.ts).
 * A list is therefore as current as the release that carries it, and its records say so: they are
 * dated by the day their bundle was built, not by the day they were loaded.
 *
 * A bundle is gzipped JSON holding the records as the list's connector parsed them. `manifest.json`
 * beside the bundles lists each one with its day, its record count and its hash, so that a release
 * diff shows which lists changed.
 */
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { gunzipSync, gzipSync } from "zlib";
import {
  VRDB_SOURCE_IDS,
  type VrdbSourceId,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import type { ParsedRecord } from "./types";

/** The format of a bundle file; a loader refuses any other. */
export const BUNDLE_FORMAT = 1;

export interface VrdbBundle {
  format: typeof BUNDLE_FORMAT;
  sourceId: VrdbSourceId;
  /** The version of the connector that parsed the list (connectors/*.ts `version`). */
  connectorVersion: number;
  /** When the list was downloaded, ISO 8601: the day its records are "as of". */
  builtAt: string;
  /** The list's own version, when it states one. */
  sourceVersion: string | null;
  /** For the CVE records, read by their changes: the last day the bundle holds in full. */
  cursor: { day: string } | null;
  records: ParsedRecord[];
}

export interface ManifestEntry {
  sourceId: VrdbSourceId;
  file: string;
  builtAt: string;
  records: number;
  connectorVersion: number;
  sourceVersion: string | null;
  sha256: string;
}

export interface VrdbManifest {
  format: typeof BUNDLE_FORMAT;
  lists: ManifestEntry[];
}

export const MANIFEST_FILE = "manifest.json";

export const bundleFileOf = (id: VrdbSourceId): string => `${id}.json.gz`;

/**
 * The directory that holds the bundles. The same module runs from the sources (`ts-node`, three
 * levels below `Servers/`) and from the build (`dist/`, one level deeper), and the image copies
 * `Servers/` whole, so the first of the two that exists is the one. `VRDB_BUNDLE_DIR` overrides it.
 */
export function bundleDir(): string {
  const override = process.env.VRDB_BUNDLE_DIR?.trim();
  if (override) return path.resolve(override);
  const candidates = [
    path.resolve(__dirname, "../../../data/vrdb"),
    path.resolve(__dirname, "../../../../data/vrdb"),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, MANIFEST_FILE))) ?? candidates[0];
}

/** The SHA-256 of a bundle file's bytes, hex: what the copy keeps to know it loaded this file. */
export const hashOfBytes = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

export class BundleError extends Error {
  constructor(
    readonly code: "missing" | "unreadable" | "wrong_format" | "wrong_list",
    sourceId: VrdbSourceId,
  ) {
    super(`The bundle of ${sourceId} is ${code.replace("_", " ")}`);
    this.name = "BundleError";
  }
}

const isRecordArray = (value: unknown): value is ParsedRecord[] =>
  Array.isArray(value) &&
  value.every(
    (record) =>
      typeof record === "object" &&
      record !== null &&
      typeof (record as ParsedRecord).sourceRecordId === "string" &&
      Array.isArray((record as ParsedRecord).matchKeys),
  );

/** Reads and checks one list's bundle, with the hash of its bytes. */
export function readBundle(
  id: VrdbSourceId,
  dir: string = bundleDir(),
): { bundle: VrdbBundle; sha256: string } {
  const file = path.join(dir, bundleFileOf(id));
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    throw new BundleError("missing", id);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(gunzipSync(bytes).toString("utf8"));
  } catch {
    throw new BundleError("unreadable", id);
  }
  const bundle = parsed as Partial<VrdbBundle> | null;
  if (
    bundle === null ||
    typeof bundle !== "object" ||
    bundle.format !== BUNDLE_FORMAT ||
    typeof bundle.connectorVersion !== "number" ||
    typeof bundle.builtAt !== "string" ||
    Number.isNaN(Date.parse(bundle.builtAt)) ||
    !isRecordArray(bundle.records)
  ) {
    throw new BundleError("wrong_format", id);
  }
  if (bundle.sourceId !== id) throw new BundleError("wrong_list", id);
  return {
    bundle: {
      format: BUNDLE_FORMAT,
      sourceId: id,
      connectorVersion: bundle.connectorVersion,
      builtAt: bundle.builtAt,
      sourceVersion: bundle.sourceVersion ?? null,
      cursor: bundle.cursor ?? null,
      records: bundle.records,
    },
    sha256: hashOfBytes(bytes),
  };
}

/**
 * Writes one list's bundle and returns its manifest entry. The records are sorted by id and the
 * gzip header carries no time, so that a diff of two releases is a diff of their records. A rebuild
 * writes a new `builtAt`, and so new bytes: a deployment loads it again, which moves the list's "As
 * of" day to the day it was checked; the records that did not change are not written again.
 */
export function writeBundle(bundle: VrdbBundle, dir: string = bundleDir()): ManifestEntry {
  const records = [...bundle.records].sort((a, b) =>
    a.sourceRecordId < b.sourceRecordId ? -1 : a.sourceRecordId > b.sourceRecordId ? 1 : 0,
  );
  const json = JSON.stringify({ ...bundle, records });
  const bytes = gzipSync(Buffer.from(json, "utf8"), { level: 9 });
  fs.mkdirSync(dir, { recursive: true });
  const file = bundleFileOf(bundle.sourceId);
  fs.writeFileSync(path.join(dir, file), bytes);
  return {
    sourceId: bundle.sourceId,
    file,
    builtAt: bundle.builtAt,
    records: records.length,
    connectorVersion: bundle.connectorVersion,
    sourceVersion: bundle.sourceVersion,
    sha256: hashOfBytes(bytes),
  };
}

export function readManifest(dir: string = bundleDir()): VrdbManifest {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(dir, MANIFEST_FILE), "utf8"),
    ) as VrdbManifest;
    if (parsed.format === BUNDLE_FORMAT && Array.isArray(parsed.lists)) return parsed;
  } catch {
    // No manifest yet: an empty one.
  }
  return { format: BUNDLE_FORMAT, lists: [] };
}

export function writeManifest(manifest: VrdbManifest, dir: string = bundleDir()): void {
  const lists = [...manifest.lists].sort(
    (a, b) => VRDB_SOURCE_IDS.indexOf(a.sourceId) - VRDB_SOURCE_IDS.indexOf(b.sourceId),
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, MANIFEST_FILE),
    `${JSON.stringify({ format: BUNDLE_FORMAT, lists }, null, 2)}\n`,
  );
}
