import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { ExtensionService } from "../services/extension/extensionService";
import {
  NotFoundException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import { sanitizeForLog, EXTENSION_KEY_PATTERN } from "../utils/validations/validation.utils";
import { translateError } from "../utils/i18n.utils";
// Per-extension connectivity checks live inside each extension's service
// module. Import them lazily via the dispatch table below to keep this
// controller from pulling every extension's transitive deps at boot.
import { testConnection as mlflowTestConnection } from "../extensions/mlflow/mlflow.service";
import { testConnection as azureTestConnection } from "../extensions/azure-ai-foundry/azureAiFoundry.service";
import {
  clientFromConfig as jiraClientFromConfig,
  loadFullConfig as jiraLoadFullConfig,
} from "../extensions/jira-assets/jiraAssets.service";

const fileName = "extension.ctrl.ts";

// Extensions that expose a connectivity test wired to the generic
// /api/extensions/:key/test-connection endpoint. Each runner receives the
// caller-submitted configuration plus the organizationId, and is
// responsible for reading whatever additional state it needs (e.g. a
// previously-stored secret) from its own storage. Returns the standard
// { success, message, testedAt } contract.
//
// Slack is deliberately absent — its setup is per-webhook (post-enable via
// slack_webhooks) with no pre-enable connectivity to check.
type TestConnectionResult = { success: boolean; message: string; testedAt: string };
type TestConnectionRunner = (
  submitted: Record<string, unknown>,
  organizationId: number,
) => Promise<TestConnectionResult>;

const TEST_CONNECTION_DISPATCH: Record<string, TestConnectionRunner> = {
  // MLflow + Azure store their config in extension_enablements.configuration;
  // the caller-submitted payload is overlaid on the stored, decrypted blob
  // before calling the check.
  mlflow: async (submitted, organizationId) => {
    const stored = await ExtensionService.getRuntimeConfiguration("mlflow", organizationId);
    return mlflowTestConnection({ ...stored, ...submitted } as any);
  },
  "azure-ai-foundry": async (submitted, organizationId) => {
    const stored = await ExtensionService.getRuntimeConfiguration(
      "azure-ai-foundry",
      organizationId,
    );
    return azureTestConnection({ ...stored, ...submitted } as any);
  },
  // JIRA stores its config in the dedicated jira_assets_config table (see
  // migration 20260819105546-remove-dead-extension-config-fields.js — its
  // extension_enablements.configuration is empty by design). Read the
  // decrypted token from that table when the caller submits only the
  // non-secret fields, then run the same connectivity check the dedicated
  // /extensions/jira-assets/test-connection route uses.
  "jira-assets": async (submitted, organizationId) => {
    const candidate = { ...(submitted as any) };
    if (!candidate.api_token) {
      const stored = await jiraLoadFullConfig(organizationId);
      if (stored?.api_token) candidate.api_token = stored.api_token;
    }
    const client = jiraClientFromConfig(candidate);
    const result = await client.testConnection();
    return {
      success: result.success,
      message: result.success
        ? "Successfully connected to JIRA Assets"
        : `Connection failed: ${result.error ?? "unknown error"}`,
      testedAt: new Date().toISOString(),
    };
  },
};

function extractKey(req: Request): string {
  const raw = req.params.key;
  return Array.isArray(raw) ? String(raw[0]) : String(raw);
}

/**
 * GET /api/extensions
 * List all extensions with per-org enable state + redacted configuration.
 */
export async function listExtensions(req: Request, res: Response): Promise<any> {
  const functionName = "listExtensions";
  const organizationId = (req as any).organizationId;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;

  if (!organizationId) {
    return res.status(401).json(STATUS_CODE[401](req.t!("User not authenticated")));
  }

  try {
    const extensions = await ExtensionService.listAll(organizationId, category);
    logStructured("successful", `${extensions.length} extensions listed`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](extensions));
  } catch (error) {
    logStructured("error", "failed to list extensions", functionName, fileName);
    logger.error("❌ Error in listExtensions:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * GET /api/extensions/:key
 * Single extension detail: catalog metadata + config fields + per-org state.
 */
export async function getExtension(req: Request, res: Response): Promise<any> {
  const functionName = "getExtension";
  const key = extractKey(req);
  const organizationId = (req as any).organizationId;

  if (!EXTENSION_KEY_PATTERN.test(key)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid extension key format")));
  }
  if (!organizationId) {
    return res.status(401).json(STATUS_CODE[401](req.t!("User not authenticated")));
  }

  try {
    const extension = await ExtensionService.getByKey(key, organizationId);
    return res.status(200).json(STATUS_CODE[200](extension));
  } catch (error) {
    if (error instanceof NotFoundException) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Extension not found")));
    }
    logStructured(
      "error",
      `failed to fetch extension ${sanitizeForLog(key)}`,
      functionName,
      fileName,
    );
    logger.error("❌ Error in getExtension:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * POST /api/extensions/:key/enable
 * Enable an extension for the caller's org. Body: { configuration?: {...} }.
 */
export async function enableExtension(req: Request, res: Response): Promise<any> {
  const functionName = "enableExtension";
  const key = extractKey(req);
  const userId = (req as any).userId;
  const organizationId = (req as any).organizationId;
  const configuration = (req.body?.configuration ?? {}) as Record<string, unknown>;

  if (!EXTENSION_KEY_PATTERN.test(key)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid extension key format")));
  }
  if (!userId || !organizationId) {
    return res.status(401).json(STATUS_CODE[401](req.t!("User not authenticated")));
  }

  logStructured(
    "processing",
    `enabling extension ${sanitizeForLog(key)} for org ${organizationId}`,
    functionName,
    fileName,
  );

  try {
    const extension = await ExtensionService.enable(key, organizationId, userId, configuration);
    logStructured("successful", `extension ${sanitizeForLog(key)} enabled`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](extension));
  } catch (error) {
    if (error instanceof NotFoundException) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Extension not found")));
    }
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }
    logStructured(
      "error",
      `failed to enable extension ${sanitizeForLog(key)}`,
      functionName,
      fileName,
    );
    logger.error("❌ Error in enableExtension:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * POST /api/extensions/:key/disable
 */
export async function disableExtension(req: Request, res: Response): Promise<any> {
  const functionName = "disableExtension";
  const key = extractKey(req);
  const userId = (req as any).userId;
  const organizationId = (req as any).organizationId;

  if (!EXTENSION_KEY_PATTERN.test(key)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid extension key format")));
  }
  if (!userId || !organizationId) {
    return res.status(401).json(STATUS_CODE[401](req.t!("User not authenticated")));
  }

  logStructured(
    "processing",
    `disabling extension ${sanitizeForLog(key)} for org ${organizationId}`,
    functionName,
    fileName,
  );

  try {
    const extension = await ExtensionService.disable(key, organizationId);
    logStructured(
      "successful",
      `extension ${sanitizeForLog(key)} disabled`,
      functionName,
      fileName,
    );
    return res.status(200).json(STATUS_CODE[200](extension));
  } catch (error) {
    if (error instanceof NotFoundException) {
      return res.status(404).json(STATUS_CODE[404](translateError(req, error)));
    }
    logStructured(
      "error",
      `failed to disable extension ${sanitizeForLog(key)}`,
      functionName,
      fileName,
    );
    logger.error("❌ Error in disableExtension:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * PATCH /api/extensions/:key/configuration
 * Update the stored configuration. Body: { configuration: {...} }.
 * Secret fields absent from the body preserve their existing encrypted value.
 */
export async function updateExtensionConfiguration(req: Request, res: Response): Promise<any> {
  const functionName = "updateExtensionConfiguration";
  const key = extractKey(req);
  const userId = (req as any).userId;
  const organizationId = (req as any).organizationId;
  const configuration = (req.body?.configuration ?? {}) as Record<string, unknown>;

  if (!EXTENSION_KEY_PATTERN.test(key)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid extension key format")));
  }
  if (!userId || !organizationId) {
    return res.status(401).json(STATUS_CODE[401](req.t!("User not authenticated")));
  }

  try {
    const extension = await ExtensionService.updateConfiguration(
      key,
      organizationId,
      configuration,
    );
    return res.status(200).json(STATUS_CODE[200](extension));
  } catch (error) {
    if (error instanceof NotFoundException) {
      return res.status(404).json(STATUS_CODE[404](translateError(req, error)));
    }
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }
    logStructured(
      "error",
      `failed to update configuration for ${sanitizeForLog(key)}`,
      functionName,
      fileName,
    );
    logger.error("❌ Error in updateExtensionConfiguration:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * POST /api/extensions/:key/test-connection
 * Verify that the extension can reach its remote service with the given
 * (or currently-stored) configuration. Body: { configuration?: {...} }.
 *
 * Behaviour:
 *  - Submitted `configuration` is overlaid on the stored, decrypted config
 *    so a partial payload works (e.g. user just updated the API token).
 *  - Extensions with no wired test function respond 200 with success=false
 *    and a message that the check isn't available for this extension —
 *    keeps the frontend button contract simple (never 404s).
 */
export async function testExtensionConnection(req: Request, res: Response): Promise<any> {
  const functionName = "testExtensionConnection";
  const key = extractKey(req);
  const userId = (req as any).userId;
  const organizationId = (req as any).organizationId;
  const submitted = (req.body?.configuration ?? {}) as Record<string, unknown>;

  if (!EXTENSION_KEY_PATTERN.test(key)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid extension key format")));
  }
  if (!userId || !organizationId) {
    return res.status(401).json(STATUS_CODE[401](req.t!("User not authenticated")));
  }

  try {
    const runner = TEST_CONNECTION_DISPATCH[key];
    if (!runner) {
      return res.status(200).json(
        STATUS_CODE[200]({
          success: false,
          message: `Test connection is not available for '${sanitizeForLog(key)}'.`,
          testedAt: new Date().toISOString(),
        }),
      );
    }

    const result = await runner(submitted, organizationId);
    logStructured(
      result.success ? "successful" : "error",
      `test-connection for ${sanitizeForLog(key)}: ${result.success ? "ok" : "failed"}`,
      functionName,
      fileName,
    );
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    if (error instanceof NotFoundException) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Extension not found")));
    }
    logStructured(
      "error",
      `failed to test connection for ${sanitizeForLog(key)}`,
      functionName,
      fileName,
    );
    logger.error("❌ Error in testExtensionConnection:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
