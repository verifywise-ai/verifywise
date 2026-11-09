import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { getRaciMatrixForViewer, setUserRaciRoles, type RaciResult } from "../utils/raciData.utils";
import type { RaciRole } from "../domain.layer/enums/raci.enum";

const FILE = "raci.ctrl.ts";

function sendResult(req: Request, res: Response, result: RaciResult): Response {
  switch (result.status) {
    case "ok":
      return res.status(200).json(STATUS_CODE[200](result.matrix));
    case "organizational":
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Organizational use cases do not have a RACI matrix")));
    case "user_not_found":
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found in this organization")));
    case "not_found":
      return res.status(404).json(STATUS_CODE[404](req.t!("Use case not found")));
  }
}

export async function getRaciMatrix(req: Request, res: Response) {
  const functionName = "getRaciMatrix";
  const projectId = Number(req.params.id);
  const context = {
    functionName,
    fileName: FILE,
    userId: req.userId!,
    organizationId: req.organizationId!,
  };
  logProcessing({ description: `Fetching RACI for use case ID ${projectId}`, ...context });

  try {
    const result = await getRaciMatrixForViewer(
      projectId,
      { userId: req.userId!, role: req.role! },
      req.organizationId!,
    );
    await logSuccess({
      eventType: "Read",
      description: `RACI request for use case ID ${projectId}: ${result.status}`,
      ...context,
    });
    return sendResult(req, res, result);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to fetch RACI for use case ID ${projectId}`,
      error: error as Error,
      ...context,
    });
    return res.status(500).json(STATUS_CODE[500](req.t!("Failed to load the RACI matrix")));
  }
}

export async function updateRaciUserRoles(req: Request, res: Response) {
  const functionName = "updateRaciUserRoles";
  const projectId = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  const context = {
    functionName,
    fileName: FILE,
    userId: req.userId!,
    organizationId: req.organizationId!,
  };
  const subject = `user ID ${targetUserId} on use case ID ${projectId}`;
  logProcessing({ description: `Updating RACI roles of ${subject}`, ...context });

  try {
    const result = await setUserRaciRoles(
      projectId,
      targetUserId,
      req.body.roles as RaciRole[],
      { userId: req.userId!, role: req.role! },
      req.organizationId!,
    );
    await logSuccess({
      eventType: "Update",
      description: `RACI update of ${subject}: ${result.status}`,
      ...context,
    });
    return sendResult(req, res, result);
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: `Failed to update RACI roles of ${subject}`,
      error: error as Error,
      ...context,
    });
    return res.status(500).json(STATUS_CODE[500](req.t!("Failed to update the RACI matrix")));
  }
}
