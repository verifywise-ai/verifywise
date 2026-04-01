# Plugin System

## Overview

VerifyWise implements a remote plugin marketplace system that allows organizations to extend platform functionality. Plugins are fetched from a remote Git repository, downloaded and cached locally, and dynamically loaded at runtime. The system supports multi-tenant isolation, configuration management, and OAuth integrations.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PLUGIN SYSTEM FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                       │
│  │   Plugin         │  1. GET /plugins/marketplace                          │
│  │   Marketplace    │◄─────────────────────────────────────────────────┐    │
│  │   (GitHub)       │                                                  │    │
│  └────────┬─────────┘                                                  │    │
│           │                                                            │    │
│           │ 2. plugins.json                                            │    │
│           ▼                                                            │    │
│  ┌──────────────────┐     ┌──────────────────┐                        │    │
│  │  PluginService   │────►│  Local Cache     │                        │    │
│  │  (Backend)       │     │  (temp/plugins/) │                        │    │
│  └────────┬─────────┘     │  5-day TTL       │                        │    │
│           │               └──────────────────┘                        │    │
│           │                                                            │    │
│           │ 3. Download plugin code + dependencies                     │    │
│           ▼                                                            │    │
│  ┌──────────────────┐                                                  │    │
│  │  Plugin Code     │                                                  │    │
│  │  Execution       │                                                  │    │
│  │  (require())     │                                                  │    │
│  └────────┬─────────┘                                                  │    │
│           │                                                            │    │
│           │ 4. install()/uninstall()/configure()                       │    │
│           ▼                                                            │    │
│  ┌──────────────────────────────────────────────────────────────────┐ │    │
│  │                    Tenant Schema                                  │ │    │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │    │
│  │  │  plugin_installations                                        │ │ │    │
│  │  │  ├── id, plugin_key, status, configuration                   │ │ │    │
│  │  │  └── installed_at, error_message, metadata                   │ │ │    │
│  │  └─────────────────────────────────────────────────────────────┘ │ │    │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │    │
│  │  │  Plugin-specific tables (e.g., mlflow_model_records)         │ │ │    │
│  │  └─────────────────────────────────────────────────────────────┘ │ │    │
│  └──────────────────────────────────────────────────────────────────┘ │    │
│                                                                        │    │
│  ┌──────────────────┐                                                  │    │
│  │   Frontend       │──────────────────────────────────────────────────┘    │
│  │   (React)        │  API calls via plugin.repository.ts                   │
│  └──────────────────┘                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Marketplace

### Remote Repository

Plugins are stored in a separate GitHub repository:

```
Repository: bluewave-labs/plugin-marketplace
Manifest URL: https://raw.githubusercontent.com/bluewave-labs/plugin-marketplace/main/plugins.json
```

### Manifest Structure

```json
{
  "version": "1.0.0",
  "plugins": [
    {
      "key": "mlflow",
      "name": "mlflow",
      "displayName": "MLflow Integration",
      "description": "Sync AI/ML models from MLflow tracking server",
      "longDescription": "Full description for detail page...",
      "version": "1.0.0",
      "author": "VerifyWise",
      "category": "ml_ops",
      "iconUrl": "https://example.com/mlflow-icon.png",
      "documentationUrl": "https://docs.example.com/mlflow",
      "supportUrl": "https://support.example.com",
      "isOfficial": true,
      "isPublished": true,
      "requiresConfiguration": true,
      "installationType": "npm",
      "features": [
        {
          "name": "Model Sync",
          "description": "Automatically sync models from MLflow",
          "displayOrder": 1
        }
      ],
      "tags": ["mlflow", "ml", "model-tracking"],
      "pluginPath": "plugins/mlflow",
      "entryPoint": "index.ts",
      "dependencies": {
        "axios": "^1.6.0"
      }
    }
  ],
  "categories": [
    {
      "id": "ml_ops",
      "name": "ML Operations",
      "description": "Machine learning operations and model management"
    }
  ]
}
```

### Plugin Categories

| Category | ID | Description |
|----------|-----|-------------|
| Communication | `communication` | Slack, email integrations |
| ML Operations | `ml_ops` | MLflow, model tracking |
| Version Control | `version_control` | GitHub, GitLab |
| Monitoring | `monitoring` | Observability tools |
| Security | `security` | Security scanning |
| Data Management | `data_management` | Risk import, data tools |
| Analytics | `analytics` | Reporting, dashboards |
| Compliance | `compliance` | Compliance frameworks (GDPR, SOC2, etc.) |

### Framework Plugin Fields

Framework plugins (category: `compliance`) have additional fields:

| Field | Type | Description |
|-------|------|-------------|
| `region` | string | Geographic region (e.g., "United States", "European Union") |
| `frameworkType` | string | `"organizational"` or `"project"` |

**Framework Types:**

- **`organizational`**: Applies to entire organization. One org-level project contains all organizational frameworks. Used for legal requirements (GDPR, CCPA), certifications (SOC 2, ISO 27001), and org-wide standards.

- **`project`**: Applies to specific projects based on their needs. Different projects can have different frameworks. Used for PCI-DSS (payment projects), HIPAA (healthcare projects), AI Ethics (AI/ML projects).

---

## Database Schema

### Plugin Installations Table

Each tenant has a `plugin_installations` table in their schema:

```sql
CREATE TABLE "{tenantId}".plugin_installations (
    id SERIAL PRIMARY KEY,
    plugin_key VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'installed'
        CHECK (status IN ('installed')),
    installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    error_message TEXT,
    configuration JSONB,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups
CREATE INDEX idx_plugin_installations_key_{tenantId}
    ON "{tenantId}".plugin_installations(plugin_key);
```

### Migration

**File:** `Servers/database/migrations/20251226151729-create-plugin-installations-table.js`

The migration creates the table once in the `verifywise` schema:

```javascript
async up(queryInterface, Sequelize) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.plugin_installations (
        ...
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE
      )
    `, { transaction });

    await queryInterface.sequelize.query(`
      CREATE INDEX idx_plugin_installations_key
      ON verifywise.plugin_installations(plugin_key);
      CREATE INDEX idx_plugin_installations_org
      ON verifywise.plugin_installations(organization_id);
    `, { transaction });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

---

## Backend Implementation

### Enums

**File:** `Servers/domain.layer/enums/plugin.enum.ts`

```typescript
export enum PluginInstallationStatus {
  INSTALLED = "installed",
}
```

### Interfaces

**File:** `Servers/domain.layer/interfaces/i.pluginInstallation.ts`

```typescript
export interface IPluginInstallation {
  id?: number;
  plugin_key: string;              // References plugin from marketplace by key
  status: PluginInstallationStatus;
  installed_at?: Date;
  uninstalled_at?: Date;
  error_message?: string;
  configuration?: any;             // JSONB - plugin-specific config
  metadata?: any;                  // JSONB - additional data
  created_at?: Date;
  updated_at?: Date;
}
```

### Model Class

**File:** `Servers/domain.layer/models/plugin/pluginInstallation.model.ts`

Uses raw SQL queries to interact with tenant-scoped tables:

```typescript
export class PluginInstallationModel {
  // Create a new plugin installation
  static async createInstallation(
    plugin_key: string,
    organization_id: number
  ): Promise<IPluginInstallation>;

  // Find installation by plugin key
  static async findByPlugin(
    plugin_key: string,
    organization_id: number
  ): Promise<IPluginInstallation | null>;

  // Get all installed plugins for an organization
  static async getInstalledPlugins(
    organization_id: number
  ): Promise<IPluginInstallation[]>;

  // Find installation by ID
  static async findById(
    id: number,
    organization_id: number
  ): Promise<IPluginInstallation | null>;

  // Find installation by ID with validation (throws if not found)
  static async findByIdWithValidation(
    id: number,
    organization_id: number
  ): Promise<IPluginInstallation>;

  // Update installation status
  static async updateStatus(
    id: number,
    organization_id: number,
    status: PluginInstallationStatus
  ): Promise<IPluginInstallation>;

  // Delete installation
  static async delete(
    id: number,
    organization_id: number
  ): Promise<void>;

  // Update configuration
  static async updateConfiguration(
    id: number,
    organization_id: number,
    configuration: any
  ): Promise<IPluginInstallation>;

  // Convert snake_case to camelCase for frontend
  static toJSON(installation: IPluginInstallation): any;
}
```

### Database Utilities

**File:** `Servers/utils/pluginInstallation.utils.ts`

Provides utility functions that use `tenantId` string directly:

```typescript
// Create a new plugin installation
export async function createInstallation(
  plugin_key: string,
  tenantId: string
): Promise<IPluginInstallation>;

// Find installation by plugin key
export async function findByPlugin(
  plugin_key: string,
  tenantId: string
): Promise<IPluginInstallation | null>;

// Get all installed plugins for a tenant
export async function getInstalledPlugins(
  tenantId: string
): Promise<IPluginInstallation[]>;

// Find installation by ID
export async function findById(
  id: number,
  tenantId: string
): Promise<IPluginInstallation | null>;

// Find installation by ID with validation (throws NotFoundException if not found)
export async function findByIdWithValidation(
  id: number,
  tenantId: string
): Promise<IPluginInstallation>;

// Update installation status
export async function updateStatus(
  id: number,
  tenantId: string,
  status: PluginInstallationStatus
): Promise<IPluginInstallation>;

// Delete installation
export async function deleteInstallation(
  id: number,
  tenantId: string
): Promise<void>;

// Update configuration
export async function updateConfiguration(
  id: number,
  tenantId: string,
  configuration: any
): Promise<IPluginInstallation>;

// Convert snake_case to camelCase for frontend
export function toJSON(installation: IPluginInstallation): any {
  return {
    id: installation.id,
    pluginKey: installation.plugin_key,
    status: installation.status,
    installedAt: installation.installed_at,
    uninstalledAt: installation.uninstalled_at,
    errorMessage: installation.error_message,
    configuration: installation.configuration,
    metadata: installation.metadata,
    createdAt: installation.created_at,
    updatedAt: installation.updated_at,
  };
}
```

### Plugin Service

**File:** `Servers/services/plugin/pluginService.ts`

Core service handling all plugin operations:

#### Public Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `getAllPlugins` | `category?: string` | `Plugin[]` | Fetch all published plugins from marketplace |
| `getPluginByKey` | `pluginKey: string` | `Plugin \| null` | Get single plugin by key |
| `searchPlugins` | `query: string` | `Plugin[]` | Search by name, description, tags |
| `installPlugin` | `pluginKey, userId, tenantId` | `IPluginInstallation` | Install plugin and execute `install()` |
| `uninstallPlugin` | `installationId, userId, tenantId` | `void` | Uninstall and execute `uninstall()` |
| `getInstalledPlugins` | `tenantId` | `PluginInstallation[]` | List installed with marketplace metadata |
| `getCategories` | - | `Category[]` | Get plugin categories |
| `updateConfiguration` | `installationId, userId, tenantId, config` | `IPluginInstallation` | Update config and call `configure()` |
| `testConnection` | `pluginKey, configuration, context?` | `{success, message}` | Test plugin connection |
| `forwardToPlugin` | `pluginKey, context` | `PluginRouteResponse` | Forward request to plugin's router |

**Note:** Plugin-specific methods (OAuth, MLflow, Risk Import) are no longer in PluginService. All plugin functionality is now handled via the generic `forwardToPlugin` method which routes requests to plugin-defined handlers.

#### Private Methods

| Method | Description |
|--------|-------------|
| `fetchRemoteMarketplace()` | Fetch plugins.json from GitHub |
| `loadPluginCode(plugin)` | Download and require plugin code |
| `downloadAndLoadPlugin(plugin)` | Download, cache, install deps, load |
| `downloadPluginPackageJson(plugin, tempPath)` | Download package.json |
| `installPluginDependencies(plugin, tempPath, packageJson)` | Run `npm install` |
| `matchRoute(router, method, path, params)` | Match incoming request to plugin route handler |

#### Plugin Loading Flow

```typescript
private static async downloadAndLoadPlugin(plugin: Plugin): Promise<any> {
  // 1. Setup paths
  const tempPath = path.join(__dirname, "../../../temp/plugins", plugin.key);
  const entryPointPath = path.join(tempPath, plugin.entryPoint);

  // 2. Check cache (5-day TTL)
  const CACHE_DURATION_MS = 5 * 24 * 60 * 60 * 1000;
  let shouldDownload = true;

  if (fs.existsSync(entryPointPath)) {
    const stats = fs.statSync(entryPointPath);
    if (Date.now() - stats.mtimeMs < CACHE_DURATION_MS) {
      shouldDownload = false;
    }
  }

  // 3. Download if needed
  if (shouldDownload) {
    fs.mkdirSync(tempPath, { recursive: true });

    // 3a. Download package.json
    const packageJson = await this.downloadPluginPackageJson(plugin, tempPath);

    // 3b. Download entry point
    const baseUrl = PLUGIN_MARKETPLACE_URL.replace("/plugins.json", "");
    const pluginUrl = `${baseUrl}/${plugin.pluginPath}/${plugin.entryPoint}`;
    const response = await axios.get(pluginUrl);
    fs.writeFileSync(entryPointPath, response.data);

    // 3c. Install dependencies
    await this.installPluginDependencies(plugin, tempPath, packageJson);
  }

  // 4. Register ts-node for TypeScript support
  if (plugin.entryPoint.endsWith(".ts")) {
    require("ts-node/register");
  }

  // 5. Add plugin's node_modules to require paths
  const pluginNodeModulesPath = path.join(tempPath, "node_modules");
  if (fs.existsSync(pluginNodeModulesPath)) {
    const Module = require('module');
    const originalResolveLookupPaths = Module._resolveLookupPaths;
    Module._resolveLookupPaths = function(request, parent) {
      const paths = originalResolveLookupPaths.call(this, request, parent);
      if (paths && !paths.includes(pluginNodeModulesPath)) {
        paths.push(pluginNodeModulesPath);
      }
      return paths;
    };
  }

  // 6. Clear require cache and load
  delete require.cache[require.resolve(entryPointPath)];
  return require(entryPointPath);
}
```

#### Dependency Installation

```typescript
private static async installPluginDependencies(
  plugin: Plugin,
  tempPath: string,
  packageJson: any
): Promise<void> {
  if (!packageJson.dependencies || Object.keys(packageJson.dependencies).length === 0) {
    return;
  }

  const nodeModulesPath = path.join(tempPath, "node_modules");
  if (fs.existsSync(nodeModulesPath)) {
    return; // Already installed
  }

  // Install using npm
  execSync("npm install --prefer-offline --no-audit --no-fund --production", {
    cwd: tempPath,
    stdio: "pipe",
    timeout: 60000, // 60 second timeout
  });
}
```

### Controller

**File:** `Servers/controllers/plugin.ctrl.ts`

HTTP request handlers with structured logging:

| Function | HTTP | Description |
|----------|------|-------------|
| `getAllPlugins` | GET /marketplace | List marketplace plugins |
| `getPluginByKey` | GET /marketplace/:key | Get single plugin |
| `searchPlugins` | GET /marketplace/search | Search plugins |
| `installPlugin` | POST /install | Install plugin |
| `uninstallPlugin` | DELETE /installations/:id | Uninstall plugin |
| `getInstalledPlugins` | GET /installations | List installed |
| `getCategories` | GET /categories | List categories |
| `updatePluginConfiguration` | PUT /installations/:id/configuration | Update config |
| `testPluginConnection` | POST /:key/test-connection | Test connection |
| `forwardToPlugin` | ALL /:key/* | Forward to plugin router |

**Note:** Plugin-specific controllers (OAuth, MLflow, Risk Import) have been removed. The `forwardToPlugin` controller handles all plugin-specific requests by forwarding them to the plugin's `router` export.

#### Request Context

Controllers extract user context from JWT middleware:

```typescript
const userId = (req as any).userId;
const organizationId = (req as any).organizationId;
const tenantId = (req as any).tenantId;
```

#### Response Format

All responses use `STATUS_CODE` helper:

```typescript
return res.status(200).json(STATUS_CODE[200](data));
return res.status(201).json(STATUS_CODE[201](data));
return res.status(400).json(STATUS_CODE[400]("Error message"));
return res.status(401).json(STATUS_CODE[401]("User not authenticated"));
return res.status(404).json(STATUS_CODE[404]("Not found"));
return res.status(500).json(STATUS_CODE[500](error.message));
```

#### Structured Logging

```typescript
logStructured("processing", "starting getAllPlugins", functionName, fileName);
logStructured("successful", `${plugins.length} plugins found`, functionName, fileName);
logStructured("error", "failed to retrieve plugins", functionName, fileName);
```

### Routes

**File:** `Servers/routes/plugin.route.ts`

```typescript
import express from "express";
import rateLimit from "express-rate-limit";
import authenticateJWT from "../middleware/auth.middleware";

const router = express.Router();

// Rate limiter for plugin installation (prevent abuse)
const installPluginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 20, // limit each IP to 20 install requests per hour
  message: {
    error: "Too many plugin installation requests from this IP, please try again after an hour.",
  },
});

// Marketplace routes
router.get("/marketplace", authenticateJWT, getAllPlugins);
router.get("/marketplace/:key", authenticateJWT, getPluginByKey);
router.get("/marketplace/search", authenticateJWT, searchPlugins);
router.get("/categories", authenticateJWT, getCategories);

// Installation management routes
router.post("/install", authenticateJWT, installPluginLimiter, installPlugin);
router.delete("/installations/:id", authenticateJWT, uninstallPlugin);
router.get("/installations", authenticateJWT, getInstalledPlugins);
router.put("/installations/:id/configuration", authenticateJWT, updatePluginConfiguration);
router.post("/:key/test-connection", authenticateJWT, testPluginConnection);

// Plugin UI bundles
router.get("/:key/ui/dist/:filename", servePluginUIBundle);

// Generic plugin router - forwards all requests to plugin-defined routes
// Plugins export a `router` object that maps route patterns to handlers
router.all("/:key/*", authenticateJWT, forwardToPlugin);

export default router;
```

**Note:** The generic `/:key/*` route forwards requests to plugin-defined routes. Plugins define their own API endpoints via the `router` export. No plugin-specific routes are hardcoded in the backend.

---

## API Endpoints

**Base Path:** `/api/plugins`

### Marketplace

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/marketplace` | List all published plugins | JWT |
| GET | `/marketplace/:key` | Get plugin by key | JWT |
| GET | `/marketplace/search?q=` | Search plugins | JWT |
| GET | `/categories` | Get plugin categories | JWT |

### Installation Management

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/install` | Install plugin | JWT |
| GET | `/installations` | List installed plugins | JWT |
| DELETE | `/installations/:id` | Uninstall plugin | JWT |
| PUT | `/installations/:id/configuration` | Update configuration | JWT |
| POST | `/:key/test-connection` | Test plugin connection | JWT |

### Generic Plugin Router

All plugin-specific endpoints are handled via a generic router. Plugins define their own routes via the `router` export.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| ALL | `/:key/*` | Forward to plugin's router | JWT |

**Examples:**

| Request | Plugin Route Handler |
|---------|---------------------|
| `GET /api/plugins/mlflow/models` | MLflow plugin's `GET /models` |
| `POST /api/plugins/mlflow/sync` | MLflow plugin's `POST /sync` |
| `GET /api/plugins/slack/oauth/workspaces` | Slack plugin's `GET /oauth/workspaces` |
| `DELETE /api/plugins/slack/oauth/workspaces/123` | Slack plugin's `DELETE /oauth/workspaces/:webhookId` |
| `GET /api/plugins/risk-import/template` | Risk Import plugin's `GET /template` |
| `POST /api/plugins/risk-import/import` | Risk Import plugin's `POST /import` |

### Rate Limiting

| Endpoint | Limit |
|----------|-------|
| Plugin installation | 20 req/hour per IP |

---

## Plugin Interface

Plugins must export functions that the system calls during lifecycle events, and a `router` object for custom API endpoints.

### Required Methods

```typescript
/**
 * Called when plugin is installed
 * Use to create database tables, initialize data
 */
export async function install(
  userId: number,
  tenantId: string,
  config: Record<string, any>,
  context: { sequelize: Sequelize }
): Promise<{ success: boolean; message?: string }>;

/**
 * Called when plugin is uninstalled
 * Use to clean up database tables, remove data
 */
export async function uninstall(
  userId: number,
  tenantId: string,
  context: { sequelize: Sequelize }
): Promise<{ success: boolean; message?: string }>;
```

### Optional Lifecycle Methods

```typescript
/**
 * Called when configuration is updated
 */
export async function configure(
  userId: number,
  tenantId: string,
  configuration: Record<string, any>,
  context: { sequelize: Sequelize }
): Promise<{ success: boolean; message?: string }>;

/**
 * Called to test plugin connection
 */
export async function testConnection(
  configuration: Record<string, any>,
  context?: { sequelize: Sequelize; userId: number; tenantId: string }
): Promise<{ success: boolean; message: string }>;
```

### Plugin Router (Required for Custom API Endpoints)

Plugins define their own API routes via the `router` export. The backend forwards requests to the appropriate handler based on the route pattern.

```typescript
/**
 * Context passed to route handlers
 */
interface PluginRouteContext {
  tenantId: string;
  userId: number;
  organizationId: number;
  method: string;           // HTTP method (GET, POST, etc.)
  path: string;             // Route path (e.g., /models, /sync)
  params: Record<string, string>;  // URL params (e.g., { modelId: "123" })
  query: Record<string, any>;      // Query string params
  body: any;                       // Request body
  sequelize: any;                  // Database connection
  configuration: Record<string, any>; // Plugin configuration
}

/**
 * Response format for route handlers
 */
interface PluginRouteResponse {
  status?: number;           // HTTP status code (default 200)
  data?: any;                // JSON response data
  buffer?: any;              // Binary data for file downloads
  filename?: string;         // Filename for Content-Disposition header
  contentType?: string;      // Custom content type
  headers?: Record<string, string>; // Additional response headers
}

/**
 * Plugin router - maps route patterns to handler functions
 * Format: "METHOD /path" -> handler function
 */
export const router: Record<string, (ctx: PluginRouteContext) => Promise<PluginRouteResponse>> = {
  "GET /models": handleGetModels,
  "POST /sync": handleSyncModels,
  "GET /models/:modelId": handleGetModelById,
};

// Handler implementation
async function handleGetModels(ctx: PluginRouteContext): Promise<PluginRouteResponse> {
  const { sequelize, tenantId } = ctx;

  const models = await sequelize.query(
    `SELECT * FROM "${tenantId}".my_table ORDER BY created_at DESC`,
    { type: "SELECT" }
  );

  return {
    status: 200,
    data: { models },
  };
}
```

**Route Pattern Matching:**
- Exact match: `"GET /models"` matches `GET /api/plugins/:key/models`
- With params: `"GET /models/:modelId"` matches `GET /api/plugins/:key/models/123` (params.modelId = "123")
- Nested paths: `"GET /oauth/workspaces"` matches `GET /api/plugins/:key/oauth/workspaces`

### Example Plugin Implementation

```typescript
// plugins/mlflow/index.ts
import { QueryTypes, Sequelize } from "sequelize";

interface PluginContext {
  sequelize: Sequelize;
}

export async function install(
  userId: number,
  tenantId: string,
  config: Record<string, any>,
  context: PluginContext
): Promise<{ success: boolean; message?: string }> {
  const { sequelize } = context;

  // Create plugin-specific table
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "${tenantId}".mlflow_model_records (
      id SERIAL PRIMARY KEY,
      model_name VARCHAR(255) NOT NULL,
      version VARCHAR(50),
      stage VARCHAR(50),
      run_id VARCHAR(100),
      source VARCHAR(500),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  return { success: true, message: "MLflow plugin installed" };
}

export async function uninstall(
  userId: number,
  tenantId: string,
  context: PluginContext
): Promise<{ success: boolean; message?: string }> {
  const { sequelize } = context;

  // Drop plugin-specific table
  await sequelize.query(`
    DROP TABLE IF EXISTS "${tenantId}".mlflow_model_records
  `);

  return { success: true, message: "MLflow plugin uninstalled" };
}

export async function testConnection(
  configuration: Record<string, any>,
  context?: PluginContext
): Promise<{ success: boolean; message: string }> {
  const { tracking_server_url } = configuration;

  try {
    const response = await fetch(
      `${tracking_server_url}/api/2.0/mlflow/experiments/list`
    );
    if (response.ok) {
      return { success: true, message: "Connection successful" };
    }
    return { success: false, message: "Failed to connect to MLflow server" };
  } catch (error: any) {
    return { success: false, message: `Connection error: ${error.message}` };
  }
}

export async function syncModels(
  tenantId: string,
  configuration: Record<string, any>,
  context: PluginContext
): Promise<{ success: boolean; modelCount: number }> {
  const { sequelize } = context;
  const { tracking_server_url } = configuration;

  // Fetch models from MLflow
  const response = await fetch(
    `${tracking_server_url}/api/2.0/mlflow/registered-models/list`
  );
  const data = await response.json();
  const models = data.registered_models || [];

  // Upsert models into database
  for (const model of models) {
    await sequelize.query(`
      INSERT INTO "${tenantId}".mlflow_model_records (model_name, version, updated_at)
      VALUES (:name, :version, NOW())
      ON CONFLICT (model_name) DO UPDATE SET version = :version, updated_at = NOW()
    `, {
      replacements: {
        name: model.name,
        version: model.latest_versions?.[0]?.version
      },
      type: QueryTypes.INSERT,
    });
  }

  return { success: true, modelCount: models.length };
}
```

---

## Frontend Implementation

### Types

**File:** `Clients/src/domain/types/plugins.ts`

```typescript
export enum PluginCategory {
  COMMUNICATION = "communication",
  ML_OPS = "ml_ops",
  VERSION_CONTROL = "version_control",
  MONITORING = "monitoring",
  SECURITY = "security",
  DATA_MANAGEMENT = "data_management",
  ANALYTICS = "analytics",
}

export enum PluginInstallationStatus {
  INSTALLING = "installing",
  INSTALLED = "installed",
  FAILED = "failed",
  UNINSTALLING = "uninstalling",
  UNINSTALLED = "uninstalled",
}

export interface PluginFeature {
  name: string;
  description: string;
  displayOrder: number;
}

export interface Plugin {
  key: string;
  name: string;
  displayName: string;
  description: string;
  longDescription?: string;
  version: string;
  author?: string;
  category: PluginCategory;
  iconUrl?: string;
  documentationUrl?: string;
  supportUrl?: string;
  isOfficial: boolean;
  isPublished: boolean;
  requiresConfiguration: boolean;
  installationType: string;
  features: PluginFeature[];
  tags: string[];
  pluginPath?: string;
  entryPoint?: string;
  // Installation-specific fields (merged when fetching)
  installationId?: number;
  installationStatus?: PluginInstallationStatus;
  installedAt?: string;
}

export interface PluginInstallation {
  id: number;
  pluginKey: string;
  userId?: number;
  tenantId?: number;
  status: PluginInstallationStatus;
  installedAt?: string;
  uninstalledAt?: string;
  errorMessage?: string;
  configuration?: any;
  metadata?: any;
  plugin?: Plugin;
  createdAt?: string;
  updatedAt?: string;
}

export interface PluginCategoryInfo {
  id: string;
  name: string;
  description: string;
}
```

### Repository (API Client)

**File:** `Clients/src/application/repository/plugin.repository.ts`

```typescript
// Get all available plugins from marketplace
export async function getAllPlugins({
  category,
  signal,
  responseType = "json",
}: {
  category?: string;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<Plugin[]>;

// Get plugin by key
export async function getPluginByKey({
  key,
  signal,
  responseType = "json",
}: {
  key: string;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<Plugin>;

// Search plugins
export async function searchPlugins({
  query,
  signal,
  responseType = "json",
}: {
  query: string;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<Plugin[]>;

// Install a plugin
export async function installPlugin({
  pluginKey,
}: {
  pluginKey: string;
}): Promise<PluginInstallation>;

// Uninstall a plugin
export async function uninstallPlugin({
  installationId,
}: {
  installationId: number;
}): Promise<any>;

// Get installed plugins for current user
export async function getInstalledPlugins({
  signal,
  responseType = "json",
}?: {
  signal?: AbortSignal;
  responseType?: string;
}): Promise<PluginInstallation[]>;

// Get plugin categories
export async function getCategories({
  signal,
  responseType = "json",
}?: {
  signal?: AbortSignal;
  responseType?: string;
}): Promise<PluginCategoryInfo[]>;

// Update plugin configuration
export async function updatePluginConfiguration({
  installationId,
  configuration,
}: {
  installationId: number;
  configuration: Record<string, any>;
}): Promise<PluginInstallation>;

// Test plugin connection
export async function testPluginConnection({
  pluginKey,
  configuration,
}: {
  pluginKey: string;
  configuration: Record<string, any>;
}): Promise<any>;

// Connect OAuth workspace (Slack)
export async function connectOAuthWorkspace({
  pluginKey,
  code,
}: {
  pluginKey: string;
  code: string;
}): Promise<any>;

// Get OAuth workspaces (Slack)
export async function getOAuthWorkspaces({
  pluginKey,
  signal,
}: {
  pluginKey: string;
  signal?: AbortSignal;
}): Promise<any[]>;

// Update OAuth workspace (Slack routing types)
export async function updateOAuthWorkspace({
  pluginKey,
  webhookId,
  routing_type,
  is_active,
}: {
  pluginKey: string;
  webhookId: number;
  routing_type?: string[];
  is_active?: boolean;
}): Promise<any>;

// Disconnect OAuth workspace (Slack)
export async function disconnectOAuthWorkspace({
  pluginKey,
  webhookId,
}: {
  pluginKey: string;
  webhookId: number;
}): Promise<void>;
```

### Hooks

#### usePlugins

**File:** `Clients/src/application/hooks/usePlugins.ts`

Fetches marketplace plugins merged with installation status:

```typescript
export function usePlugins(category?: string) {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    const fetchPlugins = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch both marketplace and installed plugins
        const [marketplacePlugins, installedPlugins] = await Promise.all([
          getAllPlugins({ category }),
          getInstalledPlugins().catch(() => []),
        ]);

        // Create a map of installed plugins by key
        const installedMap = new Map(
          installedPlugins.map((inst) => [
            inst.plugin?.key || inst.pluginKey,
            {
              installationId: inst.id,
              status: inst.status,
            },
          ])
        );

        // Merge installation status into marketplace plugins
        const mergedPlugins = marketplacePlugins.map((plugin) => {
          const installation = installedMap.get(plugin.key);
          if (installation) {
            return {
              ...plugin,
              installationId: installation.installationId,
              installationStatus: installation.status,
            };
          }
          return plugin;
        });

        setPlugins(mergedPlugins);
      } catch (err: any) {
        setError(err.message || "Failed to fetch plugins");
      } finally {
        setLoading(false);
      }
    };

    fetchPlugins();
  }, [category, refetchTrigger]);

  const refetch = () => setRefetchTrigger((n) => n + 1);

  return { plugins, loading, error, refetch };
}
```

#### usePluginInstallation

**File:** `Clients/src/application/hooks/usePluginInstallation.ts`

Install/uninstall actions with loading states:

```typescript
export function usePluginInstallation() {
  const [installingKeys, setInstallingKeys] = useState<Set<string>>(new Set());
  const [uninstallingIds, setUninstallingIds] = useState<Set<number>>(new Set());

  const install = async (pluginKey: string) => {
    setInstallingKeys((prev) => new Set(prev).add(pluginKey));
    try {
      const installation = await installPlugin({ pluginKey });
      return installation;
    } finally {
      setInstallingKeys((prev) => {
        const next = new Set(prev);
        next.delete(pluginKey);
        return next;
      });
    }
  };

  const uninstall = async (installationId: number) => {
    setUninstallingIds((prev) => new Set(prev).add(installationId));
    try {
      await uninstallPlugin({ installationId });
    } finally {
      setUninstallingIds((prev) => {
        const next = new Set(prev);
        next.delete(installationId);
        return next;
      });
    }
  };

  const isInstalling = (pluginKey: string) => installingKeys.has(pluginKey);
  const isUninstalling = (id: number) => uninstallingIds.has(id);

  return { install, uninstall, isInstalling, isUninstalling };
}
```

#### useIsPluginInstalled

**File:** `Clients/src/application/hooks/useIsPluginInstalled.ts`

Check if specific plugin is installed:

```typescript
export function useIsPluginInstalled(pluginKey: string) {
  const [isInstalled, setIsInstalled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [installationId, setInstallationId] = useState<number | null>(null);

  useEffect(() => {
    const checkInstallation = async () => {
      setLoading(true);
      try {
        const installedPlugins = await getInstalledPlugins();
        const installation = installedPlugins.find(
          (p) =>
            (p.plugin?.key || p.pluginKey) === pluginKey &&
            p.status === PluginInstallationStatus.INSTALLED
        );
        setIsInstalled(!!installation);
        setInstallationId(installation?.id || null);
      } catch (error) {
        setIsInstalled(false);
        setInstallationId(null);
      } finally {
        setLoading(false);
      }
    };

    checkInstallation();
  }, [pluginKey]);

  return { isInstalled, loading, installationId };
}
```

### Components

#### PluginGate

**File:** `Clients/src/presentation/components/PluginGate/index.tsx`

Conditionally render content based on plugin installation:

```tsx
interface PluginGateProps {
  pluginKey: string;
  children: ReactNode;
  fallback?: ReactNode;
  loading?: ReactNode;
}

export const PluginGate: React.FC<PluginGateProps> = ({
  pluginKey,
  children,
  fallback = null,
  loading: loadingContent = null,
}) => {
  const { isInstalled, loading } = useIsPluginInstalled(pluginKey);

  if (loading) {
    return <>{loadingContent}</>;
  }

  return <>{isInstalled ? children : fallback}</>;
};

// Usage example
<PluginGate pluginKey="mlflow" fallback={<InstallPrompt />}>
  <MLFlowDataTable />
</PluginGate>
```

#### PluginCard

**File:** `Clients/src/presentation/components/PluginCard/index.tsx`

Display plugin with install/manage/uninstall actions:

```tsx
interface PluginCardProps {
  plugin: Plugin;
  onUninstall?: (installationId: number) => Promise<void>;
  onManage?: (plugin: Plugin) => void;
  loading?: boolean;
}

const PluginCard: React.FC<PluginCardProps> = ({
  plugin,
  onUninstall,
  onManage,
  loading,
}) => {
  // Renders plugin card with:
  // - Plugin icon
  // - Name and description
  // - Features list
  // - Installation status chip (installed/installing/failed)
  // - Menu actions: Manage, Uninstall (for installed plugins)
  // - Click navigates to plugin management page
};
```

### Pages

#### Plugins Page

**File:** `Clients/src/presentation/pages/Plugins/index.tsx`

**Route:** `/plugins`

Two tabs:
1. **Marketplace** - Browse available plugins with category filter
2. **My Plugins** - View installed plugins

#### PluginManagement Page

**File:** `Clients/src/presentation/pages/Plugins/PluginManagement/index.tsx`

**Route:** `/plugins/:pluginKey/manage`

Features:
- Plugin details (name, description, features)
- Install/Uninstall buttons
- Configuration form (plugin-specific fields)
- Test connection button
- OAuth workspace management (Slack)
- Sync controls (MLflow)

---

## Dynamic Plugin UI Injection System

The plugin system supports **fully dynamic UI injection at runtime**. Plugin UIs are NOT bundled with the main application - they are separate IIFE bundles that are loaded dynamically when plugins are installed.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      PLUGIN UI INJECTION FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐        │
│  │   Plugin         │     │   PluginLoader   │     │  PluginRegistry  │        │
│  │   Marketplace    │────►│   Component      │────►│  Context         │        │
│  │   (plugins.json) │     │   (on app load)  │     │  (state mgmt)    │        │
│  └──────────────────┘     └──────────────────┘     └────────┬─────────┘        │
│           │                                                  │                  │
│           │ ui: { bundleUrl, slots }                        │                  │
│           ▼                                                  ▼                  │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐        │
│  │  Plugin Bundle   │     │  <script> tag    │     │ loadedComponents │        │
│  │  (IIFE format)   │────►│  injection       │────►│ Map<slotId,      │        │
│  │  bundle.iife.js  │     │  into DOM        │     │   Component[]>   │        │
│  └──────────────────┘     └──────────────────┘     └────────┬─────────┘        │
│           │                                                  │                  │
│           │ window.PluginName = { Component1, Component2 }  │                  │
│           ▼                                                  ▼                  │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐        │
│  │  Global Variable │     │   PluginSlot     │     │  Rendered UI     │        │
│  │  on window       │────►│   Components     │────►│  in App          │        │
│  │  (React comps)   │     │   (injection pts)│     │  (dynamic)       │        │
│  └──────────────────┘     └──────────────────┘     └──────────────────┘        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **IIFE Bundle** | Immediately Invoked Function Expression - plugin UI compiled to single JS file that exposes components on `window` |
| **Plugin Slot** | Predefined injection point in the app where plugin UIs can render |
| **PluginRegistry** | React context that manages loaded plugins and their components |
| **PluginLoader** | Component that loads UI bundles for all installed plugins on app startup |
| **Dynamic Loading** | Scripts loaded via `<script>` tag injection, not bundled with main app |

### Plugin UI Configuration (plugins.json)

Each plugin can define a `ui` property in the marketplace manifest:

```json
{
  "key": "mlflow",
  "name": "MLflow Integration",
  "ui": {
    "bundleUrl": "/api/plugins/mlflow/ui/bundle.js",
    "globalName": "PluginMlflow",
    "slots": [
      {
        "slotId": "project-risks-tab",
        "componentName": "MLFlowTab",
        "renderType": "tab",
        "props": {
          "label": "MLflow Models",
          "icon": "Database"
        }
      },
      {
        "slotId": "plugin-config",
        "componentName": "MLFlowConfiguration",
        "renderType": "inline"
      }
    ]
  }
}
```

#### UI Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bundleUrl` | string | Yes | URL to the IIFE bundle (served from backend) |
| `globalName` | string | No | Custom global variable name (default: `Plugin` + PascalCase key) |
| `slots` | array | Yes | List of slot configurations |

#### Slot Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `slotId` | string | Yes | ID of the slot where component renders |
| `componentName` | string | Yes | Name of the exported component from bundle |
| `renderType` | string | Yes | How to render: `"inline"`, `"tab"`, `"modal"`, `"menu-item"` |
| `props` | object | No | Default props passed to the component |
| `trigger` | string | No | For modals - component that triggers the modal |

### Available Plugin Slots

**File:** `Clients/src/domain/constants/pluginSlots.ts`

```typescript
export const PLUGIN_SLOTS = {
  // Project Risks page - Tab panel area
  PROJECT_RISKS_TAB: "project-risks-tab",

  // Plugin configuration panel
  PLUGIN_CONFIG: "plugin-config",

  // Risk dropdown menu - Additional import options
  RISK_DROPDOWN_MENU: "risk-dropdown-menu",

  // Add more slots as needed for future plugins
} as const;

export type PluginRenderType = "inline" | "tab" | "modal" | "menu-item";
```

### PluginRegistryContext

**File:** `Clients/src/application/contexts/PluginRegistry.context.tsx`

Core context that manages plugin UI state:

```typescript
interface PluginRegistryContextType {
  // List of installed plugins (from API)
  installedPlugins: PluginInstallation[];

  // Loading state
  isLoading: boolean;

  // Map of slotId -> loaded components
  loadedComponents: Map<string, LoadedPluginComponent[]>;

  // Get components registered for a specific slot
  getComponentsForSlot: (slotId: string) => LoadedPluginComponent[];

  // Get tab configurations for tab-type slots
  getPluginTabs: (slotId: string) => PluginTabConfig[];

  // Load a plugin's UI bundle dynamically
  loadPluginUI: (pluginKey: string, uiConfig: PluginUIConfig) => Promise<void>;

  // Unload a plugin's components (on uninstall)
  unloadPlugin: (pluginKey: string) => void;

  // Refresh installed plugins list
  refreshPlugins: () => Promise<void>;

  // Check if a plugin is installed
  isPluginInstalled: (pluginKey: string) => boolean;
}
```

#### How loadPluginUI Works

```typescript
const loadPluginUI = async (pluginKey: string, uiConfig: PluginUIConfig) => {
  // 1. Check if bundle already loaded (for re-installation)
  const bundleAlreadyLoaded = loadedBundlesRef.current.has(uiConfig.bundleUrl);

  if (bundleAlreadyLoaded) {
    // Re-register components from existing global variable
    const module = window[globalName];
    // Register each slot component...
    return;
  }

  // 2. Resolve bundle URL (handle /api/ paths)
  let resolvedUrl = uiConfig.bundleUrl;
  if (uiConfig.bundleUrl.startsWith("/api/")) {
    resolvedUrl = `${getBackendUrl()}${uiConfig.bundleUrl}`;
  }

  // 3. Inject <script> tag to load IIFE bundle
  const script = document.createElement("script");
  script.src = resolvedUrl;
  document.head.appendChild(script);

  // 4. Wait for script to load
  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });

  // 5. Get module from window global
  const module = window[globalName]; // e.g., window.PluginMlflow

  // 6. Register each component to its slot
  for (const slotConfig of uiConfig.slots) {
    const Component = module[slotConfig.componentName];
    loadedComponents.set(slotConfig.slotId, [...existing, {
      pluginKey,
      slotId: slotConfig.slotId,
      componentName: slotConfig.componentName,
      Component,
      renderType: slotConfig.renderType,
      props: slotConfig.props,
    }]);
  }
};
```

### PluginSlot Component

**File:** `Clients/src/presentation/components/PluginSlot/index.tsx`

Renders plugin components at designated slots:

```tsx
interface PluginSlotProps {
  id: string;                    // Slot ID (e.g., "project-risks-tab")
  pluginKey?: string;            // Optional: filter to specific plugin
  slotProps?: Record<string, any>; // Props passed to plugin components
  fallback?: ReactNode;          // Shown if no components for slot
}

export const PluginSlot: React.FC<PluginSlotProps> = ({
  id,
  pluginKey,
  slotProps = {},
  fallback = null,
}) => {
  const { getComponentsForSlot } = usePluginRegistry();

  // Get components registered for this slot
  let components = getComponentsForSlot(id);

  // Filter by pluginKey if specified
  if (pluginKey) {
    components = components.filter(c => c.pluginKey === pluginKey);
  }

  if (components.length === 0) {
    return <>{fallback}</>;
  }

  // Render based on renderType
  return (
    <>
      {components.map((comp, index) => {
        const { Component, props: defaultProps, renderType } = comp;

        switch (renderType) {
          case "inline":
            return <Component key={index} {...defaultProps} {...slotProps} />;
          case "tab":
            // Tab rendering handled by parent TabContext
            return <Component key={index} {...defaultProps} {...slotProps} />;
          case "modal":
            // Modal rendering with trigger
            return <PluginModal key={index} component={comp} slotProps={slotProps} />;
          case "menu-item":
            // Menu item rendering
            return <Component key={index} {...defaultProps} {...slotProps} />;
          default:
            return <Component key={index} {...defaultProps} {...slotProps} />;
        }
      })}
    </>
  );
};
```

#### Usage Examples

```tsx
// Inline component in a page
<PluginSlot
  id={PLUGIN_SLOTS.PLUGIN_CONFIG}
  pluginKey="mlflow"
  slotProps={{
    configData,
    onConfigChange: handleConfigChange,
    onSaveConfiguration: handleSave,
  }}
/>

// Tab panel with plugin tabs
<PluginSlot
  id={PLUGIN_SLOTS.PROJECT_RISKS_TAB}
  slotProps={{ projectId, risks }}
/>

// Menu items in a dropdown
<Menu>
  <MenuItem>Default Option</MenuItem>
  <PluginSlot
    id={PLUGIN_SLOTS.RISK_DROPDOWN_MENU}
    slotProps={{ onImport: handleImport }}
  />
</Menu>
```

### PluginLoader Component

**File:** `Clients/src/presentation/components/PluginLoader/index.tsx`

Automatically loads UI bundles for all installed plugins on app startup:

```tsx
export function PluginLoader() {
  const { installedPlugins, loadPluginUI, isLoading } = usePluginRegistry();

  useEffect(() => {
    if (isLoading || installedPlugins.length === 0) return;

    async function loadAllPluginUIs() {
      // Fetch marketplace data to get UI configs
      const response = await apiServices.get("/plugins/marketplace");
      const marketplacePlugins = response.data?.data || [];

      // Load UI for each installed plugin
      for (const installed of installedPlugins) {
        const marketplacePlugin = marketplacePlugins.find(
          (p) => p.key === installed.pluginKey
        );

        if (marketplacePlugin?.ui) {
          await loadPluginUI(installed.pluginKey, marketplacePlugin.ui);
        }
      }
    }

    loadAllPluginUIs();
  }, [installedPlugins, loadPluginUI, isLoading]);

  return null; // Renders nothing - just loads bundles
}
```

**Important:** Add `<PluginLoader />` to your app's root component:

```tsx
// App.tsx or main layout
function App() {
  return (
    <PluginRegistryProvider>
      <PluginLoader />
      {/* Rest of your app */}
    </PluginRegistryProvider>
  );
}
```

### Plugin Lifecycle (UI Perspective)

#### Installation Flow

```
1. User clicks "Install" on plugin card
   ↓
2. POST /api/plugins/install { pluginKey }
   ↓
3. Backend executes plugin's install() function
   ↓
4. usePluginInstallation.install() calls refreshPlugins()
   ↓
5. PluginRegistryContext updates installedPlugins state
   ↓
6. PluginLoader effect runs (installedPlugins changed)
   ↓
7. loadPluginUI() called for new plugin
   ↓
8. <script> tag injected, bundle loads
   ↓
9. Components registered to loadedComponents
   ↓
10. PluginSlot components re-render with new components
    ↓
11. Plugin UI appears WITHOUT page refresh
```

#### Uninstallation Flow

```
1. User clicks "Uninstall" on plugin
   ↓
2. DELETE /api/plugins/installations/:id
   ↓
3. Backend executes plugin's uninstall() function
   ↓
4. usePluginInstallation.uninstall() calls:
   - unloadPlugin(pluginKey)  // Remove components from state
   - refreshPlugins()          // Update installed list
   ↓
5. unloadPlugin() removes plugin's components from loadedComponents
   ↓
6. PluginSlot components re-render without plugin components
   ↓
7. Plugin UI disappears WITHOUT page refresh
```

#### Re-installation Flow

```
1. User installs previously uninstalled plugin
   ↓
2. loadPluginUI() checks loadedBundlesRef
   ↓
3. Bundle already in DOM (script tag persists)
   ↓
4. Components re-registered from window.PluginName
   ↓
5. Plugin UI appears WITHOUT reloading bundle
```

### Building Plugin UI Bundles

Plugin UIs must be built as IIFE bundles that expose components on the `window` object.

#### Vite Configuration

**File:** `plugins/mlflow/ui/vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "PluginMlflow",  // Global variable name
      formats: ["iife"],     // IIFE format for <script> loading
      fileName: () => "bundle.iife.js",
    },
    rollupOptions: {
      external: ["react", "react-dom", "@mui/material", "@emotion/react", "@emotion/styled"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "@mui/material": "MaterialUI",
          "@emotion/react": "emotionReact",
          "@emotion/styled": "emotionStyled",
        },
        // Ensure IIFE wrapper
        format: "iife",
        name: "PluginMlflow",
      },
    },
    outDir: "dist",
    emptyOutDir: true,
  },
});
```

#### Entry Point (index.ts)

**File:** `plugins/mlflow/ui/src/index.ts`

```typescript
// Export all components that will be registered to slots
export { MLFlowTab } from "./MLFlowTab";
export { MLFlowConfiguration } from "./MLFlowConfiguration";
export { MLFlowDataTable } from "./MLFlowDataTable";

// The build outputs:
// window.PluginMlflow = {
//   MLFlowTab: [Component],
//   MLFlowConfiguration: [Component],
//   MLFlowDataTable: [Component],
// }
```

#### Component Example

**File:** `plugins/mlflow/ui/src/MLFlowTab.tsx`

```tsx
import React from "react";
import { Box, Typography } from "@mui/material";

interface MLFlowTabProps {
  projectId?: number;
  // Props passed via slotProps
}

export const MLFlowTab: React.FC<MLFlowTabProps> = ({ projectId }) => {
  return (
    <Box>
      <Typography variant="h6">MLflow Models</Typography>
      {/* Plugin UI content */}
    </Box>
  );
};
```

#### Build and Deploy

```bash
# Build the UI bundle
cd plugins/mlflow/ui
npm run build

# Output: dist/bundle.iife.js

# The backend serves this at:
# GET /api/plugins/mlflow/ui/bundle.js
```

### Backend: Serving Plugin UI Bundles

**File:** `Servers/routes/plugin.route.ts`

```typescript
// Serve plugin UI bundles
router.get("/:key/ui/bundle.js", authenticateJWT, async (req, res) => {
  const { key } = req.params;
  const bundlePath = path.join(__dirname, `../../temp/plugins/${key}/ui/dist/bundle.iife.js`);

  if (!fs.existsSync(bundlePath)) {
    return res.status(404).json({ error: "Plugin UI bundle not found" });
  }

  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(bundlePath);
});
```

### Creating a Plugin with UI (Complete Example)

#### 1. Plugin Structure

```
plugins/my-plugin/
├── index.ts              # Backend plugin code
├── package.json          # Backend dependencies
├── README.md
└── ui/                   # Frontend UI
    ├── package.json      # UI dependencies (React, MUI, etc.)
    ├── vite.config.ts    # Build configuration
    ├── tsconfig.json
    └── src/
        ├── index.ts      # Entry point - exports all components
        ├── MyPluginTab.tsx
        └── MyPluginConfig.tsx
```

#### 2. UI package.json

```json
{
  "name": "@verifywise/plugin-my-plugin-ui",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@mui/material": "^5.14.0",
    "@emotion/react": "^11.11.0",
    "@emotion/styled": "^11.11.0",
    "lucide-react": "^0.294.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

#### 3. Entry Point (index.ts)

```typescript
// Export all components for slot registration
export { MyPluginTab } from "./MyPluginTab";
export { MyPluginConfig } from "./MyPluginConfig";
```

#### 4. plugins.json Entry

```json
{
  "key": "my-plugin",
  "name": "My Plugin",
  "displayName": "My Plugin",
  "ui": {
    "bundleUrl": "/api/plugins/my-plugin/ui/bundle.js",
    "globalName": "PluginMyPlugin",
    "slots": [
      {
        "slotId": "project-risks-tab",
        "componentName": "MyPluginTab",
        "renderType": "tab",
        "props": {
          "label": "My Plugin",
          "icon": "Puzzle"
        }
      },
      {
        "slotId": "plugin-config",
        "componentName": "MyPluginConfig",
        "renderType": "inline"
      }
    ]
  }
}
```

#### 5. Build and Test

```bash
# Install dependencies
cd plugins/my-plugin/ui
npm install

# Build bundle
npm run build

# Output: dist/bundle.iife.js

# Test: Install plugin in VerifyWise, UI should appear dynamically
```

### Troubleshooting Plugin UI

| Issue | Cause | Solution |
|-------|-------|----------|
| UI doesn't appear after install | Bundle not loaded | Check browser console for script errors |
| Components undefined | Wrong export name | Verify `componentName` matches exported name |
| UI persists after uninstall | Components not unloaded | Ensure `unloadPlugin()` is called |
| UI doesn't appear on re-install | Bundle loaded but components not registered | Fixed in PluginRegistry - re-registers from existing global |
| Style conflicts | CSS not scoped | Use MUI's `sx` prop or CSS modules |
| React hooks error | Multiple React instances | Mark React as external in Vite config |

---

## Backend: Serving Plugin UI Bundles

**File:** `Servers/routes/plugin.route.ts`

The backend serves plugin UI bundles from a dedicated route. If the bundle doesn't exist locally, it's automatically downloaded from the marketplace.

```typescript
// Serve plugin UI bundles from temp/plugins/{key}/ui/dist/
// If bundle doesn't exist locally, download it from the marketplace
router.get("/:key/ui/dist/:filename", async (req, res) => {
  const { key, filename } = req.params;
  const bundlePath = path.join(__dirname, "../../temp/plugins", key, "ui", "dist", filename);

  // If bundle doesn't exist locally, download from marketplace
  if (!fs.existsSync(bundlePath)) {
    try {
      console.log(`[Plugin UI] Bundle not found locally, downloading from marketplace...`);
      const bundleUrl = `${PLUGIN_MARKETPLACE_BASE_URL}/plugins/${key}/ui/dist/${filename}`;

      const response = await axios.get(bundleUrl, {
        timeout: 30000,
        responseType: 'arraybuffer',
      });

      // Create directory and save bundle
      const dirPath = path.dirname(bundlePath);
      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(bundlePath, Buffer.from(response.data));
      console.log(`[Plugin UI] Bundle downloaded and saved to: ${bundlePath}`);
    } catch (downloadError: any) {
      console.error(`[Plugin UI] Failed to download bundle:`, downloadError.message);
      return res.status(404).json({ error: "Plugin UI bundle not found" });
    }
  }

  // Serve the bundle with appropriate headers
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(bundlePath);
});
```

### Bundle URL Format

```
GET /api/plugins/:key/ui/dist/:filename

Examples:
GET /api/plugins/mlflow/ui/dist/bundle.iife.js
GET /api/plugins/risk-import/ui/dist/bundle.iife.js
```

### Bundle Storage

Bundles are stored in the server's temp directory:

```
Servers/
└── temp/
    └── plugins/
        ├── mlflow/
        │   └── ui/
        │       └── dist/
        │           └── bundle.iife.js
        └── risk-import/
            └── ui/
                └── dist/
                    └── bundle.iife.js
```

---

## Adding New Plugin Slots

To add a new injection point where plugins can render UI, follow these steps:

### Step 1: Define the Slot Constant

**File:** `Clients/src/domain/constants/pluginSlots.ts`

```typescript
export const PLUGIN_SLOTS = {
  // Existing slots...
  RISKS_ACTIONS: "page.risks.actions",
  MODELS_TABS: "page.models.tabs",
  PLUGIN_CONFIG: "page.plugin.config",

  // Add your new slot
  MY_PAGE_TOOLBAR: "page.mypage.toolbar",  // Toolbar buttons
  MY_PAGE_SIDEBAR: "page.mypage.sidebar",  // Sidebar content
} as const;

export type PluginSlotId = (typeof PLUGIN_SLOTS)[keyof typeof PLUGIN_SLOTS];
```

### Step 2: Add PluginSlot Component to Your Page

Import and place `<PluginSlot>` at the desired location:

```tsx
import { PluginSlot } from "../../components/PluginSlot";
import { PLUGIN_SLOTS } from "../../../domain/constants/pluginSlots";

const MyPage: React.FC = () => {
  return (
    <Box>
      {/* Your page content */}

      {/* Plugin injection point */}
      <PluginSlot
        id={PLUGIN_SLOTS.MY_PAGE_TOOLBAR}
        renderType="button"          // Optional: filter by render type
        slotProps={{                  // Props passed to plugin components
          pageId: 123,
          onAction: handleAction,
        }}
      />
    </Box>
  );
};
```

### Step 3: Document the Slot

Add documentation for plugin developers:

| Slot ID | Location | Render Types | Available Props |
|---------|----------|--------------|-----------------|
| `page.mypage.toolbar` | MyPage toolbar area | `button` | `pageId`, `onAction` |
| `page.mypage.sidebar` | MyPage sidebar | `card`, `widget` | `pageId`, `data` |

### PluginSlot Props Reference

```typescript
interface PluginSlotProps {
  // Required: Slot identifier
  id: PluginSlotId;

  // Props passed to all plugin components in this slot
  slotProps?: Record<string, any>;

  // Optional: Wrapper component for each plugin component
  wrapper?: React.ComponentType<{ children: ReactNode }>;

  // Custom fallback while loading (default: CircularProgress)
  fallback?: ReactNode;

  // Filter by render type (only render matching components)
  renderType?: PluginRenderType;

  // For tab slots: the currently active tab value
  activeTab?: string;

  // Filter to specific plugin (only render that plugin's components)
  pluginKey?: string;
}
```

### Render Types

| Type | Description | Use Case |
|------|-------------|----------|
| `menuitem` | Menu item in a dropdown | "Insert From" menus, action menus |
| `modal` | Modal/dialog that opens on trigger | Import wizards, configuration modals |
| `tab` | Tab panel content | Additional tabs in TabBar |
| `card` | Card widget | Dashboard widgets, sidebar cards |
| `button` | Toolbar button | Action buttons in toolbars |
| `widget` | Dashboard widget | Dashboard customization |
| `raw` | Raw component (no wrapper) | Full custom rendering |

---

## Real Examples: PluginSlot Usage in Codebase

### Example 1: Menu Items in Risk Management Page

**File:** `Clients/src/presentation/pages/RiskManagement/index.tsx`

The Risk Management page uses PluginSlot for the "Insert From" dropdown menu, allowing plugins to add import options:

```tsx
import { PluginSlot } from "../../components/PluginSlot";
import { PLUGIN_SLOTS } from "../../../domain/constants/pluginSlots";
import { usePluginRegistry } from "../../../application/contexts/PluginRegistry.context";

const RiskManagement = () => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Check if risk-import plugin is installed
  const { getComponentsForSlot } = usePluginRegistry();
  const hasRiskImportPlugin = getComponentsForSlot(PLUGIN_SLOTS.RISKS_ACTIONS).length > 0;

  return (
    <>
      {/* "Insert From" Dropdown Menu */}
      <Popover open={insertFromMenuOpen} anchorEl={insertFromMenuAnchor}>
        <Box>
          {/* Built-in options */}
          <Box onClick={() => handleOpenMITModal()}>
            <Typography>MIT AI Risk Repository</Typography>
          </Box>
          <Box onClick={() => handleOpenIBMModal()}>
            <Typography>IBM AI Risk Atlas</Typography>
          </Box>

          {/* Plugin-injected menu items */}
          <PluginSlot
            id={PLUGIN_SLOTS.RISKS_ACTIONS}
            renderType="menuitem"
            slotProps={{
              onMenuClose: handleInsertFromMenuClose,
              onImportComplete: () => setRefreshKey((prev) => prev + 1),
              onTriggerModal: (modalName: string) => {
                if (modalName === "RiskImportModal") {
                  setIsImportModalOpen(true);
                }
              },
            }}
          />
        </Box>
      </Popover>

      {/* Plugin modals rendered outside Popover (persists when menu closes) */}
      <PluginSlot
        id={PLUGIN_SLOTS.RISKS_ACTIONS}
        renderType="modal"
        slotProps={{
          open: isImportModalOpen,
          onClose: () => setIsImportModalOpen(false),
          onImportComplete: () => {
            setRefreshKey((prev) => prev + 1);
            setIsImportModalOpen(false);
          },
          apiServices,
        }}
      />
    </>
  );
};
```

**Key Points:**
- Uses `renderType="menuitem"` to only render menu item components
- Uses separate `renderType="modal"` slot outside Popover for modals
- Passes `onTriggerModal` to let menu items open modals
- Passes `onImportComplete` to refresh data after import

### Example 2: Dynamic Tabs in Model Inventory Page

**File:** `Clients/src/presentation/pages/ModelInventory/index.tsx`

The Model Inventory page dynamically adds tabs for installed plugins:

```tsx
import { PluginSlot } from "../../components/PluginSlot";
import { PLUGIN_SLOTS } from "../../../domain/constants/pluginSlots";
import { usePluginRegistry } from "../../../application/contexts/PluginRegistry.context";

const ModelInventory: React.FC = () => {
  const [activeTab, setActiveTab] = useState("models");

  // Get plugin tabs dynamically from the plugin registry
  const { getPluginTabs } = usePluginRegistry();
  const pluginTabs = useMemo(
    () => getPluginTabs(PLUGIN_SLOTS.MODELS_TABS),
    [getPluginTabs]
  );

  return (
    <TabContext value={activeTab}>
      {/* Tab Bar with dynamic plugin tabs */}
      <TabBar
        tabs={[
          { label: "Models", value: "models", icon: "Box" },
          { label: "Model risks", value: "model-risks", icon: "AlertTriangle" },

          // Dynamically add plugin tabs
          ...pluginTabs.map((tab) => ({
            label: tab.label,
            value: tab.value,
            icon: (tab.icon || "Database") as "Database" | "Box" | "AlertTriangle",
          })),

          { label: "Evidence hub", value: "evidence-hub", icon: "Database" },
        ]}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {/* Built-in tab content */}
      {activeTab === "models" && (
        <ModelInventoryTable {...props} />
      )}

      {activeTab === "model-risks" && (
        <ModelRisksTable {...props} />
      )}

      {/* Render plugin tab content dynamically */}
      {pluginTabs.some((tab) => tab.value === activeTab) && (
        <PluginSlot
          id={PLUGIN_SLOTS.MODELS_TABS}
          renderType="tab"
          activeTab={activeTab}
          slotProps={{ apiServices }}
        />
      )}

      {activeTab === "evidence-hub" && (
        <EvidenceHubTable {...props} />
      )}
    </TabContext>
  );
};
```

**Key Points:**
- Uses `getPluginTabs()` to get tab configurations from plugins
- Dynamically adds tabs to TabBar from `pluginTabs`
- Uses `activeTab` prop to only render the currently active tab's content
- Plugin tab content renders only when a plugin tab is selected

### Example 3: Plugin Configuration Panel

**File:** `Clients/src/presentation/pages/Plugins/PluginManagement/index.tsx`

The Plugin Management page renders plugin-specific configuration UIs:

```tsx
import { PluginSlot } from "../../../components/PluginSlot";
import { PLUGIN_SLOTS } from "../../../../domain/constants/pluginSlots";
import { usePluginRegistry } from "../../../../application/contexts/PluginRegistry.context";

const PluginManagement: React.FC = () => {
  const { pluginKey } = useParams<{ pluginKey: string }>();
  const { getComponentsForSlot } = usePluginRegistry();

  const [configData, setConfigData] = useState<Record<string, string>>({});

  // Check if this plugin has a custom config UI
  const hasPluginConfigUI = pluginKey &&
    getComponentsForSlot(PLUGIN_SLOTS.PLUGIN_CONFIG).some(
      (c) => c.pluginKey === pluginKey
    );

  return (
    <Card>
      <CardContent>
        <Typography variant="h6">Configuration</Typography>

        {/* Plugin-provided configuration UI */}
        {hasPluginConfigUI ? (
          <PluginSlot
            id={PLUGIN_SLOTS.PLUGIN_CONFIG}
            pluginKey={pluginKey}  // Filter to this plugin only
            slotProps={{
              pluginKey,
              installationId: plugin.installationId,
              configData,
              onConfigChange: handleConfigChange,
              onSaveConfiguration: handleSaveConfiguration,
              onTestConnection: handleTestConnection,
              isSavingConfig,
              isTestingConnection,
            }}
          />
        ) : (
          // Fallback: Generic configuration form
          <GenericConfigForm
            fields={getConfigFields()}
            configData={configData}
            onChange={handleConfigChange}
          />
        )}
      </CardContent>
    </Card>
  );
};
```

**Key Points:**
- Uses `pluginKey` prop to filter to specific plugin's components
- Checks if plugin has custom UI before rendering slot
- Falls back to generic form if no custom UI provided
- Passes all configuration-related props via `slotProps`

### Summary: Slot Usage Patterns

| Pattern | Slot Props | Example |
|---------|------------|---------|
| **Menu items** | `onMenuClose`, `onTriggerModal`, `onAction` | Risk Management "Insert From" menu |
| **Modals** | `open`, `onClose`, `onComplete`, `apiServices` | Import wizard modals |
| **Tabs** | `activeTab`, `apiServices` | Model Inventory plugin tabs |
| **Config panels** | `configData`, `onConfigChange`, `onSave` | Plugin configuration UI |
| **Buttons** | `onClick`, `disabled`, `label` | Toolbar action buttons |

### Best Practices

1. **Always use external React/MUI** - Don't bundle React with your plugin
2. **Export all components** - Only exported components can be registered
3. **Use slot props** - Receive data via `slotProps`, don't fetch independently
4. **Handle loading states** - Show spinners while data loads
5. **Match app styling** - Use same MUI theme tokens as main app
6. **Test lifecycle** - Verify install/uninstall/reinstall all work correctly
7. **Keep bundles small** - Only include what's needed for the UI

---

## Current Plugins

### MLflow Integration

**Key:** `mlflow`
**Category:** ML Operations

Syncs AI/ML model metadata from MLflow tracking servers.

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| `tracking_server_url` | URL | MLflow server URL |
| `auth_method` | select | none / basic / token |
| `username` | text | For basic auth |
| `password` | password | For basic auth |
| `api_token` | password | For token auth |
| `verify_ssl` | checkbox | Verify SSL certificates |
| `timeout` | number | Request timeout (seconds) |

**Methods:**
- `install()` - Creates `mlflow_model_records` table
- `uninstall()` - Drops table
- `testConnection()` - Tests server connectivity
- `syncModels()` - Syncs model metadata

### Slack Integration

**Key:** `slack`
**Category:** Communication

Sends team notifications via Slack OAuth webhooks.

**OAuth Flow:**

1. User clicks "Add to Slack"
2. Redirects to Slack OAuth consent
3. Callback with authorization code
4. Backend exchanges code for access token
5. Webhook URL stored encrypted (base64)
6. Bot invited to selected channel

**Workspace Management:**
- Connect multiple workspaces
- Configure notification routing types
- Enable/disable workspaces
- Disconnect workspaces

**Routing Types:**
- Membership and roles
- Projects and organizations
- Policy reminders and status
- Evidence and task alerts
- Control or policy changes

**Data Storage:**
Workspaces stored in `public.slack_webhooks` table (not tenant-scoped):

```sql
INSERT INTO public.slack_webhooks (
  access_token,        -- base64 encoded
  scope,
  team_name,
  team_id,
  channel,
  channel_id,
  configuration_url,
  url,                 -- base64 encoded webhook URL
  user_id,
  is_active,
  routing_type         -- string array
)
```

### Risk Import

**Key:** `risk-import`
**Category:** Data Management

Bulk import risks from Excel/CSV files.

**Methods:**
- `getExcelTemplate()` - Generate template with project columns
- `importRisks()` - Parse and import risk records

---

## Plugin Marketplace Repository

The plugin marketplace is a separate Git repository that contains all plugin implementations and the marketplace manifest.

### Repository Structure

```
plugin-marketplace/
├── .git/
├── .gitignore
├── package.json              # Root dev dependencies (TypeScript)
├── tsconfig.json             # TypeScript configuration
├── plugins.json              # Marketplace manifest (registry)
├── README.md                 # Repository documentation
└── plugins/                  # Plugin implementations
    ├── slack/
    │   ├── index.ts          # Plugin implementation
    │   ├── package.json      # Plugin dependencies
    │   ├── README.md         # Plugin documentation
    │   └── ui/               # Optional UI components
    │       └── src/
    ├── mlflow/
    │   ├── index.ts
    │   ├── package.json
    │   ├── README.md
    │   └── ui/
    │       └── src/
    └── risk-import/
        ├── index.ts
        ├── package.json
        ├── README.md
        └── ui/
            └── src/
```

### Root Configuration Files

#### package.json (Root)

```json
{
  "devDependencies": {
    "@types/node": "^25.0.3",
    "typescript": "^5.9.3"
  }
}
```

#### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020", "DOM"],
    "types": ["node"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["plugins/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

#### .gitignore

```
node_modules/
dist/
build/
.env
.vscode/
.idea/
*.log
coverage/
.cache/
!plugins/**/*.js
```

### Marketplace Manifest (plugins.json)

The `plugins.json` file is the central registry that defines all available plugins.

#### Complete Manifest Structure

```json
{
  "version": "1.0.0",
  "plugins": [
    {
      "key": "plugin-key",
      "name": "Plugin Name",
      "displayName": "Plugin Display Name",
      "description": "Short description (1-2 sentences)",
      "longDescription": "Detailed description for the plugin detail page...",
      "version": "1.0.0",
      "author": "VerifyWise",
      "category": "category_id",
      "iconUrl": "/assets/plugin_logo.svg",
      "documentationUrl": "https://docs.verifywise.com/integrations/plugin",
      "supportUrl": "https://support.verifywise.com",
      "isOfficial": true,
      "isPublished": true,
      "requiresConfiguration": true,
      "installationType": "standard|tenant_scoped",
      "features": [
        {
          "name": "Feature Name",
          "description": "Feature description",
          "displayOrder": 1
        }
      ],
      "tags": ["tag1", "tag2", "tag3"],
      "pluginPath": "plugins/plugin-key",
      "entryPoint": "index.ts",
      "dependencies": {
        "package-name": "^1.0.0"
      }
    }
  ],
  "categories": [
    {
      "id": "category_id",
      "name": "Category Name",
      "description": "Category description"
    }
  ]
}
```

#### Installation Types

| Type | Description | Use Case |
|------|-------------|----------|
| `standard` | Uses shared/public tables | OAuth integrations (Slack), global configs |
| `tenant_scoped` | Creates tables with organization_id column | Data storage per organization (MLflow, Risk Import) |

#### Available Categories

| Category ID | Name | Description |
|-------------|------|-------------|
| `communication` | Communication | Team communication and notifications |
| `ml_ops` | ML Operations | Machine learning workflows and models |
| `version_control` | Version Control | Git integrations |
| `monitoring` | Monitoring | System and application monitoring |
| `security` | Security | Security and compliance tools |
| `data_management` | Data Management | Data import, export, and management |

---

## Plugin Development Guide

### Plugin Interface (TypeScript Types)

Every plugin must implement these types and export specific functions:

```typescript
// ========== TYPE DEFINITIONS ==========

interface PluginContext {
  sequelize: any; // Sequelize instance for database access
}

interface PluginMetadata {
  name: string;
  version: string;
  author: string;
  description: string;
}

interface InstallResult {
  success: boolean;
  message: string;
  installedAt: string;
}

interface UninstallResult {
  success: boolean;
  message: string;
  uninstalledAt: string;
}

interface ConfigureResult {
  success: boolean;
  message: string;
  configuredAt: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface TestConnectionResult {
  success: boolean;
  message: string;
  testedAt: string;
}
```

### Required Exports

Every plugin MUST export these functions:

```typescript
// Required: Called when plugin is installed
export async function install(
  userId: number,
  tenantId: string,
  config: YourConfigType,
  context: PluginContext
): Promise<InstallResult>;

// Required: Called when plugin is uninstalled
export async function uninstall(
  userId: number,
  tenantId: string,
  context: PluginContext
): Promise<UninstallResult>;

// Required: Plugin metadata
export const metadata: PluginMetadata;
```

### Optional Exports

```typescript
// Optional: Called when configuration is saved
export async function configure(
  userId: number,
  tenantId: string,
  config: YourConfigType,
  context: PluginContext
): Promise<ConfigureResult>;

// Optional: Validate configuration before saving
export function validateConfig(config: YourConfigType): ValidationResult;

// Optional: Test connection to external service
export async function testConnection(
  config: YourConfigType,
  context?: { sequelize: any; userId: number; tenantId: string }
): Promise<TestConnectionResult>;

// Optional: Plugin-specific methods
export async function syncModels(...): Promise<SyncResult>;
export async function importData(...): Promise<ImportResult>;
```

---

## Complete Plugin Templates

### Template 1: Standard Plugin (OAuth-based, like Slack)

Use this template for plugins that use OAuth authentication and store data in public tables.

#### package.json

```json
{
  "name": "@verifywise/plugin-my-service",
  "version": "1.0.0",
  "description": "My Service integration plugin for VerifyWise",
  "main": "index.js",
  "author": "VerifyWise",
  "license": "MIT",
  "dependencies": {
    "@my-service/web-api": "^1.0.0"
  },
  "keywords": ["verifywise", "plugin", "my-service", "integration"]
}
```

#### index.ts

```typescript
/**
 * My Service Plugin for VerifyWise
 *
 * This plugin provides My Service integration for notifications.
 */

// Type declaration for Node.js Buffer global
declare const Buffer: {
  from(str: string, encoding?: string): { toString(encoding?: string): string };
};

// ========== TYPE DEFINITIONS ==========

interface PluginContext {
  sequelize: any;
}

interface PluginMetadata {
  name: string;
  version: string;
  author: string;
  description: string;
}

interface InstallResult {
  success: boolean;
  message: string;
  installedAt: string;
}

interface UninstallResult {
  success: boolean;
  message: string;
  uninstalledAt: string;
}

interface ConfigureResult {
  success: boolean;
  message: string;
  configuredAt: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface MyServiceConfig {
  routing_type?: string[];
  // Add your config fields here
}

// ========== CONSTANTS ==========

const VALID_ROUTING_TYPES = [
  "Membership and roles",
  "Projects and organizations",
  "Policy reminders and status",
  "Evidence and task alerts",
  "Control or policy changes",
];

// ========== PLUGIN LIFECYCLE METHODS ==========

/**
 * Install the plugin
 * For OAuth plugins, no tables needed - uses existing OAuth flow
 */
export async function install(
  _userId: number,
  _tenantId: string,
  _config: MyServiceConfig,
  _context: PluginContext
): Promise<InstallResult> {
  try {
    return {
      success: true,
      message: "Plugin installed successfully. Configure OAuth to connect.",
      installedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    throw new Error(`Installation failed: ${error.message}`);
  }
}

/**
 * Uninstall the plugin
 */
export async function uninstall(
  userId: number,
  _tenantId: string,
  context: PluginContext
): Promise<UninstallResult> {
  try {
    const { sequelize } = context;

    // Clean up OAuth configurations
    const result: any = await sequelize.query(
      `DELETE FROM public.my_service_webhooks WHERE user_id = :userId`,
      { replacements: { userId } }
    );

    const deletedCount = result[0]?.rowCount || 0;

    return {
      success: true,
      message: `Plugin uninstalled. Removed ${deletedCount} configuration(s).`,
      uninstalledAt: new Date().toISOString(),
    };
  } catch (error: any) {
    throw new Error(`Uninstallation failed: ${error.message}`);
  }
}

/**
 * Configure the plugin
 */
export async function configure(
  userId: number,
  _tenantId: string,
  config: MyServiceConfig,
  context: PluginContext
): Promise<ConfigureResult> {
  try {
    const { sequelize } = context;

    if (config.routing_type && config.routing_type.length > 0) {
      const routingTypeArray = `{${config.routing_type.map((t: string) => `"${t}"`).join(",")}}`;

      await sequelize.query(
        `UPDATE public.my_service_webhooks
         SET routing_type = :routing_type, updated_at = NOW()
         WHERE user_id = :userId`,
        { replacements: { userId, routing_type: routingTypeArray } }
      );
    }

    return {
      success: true,
      message: "Configuration saved.",
      configuredAt: new Date().toISOString(),
    };
  } catch (error: any) {
    throw new Error(`Configuration failed: ${error.message}`);
  }
}

/**
 * Validate configuration
 */
export function validateConfig(config: MyServiceConfig): ValidationResult {
  const errors: string[] = [];

  if (!config) {
    return { valid: true, errors };
  }

  if (config.routing_type) {
    const invalidTypes = config.routing_type.filter(
      (type) => VALID_ROUTING_TYPES.indexOf(type) === -1
    );
    if (invalidTypes.length > 0) {
      errors.push(`Invalid routing types: ${invalidTypes.join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Test connection
 */
export async function testConnection(
  _config: MyServiceConfig,
  context?: { sequelize: any; userId: number }
): Promise<{ success: boolean; message: string; testedAt: string }> {
  try {
    if (!context?.sequelize || !context?.userId) {
      return {
        success: true,
        message: "Plugin installed. Connect via OAuth.",
        testedAt: new Date().toISOString(),
      };
    }

    const { sequelize, userId } = context;

    const result: any = await sequelize.query(
      `SELECT COUNT(*) as count FROM public.my_service_webhooks
       WHERE user_id = :userId AND is_active = true`,
      { replacements: { userId } }
    );

    const count = parseInt(result[0]?.[0]?.count || "0");

    return {
      success: count > 0,
      message: count > 0 ? `${count} connection(s) active` : "No connections. Configure OAuth.",
      testedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Connection check failed: ${error.message}`,
      testedAt: new Date().toISOString(),
    };
  }
}

// ========== PLUGIN METADATA ==========

export const metadata: PluginMetadata = {
  name: "My Service",
  version: "1.0.0",
  author: "VerifyWise",
  description: "My Service integration for notifications",
};
```

---

### Template 2: Tenant-Scoped Plugin with Database Table (like MLflow)

Use this template for plugins that need to store data per organization.

#### package.json

```json
{
  "name": "@verifywise/plugin-my-data-service",
  "version": "1.0.0",
  "description": "My Data Service integration plugin for VerifyWise",
  "main": "index.js",
  "author": "VerifyWise",
  "license": "MIT",
  "dependencies": {
    "axios": "^1.6.0"
  },
  "keywords": ["verifywise", "plugin", "my-data-service", "integration"]
}
```

#### index.ts

```typescript
/**
 * My Data Service Plugin for VerifyWise
 *
 * This plugin syncs data from an external service and stores it per-tenant.
 */

declare const Buffer: {
  from(str: string): { toString(encoding: string): string };
};

// ========== TYPE DEFINITIONS ==========

interface PluginContext {
  sequelize: any;
}

interface PluginMetadata {
  name: string;
  version: string;
  author: string;
  description: string;
}

interface InstallResult {
  success: boolean;
  message: string;
  installedAt: string;
}

interface UninstallResult {
  success: boolean;
  message: string;
  uninstalledAt: string;
}

interface ConfigureResult {
  success: boolean;
  message: string;
  configuredAt: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface TestConnectionResult {
  success: boolean;
  message: string;
  serverVersion: string;
  testedAt: string;
}

interface SyncResult {
  success: boolean;
  recordCount: number;
  syncedAt: string;
  status: string;
}

interface MyServiceConfig {
  server_url?: string;
  auth_method?: "none" | "basic" | "token";
  username?: string;
  password?: string;
  api_token?: string;
  verify_ssl?: boolean;
  timeout?: number;
}

// ========== PLUGIN LIFECYCLE METHODS ==========

/**
 * Install the plugin - creates tenant-specific table
 */
export async function install(
  _userId: number,
  tenantId: string,
  config: MyServiceConfig,
  context: PluginContext
): Promise<InstallResult> {
  try {
    const { sequelize } = context;

    // Create tenant-specific table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "${tenantId}".my_service_records (
        id SERIAL PRIMARY KEY,
        record_name VARCHAR(255) NOT NULL,
        record_type VARCHAR(255),
        status VARCHAR(255),
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        external_id VARCHAR(255),
        last_synced_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT my_service_records_unique UNIQUE (record_name, external_id)
      )
    `);

    // Perform initial sync if config provided
    if (config?.server_url) {
      const testResult = await testConnection(config);
      if (!testResult.success) {
        throw new Error(`Connection test failed: ${testResult.message}`);
      }

      const syncResult = await syncRecords(tenantId, config, context);
      if (!syncResult.success) {
        throw new Error(`Initial sync failed: ${syncResult.status}`);
      }

      return {
        success: true,
        message: `Plugin installed. Synced ${syncResult.recordCount} records.`,
        installedAt: new Date().toISOString(),
      };
    }

    return {
      success: true,
      message: "Plugin installed. Configure server URL to start syncing.",
      installedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    throw new Error(`Installation failed: ${error.message}`);
  }
}

/**
 * Uninstall the plugin - drops tenant-specific table
 */
export async function uninstall(
  _userId: number,
  tenantId: string,
  context: PluginContext
): Promise<UninstallResult> {
  try {
    const { sequelize } = context;

    // Count records before deletion
    const countResult: any = await sequelize.query(
      `SELECT COUNT(*) as count FROM "${tenantId}".my_service_records`
    );
    const totalRecords = parseInt(countResult[0][0].count);

    // Drop table
    await sequelize.query(
      `DROP TABLE IF EXISTS "${tenantId}".my_service_records CASCADE`
    );

    return {
      success: true,
      message: `Plugin uninstalled. Removed ${totalRecords} records.`,
      uninstalledAt: new Date().toISOString(),
    };
  } catch (error: any) {
    throw new Error(`Uninstallation failed: ${error.message}`);
  }
}

/**
 * Configure the plugin
 */
export async function configure(
  _userId: number,
  tenantId: string,
  config: MyServiceConfig,
  context: PluginContext
): Promise<ConfigureResult> {
  try {
    const validation = validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(", ")}`);
    }

    const testResult = await testConnection(config);
    if (!testResult.success) {
      throw new Error(`Connection test failed: ${testResult.message}`);
    }

    const syncResult = await syncRecords(tenantId, config, context);
    if (!syncResult.success) {
      throw new Error(`Sync failed: ${syncResult.status}`);
    }

    return {
      success: true,
      message: `Configured successfully. Synced ${syncResult.recordCount} records.`,
      configuredAt: new Date().toISOString(),
    };
  } catch (error: any) {
    throw new Error(`Configuration failed: ${error.message}`);
  }
}

/**
 * Validate configuration
 */
export function validateConfig(config: MyServiceConfig): ValidationResult {
  const errors: string[] = [];

  if (!config) {
    errors.push("Configuration is required");
    return { valid: false, errors };
  }

  if (!config.server_url) {
    errors.push("Server URL is required");
  }

  if (!config.auth_method) {
    errors.push("Authentication method is required");
  }

  if (config.auth_method === "basic") {
    if (!config.username || !config.password) {
      errors.push("Username and password required for basic auth");
    }
  }

  if (config.auth_method === "token") {
    if (!config.api_token) {
      errors.push("API token required for token auth");
    }
  }

  if (config.timeout && (config.timeout < 1 || config.timeout > 300)) {
    errors.push("Timeout must be between 1 and 300 seconds");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Test connection
 */
export async function testConnection(
  config: MyServiceConfig
): Promise<TestConnectionResult> {
  try {
    if (!config.server_url) {
      throw new Error("Server URL is required");
    }

    const headers = buildHeaders(config);
    const baseUrl = config.server_url.replace(/\/$/, "");

    const response = await fetch(`${baseUrl}/api/v1/health`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server returned ${response.status}: ${errorText}`);
    }

    return {
      success: true,
      message: "Successfully connected to server",
      serverVersion: "1.0+",
      testedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Connection failed: ${error.message}`,
      serverVersion: "unknown",
      testedAt: new Date().toISOString(),
    };
  }
}

/**
 * Sync records from external service
 */
export async function syncRecords(
  tenantId: string,
  config: MyServiceConfig,
  context: PluginContext
): Promise<SyncResult> {
  try {
    if (!config.server_url) {
      throw new Error("Server URL is required");
    }

    const { sequelize } = context;
    const headers = buildHeaders(config);
    const baseUrl = config.server_url.replace(/\/$/, "");

    // Fetch data from external API
    const response = await fetch(`${baseUrl}/api/v1/records`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const data = await response.json();
    const records = data.records || [];

    if (!records.length) {
      return {
        success: true,
        recordCount: 0,
        syncedAt: new Date().toISOString(),
        status: "no_records",
      };
    }

    // Persist records using bulk upsert
    await persistRecords(records, tenantId, sequelize);

    return {
      success: true,
      recordCount: records.length,
      syncedAt: new Date().toISOString(),
      status: "success",
    };
  } catch (error: any) {
    return {
      success: false,
      recordCount: 0,
      syncedAt: new Date().toISOString(),
      status: `failed: ${error.message}`,
    };
  }
}

// ========== HELPER FUNCTIONS ==========

/**
 * Build authentication headers
 */
function buildHeaders(config: MyServiceConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.auth_method === "basic" && config.username && config.password) {
    const credentials = Buffer.from(
      `${config.username}:${config.password}`
    ).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  } else if (config.auth_method === "token" && config.api_token) {
    headers["Authorization"] = `Bearer ${config.api_token}`;
  }

  return headers;
}

/**
 * Persist records to database with upsert
 */
async function persistRecords(
  records: any[],
  tenantId: string,
  sequelize: any
): Promise<void> {
  if (!records.length) return;

  const now = new Date();

  for (const record of records) {
    await sequelize.query(
      `INSERT INTO "${tenantId}".my_service_records
       (record_name, record_type, status, data, external_id, last_synced_at, updated_at)
       VALUES (:record_name, :record_type, :status, :data, :external_id, :last_synced_at, :updated_at)
       ON CONFLICT (record_name, external_id) DO UPDATE SET
         record_type = EXCLUDED.record_type,
         status = EXCLUDED.status,
         data = EXCLUDED.data,
         last_synced_at = EXCLUDED.last_synced_at,
         updated_at = EXCLUDED.updated_at`,
      {
        replacements: {
          record_name: record.name,
          record_type: record.type || null,
          status: record.status || null,
          data: JSON.stringify(record.data || {}),
          external_id: record.id || null,
          last_synced_at: now,
          updated_at: now,
        },
      }
    );
  }
}

// ========== PLUGIN METADATA ==========

export const metadata: PluginMetadata = {
  name: "My Data Service",
  version: "1.0.0",
  author: "VerifyWise",
  description: "My Data Service integration for data sync",
};
```

---

### Template 3: Data Import Plugin with Excel (like Risk Import)

Use this template for plugins that import data from files.

#### package.json

```json
{
  "name": "@verifywise/plugin-data-import",
  "version": "1.0.0",
  "description": "Data import plugin for VerifyWise",
  "main": "index.js",
  "author": "VerifyWise",
  "license": "MIT",
  "dependencies": {
    "exceljs": "^4.4.0"
  },
  "keywords": ["verifywise", "plugin", "import", "excel", "data-management"]
}
```

#### index.ts (Key sections)

```typescript
/**
 * Data Import Plugin for VerifyWise
 *
 * Provides Excel import with dropdown validation.
 */

import * as ExcelJS from "exceljs";

// ========== TYPE DEFINITIONS ==========

interface PluginContext {
  sequelize: any;
}

interface ExcelTemplateResult {
  success: boolean;
  buffer: any;
  filename: string;
}

interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: Array<{ row: number; field: string; message: string }>;
  importedAt: string;
}

interface DataRow {
  name: string;
  type: string;
  // Add your fields here
}

// ========== ENUM DEFINITIONS ==========

const TYPE_VALUES = ["Type A", "Type B", "Type C"];
const STATUS_VALUES = ["Active", "Inactive", "Pending"];

// ========== PLUGIN LIFECYCLE METHODS ==========

export async function install(
  _userId: number,
  _tenantId: string,
  _config: any,
  _context: PluginContext
): Promise<InstallResult> {
  try {
    // No tables needed - works with existing tables
    return {
      success: true,
      message: "Plugin installed. You can now import data via Excel.",
      installedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    throw new Error(`Installation failed: ${error.message}`);
  }
}

export async function uninstall(
  _userId: number,
  _tenantId: string,
  _context: PluginContext
): Promise<UninstallResult> {
  try {
    return {
      success: true,
      message: "Plugin uninstalled.",
      uninstalledAt: new Date().toISOString(),
    };
  } catch (error: any) {
    throw new Error(`Uninstallation failed: ${error.message}`);
  }
}

// ========== EXCEL TEMPLATE GENERATION ==========

export async function getExcelTemplate(
  organizationId: string,
  context: PluginContext
): Promise<ExcelTemplateResult> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Data Import");

  // Fetch users for dropdown
  let users: Array<{ id: number; name: string; email: string }> = [];
  try {
    const result = await context.sequelize.query(
      "SELECT id, name, surname, email FROM public.users WHERE organization_id = :organizationId",
      { replacements: { organizationId }, type: context.sequelize.QueryTypes.SELECT }
    );
    users = result as any;
  } catch (error) {
    console.error("Error fetching users:", error);
  }

  // Define headers
  const headers = [
    { key: "name", header: "Name *", width: 30 },
    { key: "type", header: "Type *", width: 20 },
    { key: "owner", header: "Owner *", width: 30 },
    { key: "status", header: "Status", width: 20 },
    { key: "due_date", header: "Due Date", width: 20 },
  ];

  worksheet.columns = headers;

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF13715B" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 25;

  // Create user dropdown options
  const userOptions = users.map(
    (u) => `${u.name} - ${u.email} (ID: ${u.id})`
  );

  // Add dropdown validation helper
  const addDropdown = (col: number, values: string[], startRow = 2, endRow = 1000) => {
    for (let row = startRow; row <= endRow; row++) {
      worksheet.getCell(row, col).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${values.join(",")}"`],
        showErrorMessage: true,
        errorStyle: "error",
        errorTitle: "Invalid Value",
        error: "Please select from dropdown",
      };
    }
  };

  // Add date validation helper
  const addDateValidation = (col: number, startRow = 2, endRow = 1000) => {
    for (let row = startRow; row <= endRow; row++) {
      const cell = worksheet.getCell(row, col);
      cell.dataValidation = {
        type: "date",
        allowBlank: true,
        operator: "greaterThan",
        formulae: [new Date(1900, 0, 1)],
        showErrorMessage: true,
        errorTitle: "Invalid Date",
        error: "Please enter valid date",
      };
      cell.numFmt = "yyyy-mm-dd";
    }
  };

  // Apply validations
  addDropdown(2, TYPE_VALUES);        // Type column
  if (userOptions.length > 0) {
    addDropdown(3, userOptions);      // Owner column
  }
  addDropdown(4, STATUS_VALUES);      // Status column
  addDateValidation(5);               // Due Date column

  // Freeze header row
  worksheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  // Add sample data
  const sampleUser = userOptions.length > 0 ? userOptions[0] : "Select user";
  worksheet.addRow({
    name: "Example Item",
    type: "Type A",
    owner: sampleUser,
    status: "Active",
    due_date: "2025-12-31",
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    success: true,
    buffer,
    filename: "import_template.xlsx",
  };
}

// ========== DATA IMPORT ==========

function parseUserId(value: any): number | null {
  if (!value) return null;
  const strValue = String(value);
  if (!isNaN(Number(strValue))) return Number(strValue);
  const match = strValue.match(/\(ID:\s*(\d+)\)/);
  return match?.[1] ? Number(match[1]) : null;
}

function validateRow(
  row: Partial<DataRow>,
  rowIndex: number
): Array<{ row: number; field: string; message: string }> {
  const errors: Array<{ row: number; field: string; message: string }> = [];

  if (!row.name?.trim()) {
    errors.push({ row: rowIndex, field: "name", message: "Name is required" });
  }

  if (row.type && TYPE_VALUES.indexOf(row.type) === -1) {
    errors.push({
      row: rowIndex,
      field: "type",
      message: `Invalid type. Must be: ${TYPE_VALUES.join(", ")}`,
    });
  }

  return errors;
}

export async function importData(
  data: Partial<DataRow>[],
  tenantId: string,
  context: PluginContext
): Promise<ImportResult> {
  const { sequelize } = context;
  const errors: Array<{ row: number; field: string; message: string }> = [];
  let imported = 0;
  let failed = 0;

  try {
    // Validate all rows first
    data.forEach((row, index) => {
      errors.push(...validateRow(row, index + 2));
    });

    if (errors.length > 0) {
      return {
        success: false,
        imported: 0,
        failed: data.length,
        errors,
        importedAt: new Date().toISOString(),
      };
    }

    // Import each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      try {
        await sequelize.query(
          `INSERT INTO "${tenantId}".your_table (name, type, created_at)
           VALUES (:name, :type, NOW())`,
          {
            replacements: {
              name: row.name?.trim(),
              type: row.type || null,
            },
          }
        );
        imported++;
      } catch (error: any) {
        failed++;
        errors.push({
          row: i + 2,
          field: "general",
          message: `Import failed: ${error.message}`,
        });
      }
    }

    return {
      success: imported > 0,
      imported,
      failed,
      errors,
      importedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    throw new Error(`Import failed: ${error.message}`);
  }
}

// ========== PLUGIN METADATA ==========

export const metadata: PluginMetadata = {
  name: "Data Import",
  version: "1.0.0",
  author: "VerifyWise",
  description: "Import data from Excel files",
};
```

---

## Slack Plugin: Notification Routing Types

The Slack plugin uses routing types to filter notifications:

```typescript
const VALID_ROUTING_TYPES = [
  "Membership and roles",
  "Projects and organizations",
  "Policy reminders and status",
  "Evidence and task alerts",
  "Control or policy changes",
];
```

### Notification Functions

```typescript
// Send by routing type
export async function sendNotificationByRoutingType(
  userId: number,
  routingType: string,
  message: { title: string; message: string },
  sequelize: any
): Promise<void>;

// Specific notification helpers
export async function notifyControlPolicyChange(userId, changeData, sequelize): Promise<void>;
export async function notifyEvidenceTaskAlert(userId, alertData, sequelize): Promise<void>;
export async function notifyPolicyReminderStatus(userId, policyData, sequelize): Promise<void>;
export async function notifyMembershipRoles(userId, memberData, sequelize): Promise<void>;
export async function notifyProjectOrganization(userId, projectData, sequelize): Promise<void>;
```

---

## Risk Import Plugin: Enums Reference

### AI Lifecycle Phases

```typescript
const AI_LIFECYCLE_PHASES = [
  "Problem definition & planning",
  "Data collection & processing",
  "Model development & training",
  "Model validation & testing",
  "Deployment & integration",
  "Monitoring & maintenance",
  "Decommissioning & retirement",
];
```

### Likelihood Values

```typescript
const LIKELIHOOD_VALUES = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
```

### Severity Values

```typescript
const SEVERITY_VALUES = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"];
```

### Risk Severity Values

```typescript
const RISK_SEVERITY_VALUES = ["Negligible", "Minor", "Moderate", "Major", "Critical"];
```

### Risk Level Values

```typescript
const RISK_LEVEL_VALUES = [
  "No risk",
  "Very low risk",
  "Low risk",
  "Medium risk",
  "High risk",
  "Very high risk",
];
```

### Mitigation Status Values

```typescript
const MITIGATION_STATUS_VALUES = [
  "Not Started",
  "In Progress",
  "Completed",
  "On Hold",
  "Deferred",
  "Canceled",
  "Requires review",
];
```

### Risk Category Values

```typescript
const RISK_CATEGORY_VALUES = [
  "Strategic risk",
  "Operational risk",
  "Compliance risk",
  "Financial risk",
  "Cybersecurity risk",
  "Reputational risk",
  "Legal risk",
  "Technological risk",
  "Third-party/vendor risk",
  "Environmental risk",
  "Human resources risk",
  "Geopolitical risk",
  "Fraud risk",
  "Data privacy risk",
  "Health and safety risk",
];
```

### Risk Level Calculation

```typescript
function calculateRiskLevel(likelihood: string, severity: string): string {
  const likelihoodMap: Record<string, number> = {
    Rare: 1, Unlikely: 2, Possible: 3, Likely: 4, "Almost Certain": 5,
  };
  const severityMap: Record<string, number> = {
    Negligible: 1, Minor: 2, Moderate: 3, Major: 4, Catastrophic: 5,
  };

  const score = (likelihoodMap[likelihood] * 1) + (severityMap[severity] * 3);

  if (score <= 4) return "Very low risk";
  if (score <= 8) return "Low risk";
  if (score <= 12) return "Medium risk";
  if (score <= 16) return "High risk";
  return "Very high risk";
}
```

---

## Security Considerations

### Remote Code Execution

Plugins are downloaded and executed via `require()`. Security measures:

1. **Trusted Source:** Only fetch from verified marketplace repository
2. **Cache Isolation:** Each plugin cached in separate directory
3. **Tenant Isolation:** Plugin data stored in tenant-scoped schemas
4. **Context Injection:** Only `sequelize` instance passed to plugins
5. **Timeout:** npm install has 60-second timeout

### OAuth Security

- Access tokens stored encrypted (base64)
- Webhook URLs stored encrypted (base64)
- CSRF protection via state parameter
- User ownership verified before modifications

### Configuration Storage

- Plugin configurations stored as JSONB
- Sensitive fields should be encrypted by plugin
- Never expose raw credentials to frontend

### Validation

All inputs validated with custom exceptions:

```typescript
throw new ValidationException("Plugin key is required", "plugin_key", plugin_key);
throw new NotFoundException("Plugin installation not found", "installation", id);
```

---

## Adding a New Plugin (Step-by-Step)

### Step 1: Create Plugin Directory

```bash
cd plugin-marketplace
mkdir -p plugins/my-plugin/ui/src
```

### Step 2: Create package.json

```json
{
  "name": "@verifywise/plugin-my-plugin",
  "version": "1.0.0",
  "description": "My Plugin for VerifyWise",
  "main": "index.js",
  "author": "VerifyWise",
  "license": "MIT",
  "dependencies": {
    // Add your dependencies here
  },
  "keywords": ["verifywise", "plugin", "my-plugin"]
}
```

### Step 3: Create index.ts

Use one of the templates above based on your plugin type:
- **OAuth/Standard plugin**: Use Template 1 (Slack-like)
- **Tenant-scoped with database**: Use Template 2 (MLflow-like)
- **Data import from files**: Use Template 3 (Risk Import-like)

Minimum required exports:

```typescript
// REQUIRED: Install function
export async function install(
  userId: number,
  tenantId: string,
  config: any,
  context: { sequelize: any }
): Promise<{ success: boolean; message: string; installedAt: string }> {
  // Your installation logic
  return {
    success: true,
    message: "Plugin installed successfully",
    installedAt: new Date().toISOString(),
  };
}

// REQUIRED: Uninstall function
export async function uninstall(
  userId: number,
  tenantId: string,
  context: { sequelize: any }
): Promise<{ success: boolean; message: string; uninstalledAt: string }> {
  // Your cleanup logic
  return {
    success: true,
    message: "Plugin uninstalled successfully",
    uninstalledAt: new Date().toISOString(),
  };
}

// REQUIRED: Metadata
export const metadata = {
  name: "My Plugin",
  version: "1.0.0",
  author: "VerifyWise",
  description: "Description of my plugin",
};
```

### Step 4: Add to plugins.json Manifest

```json
{
  "key": "my-plugin",
  "name": "My Plugin",
  "displayName": "My Plugin",
  "description": "Short description (shown in card)",
  "longDescription": "Detailed description (shown in detail page)...",
  "version": "1.0.0",
  "author": "VerifyWise",
  "category": "data_management",
  "iconUrl": "/assets/my_plugin_logo.svg",
  "documentationUrl": "https://docs.verifywise.com/integrations/my-plugin",
  "supportUrl": "https://support.verifywise.com",
  "isOfficial": true,
  "isPublished": true,
  "requiresConfiguration": true,
  "installationType": "tenant_scoped",
  "features": [
    {
      "name": "Feature 1",
      "description": "What this feature does",
      "displayOrder": 1
    },
    {
      "name": "Feature 2",
      "description": "What this feature does",
      "displayOrder": 2
    }
  ],
  "tags": ["my-plugin", "integration", "data"],
  "pluginPath": "plugins/my-plugin",
  "entryPoint": "index.ts",
  "dependencies": {
    "axios": "^1.6.0"
  }
}
```

### Step 5: Create README.md

```markdown
# My Plugin

## Overview
Description of what the plugin does.

## Features
- Feature 1
- Feature 2

## Configuration
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| server_url | URL | Yes | Server URL |
| api_key | Password | Yes | API key |

## Usage
Instructions on how to use the plugin.

## Database Schema
If tenant-scoped, document the tables created.

## Troubleshooting
Common issues and solutions.
```

### Step 6: Create Plugin UI (Optional but Recommended)

If your plugin needs a custom UI, create an IIFE bundle:

#### 6a. Create UI Directory Structure

```bash
mkdir -p plugins/my-plugin/ui/src
cd plugins/my-plugin/ui
```

#### 6b. Create UI package.json

```json
{
  "name": "@verifywise/plugin-my-plugin-ui",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@mui/material": "^5.14.0",
    "@emotion/react": "^11.11.0",
    "@emotion/styled": "^11.11.0",
    "lucide-react": "^0.294.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0"
  }
}
```

#### 6c. Create vite.config.ts

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "PluginMyPlugin",  // Must match globalName in plugins.json
      formats: ["iife"],
      fileName: () => "bundle.iife.js",
    },
    rollupOptions: {
      external: ["react", "react-dom", "@mui/material", "@emotion/react", "@emotion/styled"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "@mui/material": "MaterialUI",
          "@emotion/react": "emotionReact",
          "@emotion/styled": "emotionStyled",
        },
        format: "iife",
        name: "PluginMyPlugin",
      },
    },
    outDir: "dist",
  },
});
```

#### 6d. Create tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

#### 6e. Create Entry Point (src/index.ts)

```typescript
// Export all components that will be injected into slots
export { MyPluginTab } from "./MyPluginTab";
export { MyPluginConfiguration } from "./MyPluginConfiguration";
```

#### 6f. Create Components

**src/MyPluginTab.tsx:**

```tsx
import React from "react";
import { Box, Typography, Alert } from "@mui/material";

interface MyPluginTabProps {
  projectId?: number;
  // Add props your component needs
}

export const MyPluginTab: React.FC<MyPluginTabProps> = ({ projectId }) => {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        My Plugin Data
      </Typography>
      <Alert severity="info">
        Plugin UI loaded successfully for project {projectId}
      </Alert>
      {/* Your plugin UI content */}
    </Box>
  );
};
```

**src/MyPluginConfiguration.tsx:**

```tsx
import React from "react";
import { Box, Typography, TextField, Button, Stack } from "@mui/material";

interface MyPluginConfigurationProps {
  configData?: Record<string, string>;
  onConfigChange?: (key: string, value: string) => void;
  onSaveConfiguration?: () => void;
  onTestConnection?: () => void;
  isSavingConfig?: boolean;
  isTestingConnection?: boolean;
}

export const MyPluginConfiguration: React.FC<MyPluginConfigurationProps> = ({
  configData = {},
  onConfigChange,
  onSaveConfiguration,
  onTestConnection,
  isSavingConfig = false,
  isTestingConnection = false,
}) => {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configure your plugin settings.
      </Typography>

      <Stack spacing={2}>
        <TextField
          fullWidth
          label="API URL"
          placeholder="https://api.example.com"
          value={configData.api_url || ""}
          onChange={(e) => onConfigChange?.("api_url", e.target.value)}
          size="small"
        />

        <TextField
          fullWidth
          label="API Key"
          type="password"
          placeholder="Enter your API key"
          value={configData.api_key || ""}
          onChange={(e) => onConfigChange?.("api_key", e.target.value)}
          size="small"
        />
      </Stack>

      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, mt: 3 }}>
        {onTestConnection && (
          <Button
            variant="outlined"
            onClick={onTestConnection}
            disabled={isTestingConnection || isSavingConfig}
          >
            {isTestingConnection ? "Testing..." : "Test Connection"}
          </Button>
        )}
        {onSaveConfiguration && (
          <Button
            variant="contained"
            onClick={onSaveConfiguration}
            disabled={isSavingConfig || isTestingConnection}
          >
            {isSavingConfig ? "Saving..." : "Save Configuration"}
          </Button>
        )}
      </Box>
    </Box>
  );
};
```

#### 6g. Add UI Config to plugins.json

Update your plugin entry in `plugins.json`:

```json
{
  "key": "my-plugin",
  "name": "My Plugin",
  "ui": {
    "bundleUrl": "/api/plugins/my-plugin/ui/bundle.js",
    "globalName": "PluginMyPlugin",
    "slots": [
      {
        "slotId": "project-risks-tab",
        "componentName": "MyPluginTab",
        "renderType": "tab",
        "props": {
          "label": "My Plugin",
          "icon": "Puzzle"
        }
      },
      {
        "slotId": "plugin-config",
        "componentName": "MyPluginConfiguration",
        "renderType": "inline"
      }
    ]
  }
}
```

#### 6h. Build the UI Bundle

```bash
cd plugins/my-plugin/ui
npm install
npm run build
# Output: dist/bundle.iife.js
```

### Step 7: Add Fallback Frontend Configuration (if no custom UI)

If you don't create a custom UI component, update `Clients/src/presentation/pages/Plugins/PluginManagement/index.tsx`:

```typescript
const getConfigFields = () => {
  if (pluginKey === "my-plugin") {
    return [
      {
        key: "server_url",
        label: "Server URL",
        type: "url",
        placeholder: "https://api.example.com",
        required: true,
      },
      {
        key: "api_key",
        label: "API Key",
        type: "password",
        placeholder: "Enter your API key",
        required: true,
      },
      {
        key: "sync_interval",
        label: "Sync Interval (minutes)",
        type: "number",
        placeholder: "60",
        required: false,
      },
    ];
  }
  // ... existing plugins
};
```

### Step 7: Test Your Plugin

1. Install dependencies:
   ```bash
   cd plugins/my-plugin
   npm install
   ```

2. Compile TypeScript:
   ```bash
   cd ../..
   npx tsc
   ```

3. Test locally:
   - Set `PLUGIN_MARKETPLACE_URL` to local path
   - Or copy plugins.json and plugin folder to VerifyWise server

4. Test in VerifyWise:
   - Navigate to `/plugins`
   - Find your plugin in Marketplace
   - Install and configure
   - Test all functionality

### Step 8: Commit and Push

```bash
git add .
git commit -m "feat: add my-plugin integration"
git push origin your-branch
```

### Checklist

**Backend Plugin:**
- [ ] `package.json` with correct dependencies
- [ ] `index.ts` with all required exports (`install`, `uninstall`, `metadata`)
- [ ] `install()` creates tables (if tenant-scoped)
- [ ] `uninstall()` drops tables and cleans up
- [ ] `validateConfig()` validates all required fields
- [ ] `testConnection()` tests external service (if applicable)
- [ ] `plugins.json` entry with all fields
- [ ] `README.md` with documentation

**Plugin UI (if applicable):**
- [ ] `ui/package.json` with React, MUI dependencies
- [ ] `ui/vite.config.ts` with IIFE build configuration
- [ ] `ui/src/index.ts` exports all components
- [ ] Components created for each slot
- [ ] `ui` config added to `plugins.json` with `bundleUrl`, `globalName`, `slots`
- [ ] Bundle builds successfully (`npm run build`)
- [ ] Components use correct prop interfaces (match slotProps)

**Testing:**
- [ ] Tested install - UI appears without refresh
- [ ] Tested uninstall - UI disappears without refresh
- [ ] Tested re-install - UI appears without refresh
- [ ] Tested configuration save
- [ ] Tested main functionality
- [ ] No console errors in browser

---

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `Servers/services/plugin/pluginService.ts` | Core plugin service with all operations |
| `Servers/controllers/plugin.ctrl.ts` | HTTP handlers with logging |
| `Servers/routes/plugin.route.ts` | Route definitions with rate limiting |
| `Servers/utils/pluginInstallation.utils.ts` | Database utility functions |
| `Servers/domain.layer/models/plugin/pluginInstallation.model.ts` | Model class with raw SQL |
| `Servers/domain.layer/interfaces/i.pluginInstallation.ts` | TypeScript interface |
| `Servers/domain.layer/enums/plugin.enum.ts` | Status enum |
| `Servers/database/migrations/20251226151729-create-plugin-installations-table.js` | Database migration |

### Frontend

| File | Purpose |
|------|---------|
| `Clients/src/domain/types/plugins.ts` | TypeScript types and enums |
| `Clients/src/domain/constants/pluginSlots.ts` | Plugin slot IDs and render types |
| `Clients/src/application/repository/plugin.repository.ts` | API client functions |
| `Clients/src/application/contexts/PluginRegistry.context.tsx` | **Core: Plugin UI state management, dynamic loading** |
| `Clients/src/application/hooks/usePlugins.ts` | Marketplace + installed plugins hook |
| `Clients/src/application/hooks/usePluginInstallation.ts` | Install/uninstall with UI refresh |
| `Clients/src/application/hooks/useIsPluginInstalled.ts` | Check installation status hook |
| `Clients/src/presentation/components/PluginLoader/index.tsx` | **Loads UI bundles on app startup** |
| `Clients/src/presentation/components/PluginSlot/index.tsx` | **Renders plugin components at injection points** |
| `Clients/src/presentation/components/PluginGate/index.tsx` | Conditional rendering component |
| `Clients/src/presentation/components/PluginCard/index.tsx` | Plugin card component |
| `Clients/src/presentation/pages/Plugins/index.tsx` | Marketplace page |
| `Clients/src/presentation/pages/Plugins/PluginManagement/index.tsx` | Plugin detail/config page |

### Plugin UI Files (per plugin)

| File | Purpose |
|------|---------|
| `plugins/{key}/ui/package.json` | UI dependencies (React, MUI) |
| `plugins/{key}/ui/vite.config.ts` | IIFE build configuration |
| `plugins/{key}/ui/tsconfig.json` | TypeScript configuration |
| `plugins/{key}/ui/src/index.ts` | Entry point - exports all components |
| `plugins/{key}/ui/src/*.tsx` | React components for slots |
| `plugins/{key}/ui/dist/bundle.iife.js` | Built bundle (served by backend) |

---

## Environment Variables

### Backend

```bash
# Slack OAuth (for Slack plugin)
SLACK_API_URL=https://slack.com/api/oauth.v2.access
SLACK_CLIENT_ID=your-client-id
SLACK_CLIENT_SECRET=your-client-secret
FRONTEND_URL=https://app.verifywise.ai
```

### Frontend

```bash
VITE_SLACK_CLIENT_ID=your-client-id
VITE_SLACK_URL=https://slack.com/oauth/v2/authorize
```

---

## Troubleshooting Guide

### Common Issues and Solutions

#### Plugin Installation Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Plugin not found in marketplace" | Plugin not in plugins.json or `isPublished: false` | Check plugins.json in marketplace repo |
| "Installation failed: table already exists" | Previous uninstall didn't clean up | Manually drop tables or fix uninstall() |
| "Failed to download plugin" | Network issue or wrong URL | Check PLUGIN_MARKETPLACE_URL, verify connectivity |
| "Plugin validation failed" | Missing required config | Check validateConfig() errors in response |

#### Plugin UI Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| UI doesn't appear after install | Bundle not loaded | Check Network tab for 404, verify bundleUrl |
| "Component X not found" | Export name mismatch | Verify componentName matches export in index.tsx |
| UI persists after uninstall | unloadPlugin() not called | Check usePluginInstallation hook |
| UI doesn't appear on re-install | Components not re-registered | Fixed in PluginRegistry - verify loadPluginUI logic |
| "Invalid hook call" error | Multiple React instances | Ensure React is external in vite.config |
| Styling doesn't match app | Using custom CSS instead of MUI | Use MUI components with sx prop |

#### Configuration Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Configuration failed" | validateConfig() returned errors | Check validation logic and error messages |
| Test Connection fails | Wrong credentials or URL | Verify config values, check network |
| Config not persisting | Database error | Check plugin_installations table |

#### Backend Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Plugin method not found | Wrong method name or not exported | Verify export in plugin index.ts |
| "Tenant not found" | Invalid tenantId | Check tenant exists in database |
| Database errors | SQL syntax or missing schema | Check query syntax, verify schema exists |

### Debugging Steps

1. **Check Server Logs**
   ```bash
   # Look for [PluginService] prefixed logs
   tail -f logs/server.log | grep PluginService
   ```

2. **Check Browser Console**
   ```javascript
   // Look for [PluginRegistry] or [PluginLoader] logs
   // Network tab for bundle loading issues
   ```

3. **Verify Database State**
   ```sql
   -- Check installation status
   SELECT * FROM plugin_installations WHERE plugin_key = 'my-plugin';

   -- Check tenant tables exist
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'tenant_id';
   ```

4. **Test Plugin Manually**
   ```typescript
   // In backend, test plugin loading
   const plugin = await pluginService.loadPlugin('my-plugin');
   console.log(plugin.metadata);
   ```

---

## Extending the Plugin System

### Adding New Plugin Slots

1. **Define slot constant** in `Clients/src/domain/constants/pluginSlots.ts`:
   ```typescript
   export const PLUGIN_SLOTS = {
     // ... existing slots
     MY_NEW_SLOT: "page.mypage.myslot",
   } as const;
   ```

2. **Add PluginSlot component** in the target page:
   ```tsx
   import { PluginSlot } from "../../components/PluginSlot";
   import { PLUGIN_SLOTS } from "../../../domain/constants/pluginSlots";

   <PluginSlot
     id={PLUGIN_SLOTS.MY_NEW_SLOT}
     slotProps={{ /* props for plugins */ }}
   />
   ```

3. **Document the slot** - Update this documentation with:
   - Slot ID and location
   - Available render types
   - Props passed to components

### Adding New Render Types

1. **Add type** in `Clients/src/domain/constants/pluginSlots.ts`:
   ```typescript
   export type PluginRenderType =
     | "menuitem"
     | "modal"
     | "tab"
     | "my_new_type";  // Add here
   ```

2. **Handle in PluginSlot** in `Clients/src/presentation/components/PluginSlot/index.tsx`:
   ```tsx
   // Add case for new render type
   case "my_new_type":
     return <MyNewTypeWrapper>{element}</MyNewTypeWrapper>;
   ```

### Adding New Plugin APIs

1. **Add route** in `Servers/routes/plugin.route.ts`:
   ```typescript
   router.get("/:key/my-endpoint", authenticateJWT, myHandler);
   ```

2. **Add controller** in `Servers/controllers/plugin.ctrl.ts`:
   ```typescript
   export const myHandler = async (req, res) => {
     // Implementation
   };
   ```

3. **Add repository function** in `Clients/src/application/repository/plugin.repository.ts`:
   ```typescript
   export async function myApiCall(params) {
     return apiServices.get(`/plugins/${params.key}/my-endpoint`);
   }
   ```

### Adding New Plugin Lifecycle Methods

1. **Define in plugin** (`plugins/my-plugin/index.ts`):
   ```typescript
   export async function myNewMethod(tenantId, config, context) {
     // Implementation
   }
   ```

2. **Call from PluginService** (`Servers/services/plugin/pluginService.ts`):
   ```typescript
   async myNewMethod(pluginKey, tenantId, config) {
     const plugin = await this.loadPlugin(pluginKey);
     if (plugin.myNewMethod) {
       return plugin.myNewMethod(tenantId, config, this.context);
     }
   }
   ```

---

## Testing Guide

### Unit Testing Plugins

```typescript
// plugins/my-plugin/__tests__/index.test.ts
import { install, uninstall, validateConfig } from '../index';

describe('MyPlugin', () => {
  const mockContext = {
    sequelize: {
      query: jest.fn(),
    },
  };

  describe('install', () => {
    it('should create tables', async () => {
      const result = await install(1, 'tenant-1', {}, mockContext);
      expect(result.success).toBe(true);
      expect(mockContext.sequelize.query).toHaveBeenCalled();
    });
  });

  describe('validateConfig', () => {
    it('should require api_url', () => {
      const result = validateConfig({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('API URL is required');
    });
  });
});
```

### Integration Testing

```typescript
// Test plugin installation flow
describe('Plugin Installation', () => {
  it('should install plugin and create tables', async () => {
    // Install
    const response = await request(app)
      .post('/api/plugins/install')
      .send({ pluginKey: 'my-plugin' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('installed');

    // Verify table exists
    const tables = await sequelize.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'tenant_1' AND table_name = 'my_plugin_data'
    `);
    expect(tables[0].length).toBe(1);
  });
});
```

### UI Testing

```typescript
// Test plugin UI loading
describe('PluginSlot', () => {
  it('should render plugin components', () => {
    const { getByText } = render(
      <PluginRegistryProvider>
        <PluginSlot id="page.plugin.config" />
      </PluginRegistryProvider>
    );

    // Assuming plugin is installed and loaded
    expect(getByText('My Plugin Config')).toBeInTheDocument();
  });
});
```

### Manual Testing Checklist

```
□ Marketplace page loads all plugins
□ Plugin card displays correct info
□ Install button works
□ Plugin installs without errors
□ UI appears after install (no refresh)
□ Configuration page loads
□ Config fields render correctly
□ Validation errors show properly
□ Test Connection works
□ Save Configuration works
□ Plugin functionality works
□ Uninstall button works
□ UI disappears after uninstall (no refresh)
□ Tables cleaned up after uninstall
□ Re-install works correctly
□ No console errors throughout
```

---

## Security Considerations

### Plugin Isolation

- **Code Execution**: Plugins run in Node.js context with limited access
- **Database Access**: Only through provided Sequelize instance
- **File System**: No direct file system access outside plugin directory
- **Network**: Allowed via fetch/axios for external integrations

### Configuration Security

- **Storage**: Sensitive config stored in `plugin_installations.configuration` (JSONB)
- **Encryption**: Consider encrypting sensitive fields at application level
- **API Keys**: Never log or expose in error messages
- **Validation**: Always validate config before use

### Tenant Isolation

- **Schema Separation**: Each tenant has isolated database schema
- **Query Scoping**: Always use `tenantId` in queries
- **Cross-Tenant Prevention**: Plugin code cannot access other tenants

### API Security

- **Authentication**: All plugin APIs require JWT authentication
- **Rate Limiting**: Install endpoint has rate limiting (20/hour)
- **Input Validation**: Validate all user inputs
- **SQL Injection**: Use parameterized queries

### UI Security

- **Same-Origin**: Plugin UIs run in same context as main app
- **XSS Prevention**: Use React's built-in escaping
- **CORS**: Standard CORS policies apply
- **CSP**: Content Security Policy allows script loading

### Best Practices

1. **Never hardcode secrets** in plugin code
2. **Validate all external inputs**
3. **Use HTTPS** for all external connections
4. **Sanitize data** before database operations
5. **Handle errors** without exposing internals
6. **Log security events** for auditing
7. **Regular security audits** of plugin code

---

## Performance Considerations

### Plugin Loading

- **Lazy Loading**: Plugins loaded on-demand, not at startup
- **Caching**: Plugin code cached in `temp/plugins/` with 5-day TTL
- **Bundle Size**: Keep UI bundles small by externalizing React/MUI

### Database

- **Connection Pooling**: Plugins share Sequelize connection pool
- **Indexed Queries**: Create indexes for frequently queried columns
- **Batch Operations**: Use bulk inserts for large data sets

### UI Performance

- **Code Splitting**: Each plugin is a separate bundle
- **Suspense**: PluginSlot uses React Suspense for loading states
- **Memoization**: Use React.memo for expensive components

### Monitoring

- **Metrics**: Track plugin install/uninstall rates
- **Errors**: Log and monitor plugin errors
- **Performance**: Track bundle load times

---

## Migration Guide

### Upgrading Plugin System

When upgrading the plugin system itself:

1. **Database Migrations**
   ```bash
   npx sequelize-cli db:migrate
   ```

2. **Clear Plugin Cache**
   ```bash
   rm -rf Servers/temp/plugins/*
   ```

3. **Update Frontend**
   - Check for breaking changes in PluginRegistry
   - Update PluginSlot usage if API changed

### Migrating Existing Plugins

When plugin interface changes:

1. **Update Plugin Code**
   - Add new required exports
   - Update method signatures
   - Handle new configuration fields

2. **Update plugins.json**
   - Add new required fields
   - Update version number

3. **Database Migration** (if schema changed)
   ```typescript
   // In plugin install(), add migration logic
   export async function install(userId, tenantId, config, context) {
     // Check if upgrading
     const existing = await getExistingInstallation(tenantId);
     if (existing) {
       // Run migration
       await migrateFromV1toV2(tenantId, context);
     } else {
       // Fresh install
       await createTables(tenantId, context);
     }
   }
   ```

### Version Compatibility

| Plugin System Version | Plugin Interface Version | Notes |
|----------------------|-------------------------|-------|
| 1.0.0 | 1.0.0 | Initial release |
| 1.1.0 | 1.0.0 | Added UI injection |
| 1.2.0 | 1.1.0 | Added configure() method |

---

## Monitoring and Observability

### Logging

Plugin operations are logged with `[PluginService]` prefix:

```typescript
// Installation
console.log(`[PluginService] Installing plugin: ${pluginKey}`);

// Errors
console.error(`[PluginService] Error installing plugin:`, error);

// UI Loading
console.log(`[PluginRegistry] Loading plugin UI for ${pluginKey}`);
```

### Metrics to Track

| Metric | Description |
|--------|-------------|
| `plugin_installs_total` | Total plugin installations |
| `plugin_uninstalls_total` | Total plugin uninstallations |
| `plugin_errors_total` | Plugin operation errors |
| `plugin_ui_load_time` | Time to load UI bundle |
| `plugin_api_response_time` | Plugin API response times |

### Health Checks

```typescript
// Check plugin system health
GET /api/plugins/health

// Response
{
  "status": "healthy",
  "marketplace": "connected",
  "cache": "valid",
  "installedPlugins": 3
}
```

---

## Plugin Marketplace Repository

For plugin development documentation, see the plugin-marketplace repository:

- **Repository**: `bluewave-labs/plugin-marketplace`
- **Documentation**:
  - `README.md` - Overview and quick start
  - `docs/PLUGIN_DEVELOPMENT_GUIDE.md` - Complete development guide
  - `docs/PLUGIN_UI_GUIDE.md` - UI development guide
  - `docs/ARCHITECTURE.md` - System architecture
  - `docs/API_REFERENCE.md` - API reference

### Quick Links

| Document | Description |
|----------|-------------|
| [Plugin Development Guide](https://github.com/bluewave-labs/plugin-marketplace/blob/main/docs/PLUGIN_DEVELOPMENT_GUIDE.md) | How to create plugins |
| [Plugin UI Guide](https://github.com/bluewave-labs/plugin-marketplace/blob/main/docs/PLUGIN_UI_GUIDE.md) | Building plugin UIs |
| [Architecture](https://github.com/bluewave-labs/plugin-marketplace/blob/main/docs/ARCHITECTURE.md) | System architecture |
| [API Reference](https://github.com/bluewave-labs/plugin-marketplace/blob/main/docs/API_REFERENCE.md) | Complete API docs |

---

## Event-Based Plugin Communication

Plugins can communicate with the main app using custom DOM events. This provides decoupled communication without direct imports.

### Why Use Events?

- **Decoupling**: Main app doesn't import plugin code
- **Optional Integration**: App works without plugin installed
- **Real-time Updates**: Plugins can notify app of changes

### Event Pattern

```typescript
// Plugin emits event
window.dispatchEvent(
  new CustomEvent("eventName", {
    detail: { /* payload */ }
  })
);

// App listens for event
useEffect(() => {
  const handler = (event: CustomEvent) => {
    // Handle event.detail
  };
  window.addEventListener("eventName", handler);
  return () => window.removeEventListener("eventName", handler);
}, []);
```

### Real Example: Custom Framework Plugin

The Custom Framework Import plugin uses events to communicate framework counts:

**Plugin Side (CustomFrameworkCards.tsx):**
```typescript
// Emit count when frameworks change
useEffect(() => {
  window.dispatchEvent(
    new CustomEvent("customFrameworkCountChanged", {
      detail: { projectId: project.id, count: addedFrameworkIds.size }
    })
  );
}, [addedFrameworkIds.size, project.id]);
```

**App Side (AddNewFramework/index.tsx):**
```typescript
const [customFrameworkCount, setCustomFrameworkCount] = useState(0);

useEffect(() => {
  const handleCustomFrameworkCount = (event: CustomEvent) => {
    if (event.detail?.projectId === project.id) {
      setCustomFrameworkCount(event.detail.count || 0);
    }
  };

  window.addEventListener(
    "customFrameworkCountChanged",
    handleCustomFrameworkCount as EventListener
  );

  return () => {
    window.removeEventListener(
      "customFrameworkCountChanged",
      handleCustomFrameworkCount as EventListener
    );
  };
}, [project.id]);

// Use customFrameworkCount in logic
const totalFrameworkCount = (project.framework?.length || 0) + customFrameworkCount;
```

### Event Naming Convention

Use descriptive names with camelCase:
- `customFrameworkCountChanged` - Count updated
- `customFrameworkChanged` - Framework added/removed
- `pluginDataRefresh` - Request data reload

### Best Practices

1. **Include identifiers**: Always include `projectId` or other identifiers in payload
2. **Validate payload**: Check `event.detail?.projectId === project.id`
3. **Clean up listeners**: Always remove listeners in useEffect cleanup
4. **Type safety**: Cast handler as `EventListener` for TypeScript

---

## Framework Plugin Types

Framework plugins can be either **Organizational** or **Project** level, determined by the `frameworkType` field in plugins.json and `is_organizational` in template.json.

### Organizational Frameworks (🏢)

**Scope**: Apply to the entire organization

**Behavior**:
- Managed at org level with a single org-level project
- All organizational frameworks enabled in this project
- Compliance tracked at organization level

**Examples**: GDPR, SOC 2, ISO 27001, CCPA, DORA, NIST CSF, CIS Controls, Data Governance, UAE/Saudi/Qatar/Bahrain PDPL

**Configuration**:
```json
// plugins.json
{
  "key": "gdpr",
  "frameworkType": "organizational"
}

// template.json
{
  "framework": {
    "is_organizational": true
  }
}
```

### Project Frameworks (📁)

**Scope**: Apply only to specific projects

**Behavior**:
- Can be enabled per individual project
- Different projects may have different frameworks
- Compliance tracked at project level

**Examples**: PCI-DSS (payment projects), HIPAA (healthcare projects), AI Ethics (AI/ML projects)

**Configuration**:
```json
// plugins.json
{
  "key": "pci-dss",
  "frameworkType": "project"
}

// template.json
{
  "framework": {
    "is_organizational": false
  }
}
```

### UI Display

The framework type is displayed as a badge on plugin cards in **Plugins > Frameworks**:
- 🏢 **Organizational** - Purple badge
- 📁 **Project** - Orange badge

**Frontend Type Definition** (`Clients/src/domain/types/plugins.ts`):
```typescript
export type FrameworkType = "organizational" | "project";

export interface Plugin {
  // ... other fields
  frameworkType?: FrameworkType;
}
```

---

## Safe Database Queries for Plugin Tables

When the main app needs to query plugin-created tables, use safe queries that handle missing tables:

### Problem

If a plugin is not installed, its tables don't exist. Querying them causes errors.

### Solution

Check if the table exists before querying:

```typescript
// Servers/utils/framework.utils.ts
const [[{ can_remove }]] = await sequelize.query(
  `SELECT (
    (SELECT COUNT(*) FROM projects_frameworks
     WHERE project_id = :projectId AND organization_id = :organizationId) +
    CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'verifywise'
        AND table_name = 'custom_framework_projects'
      )
      THEN (SELECT COUNT(*) FROM custom_framework_projects
            WHERE project_id = :projectId AND organization_id = :organizationId)
      ELSE 0
    END
  ) > 1 AS can_remove;`,
  { replacements: { projectId, organizationId }, transaction }
);
```

### Key Points

- Use `information_schema.tables` to check table existence
- Use `CASE WHEN EXISTS ... THEN ... ELSE 0 END` pattern
- Return sensible defaults (0, null, false) when table doesn't exist
- This keeps the app working whether plugin is installed or not

---

## File Linking for Plugins

Use the `file_entity_links` table for proper file associations in plugins:

```typescript
// Link file to plugin entity
await sequelize.query(`
  INSERT INTO "${tenantId}".file_entity_links
  (file_id, framework_type, entity_type, entity_id, project_id, created_by)
  VALUES (:fileId, :pluginKey, 'level2', :entityId, :projectId, :userId)
`, { replacements: { fileId, pluginKey, entityId, projectId, userId } });

// Get files for plugin entity
const files = await sequelize.query(`
  SELECT f.* FROM "${tenantId}".files f
  INNER JOIN "${tenantId}".file_entity_links fel ON f.id = fel.file_id
  WHERE fel.framework_type = :pluginKey
    AND fel.entity_type = :entityType
    AND fel.entity_id = :entityId
`, { replacements: { pluginKey, entityType, entityId } });
```

---

## Related Documentation

- [Architecture Overview](../architecture/overview.md)
- [Multi-tenancy](../architecture/multi-tenancy.md)
- [External Integrations](./integrations.md)
- [Automations](./automations.md)
- [API Endpoints](../api/endpoints.md)
