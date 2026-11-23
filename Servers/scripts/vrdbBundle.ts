#!/usr/bin/env ts-node
/**
 * Builds the bundles of the vendor risk database: the copies of the lists it mirrors that a release
 * ships (services/vendorResearch/vrdb/bundle.ts). The server never downloads a list; this script,
 * run from a checkout before a release, is the only thing that does. Commit what it writes under
 * `Servers/data/vrdb/` with the release.
 *
 * Usage, from Servers/:
 *   npm run vrdb:bundle                        every list the gates allow
 *   npm run vrdb:bundle -- --only kev,ofac     some lists
 *   npm run vrdb:bundle -- --cve-baseline <day>_all_CVEs_at_midnight.zip
 *   npm run vrdb:bundle -- --allow-shrink uk_ofsi
 *
 * Each list is downloaded and parsed by its connector and checked as a sync checked it: a document
 * that is not the list, one that parses with errors, an empty one, and one that holds more than a
 * fifth fewer records than the bundle it replaces (`--allow-shrink <ids>` lets that through after a
 * look at why) fail, and the list keeps its previous bundle. The script exits 1 when any list
 * failed, after writing the others.
 *
 * The CVE records are read by their changes. The script rolls the previous bundle forward a day at
 * a time from the day it holds, and drops the records that left the 24-month window. Without a
 * previous bundle, or to start over, give it a baseline file of the CVE Program
 * (`<day>_all_CVEs_at_midnight.zip` from https://github.com/CVEProject/cvelistV5/releases, about
 * 650 MB; it needs about 720 MB of temporary disk).
 */
import * as path from "path";
import { FetchError } from "../services/webResearch/guardedFetch";
import { VRDB_SOURCE_IDS, type VrdbSourceId } from "../domain.layer/interfaces/i.vendorResearch";
import {
  BUNDLE_FORMAT,
  BundleError,
  type ManifestEntry,
  type VrdbBundle,
  bundleDir,
  readBundle,
  readManifest,
  writeBundle,
  writeManifest,
} from "../services/vendorResearch/vrdb/bundle";
import {
  CVE_BASELINE_ZIP_LIMITS,
  cveUnreadableAllowed,
  cveWindowStart,
  isCveEntry,
  readCveRecord,
} from "../services/vendorResearch/vrdb/connectors/cve";
import { CONNECTORS, connectorFetch } from "../services/vendorResearch/vrdb/connectors/index";
import {
  type Connector,
  type ConnectorFetch,
  type IncrementalConnector,
  dayOf,
} from "../services/vendorResearch/vrdb/connectors/types";
import { activeMirrors } from "../services/vendorResearch/vrdb/sources";
import type { ParsedRecord } from "../services/vendorResearch/vrdb/types";
import { readZipFile } from "../services/vendorResearch/vrdb/zip";

/** A list that lost more than this share of its previous bundle's records fails. */
export const SHRINK_LIMIT = 0.2;

const DAY_MS = 24 * 60 * 60 * 1000;
const BASELINE_NAME = /^(\d{4}-\d{2}-\d{2})_all_CVEs_at_midnight\.zip(?:\.zip)?$/;

export interface BundleOptions {
  only: VrdbSourceId[] | null;
  cveBaseline: string | null;
  allowShrink: Set<VrdbSourceId>;
}

export interface BundleDeps {
  dir: string;
  fetch: ConnectorFetch;
  connectors: Partial<Record<VrdbSourceId, Connector | IncrementalConnector>>;
  now: () => Date;
  log: (text: string) => void;
  /** The wait between attempts; tests set 0. */
  retryDelayMs?: number;
}

export type BundleOutcome =
  | { sourceId: VrdbSourceId; outcome: "ok"; entry: ManifestEntry }
  | { sourceId: VrdbSourceId; outcome: "failed"; reason: string };

class Refused extends Error {}

const nameOf = (error: unknown): string => {
  if (error instanceof Refused) return error.message;
  if (error instanceof FetchError) {
    return `FetchError ${error.reason}${error.status === undefined ? "" : ` ${error.status}`}`;
  }
  return error instanceof Error && /^[A-Za-z_$][\w$.]{0,59}$/.test(error.name)
    ? error.name
    : "unknown";
};

export function parseArgs(argv: string[]): BundleOptions {
  const options: BundleOptions = { only: null, cveBaseline: null, allowShrink: new Set() };
  const ids = (value: string | undefined, flag: string): VrdbSourceId[] => {
    const list = (value ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const unknown = list.filter((id) => !(VRDB_SOURCE_IDS as readonly string[]).includes(id));
    if (list.length === 0 || unknown.length > 0) {
      throw new Error(
        `${flag} takes list ids separated by commas (unknown: ${unknown.join(", ")})`,
      );
    }
    return list as VrdbSourceId[];
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--only") options.only = ids(argv[++i], flag);
    else if (flag === "--allow-shrink") options.allowShrink = new Set(ids(argv[++i], flag));
    else if (flag === "--cve-baseline") {
      const file = argv[++i];
      if (!file) throw new Error("--cve-baseline takes the path of a baseline file");
      options.cveBaseline = file;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}

function previousOf(id: VrdbSourceId, dir: string): VrdbBundle | null {
  try {
    return readBundle(id, dir).bundle;
  } catch (error) {
    if (error instanceof BundleError && error.code === "missing") return null;
    throw error;
  }
}

/** The checks a sync made before it applied a list taken whole. */
function checkWhole(
  id: VrdbSourceId,
  records: ParsedRecord[],
  previous: VrdbBundle | null,
  connectorVersion: number,
  allowShrink: boolean,
): void {
  const seen = new Set(records.map((record) => record.sourceRecordId)).size;
  if (seen === 0) throw new Refused("empty");
  const before = previous?.records.length ?? 0;
  // A new version of the connector may read the same list into fewer records by design.
  const sameReader = previous?.connectorVersion === connectorVersion;
  if (before > 0 && sameReader && (before - seen) / before > SHRINK_LIMIT && !allowShrink) {
    throw new Refused(`shrank from ${before} to ${seen} records (--allow-shrink ${id} to accept)`);
  }
}

async function bundleWhole(
  id: VrdbSourceId,
  connector: Connector,
  previous: VrdbBundle | null,
  options: BundleOptions,
  deps: BundleDeps,
): Promise<VrdbBundle> {
  const builtAt = deps.now().toISOString();
  const snapshot = await connector.download(deps.fetch, { etag: null, lastModified: null });
  if (snapshot === "unchanged") throw new Refused("the server answered unchanged to no validators");
  const parsed = connector.parse(snapshot);
  if (parsed.root === null) throw new Refused("wrong_root");
  if (parsed.errors > 0) throw new Refused(`parse_errors (${parsed.errors})`);
  if ((parsed.skipped ?? 0) > 0)
    deps.log(`  ${id}: ${parsed.skipped} entries do not parse and were left out`);
  checkWhole(id, parsed.records, previous, connector.version, options.allowShrink.has(id));
  return {
    format: BUNDLE_FORMAT,
    sourceId: id,
    connectorVersion: connector.version,
    builtAt,
    sourceVersion: parsed.sourceVersion,
    cursor: null,
    records: parsed.records,
  };
}

/** The CVE records of a baseline file, and the day before the file's, from which changes follow. */
async function readCveBaseline(
  file: string,
  now: Date,
  log: (text: string) => void,
): Promise<{ records: Map<string, ParsedRecord>; cursor: { day: string } }> {
  const named = BASELINE_NAME.exec(path.basename(file));
  const fileDay = named === null ? null : dayOf(named[1]);
  if (fileDay === null) {
    throw new Refused("the baseline must be named <day>_all_CVEs_at_midnight.zip");
  }
  const window = { from: cveWindowStart(now) };
  const records = new Map<string, ParsedRecord>();
  let entries = 0;
  let errors = 0;
  await readZipFile(
    file,
    (name) => /\.zip$/i.test(name) || isCveEntry(name),
    CVE_BASELINE_ZIP_LIMITS,
    async ({ data }) => {
      entries += 1;
      let json: unknown;
      try {
        json = JSON.parse(data.toString("utf8"));
      } catch {
        errors += 1;
        return;
      }
      const reading = readCveRecord(json, window);
      if (reading.kind === "error") errors += 1;
      else if (reading.kind === "kept") records.set(reading.record.sourceRecordId, reading.record);
    },
  );
  if (errors > cveUnreadableAllowed(entries)) {
    throw new Refused(`${errors} entries of the baseline do not parse`);
  }
  if (entries === 0) throw new Refused("the baseline holds no CVE record");
  if (errors > 0) log(`  cve: ${errors} baseline entries do not parse and were left out`);
  const dayBefore = new Date(Date.parse(`${fileDay}T00:00:00Z`) - DAY_MS)
    .toISOString()
    .slice(0, 10);
  return { records, cursor: { day: dayBefore } };
}

async function bundleCve(
  connector: IncrementalConnector,
  previous: VrdbBundle | null,
  options: BundleOptions,
  deps: BundleDeps,
): Promise<VrdbBundle> {
  const now = deps.now();
  let records: Map<string, ParsedRecord>;
  let cursor: { day: string };
  if (options.cveBaseline !== null) {
    ({ records, cursor } = await readCveBaseline(options.cveBaseline, now, deps.log));
  } else if (previous?.cursor) {
    records = new Map(previous.records.map((record) => [record.sourceRecordId, record]));
    cursor = previous.cursor;
  } else {
    throw new Refused("no previous bundle to roll forward; give --cve-baseline <file>");
  }

  // Each download hands at most a week of days: ask again until no day is left.
  for (;;) {
    const days = await connector.download(deps.fetch, cursor, now);
    if (days === "unchanged" || days.length === 0) break;
    for (const { day, snapshot } of days) {
      const parsed = connector.parse(snapshot);
      if (parsed.root === null) throw new Refused(`wrong_root on ${day}`);
      if (parsed.errors > 0) throw new Refused(`parse_errors on ${day}`);
      for (const record of parsed.records) records.set(record.sourceRecordId, record);
      for (const id of parsed.retired ?? []) records.delete(id);
      cursor = { day };
    }
  }

  // The window moves with the day: a published record older than it leaves the bundle.
  const from = cveWindowStart(now);
  for (const [id, record] of records) {
    if (record.status !== "rejected" && record.publishedAt !== null && record.publishedAt < from) {
      records.delete(id);
    }
  }
  if (records.size === 0) throw new Refused("empty");
  return {
    format: BUNDLE_FORMAT,
    sourceId: "cve",
    connectorVersion: connector.version,
    builtAt: now.toISOString(),
    sourceVersion: null,
    cursor,
    records: [...records.values()],
  };
}

/** Downloads that fail are tried this many times in all: public hosts drop a request now and then. */
export const ATTEMPTS = 3;
const RETRY_DELAY_MS = 10_000;

/** Runs a download again after a fetch failure; a refusal of what was read is not retried. */
async function withRetries<T>(
  run: () => Promise<T>,
  onRetry: (attempt: number, error: unknown) => void,
  delayMs: number,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof FetchError) || attempt >= ATTEMPTS) throw error;
      onRetry(attempt, error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function bundleLists(
  options: BundleOptions,
  deps: BundleDeps,
): Promise<BundleOutcome[]> {
  const manifest = readManifest(deps.dir);
  const outcomes: BundleOutcome[] = [];
  const lists = activeMirrors().filter(
    (definition) => options.only === null || options.only.includes(definition.id),
  );
  for (const definition of lists) {
    const id = definition.id;
    const connector = deps.connectors[id];
    if (connector === undefined) {
      outcomes.push({ sourceId: id, outcome: "failed", reason: "no connector" });
      continue;
    }
    deps.log(`${id}: downloading`);
    try {
      const previous = previousOf(id, deps.dir);
      const bundle = await withRetries(
        () =>
          connector.kind === "incremental"
            ? bundleCve(connector, previous, options, deps)
            : bundleWhole(id, connector, previous, options, deps),
        (attempt, error) =>
          deps.log(`  ${id}: attempt ${attempt} failed (${nameOf(error)}), trying again`),
        deps.retryDelayMs ?? RETRY_DELAY_MS,
      );
      const entry = writeBundle(bundle, deps.dir);
      manifest.lists = [...manifest.lists.filter((list) => list.sourceId !== id), entry];
      writeManifest(manifest, deps.dir);
      deps.log(`${id}: ${entry.records} records`);
      outcomes.push({ sourceId: id, outcome: "ok", entry });
    } catch (error) {
      const reason = nameOf(error);
      deps.log(`${id}: FAILED (${reason}); the previous bundle stays`);
      outcomes.push({ sourceId: id, outcome: "failed", reason });
    }
  }
  return outcomes;
}

export async function main(argv: string[]): Promise<number> {
  let options: BundleOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  const dir = bundleDir();
  const outcomes = await bundleLists(options, {
    dir,
    fetch: connectorFetch,
    connectors: CONNECTORS,
    now: () => new Date(),
    log: (text) => console.log(text),
  });
  const failed = outcomes.filter((outcome) => outcome.outcome === "failed");
  console.log(
    `\n${outcomes.length - failed.length} of ${outcomes.length} lists bundled in ${dir}.` +
      (failed.length > 0
        ? ` Failed: ${failed.map((outcome) => outcome.sourceId).join(", ")}.`
        : ""),
  );
  return failed.length > 0 ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .catch((error: unknown) => {
      console.error(`The bundles could not be built (${nameOf(error)}).`);
      return 2;
    })
    .then((code) => process.exit(code));
}
