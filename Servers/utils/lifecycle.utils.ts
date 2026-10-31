import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  ConfirmationIntervalDays,
  DEFAULT_CONFIRMATION_INTERVAL_DAYS,
  LIFECYCLE_STAGE_LABELS,
  LifecycleStage,
} from "../domain.layer/enums/lifecycle-stage.enum";
import { NotificationEntityType } from "../domain.layer/interfaces/i.notification";
import { recordMultipleFieldChanges } from "./changeHistory.base.utils";

/**
 * Lifecycle of inventory entries (#5187): in review → planned → live → retired,
 * plus the periodic "still live?" confirmation.
 *
 * Everything here is keyed by a LifecycleEntityConfig so AI apps (#5193) can
 * plug in with one more entry in LIFECYCLE_ENTITIES and the same columns
 * (lifecycle_stage, go_live_date, retired_at, last_confirmed_at,
 * last_confirmed_by, confirmation_reminded_at). Table and column names come
 * only from this static config, never from a request.
 */

export interface LifecycleEntityConfig {
  /** Stable key, also used in logs and notification payloads. */
  key: "use_case";
  table: string;
  ownerColumn: string;
  titleColumn: string;
  /** Singular noun for user-facing copy ("use case"). */
  noun: string;
  /** In-app path to the entity, where the owner can confirm. */
  path: (id: number) => string;
  notificationEntityType: NotificationEntityType;
  /**
   * Extra WHERE fragment (alias-free, against `table`) that limits which rows
   * have a lifecycle at all. Organizational projects are not use cases.
   */
  scope?: string;
}

export const LIFECYCLE_ENTITIES: Record<LifecycleEntityConfig["key"], LifecycleEntityConfig> = {
  use_case: {
    key: "use_case",
    table: "projects",
    ownerColumn: "owner",
    titleColumn: "project_title",
    noun: "use case",
    path: (id) => `/project-view?projectId=${id}`,
    notificationEntityType: NotificationEntityType.USE_CASE,
    scope: "is_organizational = false",
  },
};

export const DEPARTMENT_MAX_LENGTH = 255;

export type DepartmentInput = { ok: true; department: string | null } | { ok: false };

/**
 * The one department validator (PATCH endpoint and use case creation):
 * null/undefined → none, otherwise a string, trimmed, empty → none, at most
 * DEPARTMENT_MAX_LENGTH characters.
 */
export function parseDepartment(value: unknown): DepartmentInput {
  if (value === undefined || value === null) return { ok: true, department: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length > DEPARTMENT_MAX_LENGTH) return { ok: false };
  return { ok: true, department: trimmed || null };
}

// ─── Org settings ───────────────────────────────────────────────────────────

export interface LifecycleOrgSettings {
  organization_id: number;
  confirmation_interval_days: ConfirmationIntervalDays;
}

/** Read the org's lifecycle settings; a missing row resolves to defaults. */
export async function getLifecycleOrgSettings(
  organizationId: number,
  transaction?: Transaction,
): Promise<LifecycleOrgSettings> {
  const rows = (await sequelize.query(
    `SELECT organization_id, confirmation_interval_days
       FROM lifecycle_org_settings
      WHERE organization_id = :organizationId
      LIMIT 1`,
    { replacements: { organizationId }, type: QueryTypes.SELECT, transaction },
  )) as LifecycleOrgSettings[];
  return (
    rows[0] ?? {
      organization_id: organizationId,
      confirmation_interval_days: DEFAULT_CONFIRMATION_INTERVAL_DAYS,
    }
  );
}

/** Create-or-update the org's lifecycle settings. Caller validates the value. */
export async function upsertLifecycleOrgSettings(
  organizationId: number,
  confirmationIntervalDays: ConfirmationIntervalDays,
  transaction?: Transaction,
): Promise<LifecycleOrgSettings> {
  const rows = (await sequelize.query(
    `INSERT INTO lifecycle_org_settings (organization_id, confirmation_interval_days)
     VALUES (:organizationId, :days)
     ON CONFLICT (organization_id)
     DO UPDATE SET confirmation_interval_days = EXCLUDED.confirmation_interval_days,
                   updated_at = now()
     RETURNING organization_id, confirmation_interval_days`,
    {
      replacements: { organizationId, days: confirmationIntervalDays },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as LifecycleOrgSettings[];
  return rows[0];
}

// ─── Staleness ──────────────────────────────────────────────────────────────

/**
 * When a live entry's current "still live?" period started: the last
 * confirmation, else the go-live date. last_updated/created_at are a last
 * resort for rows marked live without a date (not possible through the API).
 */
export function confirmationBaselineSql(alias: string): string {
  return `COALESCE(${alias}.last_confirmed_at, ${alias}.go_live_date::timestamptz,
    ${alias}.last_updated, ${alias}.created_at::timestamptz)`;
}

/**
 * The org's "still live?" interval as an SQL expression (the default when the
 * org has no settings row). Binds :organizationId.
 */
export const ORG_INTERVAL_SQL = `COALESCE((SELECT los.confirmation_interval_days
    FROM lifecycle_org_settings los
   WHERE los.organization_id = :organizationId), ${DEFAULT_CONFIRMATION_INTERVAL_DAYS})`;

/**
 * SQL predicate: live, and not confirmed within the interval. `intervalSql`
 * defaults to the :intervalDays replacement; pass ORG_INTERVAL_SQL to read
 * the org setting inside the same query.
 */
export function staleSql(alias: string, intervalSql = ":intervalDays"): string {
  return `(${alias}.lifecycle_stage = '${LifecycleStage.LIVE}'
    AND ${confirmationBaselineSql(alias)} < NOW() - make_interval(days => ${intervalSql}))`;
}

function scopeSql(entity: LifecycleEntityConfig, alias: string): string {
  return entity.scope ? ` AND ${alias}.${entity.scope}` : "";
}

export interface ConfirmationDueRow {
  id: number;
  title: string;
  owner: number;
  baseline: Date | string;
}

/**
 * Live entries that are stale AND have not been reminded in the current
 * period: never reminded, reminded before the last confirmation/go-live, or
 * reminded more than one interval ago. That is "once per period".
 */
export async function findConfirmationsDue(
  entity: LifecycleEntityConfig,
  organizationId: number,
  intervalDays: number,
): Promise<ConfirmationDueRow[]> {
  return (await sequelize.query(
    `SELECT e.id,
            e.${entity.titleColumn} AS title,
            e.${entity.ownerColumn} AS owner,
            ${confirmationBaselineSql("e")} AS baseline
       FROM ${entity.table} e
      WHERE e.organization_id = :organizationId
        AND e.${entity.ownerColumn} IS NOT NULL
        AND ${staleSql("e")}${scopeSql(entity, "e")}
        AND (
          e.confirmation_reminded_at IS NULL
          OR e.confirmation_reminded_at < ${confirmationBaselineSql("e")}
          OR e.confirmation_reminded_at < NOW() - make_interval(days => :intervalDays)
        )
      ORDER BY e.id ASC`,
    { replacements: { organizationId, intervalDays }, type: QueryTypes.SELECT },
  )) as ConfirmationDueRow[];
}

export async function markConfirmationReminded(
  entity: LifecycleEntityConfig,
  organizationId: number,
  id: number,
): Promise<void> {
  await sequelize.query(
    `UPDATE ${entity.table}
        SET confirmation_reminded_at = NOW()
      WHERE organization_id = :organizationId AND id = :id`,
    { replacements: { organizationId, id } },
  );
}

// ─── Transitions ────────────────────────────────────────────────────────────

export interface LifecycleRow {
  id: number;
  owner: number | null;
  lifecycle_stage: LifecycleStage;
  go_live_date: string | null;
  retired_at: Date | null;
  last_confirmed_at: Date | null;
  last_confirmed_by: number | null;
  department: string | null;
}

const RETURNING = `RETURNING id, lifecycle_stage, go_live_date, retired_at,
  last_confirmed_at, last_confirmed_by, department`;

export async function getLifecycleRow(
  entity: LifecycleEntityConfig,
  organizationId: number,
  id: number,
  transaction?: Transaction,
): Promise<LifecycleRow | null> {
  const rows = (await sequelize.query(
    `SELECT id, ${entity.ownerColumn} AS owner, lifecycle_stage, go_live_date, retired_at,
            last_confirmed_at, last_confirmed_by, department
       FROM ${entity.table} e
      WHERE e.organization_id = :organizationId AND e.id = :id${scopeSql(entity, "e")}`,
    { replacements: { organizationId, id }, type: QueryTypes.SELECT, transaction },
  )) as LifecycleRow[];
  return rows[0] ?? null;
}

export type LifecycleAction = "go_live" | "retire" | "confirm";

/** Which stages each action may start from. */
export const ALLOWED_FROM: Record<LifecycleAction, LifecycleStage[]> = {
  go_live: [LifecycleStage.PLANNED],
  // A planned entry that is dropped before launch is retired too.
  retire: [LifecycleStage.PLANNED, LifecycleStage.LIVE],
  confirm: [LifecycleStage.LIVE],
};

/**
 * Apply a transition. The stage guard is part of the UPDATE, so two people
 * acting at once cannot both win. Returns null when the row was not in an
 * allowed stage (the caller has already checked it exists).
 */
export async function applyLifecycleAction(
  entity: LifecycleEntityConfig,
  organizationId: number,
  id: number,
  action: LifecycleAction,
  params: { userId: number; goLiveDate?: string },
  transaction?: Transaction,
): Promise<Omit<LifecycleRow, "owner"> | null> {
  let set: string;
  const replacements: Record<string, unknown> = {
    organizationId,
    id,
    allowed: ALLOWED_FROM[action],
  };
  switch (action) {
    case "go_live":
      // Going live starts a fresh confirmation period.
      set = `lifecycle_stage = '${LifecycleStage.LIVE}', go_live_date = :goLiveDate,
             retired_at = NULL, last_confirmed_at = NULL, last_confirmed_by = NULL,
             confirmation_reminded_at = NULL`;
      replacements.goLiveDate = params.goLiveDate;
      break;
    case "retire":
      set = `lifecycle_stage = '${LifecycleStage.RETIRED}', retired_at = NOW()`;
      break;
    case "confirm":
      set = `last_confirmed_at = NOW(), last_confirmed_by = :userId`;
      replacements.userId = params.userId;
      break;
  }
  const rows = (await sequelize.query(
    `UPDATE ${entity.table} e
        SET ${set}
      WHERE e.organization_id = :organizationId
        AND e.id = :id
        AND e.lifecycle_stage IN (:allowed)${scopeSql(entity, "e")}
      ${RETURNING}`,
    { replacements, type: QueryTypes.SELECT, transaction },
  )) as Omit<LifecycleRow, "owner">[];
  return rows[0] ?? null;
}

export async function updateDepartment(
  entity: LifecycleEntityConfig,
  organizationId: number,
  id: number,
  department: string | null,
  transaction?: Transaction,
): Promise<Omit<LifecycleRow, "owner"> | null> {
  const rows = (await sequelize.query(
    `UPDATE ${entity.table} e
        SET department = :department
      WHERE e.organization_id = :organizationId AND e.id = :id${scopeSql(entity, "e")}
      ${RETURNING}`,
    {
      replacements: { organizationId, id, department },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Omit<LifecycleRow, "owner">[];
  return rows[0] ?? null;
}

/**
 * Move a use case between in review and planned when its approval request
 * opens or ends, and record the move in the use case change history. Only a
 * row in `from` changes; anything else (live, retired) is left alone.
 * `changedBy` null means the system made the change (auto-approval, a job).
 */
async function moveUseCaseStage(
  organizationId: number,
  id: number,
  from: LifecycleStage,
  to: LifecycleStage,
  changedBy: number | null,
  transaction?: Transaction,
): Promise<boolean> {
  const rows = (await sequelize.query(
    `UPDATE projects
        SET lifecycle_stage = :to
      WHERE organization_id = :organizationId
        AND id = :id
        AND lifecycle_stage = :from
      RETURNING id`,
    { replacements: { organizationId, id, from, to }, type: QueryTypes.SELECT, transaction },
  )) as { id: number }[];
  if (rows.length === 0) return false;
  await recordMultipleFieldChanges(
    "use_case",
    id,
    changedBy,
    organizationId,
    [
      {
        fieldName: "lifecycle_stage",
        oldValue: LIFECYCLE_STAGE_LABELS[from],
        newValue: LIFECYCLE_STAGE_LABELS[to],
      },
    ],
    transaction,
    changedBy === null,
  );
  return true;
}

/**
 * The approval request a use case waited on is over: approved, rejected,
 * withdrawn, or the workflow was cleared. In review → planned.
 */
export async function releaseUseCaseFromReview(
  organizationId: number,
  id: number,
  changedBy: number | null,
  transaction?: Transaction,
): Promise<boolean> {
  return moveUseCaseStage(
    organizationId,
    id,
    LifecycleStage.IN_REVIEW,
    LifecycleStage.PLANNED,
    changedBy,
    transaction,
  );
}

/** A planned use case that gets an open approval request is in review. */
export async function moveUseCaseIntoReview(
  organizationId: number,
  id: number,
  changedBy: number | null,
  transaction?: Transaction,
): Promise<boolean> {
  return moveUseCaseStage(
    organizationId,
    id,
    LifecycleStage.PLANNED,
    LifecycleStage.IN_REVIEW,
    changedBy,
    transaction,
  );
}
