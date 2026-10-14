import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import { SyncValidationError } from "./errors";
import { statusKinds } from "./registry";
import { DUE_RUNS_SQL } from "./sql";
import type { SyncProvider } from "./types";

export const INTERVAL_MIN_HOURS = 1;
export const INTERVAL_MAX_HOURS = 168;
export const DEFAULT_INTERVAL_HOURS = 24;
export const INTERVAL_MESSAGE = `Sync interval must be a whole number of hours between ${INTERVAL_MIN_HOURS} and ${INTERVAL_MAX_HOURS}`;

export interface ScheduleView {
  enabled: boolean;
  interval_hours: number;
  consecutive_failures: number;
  failing_since: Date | null;
}

export interface SchedulePatch {
  enabled?: boolean;
  intervalHours?: number;
}

/** A whole number of hours from 1 to 168; numeric strings are accepted (a select can hand one back). */
export function parseIntervalHours(raw: unknown): number {
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw.trim()) : raw;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < INTERVAL_MIN_HOURS ||
    value > INTERVAL_MAX_HOURS
  ) {
    throw new SyncValidationError(INTERVAL_MESSAGE);
  }
  return value;
}

/** `{ enabled?, interval_hours? }` from a request body; at least one field. */
export function parseSchedulePatch(body: unknown): SchedulePatch {
  const b = (body ?? {}) as { enabled?: unknown; interval_hours?: unknown };
  const hasEnabled = b.enabled !== undefined;
  const hasInterval = b.interval_hours !== undefined;
  if (!hasEnabled && !hasInterval) {
    throw new SyncValidationError("Provide enabled or interval_hours");
  }
  if (hasEnabled && typeof b.enabled !== "boolean") {
    throw new SyncValidationError("enabled must be true or false");
  }
  return {
    enabled: hasEnabled ? (b.enabled as boolean) : undefined,
    intervalHours: hasInterval ? parseIntervalHours(b.interval_hours) : undefined,
  };
}

const SCHEDULE_COLUMNS = "enabled, interval_hours, consecutive_failures, failing_since";

export async function getSchedule(key: string, orgId: number): Promise<ScheduleView | null> {
  const rows = (await sequelize.query(
    `SELECT ${SCHEDULE_COLUMNS} FROM extension_sync_settings
      WHERE organization_id = :orgId AND extension_key = :key
      LIMIT 1;`,
    { replacements: { orgId, key }, type: QueryTypes.SELECT },
  )) as ScheduleView[];
  return rows[0] ?? null;
}

/**
 * Change the fields given; a new row starts disabled at 24 hours. `userId`
 * records who made the change (null for the system).
 */
export async function saveSchedule(
  key: string,
  orgId: number,
  patch: SchedulePatch,
  { userId, transaction }: { userId: number | null; transaction?: Transaction },
): Promise<ScheduleView> {
  const [rows] = (await sequelize.query(
    `INSERT INTO extension_sync_settings
       (organization_id, extension_key, enabled, interval_hours, updated_by)
     VALUES (:orgId, :key, COALESCE(:enabled, FALSE), COALESCE(:intervalHours, :defaultInterval),
             :userId)
     ON CONFLICT (organization_id, extension_key) DO UPDATE
        SET enabled = COALESCE(:enabled, extension_sync_settings.enabled),
            interval_hours = COALESCE(:intervalHours, extension_sync_settings.interval_hours),
            updated_at = now(),
            updated_by = :userId
     RETURNING ${SCHEDULE_COLUMNS};`,
    {
      replacements: {
        orgId,
        key,
        enabled: patch.enabled ?? null,
        intervalHours: patch.intervalHours ?? null,
        defaultInterval: DEFAULT_INTERVAL_HOURS,
        userId,
      },
      transaction,
    },
  )) as unknown as [ScheduleView[], unknown];
  return rows[0];
}

/**
 * A scheduled run failed or was abandoned: one more failure in the streak. The
 * first failure of a streak sets failing_since to that run's start.
 */
export async function recordFailureForSchedule(
  key: string,
  orgId: number,
  startedAt: Date,
  transaction?: Transaction,
): Promise<void> {
  await sequelize.query(
    `UPDATE extension_sync_settings
        SET consecutive_failures = consecutive_failures + 1,
            failing_since = COALESCE(failing_since, :startedAt),
            updated_at = now()
      WHERE organization_id = :orgId AND extension_key = :key;`,
    { replacements: { orgId, key, startedAt }, transaction },
  );
}

/** A manual or scheduled run completed: the streak is over. */
export async function resetScheduleFailures(
  key: string,
  orgId: number,
  transaction?: Transaction,
): Promise<void> {
  await sequelize.query(
    `UPDATE extension_sync_settings
        SET consecutive_failures = 0, failing_since = NULL, updated_at = now()
      WHERE organization_id = :orgId AND extension_key = :key
        AND (consecutive_failures <> 0 OR failing_since IS NOT NULL);`,
    { replacements: { orgId, key }, transaction },
  );
}

/** Orgs due for the provider's scheduled run (DUE_RUNS_SQL). */
export async function findDueRuns(
  provider: SyncProvider,
): Promise<Array<{ organization_id: number }>> {
  if (!provider.scheduledKind) return [];
  return (await sequelize.query(DUE_RUNS_SQL, {
    replacements: { key: provider.key, statusKinds: statusKinds(provider) },
    type: QueryTypes.SELECT,
  })) as Array<{ organization_id: number }>;
}
