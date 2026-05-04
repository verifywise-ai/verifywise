# VerifyWise Plugin System

A comprehensive plugin architecture for extending VerifyWise functionality with third-party integrations.

## Architecture Overview

The plugin system consists of several layers:

### 1. **Database Layer** (`/utils/pluginInstallation.utils.ts`)

- Raw SQL queries for plugin installation records
- Tenant-scoped data using `plugin_installations` table
- Tracks installation status, configuration, and metadata

### 2. **Service Layer** (`/services/plugin/pluginService.ts`)

- Business logic for plugin management
- Loads and executes plugin code dynamically
- Handles plugin lifecycle (install, uninstall, configure)
- Fetches plugins from marketplace

### 3. **Controller Layer** (`/controllers/plugin.ctrl.ts`)

- HTTP request handlers
- Authentication and authorization
- Request validation and error handling

### 4. **Routes** (`/routes/plugin.route.ts`)

- REST API endpoints for plugin operations
- Rate limiting for installation endpoints
- JWT authentication middleware

### 5. **Plugin Marketplace** (`/plugin-marketplace/`)

- Plugin registry (`plugins.json`)
- Plugin source code (`plugins/<plugin-key>/index.ts`)
- Plugin metadata and dependencies

## Database Schema

```sql
CREATE TABLE plugin_installations (
  id SERIAL PRIMARY KEY,
  plugin_key VARCHAR(255) NOT NULL,
  user_id INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL,
  installed_at TIMESTAMP,
  uninstalled_at TIMESTAMP,
  error_message TEXT,
  configuration JSONB,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## API Endpoints

### Marketplace Endpoints

- `GET /api/plugins/marketplace` - Get all available plugins
- `GET /api/plugins/marketplace/:key` - Get plugin by key
- `GET /api/plugins/marketplace/search?q=query` - Search plugins
- `GET /api/plugins/categories` - Get plugin categories

### Installation Management

- `POST /api/plugins/install` - Install a plugin
- `DELETE /api/plugins/installations/:id` - Uninstall a plugin
- `GET /api/plugins/installations` - Get installed plugins
- `PUT /api/plugins/installations/:id/configuration` - Update plugin configuration

## Plugin Structure

Each plugin must export the following methods:

### Required Methods

#### `install(userId: number, organizationId: number, config: any): Promise<InstallResult>`

Called when a user installs the plugin.

**Example:**

```typescript
export async function install(
  userId: number,
  organizationId: number,
  config: any,
): Promise<InstallResult> {
  // Initialize plugin state
  // Create database records
  // Register webhooks

  return {
    success: true,
    message: "Plugin installed successfully",
    installedAt: new Date().toISOString(),
  };
}
```

#### `uninstall(userId: number, organizationId: number): Promise<UninstallResult>`

Called when a user uninstalls the plugin.

**Example:**

```typescript
export async function uninstall(userId: number, organizationId: number): Promise<UninstallResult> {
  // Clean up plugin state
  // Remove database records
  // Unregister webhooks

  return {
    success: true,
    message: "Plugin uninstalled successfully",
    uninstalledAt: new Date().toISOString(),
  };
}
```

#### `configure(userId: number, organizationId: number, config: any): Promise<ConfigureResult>`

Called when a user updates plugin configuration.

**Example:**

```typescript
export async function configure(
  userId: number,
  organizationId: number,
  config: any,
): Promise<ConfigureResult> {
  // Validate configuration
  // Update plugin settings
  // Test connections

  return {
    success: true,
    message: "Plugin configured successfully",
    configuredAt: new Date().toISOString(),
  };
}
```

### Plugin Metadata

```typescript
export const metadata = {
  name: "My Plugin",
  version: "1.0.0",
  author: "VerifyWise",
  description: "Plugin description",
};
```

## Creating a New Plugin

### 1. Create Plugin Directory

```bash
mkdir -p plugin-marketplace/plugins/my-plugin
cd plugin-marketplace/plugins/my-plugin
```

### 2. Create Plugin Entry Point (`index.ts`)

```typescript
// Type definitions
interface PluginConfig {
  apiKey?: string;
  endpoint?: string;
}

// Install method
export async function install(userId: number, organizationId: number, config: PluginConfig) {
  // Implementation
  return {
    success: true,
    message: "Plugin installed",
    installedAt: new Date().toISOString(),
  };
}

// Uninstall method
export async function uninstall(userId: number, organizationId: number) {
  // Implementation
  return {
    success: true,
    message: "Plugin uninstalled",
    uninstalledAt: new Date().toISOString(),
  };
}

// Configure method
export async function configure(userId: number, organizationId: number, config: PluginConfig) {
  // Implementation
  return {
    success: true,
    message: "Plugin configured",
    configuredAt: new Date().toISOString(),
  };
}

// Metadata
export const metadata = {
  name: "My Plugin",
  version: "1.0.0",
  author: "Your Name",
  description: "My awesome plugin",
};
```

### 3. Register Plugin in Marketplace (`plugins.json`)

```json
{
  "key": "my-plugin",
  "name": "MyPlugin",
  "displayName": "My Plugin",
  "description": "Short description",
  "longDescription": "Detailed description",
  "version": "1.0.0",
  "author": "Your Name",
  "category": "communication",
  "iconUrl": "/assets/my-plugin-logo.svg",
  "documentationUrl": "https://docs.example.com",
  "supportUrl": "https://support.example.com",
  "isOfficial": false,
  "isPublished": true,
  "requiresConfiguration": true,
  "installationType": "standard",
  "features": [
    {
      "name": "Feature 1",
      "description": "Feature description",
      "displayOrder": 1
    }
  ],
  "tags": ["tag1", "tag2"],
  "pluginPath": "plugins/my-plugin",
  "entryPoint": "index.ts",
  "dependencies": {
    "axios": "^1.6.0"
  }
}
```

## Plugin Lifecycle

```
┌─────────────────┐
│  User installs  │
│     plugin      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Create DB     │
│    record       │
│  status: "      │
│  installing"    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Load plugin     │
│     code        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│Execute install()│
│     method      │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│Success │ │ Failure│
└───┬────┘ └───┬────┘
    │          │
    ▼          ▼
┌────────┐ ┌────────┐
│status: │ │status: │
│"install│ │ "failed│
│ed"     │ │"       │
└────────┘ └────────┘
```

## Configuration Flow

1. User navigates to plugin management page
2. User fills configuration form (webhook URL, API key, etc.)
3. Frontend calls `PUT /api/plugins/installations/:id/configuration`
4. Backend validates configuration
5. Backend calls plugin's `configure()` method
6. Plugin tests connection and applies settings
7. Configuration saved to database
8. User receives confirmation

## Error Handling

All plugin methods should handle errors gracefully:

```typescript
export async function install(userId: number, organizationId: number, config: any) {
  try {
    // Plugin logic
    return {
      success: true,
      message: "Installation successful",
      installedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error("[Plugin] Installation failed:", error);
    throw new Error(`Installation failed: ${error.message}`);
  }
}
```

## TypeScript Support

Plugins are written in TypeScript and loaded using `ts-node/register`. The service automatically detects `.ts` entry points and enables TypeScript support.

### Development

In development, plugins are loaded directly from the `plugin-marketplace` directory.

### Production

In production, plugins would be:

1. Compiled to JavaScript
2. Downloaded from a Git repository
3. Cached locally

## Security Considerations

1. **Plugin Validation**: All plugins must be validated before installation
2. **Sandboxing**: Consider running plugins in isolated environments
3. **Rate Limiting**: Installation endpoints are rate-limited
4. **Authentication**: All endpoints require JWT authentication
5. **Authorization**: Users can only manage their own plugin installations
6. **Configuration Encryption**: Sensitive configuration (API keys, passwords) should be encrypted
7. **Code Review**: All official plugins should be reviewed before publishing

## Testing Plugins

```typescript
// Example test
import { install, uninstall, configure } from "./index";

describe("My Plugin", () => {
  it("should install successfully", async () => {
    const result = await install(1, 1, { apiKey: "test" });
    expect(result.success).toBe(true);
  });

  it("should validate configuration", async () => {
    const result = await configure(1, 1, { apiKey: "invalid" });
    // Assert behavior
  });
});
```

## Best Practices

1. **Validate Input**: Always validate user configuration
2. **Handle Errors**: Catch and log all errors
3. **Test Connections**: Test external connections during configuration
4. **Clean Up**: Properly clean up resources during uninstall
5. **Document**: Provide clear documentation for configuration options
6. **Version**: Follow semantic versioning
7. **Backwards Compatibility**: Maintain compatibility across versions
8. **Logging**: Use structured logging for debugging
9. **Idempotency**: Make install/uninstall operations idempotent
10. **Security**: Never log sensitive information (API keys, passwords)

## Example Plugins

See the following examples:

- **MLflow** (`plugins/mlflow/index.ts`) - ML model tracking integration
- **Slack** (`plugins/slack/index.ts`) - Team notification integration

## Troubleshooting

### Plugin fails to load

- Check that `ts-node` is installed: `npm install -D ts-node`
- Verify plugin path in `plugins.json`
- Check for syntax errors in plugin code

### Installation fails

- Check database connection
- Verify tenant hash is correct
- Check plugin permissions

### Configuration not saving

- Verify configuration schema
- Check API endpoint permissions
- Review server logs for errors
