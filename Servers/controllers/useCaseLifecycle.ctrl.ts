import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { sequelize } from "../database/db";
import { toId } from "../utils/validations/validation.utils";
import { roleHasPermission } from "../utils/rolePermissions.utils";
import {
  LIFECYCLE_ENTITIES,
  LifecycleAction,
  applyLifecycleAction,
  getLifecycleOrgSettings,
  getLifecycleRow,
  parseDepartment,
  updateDepartment,
  upsertLifecycleOrgSettings,
} from "../utils/lifecycle.utils";
import {
  getUseCaseLifecycleDashboard,
  getUseCaseLifecycleSummary,
} from "../utils/useCaseLifecycle.utils";
import {
  LIFECYCLE_STAGE_LABELS,
  isConfirmationInterval,
} from "../domain.layer/enums/lifecycle-stage.enum";
import { recordMultipleFieldChanges } from "../utils/changeHistory.base.utils";

const FILE = "useCaseLifecycle.ctrl.ts";
const USE_CASE = LIFECYCLE_ENTITIES.use_case;

function serverError(req: Request, res: Response, fn: string, error: unknown) {
  logStructured("error", `${fn} failed`, fn, FILE);
  logger.error(`❌ Error in ${fn}:`, error);
  return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
}

/**
 * Who may change a use case's lifecycle: anyone holding useCase.edit, or the
 * use case owner. Auditors are read-only even when they own it.
 */
export async function canManageLifecycle(req: Request, ownerId: number | null): Promise<boolean> {
  const role = req.role;
  if (!role || role === "Auditor") return false;
  if (ownerId !== null && Number(ownerId) === req.userId) return true;
  return roleHasPermission(req.organizationId ?? null, role, "useCase.edit");
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

export async function getLifecycleSummaryHandler(req: Request, res: Response) {
  const fn = "getLifecycleSummaryHandler";
  try {
    const summary = await getUseCaseLifecycleSummary(req.organizationId!, {
      userId: req.userId!,
      role: req.role!,
    });
    return res.status(200).json(STATUS_CODE[200](summary));
  } catch (error) {
    return serverError(req, res, fn, error);
  }
}

export async function getLifecycleDashboardHandler(req: Request, res: Response) {
  const fn = "getLifecycleDashboardHandler";
  try {
    const dashboard = await getUseCaseLifecycleDashboard(req.organizationId!, {
      userId: req.userId!,
      role: req.role!,
    });
    return res.status(200).json(STATUS_CODE[200](dashboard));
  } catch (error) {
    return serverError(req, res, fn, error);
  }
}

const ACTION_CONFLICT: Record<LifecycleAction, string> = {
  go_live: "Only a planned use case can go live",
  retire: "Only a planned or live use case can be retired",
  confirm: "Only a live use case can be confirmed as still live",
};

function lifecycleActionHandler(action: LifecycleAction) {
  const fn = `lifecycle:${action}`;
  return async (req: Request, res: Response) => {
    const id = toId(req.params.id);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid project ID")));
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
      const current = await getLifecycleRow(USE_CASE, req.organizationId!, id, transaction);
      if (!current) {
        await transaction.rollback();
        return res.status(404).json(STATUS_CODE[404](req.t!("Project not found")));
      }
      if (!(await canManageLifecycle(req, current.owner))) {
        await transaction.rollback();
        return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
      }

      const updated = await applyLifecycleAction(
        USE_CASE,
        req.organizationId!,
        id,
        action,
        { userId: req.userId!, goLiveDate },
        transaction,
      );
      if (!updated) {
        await transaction.rollback();
        return res.status(409).json(STATUS_CODE[409](req.t!(ACTION_CONFLICT[action])));
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
          "use_case",
          id,
          req.userId!,
          req.organizationId!,
          changes,
          transaction,
        );
      }

      await transaction.commit();
      logStructured("successful", `use case ${id}: ${action}`, fn, FILE);
      return res.status(200).json(STATUS_CODE[200](updated));
    } catch (error) {
      await transaction.rollback();
      return serverError(req, res, fn, error);
    }
  };
}

export const goLiveHandler = lifecycleActionHandler("go_live");
export const retireHandler = lifecycleActionHandler("retire");
export const confirmStillLiveHandler = lifecycleActionHandler("confirm");

export async function updateDepartmentHandler(req: Request, res: Response) {
  const fn = "updateDepartmentHandler";
  const id = toId(req.params.id);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid project ID")));
  }
  // The field is required here: clearing it is an explicit null or "".
  if (req.body?.department === undefined) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid department")));
  }
  const parsed = parseDepartment(req.body.department);
  if (!parsed.ok) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid department")));
  }
  const department = parsed.department;

  const transaction = await sequelize.transaction();
  try {
    const current = await getLifecycleRow(USE_CASE, req.organizationId!, id, transaction);
    if (!current) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Project not found")));
    }
    if (!(await canManageLifecycle(req, current.owner))) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
    }
    const updated = await updateDepartment(
      USE_CASE,
      req.organizationId!,
      id,
      department,
      transaction,
    );
    if ((current.department ?? null) !== department) {
      await recordMultipleFieldChanges(
        "use_case",
        id,
        req.userId!,
        req.organizationId!,
        [
          {
            fieldName: "department",
            oldValue: current.department ?? "",
            newValue: department ?? "",
          },
        ],
        transaction,
      );
    }
    await transaction.commit();
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    await transaction.rollback();
    return serverError(req, res, fn, error);
  }
}

export async function getLifecycleSettingsHandler(req: Request, res: Response) {
  const fn = "getLifecycleSettingsHandler";
  try {
    const settings = await getLifecycleOrgSettings(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    return serverError(req, res, fn, error);
  }
}

export async function updateLifecycleSettingsHandler(req: Request, res: Response) {
  const fn = "updateLifecycleSettingsHandler";
  const days = req.body?.confirmation_interval_days;
  if (!isConfirmationInterval(days)) {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("The check interval must be 30, 90 or 180 days")));
  }
  try {
    const settings = await upsertLifecycleOrgSettings(req.organizationId!, days);
    logStructured("successful", `still-live interval set to ${days} days`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    return serverError(req, res, fn, error);
  }
}
