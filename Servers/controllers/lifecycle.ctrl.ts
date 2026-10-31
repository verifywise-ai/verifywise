import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { sequelize } from "../database/db";
import { toId } from "../utils/validations/validation.utils";
import { roleHasPermission } from "../utils/rolePermissions.utils";
import {
  LIFECYCLE_ENTITIES,
  LifecycleAction,
  LifecycleEntityConfig,
  applyLifecycleAction,
  getLifecycleRow,
} from "../utils/lifecycle.utils";
import { LIFECYCLE_STAGE_LABELS } from "../domain.layer/enums/lifecycle-stage.enum";
import { recordMultipleFieldChanges } from "../utils/changeHistory.base.utils";
import type { PermissionKey } from "../config/rolePermissions.config";

/**
 * Lifecycle actions shared by every inventory with a lifecycle (#5187 use
 * cases, #5193 AI apps): go live, retire and confirm still live. Each entity
 * gets its handlers from lifecycleActionHandlers(key); what differs (table,
 * owner column, permission, change history, messages) comes from
 * LIFECYCLE_ENTITIES and ENTITY_MESSAGES.
 */

const FILE = "lifecycle.ctrl.ts";

/** The 500 every lifecycle controller returns: logs, never leaks the error. */
export function serverError(
  req: Request,
  res: Response,
  fn: string,
  error: unknown,
  file: string = FILE,
) {
  logStructured("error", `${fn} failed`, fn, file);
  logger.error(`❌ Error in ${fn}:`, error);
  return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
}

/**
 * Who may change an entry's lifecycle: anyone holding the entity's edit
 * permission, or its owner. Auditors are read-only even when they own it.
 */
export async function canManageLifecycle(
  req: Request,
  ownerId: number | null,
  permission: PermissionKey = "useCase.edit",
): Promise<boolean> {
  const role = req.role;
  if (!role || role === "Auditor") return false;
  if (ownerId !== null && Number(ownerId) === req.userId) return true;
  return roleHasPermission(req.organizationId ?? null, role, permission);
}

/** YYYY-MM-DD for "today" in UTC, with a day of slack for time zones ahead of UTC. */
function latestAllowedGoLiveDate(now = new Date()): string {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return tomorrow.toISOString().slice(0, 10);
}

/** A real calendar date in YYYY-MM-DD form, or null. */
export function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return value;
}

interface EntityMessages {
  invalidId: string;
  notFound: string;
  conflict: Record<LifecycleAction, string>;
}

/** i18n keys (Servers/locales) per entity. */
const ENTITY_MESSAGES: Record<LifecycleEntityConfig["key"], EntityMessages> = {
  use_case: {
    invalidId: "Invalid project ID",
    notFound: "Project not found",
    conflict: {
      go_live: "Only a planned use case can go live",
      retire: "Only a planned or live use case can be retired",
      confirm: "Only a live use case can be confirmed as still live",
    },
  },
  ai_app: {
    invalidId: "Invalid AI app ID",
    notFound: "AI app not found",
    conflict: {
      go_live: "Only a planned AI app can go live",
      retire: "Only a planned or live AI app can be retired",
      confirm: "Only a live AI app can be confirmed as still live",
    },
  },
};

/** Parse :id; NaN for anything but a positive integer. */
export function lifecycleIdParam(req: Request): number {
  const id = toId(req.params.id);
  return isNaN(id) || id <= 0 ? NaN : id;
}

function actionHandler(entity: LifecycleEntityConfig, action: LifecycleAction) {
  const fn = `lifecycle:${entity.key}:${action}`;
  const messages = ENTITY_MESSAGES[entity.key];
  return async (req: Request, res: Response) => {
    const id = lifecycleIdParam(req);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400](req.t!(messages.invalidId)));
    }

    let goLiveDate: string | undefined;
    if (action === "go_live") {
      const raw = req.body?.go_live_date;
      if (raw === undefined || raw === null || raw === "") {
        goLiveDate = new Date().toISOString().slice(0, 10);
      } else {
        const parsed = parseIsoDate(raw);
        if (!parsed) {
          return res.status(400).json(STATUS_CODE[400](req.t!("Invalid go-live date")));
        }
        if (parsed > latestAllowedGoLiveDate()) {
          return res
            .status(400)
            .json(STATUS_CODE[400](req.t!("The go-live date can't be later than today")));
        }
        goLiveDate = parsed;
      }
    }

    const transaction = await sequelize.transaction();
    try {
      const current = await getLifecycleRow(entity, req.organizationId!, id, transaction);
      if (!current) {
        await transaction.rollback();
        return res.status(404).json(STATUS_CODE[404](req.t!(messages.notFound)));
      }
      if (!(await canManageLifecycle(req, current.owner, entity.editPermission))) {
        await transaction.rollback();
        return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
      }

      const updated = await applyLifecycleAction(
        entity,
        req.organizationId!,
        id,
        action,
        { userId: req.userId!, goLiveDate },
        transaction,
      );
      if (!updated) {
        await transaction.rollback();
        return res.status(409).json(STATUS_CODE[409](req.t!(messages.conflict[action])));
      }

      const changes: Array<{ fieldName: string; oldValue: string; newValue: string }> = [];
      if (current.lifecycle_stage !== updated.lifecycle_stage) {
        changes.push({
          fieldName: "lifecycle_stage",
          oldValue: LIFECYCLE_STAGE_LABELS[current.lifecycle_stage] ?? current.lifecycle_stage,
          newValue: LIFECYCLE_STAGE_LABELS[updated.lifecycle_stage] ?? updated.lifecycle_stage,
        });
      }
      if (action === "go_live") {
        changes.push({
          fieldName: "go_live_date",
          oldValue: current.go_live_date ?? "",
          newValue: updated.go_live_date ?? "",
        });
      }
      if (action === "confirm") {
        changes.push({
          fieldName: "last_confirmed_at",
          oldValue: current.last_confirmed_at
            ? new Date(current.last_confirmed_at).toISOString()
            : "",
          newValue: updated.last_confirmed_at
            ? new Date(updated.last_confirmed_at).toISOString()
            : "",
        });
      }
      if (changes.length > 0) {
        await recordMultipleFieldChanges(
          entity.historyEntity,
          id,
          req.userId!,
          req.organizationId!,
          changes,
          transaction,
        );
      }

      await transaction.commit();
      logStructured("successful", `${entity.key} ${id}: ${action}`, fn, FILE);
      return res.status(200).json(STATUS_CODE[200](updated));
    } catch (error) {
      await transaction.rollback();
      return serverError(req, res, fn, error);
    }
  };
}

export function lifecycleActionHandlers(key: LifecycleEntityConfig["key"]) {
  const entity = LIFECYCLE_ENTITIES[key];
  return {
    goLive: actionHandler(entity, "go_live"),
    retire: actionHandler(entity, "retire"),
    confirm: actionHandler(entity, "confirm"),
  };
}
