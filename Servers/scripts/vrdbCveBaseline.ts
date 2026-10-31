#!/usr/bin/env ts-node
/**
 * Loads a baseline file of the CVE Program into the CVE mirror of the vendor risk database (M2
 * Task 8, Ruling 8 of the M2 plan). A sync reads the list by its changes, from the day after its
 * cursor, and refuses a list without a cursor (`no_baseline`): the records of the lookback come
 * from a baseline, `<day>_all_CVEs_at_midnight.zip`, which an operator downloads from a release of
 * cvelistV5 (https://github.com/CVEProject/cvelistV5/releases) and gives this script. A baseline
 * holds every record of the list as it stood at midnight starting <day> (UTC), in a zip inside the
 * zip.
 *
 * The script keeps what a sync keeps (connectors/cve.ts `parseCveRecord`): the records published in
 * the last 24 months whose highest base score is 9.0 or more, and every rejected one. It applies
 * them in batches of 1,000, then sets the cursor to the day before the file's, so that the next sync
 * reads the changes from the file's day on; the batches before that last apply leave the list's
 * outcome and last success alone, so a load that stops halfway leaves a list that was never copied
 * as it was. It refuses while the gate of the CVE records (Q7) is closed: the CVE Terms of Use
 * are not yet approved for this use.
 *
 * Exit codes:
 *   0 - the baseline was applied, and the cursor is the day before the file's
 *   1 - the file could not be read, or holds entries that do not parse; the cursor was not moved
 *   2 - the gate is closed, the file is not named as a baseline is, or the database failed
 *
 * Usage:
 *   cd Servers && npx ts-node scripts/vrdbCveBaseline.ts <day>_all_CVEs_at_midnight.zip
 */
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { sequelize } from "../database/db";
import {
  CVE_BASELINE_ZIP_LIMITS,
  cveWindowStart,
  isCveEntry,
  parseCveRecord,
} from "../services/vendorResearch/vrdb/connectors/cve";
import { dayOf } from "../services/vendorResearch/vrdb/connectors/types";
import { CVE_TERMS_APPROVED } from "../services/vendorResearch/vrdb/gates";
import { vrdbSourceOf } from "../services/vendorResearch/vrdb/sources";
import type { ParsedRecord } from "../services/vendorResearch/vrdb/types";
import { ZipError, readZipFile } from "../services/vendorResearch/vrdb/zip";
import * as vrdbStore from "../utils/vrdb.utils";

/** The records applied in one transaction. */
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
  let batch: ParsedRecord[] = [];
  let applied = 0;
  let errors = 0;
  const apply = async (cursor: { day: string } | null) => {
    await deps.store.applyVrdbDeltaQuery({
      sourceId: "cve",
      records: batch,
      cursor,
      rawSnapshotHash,
      at,
    });
    applied += batch.length;
    batch = [];
  };

  try {
    await readZipFile(
      file,
      isBaselineEntry,
      CVE_BASELINE_ZIP_LIMITS,
      async ({ data }) => {
        let json: unknown;
        try {
          json = JSON.parse(data.toString("utf8"));
        } catch {
          errors += 1;
          return;
        }
        const record = parseCveRecord(json, window);
        if (record === "error") errors += 1;
        else if (record !== null) {
          batch.push(record);
          if (batch.length === BASELINE_BATCH) await apply(null);
        }
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
  if (errors > 0) {
    err(
      `${errors} ${errors === 1 ? "entry" : "entries"} of the baseline do not parse. ${applied} records were applied; the cursor was not moved.`,
    );
    return 1;
  }

  const dayBefore = new Date(Date.parse(`${fileDay}T00:00:00Z`) - DAY_MS)
    .toISOString()
    .slice(0, 10);
  await apply({ day: dayBefore });
  out(
    `Applied ${applied} records of the CVE baseline of ${fileDay}. The CVE mirror reads the changes from ${fileDay} on.`,
  );
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
