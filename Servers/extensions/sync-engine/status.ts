import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { getSyncProvider, statusKinds } from "./registry";
import { getSchedule, type ScheduleView } from "./schedule";
import { sqlLastFinishedRun, sqlLiveRunExists, sqlRunIsLive } from "./sql";
import type { RunStatus } from "./types";

/** A live `started` run of this extension exists for the org. */
export async function hasLiveRun(key: string, orgId: number): Promise<boolean> {
  const rows = (await sequelize.query(`SELECT ${sqlLiveRunExists(":key", ":orgId")} AS live;`, {
    replacements: { key, orgId },
    type: QueryTypes.SELECT,
  })) as Array<{ live: boolean }>;
  return !!rows[0]?.live;
}

/** Id of the newest run of a status kind, so a client can tell when a newer one finishes. */
export async function latestStatusRunId(key: string, orgId: number): Promise<number | null> {
  const kinds = statusKinds(getSyncProvider(key));
  const rows = (await sequelize.query(
    `SELECT id FROM extension_sync_runs
      WHERE organization_id = :orgId AND extension_key = :key AND kind IN (:kinds)
      ORDER BY started_at DESC, id DESC
      LIMIT 1;`,
    { replacements: { orgId, key, kinds }, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  return rows[0]?.id ?? null;
}

export const RUNS_DEFAULT_LIMIT = 20;
export const RUNS_MAX_LIMIT = 200;

/** `?limit=`: a whole number of at least 1, capped at 200; anything else is 20. */
export function parseRunsLimit(raw: unknown): number {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const value =
    typeof first === "string" && /^\d+$/.test(first.trim())
      ? Number(first.trim())
      : typeof first === "number"
        ? first
        : Number.NaN;
  if (!Number.isInteger(value) || value < 1) return RUNS_DEFAULT_LIMIT;
  return Math.min(value, RUNS_MAX_LIMIT);
}

/** A run as the status route reports it (built by row_to_json, so timestamps are strings). */
export interface RunView {
  id: number;
  kind: string;
  status: RunStatus;
  code: string | null;
  counts: Record<string, number>;
  message: string | null;
  started_at: string;
  completed_at: string | null;
  is_live: boolean;
}

export interface RunStatusView {
  schedule: ScheduleView | null;
  running: boolean;
  /** Newest run of a status kind, whatever its status. */
  latest_run: RunView | null;
  /** Newest completed or failed run of a status kind (skips and abandoned runs never count). */
  last_finished_run: RunView | null;
}

const RUN_VIEW_COLUMNS = `r.id, r.kind, r.status, r.code, r.counts, r.message, r.started_at,
         r.completed_at, (r.status = 'started' AND ${sqlRunIsLive("r")}) AS is_live`;

export async function getRunStatus(key: string, orgId: number): Promise<RunStatusView> {
  const kinds = statusKinds(getSyncProvider(key));
  const [schedule, rows] = await Promise.all([
    getSchedule(key, orgId),
    sequelize.query(
      `SELECT ${sqlLiveRunExists(":key", ":orgId")} AS running,
              (SELECT row_to_json(x) FROM (
                 SELECT ${RUN_VIEW_COLUMNS}
                   FROM extension_sync_runs r
                  WHERE r.organization_id = :orgId AND r.extension_key = :key
                    AND r.kind IN (:kinds)
                  ORDER BY r.started_at DESC, r.id DESC
                  LIMIT 1) x) AS latest_run,
              (SELECT row_to_json(x) FROM (
                 ${sqlLastFinishedRun(":orgId", ":key", ":kinds", RUN_VIEW_COLUMNS)}
               ) x) AS last_finished_run;`,
      { replacements: { key, orgId, kinds }, type: QueryTypes.SELECT },
    ) as unknown as Promise<
      Array<{ running: boolean; latest_run: RunView | null; last_finished_run: RunView | null }>
    >,
  ]);
  const row = rows[0];
  return {
    schedule,
    running: !!row?.running,
    latest_run: row?.latest_run ?? null,
    last_finished_run: row?.last_finished_run ?? null,
  };
}

export interface RunListRow {
  id: number;
  kind: string;
  status: RunStatus;
  code: string | null;
  counts: Record<string, number>;
  message: string | null;
  triggered_by: number | null;
  started_at: Date;
  heartbeat_at: Date | null;
  completed_at: Date | null;
}

/** Every run of the extension for the org, newest first. Tokens are never returned. */
export async function listRuns(key: string, orgId: number, limit: number): Promise<RunListRow[]> {
  return (await sequelize.query(
    `SELECT r.id, r.kind, r.status, r.code, r.counts, r.message, r.triggered_by,
            r.started_at, r.heartbeat_at, r.completed_at
       FROM extension_sync_runs r
      WHERE r.organization_id = :orgId AND r.extension_key = :key
      ORDER BY r.started_at DESC, r.id DESC
      LIMIT :limit;`,
    { replacements: { orgId, key, limit }, type: QueryTypes.SELECT },
  )) as RunListRow[];
}
