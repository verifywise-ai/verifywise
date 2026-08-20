import { Request, Response } from "express";
import { STATUS_CODE } from "../../utils/statusCode.utils";
import logger, { logStructured } from "../../utils/logger/fileLogger";
import { translateError } from "../../utils/i18n.utils";
import {
  getSyncedModelById,
  listSyncedModels,
  loadConfiguration,
  syncModels,
} from "./mlflow.service";

const fileName = "mlflow.ctrl.ts";

export async function listModels(req: Request, res: Response): Promise<any> {
  const organizationId = (req as any).organizationId as number;
  try {
    const models = await listSyncedModels(organizationId);
    return res.status(200).json(STATUS_CODE[200]({ models }));
  } catch (error) {
    logStructured("error", "failed to list mlflow models", "listModels", fileName);
    logger.error("❌ Error in listModels:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function syncFromMlflow(req: Request, res: Response): Promise<any> {
  const organizationId = (req as any).organizationId as number;
  try {
    const config = await loadConfiguration(organizationId);
    if (!config.tracking_server_url) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](req.t!("MLflow is not configured. Set the tracking server URL first.")),
        );
    }
    const result = await syncModels(organizationId, config);
    return res.status(result.success ? 200 : 500).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured("error", "mlflow sync failed", "syncFromMlflow", fileName);
    logger.error("❌ Error in syncFromMlflow:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getModelById(req: Request, res: Response): Promise<any> {
  const organizationId = (req as any).organizationId as number;
  const modelId = parseInt(
    Array.isArray(req.params.modelId) ? req.params.modelId[0] : req.params.modelId,
    10,
  );
  if (Number.isNaN(modelId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model ID")));
  }
  try {
    const model = await getSyncedModelById(modelId, organizationId);
    if (!model) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Model not found")));
    }
    return res.status(200).json(STATUS_CODE[200](model));
  } catch (error) {
    logStructured("error", `failed to fetch mlflow model ${modelId}`, "getModelById", fileName);
    logger.error("❌ Error in getModelById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
