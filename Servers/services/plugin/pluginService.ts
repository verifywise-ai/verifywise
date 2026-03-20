import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import axios from "axios";
import { createInstallation, findByIdWithValidation, getInstalledPlugins, toJSON, updateConfiguration, deleteInstallation, findByPlugin } from "../../utils/pluginInstallation.utils";
import { PluginInstallationStatus } from "../../domain.layer/enums/plugin.enum";
import {
  ValidationException,
  NotFoundException,
} from "../../domain.layer/exceptions/custom.exception";
import { sequelize } from "../../database/db";
import { getBuiltinPlugins, isBuiltinPlugin } from "./builtinPlugins";
import { sanitizeForLog } from "../../utils/validations/validation.utils";

// Environment configuration
export const PLUGIN_MARKETPLACE_URL = "https://raw.githubusercontent.com/verifywise-ai/plugin-marketplace/main/plugins.json";
export const PLUGIN_MARKETPLACE_BASE_URL = PLUGIN_MARKETPLACE_URL.replace("/plugins.json", "");

interface Plugin {
  key: string;
  name: string;
  displayName: string;
  description: string;
  longDescription?: string;
  version: string;
  author?: string;
  category: string;
  region?: string;
  frameworkType?: "organizational" | "project";
  iconUrl?: string;
  documentationUrl?: string;
  supportUrl?: string;
  isOfficial: boolean;
  isPublished: boolean;
  isBuiltIn?: boolean;
  requiresConfiguration: boolean;
  installationType: string;
  features: Array<{
    name: string;
    description: string;
    displayOrder: number;
  }>;
  tags: string[];
  pluginPath: string;
  entryPoint: string;
  dependencies?: Record<string, string>;
  ui?: {
    bundleUrl: string;
    slots: Array<{
      slotId: string;
      componentName: string;
      renderType: string;
      props?: Record<string, any>;
      trigger?: string;
    }>;
  };
}

/**
 * Context passed to plugin route handlers
 * Contains all information needed to handle a request
 */
export interface PluginRouteContext {
  // Authentication
  organizationId: number;
  userId: number;
  /** @deprecated Use organizationId instead. Kept for backward compatibility during migration. */
  tenantId?: string;

  // Request details
  method: string;           // HTTP method (GET, POST, PUT, PATCH, DELETE)
  path: string;             // Route path after /api/plugins/:key (e.g., /models, /sync)
  params: Record<string, string>;  // URL params (e.g., { modelId: "123" })
  query: Record<string, any>;      // Query string params
  body: any;                       // Request body

  // Services
  sequelize: any;

  // Plugin configuration
  configuration: Record<string, any>;
}

/**
 * Response from plugin route handlers
 */
export interface PluginRouteResponse {
  status?: number;                    // HTTP status code (default 200)
  data?: any;                         // JSON response data
  buffer?: Buffer;                    // Binary data for file downloads
  filename?: string;                  // Filename for Content-Disposition header
  contentType?: string;               // Custom content type
  headers?: Record<string, string>;   // Additional response headers
}

/**
 * Plugin router type - maps route patterns to handler functions
 * Format: "METHOD /path" -> handler function
 * Example: "GET /models" -> getModels
 * Example: "POST /sync" -> syncModels
 * Example: "GET /models/:modelId" -> getModelById
 */
export type PluginRouter = Record<string, (context: PluginRouteContext) => Promise<PluginRouteResponse>>;

interface PluginMarketplace {
  version: string;
  plugins: Plugin[];
  categories: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

/**
 * Plugin Service
 *
 * Handles plugin marketplace operations and installation management
 */
export class PluginService {
  /**
   * Get all available plugins from marketplace
   * Fetches from remote Git repository
   */
  static async getAllPlugins(category?: string): Promise<Plugin[]> {
    try {
      const marketplaceData = await this.fetchRemoteMarketplace();

      let remotePlugins = marketplaceData.plugins.filter((p) => p.isPublished);

      // Merge built-in plugins (built-ins take precedence by key)
      const builtinPlugins = getBuiltinPlugins().filter((p) => p.isPublished).map((plugin) => {
        // Transform relative iconUrl paths to full URLs for built-in plugins too
        if (plugin.iconUrl && !plugin.iconUrl.startsWith("http")) {
          return { ...plugin, iconUrl: `${PLUGIN_MARKETPLACE_BASE_URL}/${plugin.iconUrl}` };
        }
        return plugin;
      }) as Plugin[];
      const builtinKeys = new Set(builtinPlugins.map((p) => p.key));
      const nonOverlapping = remotePlugins.filter((p) => !builtinKeys.has(p.key));
      let plugins = [...builtinPlugins, ...nonOverlapping];

      // Filter by category if provided
      if (category) {
        plugins = plugins.filter((p) => p.category === category);
      }

      return plugins;
    } catch (error: any) {
      console.error("[PluginService] Error fetching plugins:", error);
      throw new Error(`Failed to fetch plugins: ${error.message}`);
    }
  }

  /**
   * Get plugin by key
   */
  static async getPluginByKey(pluginKey: string): Promise<Plugin | null> {
    try {
      // Check built-in plugins first
      const builtinPlugin = getBuiltinPlugins().find(
        (p) => p.key === pluginKey && p.isPublished
      );
      if (builtinPlugin) {
        // Transform relative iconUrl to full URL
        if (builtinPlugin.iconUrl && !builtinPlugin.iconUrl.startsWith("http")) {
          return { ...builtinPlugin, iconUrl: `${PLUGIN_MARKETPLACE_BASE_URL}/${builtinPlugin.iconUrl}` } as Plugin;
        }
        return builtinPlugin as Plugin;
      }

      const marketplaceData = await this.fetchRemoteMarketplace();

      const plugin = marketplaceData.plugins.find(
        (p) => p.key === pluginKey && p.isPublished
      );

      return plugin || null;
    } catch (error: any) {
      console.error(
        `[PluginService] Error fetching plugin ${sanitizeForLog(pluginKey)}:`,
        error
      );
      throw new Error(`Failed to fetch plugin: ${error.message}`);
    }
  }

  /**
   * Search plugins by query
   */
  static async searchPlugins(query: string): Promise<Plugin[]> {
    try {
      const marketplaceData = await this.fetchRemoteMarketplace();

      const lowerQuery = query.toLowerCase();

      const matchFilter = (p: Plugin) =>
        p.isPublished &&
        (p.name.toLowerCase().includes(lowerQuery) ||
          p.description.toLowerCase().includes(lowerQuery) ||
          (p.tags || []).some((tag) => tag.toLowerCase().includes(lowerQuery)));

      // Include built-in plugins in search results
      const builtinMatches = (getBuiltinPlugins() as Plugin[]).filter(matchFilter);
      const builtinKeys = new Set(builtinMatches.map((p) => p.key));
      const remoteMatches = marketplaceData.plugins
        .filter(matchFilter)
        .filter((p) => !builtinKeys.has(p.key));

      const plugins = [...builtinMatches, ...remoteMatches];

      return plugins;
    } catch (error: any) {
      console.error("[PluginService] Error searching plugins:", error);
      throw new Error(`Failed to search plugins: ${error.message}`);
    }
  }

  /**
   * Install a plugin for a user
   */
  static async installPlugin(
    pluginKey: string,
    userId: number,
    organizationId: number
  ): Promise<any> {
    try {
      // Verify plugin exists in marketplace or built-in registry
      const plugin = await this.getPluginByKey(pluginKey);
      if (!plugin) {
        throw new NotFoundException(
          "Plugin not found in marketplace",
          "plugin",
          pluginKey
        );
      }

      // Skip remote code download for built-in plugins
      if (!isBuiltinPlugin(pluginKey)) {
        // Load and execute plugin install method
        const pluginCode = await this.loadPluginCode(plugin);
        if (pluginCode && typeof pluginCode.install === "function") {
          const context = {
            sequelize,
          };
          const result = await pluginCode.install(userId, organizationId, {}, context);
          console.log(
            `[PluginService] Plugin ${sanitizeForLog(pluginKey)} installed:`,
            result
          );
        }
      } else {
        console.log(`[PluginService] Built-in plugin ${sanitizeForLog(pluginKey)} installed (no remote download)`);
      }

      // Create installation record (only after successful plugin installation)
      const installation = await createInstallation(
        pluginKey,
        organizationId
      );

      return toJSON(installation);
    } catch (error: any) {
      console.error(
        `[PluginService] Error installing plugin ${sanitizeForLog(pluginKey)}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Uninstall a plugin
   */
  static async uninstallPlugin(
    installationId: number,
    userId: number,
    organizationId: number
  ): Promise<void> {
    try {
      const installation =
        await findByIdWithValidation(
          installationId,
          organizationId
        );

      // Skip remote code for built-in plugins
      if (!isBuiltinPlugin(installation.plugin_key)) {
        // Load plugin and execute uninstall method
        const plugin = await this.getPluginByKey(installation.plugin_key);
        if (plugin) {
          const pluginCode = await this.loadPluginCode(plugin);
          if (pluginCode && typeof pluginCode.uninstall === "function") {
            const context = {
              sequelize,
            };
            const result = await pluginCode.uninstall(
              userId,
              organizationId,
              context
            );
            console.log(
              `[PluginService] Plugin ${sanitizeForLog(installation.plugin_key)} uninstalled:`,
              result
            );
          }
        }
      } else {
        console.log(`[PluginService] Built-in plugin ${sanitizeForLog(installation.plugin_key)} uninstalled (no remote code)`);
      }

      // Delete installation record
      await deleteInstallation(installationId, organizationId);
    } catch (error: any) {
      console.error(
        `[PluginService] Error uninstalling plugin ${installationId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get installed plugins for an organization
   */
  static async getInstalledPlugins(
    organizationId: number
  ): Promise<any[]> {
    try {
      const installations = await getInstalledPlugins(
        organizationId
      );

      // Fetch plugin metadata from built-in registry or marketplace for each installation
      const pluginsWithMetadata = await Promise.all(
        installations.map(async (installation) => {
          // getPluginByKey already checks built-in plugins first
          const plugin = await this.getPluginByKey(installation.plugin_key);
          return {
            ...toJSON(installation),
            plugin: plugin || {
              key: installation.plugin_key,
              name: installation.plugin_key,
              description: "Plugin not found in marketplace",
            },
          };
        })
      );

      return pluginsWithMetadata;
    } catch (error: any) {
      console.error("[PluginService] Error fetching installed plugins:", error);
      throw error;
    }
  }

  /**
   * Get data from plugin data providers
   * This allows plugins to contribute data to core VerifyWise features
   * @param providerType - The type of data provider (e.g., "use-cases")
   * @param organizationId - The organization ID
   * @param sequelize - Sequelize instance for database access
   */
  static async getDataFromProviders(
    providerType: string,
    organizationId: number,
    sequelize: any
  ): Promise<any[]> {
    try {
      // Get all installed plugins for this organization
      const installations = await getInstalledPlugins(organizationId);
      const results: any[] = [];
      // Pass organizationId for shared-schema queries
      // Note: tenantId is deprecated but kept for backward compatibility with existing plugins

      for (const installation of installations) {
        if (installation.status !== "installed") continue;

        // Built-in plugins don't have remote code to load data providers from
        if (isBuiltinPlugin(installation.plugin_key)) continue;

        try {
          // Get plugin metadata from marketplace
          const pluginMeta = await this.getPluginByKey(installation.plugin_key);
          if (!pluginMeta) continue;

          // Load the plugin code
          const pluginCode = await this.loadPluginCode(pluginMeta);
          if (!pluginCode) continue;

          // Check if plugin has data providers
          const dataProviders = pluginCode.dataProviders;
          if (!dataProviders || !dataProviders[providerType]) continue;

          const provider = dataProviders[providerType];
          if (!provider.enabled) continue;

          // Call the provider's getData function
          console.log(`[PluginService] Fetching ${providerType} data from plugin: ${installation.plugin_key}`);
          const data = await provider.getData({ sequelize, organizationId });

          if (Array.isArray(data)) {
            results.push(...data);
          }
        } catch (pluginError: any) {
          console.error(`[PluginService] Error fetching data from plugin ${installation.plugin_key}:`, pluginError.message);
          // Continue with other plugins even if one fails
        }
      }

      return results;
    } catch (error: any) {
      console.error("[PluginService] Error in getDataFromProviders:", error);
      return [];
    }
  }

  /**
   * Get plugin categories
   */
  static async getCategories(): Promise<any[]> {
    try {
      const marketplaceData = await this.fetchRemoteMarketplace();

      const categories = marketplaceData.categories || [];

      // Merge categories from built-in plugins
      const builtinCategories = new Set(
        getBuiltinPlugins().map((p) => p.category)
      );
      const existingCategoryIds = new Set(categories.map((c: any) => c.id));

      for (const cat of builtinCategories) {
        if (!existingCategoryIds.has(cat)) {
          categories.push({
            id: cat,
            name: cat.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
            description: `${cat} plugins`,
          });
        }
      }

      return categories;
    } catch (error: any) {
      console.error("[PluginService] Error fetching categories:", error);
      throw error;
    }
  }

  /**
   * Update plugin configuration
   */
  static async updateConfiguration(
    installationId: number,
    userId: number,
    organizationId: number,
    configuration: Record<string, any>
  ): Promise<any> {
    try {
      // Verify installation exists
      const installation =
        await findByIdWithValidation(
          installationId,
          organizationId
        );

      // Validate that plugin is installed
      if (installation.status !== PluginInstallationStatus.INSTALLED) {
        throw new ValidationException(
          "Plugin must be installed before configuring",
          "installation_id",
          installationId
        );
      }

      // Update configuration
      const updated = await updateConfiguration(
        installationId,
        organizationId,
        configuration
      );

      // Load plugin and execute configure method if it exists (skip for built-in)
      if (!isBuiltinPlugin(installation.plugin_key)) {
        const plugin = await this.getPluginByKey(installation.plugin_key);
        if (plugin) {
          const pluginCode = await this.loadPluginCode(plugin);
          if (pluginCode && typeof pluginCode.configure === "function") {
            const context = {
              sequelize,
            };
            const result = await pluginCode.configure(
              userId,
              organizationId,
              configuration,
              context
            );
            console.log(
              `[PluginService] Plugin ${sanitizeForLog(installation.plugin_key)} configured:`,
              result
            );
          }
        }
      }

      return toJSON(updated);
    } catch (error: any) {
      console.error(
        `[PluginService] Error updating plugin configuration:`,
        error
      );
      throw error;
    }
  }

  /**
   * Test plugin connection
   */
  static async testConnection(
    pluginKey: string,
    configuration: Record<string, any>,
    context?: { userId: number; organizationId: number }
  ): Promise<any> {
    try {
      // Verify plugin exists in marketplace
      const plugin = await this.getPluginByKey(pluginKey);
      if (!plugin) {
        throw new NotFoundException(
          "Plugin not found in marketplace",
          "plugin",
          pluginKey
        );
      }

      // Load plugin and execute testConnection method if it exists
      const pluginCode = await this.loadPluginCode(plugin);
      if (pluginCode && typeof pluginCode.testConnection === "function") {
        const pluginContext = context ? { sequelize, ...context } : undefined;
        const result = await pluginCode.testConnection(configuration, pluginContext);
        console.log(
          `[PluginService] Plugin ${sanitizeForLog(pluginKey)} connection test:`,
          result
        );
        return result;
      }

      // If plugin doesn't implement testConnection, return not supported
      return {
        success: false,
        message: "Plugin does not support connection testing",
      };
    } catch (error: any) {
      console.error(
        `[PluginService] Error testing plugin connection:`,
        error
      );
      throw error;
    }
  }

  // ========== PRIVATE METHODS ==========

  /**
   * Download plugin's package.json from repository
   * Returns null if package.json doesn't exist (e.g., for pre-bundled framework plugins)
   */
  private static async downloadPluginPackageJson(plugin: Plugin, tempPath: string): Promise<any | null> {
    try {
      const baseUrl = PLUGIN_MARKETPLACE_URL.replace("/plugins.json", "");
      const packageJsonUrl = `${baseUrl}/${plugin.pluginPath}/package.json`;

      console.log(`[PluginService] Downloading package.json for ${sanitizeForLog(plugin.key)} from ${packageJsonUrl}`);

      const response = await axios.get(packageJsonUrl, {
        timeout: 10000,
        responseType: 'json',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

      // Save package.json to temp directory
      const packageJsonPath = path.join(tempPath, "package.json");
      fs.writeFileSync(packageJsonPath, JSON.stringify(response.data, null, 2));

      return response.data;
    } catch (error: any) {
      // If package.json doesn't exist (404), return null instead of throwing
      // This is expected for pre-bundled framework plugins that don't have dependencies
      if (error.response?.status === 404) {
        console.log(`[PluginService] No package.json found for plugin ${sanitizeForLog(plugin.key)} (pre-bundled plugin)`);
        return null;
      }
      const errMsg = error.isAxiosError
        ? `${error.message} (status: ${error.response?.status || 'N/A'}, url: ${error.config?.url || 'N/A'})`
        : error.message;
      console.error(`[PluginService] Error downloading package.json for ${sanitizeForLog(plugin.key)}: ${errMsg}`);
      throw new Error(`Failed to download package.json: ${error.message}`);
    }
  }

  /**
   * Install plugin dependencies using npm
   */
  private static async installPluginDependencies(plugin: Plugin, tempPath: string, packageJson: any): Promise<void> {
    try {
      if (!packageJson.dependencies || Object.keys(packageJson.dependencies).length === 0) {
        console.log(`[PluginService] No dependencies to install for plugin ${sanitizeForLog(plugin.key)}`);
        return;
      }

      const dependenciesCount = Object.keys(packageJson.dependencies).length;
      console.log(`[PluginService] Installing ${dependenciesCount} dependencies for plugin ${sanitizeForLog(plugin.key)}...`);

      // Check if node_modules already exists and dependencies are installed
      const nodeModulesPath = path.join(tempPath, "node_modules");
      const packageLockPath = path.join(tempPath, "package-lock.json");

      // If dependencies are already installed and package-lock exists, skip installation
      if (fs.existsSync(nodeModulesPath) && fs.existsSync(packageLockPath)) {
        console.log(`[PluginService] Dependencies already installed for plugin ${sanitizeForLog(plugin.key)}`);
        return;
      }

      // Install dependencies using npm
      // Use --prefer-offline to speed up if packages are in npm cache
      // Use --no-audit --no-fund to skip unnecessary checks
      const npmCommand = `npm install --prefer-offline --no-audit --no-fund --production`;

      console.log(`[PluginService] Running: ${npmCommand} in ${tempPath}`);

      execSync(npmCommand, {
        cwd: tempPath,
        stdio: 'pipe', // Suppress output unless there's an error
        timeout: 60000, // 60 second timeout
      });

      console.log(`[PluginService] Successfully installed dependencies for plugin ${sanitizeForLog(plugin.key)}`);
    } catch (error: any) {
      console.error(`[PluginService] Error installing dependencies for ${sanitizeForLog(plugin.key)}:`, error);
      throw new Error(`Failed to install plugin dependencies: ${error.message}`);
    }
  }

  /**
   * Download plugin UI bundle from marketplace
   */
  private static async downloadPluginUIBundle(plugin: Plugin, tempPath: string): Promise<void> {
    if (!plugin.ui?.bundleUrl) {
      return;
    }

    try {
      const baseUrl = PLUGIN_MARKETPLACE_URL.replace("/plugins.json", "");
      // bundleUrl is like "/api/plugins/mlflow/ui/dist/index.esm.js" for frontend
      // Strip /api prefix for GitHub download path
      const repoPath = plugin.ui.bundleUrl.replace(/^\/api/, "");
      const bundleUrl = `${baseUrl}${repoPath}`;

      console.log(`[PluginService] Downloading UI bundle for ${sanitizeForLog(plugin.key)} from ${bundleUrl}`);

      const response = await axios.get(bundleUrl, {
        timeout: 30000,
        responseType: 'text',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

      // Create the ui/dist directory
      const uiDistPath = path.join(tempPath, "ui", "dist");
      fs.mkdirSync(uiDistPath, { recursive: true });

      // Save the bundle
      const bundleFileName = path.basename(plugin.ui.bundleUrl);
      const bundlePath = path.join(uiDistPath, bundleFileName);
      fs.writeFileSync(bundlePath, response.data);

      console.log(`[PluginService] UI bundle for ${sanitizeForLog(plugin.key)} downloaded to ${bundlePath}`);
    } catch (error: any) {
      // UI bundle download failure should not block plugin installation
      console.warn(`[PluginService] Failed to download UI bundle for ${sanitizeForLog(plugin.key)}:`, error.message);
    }
  }

  /**
   * Fetch marketplace data from remote Git repository
   */
  private static async fetchRemoteMarketplace(): Promise<PluginMarketplace> {
    try {
      const response = await axios.get(PLUGIN_MARKETPLACE_URL, {
        timeout: 10000,
        headers: {
          "Accept": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        },
      });

      const data = response.data as PluginMarketplace;

      // Transform relative iconUrl paths to full URLs and normalize optional array fields
      data.plugins = data.plugins.map((plugin) => {
        if (plugin.iconUrl && !plugin.iconUrl.startsWith("http")) {
          plugin.iconUrl = `${PLUGIN_MARKETPLACE_BASE_URL}/${plugin.iconUrl}`;
        }
        plugin.tags = plugin.tags || [];
        plugin.features = plugin.features || [];
        return plugin;
      });

      return data;
    } catch (error: any) {
      console.error("[PluginService] Error fetching remote marketplace:", error);
      throw new Error(`Failed to fetch remote marketplace: ${error.message}`);
    }
  }

  /**
   * Load plugin code from remote Git repository
   * Downloads and executes plugin code from the marketplace
   */
  private static async loadPluginCode(plugin: Plugin): Promise<any> {
    try {
      const pluginCode = await this.downloadAndLoadPlugin(plugin);
      return pluginCode;
    } catch (error: any) {
      console.error(
        `[PluginService] Error loading plugin ${sanitizeForLog(plugin.key)}: ${error.message}`
      );
      throw new Error(`Failed to load plugin code: ${error.message}`);
    }
  }

  /**
   * Download plugin code from Git repository and load it
   * Caches the downloaded code and dependencies for 5 days to avoid unnecessary re-downloads
   */
  private static async downloadAndLoadPlugin(plugin: Plugin): Promise<any> {
    try {
      // Guard: built-in plugins should never reach here — they don't have remote code
      if (plugin.pluginPath === "__builtin__" || plugin.entryPoint === "__builtin__") {
        throw new Error(
          `Built-in plugin '${sanitizeForLog(plugin.key)}' cannot be downloaded. ` +
          `Ensure callers check isBuiltinPlugin() before calling loadPluginCode().`
        );
      }

      // 1. Setup paths
      const tempPath = path.join(__dirname, "../../../temp/plugins", plugin.key);
      const entryPointPath = path.join(tempPath, plugin.entryPoint);

      // 2. Check if cached version exists and is less than 5 days old
      // Note: package.json is optional (pre-bundled plugins don't have it)
      const CACHE_DURATION_MS = 5 * 24 * 60 * 60 * 1000; // 5 days in milliseconds
      let shouldDownload = true;

      if (fs.existsSync(entryPointPath)) {
        const stats = fs.statSync(entryPointPath);
        const fileAge = Date.now() - stats.mtimeMs;

        if (fileAge < CACHE_DURATION_MS) {
          shouldDownload = false;
          console.log(`[PluginService] Using cached plugin ${sanitizeForLog(plugin.key)} (age: ${Math.round(fileAge / (1000 * 60 * 60))} hours)`);
        } else {
          console.log(`[PluginService] Cache expired for plugin ${sanitizeForLog(plugin.key)} (age: ${Math.round(fileAge / (1000 * 60 * 60 * 24))} days)`);
        }
      }

      // 3. Download and setup if needed
      if (shouldDownload) {
        // Create temp directory
        fs.mkdirSync(tempPath, { recursive: true });

        // 3a. Download package.json (optional - may not exist for pre-bundled plugins)
        const packageJson = await this.downloadPluginPackageJson(plugin, tempPath);

        // 3b. Download plugin entry point
        const baseUrl = PLUGIN_MARKETPLACE_URL.replace("/plugins.json", "");
        const pluginUrl = `${baseUrl}/${plugin.pluginPath}/${plugin.entryPoint}`;

        console.log(`[PluginService] Downloading plugin ${sanitizeForLog(plugin.key)} from ${pluginUrl}`);

        const response = await axios.get(pluginUrl, {
          timeout: 10000,
          responseType: 'text',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
        });

        // Ensure parent directory exists for entry point (handles nested paths like dist/index.js)
        const entryPointDir = path.dirname(entryPointPath);
        fs.mkdirSync(entryPointDir, { recursive: true });

        fs.writeFileSync(entryPointPath, response.data);

        console.log(`[PluginService] Plugin ${sanitizeForLog(plugin.key)} downloaded and cached`);

        // 3c. Install dependencies (only if package.json exists)
        if (packageJson) {
          await this.installPluginDependencies(plugin, tempPath, packageJson);
        }

        // 3d. Download UI bundle if plugin has UI configuration
        if (plugin.ui?.bundleUrl) {
          await this.downloadPluginUIBundle(plugin, tempPath);
        }
      }

      // 4. Register ts-node for TypeScript support if entry point is .ts
      if (plugin.entryPoint.endsWith(".ts")) {
        try {
          require("ts-node/register");
        } catch (error) {
          console.warn(
            "[PluginService] ts-node not available, attempting to load TypeScript file directly"
          );
        }
      }

      // 5. Add plugin's node_modules to require paths so dependencies can be resolved
      const pluginNodeModulesPath = path.join(tempPath, "node_modules");
      if (fs.existsSync(pluginNodeModulesPath)) {
        // Add to module paths for this specific require
        const Module = require('module');
        const originalResolveLookupPaths = Module._resolveLookupPaths;

        Module._resolveLookupPaths = function(request: string, parent: any) {
          const paths = originalResolveLookupPaths.call(this, request, parent);
          if (paths && !paths.includes(pluginNodeModulesPath)) {
            paths.push(pluginNodeModulesPath);
          }
          return paths;
        };
      }

      // 6. Clear require cache to ensure fresh load
      delete require.cache[require.resolve(entryPointPath)];

      // 7. Load the plugin code
      const pluginCode = require(entryPointPath);
      return pluginCode;
    } catch (error: any) {
      const errMsg = error.isAxiosError
        ? `${error.message} (status: ${error.response?.status || 'N/A'}, url: ${error.config?.url || 'N/A'})`
        : error.message;
      console.error(`[PluginService] Error downloading plugin ${sanitizeForLog(plugin.key)}: ${errMsg}`);
      throw new Error(`Failed to download plugin: ${error.message}`);
    }
  }

  /**
   * Forward a request to a plugin's router
   * This is the generic routing mechanism that allows plugins to define their own routes
   *
   * @param pluginKey - The plugin key (e.g., "mlflow", "slack", "risk-import")
   * @param context - The request context containing all request details
   * @returns The plugin's response
   */
  static async forwardToPlugin(
    pluginKey: string,
    context: PluginRouteContext
  ): Promise<PluginRouteResponse> {
    try {
      // Check if plugin is installed for this organization
      const installation = await findByPlugin(pluginKey, context.organizationId);
      if (!installation) {
        throw new NotFoundException(`Plugin '${pluginKey}' is not installed`);
      }

      // Get plugin from marketplace or built-in registry
      const plugin = await this.getPluginByKey(pluginKey);
      if (!plugin) {
        throw new NotFoundException(`Plugin '${pluginKey}' not found in marketplace`);
      }

      // Built-in plugins don't use the generic forwarding mechanism
      if (isBuiltinPlugin(pluginKey)) {
        throw new Error(`Built-in plugin '${pluginKey}' does not support route forwarding`);
      }

      // Load plugin code
      const pluginCode = await this.loadPluginCode(plugin);
      if (!pluginCode) {
        throw new Error(`Failed to load plugin code for '${pluginKey}'`);
      }

      // Check if plugin exports a router
      if (!pluginCode.router || typeof pluginCode.router !== "object") {
        throw new NotFoundException(
          `Plugin '${pluginKey}' does not export a router. ` +
          `Ensure the plugin exports: export const router: PluginRouter = { ... }`
        );
      }

      const router: PluginRouter = pluginCode.router;

      // Add plugin configuration to context
      context.configuration = installation.configuration || {};
      context.sequelize = sequelize;

      // Find matching route handler
      const handler = this.matchRoute(router, context.method, context.path, context.params);

      if (!handler) {
        // List available routes for debugging
        const availableRoutes = Object.keys(router).join(", ");
        throw new NotFoundException(
          `Route '${context.method} ${context.path}' not found in plugin '${pluginKey}'. ` +
          `Available routes: ${availableRoutes || "none"}`
        );
      }

      // Execute the handler
      console.log(
        `[PluginService] Forwarding request to plugin: ${sanitizeForLog(pluginKey)}`,
        { method: context.method, path: context.path }
      );

      const response = await handler(context);

      console.log(
        `[PluginService] Plugin '${sanitizeForLog(pluginKey)}' responded:`,
        { status: response.status || 200, hasData: !!response.data, hasBuffer: !!response.buffer }
      );

      return response;
    } catch (error: any) {
      console.error(
        "[PluginService] Error forwarding to plugin:",
        { pluginKey: sanitizeForLog(pluginKey), method: context.method, path: context.path, error: error.message }
      );
      throw error;
    }
  }

  /**
   * Match a route pattern to a handler in the plugin router
   * Supports path parameters like /models/:modelId
   *
   * @param router - The plugin's router object
   * @param method - HTTP method (GET, POST, etc.)
   * @param path - The request path (e.g., /models/123)
   * @param params - Object to populate with extracted path parameters
   * @returns The matched handler function or null
   */
  private static matchRoute(
    router: PluginRouter,
    method: string,
    path: string,
    params: Record<string, string>
  ): ((context: PluginRouteContext) => Promise<PluginRouteResponse>) | null {
    const normalizedMethod = method.toUpperCase();
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    // First, try exact match
    const exactKey = `${normalizedMethod} ${normalizedPath}`;
    if (router[exactKey]) {
      return router[exactKey];
    }

    // Then, try pattern matching for routes with parameters
    for (const [routeKey, handler] of Object.entries(router)) {
      const [routeMethod, routePattern] = routeKey.split(" ");

      if (routeMethod.toUpperCase() !== normalizedMethod) {
        continue;
      }

      // Check if this is a pattern with parameters (contains :)
      if (!routePattern.includes(":")) {
        // Exact match only
        if (routePattern === normalizedPath) {
          return handler;
        }
        continue;
      }

      // Pattern matching with parameters
      const patternParts = routePattern.split("/").filter(Boolean);
      const pathParts = normalizedPath.split("/").filter(Boolean);

      if (patternParts.length !== pathParts.length) {
        continue;
      }

      let isMatch = true;
      const extractedParams: Record<string, string> = {};

      for (let i = 0; i < patternParts.length; i++) {
        const patternPart = patternParts[i];
        const pathPart = pathParts[i];

        if (patternPart.startsWith(":")) {
          // This is a parameter - extract it
          const paramName = patternPart.slice(1);
          extractedParams[paramName] = pathPart;
        } else if (patternPart !== pathPart) {
          // Static part doesn't match
          isMatch = false;
          break;
        }
      }

      if (isMatch) {
        // Populate params object with extracted values
        Object.assign(params, extractedParams);
        return handler;
      }
    }

    return null;
  }
}
