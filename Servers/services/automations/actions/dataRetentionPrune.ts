import { appendToAuditLedger } from "../../../utils/auditLedger.utils";
import { pruneAuditLedgerBatch } from "../../../utils/auditLedgerRetention.utils";
import {
  AUDIT_RECORD_TABLES,
  RETENTION_BATCH_SIZE,
  RETENTION_MAX_BATCHES,
  auditTableExists,
  deleteAuditRowsBatch,
  getAuditCutoff,
  getAuditRetentionMonths,
  getGatewayAutoPurgeOrgIds,
  getOrgsWithAuditRetention,
  pruneRetentionRunHistory,
  safeRecordRetentionRun,
} from "../../../utils/dataRetention.utils";
import { aiGatewayRequest } from "../../../utils/aiGatewayInternal.utils";
import {
  GATEWAY_PURGE_REFUSALS,
  GatewayPurgeRefusal,
  gatewayPurgeRefusalFor,
} from "../../../utils/aiGatewayRetention.constants";
import logger from "../../../utils/logger/fileLogger";

/**
 * Daily audit record retention. An org with no audit retention period is
 * skipped entirely. Otherwise the hash-chained ledger is pruned from its
 * oldest end (with checkpoints), then each audit table by timestamp, in
 * batches of 10k capped at 500 batches per table; the daily job picks up any
 * remainder the next day. One `audit_records` run is recorded per org.
 */

export interface DataRetentionSummary {
  organization_id: number;
  cutoff: string;
  deleted: number;
  capped: boolean;
}

/** Whether each audit table exists, checked once per table per run rather than per batch. */
export type AuditTableExistsCache = Map<string, boolean>;

/**
 * Prune one org. `months` is the org's period when the caller already read it
 * (the daily job reads every org's period in one query); otherwise it is read
 * here.
 */
export async function runDataRetentionPrune(
  organizationId: number,
  months?: number | null,
  tableExists: AuditTableExistsCache = new Map(),
): Promise<DataRetentionSummary | null> {
  let cutoff: string | null = null;
  let deleted = 0;
  let capped = false;
  const failures: { name: string; error: unknown }[] = [];

  try {
    const period = months === undefined ? await getAuditRetentionMonths(organizationId) : months;
    if (period === null) return null;
    cutoff = await getAuditCutoff(period);
  } catch (error) {
    await recordAuditRun(organizationId, cutoff, 0, "failed", error);
    throw error;
  }
  const runCutoff = cutoff;

  const drain = async (name: string, deleteBatch: () => Promise<number>) => {
    try {
      for (let batches = 0; ; batches++) {
        if (batches >= RETENTION_MAX_BATCHES) {
          capped = true;
          return;
        }
        const n = await deleteBatch();
        deleted += n;
        if (n < RETENTION_BATCH_SIZE) return;
      }
    } catch (error) {
      // One failing table must not stop the rest of the org's run.
      failures.push({ name, error });
      logger.error(`Audit retention failed for ${name} in org ${organizationId}:`, error);
    }
  };

  await drain("audit_ledger", () =>
    pruneAuditLedgerBatch(organizationId, runCutoff, RETENTION_BATCH_SIZE),
  );
  for (const entry of AUDIT_RECORD_TABLES) {
    await drain(entry.table, async () => {
      let exists = tableExists.get(entry.table);
      if (exists === undefined) {
        exists = await auditTableExists(entry);
        tableExists.set(entry.table, exists);
      }
      if (!exists) return 0;
      return deleteAuditRowsBatch(organizationId, entry, runCutoff, RETENTION_BATCH_SIZE);
    });
  }

  if (deleted > 0) {
    try {
      await appendToAuditLedger({
        organizationId,
        entryType: "event_log",
        userId: null,
        eventType: "Delete",
        entityType: "audit_ledger",
        description: `Retention removed ${deleted} audit records before ${runCutoff.slice(0, 10)}`,
      });
    } catch (error) {
      logger.error(`Retention self-audit entry failed for org ${organizationId}:`, error);
    }
  }

  if (failures.length > 0) {
    const message = failures
      .map((f) => `${f.name}: ${f.error instanceof Error ? f.error.message : String(f.error)}`)
      .join("; ");
    await recordAuditRun(organizationId, runCutoff, deleted, "failed", message);
  } else {
    await recordAuditRun(organizationId, runCutoff, deleted, capped ? "capped" : "success");
  }
  return { organization_id: organizationId, cutoff: runCutoff, deleted, capped };
}

/** Record this org's audit_records run. */
function recordAuditRun(
  organizationId: number,
  cutoff: string | null,
  deletedCount: number,
  status: "success" | "capped" | "failed",
  error?: unknown,
): Promise<void> {
  return safeRecordRetentionRun({
    organizationId,
    recordType: "audit_records",
    cutoff,
    deletedCount,
    status,
    error,
  });
}

/**
 * Prune every org with an audit period -- the BullMQ daily job entry point.
 * One org's failure never blocks the rest. Then AI Gateway logs are purged
 * per opted-in org, and old run history is trimmed.
 */
export async function runDataRetentionPruneAllOrgs(): Promise<void> {
  const organizations = await getOrgsWithAuditRetention();
  const tableExists: AuditTableExistsCache = new Map();
  for (const { organizationId, months } of organizations) {
    try {
      const summary = await runDataRetentionPrune(organizationId, months, tableExists);
      if (summary && (summary.deleted > 0 || summary.capped)) {
        logger.info(
          `Audit retention prune org ${organizationId}: deleted=${summary.deleted} capped=${summary.capped} cutoff=${summary.cutoff}`,
        );
      }
    } catch (error) {
      logger.error(`Audit retention prune failed for org ${organizationId}:`, error);
    }
  }
  await purgeGatewayLogs();
  try {
    const removed = await pruneRetentionRunHistory();
    if (removed > 0) logger.info(`Retention run history: removed ${removed} old runs`);
  } catch (error) {
    logger.error("Pruning retention run history failed:", error);
  }
}

/**
 * One purge call covers one org and at most 100 batches of 1,000 rows per log
 * type, so five minutes is ample.
 */
const GATEWAY_PURGE_TIMEOUT_MS = 300_000;
/** Calls per org per run: 5 x 100 batches = 500 batches per log type. */
const GATEWAY_PURGE_MAX_CALLS = 5;

interface GatewayPurgeResult {
  organization_id: number;
  guardrail_deleted?: number;
  guardrail_capped?: boolean;
  guardrail_error?: string;
  spend_deleted?: number;
  spend_capped?: boolean;
  spend_error?: string;
}

interface GatewayTypeTotal {
  deleted: number;
  capped: boolean;
  error?: string;
  /** Machine-readable reason, set when the gateway refused the purge. */
  errorCode?: string;
}

function gatewayRunStatus(total: GatewayTypeTotal) {
  if (total.error) return "failed" as const;
  return total.capped ? ("capped" as const) : ("success" as const);
}

/**
 * Ask the AI Gateway to purge logs for each org that opted in to automatic
 * deletion, one org at a time. A gateway or recording failure is logged and
 * never fails the job, and one org's failure never affects another's.
 *
 * Exception: a refusal over the internal key applies to the whole
 * deployment, so after the first one the remaining orgs are not sent to the
 * gateway this run. Each of them gets the same failed runs and code, and the
 * refusal is logged once.
 */
async function purgeGatewayLogs(): Promise<void> {
  let orgIds: number[];
  try {
    orgIds = await getGatewayAutoPurgeOrgIds();
  } catch (error) {
    logger.error("Reading AI Gateway auto-purge organizations failed:", error);
    return;
  }
  for (let i = 0; i < orgIds.length; i++) {
    const refusal = await purgeGatewayLogsForOrg(orgIds[i]);
    if (!refusal) continue;
    // Re-read who is still opted in (a local query, no gateway call): an org
    // that turned automatic deletion off since the list was read gets no
    // run, exactly as on the per-org path.
    const remaining = await stillOptedIn(orgIds.slice(i + 1));
    if (remaining.length > 0) {
      logger.error(
        `AI Gateway refused the retention purge (${GATEWAY_PURGE_REFUSALS[refusal]}); ` +
          `not calling it for the ${remaining.length} remaining organization(s) this run.`,
      );
    }
    for (const orgId of remaining) {
      await recordGatewayRuns(orgId, {
        deleted: 0,
        capped: false,
        error: GATEWAY_PURGE_REFUSALS[refusal],
        errorCode: refusal,
      });
    }
    return;
  }
}

/**
 * The given orgs that still have automatic gateway deletion on. If that cannot
 * be read, all of them are kept, so a refusal is never left unrecorded.
 */
async function stillOptedIn(orgIds: number[]): Promise<number[]> {
  if (orgIds.length === 0) return orgIds;
  try {
    const optedIn = new Set(await getGatewayAutoPurgeOrgIds());
    return orgIds.filter((orgId) => optedIn.has(orgId));
  } catch (error) {
    logger.error("Re-reading AI Gateway auto-purge organizations failed:", error);
    return orgIds;
  }
}

/** Record one run per gateway log type with the same outcome. */
async function recordGatewayRuns(
  orgId: number,
  guardrail: GatewayTypeTotal,
  spend: GatewayTypeTotal = guardrail,
): Promise<void> {
  await safeRecordRetentionRun({
    organizationId: orgId,
    recordType: "ai_gateway_guardrail_logs",
    cutoff: null,
    deletedCount: guardrail.deleted,
    status: gatewayRunStatus(guardrail),
    error: guardrail.error,
    errorCode: guardrail.errorCode,
  });
  await safeRecordRetentionRun({
    organizationId: orgId,
    recordType: "ai_gateway_spend_logs",
    cutoff: null,
    deletedCount: spend.deleted,
    status: gatewayRunStatus(spend),
    error: spend.error,
    errorCode: spend.errorCode,
  });
}

/**
 * Call the per-org purge, repeating while a log type is still capped (up to
 * five calls), then record one run per log type: failed if any call errored
 * for that type, capped if still capped after the last call, else success.
 * Returns the refusal when the gateway refused a call over the internal key.
 */
async function purgeGatewayLogsForOrg(orgId: number): Promise<GatewayPurgeRefusal | null> {
  const guardrail: GatewayTypeTotal = { deleted: 0, capped: false };
  const spend: GatewayTypeTotal = { deleted: 0, capped: false };
  let answered = false;
  let refused: GatewayPurgeRefusal | null = null;

  for (let call = 0; call < GATEWAY_PURGE_MAX_CALLS; call++) {
    let result: GatewayPurgeResult | undefined;
    try {
      const response = await aiGatewayRequest("POST", "/internal/retention/purge", {
        body: { organization_id: orgId },
        timeoutMs: GATEWAY_PURGE_TIMEOUT_MS,
      });
      result = Array.isArray(response?.results)
        ? response.results.find((r: GatewayPurgeResult) => r.organization_id === orgId)
        : undefined;
    } catch (error) {
      // A refusal over the internal key is recorded with a clear reason the
      // Data retention page can show; anything else keeps its own message.
      const refusal = gatewayPurgeRefusalFor(error);
      refused = refusal;
      if (refusal) {
        logger.error(
          `AI Gateway retention purge for org ${orgId}: ${GATEWAY_PURGE_REFUSALS[refusal]}. ` +
            "Set the same AI_GATEWAY_INTERNAL_KEY on the backend and the AI Gateway.",
        );
      } else {
        logger.error(`AI Gateway retention purge failed for org ${orgId}:`, error);
      }
      const message = refusal
        ? GATEWAY_PURGE_REFUSALS[refusal]
        : error instanceof Error
          ? error.message
          : String(error);
      if (guardrail.error === undefined && refusal) guardrail.errorCode = refusal;
      if (spend.error === undefined && refusal) spend.errorCode = refusal;
      guardrail.error ??= message;
      spend.error ??= message;
      answered = true;
      break;
    }
    // The org turned automatic deletion off since it was read: nothing to record.
    if (!result) break;
    answered = true;
    guardrail.deleted += result.guardrail_deleted ?? 0;
    guardrail.capped = Boolean(result.guardrail_capped);
    if (result.guardrail_error) guardrail.error ??= result.guardrail_error;
    spend.deleted += result.spend_deleted ?? 0;
    spend.capped = Boolean(result.spend_capped);
    if (result.spend_error) spend.error ??= result.spend_error;

    const more = (t: GatewayTypeTotal) => t.capped && !t.error;
    if (!more(guardrail) && !more(spend)) break;
  }
  if (!answered) return refused;

  await recordGatewayRuns(orgId, guardrail, spend);
  return refused;
}
