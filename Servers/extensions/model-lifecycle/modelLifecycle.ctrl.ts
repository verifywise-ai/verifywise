import { Request, Response } from "express";
import { STATUS_CODE } from "../../utils/statusCode.utils";
import logger, { logStructured } from "../../utils/logger/fileLogger";
import { translateError } from "../../utils/i18n.utils";
import * as svc from "./modelLifecycle.service";

const fileName = "modelLifecycle.ctrl.ts";

function orgId(req: Request): number {
  return (req as any).organizationId;
}
function uid(req: Request): number {
  return (req as any).userId;
}
function intParam(req: Request, name: string): number {
  const raw = req.params[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(String(value), 10);
}
function fail(res: Response, error: unknown, req: Request, where: string) {
  logStructured("error", `model-lifecycle ${where} failed`, where, fileName);
  logger.error(`❌ Error in ${where}:`, error);
  return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
}

// ---- Phases + items config ---------------------------------------------

export async function listConfig(req: Request, res: Response): Promise<any> {
  try {
    const includeInactive = String(req.query.includeInactive) === "true";
    const phases = await svc.listPhases(orgId(req), includeInactive);
    return res.status(200).json(STATUS_CODE[200](phases));
  } catch (err) {
    return fail(res, err, req, "listConfig");
  }
}

export async function createPhaseCtrl(req: Request, res: Response): Promise<any> {
  try {
    const phase = await svc.createPhase(orgId(req), req.body ?? {});
    return res.status(201).json(STATUS_CODE[201](phase));
  } catch (err) {
    return fail(res, err, req, "createPhase");
  }
}

export async function updatePhaseCtrl(req: Request, res: Response): Promise<any> {
  try {
    const phase = await svc.updatePhase(orgId(req), intParam(req, "id"), req.body ?? {});
    if (phase === null) {
      return res.status(400).json(STATUS_CODE[400](req.t!("No fields to update")));
    }
    return res.status(200).json(STATUS_CODE[200](phase));
  } catch (err) {
    return fail(res, err, req, "updatePhase");
  }
}

export async function deletePhaseCtrl(req: Request, res: Response): Promise<any> {
  try {
    await svc.deletePhase(orgId(req), intParam(req, "id"));
    return res.status(200).json(STATUS_CODE[200]({ success: true }));
  } catch (err) {
    return fail(res, err, req, "deletePhase");
  }
}

export async function reorderPhasesCtrl(req: Request, res: Response): Promise<any> {
  try {
    const orderedIds = (req.body?.orderedIds ?? []) as number[];
    await svc.reorderPhases(orgId(req), orderedIds);
    return res.status(200).json(STATUS_CODE[200]({ success: true }));
  } catch (err) {
    return fail(res, err, req, "reorderPhases");
  }
}

export async function createItemCtrl(req: Request, res: Response): Promise<any> {
  try {
    const item = await svc.createItem(orgId(req), intParam(req, "phaseId"), req.body ?? {});
    return res.status(201).json(STATUS_CODE[201](item));
  } catch (err) {
    return fail(res, err, req, "createItem");
  }
}

export async function updateItemCtrl(req: Request, res: Response): Promise<any> {
  try {
    const item = await svc.updateItem(orgId(req), intParam(req, "id"), req.body ?? {});
    if (item === null) {
      return res.status(400).json(STATUS_CODE[400](req.t!("No fields to update")));
    }
    return res.status(200).json(STATUS_CODE[200](item));
  } catch (err) {
    return fail(res, err, req, "updateItem");
  }
}

export async function deleteItemCtrl(req: Request, res: Response): Promise<any> {
  try {
    await svc.deleteItem(orgId(req), intParam(req, "id"));
    return res.status(200).json(STATUS_CODE[200]({ success: true }));
  } catch (err) {
    return fail(res, err, req, "deleteItem");
  }
}

export async function reorderItemsCtrl(req: Request, res: Response): Promise<any> {
  try {
    const orderedIds = (req.body?.orderedIds ?? []) as number[];
    await svc.reorderItems(orgId(req), intParam(req, "phaseId"), orderedIds);
    return res.status(200).json(STATUS_CODE[200]({ success: true }));
  } catch (err) {
    return fail(res, err, req, "reorderItems");
  }
}

// ---- Per-model reads + upserts ----------------------------------------

export async function getLifecycleCtrl(req: Request, res: Response): Promise<any> {
  try {
    const phases = await svc.getLifecycleForModel(orgId(req), intParam(req, "id"));
    return res.status(200).json(STATUS_CODE[200](phases));
  } catch (err) {
    return fail(res, err, req, "getLifecycle");
  }
}

export async function getProgressCtrl(req: Request, res: Response): Promise<any> {
  try {
    const progress = await svc.getProgressForModel(orgId(req), intParam(req, "id"));
    return res.status(200).json(STATUS_CODE[200](progress));
  } catch (err) {
    return fail(res, err, req, "getProgress");
  }
}

export async function upsertValueCtrl(req: Request, res: Response): Promise<any> {
  try {
    const value = await svc.upsertValue(
      orgId(req),
      intParam(req, "id"),
      intParam(req, "itemId"),
      uid(req),
      req.body ?? {},
    );
    return res.status(200).json(STATUS_CODE[200](value));
  } catch (err) {
    return fail(res, err, req, "upsertValue");
  }
}

// ---- Files -------------------------------------------------------------

export async function attachFileCtrl(req: Request, res: Response): Promise<any> {
  const fileId = req.body?.fileId;
  if (!fileId) {
    return res.status(400).json(STATUS_CODE[400](req.t!("fileId is required")));
  }
  try {
    const link = await svc.attachFile(
      orgId(req),
      intParam(req, "id"),
      intParam(req, "itemId"),
      uid(req),
      Number(fileId),
    );
    return res.status(201).json(STATUS_CODE[201](link));
  } catch (err) {
    return fail(res, err, req, "attachFile");
  }
}

export async function detachFileCtrl(req: Request, res: Response): Promise<any> {
  try {
    await svc.detachFile(
      orgId(req),
      intParam(req, "id"),
      intParam(req, "itemId"),
      intParam(req, "fileId"),
    );
    return res.status(200).json(STATUS_CODE[200]({ success: true }));
  } catch (err) {
    return fail(res, err, req, "detachFile");
  }
}

// ---- People ------------------------------------------------------------

export async function addPersonCtrl(req: Request, res: Response): Promise<any> {
  const personUserId = req.body?.userId;
  if (!personUserId) {
    return res.status(400).json(STATUS_CODE[400](req.t!("userId is required")));
  }
  try {
    const person = await svc.addPerson(
      orgId(req),
      intParam(req, "id"),
      intParam(req, "itemId"),
      uid(req),
      Number(personUserId),
    );
    return res.status(201).json(STATUS_CODE[201](person));
  } catch (err) {
    return fail(res, err, req, "addPerson");
  }
}

export async function removePersonCtrl(req: Request, res: Response): Promise<any> {
  try {
    await svc.removePerson(
      orgId(req),
      intParam(req, "id"),
      intParam(req, "itemId"),
      intParam(req, "userId"),
    );
    return res.status(200).json(STATUS_CODE[200]({ success: true }));
  } catch (err) {
    return fail(res, err, req, "removePerson");
  }
}

// ---- Approvals ---------------------------------------------------------

export async function addApproverCtrl(req: Request, res: Response): Promise<any> {
  const approverUserId = req.body?.userId;
  if (!approverUserId) {
    return res.status(400).json(STATUS_CODE[400](req.t!("userId is required")));
  }
  try {
    const approver = await svc.addApprover(
      orgId(req),
      intParam(req, "id"),
      intParam(req, "itemId"),
      uid(req),
      Number(approverUserId),
    );
    return res.status(201).json(STATUS_CODE[201](approver));
  } catch (err) {
    return fail(res, err, req, "addApprover");
  }
}

export async function removeApproverCtrl(req: Request, res: Response): Promise<any> {
  try {
    await svc.removeApprover(
      orgId(req),
      intParam(req, "id"),
      intParam(req, "itemId"),
      intParam(req, "userId"),
    );
    return res.status(200).json(STATUS_CODE[200]({ success: true }));
  } catch (err) {
    return fail(res, err, req, "removeApprover");
  }
}

export async function updateApprovalStatusCtrl(req: Request, res: Response): Promise<any> {
  const status = req.body?.status;
  if (!status || !["pending", "approved", "rejected"].includes(status)) {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("Invalid status. Must be: pending, approved, or rejected")));
  }
  try {
    const row = await svc.updateApprovalStatus(
      orgId(req),
      intParam(req, "id"),
      intParam(req, "itemId"),
      intParam(req, "userId"),
      status as svc.ApprovalStatus,
    );
    if (!row) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Approval record not found")));
    }
    return res.status(200).json(STATUS_CODE[200](row));
  } catch (err) {
    return fail(res, err, req, "updateApprovalStatus");
  }
}
