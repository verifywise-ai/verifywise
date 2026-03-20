import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { PluginService, PluginRouteContext } from "../services/plugin/pluginService";
import { ValidationException, NotFoundException } from "../domain.layer/exceptions/custom.exception";
import { sanitizeForLog, PLUGIN_KEY_PATTERN } from "../utils/validations/validation.utils";

const fileName = "plugin.ctrl.ts";

/**
 * Get all available plugins from marketplace
 */
export async function getAllPlugins(
  req: Request,
  res: Response
): Promise<any> {
  const functionName = "getAllPlugins";
  logStructured(
    "processing",
    "starting getAllPlugins",
    functionName,
    fileName
  );

  const category = req.query.category as string;

  try {
    const plugins = await PluginService.getAllPlugins(category);

    logStructured(
      "successful",
      `${plugins.length} plugins found`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200](plugins));
  } catch (error) {
    logStructured("error", "failed to retrieve plugins", functionName, fileName);
    logger.error("❌ Error in getAllPlugins:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get plugin by key
 */
export async function getPluginByKey(
  req: Request,
  res: Response
): Promise<any> {
  const pluginKey = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const functionName = "getPluginByKey";

  if (!PLUGIN_KEY_PATTERN.test(pluginKey)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid plugin key format"));
  }

  logStructured(
    "processing",
    `fetching plugin by key: ${sanitizeForLog(pluginKey)}`,
    functionName,
    fileName
  );

  try {
    const plugin = await PluginService.getPluginByKey(pluginKey);

    if (!plugin) {
      return res.status(404).json(STATUS_CODE[404]("Plugin not found"));
    }

    logStructured("successful", `plugin ${sanitizeForLog(pluginKey)} found`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](plugin));
  } catch (error) {
    logStructured("error", "failed to retrieve plugin", functionName, fileName);
    logger.error("❌ Error in getPluginByKey:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Search plugins
 */
export async function searchPlugins(
  req: Request,
  res: Response
): Promise<any> {
  const query = req.query.q as string;
  const functionName = "searchPlugins";
  logStructured(
    "processing",
    `searching plugins with query: ${sanitizeForLog(query || "")}`,
    functionName,
    fileName
  );

  if (!query) {
    return res
      .status(400)
      .json(STATUS_CODE[400]("Query parameter 'q' is required"));
  }

  try {
    const plugins = await PluginService.searchPlugins(query);

    logStructured(
      "successful",
      `${plugins.length} plugins found for query: ${sanitizeForLog(query)}`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200](plugins));
  } catch (error) {
    logStructured("error", "failed to search plugins", functionName, fileName);
    logger.error("❌ Error in searchPlugins:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Install a plugin
 */
export async function installPlugin(
  req: Request,
  res: Response
): Promise<any> {
  const { pluginKey } = req.body;
  const userId = (req as any).userId;
  const organizationId = (req as any).organizationId;

  const functionName = "installPlugin";

  if (!pluginKey) {
    return res.status(400).json(STATUS_CODE[400]("pluginKey is required"));
  }

  if (!PLUGIN_KEY_PATTERN.test(pluginKey)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid plugin key format"));
  }

  logStructured(
    "processing",
    `installing plugin ${sanitizeForLog(pluginKey)} for user ${userId}`,
    functionName,
    fileName
  );

  if (!userId || !organizationId) {
    return res
      .status(401)
      .json(STATUS_CODE[401]("User not authenticated"));
  }

  try {
    const installation = await PluginService.installPlugin(
      pluginKey,
      userId,
      organizationId
    );

    logStructured(
      "successful",
      `plugin ${sanitizeForLog(pluginKey)} installed`,
      functionName,
      fileName
    );

    return res.status(201).json(STATUS_CODE[201](installation));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    logStructured("error", "failed to install plugin", functionName, fileName);
    logger.error("❌ Error in installPlugin:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Uninstall a plugin
 */
export async function uninstallPlugin(
  req: Request,
  res: Response
): Promise<any> {
  const installationId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const userId = (req as any).userId;
  const organizationId = (req as any).organizationId;

  const functionName = "uninstallPlugin";
  logStructured(
    "processing",
    `uninstalling plugin installation ${installationId}`,
    functionName,
    fileName
  );

  if (!userId || !organizationId) {
    return res
      .status(401)
      .json(STATUS_CODE[401]("User not authenticated"));
  }

  try {
    await PluginService.uninstallPlugin(installationId, userId, organizationId);

    logStructured(
      "successful",
      `plugin installation ${installationId} uninstalled`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200]("Plugin uninstalled successfully"));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    logStructured("error", "failed to uninstall plugin", functionName, fileName);
    logger.error("❌ Error in uninstallPlugin:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get installed plugins for organization
 */
export async function getInstalledPlugins(
  req: Request,
  res: Response
): Promise<any> {
  const organizationId = (req as any).organizationId;

  const functionName = "getInstalledPlugins";
  logStructured(
    "processing",
    `fetching installed plugins for organization ${organizationId}`,
    functionName,
    fileName
  );

  if (!organizationId) {
    return res
      .status(401)
      .json(STATUS_CODE[401]("User not authenticated"));
  }

  try {
    const installations = await PluginService.getInstalledPlugins(
      organizationId
    );

    logStructured(
      "successful",
      `${installations.length} installed plugins found`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200](installations));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve installed plugins",
      functionName,
      fileName
    );
    logger.error("❌ Error in getInstalledPlugins:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get plugin categories
 */
export async function getCategories(
  _req: Request,
  res: Response
): Promise<any> {
  const functionName = "getCategories";
  logStructured("processing", "fetching plugin categories", functionName, fileName);

  try {
    const categories = await PluginService.getCategories();

    logStructured(
      "successful",
      `${categories.length} categories found`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200](categories));
  } catch (error) {
    logStructured("error", "failed to retrieve categories", functionName, fileName);
    logger.error("❌ Error in getCategories:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Update plugin configuration
 */
export async function updatePluginConfiguration(
  req: Request,
  res: Response
): Promise<any> {
  const installationId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { configuration } = req.body;
  const userId = (req as any).userId;
  const organizationId = (req as any).organizationId;

  const functionName = "updatePluginConfiguration";
  logStructured(
    "processing",
    `updating configuration for plugin installation ${installationId}`,
    functionName,
    fileName
  );

  if (!configuration || typeof configuration !== "object") {
    return res
      .status(400)
      .json(STATUS_CODE[400]("Configuration object is required"));
  }

  if (!userId || !organizationId) {
    return res
      .status(401)
      .json(STATUS_CODE[401]("User not authenticated"));
  }

  try {
    const updated = await PluginService.updateConfiguration(
      installationId,
      userId,
      organizationId,
      configuration
    );

    logStructured(
      "successful",
      `plugin installation ${installationId} configuration updated`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    logStructured(
      "error",
      "failed to update plugin configuration",
      functionName,
      fileName
    );
    logger.error("❌ Error in updatePluginConfiguration:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Test plugin connection
 */
export async function testPluginConnection(
  req: Request,
  res: Response
): Promise<any> {
  const pluginKey = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const { configuration } = req.body;
  const userId = (req as any).userId;
  const organizationId = (req as any).organizationId;

  const functionName = "testPluginConnection";

  if (!PLUGIN_KEY_PATTERN.test(pluginKey)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid plugin key format"));
  }

  logStructured(
    "processing",
    `testing connection for plugin ${sanitizeForLog(pluginKey)}`,
    functionName,
    fileName
  );

  if (!configuration || typeof configuration !== "object") {
    return res
      .status(400)
      .json(STATUS_CODE[400]("Configuration object is required"));
  }

  if (!userId || !organizationId) {
    return res
      .status(401)
      .json(STATUS_CODE[401]("User not authenticated"));
  }

  try {
    const result = await PluginService.testConnection(
      pluginKey,
      configuration,
      { userId, organizationId }
    );

    logStructured(
      result.success ? "successful" : "error",
      `plugin ${sanitizeForLog(pluginKey)} connection test ${result.success ? 'succeeded' : 'failed'}`,
      functionName,
      fileName
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured("error", "failed to test plugin connection", functionName, fileName);
    logger.error("❌ Error in testPluginConnection:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Forward request to plugin router
 *
 * This is the generic catch-all handler that forwards requests to plugin-defined routes.
 * Plugins export a `router` object that maps route patterns to handler functions.
 *
 * Route pattern: /:key/*
 * Examples:
 *   GET /api/plugins/mlflow/models -> plugin's "GET /models" handler
 *   POST /api/plugins/mlflow/sync -> plugin's "POST /sync" handler
 *   GET /api/plugins/slack/oauth/workspaces -> plugin's "GET /oauth/workspaces" handler
 *   DELETE /api/plugins/slack/oauth/workspaces/123 -> plugin's "DELETE /oauth/workspaces/:id" handler
 */
export async function forwardToPlugin(
  req: Request,
  res: Response
): Promise<any> {
  const pluginKey = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const userId = (req as any).userId;
  const organizationId = (req as any).organizationId;

  const functionName = "forwardToPlugin";

  if (!pluginKey) {
    return res
      .status(400)
      .json(STATUS_CODE[400]("Plugin key is required"));
  }

  if (!PLUGIN_KEY_PATTERN.test(pluginKey)) {
    return res.status(400).json(STATUS_CODE[400]("Invalid plugin key format"));
  }

  // Extract the path after /api/plugins/:key/
  // When using router.use("/:key", ...), the remaining path is in req.path
  // req.path will be something like "/mlflow/models" when the full URL is "/api/plugins/mlflow/models"
  // We need to remove the "/:key" part to get just the plugin path
  const fullPath = req.path || req.url.split('?')[0];
  const keyPath = `/${pluginKey}`;
  const pluginPath = fullPath.startsWith(keyPath)
    ? fullPath.substring(keyPath.length) || "/"
    : fullPath || "/";

  logStructured(
    "processing",
    `forwarding ${req.method} ${sanitizeForLog(pluginPath)} to plugin ${sanitizeForLog(pluginKey)}`,
    functionName,
    fileName
  );

  if (!organizationId || !userId) {
    return res
      .status(401)
      .json(STATUS_CODE[401]("User not authenticated"));
  }

  try {
    // Build the context for the plugin handler
    const context: PluginRouteContext = {
      organizationId,
      userId,
      method: req.method,
      path: pluginPath,
      params: {},  // Will be populated by route matching
      query: req.query as Record<string, any>,
      body: req.body,
      sequelize: null,  // Will be set by PluginService
      configuration: {},  // Will be set by PluginService
    };

    // Forward to the plugin
    const response = await PluginService.forwardToPlugin(pluginKey, context);

    // Handle different response types
    const statusCode = response.status || 200;

    // Set custom headers if provided
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }

    // Handle binary response (file download)
    if (response.buffer) {
      if (response.contentType) {
        res.setHeader("Content-Type", response.contentType);
      } else {
        res.setHeader("Content-Type", "application/octet-stream");
      }

      if (response.filename) {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${response.filename}"`
        );
      }

      logStructured(
        "successful",
        `${sanitizeForLog(pluginKey)} returned file: ${sanitizeForLog(response.filename || "unnamed")}`,
        functionName,
        fileName
      );

      return res.status(statusCode).send(response.buffer);
    }

    // Handle JSON response
    logStructured(
      "successful",
      `${sanitizeForLog(pluginKey)} responded with status ${statusCode}`,
      functionName,
      fileName
    );

    return res.status(statusCode).json((STATUS_CODE as any)[statusCode](response.data));
  } catch (error) {
    // Handle specific error types
    if (error instanceof NotFoundException) {
      logStructured("error", `route not found in plugin ${sanitizeForLog(pluginKey)}`, functionName, fileName);
      return res.status(404).json(STATUS_CODE[404](error.message));
    }

    if (error instanceof ValidationException) {
      logStructured("error", `validation error in plugin ${sanitizeForLog(pluginKey)}`, functionName, fileName);
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof Error) {
      if (error.message.includes("not installed")) {
        return res.status(400).json(STATUS_CODE[400](`Plugin '${sanitizeForLog(pluginKey)}' is not installed`));
      }
      if (error.message.includes("not found")) {
        return res.status(404).json(STATUS_CODE[404](error.message));
      }
    }

    logStructured(
      "error",
      `failed to forward to plugin ${sanitizeForLog(pluginKey)}: ${(error as Error).message}`,
      functionName,
      fileName
    );
    logger.error(`❌ Error in forwardToPlugin (${sanitizeForLog(pluginKey)}):`, error);

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
