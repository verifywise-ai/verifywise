import { Request, Response } from "express";
import { AzureADConfigData, SSOProvider } from "../domain.layer/interfaces/i.ssoConfig";
import {
  getFirstEnabledSSOConfigQuery,
  getSSOCapableOrganizationsQuery,
  getSSOConfigQuery,
  isSSOFeatureEnabled,
  saveSSOConfigQuery,
  setSSOEnabledQuery,
} from "../utils/ssoConfig.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { STATUS_CODE } from "../utils/statusCode.utils";

const MASKED_SECRET = "********";

function maskConfig(config: AzureADConfigData): AzureADConfigData {
  return { ...config, client_secret: MASKED_SECRET };
}

function parseProvider(req: Request): SSOProvider {
  const provider = (req.query.provider as string) || "AzureAD";
  if (provider !== "AzureAD") {
    throw new Error("Unsupported SSO provider");
  }
  return provider;
}

export const getSSOConfig = async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json(STATUS_CODE[400]("Organization context required"));
    }
    const provider = parseProvider(req);
    const config = await getSSOConfigQuery(organizationId, provider);
    if (!config) {
      return res.status(404).json(STATUS_CODE[404]("SSO configuration not found"));
    }
    return res.status(200).json(
      STATUS_CODE[200]({
        ...config.toJSON(),
        config_data: maskConfig(config.config_data),
      }),
    );
  } catch (error) {
    logStructured("error", "failed to fetch SSO config", "getSSOConfig", "ssoConfig.ctrl.ts");
    logger.error("Error in getSSOConfig:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const saveSSOConfig = async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json(STATUS_CODE[400]("Organization context required"));
    }
    const provider = parseProvider(req);
    const body = req.body as AzureADConfigData;
    if (!body?.client_id || !body?.client_secret || !body?.tenant_id) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("client_id, client_secret, and tenant_id are required"));
    }
    const saved = await saveSSOConfigQuery(organizationId, provider, body);
    return res.status(201).json(
      STATUS_CODE[201]({
        ...saved.toJSON(),
        config_data: maskConfig(saved.config_data),
      }),
    );
  } catch (error) {
    logStructured("error", "failed to save SSO config", "saveSSOConfig", "ssoConfig.ctrl.ts");
    logger.error("Error in saveSSOConfig:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const enableSSO = async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json(STATUS_CODE[400]("Organization context required"));
    }
    const provider = parseProvider(req);
    await setSSOEnabledQuery(organizationId, provider, true);
    return res.status(200).json(STATUS_CODE[200]({ message: "SSO enabled" }));
  } catch (error) {
    logStructured("error", "failed to enable SSO", "enableSSO", "ssoConfig.ctrl.ts");
    logger.error("Error in enableSSO:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const disableSSO = async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json(STATUS_CODE[400]("Organization context required"));
    }
    const provider = parseProvider(req);
    await setSSOEnabledQuery(organizationId, provider, false);
    return res.status(200).json(STATUS_CODE[200]({ message: "SSO disabled" }));
  } catch (error) {
    logStructured("error", "failed to disable SSO", "disableSSO", "ssoConfig.ctrl.ts");
    logger.error("Error in disableSSO:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const checkSSOStatus = async (req: Request, res: Response) => {
  try {
    const provider = parseProvider(req);
    const orgIdRaw = req.query.organizationId as string | undefined;
    const organizationId = orgIdRaw ? parseInt(orgIdRaw, 10) : undefined;

    const config = organizationId
      ? await getSSOConfigQuery(organizationId, provider)
      : await getFirstEnabledSSOConfigQuery(provider);

    if (!config || (organizationId && !config.is_enabled)) {
      return res.status(200).json(STATUS_CODE[200]({ isEnabled: false, hasConfig: !!config }));
    }
    const data = config.config_data;
    return res.status(200).json(
      STATUS_CODE[200]({
        isEnabled: !!config.is_enabled,
        hasConfig: true,
        organizationId: config.organization_id,
        tenantId: data.tenant_id,
        clientId: data.client_id,
      }),
    );
  } catch (error) {
    logStructured("error", "failed to check SSO status", "checkSSOStatus", "ssoConfig.ctrl.ts");
    logger.error("Error in checkSSOStatus:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const getSSOFeatureStatus = (_req: Request, res: Response) => {
  return res.status(200).json(STATUS_CODE[200]({ enabled: isSSOFeatureEnabled() }));
};

export const listSSOOrgs = async (req: Request, res: Response) => {
  try {
    const provider = parseProvider(req);
    const orgs = await getSSOCapableOrganizationsQuery(provider);
    return res.status(200).json(STATUS_CODE[200](orgs));
  } catch (error) {
    logStructured(
      "error",
      "failed to list organizations for SSO selection",
      "listSSOOrgs",
      "ssoConfig.ctrl.ts",
    );
    logger.error("Error in listSSOOrgs:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};
