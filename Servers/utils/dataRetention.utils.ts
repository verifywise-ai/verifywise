import { QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../database/db";
import logger from "./logger/fileLogger";

/** Allowed audit record retention periods in months; null (no row value) keeps records indefinitely. */
export const AUDIT_RETENTION_MONTHS = [12, 24, 36, 60, 84, 120] as const;

export const RETENTION_BATCH_SIZE = 10_000;
export const RETENTION_MAX_BATCHES = 500;

export type RetentionRecordType =
  | "audit_records"
  | "ai_gateway_guardrail_logs"
  | "ai_gateway_spend_logs"
  | "mrm_metrics"
  | "shadow_ai_events"
  | "shadow_ai_daily_rollups"
  | "shadow_ai_alert_history";

export type RetentionRunStatus = "success" | "capped" | "failed";

/**
 * Audit tables pruned by timestamp. The hash-chained audit_ledger is pruned
 * separately (see auditLedgerRetention.utils.ts) and is deliberately absent.
 * Names are interpolated into SQL, so they only ever come from this list.
 */
export const AUDIT_RECORD_TABLES: ReadonlyArray<{ table: string; timestampColumn: string }> = [
  { table: "event_logs", timestampColumn: "timestamp" },
  { table: "model_inventory_change_history", timestampColumn: "changed_at" },
  { table: "vendor_change_history", timestampColumn: "changed_at" },
  { table: "use_case_change_history", timestampColumn: "changed_at" },
  { table: "project_change_history", timestampColumn: "changed_at" },
  { table: "framework_change_history", timestampColumn: "changed_at" },
  { table: "evidence_hub_change_history", timestampColumn: "changed_at" },
  { table: "control_eu_change_history", timestampColumn: "changed_at" },
  { table: "subcontrol_eu_change_history", timestampColumn: "changed_at" },
  { table: "annex_category_change_history", timestampColumn: "changed_at" },
  { table: "project_risk_change_history", timestampColumn: "changed_at" },
  { table: "vendor_risk_change_history", timestampColumn: "changed_at" },
  { table: "policy_change_history", timestampColumn: "changed_at" },
  { table: "incident_change_history", timestampColumn: "changed_at" },
  { table: "file_change_history", timestampColumn: "changed_at" },
  { table: "model_lifecycle_change_history", timestampColumn: "created_at" },
  { table: "task_change_history", timestampColumn: "changed_at" },
  { table: "training_change_history", timestampColumn: "changed_at" },
  { table: "model_risk_change_history", timestampColumn: "changed_at" },
  { table: "dataset_change_histories", timestampColumn: "changed_at" },
  { table: "ai_gateway_endpoint_change_history", timestampColumn: "changed_at" },
  { table: "ai_gateway_guardrail_change_history", timestampColumn: "changed_at" },
  { table: "fria_change_history", timestampColumn: "changed_at" },
  { table: "ai_action_audit_log", timestampColumn: "created_at" },
  { table: "file_access_logs", timestampColumn: "access_date" },
  { table: "jira_incident_sync_events", timestampColumn: "created_at" },
];

type AuditTable = (typeof AUDIT_RECORD_TABLES)[number];

/**
 * Rows affected by a raw (untyped) DELETE: sequelize returns `[rows, result]`
 * with the pg result's `rowCount`, or a bare number for typed queries.
 */
export function deletedRowCount(meta: unknown): number {
  if (typeof meta === "number") return meta;
  return Number((meta as { rowCount?: number } | null | undefined)?.rowCount ?? 0);
}

export async function getAuditRetentionMonths(organizationId: number): Promise<number | null> {
  const rows = (await sequelize.query(
    `SELECT audit_retention_months FROM data_retention_settings WHERE organization_id = :organizationId`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as { audit_retention_months: number | null }[];
  return rows.length > 0 && rows[0].audit_retention_months !== null
    ? Number(rows[0].audit_retention_months)
    : null;
}

/** Every org with an audit retention period set, in one read for the daily job. */
export async function getOrgsWithAuditRetention(): Promise<
  { organizationId: number; months: number }[]
> {
  const rows = (await sequelize.query(
    `SELECT organization_id, audit_retention_months FROM data_retention_settings
      WHERE audit_retention_months IS NOT NULL ORDER BY organization_id`,
    { type: QueryTypes.SELECT },
  )) as { organization_id: number; audit_retention_months: number }[];
  return rows.map((r) => ({
    organizationId: Number(r.organization_id),
    months: Number(r.audit_retention_months),
  }));
}

export async function setAuditRetentionMonths(
  organizationId: number,
  months: number | null,
  userId: number | null,
): Promise<void> {
  await sequelize.query(
    `INSERT INTO data_retention_settings (organization_id, audit_retention_months, updated_at, updated_by)
     VALUES (:organizationId, :months, now(), :userId)
     ON CONFLICT (organization_id) DO UPDATE
       SET audit_retention_months = EXCLUDED.audit_retention_months,
           updated_at = now(),
           updated_by = EXCLUDED.updated_by`,
    { replacements: { organizationId, months, userId } },
  );
}

/** The cutoff timestamp for a period, computed in SQL (one source of truth). */
export async function getAuditCutoff(months: number): Promise<string> {
  const rows = (await sequelize.query(
    `SELECT (now() - make_interval(months => :months))::text AS cutoff`,
    { replacements: { months }, type: QueryTypes.SELECT },
  )) as { cutoff: string }[];
  return rows[0].cutoff;
}

/** Look the entry up by value so only listed names ever reach SQL. */
function resolveAuditTable(entry: { table: string; timestampColumn: string }): AuditTable {
  const found = AUDIT_RECORD_TABLES.find(
    (t) => t.table === entry.table && t.timestampColumn === entry.timestampColumn,
  );
  if (!found) throw new Error(`Not an audit record table: ${entry.table}`);
  return found;
}

/**
 * Whether an audit table exists in this deployment (some are created by
 * optional features). Inside a transaction, pass it so the check runs on the
 * same connection instead of borrowing a second one from the pool.
 */
export async function auditTableExists(
  entry: { table: string; timestampColumn: string },
  transaction?: Transaction,
): Promise<boolean> {
  const { table } = resolveAuditTable(entry);
  // Unqualified: to_regclass resolves through search_path, like the queries
  // that then use the table.
  const exists = (await sequelize.query(`SELECT to_regclass(:table) AS reg`, {
    replacements: { table },
    type: QueryTypes.SELECT,
    transaction,
  })) as { reg: string | null }[];
  return Boolean(exists[0]?.reg);
}

/**
 * Delete up to `batchSize` of the oldest rows older than `cutoff` from one
 * audit table for one org. Returns the rows deleted. The table must exist:
 * callers check with auditTableExists first (the daily job checks once per
 * table per run).
 */
export async function deleteAuditRowsBatch(
  organizationId: number,
  entry: { table: string; timestampColumn: string },
  cutoff: string,
  batchSize: number,
): Promise<number> {
  const { table, timestampColumn } = resolveAuditTable(entry);
  return sequelize.transaction(async (transaction) => {
    await sequelize.query(`SELECT set_config('app.current_org', :org, true)`, {
      replacements: { org: String(organizationId) },
      type: QueryTypes.SELECT,
      transaction,
    });
    const [, meta] = (await sequelize.query(
      `DELETE FROM ${table} WHERE ctid IN (
         SELECT ctid FROM ${table}
          WHERE organization_id = :organizationId AND ${timestampColumn} < :cutoff
          ORDER BY ${timestampColumn} LIMIT :batchSize)`,
      { replacements: { organizationId, cutoff, batchSize }, transaction },
    )) as [unknown, unknown];
    return deletedRowCount(meta);
  });
}

/**
 * How many audit records a prune with this period would delete right now:
 * ledger rows below the same bound the prune uses, plus aged-out rows in each
 * existing audit table. Read-only.
 */
export async function countAuditRecordsBefore(
  organizationId: number,
  months: number,
): Promise<number> {
  const cutoff = await getAuditCutoff(months);
  return sequelize.transaction(async (transaction) => {
    await sequelize.query(`SELECT set_config('app.current_org', :org, true)`, {
      replacements: { org: String(organizationId) },
      type: QueryTypes.SELECT,
      transaction,
    });
    const ledger = (await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM audit_ledger
        WHERE organization_id = :organizationId
          AND id < COALESCE(
            (SELECT MIN(id) FROM audit_ledger WHERE organization_id = :organizationId AND occurred_at >= :cutoff),
            (SELECT MAX(id) FROM audit_ledger WHERE organization_id = :organizationId))`,
      { replacements: { organizationId, cutoff }, type: QueryTypes.SELECT, transaction },
    )) as { n: number }[];
    const total = Number(ledger[0]?.n ?? 0);

    // One existence check and one count for all tables, instead of two
    // queries per table. Table and column names come only from
    // AUDIT_RECORD_TABLES.
    const present = (await sequelize.query(
      `SELECT name FROM unnest(ARRAY[:tables]::text[]) AS name
        WHERE to_regclass(name) IS NOT NULL`,
      {
        replacements: { tables: AUDIT_RECORD_TABLES.map((t) => t.table) },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as { name: string }[];
    const presentNames = new Set(present.map((r) => r.name));
    const tables = AUDIT_RECORD_TABLES.filter((t) => presentNames.has(t.table));
    if (tables.length === 0) return total;

    const counts = tables
      .map(
        ({ table, timestampColumn }) =>
          `SELECT COUNT(*) AS n FROM ${table}
            WHERE organization_id = :organizationId AND ${timestampColumn} < :cutoff`,
      )
      .join("\n UNION ALL\n ");
    const rows = (await sequelize.query(
      `SELECT COALESCE(SUM(n), 0)::int AS n FROM (${counts}) AS per_table`,
      { replacements: { organizationId, cutoff }, type: QueryTypes.SELECT, transaction },
    )) as { n: number }[];
    return total + Number(rows[0]?.n ?? 0);
  });
}

export interface RetentionRunInput {
  organizationId: number;
  recordType: RetentionRecordType;
  cutoff: string | null;
  deletedCount: number;
  status: RetentionRunStatus;
  error?: string | null;
  /** Machine-readable failure reason, e.g. "internal_key_not_configured". */
  errorCode?: string | null;
}

/**
 * Set after the first "error_code does not exist" error, so later inserts and
 * reads go straight to the fallback instead of failing first each time.
 * Migrations can run outside this process (another container, a manual
 * migrate), so while the flag is set the column is looked up again at most
 * once every ERROR_CODE_RECHECK_MS; once it exists, codes are used again.
 */
export const ERROR_CODE_RECHECK_MS = 10 * 60 * 1000;
let errorCodeColumnMissing = false;
let errorCodeColumnCheckedAt = 0;

/** Test hook: forget a cached "error_code column missing". */
export function resetErrorCodeColumnCache(): void {
  errorCodeColumnMissing = false;
  errorCodeColumnCheckedAt = 0;
}

function markErrorCodeColumnMissing(): void {
  errorCodeColumnMissing = true;
  errorCodeColumnCheckedAt = Date.now();
}

/**
 * Whether to skip error_code. While the column is known to be missing, check
 * again once the recheck interval has passed; a failed check keeps skipping.
 */
async function skipErrorCodeColumn(): Promise<boolean> {
  if (!errorCodeColumnMissing) return false;
  if (Date.now() - errorCodeColumnCheckedAt < ERROR_CODE_RECHECK_MS) return true;
  errorCodeColumnCheckedAt = Date.now();
  try {
    // Resolve the table as every other retention query does (to_regclass of
    // the unqualified name, through search_path), then look for the column.
    const rows = (await sequelize.query(
      `SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('data_retention_runs')
          AND attname = 'error_code'
          AND attnum > 0
          AND NOT attisdropped`,
      { type: QueryTypes.SELECT },
    )) as unknown[];
    if (rows.length > 0) errorCodeColumnMissing = false;
  } catch {
    // Keep skipping; try again after the next interval.
  }
  return errorCodeColumnMissing;
}

/** Postgres "undefined_column": the error_code migration has not run yet. */
function isMissingErrorCodeColumn(error: unknown): boolean {
  const code =
    (error as { parent?: { code?: string }; original?: { code?: string } } | null)?.parent?.code ??
    (error as { original?: { code?: string } } | null)?.original?.code;
  return code === "42703" && String((error as Error)?.message ?? "").includes("error_code");
}

export async function recordRetentionRun(row: RetentionRunInput): Promise<void> {
  const replacements = {
    organizationId: row.organizationId,
    recordType: row.recordType,
    cutoff: row.cutoff,
    deletedCount: row.deletedCount,
    status: row.status,
    error: row.error ?? null,
    errorCode: row.errorCode ?? null,
  };
  const insertWithoutCode = () =>
    sequelize.query(
      `INSERT INTO data_retention_runs
         (organization_id, record_type, cutoff, deleted_count, status, error)
       VALUES (:organizationId, :recordType, :cutoff, :deletedCount, :status, :error)`,
      { replacements },
    );
  if (await skipErrorCodeColumn()) {
    await insertWithoutCode();
    return;
  }
  try {
    await sequelize.query(
      `INSERT INTO data_retention_runs
         (organization_id, record_type, cutoff, deleted_count, status, error, error_code)
       VALUES (:organizationId, :recordType, :cutoff, :deletedCount, :status, :error, :errorCode)`,
      { replacements },
    );
  } catch (error) {
    // The worker can start before migrations run (start.sh launches it first,
    // and worker containers never migrate). Without the column, record the
    // run without its code; the error text still names the reason.
    if (!isMissingErrorCodeColumn(error)) throw error;
    markErrorCodeColumnMissing();
    await insertWithoutCode();
  }
}

/**
 * Record a retention run without ever failing the cleanup that ran: a
 * recording failure is logged only. `error` may be an Error, a message or
 * absent; it is stored as its message.
 */
export async function safeRecordRetentionRun(
  run: Omit<RetentionRunInput, "error"> & { error?: unknown },
): Promise<void> {
  const { error, ...rest } = run;
  try {
    await recordRetentionRun({
      ...rest,
      error: error == null ? null : error instanceof Error ? error.message : String(error),
    });
  } catch (recordError) {
    logger.error(
      `Recording ${run.recordType} retention run failed for org ${run.organizationId}:`,
      recordError,
    );
  }
}

/** Run history older than this is deleted, except each type's latest run per org. */
export const RETENTION_RUN_HISTORY_MONTHS = 13;

/**
 * Delete data_retention_runs rows older than 13 months, keeping the latest row
 * per (organization, record type) so the settings page always has a last run
 * to show. Batched per org like the audit deletes. Returns the rows deleted.
 */
export async function pruneRetentionRunHistory(): Promise<number> {
  const orgs = (await sequelize.query(
    `SELECT DISTINCT organization_id FROM data_retention_runs
      WHERE ran_at < now() - make_interval(months => :months)
      ORDER BY organization_id`,
    { replacements: { months: RETENTION_RUN_HISTORY_MONTHS }, type: QueryTypes.SELECT },
  )) as { organization_id: number }[];

  let total = 0;
  for (const { organization_id } of orgs) {
    const organizationId = Number(organization_id);
    for (let batches = 0; batches < RETENTION_MAX_BATCHES; batches++) {
      const deleted = await sequelize.transaction(async (transaction) => {
        await sequelize.query(`SELECT set_config('app.current_org', :org, true)`, {
          replacements: { org: String(organizationId) },
          type: QueryTypes.SELECT,
          transaction,
        });
        const [, meta] = (await sequelize.query(
          `DELETE FROM data_retention_runs WHERE id IN (
             SELECT r.id FROM data_retention_runs r
              WHERE r.organization_id = :organizationId
                AND r.ran_at < now() - make_interval(months => :months)
                AND r.id <> (
                  SELECT l.id FROM data_retention_runs l
                   WHERE l.organization_id = r.organization_id AND l.record_type = r.record_type
                   ORDER BY l.ran_at DESC, l.id DESC LIMIT 1)
              ORDER BY r.ran_at LIMIT :batchSize)`,
          {
            replacements: {
              organizationId,
              months: RETENTION_RUN_HISTORY_MONTHS,
              batchSize: RETENTION_BATCH_SIZE,
            },
            transaction,
          },
        )) as [unknown, unknown];
        return deletedRowCount(meta);
      });
      total += deleted;
      if (deleted < RETENTION_BATCH_SIZE) break;
    }
  }
  return total;
}

/**
 * Organizations that opted in to automatic AI Gateway log deletion, read
 * straight from the gateway's settings table (same database). The daily job
 * asks the gateway to purge each of them in turn. Empty when the table
 * does not exist in this deployment.
 */
export async function getGatewayAutoPurgeOrgIds(): Promise<number[]> {
  const exists = (await sequelize.query(
    `SELECT to_regclass('ai_gateway_guardrail_settings') AS reg`,
    { type: QueryTypes.SELECT },
  )) as { reg: string | null }[];
  if (!exists[0]?.reg) return [];
  const rows = (await sequelize.query(
    `SELECT organization_id FROM ai_gateway_guardrail_settings
      WHERE auto_purge_enabled ORDER BY organization_id`,
    { type: QueryTypes.SELECT },
  )) as { organization_id: number }[];
  return rows.map((r) => Number(r.organization_id));
}

export type LatestRetentionRuns = Record<
  RetentionRecordType,
  | {
      ran_at: string;
      deleted_count: number;
      status: RetentionRunStatus;
      error: string | null;
      error_code: string | null;
    }
  | undefined
>;

export async function getLatestRetentionRuns(organizationId: number): Promise<LatestRetentionRuns> {
  const latestRuns = (withErrorCode: boolean) =>
    sequelize.query(
      `SELECT DISTINCT ON (record_type) record_type, ran_at, deleted_count, status, error${
        withErrorCode ? ", error_code" : ""
      }
         FROM data_retention_runs
        WHERE organization_id = :organizationId
        ORDER BY record_type, ran_at DESC, id DESC`,
      { replacements: { organizationId }, type: QueryTypes.SELECT },
    );
  let rows: any[];
  if (await skipErrorCodeColumn()) {
    rows = (await latestRuns(false)) as any[];
  } else {
    try {
      rows = (await latestRuns(true)) as any[];
    } catch (error) {
      // Before the error_code migration has run: read the runs without codes.
      if (!isMissingErrorCodeColumn(error)) throw error;
      markErrorCodeColumnMissing();
      rows = (await latestRuns(false)) as any[];
    }
  }
  const result = {} as LatestRetentionRuns;
  for (const r of rows) {
    result[r.record_type as RetentionRecordType] = {
      ran_at: r.ran_at instanceof Date ? r.ran_at.toISOString() : String(r.ran_at),
      deleted_count: Number(r.deleted_count),
      status: r.status,
      error: r.error ?? null,
      error_code: r.error_code ?? null,
    };
  }
  return result;
}
