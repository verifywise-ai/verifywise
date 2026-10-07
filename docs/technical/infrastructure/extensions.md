# Extensions

> Replaces the former plugin system (removed in August 2026). For compliance
> frameworks, see [Compliance Frameworks](../domains/compliance-frameworks.md)
> and [Adding a New Compliance Framework](../guides/adding-new-framework.md).
> Frameworks are not extensions.

## Overview

Extensions are optional integrations that ship inside the VerifyWise codebase.
An Admin turns one on or off for their organization. Nothing is downloaded,
installed or built at runtime. There is no marketplace, no separate repository,
no `template.json` and no install/uninstall step.

Each extension has:

- a **catalog row** in `verifywise.extensions`, seeded by a migration
- an optional **declarative config form** in `verifywise.extension_config_fields`
- a **per-organization state row** in `verifywise.extension_enablements`
- **server code** in `Servers/extensions/<key>/`, mounted at
  `/api/extensions/<key>` behind the `requireExtensionEnabled("<key>")` gate
- **client code** in `Clients/src/presentation/pages/Extensions/<key>/`, shown
  only when `useExtensions().isEnabled("<key>")` is true

```
Browser ──► ExtensionsProvider (GET /api/extensions, once per session)
              │  isEnabled(key) gates tabs, buttons, menu items
              ▼
        /api/extensions            catalog router (list, detail, enable, disable,
                                   configuration, test-connection)
        /api/extensions/<key>/...  per-extension routers
              │  authenticateJWT → requireExtensionEnabled(key)
              ▼
        ExtensionService.getRuntimeConfiguration(key, orgId)  → decrypted config
```

---

## Data model

All three catalog tables are created by
`Servers/database/migrations/20260811102307-extensions-migration.js`.

### `extensions` (catalog, one row per extension)

| Column | Notes |
|--------|-------|
| `key` | Unique. `CHECK (key ~ '^[a-z0-9][a-z0-9-]{0,63}$')` |
| `name`, `display_name`, `description`, `long_description` | Catalog text |
| `version`, `author` | Shown on the card as "`<Category> · v<version>`" |
| `category` | `CHECK` limited to `communication`, `ml_ops`, `data_management`, `version_control`, `monitoring`, `security`, `analytics`. A new category is a schema change. |
| `icon_path` | Path under `Clients/public/assets/extensions/` (set by `20260818124348-extension-icon-paths.js`) |
| `documentation_url`, `support_url` | Optional links |
| `requires_configuration` | Drives the "Configuration required" label and the **Test connection** button |
| `features` (JSONB array), `tags` (TEXT[]) | Catalog metadata |

The catalog is not tenant-scoped. It is the same for every organization.

### `extension_config_fields` (declarative config form)

One row per field. The client renders these with
`Clients/src/presentation/components/ExtensionConfigForm` on the settings page.

| Column | Notes |
|--------|-------|
| `extension_id` | FK → `extensions.id` (CASCADE) |
| `field_key` | `CHECK (field_key ~ '^[a-z_][a-z0-9_]{0,99}$')`, unique per extension |
| `field_type` | `text`, `textarea`, `url`, `email`, `password`, `number`, `boolean`, `select`, `multiselect` |
| `label`, `help_text`, `placeholder`, `display_order` | Presentation |
| `is_required` | Enforced on enable and on configuration update |
| `is_secret` | Value is encrypted at rest and never returned by the API |
| `default_value` | Stored as text |
| `options` (JSONB array) | `[{ label, value }]` for `select` / `multiselect` |
| `validation` (JSONB object) | `minLength`, `maxLength`, `pattern`, `min`, `max` |

Only **MLflow** and **Azure AI Foundry** have config fields today. Slack and
Jira Assets fields were removed by
`20260819105546-remove-dead-extension-config-fields.js` because nothing read
them. Those extensions are configured after enabling, through their own panels.

### `extension_enablements` (per organization)

| Column | Notes |
|--------|-------|
| `organization_id` | FK → `organizations.id` (CASCADE). Unique with `extension_id`. |
| `extension_id` | FK → `extensions.id` (CASCADE) |
| `enabled` | Boolean |
| `configuration` | JSONB object. `is_secret` values are ciphertext. |
| `enabled_at` | `CHECK (NOT enabled OR enabled_at IS NOT NULL)` |
| `enabled_by` | FK → `users.id` (SET NULL) |

A row exists once an organization has enabled the extension at least once.
Disabling does not delete it.

### Extension-owned data tables

These tables exist in every database, whether or not any organization has
enabled the extension. All are tenant-scoped by `organization_id`.

| Extension | Tables |
|-----------|--------|
| slack | `slack_webhooks` (predates extensions) |
| mlflow | `mlflow_model_records` (synced runs; `mlflow_integrations` also predates extensions) |
| azure-ai-foundry | `azure_ai_model_records` |
| model-lifecycle | `model_lifecycle_phases`, `_items`, `_values`, `_item_files`, `_item_people`, `_item_approvals`, `_change_history` |
| jira-assets | `jira_assets_config`, `jira_assets_use_cases`, `jira_assets_sync_history`, sequence `jira_use_case_uc_id_seq` |
| risk-import, dataset-bulk-upload | None. They write to the core `risks` and `datasets` / `files` tables. |

---

## Server

### Catalog service

`Servers/services/extension/extensionService.ts`, class `ExtensionService`:

| Method | Purpose |
|--------|---------|
| `listAll(orgId, category?)` | Catalog + config fields + this org's state, secrets stripped |
| `getByKey(key, orgId)` | Same, for one extension |
| `enable(key, orgId, userId, configuration)` | Merge with stored config, encrypt secrets, validate, upsert `enabled = true` |
| `disable(key, orgId)` | Set `enabled = false`. 404 if the org never enabled it. |
| `updateConfiguration(key, orgId, configuration)` | Merge, encrypt, validate, save. 404 if the org never enabled it. |
| `getRuntimeConfiguration(key, orgId)` | Full config with secrets **decrypted**, for server-side use only. Returns `{}` if there is no enablement row. |

Each read response (`assemble`) contains the catalog fields, `configFields`,
`enabled`, the redacted `configuration` and the raw `enablement` row.

### Secrets and validation

- On write, `mergeAndEncrypt` keeps only known `field_key`s. Secret values are
  encrypted with `encrypt()` from `Servers/utils/encryption.utils.ts`
  (AES-256-GCM, key from `ENCRYPTION_KEY`; legacy AES-256-CBC values still
  decrypt).
- If a secret field is missing or blank in the payload, the stored ciphertext
  carries over. This is how the UI's "Leave blank to keep the existing value"
  works. Non-secret fields that are missing from the payload are dropped,
  because the caller sends the full non-secret shape each time.
- `validate` enforces `is_required` (a required secret passes if a previous
  value exists), type checks per `field_type`, `options` membership and the
  `validation` rules. It rejects unknown keys.
- On read, `redactSecrets` removes secret keys entirely. Masked values are not
  returned either.
- Per-extension code must read config through `getRuntimeConfiguration`. Never
  return that result to the client.

Jira Assets is the exception. It keeps its connection settings, including its
own encrypted `api_token` (via `Servers/tools/createSecureValue`), in the
`jira_assets_config` table. Its `extension_enablements.configuration` is empty.

### Catalog routes

`Servers/routes/extension.route.ts`, mounted at `/api/extensions`. Controllers
are in `Servers/controllers/extension.ctrl.ts`.

| Method | Path | Roles | Body |
|--------|------|-------|------|
| GET | `/api/extensions` | Any authenticated user | `?category=` optional |
| GET | `/api/extensions/:key` | Any authenticated user | |
| POST | `/api/extensions/:key/enable` | Admin | `{ configuration?: {...} }` |
| POST | `/api/extensions/:key/disable` | Admin | |
| PATCH | `/api/extensions/:key/configuration` | Admin | `{ configuration: {...} }` |
| POST | `/api/extensions/:key/test-connection` | Admin | `{ configuration?: {...} }` |

Keys are checked against `EXTENSION_KEY_PATTERN`, so a malformed key gets a 400.
An unknown key gets a 404 ("Extension not found"). A `ValidationException` gets
a 400.

**Mount order matters.** In `Servers/app.ts` the catalog router is registered
before the seven per-extension routers. Otherwise a per-extension mount such as
`/api/extensions/slack` would catch `GET /api/extensions/slack` and return 403
through the gate. Per-extension sub-paths are all multi-segment (`/models`,
`/oauth/workspaces`, ...), so they never collide with `/:key`.

### Gate middleware

`Servers/middleware/requireExtensionEnabled.middleware.ts`

```ts
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";

router.use(authenticateJWT);
router.use(requireExtensionEnabled("mlflow"));
```

| Condition | Response |
|-----------|----------|
| No `req.organizationId` | 401 "User not authenticated" |
| Key not in the catalog | 404 "Extension '`<key>`' not found in catalog" |
| No enablement row, or `enabled = false` | 403 "Extension '`<key>`' is not enabled for this organization" |
| Lookup error | 500 |

The key → id lookup is cached in process. The catalog only changes through
migrations.

### Test connection

`TEST_CONNECTION_DISPATCH` in `Servers/controllers/extension.ctrl.ts` maps a key
to a runner that returns `{ success, message, testedAt }`:

| Key | Runner |
|-----|--------|
| `mlflow` | Stored runtime config overlaid with the submitted config → `testConnection` in `extensions/mlflow/mlflow.service.ts` |
| `azure-ai-foundry` | Same pattern → `testConnection` in `extensions/azure-ai-foundry/azureAiFoundry.service.ts` |
| `jira-assets` | Submitted config. If no `api_token` is submitted, the stored token comes from `jira_assets_config`. Then `clientFromConfig(...).testConnection()`. |

Any other key returns **200** with `success: false` and "Test connection is not
available for '`<key>`'." It never 404s. Jira Assets has no route of its own for
this. A `/test-connection` route under `/api/extensions/jira-assets` would be
shadowed by the catalog router.

---

## Client

| Piece | Path |
|-------|------|
| Context | `Clients/src/application/contexts/Extensions.context.tsx`: `ExtensionsProvider` (mounted in `App.tsx`) and `useExtensions()` → `{ extensions, loading, error, refetch, enable, disable, updateConfiguration, isEnabled(key), getByKey(key) }` |
| Repository | `Clients/src/application/repository/extension.repository.ts`: `listExtensions`, `getExtensionByKey`, `enableExtension`, `disableExtension`, `updateExtensionConfiguration`, `testExtensionConnection` |
| Types | `Clients/src/domain/types/extensions.ts` |
| Catalog page | `Clients/src/presentation/pages/Extensions/index.tsx`, route `/extensions` |
| Settings page | `Clients/src/presentation/pages/Extensions/Settings/index.tsx`, route `/extensions/:key/settings` |
| Generic config form | `Clients/src/presentation/components/ExtensionConfigForm` |
| Per-extension UI | `Clients/src/presentation/pages/Extensions/<key>/` |
| Header entry point | `Clients/src/presentation/components/Layout/DashboardActionButtons.tsx` (disabled for non-Admins) |
| Icons | `Clients/public/assets/extensions/<key>.svg` (Azure uses `.jpg`) |

The provider fetches `/api/extensions` once the user has a token and an
organization, and clears it on logout. Mutations update the local cache, so
gated UI re-renders straight away.

Both pages redirect non-Admins to `/` (`userRoleName !== "Admin"`). The old
`/plugins` route has no redirect.

**Catalog card buttons** (`Extensions/index.tsx`): **Enable** when there are no
pre-enable fields; **Configure to enable** when there are; **Configure** when
enabled and the extension has a settings surface; **Disable** when enabled. A
settings surface is either config fields or membership in
`KEYS_WITH_POST_ENABLE_UI` (`slack`, `model-lifecycle`, `jira-assets`).

**Settings page** (`Extensions/Settings/index.tsx`): a **Configuration** card
when `configFields.length > 0`. Then the extension's own panel for `slack`
(`SlackConfiguration`), `model-lifecycle` (`ModelLifecycleConfig`) or
`jira-assets` (`JiraAssetsConfiguration`). Then the **Enable**/**Disable**,
**Save configuration** and **Test connection** actions. **Test connection**
appears for any enabled extension with `requires_configuration = true`. For
Slack and Model Lifecycle it therefore shows the "not available" message.

---

## The seven extensions

| Key | Category | Config fields | Server dir | Client dir | Where it surfaces |
|-----|----------|---------------|------------|------------|-------------------|
| `slack` | communication | none (post-enable panel) | `Servers/extensions/slack/` (reuses `controllers/slackWebhook.ctrl.ts`) | `Extensions/slack/` | Settings page panel: **Add to Slack** OAuth, workspace table, notification routing |
| `mlflow` | ml_ops | `tracking_server_url` (url, required), `auth_method` (select none/basic/token, default none), `username`, `password` (secret), `api_token` (secret), `timeout` (number 1–600, default 30; per-request) | `Servers/extensions/mlflow/` | `Extensions/mlflow/` (`MLFlowTab`) | Model inventory **MLFlow** tab with manual **Sync** |
| `azure-ai-foundry` | ml_ops | `project_endpoint` (url, required), `api_key` (secret, required), `subscription_id`, `resource_group`, `resource_name` (optional) | `Servers/extensions/azure-ai-foundry/` | `Extensions/azure-ai-foundry/` (`AzureAIFoundryTab`) | Model inventory **Azure AI Foundry** tab with **Sync**; Agent discovery (`AgentTable`) |
| `model-lifecycle` | ml_ops | none (post-enable panel) | `Servers/extensions/model-lifecycle/` | `Extensions/model-lifecycle/` | **View lifecycle** in Model inventory rows; model lifecycle detail page |
| `risk-import` | data_management | none | `Servers/extensions/risk-import/` | `Extensions/risk-import/` | Risk management → **Import from Excel** |
| `jira-assets` | data_management | none (post-enable panel, stored in `jira_assets_config`) | `Servers/extensions/jira-assets/` | `Extensions/jira-assets/` | Imported use cases; Jira use-case views in `ProjectView/V1.0ProjectView` |
| `dataset-bulk-upload` | data_management | none | `Servers/extensions/dataset-bulk-upload/` | `Extensions/dataset-bulk-upload/` | Datasets → **Bulk upload** |

Client dirs are relative to `Clients/src/presentation/pages/`.

### Per-extension routes

Every router begins with `authenticateJWT` and then
`requireExtensionEnabled("<key>")`. Role checks beyond that are listed. Where
none is listed, any authenticated user in an organization with the extension
enabled can call the route.

| Base path | Routes | Extra roles |
|-----------|--------|-------------|
| `/api/extensions/slack` | `GET/POST /oauth/workspaces`, `GET/PATCH/DELETE /oauth/workspaces/:id`, `POST /oauth/workspaces/:id/send` | `POST /oauth/workspaces` rate-limited (`slackWorkspaceCreateLimiter`, 10/hour) |
| `/api/extensions/mlflow` | `GET /models`, `GET /models/:modelId`, `POST /sync` | |
| `/api/extensions/azure-ai-foundry` | `GET /models`, `GET /models/:deploymentId`, `POST /sync`, `GET /discover` | |
| `/api/extensions/model-lifecycle` | `GET /config`; phases CRUD and reorder; items CRUD and reorder; `GET /models/:id/lifecycle`, `/progress`; item values, files, people and approvals under `/models/:id/lifecycle/items/:itemId/...` | |
| `/api/extensions/risk-import` | `GET /template`, `POST /import` | Admin, Editor |
| `/api/extensions/jira-assets` | `GET/POST /config`, `GET /vw-attributes`, schema and object-type discovery, `POST /import`, `POST /sync`, `GET /sync/status`, `GET /sync/history`, `GET/DELETE /use-cases/:id`, `GET /use-cases`, `GET /projects/:projectId/custom-frameworks-progress` | |
| `/api/extensions/dataset-bulk-upload` | `POST /upload` (multipart, one file per request, 30 MB, CSV/XLS/XLSX; 413/415 on error) | Admin, Editor |

The full list is in `Servers/swagger.yaml` under `/extensions/...`.

### Environment variables

Only Slack needs deployment-level settings: `SLACK_CLIENT_ID`,
`SLACK_CLIENT_SECRET` and `SLACK_API_URL` on the server, and
`VITE_SLACK_CLIENT_ID` and `VITE_SLACK_URL` on the client. The other
extensions are configured per organization in the UI.

---

## Enable and disable semantics

- **Enable** upserts the enablement row with `enabled = true`, `enabled_at`
  and `enabled_by`. Any submitted `configuration` is merged into the stored
  config and validated. Re-enabling keeps earlier config values.
- **Disable** sets `enabled = false`. Configuration, secrets and all
  extension-owned data (synced models, lifecycle phases, Jira use cases, Slack
  webhooks) are **kept**. Re-enabling restores access to them. The UI shows no
  confirmation dialog.
- **There is no uninstall** and no way to purge an extension's data from the
  UI or API.
- While disabled, the gate returns 403 on every `/api/extensions/<key>/...`
  route and the client hides the extension's entry points.
- Sync is manual only. No scheduler runs MLflow, Azure AI Foundry or Jira
  Assets sync. The Jira panel offers "Enable automatic sync" and "Sync
  Interval", but nothing reads those settings.

---

## Adding a new extension

Base it on `mlflow` if the extension has config fields and a connection test,
or on `risk-import` if it needs neither.

1. **Migration.** Create it with a `date`-generated timestamp (see
   `Servers/CLAUDE.md`). It should:
   - insert the `extensions` row. The key must match
     `^[a-z0-9][a-z0-9-]{0,63}$` and the category must be one of the allowed
     values.
   - insert `extension_config_fields` rows, if any. Set `is_secret: true` on
     credentials.
   - create any data tables with `organization_id` and FKs.

   Copy the insert logic in `20260811102307-extensions-migration.js`
   (`EXTENSIONS_SEED`, `CONFIG_FIELDS_BY_KEY`, and the `toPgTextArray` helper for
   `tags`).
2. **Icon.** Add it to `Clients/public/assets/extensions/` and set `icon_path`
   in the migration.
3. **Server code** in `Servers/extensions/<key>/`:
   - `<name>.route.ts` with `router.use(authenticateJWT)` and
     `router.use(requireExtensionEnabled("<key>"))`, plus `authorize([...])`
     where roles matter
   - `<name>.ctrl.ts` and `<name>.service.ts`. Read config with
     `ExtensionService.getRuntimeConfiguration("<key>", organizationId)`. All
     queries filter on `organization_id`.
4. **Mount** the router in `Servers/app.ts` at `/api/extensions/<key>`, after
   the `/api/extensions` catalog router. Use multi-segment sub-paths only.
5. **Connection test (optional).** Add a `TEST_CONNECTION_DISPATCH` entry in
   `Servers/controllers/extension.ctrl.ts`.
6. **Client UI** in `Clients/src/presentation/pages/Extensions/<key>/`:
   - Gate every entry point (tab, button, menu item) with
     `useExtensions().isEnabled("<key>")`.
   - If the extension has a post-enable settings panel, add its key to
     `KEYS_WITH_POST_ENABLE_UI` in `Extensions/index.tsx` and render the panel
     in `Extensions/Settings/index.tsx` next to the Slack, Model Lifecycle and
     Jira panels.
   - Pre-enable config fields need no client code. `ExtensionConfigForm`
     renders them.
7. **Tenant tables.** Register new tables in `Servers/scripts/migrationConfig.ts`
   and in the tenant-isolation audit (`Servers/scripts/auditTenantIsolationCoverage.ts`).
   CI fails for org-scoped tables it doesn't know about.
8. **API docs.** In `Servers/`, run `npm run generate:swagger`. It reads
   `app.ts` and the route files under `routes/` and `extensions/`, and merges
   the new endpoints into `swagger.yaml`. Add descriptions to those entries,
   then run `npm run generate:endpoints` to refresh
   `docs/api-docs/src/config/endpoints.ts`.
9. **User guide.** Add an article under `shared/user-guide-content/`.

---

## Migration from the plugin system (Aug 2026)

The old system loaded plugins at runtime from a separate plugin repository. It
had a marketplace, install/uninstall, `template.json` UI bundles and
`Servers/temp/plugins`. Two PRs replaced it:

- **Frameworks became core (PR #4443).** The 21 framework plugins (SOC 2, GDPR,
  HIPAA, ...) are declared in `Servers/structures/` and get real per-framework
  tables (framework ids 5–25). This was done by migrations
  `20260805125946-create-framework-struct-tables.js` and
  `20260805130326-create-framework-impl-tables.js`.
  `20260805131033-migrate-framework-data.js` copied implementation rows, risk
  links and evidence links from the legacy `custom_framework_*` tables.
  `20260807142621-fix-legacy-file-entity-links.js` repaired the old
  `file_entity_links`. The legacy tables were **not** dropped.
- **Integration plugins became extensions (PR #4512).**
  `20260811102307-extensions-migration.js` created the three catalog tables
  and seeded the seven extensions. It copied each `plugin_installations` row
  into `extension_enablements`, joined on `plugin_key = extensions.key`
  (`status = 'installed'` → `enabled = true`, configuration copied as-is).
  Then it **dropped** `plugin_installations`. Rows with unknown keys were
  logged and skipped. The same migration creates the Azure, Model Lifecycle
  and Jira data tables that the plugins used to create in their install hooks.

Removed: `/api/plugins/*` (marketplace, install, installations, UI bundle
serving), `plugin.route.ts`, `pluginGuard.middleware.ts` / `requirePlugin`,
`PluginSlot` and the `/plugins` page, `Servers/temp/plugins`, the
`build:framework-plugins` step, and the external plugin repository dependency.

## Known leftovers

These exist in the code today. They are recorded here so they are not mistaken
for live features.

- `Servers/database/seeds/plugins/manifests.json` is unused.
- `Clients/e2e/plugins.spec.ts` is skipped (`test.describe.skip`).
- `Servers/docs/api/files-plugins-shadow-pmm-openapi.yaml` keeps its old file
  name but now documents the `/extensions` catalog paths.
- The legacy `/api/slackWebhooks` router is still mounted in `Servers/app.ts`
  and is **not** behind the extension gate. It shares handlers with
  `/api/extensions/slack/oauth/workspaces`.
- Slack notification delivery (`Servers/services/slack/`) reads
  `slack_webhooks` directly and does not check whether the extension is
  enabled.
- The legacy `custom_framework_*` tables remain.
  `GET /api/extensions/jira-assets/projects/:projectId/custom-frameworks-progress`
  (`jiraAssets.service.ts`) still reads them.
- No scheduler exists for Jira Assets, MLflow or Azure AI Foundry sync.
- The Frameworks page **Settings** tab
  (`Clients/src/presentation/pages/Framework/Settings`) only lists ISO 27001,
  ISO 42001 and NIST AI RMF. The bundled organizational frameworks are added
  through **Manage frameworks → Add/remove frameworks**.

## Related documentation

- [Compliance Frameworks](../domains/compliance-frameworks.md)
- [Adding a New Compliance Framework](../guides/adding-new-framework.md)
- [External Integrations](./integrations.md)
- [API Endpoints](../api/endpoints.md)
- [Middleware](../../claude/middleware.md)
