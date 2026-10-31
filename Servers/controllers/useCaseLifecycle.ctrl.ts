import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logStructured } from "../utils/logger/fileLogger";
import { sequelize } from "../database/db";
import { toId } from "../utils/validations/validation.utils";
import {
  LIFECYCLE_ENTITIES,
  getLifecycleOrgSettings,
  getLifecycleRow,
  parseDepartment,
  updateDepartment,
  upsertLifecycleOrgSettings,
} from "../utils/lifecycle.utils";
import {
  getPendingIntakeSubmissions,
  getUseCaseLifecycleDashboard,
  getUseCaseLifecycleSummary,
} from "../utils/useCaseLifecycle.utils";
import { IntakeEntityType } from "../domain.layer/enums/intake-entity-type.enum";
import { isConfirmationInterval } from "../domain.layer/enums/lifecycle-stage.enum";
import { recordMultipleFieldChanges } from "../utils/changeHistory.base.utils";
import {
  canManageLifecycle,
  lifecycleActionHandlers,
  parseIsoDate,
  serverError as sharedServerError,
} from "./lifecycle.ctrl";

const FILE = "useCaseLifecycle.ctrl.ts";
const USE_CASE = LIFECYCLE_ENTITIES.use_case;

const serverError = (req: Request, res: Response, fn: string, error: unknown) =>
  sharedServerError(req, res, fn, error, FILE);

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

/** Pending use case intake submissions for the In review tab (#5188). */
export async function getPendingSubmissionsHandler(req: Request, res: Response) {
  const fn = "getPendingSubmissionsHandler";
  try {
    const submissions = await getPendingIntakeSubmissions(
      req.organizationId!,
      IntakeEntityType.USE_CASE,
    );
    return res.status(200).json(STATUS_CODE[200](submissions));
  } catch (error) {
    return serverError(req, res, fn, error);
  }
}

/** Go live, retire and confirm for use cases; see controllers/lifecycle.ctrl.ts. */
const useCaseActions = lifecycleActionHandlers("use_case");
export const goLiveHandler = useCaseActions.goLive;
export const retireHandler = useCaseActions.retire;
export const confirmStillLiveHandler = useCaseActions.confirm;
export { canManageLifecycle, parseIsoDate };

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
