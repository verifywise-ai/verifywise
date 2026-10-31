import { createHash } from "crypto";
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import type {
  FindingSource,
  RecordSourceId,
  RecordStatus,
  StoredCredibilityBasis,
  VrdbSourceId,
} from "../domain.layer/interfaces/i.vendorResearch";
import type { VrdbSourceDefinition } from "../services/vendorResearch/vrdb/sources";
import type {
  ApplyCounts,
  FindingRelabel,
  FindingToRelabel,
  MatchWrite,
  ParsedRecord,
  ReadThroughAnswer,
  VrdbDeltaWrite,
  VrdbLookupState,
  VrdbRow,
  VrdbSnapshotWrite,
  VrdbSourceMark,
  VrdbSourceState,
  VrdbSyncRunResult,
} from "../services/vendorResearch/vrdb/types";

/**
 * Queries for the vendor risk database (services/vendorResearch/vrdb/): `vrdb_sources` (one row
 * per list, with where its copy stands, and the cursor of a list read by its changes),
 * `vrdb_records` (the records of the lists), `vrdb_sync_runs`
 * (one row per sync attempt), `vrdb_lookups` (the state of each key of a read-through source) and
 * `vendor_vrdb_matches` (the records a vendor of an organization matched). The first four are
 * shared, hold public records only and are written by the sync job and the read-through; every
 * statement on `vendor_vrdb_matches` filters on `organization_id`. The status job lists the ids of
 * the organizations and reads the pending findings of one at a time that cite a record whose status
 * changed (`findFindingsToRelabelQuery`), and writes each in its own.
 */

/** Records sent in one statement: about a megabyte of JSON. */
const BATCH_SIZE = 500;

const NUL = 0;
const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * The text without the characters Postgres cannot store, in a column or in JSON: NUL, and half
 * of a surrogate pair. A list that holds one would otherwise fail every sync.
 */
function storable(text: string): string {
  let clean = true;
  for (let index = 0; index < text.length && clean; index += 1) {
    const code = text.charCodeAt(index);
    clean = code !== NUL && !isHighSurrogate(code) && !isLowSurrogate(code);
  }
  if (clean) return text;
  let out = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (isHighSurrogate(code) && isLowSurrogate(text.charCodeAt(index + 1))) {
      out += text.slice(index, index + 2);
      index += 1;
    } else if (code !== NUL && !isHighSurrogate(code) && !isLowSurrogate(code)) {
      out += text[index];
    }
  }
  return out;
}

/** A value of `identifiers` with every string made storable. */
function storableValue(value: unknown): unknown {
  if (typeof value === "string") return storable(value);
  if (Array.isArray(value)) return value.map(storableValue);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [storable(key), storableValue(inner)]),
    );
  }
  return value;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The cursor of a list read by its changes, as stored: `{ "day": "YYYY-MM-DD" }`; null for anything else. */
function cursorOf(value: unknown): { day: string } | null {
  const day = (value as { day?: unknown } | null)?.day;
  if (typeof day !== "string" || !DAY.test(day)) return null;
  const midnight = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(midnight.getTime()) && midnight.toISOString().startsWith(day)
    ? { day }
    : null;
}

/**
 * A date of a record as an instant Postgres reads the same in every time zone: a day is its UTC
 * midnight. A value that is no date is null, so that one bad date does not fail the sync.
 */
function instantOf(value: string | null): string | null {
  if (value === null) return null;
  if (DAY.test(value)) {
    const midnight = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(midnight.getTime()) && midnight.toISOString().startsWith(value)
      ? midnight.toISOString()
      : null;
  }
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

interface StoredRecord {
  source_record_id: string;
  record_type: string;
  title: string;
  summary: string;
  url: string;
  identifiers: unknown;
  match_keys: string[];
  published_at: string | null;
  source_updated_at: string | null;
  content_hash: string;
}

/** A record as it is stored, with the SHA-256 of its normalised content. */
function storedRecordOf(record: ParsedRecord): StoredRecord {
  const stored = {
    source_record_id: storable(record.sourceRecordId),
    record_type: storable(record.recordType),
    title: storable(record.title),
    summary: storable(record.summary),
    url: storable(record.url),
    identifiers: storableValue(record.identifiers),
    match_keys: record.matchKeys.map(storable),
    published_at: instantOf(record.publishedAt),
    source_updated_at: instantOf(record.sourceUpdatedAt),
  };
  const content_hash = createHash("sha256")
    .update(
      JSON.stringify([
        stored.source_record_id,
        stored.record_type,
        stored.title,
        stored.summary,
        stored.url,
        stored.identifiers,
        stored.match_keys,
        stored.published_at,
        stored.source_updated_at,
      ]),
    )
    .digest("hex");
  return { ...stored, content_hash };
}

/** The columns of a batch of records, as `jsonb_to_recordset` reads them. */
const RECORD_FIELDS = `r(source_record_id text, record_type text, title text, summary text, url text,
  identifiers jsonb, match_keys text[], published_at timestamptz, source_updated_at timestamptz,
  content_hash text)`;

/** The columns of a batch of the records of an answer, each with its status. */
const ANSWER_FIELDS = `r(source_record_id text, record_type text, title text, summary text, url text,
  identifiers jsonb, match_keys text[], published_at timestamptz, source_updated_at timestamptz,
  content_hash text, status text)`;

/**
 * The columns of a batch of the changes of a list read by its changes: an answer's, with the time
 * the list says a record took its status (null when it says none).
 */
const DELTA_FIELDS = `r(source_record_id text, record_type text, title text, summary text, url text,
  identifiers jsonb, match_keys text[], published_at timestamptz, source_updated_at timestamptz,
  content_hash text, status text, status_changed_at timestamptz)`;

function batches<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    out.push(items.slice(start, start + BATCH_SIZE));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sources and their sync runs
// ---------------------------------------------------------------------------

/**
 * Writes the definition of a list (vrdb/sources.ts) into its row, which a first sync creates. The
 * state of its copy is left as it is.
 */
export const upsertVrdbSourceQuery = async (
  definition: VrdbSourceDefinition,
  now: Date,
  transaction?: Transaction,
): Promise<void> => {
  await sequelize.query(
    `INSERT INTO vrdb_sources
       (id, name, operator, access_mode, documentation_url, licence, attribution,
        stale_after_hours, created_at, updated_at)
     VALUES (:id, :name, :operator, :mode, :documentationUrl, :licence, :attribution,
        :staleAfterHours, :now, :now)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       operator = EXCLUDED.operator,
       access_mode = EXCLUDED.access_mode,
       documentation_url = EXCLUDED.documentation_url,
       licence = EXCLUDED.licence,
       attribution = EXCLUDED.attribution,
       stale_after_hours = EXCLUDED.stale_after_hours,
       updated_at = EXCLUDED.updated_at`,
    {
      replacements: {
        id: definition.id,
        name: definition.name,
        operator: definition.operator,
        mode: definition.mode,
        documentationUrl: definition.documentationUrl,
        licence: definition.licence,
        attribution: definition.attribution,
        staleAfterHours: definition.staleAfterHours,
        now,
      },
      type: QueryTypes.INSERT,
      transaction,
    },
  );
};

/** Where the copy of each of the lists stands; a list no sync has written has no state. */
export const getVrdbSourceStatesQuery = async (
  ids: readonly VrdbSourceId[],
  transaction?: Transaction,
): Promise<VrdbSourceState[]> => {
  if (ids.length === 0) return [];
  const rows = (await sequelize.query(
    `SELECT id, last_success_at, last_outcome, source_version, etag, last_modified, active_records,
            cursor
     FROM vrdb_sources WHERE id IN (:ids)`,
    { replacements: { ids: [...ids] }, type: QueryTypes.SELECT, transaction },
  )) as Array<{
    id: VrdbSourceId;
    last_success_at: Date | null;
    last_outcome: VrdbSourceState["lastOutcome"];
    source_version: string | null;
    etag: string | null;
    last_modified: string | null;
    active_records: number;
    cursor: unknown;
  }>;
  return rows.map((row) => ({
    id: row.id,
    lastSuccessAt: row.last_success_at,
    lastOutcome: row.last_outcome,
    sourceVersion: row.source_version,
    etag: row.etag,
    lastModified: row.last_modified,
    activeRecords: Number(row.active_records),
    cursor: cursorOf(row.cursor),
  }));
};

/**
 * The hash of the bodies of the last sync of the list that succeeded with a download: a body with
 * that hash holds nothing the copy lacks.
 */
export const lastSuccessfulHashQuery = async (
  id: VrdbSourceId,
  transaction?: Transaction,
): Promise<string | null> => {
  const rows = (await sequelize.query(
    `SELECT raw_snapshot_hash FROM vrdb_sync_runs
     WHERE source_id = :id AND outcome IN ('ok', 'unchanged') AND raw_snapshot_hash IS NOT NULL
     ORDER BY started_at DESC, id DESC
     LIMIT 1`,
    { replacements: { id }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ raw_snapshot_hash: string }>;
  return rows[0]?.raw_snapshot_hash ?? null;
};

/** Starts the row of a sync attempt, and notes the attempt on the list. Gives the row's id. */
export const startVrdbSyncRunQuery = async (
  id: VrdbSourceId,
  at: Date,
  transaction?: Transaction,
): Promise<number> => {
  const rows = (await sequelize.query(
    `WITH attempt AS (
       UPDATE vrdb_sources SET last_attempt_at = :at WHERE id = :id
     )
     INSERT INTO vrdb_sync_runs (source_id, started_at) VALUES (:id, :at)
     RETURNING id`,
    { replacements: { id, at }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ id: number }>;
  return Number(rows[0].id);
};

/** Ends the row of a sync attempt with its outcome, what it read and what it changed. */
export const finishVrdbSyncRunQuery = async (
  runId: number,
  result: VrdbSyncRunResult,
  at: Date,
  transaction?: Transaction,
): Promise<void> => {
  await sequelize.query(
    `UPDATE vrdb_sync_runs SET
       finished_at = :at,
       outcome = :outcome,
       error_code = :errorCode,
       bytes = :bytes,
       records_seen = :seen,
       inserted = :inserted,
       updated = :updated,
       status_changed = :statusChanged,
       raw_snapshot_hash = :rawSnapshotHash,
       duration_ms = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (:at::timestamptz - started_at)) * 1000))
     WHERE id = :runId`,
    {
      replacements: {
        runId,
        at,
        outcome: result.outcome,
        errorCode: result.errorCode ?? null,
        bytes: result.bytes ?? null,
        seen: result.counts?.seen ?? null,
        inserted: result.counts?.inserted ?? null,
        updated: result.counts?.updated ?? null,
        statusChanged: result.counts?.statusChanged ?? null,
        rawSnapshotHash: result.rawSnapshotHash ?? null,
      },
      type: QueryTypes.UPDATE,
      transaction,
    },
  );
};

/**
 * Notes a sync that applied nothing on its list: unchanged is a success (with the validators of
 * the download, when there was one), failed keeps the last success and stores the code.
 */
export const markVrdbSourceQuery = async (
  id: VrdbSourceId,
  mark: VrdbSourceMark,
  transaction?: Transaction,
): Promise<void> => {
  if (mark.outcome === "failed") {
    await sequelize.query(
      `UPDATE vrdb_sources SET last_outcome = 'failed', last_error = :errorCode, updated_at = :at
       WHERE id = :id`,
      {
        replacements: { id, errorCode: mark.errorCode, at: mark.at },
        type: QueryTypes.UPDATE,
        transaction,
      },
    );
    return;
  }
  await sequelize.query(
    `UPDATE vrdb_sources SET
       last_outcome = 'unchanged',
       last_error = NULL,
       last_success_at = :at,
       etag = CASE WHEN :keepValidators THEN etag ELSE :etag END,
       last_modified = CASE WHEN :keepValidators THEN last_modified ELSE :lastModified END,
       updated_at = :at
     WHERE id = :id`,
    {
      replacements: {
        id,
        at: mark.at,
        keepValidators: mark.validators === undefined,
        etag: mark.validators?.etag ?? null,
        lastModified: mark.validators?.lastModified ?? null,
      },
      type: QueryTypes.UPDATE,
      transaction,
    },
  );
};

/** Forgets the sync attempts that started before the moment. */
export const pruneVrdbSyncRunsQuery = async (
  before: Date,
  transaction?: Transaction,
): Promise<void> => {
  await sequelize.query(`DELETE FROM vrdb_sync_runs WHERE started_at < :before`, {
    replacements: { before },
    type: QueryTypes.DELETE,
    transaction,
  });
};

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/**
 * Makes the copy of a list hold what the list holds now, all or nothing, and notes the success on
 * the list with its version, its validators and its number of active records:
 * - a record that is new is inserted, active;
 * - a stored record whose content changed takes the new content, and one that had left the list
 *   is active again; a stored record that did not change is not written, so `retrieved_at` is when
 *   its content was read;
 * - an active record that the list no longer holds becomes `missingStatus`.
 * The same id twice in the list is one record, the first.
 */
export const applyVrdbSnapshotQuery = async (
  input: VrdbSnapshotWrite,
  transaction?: Transaction,
): Promise<ApplyCounts> => {
  const applyAll = async (inside: Transaction): Promise<ApplyCounts> => {
    const { sourceId, at, rawSnapshotHash } = input;
    const sources = (await sequelize.query(
      `SELECT id FROM vrdb_sources WHERE id = :sourceId FOR UPDATE`,
      { replacements: { sourceId }, type: QueryTypes.SELECT, transaction: inside },
    )) as Array<{ id: string }>;
    if (sources.length === 0) throw new Error("The list has no row in vrdb_sources");

    const stored = (await sequelize.query(
      `SELECT source_record_id, content_hash, status FROM vrdb_records WHERE source_id = :sourceId`,
      { replacements: { sourceId }, type: QueryTypes.SELECT, transaction: inside },
    )) as Array<{ source_record_id: string; content_hash: string; status: RecordStatus }>;
    const byId = new Map(stored.map((row) => [row.source_record_id, row]));

    const listed = new Map<string, StoredRecord>();
    for (const record of input.records) {
      const row = storedRecordOf(record);
      if (!listed.has(row.source_record_id)) listed.set(row.source_record_id, row);
    }

    const inserts: StoredRecord[] = [];
    const updates: StoredRecord[] = [];
    let updated = 0;
    let statusChanged = 0;
    for (const row of listed.values()) {
      const before = byId.get(row.source_record_id);
      if (!before) {
        inserts.push(row);
        continue;
      }
      const changed = before.content_hash !== row.content_hash;
      const returned = before.status !== "active";
      if (changed) updated += 1;
      if (returned) statusChanged += 1;
      if (changed || returned) updates.push(row);
    }
    const missing = stored
      .filter((row) => row.status === "active" && !listed.has(row.source_record_id))
      .map((row) => row.source_record_id);
    statusChanged += missing.length;

    for (const batch of batches(inserts)) {
      await sequelize.query(
        `INSERT INTO vrdb_records
           (source_id, source_record_id, record_type, status, title, summary, url, identifiers,
            match_keys, published_at, source_updated_at, retrieved_at, content_hash,
            raw_snapshot_hash, created_at, updated_at)
         SELECT :sourceId, r.source_record_id, r.record_type, 'active', r.title, r.summary, r.url,
                r.identifiers, r.match_keys, r.published_at, r.source_updated_at, :at,
                r.content_hash, :rawSnapshotHash, :at, :at
         FROM jsonb_to_recordset(:payload::jsonb) AS ${RECORD_FIELDS}`,
        {
          replacements: { sourceId, at, rawSnapshotHash, payload: JSON.stringify(batch) },
          type: QueryTypes.INSERT,
          transaction: inside,
        },
      );
    }
    for (const batch of batches(updates)) {
      await sequelize.query(
        `UPDATE vrdb_records AS v SET
           record_type = r.record_type,
           status = 'active',
           status_changed_at = CASE WHEN v.status <> 'active' THEN :at ELSE v.status_changed_at END,
           title = r.title,
           summary = r.summary,
           url = r.url,
           identifiers = r.identifiers,
           match_keys = r.match_keys,
           published_at = r.published_at,
           source_updated_at = r.source_updated_at,
           retrieved_at = :at,
           content_hash = r.content_hash,
           raw_snapshot_hash = :rawSnapshotHash,
           updated_at = :at
         FROM jsonb_to_recordset(:payload::jsonb) AS ${RECORD_FIELDS}
         WHERE v.source_id = :sourceId AND v.source_record_id = r.source_record_id`,
        {
          replacements: { sourceId, at, rawSnapshotHash, payload: JSON.stringify(batch) },
          type: QueryTypes.UPDATE,
          transaction: inside,
        },
      );
    }
    for (const batch of batches(missing)) {
      await sequelize.query(
        `UPDATE vrdb_records SET status = :missingStatus, status_changed_at = :at, updated_at = :at
         WHERE source_id = :sourceId AND source_record_id IN (:ids)`,
        {
          replacements: { sourceId, at, missingStatus: input.missingStatus, ids: batch },
          type: QueryTypes.UPDATE,
          transaction: inside,
        },
      );
    }

    await sequelize.query(
      `UPDATE vrdb_sources SET
         last_outcome = 'ok',
         last_error = NULL,
         last_success_at = :at,
         source_version = :sourceVersion,
         etag = :etag,
         last_modified = :lastModified,
         active_records = :active,
         updated_at = :at
       WHERE id = :sourceId`,
      {
        replacements: {
          sourceId,
          at,
          sourceVersion: input.sourceVersion === null ? null : storable(input.sourceVersion),
          etag: input.etag,
          lastModified: input.lastModified,
          active: listed.size,
        },
        type: QueryTypes.UPDATE,
        transaction: inside,
      },
    );
    return { seen: listed.size, inserted: inserts.length, updated, statusChanged };
  };
  return transaction ? applyAll(transaction) : sequelize.transaction(applyAll);
};

/**
 * Applies the changes of one day of a list read by its changes (the CVE records), all or nothing,
 * and notes the success on the list with the day as its cursor and its version and its number of
 * active records:
 * - a new record is inserted with its status; a stored one takes its content and status, and a
 *   record that comes without keys (a rejected CVE names no product) keeps those it had;
 * - a change of status, and a new record that is not active, is dated `at`;
 * - a stored record that is not among the changes stays as it is: nothing leaves the copy.
 * A null cursor keeps the stored one (a batch of a baseline). The same id twice is one record, the
 * first.
 */
export const applyVrdbDeltaQuery = async (
  input: VrdbDeltaWrite,
  transaction?: Transaction,
): Promise<ApplyCounts> => {
  const applyAll = async (inside: Transaction): Promise<ApplyCounts> => {
    const { sourceId, at, rawSnapshotHash } = input;
    const sources = (await sequelize.query(
      `SELECT id FROM vrdb_sources WHERE id = :sourceId FOR UPDATE`,
      { replacements: { sourceId }, type: QueryTypes.SELECT, transaction: inside },
    )) as Array<{ id: string }>;
    if (sources.length === 0) throw new Error("The list has no row in vrdb_sources");

    const changed = new Map<string, ParsedRecord>();
    for (const record of input.records) {
      const id = storable(record.sourceRecordId);
      if (!changed.has(id)) changed.set(id, record);
    }
    let inserted = 0;
    let updated = 0;
    let statusChanged = 0;
    for (const batch of batches([...changed.entries()])) {
      const stored = (await sequelize.query(
        `SELECT source_record_id, content_hash, status, match_keys FROM vrdb_records
         WHERE source_id = :sourceId AND source_record_id IN (:ids)
         FOR UPDATE`,
        {
          replacements: { sourceId, ids: batch.map(([id]) => id) },
          type: QueryTypes.SELECT,
          transaction: inside,
        },
      )) as Array<{
        source_record_id: string;
        content_hash: string;
        status: RecordStatus;
        match_keys: string[];
      }>;
      const before = new Map(stored.map((row) => [row.source_record_id, row]));
      const writes: Array<
        StoredRecord & { status: RecordStatus; status_changed_at: string | null }
      > = [];
      for (const [id, record] of batch) {
        const old = before.get(id);
        const status = record.status ?? "active";
        const row = storedRecordOf(
          old !== undefined && record.matchKeys.length === 0
            ? { ...record, matchKeys: old.match_keys }
            : record,
        );
        const changedAt = instantOf(record.statusChangedAt ?? null);
        if (old === undefined) {
          inserted += 1;
          if (status !== "active") statusChanged += 1;
          writes.push({ ...row, status, status_changed_at: changedAt });
          continue;
        }
        const contentChanged = old.content_hash !== row.content_hash;
        const statusMoved = old.status !== status;
        if (contentChanged) updated += 1;
        if (statusMoved) statusChanged += 1;
        if (contentChanged || statusMoved)
          writes.push({ ...row, status, status_changed_at: changedAt });
      }
      if (writes.length === 0) continue;
      await sequelize.query(
        `INSERT INTO vrdb_records AS v
           (source_id, source_record_id, record_type, status, status_changed_at, title, summary,
            url, identifiers, match_keys, published_at, source_updated_at, retrieved_at,
            content_hash, raw_snapshot_hash, created_at, updated_at)
         SELECT :sourceId, r.source_record_id, r.record_type, r.status,
                CASE WHEN r.status <> 'active'
                     THEN COALESCE(r.status_changed_at, CAST(:at AS timestamptz)) END, r.title,
                r.summary, r.url, r.identifiers, r.match_keys, r.published_at,
                r.source_updated_at, :at, r.content_hash, :rawSnapshotHash, :at, :at
         FROM jsonb_to_recordset(:payload::jsonb) AS ${DELTA_FIELDS}
         ON CONFLICT (source_id, source_record_id) DO UPDATE SET
           record_type = EXCLUDED.record_type,
           status = EXCLUDED.status,
           status_changed_at = CASE WHEN v.status <> EXCLUDED.status
                                    THEN COALESCE(EXCLUDED.status_changed_at, EXCLUDED.retrieved_at)
                                    ELSE v.status_changed_at END,
           title = EXCLUDED.title,
           summary = EXCLUDED.summary,
           url = EXCLUDED.url,
           identifiers = EXCLUDED.identifiers,
           match_keys = EXCLUDED.match_keys,
           published_at = EXCLUDED.published_at,
           source_updated_at = EXCLUDED.source_updated_at,
           retrieved_at = EXCLUDED.retrieved_at,
           content_hash = EXCLUDED.content_hash,
           raw_snapshot_hash = EXCLUDED.raw_snapshot_hash,
           updated_at = EXCLUDED.updated_at`,
        {
          replacements: { sourceId, at, rawSnapshotHash, payload: JSON.stringify(writes) },
          type: QueryTypes.INSERT,
          transaction: inside,
        },
      );
    }

    // A batch of a baseline before its last (no day) leaves the outcome and the last success.
    await sequelize.query(
      `UPDATE vrdb_sources SET
         last_outcome = CASE WHEN CAST(:day AS text) IS NULL THEN last_outcome ELSE 'ok' END,
         last_error = CASE WHEN CAST(:day AS text) IS NULL THEN last_error END,
         last_success_at = CASE WHEN CAST(:day AS text) IS NULL THEN last_success_at ELSE :at END,
         cursor = CASE WHEN CAST(:day AS text) IS NULL THEN cursor
                       ELSE jsonb_build_object('day', CAST(:day AS text)) END,
         source_version = COALESCE(CAST(:day AS text), source_version),
         active_records = (
           SELECT COUNT(*) FROM vrdb_records WHERE source_id = :sourceId AND status = 'active'
         ),
         updated_at = :at
       WHERE id = :sourceId`,
      {
        replacements: { sourceId, at, day: input.cursor?.day ?? null },
        type: QueryTypes.UPDATE,
        transaction: inside,
      },
    );
    return { seen: changed.size, inserted, updated, statusChanged };
  };
  return transaction ? applyAll(transaction) : sequelize.transaction(applyAll);
};

// ---------------------------------------------------------------------------
// The answers of the read-through sources
// ---------------------------------------------------------------------------

/** The state of one key of a read-through source; null for a key never asked. */
export const getVrdbLookupQuery = async (
  sourceId: VrdbSourceId,
  key: string,
  transaction?: Transaction,
): Promise<VrdbLookupState | null> => {
  const rows = (await sequelize.query(
    `SELECT fetched_at, expires_at, outcome FROM vrdb_lookups
     WHERE source_id = :sourceId AND lookup_key = :key`,
    { replacements: { sourceId, key }, type: QueryTypes.SELECT, transaction },
  )) as Array<{ fetched_at: Date | null; expires_at: Date; outcome: string }>;
  const [row] = rows;
  return row === undefined
    ? null
    : { fetchedAt: row.fetched_at, expiresAt: row.expires_at, outcome: row.outcome };
};

/**
 * Stores an answer of a read-through source for one key, in one transaction: the source's row
 * (vrdb/sources.ts), each record of the answer, and the key's row in `vrdb_lookups`.
 * - A new record is inserted with the answer's status; a stored one takes the answer's content and
 *   status, and keeps the keys of the other answers that held it, with this answer's key added.
 * - A record whose status changed, and a new one that is not active (a rejected CVE rejects the
 *   same CVE on every list), is a change of status, dated `at`.
 * - A failed answer holds no records: it writes only the key's outcome and the time of its next
 *   attempt, and keeps the time of the last answer (none for a key that never had one).
 * The same id twice in the answer is one record, the first.
 */
export const saveReadThroughAnswerQuery = async (
  input: ReadThroughAnswer,
  transaction?: Transaction,
): Promise<{ statusChanged: number }> => {
  const saveAll = async (inside: Transaction): Promise<{ statusChanged: number }> => {
    const { definition, key, at, expiresAt } = input;
    const sourceId = definition.id;
    await upsertVrdbSourceQuery(definition, at, inside);
    if (input.outcome === "failed") {
      await sequelize.query(
        `INSERT INTO vrdb_lookups (source_id, lookup_key, fetched_at, expires_at, outcome, record_count)
         VALUES (:sourceId, :key, NULL, :expiresAt, 'failed', 0)
         ON CONFLICT (source_id, lookup_key) DO UPDATE SET
           expires_at = EXCLUDED.expires_at,
           outcome = EXCLUDED.outcome`,
        {
          replacements: { sourceId, key: storable(key), expiresAt },
          type: QueryTypes.INSERT,
          transaction: inside,
        },
      );
      return { statusChanged: 0 };
    }

    const answered = new Map<string, StoredRecord & { status: RecordStatus }>();
    for (const record of input.records) {
      const row = storedRecordOf(record);
      if (!answered.has(row.source_record_id)) {
        answered.set(row.source_record_id, { ...row, status: record.status ?? "active" });
      }
    }
    const rows = [...answered.values()];
    let statusChanged = 0;
    if (rows.length > 0) {
      const stored = (await sequelize.query(
        `SELECT source_record_id, status FROM vrdb_records
         WHERE source_id = :sourceId AND source_record_id IN (:ids)
         FOR UPDATE`,
        {
          replacements: { sourceId, ids: rows.map((row) => row.source_record_id) },
          type: QueryTypes.SELECT,
          transaction: inside,
        },
      )) as Array<{ source_record_id: string; status: RecordStatus }>;
      const before = new Map(stored.map((row) => [row.source_record_id, row.status]));
      for (const row of rows) {
        const status = before.get(row.source_record_id);
        if (status === undefined ? row.status !== "active" : status !== row.status) {
          statusChanged += 1;
        }
      }
      const rawSnapshotHash = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
      for (const batch of batches(rows)) {
        await sequelize.query(
          `INSERT INTO vrdb_records AS v
             (source_id, source_record_id, record_type, status, status_changed_at, title, summary,
              url, identifiers, match_keys, published_at, source_updated_at, retrieved_at,
              content_hash, raw_snapshot_hash, created_at, updated_at)
           SELECT :sourceId, r.source_record_id, r.record_type, r.status,
                  CASE WHEN r.status <> 'active' THEN CAST(:at AS timestamptz) END, r.title,
                  r.summary, r.url, r.identifiers, r.match_keys, r.published_at,
                  r.source_updated_at, :at, r.content_hash, :rawSnapshotHash, :at, :at
           FROM jsonb_to_recordset(:payload::jsonb) AS ${ANSWER_FIELDS}
           ON CONFLICT (source_id, source_record_id) DO UPDATE SET
             record_type = EXCLUDED.record_type,
             status = EXCLUDED.status,
             status_changed_at = CASE WHEN v.status <> EXCLUDED.status THEN EXCLUDED.retrieved_at
                                      ELSE v.status_changed_at END,
             title = EXCLUDED.title,
             summary = EXCLUDED.summary,
             url = EXCLUDED.url,
             identifiers = EXCLUDED.identifiers,
             match_keys = v.match_keys || ARRAY(
               SELECT k FROM unnest(EXCLUDED.match_keys) AS k WHERE k <> ALL (v.match_keys)
             ),
             published_at = EXCLUDED.published_at,
             source_updated_at = EXCLUDED.source_updated_at,
             retrieved_at = EXCLUDED.retrieved_at,
             content_hash = EXCLUDED.content_hash,
             raw_snapshot_hash = EXCLUDED.raw_snapshot_hash,
             updated_at = EXCLUDED.updated_at`,
          {
            replacements: { sourceId, at, rawSnapshotHash, payload: JSON.stringify(batch) },
            type: QueryTypes.INSERT,
            transaction: inside,
          },
        );
      }
    }
    if (typeof input.coversSince === "string" && DAY.test(input.coversSince)) {
      // The answer holds every record of the key published since its first day, so a stored
      // record of the key published since then that it lacks was rejected, re-scored or moved off
      // the vendor (M2 final review, Important 1). It loses this key, keeps its other keys and its
      // status, and is no longer offered for the key; a record published before the window aged
      // out of it and is kept (Ruling 3 of the M2 plan).
      const answeredIds = rows.map((row) => row.source_record_id);
      await sequelize.query(
        `UPDATE vrdb_records
         SET match_keys = array_remove(match_keys, :key), updated_at = :at
         WHERE source_id = :sourceId
           AND :key = ANY(match_keys)
           AND published_at >= :since
           ${answeredIds.length > 0 ? "AND NOT (source_record_id = ANY(ARRAY[:answeredIds]::text[]))" : ""}`,
        {
          replacements: {
            sourceId,
            key: storable(key),
            at,
            since: new Date(`${input.coversSince}T00:00:00.000Z`),
            answeredIds,
          },
          type: QueryTypes.UPDATE,
          transaction: inside,
        },
      );
    }
    await sequelize.query(
      `INSERT INTO vrdb_lookups (source_id, lookup_key, fetched_at, expires_at, outcome, record_count)
       VALUES (:sourceId, :key, :at, :expiresAt, :outcome, :count)
       ON CONFLICT (source_id, lookup_key) DO UPDATE SET
         fetched_at = EXCLUDED.fetched_at,
         expires_at = EXCLUDED.expires_at,
         outcome = EXCLUDED.outcome,
         record_count = EXCLUDED.record_count`,
      {
        replacements: {
          sourceId,
          key: storable(key),
          at,
          expiresAt,
          outcome: input.outcome,
          count: rows.length,
        },
        type: QueryTypes.INSERT,
        transaction: inside,
      },
    );
    return { statusChanged };
  };
  return transaction ? saveAll(transaction) : sequelize.transaction(saveAll);
};

/**
 * The active records of the lists that hold one of the keys. A vendor's keys are few, and the
 * GIN index on `match_keys` answers the overlap. A vulnerability is left out when any list rejected
 * its CVE (Ruling 9 of the M2 plan), which the partial index on rejected ids answers.
 */
export const findVrdbRecordsByKeysQuery = async (
  keys: readonly string[],
  sources: readonly VrdbSourceId[],
  transaction?: Transaction,
): Promise<VrdbRow[]> => {
  if (keys.length === 0 || sources.length === 0) return [];
  const rows = (await sequelize.query(
    `SELECT id, source_id, source_record_id, record_type, status, title, summary, url, match_keys,
            published_at, retrieved_at
     FROM vrdb_records AS v
     WHERE match_keys && ARRAY[:keys]::text[]
       AND source_id = ANY(ARRAY[:sources]::text[])
       AND status = 'active'
       AND NOT (
         record_type = 'vulnerability'
         AND EXISTS (
           SELECT 1 FROM vrdb_records AS rejected
           WHERE rejected.source_record_id = v.source_record_id
             AND rejected.status = 'rejected'
             AND rejected.record_type = 'vulnerability'
         )
       )`,
    {
      replacements: { keys: [...keys], sources: [...sources] },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{
    id: string | number;
    source_id: VrdbSourceId;
    source_record_id: string;
    record_type: string;
    status: RecordStatus;
    title: string;
    summary: string;
    url: string;
    match_keys: string[];
    published_at: Date | null;
    retrieved_at: Date;
  }>;
  return rows.map((row) => ({
    id: Number(row.id),
    sourceId: row.source_id,
    sourceRecordId: row.source_record_id,
    recordType: row.record_type,
    status: row.status,
    title: row.title,
    summary: row.summary,
    url: row.url,
    matchKeys: row.match_keys,
    publishedAt: row.published_at ? row.published_at.toISOString().slice(0, 10) : null,
    retrievedAt: row.retrieved_at.toISOString().slice(0, 10),
  }));
};

// ---------------------------------------------------------------------------
// The records a vendor matched (tenant-scoped)
// ---------------------------------------------------------------------------

/**
 * Keeps the records a vendor of the organization matched in a run. A record matched before keeps
 * the moment it was first matched and takes the method, strength, key and moment of this match.
 * Nothing is written for a vendor that is not in the organization. The same record twice is one
 * row, the first.
 */
export const recordVendorVrdbMatchesQuery = async (
  organizationId: number,
  vendorId: number,
  matches: readonly MatchWrite[],
  at: Date,
  transaction?: Transaction,
): Promise<void> => {
  const byRecord = new Map<number, MatchWrite>();
  for (const match of matches) {
    if (!byRecord.has(match.recordId)) byRecord.set(match.recordId, match);
  }
  if (byRecord.size === 0) return;
  const payload = JSON.stringify(
    [...byRecord.values()].map((match) => ({
      record_id: match.recordId,
      match_method: match.method,
      match_strength: match.strength,
      matched_key: storable(match.matchedKey),
    })),
  );
  await sequelize.query(
    `INSERT INTO vendor_vrdb_matches
       (organization_id, vendor_id, record_id, match_method, match_strength, matched_key,
        first_matched_at, last_matched_at)
     SELECT v.organization_id, v.id, m.record_id, m.match_method, m.match_strength, m.matched_key,
            :at, :at
     FROM vendors v
     CROSS JOIN jsonb_to_recordset(:payload::jsonb)
       AS m(record_id bigint, match_method text, match_strength text, matched_key text)
     WHERE v.organization_id = :organizationId AND v.id = :vendorId
     ON CONFLICT (organization_id, vendor_id, record_id) DO UPDATE SET
       match_method = EXCLUDED.match_method,
       match_strength = EXCLUDED.match_strength,
       matched_key = EXCLUDED.matched_key,
       last_matched_at = EXCLUDED.last_matched_at`,
    {
      replacements: { organizationId, vendorId, at, payload },
      type: QueryTypes.INSERT,
      transaction,
    },
  );
};

// ---------------------------------------------------------------------------
// The status job (tenant rows, one organization at a time)
// ---------------------------------------------------------------------------

/** The findings of `findFindingsToRelabelQuery` of one organization, in id order. */
const findOrganizationFindingsToRelabel = async (
  organizationId: number,
  sourceId: VrdbSourceId,
  transaction?: Transaction,
): Promise<FindingToRelabel[]> => {
  const rows = (await sequelize.query(
    `WITH matched AS (
       SELECT DISTINCT m.vendor_id
       FROM vendor_vrdb_matches AS m
       JOIN vrdb_records AS r ON r.id = m.record_id
       WHERE m.organization_id = :organizationId
         AND (r.source_id = :sourceId
              OR (r.record_type = 'vulnerability'
                  AND EXISTS (
                    SELECT 1 FROM vrdb_records AS own
                    WHERE own.source_id = :sourceId AND own.record_type = 'vulnerability'
                      AND own.source_record_id = r.source_record_id)))
     ),
     cited AS (
       SELECT f.id AS finding_id,
              CASE WHEN jsonb_typeof(c.source #> '{record,record_id}') = 'number'
                        AND (c.source #>> '{record,record_id}') ~ '^[0-9]{1,18}$'
                   THEN CAST(c.source #>> '{record,record_id}' AS bigint) END AS record_id,
              c.source #>> '{record,status}' AS stored_status
       FROM vendor_risk_findings AS f
       JOIN matched AS m ON m.vendor_id = f.vendor_id
       CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(f.sources) = 'array' THEN f.sources ELSE '[]'::jsonb END
       ) AS c(source)
       WHERE f.organization_id = :organizationId AND f.status = 'pending'
         AND f.credibility IS NOT NULL
     ),
     effective AS (
       SELECT r.id,
              CASE WHEN rejected.source_id IS NULL THEN r.status ELSE 'rejected' END AS status,
              to_char(
                COALESCE(rejected.status_changed_at, r.status_changed_at, r.updated_at)
                  AT TIME ZONE 'UTC',
                'YYYY-MM-DD'
              ) AS changed_on,
              rejected.source_id AS rejected_by
       FROM vrdb_records AS r
       LEFT JOIN LATERAL (
         SELECT x.source_id, x.status_changed_at
         FROM vrdb_records AS x
         WHERE r.record_type = 'vulnerability' AND r.status <> 'rejected'
           AND x.status = 'rejected' AND x.record_type = 'vulnerability'
           AND x.source_record_id = r.source_record_id
         ORDER BY x.status_changed_at NULLS LAST, x.source_id
         LIMIT 1
       ) AS rejected ON TRUE
       WHERE r.id IN (SELECT record_id FROM cited WHERE record_id IS NOT NULL)
     ),
     judged AS (
       SELECT c.finding_id,
              jsonb_agg(
                jsonb_build_object(
                  'record_id', e.id,
                  'status', e.status,
                  'changed_on', e.changed_on,
                  'rejected_by', e.rejected_by
                ) ORDER BY e.id
              ) AS statuses,
              bool_or(c.stored_status IS DISTINCT FROM e.status) AS changed
       FROM cited AS c
       JOIN effective AS e ON e.id = c.record_id
       GROUP BY c.finding_id
     )
     SELECT f.organization_id, f.id, f.credibility_basis, f.sources, j.statuses
     FROM judged AS j
     JOIN vendor_risk_findings AS f
       ON f.organization_id = :organizationId AND f.id = j.finding_id
     WHERE j.changed
     ORDER BY f.id`,
    { replacements: { organizationId, sourceId }, type: QueryTypes.SELECT, transaction },
  )) as Array<{
    organization_id: number;
    id: number;
    credibility_basis: StoredCredibilityBasis;
    sources: FindingSource[];
    statuses: Array<{
      record_id: number | string;
      status: RecordStatus;
      changed_on: string;
      rejected_by: RecordSourceId | null;
    }>;
  }>;
  return rows.map((row) => ({
    organization_id: Number(row.organization_id),
    id: Number(row.id),
    credibility_basis: row.credibility_basis,
    sources: row.sources,
    statuses: new Map(
      row.statuses.map((entry) => [
        Number(entry.record_id),
        {
          status: entry.status,
          changedOn: entry.changed_on,
          ...(entry.rejected_by === null ? {} : { rejectedBy: entry.rejected_by }),
        },
      ]),
    ),
  }));
};

/**
 * The pending findings with a label of the vendors that matched a record of the list
 * (`vendor_vrdb_matches`), that cite a record of the copy whose status for them is no longer the
 * one they stored (Ruling 12 of the M2 plan): a record of any list, so that a change whose own job
 * was not added is relabeled by the next job of the vendor's lists. Each comes with the status of
 * every record of the copy it cites and the day that status began. A vulnerability is rejected
 * when any list rejected its CVE (Ruling 9), by the first list that did; so the records of a list
 * are its own and, for a vulnerability, those of its CVE on the other lists. The job serves every
 * organization: it lists their ids and reads the findings of one at a time, each statement
 * filtered on `organization_id`, as the backfill does; each write is in one organization too
 * (`updateFindingCredibilityQuery`). In the order of the organization, then the finding.
 */
export const findFindingsToRelabelQuery = async (
  sourceId: VrdbSourceId,
  transaction?: Transaction,
): Promise<FindingToRelabel[]> => {
  const organizations = (await sequelize.query(`SELECT id FROM organizations ORDER BY id`, {
    type: QueryTypes.SELECT,
    transaction,
  })) as Array<{ id: number | string }>;
  const found: FindingToRelabel[] = [];
  for (const { id } of organizations) {
    found.push(...(await findOrganizationFindingsToRelabel(Number(id), sourceId, transaction)));
  }
  return found;
};

/**
 * Writes the label of a finding again, with its basis and sources, in its organization: only while
 * it is pending, so that a person who decided it keeps what they saw, and while its basis is the
 * one the job read, so that a job that relabeled it since is not undone. True when it was written.
 */
export const updateFindingCredibilityQuery = async (
  organizationId: number,
  findingId: number,
  update: FindingRelabel & { previousBasis: StoredCredibilityBasis },
  transaction?: Transaction,
): Promise<boolean> => {
  const rows = (await sequelize.query(
    `UPDATE vendor_risk_findings
     SET credibility = :label,
         credibility_basis = CAST(:basis AS jsonb),
         sources = CAST(:sources AS jsonb)
     WHERE organization_id = :organizationId AND id = :findingId AND status = 'pending'
       AND credibility_basis = CAST(:previousBasis AS jsonb)
     RETURNING id`,
    {
      replacements: {
        organizationId,
        findingId,
        label: update.label,
        basis: JSON.stringify(update.basis),
        sources: JSON.stringify(update.sources),
        previousBasis: JSON.stringify(update.previousBasis),
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ id: number }>;
  return rows.length > 0;
};
