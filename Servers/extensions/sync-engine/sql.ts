/**
 * Pure SQL fragments for the sync engine. No database import, so the
 * throwaway-Postgres check scripts can load this file with ts-node. Only
 * trusted expressions (column names, bind parameters) are interpolated;
 * sqlOwnsRunFragment validates its values before inlining them.
 */
import { BACKOFF_CAP_HOURS, STALE_AFTER_MINUTES } from "./types";

const ALIAS_PATTERN = /^[a-z_][a-z0-9_]*$/;
const TOKEN_PATTERN = /^[0-9a-f-]{36}$/;

function assertAlias(alias: string): void {
  if (!ALIAS_PATTERN.test(alias)) throw new Error(`Invalid SQL alias "${alias}"`);
}

/** SQL: run row `alias` has a heartbeat (else start) inside the stale window. */
export function sqlRunIsLive(alias: string): string {
  assertAlias(alias);
  return `(COALESCE(${alias}.heartbeat_at, ${alias}.started_at) >= now() - make_interval(mins => ${STALE_AFTER_MINUTES}))`;
}

/** SQL: a live `started` run exists for extension `keyExpr` in org `orgExpr`. */
export function sqlLiveRunExists(keyExpr: string, orgExpr: string): string {
  return `EXISTS (SELECT 1 FROM extension_sync_runs live
                   WHERE live.organization_id = ${orgExpr} AND live.extension_key = ${keyExpr}
                     AND live.status = 'started' AND ${sqlRunIsLive("live")})`;
}

export interface OwnedRunRef {
  runId: number;
  orgId: number;
  token: string;
}

/**
 * SQL boolean: the run still owns its `started` row. FOR SHARE holds the row
 * until the statement's transaction ends, so a claim closing it as abandoned
 * must wait: writes guarded by this cannot land after the claim was lost.
 */
export function sqlOwnsRunFragment(run: OwnedRunRef, alias = "own"): string {
  assertAlias(alias);
  if (
    !Number.isInteger(run.runId) ||
    run.runId <= 0 ||
    !Number.isInteger(run.orgId) ||
    run.orgId <= 0 ||
    !TOKEN_PATTERN.test(run.token)
  ) {
    throw new Error("Invalid run reference");
  }
  return `EXISTS (SELECT 1 FROM extension_sync_runs ${alias}
                   WHERE ${alias}.id = ${run.runId} AND ${alias}.organization_id = ${run.orgId}
                     AND ${alias}.run_token = '${run.token}' AND ${alias}.status = 'started'
                   FOR SHARE)`;
}

/**
 * Doubling stops at this exponent: 2^(6-1) = 32 h already exceeds the 24 h
 * cap, and an unclamped power(2, n) overflows Postgres float8 near n = 1024,
 * which would fail the tick for every organization.
 */
const BACKOFF_MAX_EXPONENT = 6;

/** Hours to wait after `n` consecutive scheduled failures: 0, 1, 2, 4, 8, 16, then 24. */
export function backoffHours(consecutiveFailures: number): number {
  if (!Number.isFinite(consecutiveFailures) || consecutiveFailures <= 0) return 0;
  return Math.min(
    2 ** (Math.min(consecutiveFailures, BACKOFF_MAX_EXPONENT) - 1),
    BACKOFF_CAP_HOURS,
  );
}

/** SQL mirror of backoffHours for the settings row `alias`. */
export function sqlBackoffHours(alias: string): string {
  assertAlias(alias);
  return `(CASE WHEN ${alias}.consecutive_failures <= 0 THEN 0
                ELSE LEAST(power(2, LEAST(${alias}.consecutive_failures, ${BACKOFF_MAX_EXPONENT}) - 1), ${BACKOFF_CAP_HOURS})::int
           END)`;
}

/**
 * The tick's discovery query for one extension (:key): every org whose
 * schedule is on, whose extension is enabled (jobs bypass
 * requireExtensionEnabled, so the join is the enablement check), with no live
 * run, and whose due time has passed. `last_run` is the newest start of a
 * run of a status kind (:statusKinds) that was not skipped. Skipped rows are
 * not runs, so they never count; the filter is on status, not run_token,
 * because history copied from jira_assets_sync_history has no tokens and must
 * still count (else every migrated org looks never-synced and runs at once). Due when there is no last run, or when
 * GREATEST(interval_hours, backoff) hours have passed since it. Nothing is
 * stored ahead of time, so an interval change applies on the next tick. This
 * system query spans organizations by design; every subquery is correlated on
 * the row's own organization_id.
 */
export const DUE_RUNS_SQL = `
  SELECT s.organization_id
    FROM extension_sync_settings s
    JOIN extensions e ON e.key = s.extension_key
    JOIN extension_enablements ee
      ON ee.extension_id = e.id
     AND ee.organization_id = s.organization_id
     AND ee.enabled = TRUE
    LEFT JOIN LATERAL (
      SELECT MAX(r.started_at) AS last_run
        FROM extension_sync_runs r
       WHERE r.organization_id = s.organization_id AND r.extension_key = s.extension_key
         AND r.kind IN (:statusKinds) AND r.status <> 'skipped'
    ) lr ON TRUE
   WHERE s.extension_key = :key
     AND s.enabled = TRUE
     AND NOT ${sqlLiveRunExists("s.extension_key", "s.organization_id")}
     AND (lr.last_run IS NULL
          OR now() >= lr.last_run
                      + make_interval(hours => GREATEST(s.interval_hours, ${sqlBackoffHours("s")})))
   ORDER BY s.organization_id;`;

/**
 * SQL: the newest run of the given kinds (`kindsExpr`, a bind list or literal
 * list) that completed or failed, for org `orgExpr` and extension `keyExpr`.
 * Abandoned and skipped runs never count, so they never replace the last
 * finished sync (GET /config's last_sync_*, the status route's
 * last_finished_run). `columns` reads from alias `r`.
 */
export function sqlLastFinishedRun(
  orgExpr: string,
  keyExpr: string,
  kindsExpr: string,
  columns: string,
): string {
  return `SELECT ${columns}
            FROM extension_sync_runs r
           WHERE r.organization_id = ${orgExpr} AND r.extension_key = ${keyExpr}
             AND r.kind IN (${kindsExpr}) AND r.status IN ('completed', 'failed')
           ORDER BY r.completed_at DESC, r.id DESC
           LIMIT 1`;
}
