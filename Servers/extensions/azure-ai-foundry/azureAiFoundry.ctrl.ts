import { Request, Response } from "express";
import { STATUS_CODE } from "../../utils/statusCode.utils";
import logger, { logStructured } from "../../utils/logger/fileLogger";
import { translateError } from "../../utils/i18n.utils";
import {
  discoverAgents,
  getSyncedDeploymentById,
  listSyncedDeployments,
  loadConfiguration,
  syncModels,
} from "./azureAiFoundry.service";

const fileName = "azureAiFoundry.ctrl.ts";

export async function listDeployments(req: Request, res: Response): Promise<any> {
  const organizationId = (req as any).organizationId as number;
  try {
    const models = await listSyncedDeployments(organizationId);
    return res.status(200).json(STATUS_CODE[200]({ configured: true, models }));
  } catch (error) {
    logStructured("error", "list azure deployments failed", "listDeployments", fileName);
    logger.error("❌ Error in listDeployments:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function syncFromAzure(req: Request, res: Response): Promise<any> {
  const organizationId = (req as any).organizationId as number;
  try {
    const config = await loadConfiguration(organizationId);
    if (!config.project_endpoint || !config.api_key) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            req.t!(
              "Azure AI Foundry is not configured. Set the project endpoint and API key first.",
            ),
          ),
        );
    }
    const result = await syncModels(organizationId, config);
    return res.status(result.success ? 200 : 500).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured("error", "azure sync failed", "syncFromAzure", fileName);
    logger.error("❌ Error in syncFromAzure:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getDeploymentById(req: Request, res: Response): Promise<any> {
  const organizationId = (req as any).organizationId as number;
  const deploymentId = parseInt(
    Array.isArray(req.params.deploymentId) ? req.params.deploymentId[0] : req.params.deploymentId,
    10,
  );
  if (Number.isNaN(deploymentId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid deployment ID")));
  }
  try {
    const model = await getSyncedDeploymentById(deploymentId, organizationId);
    if (!model) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Model deployment not found")));
    }
    return res.status(200).json(STATUS_CODE[200](model));
  } catch (error) {
    logStructured(
      "error",
      `azure deployment ${deploymentId} lookup failed`,
      "getDeploymentById",
      fileName,
    );
    logger.error("❌ Error in getDeploymentById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function discoverAiAgents(req: Request, res: Response): Promise<any> {
  const organizationId = (req as any).organizationId as number;
  try {
    const config = await loadConfiguration(organizationId);
    const primitives = await discoverAgents(config);
    return res.status(200).json(STATUS_CODE[200](primitives));
  } catch (error) {
    logStructured("error", "azure discover failed", "discoverAiAgents", fileName);
    logger.error("❌ Error in discoverAiAgents:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
