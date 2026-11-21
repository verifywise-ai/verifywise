#!/usr/bin/env ts-node
/**
 * Loads a baseline file of the CVE Program into the CVE mirror of the vendor risk database (M2
 * Task 8, Ruling 8 of the M2 plan). A sync reads the list by its changes, from the day after its
 * cursor, and refuses a list without a cursor (`no_baseline`): the records of the lookback come
 * from a baseline, which an operator loads once per deployment with this script. Nothing downloads
 * it automatically, and the scheduler queues no first sync for the list.
 *
 * The file is `<day>_all_CVEs_at_midnight.zip`, from any release of the newest day at
 * https://github.com/CVEProject/cvelistV5/releases. It holds every record of the list as it stood
 * at midnight starting <day> (UTC), in a zip inside the zip. GitHub serves it with a doubled .zip
 * (`<day>_all_CVEs_at_midnight.zip.zip`), and the script takes both names.
 *
 * What it needs: the file (about 650 MB); about 720 MB of temporary disk, in the system's
 * temporary directory, where the zip inside is inflated and deleted again when the read ends; and
 * a few minutes.
 *
 * Usage, from a checkout:
 *   cd Servers && npx ts-node scripts/vrdbCveBaseline.ts <day>_all_CVEs_at_midnight.zip
 * and in the backend container, which has no npx but holds the build in dist/:
 *   docker compose cp <file> backend:/tmp/
 *   docker compose exec backend node dist/scripts/vrdbCveBaseline.js /tmp/<file>
 *   docker compose exec backend rm /tmp/<file>
 *
 * The script keeps what a sync keeps (connectors/cve.ts `readCveRecord`): the records published in
 * the last 24 months whose highest base score is 9.0 or more, and every rejected one. The ids of
 * the published records it leaves out go to the store as `retire`, so that a copy that held one
 * (kept before it was re-scored, or before it left the window) loses its keys and is no longer
 * offered. It applies them in batches of 1,000 (a batch is full when its records or its ids reach
 * that), then sets the cursor to the day before the file's, so that the next sync reads the
 * changes from the file's day on; the batches before that last apply leave the list's outcome and
 * last success alone, so a load that stops halfway leaves a list that was never copied as it was.
 * It refuses while the gate of the CVE records (Q7, gates.ts) is closed.
 *
 * A few entries that do not parse are left out and counted, as a sync leaves them out. More than
 * ten, and more than a hundredth of the entries read, are a new format and not an odd record
 * (`cveUnreadableAllowed`): the script then refuses the file and does not move the cursor.
 *
 * Loading a newer baseline is the remedy for a day the sync refused: the sync keeps its cursor at
 * the day before it and fails the same way every day, and the newer baseline moves the cursor past
 * it. It also makes a copy exact again, since the records it leaves out are retired.
 *
 * Exit codes:
 *   0 - the baseline was applied, and the cursor is the day before the file's
 *   1 - the file could not be read, holds no record that can be read, or more of its entries do
 *       not parse than a baseline leaves out (`cveUnreadableAllowed`); the cursor was not moved
 *   2 - the gate is closed, the file is not named as a baseline is, or the database failed
 */
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { sequelize } from "../database/db";
import {
  CVE_BASELINE_ZIP_LIMITS,
  cveUnreadableAllowed,
  cveWindowStart,
  isCveEntry,
  readCveRecord,
} from "../services/vendorResearch/vrdb/connectors/cve";
import { dayOf } from "../services/vendorResearch/vrdb/connectors/types";
import { CVE_TERMS_APPROVED } from "../services/vendorResearch/vrdb/gates";
import { vrdbSourceOf } from "../services/vendorResearch/vrdb/sources";
import type { ParsedRecord } from "../services/vendorResearch/vrdb/types";
import { ZipError, readZipFile } from "../services/vendorResearch/vrdb/zip";
import * as vrdbStore from "../utils/vrdb.utils";

/** The records, or the ids of the records left out, applied in one transaction. */
export const BASELINE_BATCH = 1_000;

const USAGE = "Usage: npx ts-node scripts/vrdbCveBaseline.ts <day>_all_CVEs_at_midnight.zip";
/** The name of a baseline; a release has given it with a doubled .zip. */
const BASELINE_NAME = /^(\d{4}-\d{2}-\d{2})_all_CVEs_at_midnight\.zip(?:\.zip)?$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BaselineDeps {
  /** Whether the gate of the CVE records (Q7) is open. */
  approved: boolean;
  store: Pick<typeof vrdbStore, "upsertVrdbSourceQuery" | "applyVrdbDeltaQuery">;
  now: () => Date;
  /** Where the zip inside the baseline is inflated; the system's temporary directory by default. */
  tempDir?: string;
}

/** The name of an error, never its message, which can hold the address of the database. */
const nameOf = (error: unknown): string => {
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === "string" && /^[A-Za-z_$][\w$.]{0,59}$/.test(name) ? name : "unknown";
};

/** The code of an error of the file system (ENOENT), else the error's name. */
const codeOf = (error: unknown): string => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^E[A-Z]{2,20}$/.test(code) ? code : nameOf(error);
};

/** The SHA-256 of a file, read as a stream. */
async function hashOfFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/**
 * An entry of the baseline that is read: a record, or the zip inside the baseline, which the reader
 * inflates to a file of its own whatever its name (zip.ts).
 */
const isBaselineEntry = (name: string): boolean => /\.zip$/i.test(name) || isCveEntry(name);

export async function main(
  argv: string[],
  out: (text: string) => void = (text) => console.log(text),
  err: (text: string) => void = (text) => console.error(text),
  deps: BaselineDeps = { approved: CVE_TERMS_APPROVED, store: vrdbStore, now: () => new Date() },
): Promise<number> {
  if (!deps.approved) {
    err(
      "The CVE records are behind a closed gate (Q7): the CVE Terms of Use are not yet approved for this use. Nothing was applied.",
    );
    return 2;
  }
  const [file] = argv;
  const named = file === undefined ? null : BASELINE_NAME.exec(path.basename(file));
  const fileDay = named === null ? null : dayOf(named[1]);
  if (file === undefined || fileDay === null) {
    err(
      `The file must be a baseline of the CVE Program, named <day>_all_CVEs_at_midnight.zip. ${USAGE}`,
    );
    return 2;
  }
  let rawSnapshotHash: string;
  try {
    rawSnapshotHash = await hashOfFile(file);
  } catch (error) {
    err(`The baseline could not be read (${codeOf(error)}). Nothing was applied.`);
    return 1;
  }

  const at = deps.now();
  const window = { from: cveWindowStart(at) };
  await deps.store.upsertVrdbSourceQuery(vrdbSourceOf("cve"), at);
  // The records to keep and the ids of the published records to leave out, both until a batch is
  // full; the entries read, and those of them that do not parse, for the tolerance.
  let batch: ParsedRecord[] = [];
  let retire: string[] = [];
  let applied = 0;
  let leftOut = 0;
  let entries = 0;
  let errors = 0;
  const flush = async (cursor: { day: string } | null) => {
    await deps.store.applyVrdbDeltaQuery({
      sourceId: "cve",
      records: batch,
      retire,
      cursor,
      rawSnapshotHash,
      at,
    });
    applied += batch.length;
    batch = [];
    retire = [];
  };

  try {
    await readZipFile(
      file,
      isBaselineEntry,
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
        // An entry that cannot be read is not retired: its state is unknown.
        if (reading.kind === "error") {
          errors += 1;
          return;
        }
        if (reading.kind === "left_out") {
          retire.push(reading.id);
          leftOut += 1;
        } else {
          batch.push(reading.record);
        }
        if (batch.length >= BASELINE_BATCH || retire.length >= BASELINE_BATCH) await flush(null);
      },
      deps.tempDir === undefined ? {} : { tempDir: deps.tempDir },
    );
  } catch (error) {
    if (!(error instanceof ZipError)) throw error;
    err(
      `The baseline could not be read (${error.code}). ${applied} records were applied; the cursor was not moved.`,
    );
    return 1;
  }
  if (errors > cveUnreadableAllowed(entries)) {
    err(
      `${errors} entries of the baseline do not parse. ${applied} records were applied; the cursor was not moved.`,
    );
    return 1;
  }

  // A file with no record that could be read is a wrong or a damaged file, not a baseline: marking
  // the list as copied from it would show an empty copy as checked. This is not the tolerance above,
  // which a handful of unreadable entries stays under.
  if (applied + batch.length + leftOut === 0) {
    err(
      "The baseline holds no CVE record that can be read. Nothing was applied; the cursor was not moved.",
    );
    return 1;
  }

  const dayBefore = new Date(Date.parse(`${fileDay}T00:00:00Z`) - DAY_MS)
    .toISOString()
    .slice(0, 10);
  await flush({ day: dayBefore });
  let summary = `Applied ${applied} ${applied === 1 ? "record" : "records"} of the CVE baseline of ${fileDay}`;
  summary += `; ${leftOut} published ${leftOut === 1 ? "record was" : "records were"} left out (not critical, or published before ${window.from})`;
  if (errors > 0) {
    summary += `; ${errors} ${errors === 1 ? "entry that does not parse was" : "entries that do not parse were"} left out`;
  }
  out(`${summary}. The CVE mirror reads the changes from ${fileDay} on.`);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .catch((error: unknown) => {
      console.error(`The baseline could not be applied (${nameOf(error)}).`);
      return 2;
    })
    .then(async (code) => {
      await sequelize.close().catch(() => undefined);
      process.exit(code);
    });
}
