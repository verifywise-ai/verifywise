import { Request, Response } from "express";
import {
  getEvaluationsByModelInventoryId,
  getAllLinkedEvaluations,
} from "../utils/modelEvaluations.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";

const FILE_NAME = "modelEvaluations.ctrl.ts";

export async function getAllModelEvaluations(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting getAllModelEvaluations",
    functionName: "getAllModelEvaluations",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const data = await getAllLinkedEvaluations(organizationId);

    await logSuccess({
      description: "getAllModelEvaluations succeeded",
      functionName: "getAllModelEvaluations",
      fileName: FILE_NAME,
      eventType: "Read",
      userId,
      organizationId,
    });

    return res.status(200).json(data);
  } catch (error) {
    await logFailure({
      description: "getAllModelEvaluations failed",
      functionName: "getAllModelEvaluations",
      fileName: FILE_NAME,
      eventType: "Error",
      userId,
      organizationId,
      error: error as Error,
    });

    return res.status(500).json({ error: req.t!("Failed to fetch evaluations") });
  }
}

export async function getModelEvaluations(req: Request, res: Response): Promise<Response> {
  const userId = req.userId!;
  const organizationId = req.organizationId!;

  logProcessing({
    description: "starting getModelEvaluations",
    functionName: "getModelEvaluations",
    fileName: FILE_NAME,
    userId,
    organizationId,
  });

  try {
    const modelInventoryId = parseInt(req.params.id as string, 10);

    if (isNaN(modelInventoryId)) {
      return res.status(400).json({ error: req.t!("Invalid model inventory ID") });
    }

    const data = await getEvaluationsByModelInventoryId(modelInventoryId, organizationId);

    await logSuccess({
      description: "getModelEvaluations succeeded",
      functionName: "getModelEvaluations",
      fileName: FILE_NAME,
      eventType: "Read",
      userId,
      organizationId,
    });

    return res.status(200).json(data);
  } catch (error) {
    await logFailure({
      description: "getModelEvaluations failed",
      functionName: "getModelEvaluations",
      fileName: FILE_NAME,
      eventType: "Error",
      userId,
      organizationId,
      error: error as Error,
    });

    return res.status(500).json({ error: req.t!("Failed to fetch evaluations") });
  }
}
