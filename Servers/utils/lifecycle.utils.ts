import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  ConfirmationIntervalDays,
  DEFAULT_CONFIRMATION_INTERVAL_DAYS,
  LIFECYCLE_STAGE_LABELS,
  LifecycleStage,
} from "../domain.layer/enums/lifecycle-stage.enum";
import { AiAppStatus } from "../domain.layer/enums/ai-app-status.enum";
import { NotificationEntityType } from "../domain.layer/interfaces/i.notification";
import { recordMultipleFieldChanges } from "./changeHistory.base.utils";
import type { EntityType as ChangeHistoryEntityType } from "../config/changeHistory.config";
import type { PermissionKey } from "../config/rolePermissions.config";

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
  key: "use_case" | "ai_app";
  table: string;
  ownerColumn: string;
  titleColumn: string;
  /** Singular noun for user-facing copy ("use case"). */
  noun: string;
  /** In-app path to the entity, where the owner can confirm. */
  path: (id: number) => string;
  notificationEntityType: NotificationEntityType;
  /** Change history entity the lifecycle actions write to. */
  historyEntity: ChangeHistoryEntityType;
  /** Permission that lets a non-owner change the lifecycle. */
  editPermission: PermissionKey;
  /**
   * Last-resort timestamps (against the alias) for a live row with neither a
   * confirmation nor a go-live date; the columns differ per table.
   */
  fallbackTimestampsSql: (alias: string) => string;
  /** Whether the table has a free-text department column (AI apps use ai_apps_departments). */
  hasDepartmentColumn: boolean;
  /**
   * Extra WHERE fragment (alias-free, against `table`) that limits which rows
   * have a lifecycle at all. Organizational projects are not use cases.
   */
  scope?: string;
  /**
   * Extra condition (against the alias) a row must meet to go live, on top of
   * being planned. AI apps must be approved first (#5193).
   */
  goLiveCondition?: (alias: string) => string;
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
    historyEntity: "use_case",
    editPermission: "useCase.edit",
    fallbackTimestampsSql: (a) => `${a}.last_updated, ${a}.created_at::timestamptz`,
    hasDepartmentColumn: true,
    scope: "is_organizational = false",
  },
  // AI apps (#5193): same stages, columns and "still live?" interval.
  ai_app: {
    key: "ai_app",
    table: "ai_apps",
    ownerColumn: "owner_id",
    titleColumn: "name",
    noun: "AI app",
    path: (id) => `/ai-apps/${id}`,
    notificationEntityType: NotificationEntityType.AI_APP,
    historyEntity: "ai_app",
    editPermission: "aiApp.edit",
    fallbackTimestampsSql: (a) => `${a}.updated_at, ${a}.created_at`,
    hasDepartmentColumn: false,
    // A draft or banned app has not been approved for use, so it can't be live.
    goLiveCondition: (a) =>
      `${a}.status IN ('${AiAppStatus.APPROVED}', '${AiAppStatus.RESTRICTED}')`,
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
export function confirmationBaselineSql(
  alias: string,
  entity: LifecycleEntityConfig = LIFECYCLE_ENTITIES.use_case,
): string {
  return `COALESCE(${alias}.last_confirmed_at, ${alias}.go_live_date::timestamptz,
    ${entity.fallbackTimestampsSql(alias)})`;
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
export function staleSql(
  alias: string,
  intervalSql = ":intervalDays",
  entity: LifecycleEntityConfig = LIFECYCLE_ENTITIES.use_case,
): string {
  return `(${alias}.lifecycle_stage = '${LifecycleStage.LIVE}'
    AND ${confirmationBaselineSql(alias, entity)} < NOW() - make_interval(days => ${intervalSql}))`;
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
            ${confirmationBaselineSql("e", entity)} AS baseline
       FROM ${entity.table} e
      WHERE e.organization_id = :organizationId
        AND e.${entity.ownerColumn} IS NOT NULL
        AND ${staleSql("e", ":intervalDays", entity)}${scopeSql(entity, "e")}
        AND (
          e.confirmation_reminded_at IS NULL
          OR e.confirmation_reminded_at < ${confirmationBaselineSql("e", entity)}
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

/** The lifecycle columns of a row; department is NULL where the table has none. */
export function lifecycleColumnsSql(entity: LifecycleEntityConfig): string {
  return `id, lifecycle_stage, go_live_date, retired_at, last_confirmed_at, last_confirmed_by,
    ${entity.hasDepartmentColumn ? "department" : "NULL::varchar AS department"}`;
}

export async function getLifecycleRow(
  entity: LifecycleEntityConfig,
  organizationId: number,
  id: number,
  transaction?: Transaction,
): Promise<LifecycleRow | null> {
  const rows = (await sequelize.query(
    `SELECT ${lifecycleColumnsSql(entity)}, ${entity.ownerColumn} AS owner
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
  let condition = "";
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
      if (entity.goLiveCondition) condition = ` AND ${entity.goLiveCondition("e")}`;
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
        AND e.lifecycle_stage IN (:allowed)${scopeSql(entity, "e")}${condition}
      RETURNING ${lifecycleColumnsSql(entity)}`,
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
      RETURNING ${lifecycleColumnsSql(entity)}`,
    {
      replacements: { organizationId, id, department },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Omit<LifecycleRow, "owner">[];
  return rows[0] ?? null;
}

/**
 * Move an entry to `to` if it is in one of `from`, and record the move in its
 * change history. Retiring also stamps retired_at. Anything not in `from` is
 * left alone. `changedBy` null means the system made the change (automatic
 * approval, a job). Returns whether the row moved.
 */
export async function moveLifecycleStage(
  entity: LifecycleEntityConfig,
  organizationId: number,
  id: number,
  from: LifecycleStage[],
  to: LifecycleStage,
  changedBy: number | null,
  transaction?: Transaction,
): Promise<boolean> {
  const current = (await sequelize.query(
    `SELECT lifecycle_stage FROM ${entity.table}
      WHERE organization_id = :organizationId AND id = :id
      FOR UPDATE`,
    { replacements: { organizationId, id }, type: QueryTypes.SELECT, transaction },
  )) as { lifecycle_stage: LifecycleStage }[];
  const fromStage = current[0]?.lifecycle_stage;
  if (!fromStage || !from.includes(fromStage) || fromStage === to) return false;

  await sequelize.query(
    `UPDATE ${entity.table}
        SET lifecycle_stage = :to${to === LifecycleStage.RETIRED ? ", retired_at = NOW()" : ""}
      WHERE organization_id = :organizationId AND id = :id`,
    { replacements: { organizationId, id, to }, transaction },
  );
  await recordMultipleFieldChanges(
    entity.historyEntity,
    id,
    changedBy,
    organizationId,
    [
      {
        fieldName: "lifecycle_stage",
        oldValue: LIFECYCLE_STAGE_LABELS[fromStage],
        newValue: LIFECYCLE_STAGE_LABELS[to],
      },
    ],
    transaction,
    changedBy === null,
  );
  return true;
}

/**
 * An AI app's approval status drives its stage where the meaning is clear
 * (#5193): under review → in review (from planned); leaving under review →
 * planned (if still in review); draft → planned (from in review or live: an
 * unapproved app can't be live); banned → retired (from anything else), which
 * also ends its still-live checks. Approved and restricted otherwise leave
 * the stage alone: approval says an app may be used, not that it is.
 */
export async function syncAiAppStageWithStatus(
  organizationId: number,
  id: number,
  status: string,
  changedBy: number | null,
  transaction?: Transaction,
): Promise<boolean> {
  const entity = LIFECYCLE_ENTITIES.ai_app;
  if (status === "under_review") {
    return moveLifecycleStage(
      entity,
      organizationId,
      id,
      [LifecycleStage.PLANNED],
      LifecycleStage.IN_REVIEW,
      changedBy,
      transaction,
    );
  }
  if (status === AiAppStatus.DRAFT) {
    // Only an approved app can be live (goLiveCondition): back to planned.
    // From in review this is the usual "left under review" move.
    return moveLifecycleStage(
      entity,
      organizationId,
      id,
      [LifecycleStage.IN_REVIEW, LifecycleStage.LIVE],
      LifecycleStage.PLANNED,
      changedBy,
      transaction,
    );
  }
  if (status === "banned") {
    return moveLifecycleStage(
      entity,
      organizationId,
      id,
      [LifecycleStage.IN_REVIEW, LifecycleStage.PLANNED, LifecycleStage.LIVE],
      LifecycleStage.RETIRED,
      changedBy,
      transaction,
    );
  }
  return moveLifecycleStage(
    entity,
    organizationId,
    id,
    [LifecycleStage.IN_REVIEW],
    LifecycleStage.PLANNED,
    changedBy,
    transaction,
  );
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
  return moveLifecycleStage(
    LIFECYCLE_ENTITIES.use_case,
    organizationId,
    id,
    [LifecycleStage.IN_REVIEW],
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
  return moveLifecycleStage(
    LIFECYCLE_ENTITIES.use_case,
    organizationId,
    id,
    [LifecycleStage.PLANNED],
    LifecycleStage.IN_REVIEW,
    changedBy,
    transaction,
  );
}
