# VerifyWise Backend Feature Inventory

This document is a comprehensive catalog of the VerifyWise Node.js/Express/TypeScript backend located in `Servers/`. It covers architecture, every mounted API route module, per-domain feature summaries, the database model index, auth/authorization patterns, extensions, and test commands.

---

## 1. Architecture & Entry Points

### 1.1 `index.ts` (application bootstrap)

- Loads environment via `dotenv/config`.
- Imports `createApp()` from `app.ts`.
- Initializes OpenTelemetry observability, BullMQ background jobs, the real-time notification subscriber, and shared-schema data migration checks.
- Starts the approval timeout handler, bootstraps the multi-agent advisor network, registers workflow definitions, and starts AI-detection progress cleanup.
- Listens on `PORT` (default `3000`).
- Graceful shutdown closes the HTTP server, notification subscriber, Redis, Sequelize, and observability exporters.

### 1.2 `app.ts` (`createApp`)

`createApp` builds the Express application and mounts all middleware and routes. Key responsibilities:

- **Trust proxy** (`trust proxy: 1`) for reverse-proxy handling.
- **CORS** with origin whitelist (`HOST`, `localhost`, `127.0.0.1`, `::1`) and credentials enabled.
- **Helmet** security headers.
- **Body parsing** via `express.json({ limit: "10mb" })`, with exceptions for bias/fairness, DeepEval non-experiment paths, and `/api/webhooks/*`.
- **Cookie parser** + double-submit-cookie **CSRF protection** (`csrf.middleware`).
- **i18n middleware** for request localization.
- **`/health` endpoint** with database, Redis, and AI Gateway checks + rate limiting.
- **`requestMetricsMiddleware`** for request metrics/access logging.
- **Webhook routes** mounted before the global rate limiter.
- **`generalApiLimiter`** global rate ceiling (300 req/min in production, relaxed in dev/test).
- **Swagger UI** at `/api/docs` only in non-production.
- Mounts 116 route modules under `/api/*`, `/v1`, and `/health`.

### 1.3 `database/db.ts`

- Creates a Sequelize-Typescript instance using `sequelize-typescript` with the `verifywise` schema.
- Imports and registers ~150 domain/framework models.
- Loads `.env.test` when `NODE_ENV=test`.
- Calls `enableRlsQueryScoping(sequelize)` to support the optional RLS Phase 2 enforcement.

### 1.4 Middleware Stack

| Middleware | File | Purpose |
|---|---|---|
| `authenticateJWT` | `middleware/auth.middleware.ts` | JWT/API-token validation, org membership, role consistency, AsyncLocalStorage context, RLS enforcement |
| `authorize([roles])` | `middleware/accessControl.middleware.ts` | RBAC role guard |
| `superAdminOnly` | `middleware/superAdminOnly.middleware.ts` | Requires `req.isSuperAdmin === true` |
| `selfOnly` | `middleware/selfOnly.middleware.ts` | Restricts a user route to the authenticated user |
| `csrfProtection` | `middleware/csrf.middleware.ts` | Double-submit cookie CSRF guard |
| `generalApiLimiter` | `middleware/rateLimit.middleware.ts` | Global per-IP rate ceiling |
| `authLimiter` / `tokenRefreshLimiter` / `loginLimiter` | `middleware/rateLimit.middleware.ts` | Brute-force/refresh limits |
| `fileOperationsLimiter` | `middleware/rateLimit.middleware.ts` | File I/O rate limits |
| `mrmIngestionLimiter` | `middleware/rateLimit.middleware.ts` | Token-keyed ingestion limits |
| `webhookLimiter` | `middleware/rateLimit.middleware.ts` | Webhook rate limits |
| `aiDetectionScanLimiter` | `middleware/rateLimit.middleware.ts` | AI detection scan limits |
| `mrmIngestionAuth` | `middleware/mrmIngestionAuth.middleware.ts` | Bearer ingestion-token auth for MRM pushes |
| `requireExtensionEnabled(key)` | `middleware/requireExtensionEnabled.middleware.ts` | Per-extension enablement gate |
| `validateTokenCreation/Deletion` | `middleware/tokens.middleware.ts` | API-token quotas & Admin check |
| `i18nMiddleware` | `middleware/i18n.middleware.ts` | Request localization |
| `requestMetricsMiddleware` | `middleware/requestMetrics.middleware.ts` | Metrics/access logs |
| `rlsEnforcement` | `middleware/rls.middleware.ts` | Optional RLS transaction + `SET LOCAL app.current_org` |
| `checkMultiTenancy` | `middleware/multiTenancy.middleware.ts` | Org creation license check |

### 1.5 Auth Patterns Summary

- Most `/api/*` routes require `authenticateJWT` (Bearer access token).
- Sensitive mutations use `authorize([...])` with standard roles `Admin`, `Editor`, `Reviewer`, `Auditor`.
- Public/unauthenticated endpoints are rare and limited to `/health`, login/refresh/register/reset/logout, webhooks, and some internal/telemetry surfaces.
- Super-admin routes use `authenticateJWT` + `superAdminOnly`; the `users` table with `role_id IS NULL` and `organization_id IS NULL` denotes a pure SuperAdmin account.
- MRM ingestion uses opaque Bearer tokens hashed with SHA-256 and looked up in `mrm_ingestion_tokens`.
- API tokens are signed JWTs with `type: "api_token"` that must also exist in the `tokens` table; `tokens.middleware` enforces quotas.

---

## 2. Complete API Route Inventory

The backend mounts **116 route modules** (including 7 extension routers). Each section below lists the base path, controller file, HTTP methods, endpoint patterns, authentication/authorization middleware, and the controller function invoked.

## `extensions/azure-ai-foundry/azureAiFoundry.route.ts`
- **Base path(s):** `/api/extensions/azure-ai-foundry`
- **Controller:** `extensions/azure-ai-foundry/azureAiFoundry.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/models` | JWT, extension:azure-ai-foundry | `listDeployments` |
| POST | `/sync` | JWT, extension:azure-ai-foundry | `syncFromAzure` |
| GET | `/models/:deploymentId` | JWT, extension:azure-ai-foundry | `getDeploymentById` |
| GET | `/discover` | JWT, extension:azure-ai-foundry | `discoverAiAgents` |

## `extensions/dataset-bulk-upload/datasetBulkUpload.route.ts`
- **Base path(s):** `/api/extensions/dataset-bulk-upload`
- **Controller:** `extensions/dataset-bulk-upload/datasetBulkUpload.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/upload` | JWT, authorize(['Admin', 'Editor']), extension:dataset-bulk-upload | `uploadDatasetFile` |

## `extensions/jira-assets/jiraAssets.route.ts`
- **Base path(s):** `/api/extensions/jira-assets`
- **Controller:** `extensions/jira-assets/jiraAssets.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/config` | JWT, extension:jira-assets | `getConfig` |
| POST | `/config` | JWT, extension:jira-assets | `postConfig` |
| GET | `/vw-attributes` | JWT, extension:jira-assets | `getVwAttributes` |
| GET | `/schemas` | JWT, extension:jira-assets | `getSchemas` |
| GET | `/schemas/:schemaId/object-types` | JWT, extension:jira-assets | `getObjectTypes` |
| GET | `/object-types/:objectTypeId/attributes` | JWT, extension:jira-assets | `getAttributes` |
| GET | `/object-types/:objectTypeId/objects` | JWT, extension:jira-assets | `getObjects` |
| POST | `/import` | JWT, extension:jira-assets | `postImport` |
| POST | `/sync` | JWT, extension:jira-assets | `postSync` |
| GET | `/sync/status` | JWT, extension:jira-assets | `getSyncStatusCtrl` |
| GET | `/sync/history` | JWT, extension:jira-assets | `getSyncHistoryCtrl` |
| GET | `/use-cases` | JWT, extension:jira-assets | `listUseCasesCtrl` |
| GET | `/use-cases/:id` | JWT, extension:jira-assets | `getUseCaseCtrl` |
| DELETE | `/use-cases/:id` | JWT, extension:jira-assets | `deleteUseCaseCtrl` |
| GET | `/projects/:projectId/custom-frameworks-progress` | JWT, extension:jira-assets | `getCustomFrameworksProgressCtrl` |

## `extensions/mlflow/mlflow.route.ts`
- **Base path(s):** `/api/extensions/mlflow`
- **Controller:** `extensions/mlflow/mlflow.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/models` | JWT, extension:mlflow | `listModels` |
| POST | `/sync` | JWT, extension:mlflow | `syncFromMlflow` |
| GET | `/models/:modelId` | JWT, extension:mlflow | `getModelById` |

## `extensions/model-lifecycle/modelLifecycle.route.ts`
- **Base path(s):** `/api/extensions/model-lifecycle`
- **Controller:** `extensions/model-lifecycle/modelLifecycle.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/config` | JWT, extension:model-lifecycle | `listConfig` |
| POST | `/phases` | JWT, extension:model-lifecycle | `createPhaseCtrl` |
| PUT | `/phases/reorder` | JWT, extension:model-lifecycle | `reorderPhasesCtrl` |
| PUT | `/phases/:id` | JWT, extension:model-lifecycle | `updatePhaseCtrl` |
| DELETE | `/phases/:id` | JWT, extension:model-lifecycle | `deletePhaseCtrl` |
| POST | `/phases/:phaseId/items` | JWT, extension:model-lifecycle | `createItemCtrl` |
| PUT | `/phases/:phaseId/items/reorder` | JWT, extension:model-lifecycle | `reorderItemsCtrl` |
| PUT | `/items/:id` | JWT, extension:model-lifecycle | `updateItemCtrl` |
| DELETE | `/items/:id` | JWT, extension:model-lifecycle | `deleteItemCtrl` |
| GET | `/models/:id/lifecycle` | JWT, extension:model-lifecycle | `getLifecycleCtrl` |
| GET | `/models/:id/lifecycle/progress` | JWT, extension:model-lifecycle | `getProgressCtrl` |
| PUT | `/models/:id/lifecycle/items/:itemId` | JWT, extension:model-lifecycle | `upsertValueCtrl` |
| POST | `/models/:id/lifecycle/items/:itemId/files` | JWT, extension:model-lifecycle | `attachFileCtrl` |
| DELETE | `/models/:id/lifecycle/items/:itemId/files/:fileId` | JWT, extension:model-lifecycle | `detachFileCtrl` |
| POST | `/models/:id/lifecycle/items/:itemId/people` | JWT, extension:model-lifecycle | `addPersonCtrl` |
| DELETE | `/models/:id/lifecycle/items/:itemId/people/:userId` | JWT, extension:model-lifecycle | `removePersonCtrl` |
| POST | `/models/:id/lifecycle/items/:itemId/approvals` | JWT, extension:model-lifecycle | `addApproverCtrl` |
| PUT | `/models/:id/lifecycle/items/:itemId/approvals/:userId` | JWT, extension:model-lifecycle | `updateApprovalStatusCtrl` |
| DELETE | `/models/:id/lifecycle/items/:itemId/approvals/:userId` | JWT, extension:model-lifecycle | `removeApproverCtrl` |

## `extensions/risk-import/riskImport.route.ts`
- **Base path(s):** `/api/extensions/risk-import`
- **Controller:** `extensions/risk-import/riskImport.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/template` | JWT, authorize(['Admin', 'Editor']), extension:risk-import | `downloadExcelTemplate` |
| POST | `/import` | JWT, authorize(['Admin', 'Editor']), extension:risk-import | `bulkImportRisks` |

## `extensions/slack/slack.route.ts`
- **Base path(s):** `/api/extensions/slack`
- **Controller:** `../../controllers/slackWebhook.ctrl`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/oauth/workspaces` | JWT, extension:slack | `getAllSlackWebhooks` |
| GET | `/oauth/workspaces/:id` | JWT, extension:slack | `getSlackWebhookById` |
| POST | `/oauth/workspaces` | JWT, extension:slack | `createNewSlackWebhook` |
| PATCH | `/oauth/workspaces/:id` | JWT, extension:slack | `updateSlackWebhookById` |
| DELETE | `/oauth/workspaces/:id` | JWT, extension:slack | `deleteSlackWebhookById` |
| POST | `/oauth/workspaces/:id/send` | JWT, extension:slack | `sendSlackMessage` |

## `routes/advisor.route.ts`
- **Base path(s):** `/api/advisor`
- **Controller:** `controllers/advisor.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/` | JWT | `runAdvisor` |
| POST | `/stream` | JWT | `streamAdvisor` |
| POST | `/chat` | JWT | `streamAdvisorV2` |
| GET | `/conversations/:domain` | JWT | `listConversations` |
| POST | `/conversations/:domain` | JWT | `createConversation` |
| GET | `/conversations/:domain/:id` | JWT | `getConversationById` |
| PUT | `/conversations/:domain/:id` | JWT | `updateConversation` |
| DELETE | `/conversations/:domain/:id` | JWT | `deleteConversation` |
| GET | `/memory` | JWT | `getMemorySummary` |
| DELETE | `/memory` | JWT | `deleteMyMemory` |
| GET | `/memory/admin/agent/:agentName` | JWT | `adminListAgentMessages` |
| DELETE | `/memory/admin/agent/:agentName` | JWT | `adminClearAgentMemory` |

## `routes/agentDiscovery.route.ts`
- **Base path(s):** `/api/agent-primitives`
- **Controller:** `controllers/agentDiscovery.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllAgentPrimitives` |
| GET | `/stats` | JWT | `getAgentStats` |
| GET | `/sync/logs` | JWT | `getSyncLogs` |
| GET | `/sync/status` | JWT | `getSyncStatus` |
| GET | `/:id` | JWT | `getAgentPrimitiveById` |
| POST | `/` | JWT, authorize(['Admin']) | `createAgentPrimitive` |
| POST | `/sync` | JWT, authorize(['Admin']) | `triggerSync` |
| PATCH | `/:id` | JWT, authorize(['Admin']) | `updateAgentPrimitive` |
| PATCH | `/:id/review` | JWT, authorize(['Admin']) | `reviewAgentPrimitive` |
| PATCH | `/:id/link-model` | JWT, authorize(['Admin']) | `linkModelToAgent` |
| PATCH | `/:id/unlink-model` | JWT, authorize(['Admin']) | `unlinkModelFromAgent` |
| GET | `/:id/audit-logs` | JWT | `getAgentAuditLogs` |
| DELETE | `/:id` | JWT, authorize(['Admin']) | `deleteAgentPrimitiveById` |

## `routes/aiApp.route.ts`
- **Base path(s):** `/api/ai-apps`
- **Controller:** `controllers/aiApp.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllAiApps` |
| GET | `/policy-suggestions` | JWT | `getPolicySuggestions` |
| GET | `/:id` | JWT | `getAiAppById` |
| POST | `/` | JWT, authorize(['Admin', 'Editor']) | `createAiApp` |
| POST | `/:id/models` | JWT, authorize(['Admin', 'Editor']) | `linkModelsToAiApp` |
| POST | `/:id/policies` | JWT, authorize(['Admin', 'Editor']) | `setPoliciesForAiApp` |
| POST | `/:id/data-exposure` | JWT, authorize(['Admin', 'Editor']) | `setDataExposureForAiApp` |
| POST | `/from-shadow-ai/:shadowAiToolId` | JWT, authorize(['Admin', 'Editor']) | `promoteFromShadowAi` |
| PATCH | `/:id` | JWT, authorize(['Admin', 'Editor']) | `updateAiAppById` |
| PATCH | `/:id/status` | JWT, authorize(['Admin', 'Editor']) | `updateAiAppStatus` |
| DELETE | `/:id` | JWT, authorize(['Admin']) | `deleteAiAppById` |

## `routes/aiApproval.route.ts`
- **Base path(s):** `/api/ai-approvals`
- **Controller:** `controllers/aiApproval.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/stats` | JWT | `getApprovalStatsCtrl` |
| GET | `/` | JWT | `listApprovalsCtrl` |
| GET | `/:id` | JWT | `getApprovalDetailCtrl` |
| POST | `/:id/approve` | JWT, authorize(['Admin']) | `approveApprovalCtrl` |
| POST | `/:id/reject` | JWT, authorize(['Admin']) | `rejectApprovalCtrl` |

## `routes/aiApprovalRules.route.ts`
- **Base path(s):** `/api/ai-approval-rules`
- **Controller:** `controllers/aiApprovalRules.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/test` | JWT | `testRuleCtrl` |
| GET | `/` | JWT | `listRulesCtrl` |
| POST | `/` | JWT | `createRuleCtrl` |
| PUT | `/:id` | JWT | `updateRuleCtrl` |
| DELETE | `/:id` | JWT | `deleteRuleCtrl` |

## `routes/aiAudit.route.ts`
- **Base path(s):** `/api/ai-audit`
- **Controller:** `controllers/aiAudit.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/analytics` | JWT | `getAnalytics` |
| GET | `/export` | JWT, authorize(['Admin']) | `exportAuditLog` |
| GET | `/log/:actionId` | JWT | `getActionAuditTrail` |
| GET | `/log` | JWT | `getAuditLog` |

## `routes/aiConfirmation.route.ts`
- **Base path(s):** `/api/ai-confirmation`
- **Controller:** `controllers/aiConfirmation.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/approve/:id` | JWT, authorize(['Admin']) | `approveConfirmation` |
| POST | `/reject/:id` | JWT, authorize(['Admin']) | `rejectConfirmation` |
| GET | `/pending` | JWT | `getPendingConfirmations` |

## `routes/aiContent.route.ts`
- **Base path(s):** `/api/ai-content`
- **Controller:** `controllers/aiContent.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/stats` | JWT | `getStats` |
| GET | `/unreviewed` | JWT | `getUnreviewed` |
| GET | `/:entityType/:entityId` | JWT | `getBadges` |
| PATCH | `/:id/review` | JWT, authorize(['Admin', 'Editor']) | `reviewContent` |

## `routes/aiDetection.route.ts`
- **Base path(s):** `/api/ai-detection`
- **Controller:** `controllers/aiDetection.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/scans` | JWT, authorize(...) | `startScanController` |
| GET | `/scans` | JWT, authorize(...) | `getScansController` |
| GET | `/scans/active` | JWT, authorize(...) | `getActiveScanController` |
| GET | `/scans/:scanId` | JWT, authorize(...) | `getScanController` |
| GET | `/scans/:scanId/status` | JWT, authorize(...) | `getScanStatusController` |
| GET | `/scans/:scanId/findings` | JWT, authorize(...) | `getScanFindingsController` |
| GET | `/scans/:scanId/security-findings` | JWT, authorize(...) | `getSecurityFindingsController` |
| GET | `/scans/:scanId/security-summary` | JWT, authorize(...) | `getSecuritySummaryController` |
| POST | `/scans/:scanId/cancel` | JWT, authorize(...) | `cancelScanController` |
| DELETE | `/scans/:scanId` | JWT, authorize(...) | `deleteScanController` |
| PATCH | `/scans/:scanId/findings/:findingId/governance` | JWT, authorize(...) | `updateGovernanceStatusController` |
| GET | `/scans/:scanId/governance-summary` | JWT, authorize(...) | `getGovernanceSummaryController` |
| GET | `/stats` | JWT, authorize(...) | `getAIDetectionStatsController` |
| GET | `/scans/:scanId/export/ai-bom` | JWT, authorize(...) | `exportAIBOMController` |
| GET | `/scans/:scanId/dependency-graph` | JWT, authorize(...) | `getDependencyGraphController` |
| GET | `/scans/:scanId/compliance` | JWT, authorize(...) | `getComplianceMappingController` |
| GET | `/scans/:scanId/risk-score` | JWT, authorize(...) | `getRiskScoreController` |
| POST | `/scans/:scanId/risk-score/recalculate` | JWT, authorize(...) | `recalculateRiskScoreController` |
| GET | `/risk-scoring/config` | JWT, authorize(...) | `getRiskScoringConfigController` |
| PATCH | `/risk-scoring/config` | JWT, authorize(...) | `updateRiskScoringConfigController` |
| POST | `/suppressions` | JWT, authorize(...) | `createSuppressionController` |
| GET | `/suppressions` | JWT, authorize(...) | `listSuppressionsController` |
| DELETE | `/suppressions/:id` | JWT, authorize(...) | `deleteSuppressionController` |

## `routes/aiDetectionRepository.route.ts`
- **Base path(s):** `/api/ai-detection/repositories`
- **Controller:** `controllers/aiDetectionRepository.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT, authorize(...) | `listRepositories` |
| GET | `/:id` | JWT, authorize(...) | `getRepository` |
| POST | `/` | JWT, authorize(...) | `createRepository` |
| PATCH | `/:id` | JWT, authorize(...) | `updateRepository` |
| DELETE | `/:id` | JWT, authorize(...) | `deleteRepository` |
| POST | `/:id/scan` | JWT, authorize(...) | `triggerRepositoryScan` |
| POST | `/:id/webhook-secret` | JWT, authorize(...) | `generateWebhookSecretController` |
| GET | `/:id/scans` | JWT, authorize(...) | `getRepositoryScans` |

## `routes/aiEditor.route.ts`
- **Base path(s):** `?`
- **Controller:** `controllers/aiEditor.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/command` | JWT | `editorAICommand` |

## `routes/aiGateway.route.ts`
- **Base path(s):** `/api/ai-gateway`
- **Controller:** `controllers/aiGateway.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|

## `routes/aiIncidentManagement.route.ts`
- **Base path(s):** `/api/ai-incident-managements`
- **Controller:** `../controllers/incident-management.ctrl`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllIncidents` |
| GET | `/:id` | JWT | `getIncidentById` |
| POST | `/` | JWT | `createNewIncident` |
| PATCH | `/:id` | JWT | `updateIncidentById` |
| PATCH | `/:id/archive` | JWT | `archiveIncidentById` |
| DELETE | `/:id` | JWT | `deleteIncidentById` |

## `routes/aiTrustCentre.route.ts`
- **Base path(s):** `/api/aiTrustCentre`
- **Controller:** `controllers/aiTrustCentre.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/overview` | JWT | `getAITrustCentreOverview` |
| GET | `/resources` | JWT | `getAITrustCentreResources` |
| GET | `/subprocessors` | JWT | `getAITrustCentreSubprocessors` |
| GET | `/:hash` | special | `getAITrustCentrePublicPage` |
| GET | `/:hash/logo` | special | `getCompanyLogo` |
| GET | `/:hash/resources/:id` | special | `getAITrustCentrePublicResource` |
| POST | `/resources` | JWT | `createAITrustResource` |
| POST | `/subprocessors` | JWT | `createAITrustSubprocessor` |
| POST | `/logo` | JWT | `uploadCompanyLogo` |
| PUT | `/overview` | JWT | `updateAITrustOverview` |
| PUT | `/resources/:id` | JWT | `updateAITrustResource` |
| PUT | `/subprocessors/:id` | JWT | `updateAITrustSubprocessor` |
| DELETE | `/logo` | JWT | `deleteCompanyLogo` |
| DELETE | `/resources/:id` | JWT | `deleteAITrustResource` |
| DELETE | `/subprocessors/:id` | JWT | `deleteAITrustSubprocessor` |

## `routes/aiTrustIndex.route.ts`
- **Base path(s):** `/api/ai-trust-index`
- **Controller:** `controllers/aiTrustIndex.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/apps` | JWT | `getApps` |
| GET | `/apps/:slug` | JWT | `getApp` |
| GET | `/tracked` | JWT | `getTracked` |
| POST | `/tracked/bulk` | JWT | `trackAppsBulk` |
| POST | `/tracked` | JWT | `trackApp` |
| DELETE | `/tracked/:slug` | JWT | `untrackApp` |
| GET | `/settings` | JWT | `getSettings` |
| PUT | `/settings` | JWT | `updateSettings` |

## `routes/approvalRequest.route.ts`
- **Base path(s):** `/api/approval-requests`
- **Controller:** `controllers/approvalRequest.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/` | JWT | `createApprovalRequest` |
| GET | `/my-requests` | JWT | `getMyApprovalRequests` |
| GET | `/pending-approvals` | JWT | `getPendingApprovals` |
| GET | `/all` | JWT, authorize(['Admin']) | `getAllApprovalRequests` |
| GET | `/:id` | JWT | `getApprovalRequestById` |
| POST | `/:id/approve` | JWT | `approveRequest` |
| POST | `/:id/reject` | JWT | `rejectRequest` |
| POST | `/:id/withdraw` | JWT | `withdrawRequest` |

## `routes/approvalWorkflow.route.ts`
- **Base path(s):** `/api/approval-workflows`
- **Controller:** `controllers/approvalWorkflow.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllApprovalWorkflows` |
| GET | `/:id` | JWT | `getApprovalWorkflowById` |
| POST | `/` | JWT, authorize(['Admin']) | `createApprovalWorkflow` |
| PUT | `/:id` | JWT, authorize(['Admin']) | `updateApprovalWorkflow` |
| DELETE | `/:id` | JWT, authorize(['Admin']) | `deleteApprovalWorkflow` |

## `routes/assessment.route.ts`
- **Base path(s):** `/api/assessments`
- **Controller:** `controllers/assessment.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllAssessments` |
| GET | `/getAnswers/:id` | JWT | `getAnswers` |
| GET | `/:id` | JWT | `getAssessmentById` |
| GET | `/project/byid/:id` | JWT | `getAssessmentByProjectId` |
| POST | `/` | JWT | `createAssessment` |
| PUT | `/:id` | JWT | `updateAssessmentById` |
| DELETE | `/:id` | JWT | `deleteAssessmentById` |

## `routes/auditLedger.route.ts`
- **Base path(s):** `/api/audit-ledger`
- **Controller:** `controllers/auditLedger.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT, authorize(['Admin', 'SuperAdmin']) | `getAuditLedger` |
| GET | `/verify` | JWT, authorize(['Admin']) | `verifyAuditLedger` |

## `routes/autoDriver.route.ts`
- **Base path(s):** `/api/autoDrivers`
- **Controller:** `controllers/autoDriver.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/` | JWT, authorize(['Admin']) | `postAutoDriver` |
| DELETE | `/` | JWT, authorize(['Admin']) | `deleteAutoDriver` |

## `routes/automation.route.ts`
- **Base path(s):** `/api/automations`
- **Controller:** `../controllers/automations.ctrl`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllAutomations` |
| GET | `/triggers` | JWT | `getAllAutomationTriggers` |
| GET | `/actions/by-triggerId/:triggerId` | JWT | `getAllAutomationActionsByTriggerId` |
| GET | `/:id/history` | JWT | `getAutomationHistory` |
| GET | `/:id/stats` | JWT | `getAutomationStats` |
| GET | `/:id` | JWT | `getAutomationById` |
| POST | `/` | JWT | `createAutomation` |
| PUT | `/:id` | JWT | `updateAutomation` |
| DELETE | `/:id` | JWT | `deleteAutomationById` |

## `routes/ceMarking.route.ts`
- **Base path(s):** `/api/ce-marking`
- **Controller:** `controllers/ceMarking.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/:projectId` | JWT | `getCEMarking` |
| PUT | `/:projectId` | JWT | `updateCEMarking` |

## `routes/compliance.route.ts`
- **Base path(s):** `/api/compliance`
- **Controller:** `controllers/compliance.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/score` | JWT | `getComplianceScore` |
| GET | `/score/:organizationId` | JWT | `getComplianceScoreByOrganization` |
| GET | `/details/:organizationId` | JWT | `getComplianceDetails` |

## `routes/customField.route.ts`
- **Base path(s):** `/api/custom-fields`
- **Controller:** `controllers/customField.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/definitions/by-id/:id` | JWT | `getCustomFieldDefinitionById` |
| GET | `/definitions/:entityType` | JWT | `listCustomFieldDefinitions` |
| POST | `/definitions` | JWT, authorize(['Admin']) | `createCustomFieldDefinition` |
| PATCH | `/definitions/:id` | JWT, authorize(['Admin']) | `updateCustomFieldDefinition` |
| DELETE | `/definitions/:id` | JWT, authorize(['Admin']) | `deleteCustomFieldDefinition` |
| GET | `/values/:entityType/:entityId/missing-required` | JWT | `getMissingRequiredCustomFields` |
| GET | `/values/:entityType/:entityId` | JWT | `getCustomFieldValuesForEntity` |
| PUT | `/values` | JWT | `setCustomFieldValue` |
| DELETE | `/values/:definitionId/:entityId` | JWT | `deleteCustomFieldValue` |

## `routes/dashboard.route.ts`
- **Base path(s):** `/api/dashboard`
- **Controller:** `controllers/dashboard.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getDashboardData` |

## `routes/dataset.route.ts`
- **Base path(s):** `/api/datasets`
- **Controller:** `controllers/dataset.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllDatasets` |
| GET | `/:id` | JWT | `getDatasetById` |
| GET | `/by-model/:modelId` | JWT | `getDatasetsByModelId` |
| GET | `/by-project/:projectId` | JWT | `getDatasetsByProjectId` |
| GET | `/:id/history` | JWT | `getDatasetHistory` |
| POST | `/` | JWT | `createNewDataset` |
| PATCH | `/:id` | JWT | `updateDatasetById` |
| DELETE | `/:id` | JWT | `deleteDatasetById` |

## `routes/datasetChangeHistory.route.ts`
- **Base path(s):** `/api/dataset-change-history`
- **Controller:** `controllers/datasetChangeHistory.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/:id` | JWT | `getDatasetChangeHistoryById` |

## `routes/deadline.route.ts`
- **Base path(s):** `/api/deadlines`
- **Controller:** `controllers/deadline.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/summary` | JWT | `getDeadlinesSummary` |

## `routes/deepEvalRoutes.route.ts`
- **Base path(s):** `/api/deepeval`
- **Controller:** `controllers/deepEvalRoutes.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/playground/chat` | JWT | `async (req: Request, res: Response) => {
      const { model, provider, messages } = req.body as {
        model: string;
        provider: string;
        messages: { role: string; content: string | Array<{ type: string; [k: string]: any }> }[];
      };

      if (!model || !messages?.length) {
        res.status(400).json({ error: "model and messages are required" });
        return;
      }

      const orgId = (req as any).organizationId;
      const normalizedProvider = (provider || "openrouter").toLowerCase() as LLMProvider;

      let apiKey = "";
      if (VALID_PROVIDERS.includes(normalizedProvider)) {
        try {
          apiKey =
            (await getDecryptedAiGatewayKeyForProviderQuery(orgId, normalizedProvider)) || "";
        } catch {
          // Proceed without key — will fail at gateway with a clear error
        }
      }

      if (!apiKey) {
        res.status(400).json({
          error: `No API key found for provider "${normalizedProvider}". Add one in Settings → API Keys.`,
        });
        return;
      }

      const litellmModel = toLiteLLMModel(normalizedProvider, model);

      try {
        const gatewayRes = await fetch(`${AI_GATEWAY_URL}/internal/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-key": AI_GATEWAY_KEY,
            "x-organization-id": String(orgId || ""),
            "x-provider-key": apiKey,
            ...(req.requestId ? { "x-request-id": req.requestId } : {}),
          },
          body: JSON.stringify({ model: litellmModel, messages, stream: false }),
          signal: AbortSignal.timeout(120_000),
        });

        // Gateway may return non-JSON on errors (FastAPI HTML, plain text, etc.)
        const rawText = await gatewayRes.text();
        let data: any = null;
        try {
          data = JSON.parse(rawText);
        } catch {
          /* not JSON */
        }

        if (!gatewayRes.ok) {
          const errMsg =
            data?.detail ||
            data?.error?.message ||
            data?.message ||
            rawText.slice(0, 300) ||
            `Gateway error ${gatewayRes.status}`;
          res.status(gatewayRes.status).json({ error: errMsg });
          return;
        }

        const content = data?.choices?.[0]?.message?.content ?? "";
        res.json({ content });
      } catch (err: any) {
        res.status(502).json({ error: err?.message || "Failed to reach AI Gateway" });
      }
    }` |

## `routes/entityGraph.route.ts`
- **Base path(s):** `/api/entity-graph`
- **Controller:** `../controllers/entityGraphAnnotations.ctrl`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/annotations` | JWT | `saveAnnotation` |
| GET | `/annotations` | JWT | `getAnnotations` |
| GET | `/annotations/:entityType/:entityId` | JWT | `getAnnotationByEntity` |
| DELETE | `/annotations/:id` | JWT | `deleteAnnotation` |
| DELETE | `/annotations/entity/:entityType/:entityId` | JWT | `deleteAnnotationByEntity` |
| POST | `/views` | JWT | `createView` |
| GET | `/views` | JWT | `getViews` |
| GET | `/views/:id` | JWT | `getViewById` |
| PUT | `/views/:id` | JWT | `updateView` |
| DELETE | `/views/:id` | JWT | `deleteView` |
| GET | `/gap-rules/defaults` | special | `getDefaultGapRules` |
| POST | `/gap-rules` | JWT | `saveGapRules` |
| GET | `/gap-rules` | JWT | `getGapRules` |
| DELETE | `/gap-rules` | JWT | `resetGapRules` |

## `routes/eu.route.ts`
- **Base path(s):** `/api/eu-ai-act`
- **Controller:** `controllers/eu.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/controlCategories` | JWT | `getAllControlCategories` |
| GET | `/controls/byControlCategoryId/:id` | JWT | `getControlsByControlCategoryId` |
| GET | `/topics` | JWT | `getAllTopics` |
| GET | `/assessments/byProjectId/:id` | JWT | `getAssessmentsByProjectId` |
| GET | `/compliances/byProjectId/:id` | JWT | `getCompliancesByProjectId` |
| GET | `/compliances/progress/:id` | JWT | `getProjectComplianceProgress` |
| GET | `/assessments/progress/:id` | JWT | `getProjectAssessmentProgress` |
| GET | `/all/compliances/progress` | JWT | `getAllProjectsComplianceProgress` |
| GET | `/all/assessments/progress` | JWT | `getAllProjectsAssessmentProgress` |
| GET | `/topicById` | JWT | `getTopicById` |
| GET | `/controlById` | JWT | `getControlById` |
| PATCH | `/saveControls/:id` | JWT | `saveControls` |
| PATCH | `/saveAnswer/:id` | JWT | `updateQuestionById` |
| DELETE | `/assessments/byProjectId/:id` | JWT | `deleteAssessmentsByProjectId` |
| DELETE | `/compliances/byProjectId/:id` | JWT | `deleteCompliancesByProjectId` |

## `routes/evaluationLlmApiKey.route.ts`
- **Base path(s):** `/api/evaluation-llm-keys`
- **Controller:** `controllers/evaluationLlmApiKey.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `evalKeysRetired` |
| POST | `/` | JWT | `evalKeysRetired` |
| POST | `/verify` | JWT | `evalKeysRetired` |
| DELETE | `/:provider` | JWT | `evalKeysRetired` |
| GET | `/internal/decrypted` | special | `evalKeysRetired` |

## `routes/evidenceAi.route.ts`
- **Base path(s):** `/api/evidence-ai`
- **Controller:** `controllers/evidenceAi.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/analyze/:fileId` | JWT | `analyzeFile` |
| GET | `/analysis/:fileId` | JWT | `getAnalysis` |
| GET | `/quality-scores` | JWT | `getQualityScores` |
| GET | `/gaps` | JWT | `getGaps` |
| GET | `/suggestions/:fileId` | JWT | `getSuggestions` |
| POST | `/suggestions/:fileId/apply` | JWT | `applySuggestions` |

## `routes/evidenceHub.route.ts`
- **Base path(s):** `/api/evidenceHub`
- **Controller:** `controllers/evidenceHub.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllEvidences` |
| GET | `/:id` | JWT | `getEvidenceById` |
| POST | `/` | JWT | `createNewEvidence` |
| PATCH | `/:id` | JWT | `updateEvidenceById` |
| DELETE | `/:id` | JWT | `deleteEvidenceById` |

## `routes/extension.route.ts`
- **Base path(s):** `/api/extensions`
- **Controller:** `controllers/extension.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `listExtensions` |
| GET | `/:key` | JWT | `getExtension` |
| POST | `/:key/enable` | JWT, authorize(['Admin']) | `enableExtension` |
| POST | `/:key/disable` | JWT, authorize(['Admin']) | `disableExtension` |
| PATCH | `/:key/configuration` | JWT, authorize(['Admin']) | `updateExtensionConfiguration` |
| POST | `/:key/test-connection` | JWT, authorize(['Admin']) | `testExtensionConnection` |

## `routes/featureSettings.route.ts`
- **Base path(s):** `/api/feature-settings`
- **Controller:** `controllers/featureSettings.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getFeatureSettings` |
| PATCH | `/` | JWT | `updateFeatureSettings` |

## `routes/file.route.ts`
- **Base path(s):** `/api/files`
- **Controller:** `controllers/file.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getUserFilesMetaData` |
| GET | `/by-projid/:id` | JWT | `getFileMetaByProjectId` |
| GET | `/entity/:framework_type/:entity_type/:entity_id` | JWT | `getEntityFiles` |
| POST | `/attach` | JWT | `attachFileToEntity` |
| POST | `/attach-bulk` | JWT | `attachFilesToEntity` |
| DELETE | `/detach` | JWT | `detachFileFromEntity` |
| PATCH | `/bulk-tags` | JWT, authorize(['Admin', 'Editor']) | `bulkUpdateFileTags` |
| GET | `/:id` | JWT, authorize(['Admin']) | `getFileContentById` |
| POST | `/` | JWT, authorize(['Admin', 'Reviewer', 'Editor']) | `postFileContent` |

## `routes/fileChangeHistory.route.ts`
- **Base path(s):** `/api/file-change-history`
- **Controller:** `controllers/fileChangeHistory.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/:id` | JWT | `getFileChangeHistoryById` |

## `routes/fileManager.route.ts`
- **Base path(s):** `/api/file-manager`
- **Controller:** `controllers/fileManager.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/` | JWT, authorize(['Admin', 'Reviewer', 'Editor']) | `uploadFile` |
| GET | `/` | JWT | `listFiles` |
| GET | `/search` | JWT | `searchFiles` |
| GET | `/with-metadata` | JWT | `listFilesWithMetadata` |
| GET | `/:id` | JWT | `downloadFile` |
| GET | `/:id/metadata` | JWT | `getFileMetadata` |
| GET | `/:id/versions` | JWT | `getFileVersionHistory` |
| PATCH | `/:id/metadata` | JWT, authorize(['Admin', 'Reviewer', 'Editor']) | `updateMetadata` |
| GET | `/:id/preview` | JWT | `previewFile` |
| DELETE | `/:id` | JWT, authorize(['Admin', 'Reviewer', 'Editor']) | `removeFile` |

## `routes/frameworkImpl.route.ts`
- **Base path(s):** `/api/frameworks`
- **Controller:** `controllers/frameworkImpl.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/:frameworkId/tree/:projectId` | JWT | `getFrameworkTree` |
| GET | `/:frameworkId/dashboard/:projectFrameworkId` | JWT | `getFrameworkDashboard` |
| GET | `/:frameworkId/impl/:level/:id` | JWT | `getImplById` |
| GET | `/:frameworkId/impl/:level/:id/risks` | JWT | `getImplRisks` |
| PATCH | `/:frameworkId/impl/:level/:id` | JWT | `updateImpl` |

## `routes/frameworks.route.ts`
- **Base path(s):** `/api/frameworks`
- **Controller:** `../controllers/framework.ctrl`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllFrameworks` |
| GET | `/:id` | JWT | `getFrameworkById` |
| POST | `/toProject` | JWT | `addFrameworkToProject` |
| DELETE | `/fromProject` | JWT | `deleteFrameworkFromProject` |

## `routes/fria.route.ts`
- **Base path(s):** `/api/fria`
- **Controller:** `controllers/fria.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| PUT | `/:friaId/rights` | JWT, authorize(['Admin', 'Editor']) | `updateFriaRights` |
| GET | `/:friaId/risk-items` | JWT | `getRiskItems` |
| POST | `/:friaId/risk-items` | JWT, authorize(['Admin', 'Editor']) | `addRiskItem` |
| PATCH | `/:friaId/risk-items/:itemId` | JWT, authorize(['Admin', 'Editor']) | `updateRiskItem` |
| DELETE | `/:friaId/risk-items/:itemId` | JWT, authorize(['Admin', 'Editor']) | `deleteRiskItem` |
| GET | `/:friaId/models` | JWT | `getModelLinks` |
| POST | `/:friaId/models/:modelId` | JWT, authorize(['Admin', 'Editor']) | `linkModel` |
| DELETE | `/:friaId/models/:modelId` | JWT, authorize(['Admin', 'Editor']) | `unlinkModel` |
| GET | `/:friaId/evidence` | JWT | `getFriaEvidence` |
| POST | `/:friaId/evidence` | JWT, authorize(['Admin', 'Editor']) | `linkFriaEvidence` |
| DELETE | `/:friaId/evidence/:linkId` | JWT, authorize(['Admin', 'Editor']) | `unlinkFriaEvidence` |
| POST | `/:friaId/submit` | JWT, authorize(['Admin', 'Editor']) | `submitFria` |
| GET | `/:friaId/versions` | JWT | `getVersions` |
| GET | `/:friaId/versions/:version` | JWT | `getVersion` |
| GET | `/:projectId` | JWT | `getFria` |
| PUT | `/:projectId` | JWT, authorize(['Admin', 'Editor']) | `updateFria` |

## `routes/githubIntegration.route.ts`
- **Base path(s):** `/api/integrations/github`
- **Controller:** `../controllers/githubToken.ctrl`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/token` | JWT, authorize(...) | `getGitHubTokenStatusController` |
| POST | `/token` | JWT, authorize(...) | `saveGitHubTokenController` |
| DELETE | `/token` | JWT, authorize(...) | `deleteGitHubTokenController` |
| POST | `/token/test` | JWT, authorize(...) | `testGitHubTokenController` |

## `routes/governanceOs.route.ts`
- **Base path(s):** `/api/governance-os`
- **Controller:** `controllers/governanceOs.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/mappings` | JWT | `getAllMappings` |
| GET | `/mappings/between/:sourceId/:targetId` | JWT | `getMappingsBetween` |
| GET | `/mappings/control/:controlType/:controlId` | JWT | `getMappingsForControl` |
| POST | `/mappings` | JWT, authorize(['Admin', 'Editor']) | `createMapping` |
| PUT | `/mappings/:id` | JWT, authorize(['Admin', 'Editor']) | `updateMapping` |
| DELETE | `/mappings/:id` | JWT, authorize(['Admin']) | `deleteMapping` |
| POST | `/mappings/bulk` | JWT, authorize(['Admin', 'Editor']) | `createBulkMappings` |
| GET | `/scenarios` | JWT | `getAllScenarios` |
| GET | `/scenarios/:id` | JWT | `getScenarioById` |
| POST | `/scenarios` | JWT, authorize(['Admin', 'Editor']) | `createScenario` |
| PUT | `/scenarios/:id` | JWT, authorize(['Admin', 'Editor']) | `updateScenario` |
| DELETE | `/scenarios/:id` | JWT, authorize(['Admin']) | `deleteScenario` |
| POST | `/scenarios/:id/activate` | JWT, authorize(['Admin', 'Editor']) | `activateScenario` |
| POST | `/scenarios/simulate` | JWT | `simulateScenario` |
| GET | `/activations` | JWT | `getActivationHistory` |
| POST | `/activations/:id/deactivate` | JWT, authorize(['Admin', 'Editor']) | `deactivateScenario` |
| GET | `/activations/:id/progress` | JWT | `getScenarioProgress` |
| POST | `/recommend` | JWT | `getRecommendations` |
| GET | `/coverage/:projectId` | JWT | `getCoverage` |
| POST | `/coverage/:projectId/refresh` | JWT, authorize(['Admin', 'Editor']) | `refreshCoverage` |
| GET | `/unified-view/:projectId` | JWT | `getUnifiedView` |
| GET | `/eligibility` | JWT | `getEligibility` |
| GET | `/preferences` | JWT | `getPreferences` |
| PUT | `/preferences` | JWT, authorize(['Admin']) | `updatePreferences` |

## `routes/incidentChangeHistory.route.ts`
- **Base path(s):** `/api/incident-change-history`
- **Controller:** `controllers/incidentChangeHistory.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/:incidentId` | JWT | `getIncidentHistory` |

## `routes/intakeForm.route.ts`
- **Base path(s):** `/api/intake`
- **Controller:** `controllers/intakeForm.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/forms` | JWT | `getAllIntakeForms` |
| GET | `/forms/:id` | JWT | `getIntakeFormById` |
| POST | `/forms` | JWT, authorize(...) | `createIntakeForm` |
| PATCH | `/forms/:id` | JWT, authorize(...) | `updateIntakeForm` |
| DELETE | `/forms/:id` | JWT, authorize(...) | `deleteIntakeForm` |
| POST | `/forms/:id/archive` | JWT, authorize(...) | `archiveIntakeForm` |
| GET | `/forms/:id/preview` | JWT | `previewForm` |
| POST | `/forms/suggested-questions` | JWT, authorize(...) | `getLLMSuggestedQuestions` |
| POST | `/forms/field-guidance` | JWT, authorize(...) | `getFieldGuidance` |
| GET | `/submissions` | JWT | `getPendingSubmissions` |
| GET | `/submissions/stats` | JWT | `getSubmissionStats` |
| GET | `/submissions/by-entity/:entityType/:entityId` | JWT | `getSubmissionByEntity` |
| GET | `/submissions/:id` | JWT | `getSubmissionById` |
| GET | `/submissions/:id/preview` | JWT | `getSubmissionPreview` |
| PATCH | `/submissions/:id/risk-override` | JWT, authorize(...) | `overrideSubmissionRisk` |
| GET | `/forms/:id/submissions` | JWT | `getFormSubmissions` |
| POST | `/submissions/:id/approve` | JWT, authorize(...) | `approveSubmission` |
| POST | `/submissions/:id/reject` | JWT, authorize(...) | `rejectSubmission` |
| GET | `/public/captcha` | special | `getCaptcha` |
| GET | `/public/by-id/:publicId` | special | `getPublicFormByPublicId` |
| POST | `/public/by-id/:publicId` | special | `submitPublicFormByPublicId` |
| GET | `/public/:tenantSlug/:formSlug` | special | `getPublicForm` |
| POST | `/public/:tenantSlug/:formSlug` | special | `submitPublicForm` |

## `routes/internal.route.ts`
- **Base path(s):** `/api/internal`
- **Controller:** `controllers/internal.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/ai-gateway/notify` | special | `async (req: Request, res: Response) => {
  try {
    const { type, organization_id } = req.body;

    if (!type || !organization_id) {
      return res.status(400).json({ error: "type and organization_id required" });
    }

    switch (type) {
      case "config_change":
        await notifyConfigChange(organization_id, req.body.changed_by_user_id, req.body.event);
        break;

      case "budget_warning":
        await notifyBudgetWarning(organization_id, req.body.budget);
        break;

      case "budget_exhausted":
        await notifyBudgetExhausted(organization_id, req.body.budget);
        break;

      case "guardrail_spike":
        await notifyGuardrailSpike(organization_id, req.body.stats);
        break;

      case "approval_pending":
        await notifyApprovalPending(organization_id, req.body.approval);
        break;

      case "virtual_key_budget_exhausted":
        await notifyVirtualKeyBudgetExhausted(
          organization_id,
          req.body.key_name,
          req.body.spend,
          req.body.limit,
        );
        break;

      default:
        return res.status(400).json({ error: `Unknown notification type: ${type}` });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error("Internal notification dispatch error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}` |
| GET | `/observability-config` | special | `async (_req: Request, res: Response) => {
  try {
    const config = await getMonitoringConfig();
    return res.status(200).json({
      enabled: config.enabled,
      otlp_endpoint: config.otlp_endpoint,
      deployment_name: config.deployment_name,
      auth_header: config.auth_header,
    });
  } catch (error) {
    logger.error("Internal observability-config error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}` |

## `routes/invitation.route.ts`
- **Base path(s):** `/api/invitations`
- **Controller:** `controllers/invitation.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT, authorize(['Admin', 'SuperAdmin']) | `getInvitations` |
| DELETE | `/:id` | JWT, authorize(['Admin', 'SuperAdmin']) | `revokeInvitation` |
| POST | `/:id/resend` | JWT, authorize(['Admin', 'SuperAdmin']) | `resendInvitation` |

## `routes/iso27001.route.ts`
- **Base path(s):** `/api/iso-27001`
- **Controller:** `controllers/iso27001.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/clauses` | JWT | `getAllClauses` |
| GET | `/clauses/struct/byProjectId/:id` | JWT | `getAllClausesStructForProject` |
| GET | `/annexes` | JWT | `getAllAnnexes` |
| GET | `/annexes/struct/byProjectId/:id` | JWT | `getAllAnnexesStructForProject` |
| GET | `/clauses/byProjectId/:id` | JWT | `getClausesByProjectId` |
| GET | `/annexes/byProjectId/:id` | JWT | `getAnnexesByProjectId` |
| GET | `/subClauses/byClauseId/:id` | JWT | `getSubClausesByClauseId` |
| GET | `/annexControls/byAnnexId/:id` | JWT | `getAnnexControlsByAnnexId` |
| GET | `/subClause/byId/:id` | JWT | `getSubClauseById` |
| GET | `/annexControl/byId/:id` | JWT | `getAnnexControlById` |
| GET | `/clauses/progress/:id` | JWT | `getProjectClausesProgress` |
| GET | `/annexes/progress/:id` | JWT | `getProjectAnnxesProgress` |
| GET | `/all/clauses/progress` | JWT | `getAllProjectsClausesProgress` |
| GET | `/all/annexes/progress` | JWT | `getAllProjectsAnnxesProgress` |
| GET | `/clauses/assignments/:id` | JWT | `getProjectClausesAssignments` |
| GET | `/annexes/assignments/:id` | JWT | `getProjectAnnexesAssignments` |
| PATCH | `/saveClauses/:id` | JWT | `saveClauses` |
| PATCH | `/saveAnnexes/:id` | JWT | `saveAnnexes` |
| DELETE | `/clauses/byProjectId/:id` | JWT | `deleteManagementSystemClauses` |
| DELETE | `/annexes/byProjectId/:id` | JWT | `deleteReferenceControls` |

## `routes/iso42001.route.ts`
- **Base path(s):** `/api/iso-42001`
- **Controller:** `controllers/iso42001.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/clauses` | JWT | `getAllClauses` |
| GET | `/clauses/struct/byProjectId/:id` | JWT | `getAllClausesStructForProject` |
| GET | `/annexes` | JWT | `getAllAnnexes` |
| GET | `/annexes/struct/byProjectId/:id` | JWT | `getAllAnnexesStructForProject` |
| GET | `/clauses/byProjectId/:id` | JWT | `getClausesByProjectId` |
| GET | `/annexes/byProjectId/:id` | JWT | `getAnnexesByProjectId` |
| GET | `/subClauses/byClauseId/:id` | JWT | `getSubClausesByClauseId` |
| GET | `/annexCategories/byAnnexId/:id` | JWT | `getAnnexCategoriesByAnnexId` |
| GET | `/subClause/byId/:id` | JWT | `getSubClauseById` |
| GET | `/subclauses/:id/risks` | JWT | `getSubClauseRisks` |
| GET | `/annexCategories/:id/risks` | JWT | `getAnnexCategoryRisks` |
| GET | `/annexCategory/byId/:id` | JWT | `getAnnexCategoryById` |
| GET | `/clauses/progress/:id` | JWT | `getProjectClausesProgress` |
| GET | `/annexes/progress/:id` | JWT | `getProjectAnnxesProgress` |
| GET | `/all/clauses/progress` | JWT | `getAllProjectsClausesProgress` |
| GET | `/all/annexes/progress` | JWT | `getAllProjectsAnnxesProgress` |
| GET | `/clauses/assignments/:id` | JWT | `getProjectClausesAssignments` |
| GET | `/annexes/assignments/:id` | JWT | `getProjectAnnexesAssignments` |
| PATCH | `/saveClauses/:id` | JWT | `saveClauses` |
| PATCH | `/saveAnnexes/:id` | JWT | `saveAnnexes` |
| DELETE | `/clauses/byProjectId/:id` | JWT | `deleteManagementSystemClauses` |
| DELETE | `/annexes/byProjectId/:id` | JWT | `deleteReferenceControls` |

## `routes/llmKey.route.ts`
- **Base path(s):** `/api/llm-keys`
- **Controller:** `controllers/llmKey.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getLLMKeys` |
| GET | `/status` | JWT | `getLLMKeyStatus` |
| GET | `/:name` | JWT | `getLLMKey` |
| POST | `/` | JWT | `createLLMKey` |
| PATCH | `/:id` | JWT | `updateLLMKey` |
| DELETE | `/:id` | JWT | `deleteLLMKey` |

## `routes/logger.route.ts`
- **Base path(s):** `/api/logger`
- **Controller:** `controllers/logger.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/events` | JWT | `getEvents` |
| GET | `/logs` | JWT | `getLogs` |

## `routes/modelInventory.route.ts`
- **Base path(s):** `/api/modelInventory`
- **Controller:** `controllers/modelInventory.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllModelInventories` |
| GET | `/evaluations` | JWT | `getAllModelEvaluations` |
| GET | `/:id/evaluations` | JWT | `getModelEvaluations` |
| GET | `/:id` | JWT | `getModelInventoryById` |
| GET | `/by-projectId/:projectId` | JWT | `getModelByProjectId` |
| GET | `/by-frameworkId/:frameworkId` | JWT | `getModelByFrameworkId` |
| POST | `/` | JWT | `createNewModelInventory` |
| PATCH | `/:id` | JWT | `updateModelInventoryById` |
| DELETE | `/:id` | JWT | `deleteModelInventoryById` |

## `routes/modelInventoryChangeHistory.route.ts`
- **Base path(s):** `/api/model-inventory-change-history`
- **Controller:** `controllers/modelInventoryChangeHistory.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/:id` | JWT | `getModelInventoryChangeHistoryById` |

## `routes/modelInventoryHistory.route.ts`
- **Base path(s):** `/api/modelInventoryHistory`
- **Controller:** `controllers/modelInventoryHistory.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/timeseries` | JWT | `getTimeseries` |
| GET | `/current-counts` | JWT | `getCurrentCounts` |
| POST | `/snapshot` | JWT | `createSnapshot` |

## `routes/modelRisk.route.ts`
- **Base path(s):** `/api/modelRisks`
- **Controller:** `controllers/modelRisk.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllModelRisks` |
| GET | `/:id` | JWT | `getModelRiskById` |
| POST | `/` | JWT | `createNewModelRisk` |
| PUT | `/:id` | JWT | `updateModelRiskById` |
| PATCH | `/:id` | JWT | `updateModelRiskById` |
| DELETE | `/:id` | JWT | `deleteModelRiskById` |

## `routes/modelRiskChangeHistory.route.ts`
- **Base path(s):** `/api/model-risk-change-history`
- **Controller:** `controllers/modelRiskChangeHistory.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/:id` | JWT | `getModelRiskChangeHistoryById` |

## `routes/mrm.route.ts`
- **Base path(s):** `/api/mrm`
- **Controller:** `controllers/mrm.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/tiering` | JWT | `getFleetTiering` |
| PUT | `/models/:modelId/tier` | JWT | `assignModelTier` |
| GET | `/validations` | JWT | `getValidations` |
| POST | `/models/:modelId/validations` | JWT | `createValidation` |
| PATCH | `/validations/:id` | JWT | `updateValidation` |
| POST | `/validations/:id/signoff` | JWT | `signoffValidation` |
| GET | `/findings` | JWT | `getFindings` |
| POST | `/validations/:validationId/findings` | JWT | `createFinding` |
| PATCH | `/findings/:id` | JWT | `updateFinding` |
| GET | `/models/:modelId/roles` | JWT | `getModelRoles` |
| PUT | `/models/:modelId/roles` | JWT | `setModelRoles` |
| GET | `/ingestion-tokens` | JWT | `getIngestionTokens` |
| POST | `/ingestion-tokens` | JWT | `createIngestionToken` |
| POST | `/ingestion-tokens/:id/rotate` | JWT | `rotateIngestionToken` |
| POST | `/ingestion-tokens/:id/revoke` | JWT | `revokeIngestionToken` |
| GET | `/thresholds` | JWT | `getThresholds` |
| POST | `/models/:modelId/thresholds` | JWT | `createThreshold` |
| PATCH | `/thresholds/:id` | JWT | `updateThreshold` |
| DELETE | `/thresholds/:id` | JWT | `deleteThreshold` |
| GET | `/metric-keys` | JWT | `getMetricKeys` |
| POST | `/metric-keys` | JWT | `createMetricKey` |
| GET | `/models/:modelId/monitoring` | JWT | `getModelMonitoring` |
| GET | `/models/:modelId/monitoring/trend` | JWT | `getMetricTrend` |
| GET | `/models/:modelId/monitoring/breaches` | JWT | `getBreachHistory` |
| POST | `/models/:modelId/request-revalidation` | JWT | `requestRevalidation` |
| GET | `/models/:modelId/revalidation-events` | JWT | `getRevalidationEvents` |
| POST | `/revalidation/sweep` | JWT | `runRevalidationSweepForOrg` |
| GET | `/attestation/summary` | JWT | `getAttestationSummaryHandler` |
| GET | `/attestation/report` | JWT | `generateAttestationReportHandler` |
| GET | `/settings` | JWT | `getMrmSettingsHandler` |
| PUT | `/settings` | JWT | `updateMrmSettingsHandler` |

## `routes/mrmIngestion.route.ts`
- **Base path(s):** `/api/mrm`
- **Controller:** `../controllers/mrmMonitoring.ctrl`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/models/:externalModelKey/metrics` | ingestion-token | `ingestMetrics` |

## `routes/nist_ai_rmf.route.ts`
- **Base path(s):** `/api/nist-ai-rmf`
- **Controller:** `../controllers/nist_ai_rmf.function.ctrl`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/functions` | JWT | `getAllNISTAIRMFfunctions` |
| GET | `/functions/:id` | JWT | `getNISTAIRMFfunctionById` |
| GET | `/categories/:title` | JWT | `getAllNISTAIRMFCategoriesByfunctionId` |
| GET | `/subcategories/byId/:id` | JWT | `getNISTAIRMFSubcategoryById` |
| GET | `/subcategories/:id/risks` | JWT | `getNISTAIRMFSubcategoryRisks` |
| GET | `/subcategories/:categoryId/:title` | JWT | `getAllNISTAIRMFSubcategoriesBycategoryIdAndtitle` |
| PATCH | `/subcategories/:id` | JWT | `updateNISTAIRMFSubcategoryById` |
| PATCH | `/subcategories/:id/status` | JWT | `updateNISTAIRMFSubcategoryStatus` |
| GET | `/progress` | JWT | `getNISTAIRMFProgress` |
| GET | `/progress-by-function` | JWT | `getNISTAIRMFProgressByFunction` |
| GET | `/assignments` | JWT | `getNISTAIRMFAssignments` |
| GET | `/assignments-by-function` | JWT | `getNISTAIRMFAssignmentsByFunction` |
| GET | `/status-breakdown` | JWT | `getNISTAIRMFStatusBreakdown` |
| GET | `/overview` | JWT | `getNISTAIRMFOverview` |

## `routes/notes.route.ts`
- **Base path(s):** `/api/notes`
- **Controller:** `controllers/notes.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/` | JWT | `createNote` |
| GET | `/` | JWT | `getNotes` |
| PUT | `/:id` | JWT | `updateNote` |
| DELETE | `/:id` | JWT | `deleteNote` |

## `routes/notification.route.ts`
- **Base path(s):** `/api/notifications`
- **Controller:** `controllers/notification.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/stream` | JWT | `streamNotifications` |
| GET | `/` | JWT | `getNotifications` |
| GET | `/summary` | JWT | `getNotificationSummary` |
| GET | `/unread-count` | JWT | `getUnreadCount` |
| PATCH | `/read-all` | JWT | `markAllAsRead` |
| PATCH | `/:id/read` | JWT | `markAsRead` |
| DELETE | `/:id` | JWT | `deleteNotification` |

## `routes/observability.route.ts`
- **Base path(s):** `/api/observability`
- **Controller:** `controllers/observability.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/metrics` | JWT | `getMetrics` |
| GET | `/traces` | JWT | `getTraces` |
| GET | `/traces/:id` | JWT | `getTraceDetail` |
| GET | `/costs` | JWT | `getCosts` |
| GET | `/performance` | JWT | `getPerformance` |

## `routes/organization.route.ts`
- **Base path(s):** `/api/organizations`
- **Controller:** `controllers/organization.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/exists` | super-admin | `getOrganizationsExists` |
| GET | `/:id` | JWT, super-admin | `getOrganizationById` |
| POST | `/` | JWT, super-admin | `createOrganization` |
| PATCH | `/:id` | JWT, super-admin, authorize(['Admin']) | `updateOrganizationById` |
| PATCH | `/:id/onboarding-status` | JWT, super-admin, authorize(['Admin']) | `updateOnboardingStatus` |
| DELETE | `/:id` | JWT, super-admin | `deleteOrganizationById` |

## `routes/policy.route.ts`
- **Base path(s):** `/api/policies`
- **Controller:** `controllers/policy.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/import/docx` | JWT | `PolicyController.importDocx` |
| PATCH | `/bulk` | JWT, authorize(['Admin', 'Editor']) | `PolicyController.bulkUpdatePolicies` |
| GET | `/` | JWT | `PolicyController.getAllPolicies` |
| GET | `/tags` | JWT | `PolicyController.getPolicyTags` |
| GET | `/:id/export/pdf` | JWT | `PolicyController.exportPolicyPDF` |
| GET | `/:id/export/docx` | JWT | `PolicyController.exportPolicyDOCX` |
| GET | `/:id` | JWT | `PolicyController.getPolicyById` |
| POST | `/` | JWT | `PolicyController.createPolicy` |
| PUT | `/:id` | JWT | `PolicyController.updatePolicy` |
| DELETE | `/:id` | JWT | `PolicyController.deletePolicyById` |
| POST | `/:id/review/request` | JWT | `PolicyController.requestReview` |
| PUT | `/:id/review/approve` | JWT | `PolicyController.approveReview` |
| PUT | `/:id/review/reject` | JWT | `PolicyController.rejectReview` |

## `routes/policyChangeHistory.route.ts`
- **Base path(s):** `/api/policy-change-history`
- **Controller:** `controllers/policyChangeHistory.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/:id` | JWT | `getPolicyChangeHistoryById` |

## `routes/policyFolder.route.ts`
- **Base path(s):** `/api/policies`
- **Controller:** `controllers/policyFolder.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/folders/:folderId/policies` | JWT | `getPoliciesInFolder` |
| GET | `/:id/folders` | JWT | `getPolicyFolders` |
| PATCH | `/:id/folders` | JWT | `updatePolicyFolders` |

## `routes/policyLinkedObjects.route.ts`
- **Base path(s):** `/api/policy-linked`
- **Controller:** `../controllers/policy-linked-objects.ctrl`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllLinkedObjects` |
| GET | `/:policyId/linked-objects` | JWT | `getLinkedObjects` |
| POST | `/:policyId/linked-objects` | JWT | `createLinkedObject` |
| DELETE | `/:policyId/linked-objects` | JWT | `deleteLinkedObject` |
| DELETE | `/risk/:riskId/unlink-all` | JWT | `deleteRiskFromAllPolicies` |
| DELETE | `/evidence/:evidenceId/unlink-all` | JWT | `deleteEvidenceFromAllPolicies` |

## `routes/postMarketMonitoring.route.ts`
- **Base path(s):** `/api/pmm`
- **Controller:** `controllers/postMarketMonitoring.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/config/:projectId` | JWT | `getConfigByProjectId` |
| POST | `/config` | JWT | `createConfig` |
| PUT | `/config/:configId` | JWT | `updateConfig` |
| DELETE | `/config/:configId` | JWT | `deleteConfig` |
| GET | `/config/:configId/questions` | JWT | `getQuestions` |
| GET | `/org/questions` | JWT | `getQuestions` |
| POST | `/config/:configId/questions` | JWT | `addQuestion` |
| PUT | `/questions/:questionId` | JWT | `updateQuestion` |
| DELETE | `/questions/:questionId` | JWT | `deleteQuestion` |
| POST | `/questions/reorder` | JWT | `reorderQuestions` |
| GET | `/active-cycle/:projectId` | JWT | `getActiveCycle` |
| GET | `/cycles/:cycleId` | JWT | `getCycleById` |
| GET | `/cycles/:cycleId/responses` | JWT | `getResponses` |
| POST | `/cycles/:cycleId/responses` | JWT | `saveResponses` |
| POST | `/cycles/:cycleId/submit` | JWT | `submitCycle` |
| POST | `/cycles/:cycleId/flag` | JWT | `flagConcern` |
| GET | `/reports` | JWT | `getReports` |
| GET | `/reports/:reportId/download` | JWT | `downloadReport` |
| POST | `/cycles/:cycleId/reassign` | JWT | `reassignStakeholder` |
| POST | `/projects/:projectId/start-cycle` | JWT | `startNewCycle` |

## `routes/project.route.ts`
- **Base path(s):** `/api/projects`
- **Controller:** `controllers/project.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllProjects` |
| GET | `/calculateProjectRisks/:id` | JWT | `getProjectRisksCalculations` |
| GET | `/calculateVendorRisks/:id` | JWT | `getVendorRisksCalculations` |
| GET | `/:id` | JWT | `getProjectById` |
| GET | `/stats/:id` | JWT | `getProjectStatsById` |
| GET | `/complainces/:projid` | JWT | `getCompliances` |
| GET | `/compliance/progress/:id` | JWT | `projectComplianceProgress` |
| GET | `/assessment/progress/:id` | JWT | `projectAssessmentProgress` |
| GET | `/all/compliance/progress` | JWT | `allProjectsComplianceProgress` |
| GET | `/all/assessment/progress` | JWT | `allProjectsAssessmentProgress` |
| POST | `/` | JWT | `createProject` |
| POST | `/saveControls` | JWT | `saveControls` |
| PATCH | `/:id` | JWT | `updateProjectById` |
| PATCH | `/:id/status` | JWT | `updateProjectStatus` |
| DELETE | `/:id` | JWT | `deleteProjectById` |

## `routes/projectRiskChangeHistory.route.ts`
- **Base path(s):** `/api/risk-change-history`
- **Controller:** `controllers/projectRiskChangeHistory.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/:projectRiskId` | JWT | `getProjectRiskChangeHistoryByRiskId` |

## `routes/quantitativeRisk.route.ts`
- **Base path(s):** `/api/quantitative-risks`
- **Controller:** `controllers/quantitativeRisk.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/portfolio/org` | JWT | `getOrgPortfolio` |
| GET | `/portfolio/project/:projectId` | JWT | `getProjectPortfolio` |
| GET | `/portfolio/trend` | JWT | `getPortfolioTrendHandler` |
| POST | `/:riskId/apply-benchmark/:benchmarkId` | JWT | `applyBenchmark` |
| GET | `/assessment-mode` | JWT | `getRiskAssessmentMode` |
| PUT | `/assessment-mode` | JWT | `updateRiskAssessmentMode` |

## `routes/question.route.ts`
- **Base path(s):** `/api/questions`
- **Controller:** `controllers/question.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllQuestions` |
| GET | `/:id` | JWT | `getQuestionById` |
| GET | `/bysubtopic/:id` | JWT | `getQuestionsBySubtopicId` |
| GET | `/bytopic/:id` | JWT | `getQuestionsByTopicId` |
| POST | `/` | JWT | `createQuestion` |
| PATCH | `/:id` | JWT | `updateQuestionById` |
| DELETE | `/:id` | JWT | `deleteQuestionById` |

## `routes/readiness.route.ts`
- **Base path(s):** `/api/readiness`
- **Controller:** `controllers/readiness.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/calculate` | JWT | `calculateAll` |
| POST | `/calculate/:frameworkType` | JWT | `calculateForFramework` |
| GET | `/scores` | JWT | `getScores` |
| GET | `/scores/:frameworkType` | JWT | `getScoresByFramework` |
| GET | `/controls/:frameworkType` | JWT | `getControlScores` |
| GET | `/weakest` | JWT | `getWeakest` |
| GET | `/recommendations` | JWT | `getRecommendations` |
| GET | `/history` | JWT | `getHistory` |

## `routes/reportRun.route.ts`
- **Base path(s):** `/api/reporting/runs`
- **Controller:** `controllers/reportRun.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `listRuns` |
| GET | `/:id` | JWT | `getRun` |
| GET | `/:id/download` | JWT | `downloadRun` |
| GET | `/:id/analyses` | JWT | `getRunAnalyses` |
| PATCH | `/:id/archive` | JWT, authorize(['Admin', 'Editor']) | `archiveRun` |
| PATCH | `/:id/restore` | JWT, authorize(['Admin', 'Editor']) | `restoreRun` |
| DELETE | `/:id` | JWT, authorize(['Admin', 'Editor']) | `deleteRun` |

## `routes/reportTemplate.route.ts`
- **Base path(s):** `/api/reporting/templates`
- **Controller:** `controllers/reportTemplate.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `listTemplates` |
| GET | `/:id` | JWT | `getTemplate` |
| POST | `/` | JWT, authorize(['Admin', 'Editor']) | `createTemplate` |
| PATCH | `/:id` | JWT, authorize(['Admin', 'Editor']) | `updateTemplate` |
| DELETE | `/:id` | JWT, authorize(['Admin', 'Editor']) | `archiveTemplate` |
| POST | `/:id/run` | JWT, authorize(['Admin', 'Editor']) | `runTemplateNow` |

## `routes/reporting.route.ts`
- **Base path(s):** `/api/reporting`
- **Controller:** `controllers/reporting.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/generate-report` | JWT, authorize(['Admin']) | `generateReports` |
| POST | `/v2/generate-report` | JWT, authorize(['Admin']) | `generateReportsV2` |
| GET | `/sections` | JWT | `listSections` |
| DELETE | `/:id` | JWT | `deleteGeneratedReportById` |
| GET | `/generate-report` | JWT | `getAllGeneratedReports` |

## `routes/riskBenchmark.route.ts`
- **Base path(s):** `/api/risk-benchmarks`
- **Controller:** `controllers/riskBenchmark.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllBenchmarks` |
| GET | `/filters` | JWT | `getBenchmarkFilters` |
| GET | `/:id` | JWT | `getBenchmarkById` |

## `routes/riskHistory.route.ts`
- **Base path(s):** `/api/riskHistory`
- **Controller:** `controllers/riskHistory.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/timeseries` | JWT | `getTimeseries` |
| GET | `/current-counts` | JWT | `getCurrentCounts` |
| POST | `/snapshot` | JWT | `createSnapshot` |

## `routes/risks.route.ts`
- **Base path(s):** `/api/projectRisks`
- **Controller:** `controllers/risks.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllRisks` |
| GET | `/by-projid/:id` | JWT | `getRisksByProject` |
| GET | `/by-frameworkid/:id` | JWT | `getRisksByFramework` |
| GET | `/:id` | JWT | `getRiskById` |
| PATCH | `/bulk` | JWT, authorize(['Admin', 'Editor']) | `bulkUpdateProjectRisks` |
| POST | `/` | JWT | `createRisk` |
| PUT | `/:id` | JWT | `updateRiskById` |
| DELETE | `/:id` | JWT | `deleteRiskById` |

## `routes/role.route.ts`
- **Base path(s):** `/api/roles`
- **Controller:** `controllers/role.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllRoles` |
| GET | `/:id` | JWT | `getRoleById` |
| POST | `/` | JWT | `createRole` |
| PUT | `/:id` | JWT | `updateRoleById` |
| DELETE | `/:id` | JWT | `deleteRoleById` |

## `routes/scheduledReport.route.ts`
- **Base path(s):** `/api/reporting/scheduled-reports`
- **Controller:** `controllers/scheduledReport.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `listScheduledReports` |
| POST | `/` | JWT, authorize(['Admin', 'Editor']) | `createScheduledReport` |
| PATCH | `/:id` | JWT, authorize(['Admin', 'Editor']) | `updateScheduledReport` |
| POST | `/:id/pause` | JWT, authorize(['Admin', 'Editor']) | `pauseScheduledReport` |
| POST | `/:id/resume` | JWT, authorize(['Admin', 'Editor']) | `resumeScheduledReport` |
| POST | `/:id/run-now` | JWT, authorize(['Admin', 'Editor']) | `runScheduledReportNow` |
| DELETE | `/:id` | JWT, authorize(['Admin', 'Editor']) | `deleteScheduledReport` |

## `routes/search.route.ts`
- **Base path(s):** `/api/search`
- **Controller:** `controllers/search.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `search` |

## `routes/shadowAi.route.ts`
- **Base path(s):** `/api/shadow-ai`
- **Controller:** `controllers/shadowAi.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/api-keys` | JWT | `createApiKey` |
| GET | `/api-keys` | JWT | `listApiKeys` |
| DELETE | `/api-keys/:id` | JWT | `revokeApiKey` |
| DELETE | `/api-keys/:id/permanent` | JWT | `deleteApiKey` |
| GET | `/insights/summary` | JWT | `getInsightsSummary` |
| GET | `/insights/tools-by-events` | JWT | `getToolsByEvents` |
| GET | `/insights/tools-by-users` | JWT | `getToolsByUsers` |
| GET | `/insights/users-by-department` | JWT | `getUsersByDepartment` |
| GET | `/insights/trend` | JWT | `getTrend` |
| GET | `/users` | JWT | `getUsers` |
| GET | `/users/:email/activity` | JWT | `getUserDetail` |
| GET | `/departments` | JWT | `getDepartmentActivity` |
| GET | `/tools` | JWT | `getTools` |
| GET | `/tools/:id` | JWT | `getToolById` |
| PATCH | `/tools/:id/status` | JWT | `updateToolStatus` |
| POST | `/tools/:id/start-governance` | JWT | `startGovernance` |
| GET | `/rules` | JWT | `getRules` |
| POST | `/rules` | JWT | `createRule` |
| PATCH | `/rules/:id` | JWT | `updateRule` |
| DELETE | `/rules/:id` | JWT | `deleteRule` |
| GET | `/rules/alert-history` | JWT | `getAlertHistory` |
| GET | `/config/syslog` | JWT | `getSyslogConfigs` |
| POST | `/config/syslog` | JWT | `createSyslogConfig` |
| PATCH | `/config/syslog/:id` | JWT | `updateSyslogConfig` |
| DELETE | `/config/syslog/:id` | JWT | `deleteSyslogConfig` |
| GET | `/settings` | JWT | `getSettings` |
| PATCH | `/settings` | JWT | `updateSettings` |

## `routes/shadowAiIngestion.route.ts`
- **Base path(s):** `/api/v1/shadow-ai`
- **Controller:** `controllers/shadowAiIngestion.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/events` | special | `ingestEvents` |

## `routes/shareLink.route.ts`
- **Base path(s):** `/api/shares`
- **Controller:** `controllers/shareLink.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/token/:token` | special | `getShareLinkByToken` |
| GET | `/view/:token` | special | `getSharedDataByToken` |
| POST | `/` | JWT | `createShareLink` |
| GET | `/:resourceType/:resourceId` | JWT | `getShareLinksForResource` |
| PATCH | `/:id` | JWT | `updateShareLink` |
| DELETE | `/:id` | JWT | `deleteShareLink` |

## `routes/slackWebhook.route.ts`
- **Base path(s):** `/api/slackWebhooks`
- **Controller:** `controllers/slackWebhook.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllSlackWebhooks` |
| GET | `/:id` | JWT | `getSlackWebhookById` |
| POST | `/` | JWT | `createNewSlackWebhook` |
| PATCH | `/:id` | JWT | `updateSlackWebhookById` |
| DELETE | `/:id` | JWT | `deleteSlackWebhookById` |
| POST | `/:id/send` | JWT | `sendSlackMessage` |

## `routes/ssoConfig.route.ts`
- **Base path(s):** `/api/ssoConfig`
- **Controller:** `controllers/ssoConfig.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/feature` | special | `getSSOFeatureStatus` |
| GET | `/check-status` | special | `checkSSOStatus` |
| GET | `/orgs` | special | `listSSOOrgs` |
| GET | `/` | JWT, authorize(['Admin']) | `getSSOConfig` |
| PUT | `/` | JWT, authorize(['Admin']) | `saveSSOConfig` |
| PUT | `/enable` | JWT, authorize(['Admin']) | `enableSSO` |
| PUT | `/disable` | JWT, authorize(['Admin']) | `disableSSO` |

## `routes/subscription.route.ts`
- **Base path(s):** `/api/subscriptions`
- **Controller:** `../controllers/subscriptions.ctrl`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getSubscriptionController` |
| POST | `/` | JWT | `createSubscriptionController` |
| PUT | `/:id` | JWT | `updateSubscriptionController` |

## `routes/superAdmin.route.ts`
- **Base path(s):** `/api/super-admin`
- **Controller:** `controllers/superAdmin.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/organizations` | JWT, super-admin | `listOrganizations` |
| POST | `/organizations` | JWT, super-admin | `createOrg` |
| DELETE | `/organizations/:id` | JWT, super-admin | `deleteOrg` |
| PATCH | `/organizations/:id` | JWT, super-admin | `updateOrg` |
| GET | `/users/count` | JWT, super-admin | `getUserCount` |
| GET | `/users` | JWT, super-admin | `listAllUsers` |
| GET | `/organizations/:id/users` | JWT, super-admin | `listOrgUsers` |
| GET | `/organizations/:id/invitations` | JWT, super-admin | `listOrgInvitations` |
| POST | `/organizations/:id/invite` | JWT, super-admin | `inviteUserToOrg` |
| PATCH | `/users/:id` | JWT, super-admin | `updateUser` |
| DELETE | `/users/:id` | JWT, super-admin | `removeUser` |
| GET | `/monitoring` | JWT, super-admin | `getMonitoring` |
| PUT | `/monitoring` | JWT, super-admin | `updateMonitoring` |
| POST | `/monitoring/token` | JWT, super-admin | `generateMonitoringToken` |
| GET | `/super-admins` | JWT, super-admin | `listSuperAdmins` |
| POST | `/super-admins` | JWT, super-admin | `grantSuperAdmin` |
| DELETE | `/super-admins/:user_id` | JWT, super-admin | `revokeSuperAdmin` |

## `routes/task.route.ts`
- **Base path(s):** `/api/tasks`
- **Controller:** `controllers/task.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllTasks` |
| GET | `/:id` | JWT | `getTaskById` |
| GET | `/:id/entities` | JWT | `getTaskEntityLinks` |
| POST | `/` | JWT | `createTask` |
| POST | `/:id/entities` | JWT | `addTaskEntityLink` |
| PATCH | `/bulk` | JWT, authorize(['Admin', 'Editor']) | `bulkUpdateTasks` |
| PUT | `/:id/restore` | JWT | `restoreTask` |
| PUT | `/:id` | JWT | `updateTask` |
| DELETE | `/:id/hard` | JWT | `hardDeleteTask` |
| DELETE | `/:id/entities/:linkId` | JWT | `removeTaskEntityLink` |
| DELETE | `/:id` | JWT | `deleteTask` |

## `routes/taskChangeHistory.route.ts`
- **Base path(s):** `/api/task-change-history`
- **Controller:** `controllers/taskChangeHistory.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/:id` | JWT | `getTaskChangeHistoryById` |

## `routes/telemetry.route.ts`
- **Base path(s):** `/api/telemetry`
- **Controller:** `controllers/telemetry.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/` | special | `(req: Request, res: Response) => {
  // Always succeed quickly so the browser never blocks/errors on telemetry.
  if (!isObservabilityEnabled()) {
    return res.status(204).end();
  }

  const events: TelemetryEvent[] = Array.isArray(req.body?.events)
    ? req.body.events.slice(0, MAX_EVENTS)
    : [];

  if (events.length === 0) {
    return res.status(204).end();
  }

  const deployment = getDeploymentName();
  const meter = metrics.getMeter(FRONTEND_SERVICE);
  const eventCounter = meter.createCounter("browser.events", {
    description: "Browser telemetry events received",
  });
  const vital = meter.createHistogram("browser.web_vital", {
    description: "Browser Web Vitals measurements",
    unit: "ms",
  });
  const logger = logs.getLogger(FRONTEND_SERVICE);

  for (const event of events) {
    const type = clamp(event.type || "event");
    const baseAttrs = {
      service_name: FRONTEND_SERVICE,
      deployment,
      type,
    };
    eventCounter.add(1, baseAttrs);

    if (type === "web-vital" && typeof event.value === "number" && isFinite(event.value)) {
      vital.record(event.value, { ...baseAttrs, name: clamp(event.name) });
    }

    if (type === "error" || event.level === "error") {
      logger.emit({
        severityNumber: SeverityNumber.ERROR,
        severityText: "ERROR",
        body: clamp(event.message || event.name || "frontend error"),
        attributes: {
          "service.name": FRONTEND_SERVICE,
          "deployment.name": deployment,
          "browser.route": clamp(event.route),
          "event.type": type,
        },
      });
    }
  }

  return res.status(204).end();
}` |

## `routes/tiers.route.ts`
- **Base path(s):** `/api/tiers`
- **Controller:** `controllers/tiers.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/features/:id` | JWT | `getTiersFeatures` |

## `routes/tokens.route.ts`
- **Base path(s):** `/api/tokens`
- **Controller:** `controllers/tokens.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getApiTokens` |
| POST | `/` | JWT, token-validate | `createApiToken` |
| POST | `/:id/revoke` | JWT, token-validate | `revokeApiToken` |
| DELETE | `/:id` | JWT, token-validate | `deleteApiToken` |

## `routes/trainingChangeHistory.route.ts`
- **Base path(s):** `/api/training-change-history`
- **Controller:** `controllers/trainingChangeHistory.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/:id` | JWT | `getTrainingChangeHistoryById` |

## `routes/trainingRegistar.route.ts`
- **Base path(s):** `/api/training`
- **Controller:** `controllers/trainingRegistar.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllTrainingRegistar` |
| GET | `/training-id/:id` | JWT | `getTrainingRegistarById` |
| POST | `/` | JWT | `createNewTrainingRegistar` |
| PATCH | `/:id` | JWT | `updateTrainingRegistarById` |
| DELETE | `/:id` | JWT | `deleteTrainingRegistarById` |

## `routes/useCaseChangeHistory.route.ts`
- **Base path(s):** `/api/use-case-change-history`
- **Controller:** `controllers/useCaseChangeHistory.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/:useCaseId` | JWT | `getUseCaseHistory` |

## `routes/user.route.ts`
- **Base path(s):** `/api/users`
- **Controller:** `controllers/user.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllUsers` |
| GET | `/by-email/:email` | special | `getUserByEmail` |
| GET | `/preferences` | JWT | `getPreferencesForCurrentUser` |
| GET | `/me/preferences` | JWT | `getPreferencesForCurrentUser` |
| PATCH | `/me/preferences` | JWT | `patchPreferencesForCurrentUser` |
| GET | `/:id` | JWT | `getUserById` |
| POST | `/register` | registerJWT, rate-limit | `createNewUser` |
| POST | `/login` | rate-limit | `loginUser` |
| POST | `/login-microsoft` | rate-limit | `loginUserWithMicrosoft` |
| POST | `/refresh-token` | rate-limit | `refreshAccessToken` |
| POST | `/logout` | special | `logoutUser` |
| POST | `/reset-password` | reset-pwd, rate-limit | `resetPassword` |
| PATCH | `/chng-pass/:id` | JWT, self-only, rate-limit | `ChangePassword` |
| PATCH | `/:id` | JWT | `updateUserById` |
| DELETE | `/:id` | JWT, authorize(['Admin', 'SuperAdmin']) | `deleteUserById` |
| GET | `/check/exists` | JWT | `checkUserExists` |
| GET | `/:id/calculate-progress` | JWT | `calculateProgress` |
| POST | `/:id/profile-photo` | JWT | `uploadUserProfilePhoto` |
| GET | `/:id/profile-photo` | JWT | `getUserProfilePhoto` |
| DELETE | `/:id/profile-photo` | JWT | `deleteUserProfilePhoto` |
| POST | `/register` | special | `async (req, res) => {
  const { email, name } = req.body;

  try {
    await sendWelcomeEmail(email, name);
    res.status(200).send('Registration successful and welcome email sent.');
  } catch (error) {
    res.status(500).send('Error sending welcome email.');
  }
}` |

## `routes/userPreference.route.ts`
- **Base path(s):** `/api/user-preferences`
- **Controller:** `controllers/userPreference.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/:userId` | JWT | `getPreferencesByUser` |
| POST | `/` | JWT | `createUserPreferences` |
| PATCH | `/:userId` | JWT | `updateUserPreferences` |

## `routes/vendor.route.ts`
- **Base path(s):** `/api/vendors`
- **Controller:** `controllers/vendor.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllVendors` |
| GET | `/project-id/:id` | JWT | `getVendorByProjectId` |
| GET | `/:id` | JWT | `getVendorById` |
| POST | `/` | JWT | `createVendor` |
| PATCH | `/:id` | JWT | `updateVendorById` |
| DELETE | `/:id` | JWT | `deleteVendorById` |

## `routes/vendorChangeHistory.route.ts`
- **Base path(s):** `/api/vendor-change-history`
- **Controller:** `controllers/vendorChangeHistory.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/:id` | JWT | `getVendorChangeHistoryById` |

## `routes/vendorRisk.route.ts`
- **Base path(s):** `/api/vendorRisks`
- **Controller:** `controllers/vendorRisk.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/by-projid/:id` | JWT | `getAllVendorRisks` |
| GET | `/by-vendorid/:id` | JWT | `getAllVendorRisksByVendorId` |
| GET | `/by-frameworkid/:id` | JWT | `getVendorRisksByFrameworkId` |
| GET | `/all` | JWT | `getAllVendorRisksAllProjects` |
| GET | `/:id` | JWT | `getVendorRiskById` |
| POST | `/` | JWT | `createVendorRisk` |
| PATCH | `/:id` | JWT | `updateVendorRiskById` |
| DELETE | `/:id` | JWT | `deleteVendorRiskById` |

## `routes/vendorRiskChangeHistory.route.ts`
- **Base path(s):** `/api/vendor-risk-change-history`
- **Controller:** `controllers/vendorRiskChangeHistory.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/:id` | JWT | `getVendorRiskChangeHistoryById` |

## `routes/version.route.ts`
- **Base path(s):** `/api/version`
- **Controller:** `controllers/version.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | special | `(_req, res) => {
  res.json({ version });
}` |

## `routes/virtualFolder.route.ts`
- **Base path(s):** `/api/virtual-folders, /api/files`
- **Controller:** `controllers/virtualFolder.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| GET | `/` | JWT | `getAllFolders` |
| GET | `/tree` | JWT | `getFolderTree` |
| GET | `/uncategorized` | JWT | `getUncategorizedFiles` |
| GET | `/:id` | JWT | `getFolderById` |
| GET | `/:id/path` | JWT | `getFolderPath` |
| POST | `/` | JWT | `createFolder` |
| PATCH | `/:id` | JWT | `updateFolder` |
| DELETE | `/:id` | JWT | `deleteFolder` |
| GET | `/:id/files` | JWT | `getFilesInFolder` |
| POST | `/:id/files` | JWT | `assignFilesToFolder` |
| DELETE | `/:id/files/:fileId` | JWT | `removeFileFromFolder` |
| GET | `/:id/folders` | JWT | `getFileFolders` |
| PATCH | `/:id/folders` | JWT | `updateFileFolders` |

## `routes/virtualKeyProxy.route.ts`
- **Base path(s):** `/v1`
- **Controller:** `controllers/virtualKeyProxy.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|

## `routes/vwmailer.route.ts`
- **Base path(s):** `/api/mail`
- **Controller:** `controllers/vwmailer.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/invite` | JWT | `async (req, res) => {
  await invite(req, res, req.body);
}` |
| POST | `/reset-password` | special | `async (req: Request, res: Response) => {
  const { to, name, email } = req.body;

  logProcessing({
    description: `starting password reset request for: ${to}`,
    functionName: "reset-password",
    fileName: "vwmailer.route.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    // Check if user exists in the database
    const userData = await getUserByEmailQuery(to);

    // Only send email if user exists
    if (userData) {
      // Read the MJML template file
      const templatePath = path.resolve(__dirname, "../templates/password-reset-email.mjml");
      const template = fs.readFileSync(templatePath, "utf8");

      // Password-reset links are short-lived (1h) and single-use: the
      // token hash is stored so the reset middleware can consume it.
      const token = generateInviteToken(
        {
          name: name,
          email: to,
        },
        ONE_HOUR_MS,
      ) as string;

      await storeOneTimeToken({
        token,
        email: to,
        purpose: "password_reset",
        expiresAt: new Date(Date.now() + ONE_HOUR_MS),
      });

      // Data to be replaced in the template
      const url = `${frontEndUrl}/set-new-password?${new URLSearchParams({ token }).toString()}`;

      const data = { name: name, email, url };

      const subject = req.t!("Password reset request");
      await sendEmail(to, subject, template, data);

      console.log("Password reset email sent");

      await logSuccess({
        eventType: "Create",
        description: `Successfully sent password reset email to ${to}`,
        functionName: "reset-password",
        fileName: "vwmailer.route.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
    } else {
      // User doesn't exist, but don't reveal this information
      console.log(`Password reset requested for non-existent user: ${to}`);

      await logSuccess({
        eventType: "Create",
        description: `Password reset requested for non-existent user: ${to}`,
        functionName: "reset-password",
        fileName: "vwmailer.route.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
    }

    // Always return the same response regardless of whether user exists
    return res
      .status(200)
      .json({ message: "If an account exists with this email, we'll send a password reset link" });
  } catch (error) {
    console.error("Error processing password reset:", error);

    await logFailure({
      eventType: "Create",
      description: `Failed to process password reset request for ${to}`,
      functionName: "reset-password",
      fileName: "vwmailer.route.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res
      .status(500)
      .json({ error: "Failed to process request", details: (error as Error).message });
  }
}` |

## `routes/webhook.route.ts`
- **Base path(s):** `/api/webhooks`
- **Controller:** `controllers/webhook.ctrl.ts`

| Method | Pattern | Middleware / Auth | Controller |
|---|---|---|---|
| POST | `/github` | special | `githubWebhookController` |

---

## 3. Per-Domain Feature Summary

### 3.1 Authentication & Users

**What it does:** Login/logout, JWT refresh, registration, password reset, user/role/invitation/SSO/API-token management, and user preferences.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/invitations` | `routes/invitation.route.ts` | `controllers/invitation.ctrl.ts` | 3 | JWT, authorize(['Admin', 'SuperAdmin']) |
| `/api/roles` | `routes/role.route.ts` | `controllers/role.ctrl.ts` | 5 | JWT |
| `/api/ssoConfig` | `routes/ssoConfig.route.ts` | `controllers/ssoConfig.ctrl.ts` | 7 | JWT, authorize(['Admin']); public/special |
| `/api/tokens` | `routes/tokens.route.ts` | `controllers/tokens.ctrl.ts` | 4 | JWT; JWT, token-validate |
| `/api/users` | `routes/user.route.ts` | `controllers/user.ctrl.ts` | 21 | JWT; JWT, authorize(['Admin', 'SuperAdmin']); JWT, self-only, rate-limit; public/special; rate-limit; registerJWT, rate-limit; reset-pwd, rate-limit |
| `/api/user-preferences` | `routes/userPreference.route.ts` | `controllers/userPreference.ctrl.ts` | 3 | JWT |

**Key controllers / services / utils:**

- Controllers: controllers/invitation.ctrl.ts, controllers/role.ctrl.ts, controllers/ssoConfig.ctrl.ts, controllers/tokens.ctrl.ts, controllers/user.ctrl.ts, controllers/userPreference.ctrl.ts
- Services: emailService.ts
- Utils: jwt.utils.ts, user.utils.ts, roleMap.ts, tokens.utils.ts, superAdmin.utils.ts

**Existing tests:**

- `invitation.ctrl.test.ts`
- `role.ctrl.test.ts`
- `user.ctrl.test.ts`
- `tests/integration/tenant-isolation/mrm-ingestion-tokens.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-model-roles.isolation.test.ts`
- `tests/integration/tenant-isolation/users.isolation.test.ts`
- `tests/integration/user-deletion-fks.test.ts`

### 3.2 Super Admin

**What it does:** Instance-level operations available to elected SuperAdmins: organizations, users, monitoring config, and SuperAdmin membership.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/super-admin` | `routes/superAdmin.route.ts` | `controllers/superAdmin.ctrl.ts` | 17 | JWT, super-admin |

**Key controllers / services / utils:**

- Controllers: controllers/superAdmin.ctrl.ts
- Utils: superAdmin.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `OrganizationModel` | `organizations` |
| `UserModel` | `users` |
| `RoleModel` | `roles` |

**Existing tests:**

- _No dedicated controller/integration tests matched this domain._

### 3.3 Project & Use Case

**What it does:** Project CRUD, project members/scope/frameworks, assessment progress, risk calculations, use-case change history, and entity graph views.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/autoDrivers` | `routes/autoDriver.route.ts` | `controllers/autoDriver.ctrl.ts` | 2 | JWT, authorize(['Admin']) |
| `/api/entity-graph` | `routes/entityGraph.route.ts` | `../controllers/entityGraphAnnotations.ctrl` | 14 | JWT; public/special |
| `/api/projects` | `routes/project.route.ts` | `controllers/project.ctrl.ts` | 15 | JWT |
| `/api/questions` | `routes/question.route.ts` | `controllers/question.ctrl.ts` | 7 | JWT |
| `/api/use-case-change-history` | `routes/useCaseChangeHistory.route.ts` | `controllers/useCaseChangeHistory.ctrl.ts` | 1 | JWT |

**Key controllers / services / utils:**

- Controllers: ../controllers/entityGraphAnnotations.ctrl, controllers/autoDriver.ctrl.ts, controllers/project.ctrl.ts, controllers/question.ctrl.ts, controllers/useCaseChangeHistory.ctrl.ts
- Utils: project.utils.ts, projectScope.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `ProjectModel` | `projects` |
| `ProjectScopeModel` | `project_scopes` |
| `ProjectsMembersModel` | `project_members` |
| `ProjectFrameworksModel` | `projects_frameworks` |
| `QuestionModel` | `questions` |
| `AssessmentModel` | `assessments` |
| `EntityGraphViewsModel` | `entity_graph_views` |
| `EntityGraphAnnotationsModel` | `entity_graph_annotations` |
| `EntityGraphGapRulesModel` | `entity_graph_gap_rules` |

**Existing tests:**

- `project.ctrl.test.ts`
- `tests/integration/projects.test.ts`
- `tests/integration/tenant-isolation/projects.isolation.test.ts`
- `tests/integration/tenant-isolation/projects-frameworks.isolation.test.ts`

### 3.4 Assessment & Compliance

**What it does:** Assessments, framework gap workflows, EU AI Act, ISO 42001/27001, NIST AI RMF, readiness tracking, compliance scoring, and FRIA snapshots.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/assessments` | `routes/assessment.route.ts` | `controllers/assessment.ctrl.ts` | 7 | JWT |
| `/api/compliance` | `routes/compliance.route.ts` | `controllers/compliance.ctrl.ts` | 3 | JWT |
| `/api/eu-ai-act` | `routes/eu.route.ts` | `controllers/eu.ctrl.ts` | 15 | JWT |
| `/api/frameworks` | `routes/frameworkImpl.route.ts` | `controllers/frameworkImpl.ctrl.ts` | 5 | JWT |
| `/api/frameworks` | `routes/frameworks.route.ts` | `../controllers/framework.ctrl` | 4 | JWT |
| `/api/fria` | `routes/fria.route.ts` | `controllers/fria.ctrl.ts` | 16 | JWT; JWT, authorize(['Admin', 'Editor']) |
| `/api/iso-27001` | `routes/iso27001.route.ts` | `controllers/iso27001.ctrl.ts` | 20 | JWT |
| `/api/iso-42001` | `routes/iso42001.route.ts` | `controllers/iso42001.ctrl.ts` | 22 | JWT |
| `/api/nist-ai-rmf` | `routes/nist_ai_rmf.route.ts` | `../controllers/nist_ai_rmf.function.ctrl` | 14 | JWT |
| `/api/readiness` | `routes/readiness.route.ts` | `controllers/readiness.ctrl.ts` | 8 | JWT |

**Key controllers / services / utils:**

- Controllers: ../controllers/framework.ctrl, ../controllers/nist_ai_rmf.function.ctrl, controllers/assessment.ctrl.ts, controllers/compliance.ctrl.ts, controllers/eu.ctrl.ts, controllers/frameworkImpl.ctrl.ts, controllers/fria.ctrl.ts, controllers/iso27001.ctrl.ts, controllers/iso42001.ctrl.ts, controllers/readiness.ctrl.ts
- Utils: assessment.utils.ts, framework.utils.ts, eu.utils.ts, iso.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `AssessmentModel` | `assessments` |
| `FrameworkModel` | `frameworks` |
| `ProjectFrameworksModel` | `projects_frameworks` |
| `ControlModel` | `controls` |
| `ControlCategoryModel` | `control_categories` |
| `SubcontrolModel` | `subcontrols` |
| `TopicModel` | `topics` |
| `SubtopicModel` | `subtopics` |
| `QuestionModel` | `questions` |
| `AssessmentEUModel` | `assessments` |
| `ControlEUModel` | `controls_eu` |
| `SubcontrolEUModel` | `subcontrols_eu` |
| `AnnexCategoryISOModel` | `annexcategory_iso` |
| `SubClauseISOModel` | `subclauses_iso` |
| `ISO27001SubClauseModel` | `subclauses_iso27001` |
| `ISO27001AnnexControlModel` | `annexcontrols_iso27001` |
| `NISTAIMRFCategoryModel` | `nist_ai_rmf_categories_struct` |
| `NISTAIMRFSubcategoryModel` | `nist_ai_rmf_subcategories` |
| `FriaAssessmentModel` | `fria_assessments` |
| `FriaSnapshotModel` | `fria_snapshots` |

**Existing tests:**

- `assessment.ctrl.test.ts`
- `compliance.ctrl.test.ts`
- `readiness.ctrl.test.ts`
- `tests/integration/tenant-isolation/assessments.isolation.test.ts`
- `tests/integration/tenant-isolation/controls-eu.isolation.test.ts`
- `tests/integration/tenant-isolation/projects-frameworks.isolation.test.ts`

### 3.5 Risk Management

**What it does:** Project risks, risk history, vendor risks, risk benchmarks, quantitative risk analysis, and risk-change audit trails.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/risk-change-history` | `routes/projectRiskChangeHistory.route.ts` | `controllers/projectRiskChangeHistory.ctrl.ts` | 1 | JWT |
| `/api/quantitative-risks` | `routes/quantitativeRisk.route.ts` | `controllers/quantitativeRisk.ctrl.ts` | 6 | JWT |
| `/api/risk-benchmarks` | `routes/riskBenchmark.route.ts` | `controllers/riskBenchmark.ctrl.ts` | 3 | JWT |
| `/api/riskHistory` | `routes/riskHistory.route.ts` | `controllers/riskHistory.ctrl.ts` | 3 | JWT |
| `/api/projectRisks` | `routes/risks.route.ts` | `controllers/risks.ctrl.ts` | 8 | JWT; JWT, authorize(['Admin', 'Editor']) |
| `/api/vendorRisks` | `routes/vendorRisk.route.ts` | `controllers/vendorRisk.ctrl.ts` | 8 | JWT |
| `/api/vendor-risk-change-history` | `routes/vendorRiskChangeHistory.route.ts` | `controllers/vendorRiskChangeHistory.ctrl.ts` | 1 | JWT |

**Key controllers / services / utils:**

- Controllers: controllers/projectRiskChangeHistory.ctrl.ts, controllers/quantitativeRisk.ctrl.ts, controllers/riskBenchmark.ctrl.ts, controllers/riskHistory.ctrl.ts, controllers/risks.ctrl.ts, controllers/vendorRisk.ctrl.ts, controllers/vendorRiskChangeHistory.ctrl.ts
- Services: risk.service.ts
- Utils: risk.utils.ts, riskCalculation.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `RiskModel` | `project_risks` |
| `RiskHistoryModel` | `risk_history` |
| `VendorRiskModel` | `vendor_risks` |
| `RiskBenchmark?` | `risk_benchmarks` |

**Existing tests:**

- `risks.bulk.ctrl.test.ts`
- `risks.ctrl.test.ts`
- `tests/integration/tenant-isolation/risks.isolation.test.ts`

### 3.6 Vendor Management

**What it does:** Vendor profiles, vendor-project links, vendor risks, and vendor change history.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/vendors` | `routes/vendor.route.ts` | `controllers/vendor.ctrl.ts` | 6 | JWT |
| `/api/vendor-change-history` | `routes/vendorChangeHistory.route.ts` | `controllers/vendorChangeHistory.ctrl.ts` | 1 | JWT |

**Key controllers / services / utils:**

- Controllers: controllers/vendor.ctrl.ts, controllers/vendorChangeHistory.ctrl.ts
- Services: vendor.service.ts
- Utils: vendor.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `VendorModel` | `vendors` |
| `VendorRiskModel` | `vendor_risks` |
| `VendorsProjectsModel` | `vendors_projects` |

**Existing tests:**

- `vendor.ctrl.test.ts`
- `tests/integration/tenant-isolation/vendors.isolation.test.ts`
- `tests/integration/vendors.test.ts`

### 3.7 Model Inventory / MRM

**What it does:** Model inventory, model risk linkage, model history, datasets, and Model Risk Management (MRM) validations, metrics, thresholds, revalidation events, and machine ingestion tokens.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/datasets` | `routes/dataset.route.ts` | `controllers/dataset.ctrl.ts` | 8 | JWT |
| `/api/dataset-change-history` | `routes/datasetChangeHistory.route.ts` | `controllers/datasetChangeHistory.ctrl.ts` | 1 | JWT |
| `/api/modelInventory` | `routes/modelInventory.route.ts` | `controllers/modelInventory.ctrl.ts` | 9 | JWT |
| `/api/model-inventory-change-history` | `routes/modelInventoryChangeHistory.route.ts` | `controllers/modelInventoryChangeHistory.ctrl.ts` | 1 | JWT |
| `/api/modelInventoryHistory` | `routes/modelInventoryHistory.route.ts` | `controllers/modelInventoryHistory.ctrl.ts` | 3 | JWT |
| `/api/modelRisks` | `routes/modelRisk.route.ts` | `controllers/modelRisk.ctrl.ts` | 6 | JWT |
| `/api/model-risk-change-history` | `routes/modelRiskChangeHistory.route.ts` | `controllers/modelRiskChangeHistory.ctrl.ts` | 1 | JWT |
| `/api/mrm` | `routes/mrm.route.ts` | `controllers/mrm.ctrl.ts` | 31 | JWT |
| `/api/mrm` | `routes/mrmIngestion.route.ts` | `../controllers/mrmMonitoring.ctrl` | 1 | ingestion-token |

**Key controllers / services / utils:**

- Controllers: ../controllers/mrmMonitoring.ctrl, controllers/dataset.ctrl.ts, controllers/datasetChangeHistory.ctrl.ts, controllers/modelInventory.ctrl.ts, controllers/modelInventoryChangeHistory.ctrl.ts, controllers/modelInventoryHistory.ctrl.ts, controllers/modelRisk.ctrl.ts, controllers/modelRiskChangeHistory.ctrl.ts, controllers/mrm.ctrl.ts
- Utils: modelInventory.utils.ts, mrm*.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `ModelInventoryModel` | `model_inventories` |
| `ModelRiskModel` | `model_risks` |
| `ModelInventoryHistoryModel` | `model_inventory_history` |
| `ModelInventoryChangeHistoryModel` | `model_inventory_change_history` |
| `DatasetModel` | `datasets` |
| `DatasetModelInventoryModel` | `dataset_model_inventories` |
| `DatasetProjectModel` | `dataset_projects` |
| `MLFlowModelRecordModel` | `mlflow_model_records` |
| `MrmValidationModel` | `mrm_validations` |
| `MrmFindingModel` | `mrm_findings` |
| `MrmMetricKeyModel` | `mrm_metric_keys` |
| `MrmMetricModel` | `mrm_metrics` |
| `MrmMetricEvaluationModel` | `mrm_metric_evaluations` |
| `MrmThresholdModel` | `mrm_thresholds` |
| `MrmModelRoleModel` | `mrm_model_roles` |
| `MrmRevalidationEventModel` | `mrm_revalidation_events` |
| `MrmIngestionTokenModel` | `mrm_ingestion_tokens` |

**Existing tests:**

- `dataset.ctrl.test.ts`
- `mrmMonitoring.breachAlerts.test.ts`
- `tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-findings.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-ingestion-tokens.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-metric-evaluations.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-metric-keys.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-metrics.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-model-roles.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-retention.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-revalidation-events.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-thresholds.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-validations.isolation.test.ts`

### 3.8 Evidence & Files

**What it does:** File upload/download/manager, file change history, virtual folders, evidence hub, and AI-assisted evidence generation.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/evidence-ai` | `routes/evidenceAi.route.ts` | `controllers/evidenceAi.ctrl.ts` | 6 | JWT |
| `/api/evidenceHub` | `routes/evidenceHub.route.ts` | `controllers/evidenceHub.ctrl.ts` | 5 | JWT |
| `/api/files` | `routes/file.route.ts` | `controllers/file.ctrl.ts` | 9 | JWT; JWT, authorize(['Admin', 'Editor', 'Reviewer']); JWT, authorize(['Admin', 'Editor']); JWT, authorize(['Admin']) |
| `/api/file-change-history` | `routes/fileChangeHistory.route.ts` | `controllers/fileChangeHistory.ctrl.ts` | 1 | JWT |
| `/api/file-manager` | `routes/fileManager.route.ts` | `controllers/fileManager.ctrl.ts` | 10 | JWT; JWT, authorize(['Admin', 'Editor', 'Reviewer']) |
| `/api/shares` | `routes/shareLink.route.ts` | `controllers/shareLink.ctrl.ts` | 6 | JWT; public/special |
| `/api/virtual-folders, /api/files` | `routes/virtualFolder.route.ts` | `controllers/virtualFolder.ctrl.ts` | 13 | JWT |

**Key controllers / services / utils:**

- Controllers: controllers/evidenceAi.ctrl.ts, controllers/evidenceHub.ctrl.ts, controllers/file.ctrl.ts, controllers/fileChangeHistory.ctrl.ts, controllers/fileManager.ctrl.ts, controllers/shareLink.ctrl.ts, controllers/virtualFolder.ctrl.ts
- Services: emailService.ts
- Utils: file.utils.ts, evidenceHub.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `FileModel` | `files` |
| `FileManagerModel` | `file_manager` |
| `FileAccessLogModel` | `file_access_logs` |
| `EvidenceHubModel` | `evidence_hub` |
| `VirtualFolderModel` | `virtual_folders` |
| `FileFolderMappingModel` | `file_folder_mappings` |
| `ShareLinkModel` | `share_links` |

**Existing tests:**

- `file.bulk.ctrl.test.ts`
- `file.ctrl.test.ts`
- `fileManager.ctrl.test.ts`
- `tests/integration/tenant-isolation/evidence-hub.isolation.test.ts`
- `tests/integration/tenant-isolation/file-change-history.isolation.test.ts`
- `tests/integration/tenant-isolation/file-entity-links.isolation.test.ts`
- `tests/integration/tenant-isolation/files.isolation.test.ts`

### 3.9 Policy

**What it does:** Policy manager, policy folders, linked objects, policy change history, and AI policy suggestions.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/policies` | `routes/policy.route.ts` | `controllers/policy.ctrl.ts` | 13 | JWT; JWT, authorize(['Admin', 'Editor']) |
| `/api/policy-change-history` | `routes/policyChangeHistory.route.ts` | `controllers/policyChangeHistory.ctrl.ts` | 1 | JWT |
| `/api/policies` | `routes/policyFolder.route.ts` | `controllers/policyFolder.ctrl.ts` | 3 | JWT |
| `/api/policy-linked` | `routes/policyLinkedObjects.route.ts` | `../controllers/policy-linked-objects.ctrl` | 6 | JWT |

**Key controllers / services / utils:**

- Controllers: ../controllers/policy-linked-objects.ctrl, controllers/policy.ctrl.ts, controllers/policyChangeHistory.ctrl.ts, controllers/policyFolder.ctrl.ts
- Utils: policy.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `PolicyManagerModel` | `policy_manager` |
| `PolicyLinkedObjectsModel` | `policy_linked_objects` |

**Existing tests:**

- `policy.bulk.ctrl.test.ts`
- `policy.ctrl.test.ts`

### 3.10 Tasks & Deadlines

**What it does:** Tasks, task assignees, task change history, and deadline summaries.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/deadlines` | `routes/deadline.route.ts` | `controllers/deadline.ctrl.ts` | 1 | JWT |
| `/api/tasks` | `routes/task.route.ts` | `controllers/task.ctrl.ts` | 11 | JWT; JWT, authorize(['Admin', 'Editor']) |
| `/api/task-change-history` | `routes/taskChangeHistory.route.ts` | `controllers/taskChangeHistory.ctrl.ts` | 1 | JWT |

**Key controllers / services / utils:**

- Controllers: controllers/deadline.ctrl.ts, controllers/task.ctrl.ts, controllers/taskChangeHistory.ctrl.ts
- Utils: task.utils.ts, deadline.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `TasksModel` | `tasks` |
| `TaskAssigneesModel` | `task_assignees` |

**Existing tests:**

- `deadline.ctrl.test.ts`
- `task.bulk.ctrl.test.ts`
- `task.ctrl.test.ts`
- `tests/integration/deadline-summary.test.ts`
- `tests/integration/tasks.test.ts`
- `tests/integration/tenant-isolation/tasks.isolation.test.ts`

### 3.11 Training & Trust Centre

**What it does:** Training register, training change history, AI Trust Centre public pages, and AI Trust Index scoring.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/aiTrustCentre` | `routes/aiTrustCentre.route.ts` | `controllers/aiTrustCentre.ctrl.ts` | 15 | JWT; public/special |
| `/api/ai-trust-index` | `routes/aiTrustIndex.route.ts` | `controllers/aiTrustIndex.ctrl.ts` | 8 | JWT |
| `/api/training-change-history` | `routes/trainingChangeHistory.route.ts` | `controllers/trainingChangeHistory.ctrl.ts` | 1 | JWT |
| `/api/training` | `routes/trainingRegistar.route.ts` | `controllers/trainingRegistar.ctrl.ts` | 5 | JWT |

**Key controllers / services / utils:**

- Controllers: controllers/aiTrustCentre.ctrl.ts, controllers/aiTrustIndex.ctrl.ts, controllers/trainingChangeHistory.ctrl.ts, controllers/trainingRegistar.ctrl.ts
- Utils: training.utils.ts, aiTrustCentre*.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `TrainingRegistarModel` | `trainingregistar` |
| `AITrustCenterInfoModel` | `ai_trust_center_info` |
| `AITrustCenterCompanyDescriptionModel` | `ai_trust_center_company_description` |
| `AITrustCenterComplianceBadgesModel` | `ai_trust_center_compliance_badges` |
| `AITrustCenterIntroModel` | `ai_trust_center_intro` |
| `AITrustCenterResourcesModel` | `ai_trust_center_resources` |
| `AITrustCenterSubprocessorsModel` | `ai_trust_center_subprocessors` |
| `AITrustCenterTermsAndContactModel` | `ai_trust_center_terms_and_contact` |
| `AiTrustIndexAppModel` | `ai_trust_index_apps` |
| `AiTrustIndexMetaModel` | `ai_trust_index_meta` |
| `AiTrustIndexSettingsModel` | `ai_trust_index_settings` |
| `AiTrustIndexTrackedAppModel` | `ai_trust_index_tracked_apps` |

**Existing tests:**

- _No dedicated controller/integration tests matched this domain._

### 3.12 AI Features

**What it does:** Advisor/assistant conversations, AI app registry, AI approvals/rules, AI audit trail, AI content review, AI detection (code/repo scans), AI gateway proxy, AI incident management, agent primitive discovery, shadow-AI detection/ingestion, and DeepEval evaluation routes.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/advisor` | `routes/advisor.route.ts` | `controllers/advisor.ctrl.ts` | 12 | JWT |
| `/api/agent-primitives` | `routes/agentDiscovery.route.ts` | `controllers/agentDiscovery.ctrl.ts` | 13 | JWT; JWT, authorize(['Admin']) |
| `/api/ai-apps` | `routes/aiApp.route.ts` | `controllers/aiApp.ctrl.ts` | 11 | JWT; JWT, authorize(['Admin', 'Editor']); JWT, authorize(['Admin']) |
| `/api/ai-approvals` | `routes/aiApproval.route.ts` | `controllers/aiApproval.ctrl.ts` | 5 | JWT; JWT, authorize(['Admin']) |
| `/api/ai-approval-rules` | `routes/aiApprovalRules.route.ts` | `controllers/aiApprovalRules.ctrl.ts` | 5 | JWT |
| `/api/ai-audit` | `routes/aiAudit.route.ts` | `controllers/aiAudit.ctrl.ts` | 4 | JWT; JWT, authorize(['Admin']) |
| `/api/ai-confirmation` | `routes/aiConfirmation.route.ts` | `controllers/aiConfirmation.ctrl.ts` | 3 | JWT; JWT, authorize(['Admin']) |
| `/api/ai-content` | `routes/aiContent.route.ts` | `controllers/aiContent.ctrl.ts` | 4 | JWT; JWT, authorize(['Admin', 'Editor']) |
| `/api/ai-detection` | `routes/aiDetection.route.ts` | `controllers/aiDetection.ctrl.ts` | 23 | JWT, authorize([]) |
| `/api/ai-detection/repositories` | `routes/aiDetectionRepository.route.ts` | `controllers/aiDetectionRepository.ctrl.ts` | 8 | JWT, authorize([]) |
| `?` | `routes/aiEditor.route.ts` | `controllers/aiEditor.ctrl.ts` | 1 | JWT |
| `/api/ai-gateway` | `routes/aiGateway.route.ts` | `controllers/aiGateway.ctrl.ts` | 0 |  |
| `/api/ai-incident-managements` | `routes/aiIncidentManagement.route.ts` | `../controllers/incident-management.ctrl` | 6 | JWT |
| `/api/deepeval` | `routes/deepEvalRoutes.route.ts` | `controllers/deepEvalRoutes.ctrl.ts` | 1 | JWT |
| `/api/evaluation-llm-keys` | `routes/evaluationLlmApiKey.route.ts` | `controllers/evaluationLlmApiKey.ctrl.ts` | 5 | JWT; public/special |
| `/api/shadow-ai` | `routes/shadowAi.route.ts` | `controllers/shadowAi.ctrl.ts` | 27 | JWT |
| `/api/v1/shadow-ai` | `routes/shadowAiIngestion.route.ts` | `controllers/shadowAiIngestion.ctrl.ts` | 1 | public/special |

**Key controllers / services / utils:**

- Controllers: ../controllers/incident-management.ctrl, controllers/advisor.ctrl.ts, controllers/agentDiscovery.ctrl.ts, controllers/aiApp.ctrl.ts, controllers/aiApproval.ctrl.ts, controllers/aiApprovalRules.ctrl.ts, controllers/aiAudit.ctrl.ts, controllers/aiConfirmation.ctrl.ts, controllers/aiContent.ctrl.ts, controllers/aiDetection.ctrl.ts, controllers/aiDetectionRepository.ctrl.ts, controllers/aiEditor.ctrl.ts, controllers/aiGateway.ctrl.ts, controllers/deepEvalRoutes.ctrl.ts, controllers/evaluationLlmApiKey.ctrl.ts, controllers/shadowAi.ctrl.ts, controllers/shadowAiIngestion.ctrl.ts
- Services: aiAuditTrail.service.ts, aiDetection.service.ts, aiDetectionSuppression.service.ts, shadowAiAggregation.service.ts, shadowAiAlertNotification.service.ts, shadowAiModelExtractor.service.ts, shadowAiRiskScoring.service.ts, shadowAiToolMatcher.service.ts
- Utils: ai*.utils.ts, llm*.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `AiAppModel` | `ai_apps` |
| `AiActionApprovalModel` | `ai_action_approvals` |
| `AiApprovalRuleModel` | `ai_approval_rules` |
| `AIIncidentManagementModel` | `ai_incident_managements` |
| `FindingModel` | `ai_detection_findings` |
| `ScanModel` | `ai_detection_scans` |
| `SuppressionModel` | `ai_detection_suppressions` |
| `LLMKeyModel` | `llm_keys` |
| `EvaluationLlmApiKeyModel` | `llm_evals_api_keys` |
| `NotesModel` | `notes` |

**Existing tests:**

- _No dedicated controller/integration tests matched this domain._

### 3.13 Reporting

**What it does:** Reporting engine, report templates, report runs, and scheduled reports with tenant-scoped visibility.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/reporting/runs` | `routes/reportRun.route.ts` | `controllers/reportRun.ctrl.ts` | 7 | JWT; JWT, authorize(['Admin', 'Editor']) |
| `/api/reporting/templates` | `routes/reportTemplate.route.ts` | `controllers/reportTemplate.ctrl.ts` | 6 | JWT; JWT, authorize(['Admin', 'Editor']) |
| `/api/reporting` | `routes/reporting.route.ts` | `controllers/reporting.ctrl.ts` | 5 | JWT; JWT, authorize(['Admin']) |
| `/api/reporting/scheduled-reports` | `routes/scheduledReport.route.ts` | `controllers/scheduledReport.ctrl.ts` | 7 | JWT; JWT, authorize(['Admin', 'Editor']) |

**Key controllers / services / utils:**

- Controllers: controllers/reportRun.ctrl.ts, controllers/reportTemplate.ctrl.ts, controllers/reporting.ctrl.ts, controllers/scheduledReport.ctrl.ts
- Utils: reporting.utils.ts, reportTemplate.utils.ts, reportRun.utils.ts, scheduledReport.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `ReportingModel` | `—` |

**Existing tests:**

- `reporting.ctrl.test.ts`
- `tests/integration/reporting-rls-policies.test.ts`
- `tests/integration/report-run-visibility.test.ts`
- `tests/integration/tenant-isolation/report-runs.isolation.test.ts`
- `tests/integration/tenant-isolation/report-templates.isolation.test.ts`
- `tests/integration/tenant-isolation/scheduled-reports.isolation.test.ts`

### 3.14 Approvals

**What it does:** Configurable approval workflows and approval requests with step-level approvals/auditing.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/approval-requests` | `routes/approvalRequest.route.ts` | `controllers/approvalRequest.ctrl.ts` | 8 | JWT; JWT, authorize(['Admin']) |
| `/api/approval-workflows` | `routes/approvalWorkflow.route.ts` | `controllers/approvalWorkflow.ctrl.ts` | 5 | JWT; JWT, authorize(['Admin']) |

**Key controllers / services / utils:**

- Controllers: controllers/approvalRequest.ctrl.ts, controllers/approvalWorkflow.ctrl.ts
- Utils: approvalWorkflow.utils.ts, approvalRequest.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `ApprovalWorkflowModel` | `approval_workflows` |
| `ApprovalWorkflowStepModel` | `approval_workflow_steps` |
| `ApprovalRequestModel` | `approval_requests` |
| `ApprovalRequestStepModel` | `approval_request_steps` |
| `ApprovalRequestStepApprovalModel` | `approval_request_step_approvals` |
| `ApprovalStepApproversModel` | `approval_step_approvers` |

**Existing tests:**

- `tests/integration/approval-workflows.test.ts`

### 3.15 Governance OS

**What it does:** Governance scenario engine, control mappings, coverage cache, and organization preferences.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/governance-os` | `routes/governanceOs.route.ts` | `controllers/governanceOs.ctrl.ts` | 24 | JWT; JWT, authorize(['Admin', 'Editor']); JWT, authorize(['Admin']) |

**Key controllers / services / utils:**

- Controllers: controllers/governanceOs.ctrl.ts
- Utils: governanceOs.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `GovernanceScenarioModel` | `governance_scenarios` |
| `GovernanceScenarioRuleModel` | `governance_scenario_rules` |
| `GovernanceControlMappingModel` | `governance_control_mappings` |
| `GovernanceOrgPreferencesModel` | `governance_org_preferences` |
| `GovernanceCoverageCacheModel` | `governance_coverage_cache` |
| `GovernanceScenarioActivationModel` | `governance_scenario_activations` |

**Existing tests:**

- `tests/integration/governance-os.cross-tenant.test.ts`

### 3.16 Intake

**What it does:** AI intake form builder and intake submissions with LLM-based risk scoring and email notifications.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/intake` | `routes/intakeForm.route.ts` | `controllers/intakeForm.ctrl.ts` | 23 | JWT; JWT, authorize([]); public/special |

**Key controllers / services / utils:**

- Controllers: controllers/intakeForm.ctrl.ts
- Services: intakeLLM.service.ts, intakeRiskScoring.service.ts, intakeFormEmail.service.ts
- Utils: intakeForm.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `IntakeFormModel` | `intake_forms` |
| `IntakeSubmissionModel` | `intake_submissions` |

**Existing tests:**

- _No dedicated controller/integration tests matched this domain._

### 3.17 Settings / Admin / Platform

**What it does:** Organizations, roles, subscriptions/tiers, feature settings, custom fields, notifications, webhooks, Slack/GitHub integrations, logging, observability, telemetry, search, version, post-market monitoring, CE marking, internal ops, and mail.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/audit-ledger` | `routes/auditLedger.route.ts` | `controllers/auditLedger.ctrl.ts` | 2 | JWT, authorize(['Admin', 'SuperAdmin']); JWT, authorize(['Admin']) |
| `/api/automations` | `routes/automation.route.ts` | `../controllers/automations.ctrl` | 9 | JWT |
| `/api/ce-marking` | `routes/ceMarking.route.ts` | `controllers/ceMarking.ctrl.ts` | 2 | JWT |
| `/api/custom-fields` | `routes/customField.route.ts` | `controllers/customField.ctrl.ts` | 9 | JWT; JWT, authorize(['Admin']) |
| `/api/dashboard` | `routes/dashboard.route.ts` | `controllers/dashboard.ctrl.ts` | 1 | JWT |
| `/api/feature-settings` | `routes/featureSettings.route.ts` | `controllers/featureSettings.ctrl.ts` | 2 | JWT |
| `/api/integrations/github` | `routes/githubIntegration.route.ts` | `../controllers/githubToken.ctrl` | 4 | JWT, authorize([]) |
| `/api/internal` | `routes/internal.route.ts` | `controllers/internal.ctrl.ts` | 2 | public/special |
| `/api/llm-keys` | `routes/llmKey.route.ts` | `controllers/llmKey.ctrl.ts` | 6 | JWT |
| `/api/logger` | `routes/logger.route.ts` | `controllers/logger.ctrl.ts` | 2 | JWT |
| `/api/notes` | `routes/notes.route.ts` | `controllers/notes.ctrl.ts` | 4 | JWT |
| `/api/notifications` | `routes/notification.route.ts` | `controllers/notification.ctrl.ts` | 7 | JWT |
| `/api/observability` | `routes/observability.route.ts` | `controllers/observability.ctrl.ts` | 5 | JWT |
| `/api/organizations` | `routes/organization.route.ts` | `controllers/organization.ctrl.ts` | 6 | JWT, super-admin; JWT, super-admin, authorize(['Admin']); super-admin |
| `/api/pmm` | `routes/postMarketMonitoring.route.ts` | `controllers/postMarketMonitoring.ctrl.ts` | 20 | JWT |
| `/api/search` | `routes/search.route.ts` | `controllers/search.ctrl.ts` | 1 | JWT |
| `/api/slackWebhooks` | `routes/slackWebhook.route.ts` | `controllers/slackWebhook.ctrl.ts` | 6 | JWT |
| `/api/subscriptions` | `routes/subscription.route.ts` | `../controllers/subscriptions.ctrl` | 3 | JWT |
| `/api/telemetry` | `routes/telemetry.route.ts` | `controllers/telemetry.ctrl.ts` | 1 | public/special |
| `/api/tiers` | `routes/tiers.route.ts` | `controllers/tiers.ctrl.ts` | 1 | JWT |
| `/api/version` | `routes/version.route.ts` | `controllers/version.ctrl.ts` | 1 | public/special |
| `/v1` | `routes/virtualKeyProxy.route.ts` | `controllers/virtualKeyProxy.ctrl.ts` | 0 |  |
| `/api/mail` | `routes/vwmailer.route.ts` | `controllers/vwmailer.ctrl.ts` | 2 | JWT; public/special |
| `/api/webhooks` | `routes/webhook.route.ts` | `controllers/webhook.ctrl.ts` | 1 | public/special |

**Key controllers / services / utils:**

- Controllers: ../controllers/automations.ctrl, ../controllers/githubToken.ctrl, ../controllers/subscriptions.ctrl, controllers/auditLedger.ctrl.ts, controllers/ceMarking.ctrl.ts, controllers/customField.ctrl.ts, controllers/dashboard.ctrl.ts, controllers/featureSettings.ctrl.ts, controllers/internal.ctrl.ts, controllers/llmKey.ctrl.ts, controllers/logger.ctrl.ts, controllers/notes.ctrl.ts, controllers/notification.ctrl.ts, controllers/observability.ctrl.ts, controllers/organization.ctrl.ts, controllers/postMarketMonitoring.ctrl.ts, controllers/search.ctrl.ts, controllers/slackWebhook.ctrl.ts, controllers/telemetry.ctrl.ts, controllers/tiers.ctrl.ts, controllers/version.ctrl.ts, controllers/virtualKeyProxy.ctrl.ts, controllers/vwmailer.ctrl.ts, controllers/webhook.ctrl.ts
- Services: notification.service.ts, notificationService.ts, notificationSubscriber.service.ts, inAppNotification.service.ts, webhook.service.ts, emailService.ts, proactiveNotify.ts
- Utils: organization.utils.ts, subscription.utils.ts, featureSettings.utils.ts, customField.utils.ts, logger/*, observability/*

**Key models:**

| Model | Table |
|---|---|
| `OrganizationModel` | `organizations` |
| `TiersModel` | `tiers` |
| `SubscriptionModel` | `subscriptions` |
| `SlackWebhookModel` | `slack_webhooks` |
| `GitHubTokenModel` | `github_tokens` |
| `AutomationModel` | `automations` |
| `AutomationActionModel` | `automation_actions` |
| `AutomationTriggerModel` | `automation_triggers` |
| `AutomationTriggerActionModel` | `automation_triggers_actions` |
| `AutomationExecutionLogModel` | `automation_execution_logs` |
| `TokenModel` | `tokens` |
| `ShareLinkModel` | `share_links` |
| `SSOConfigurationModel` | `sso_configurations` |
| `UserPreferencesModel` | `user_preferences` |
| `NotesModel` | `notes` |
| `PMMConfigModel` | `post_market_monitoring_configs` |
| `PMMCycleModel` | `post_market_monitoring_cycles` |
| `PMMQuestionModel` | `post_market_monitoring_questions` |
| `PMMReportModel` | `post_market_monitoring_reports` |
| `PMMResponseModel` | `post_market_monitoring_responses` |

**Existing tests:**

- `automations.ctrl.test.ts`
- `dashboard.ctrl.test.ts`
- `observability.ctrl.test.ts`
- `organization.ctrl.test.ts`
- `webhook.ctrl.test.ts`
- `tests/integration/tenant-isolation/audit-ledger.isolation.test.ts`

### 3.18 Extensions

**What it does:** Extension catalog enable/disable/configuration and per-extension routes for Slack, MLflow, Azure AI Foundry, JIRA Assets, dataset bulk upload, risk import, and model lifecycle.

| Base Path | Route File | Controller File | Endpoint Count | Auth Patterns |
|---|---|---|---|---|
| `/api/extensions/azure-ai-foundry` | `extensions/azure-ai-foundry/azureAiFoundry.route.ts` | `extensions/azure-ai-foundry/azureAiFoundry.ctrl.ts` | 4 | JWT, extension:azure-ai-foundry |
| `/api/extensions/dataset-bulk-upload` | `extensions/dataset-bulk-upload/datasetBulkUpload.route.ts` | `extensions/dataset-bulk-upload/datasetBulkUpload.ctrl.ts` | 1 | JWT, authorize(['Admin', 'Editor']), extension:dataset-bulk-upload |
| `/api/extensions/jira-assets` | `extensions/jira-assets/jiraAssets.route.ts` | `extensions/jira-assets/jiraAssets.ctrl.ts` | 15 | JWT, extension:jira-assets |
| `/api/extensions/mlflow` | `extensions/mlflow/mlflow.route.ts` | `extensions/mlflow/mlflow.ctrl.ts` | 3 | JWT, extension:mlflow |
| `/api/extensions/model-lifecycle` | `extensions/model-lifecycle/modelLifecycle.route.ts` | `extensions/model-lifecycle/modelLifecycle.ctrl.ts` | 19 | JWT, extension:model-lifecycle |
| `/api/extensions/risk-import` | `extensions/risk-import/riskImport.route.ts` | `extensions/risk-import/riskImport.ctrl.ts` | 2 | JWT, authorize(['Admin', 'Editor']), extension:risk-import |
| `/api/extensions/slack` | `extensions/slack/slack.route.ts` | `../../controllers/slackWebhook.ctrl` | 6 | JWT, extension:slack |
| `/api/extensions` | `routes/extension.route.ts` | `controllers/extension.ctrl.ts` | 6 | JWT; JWT, authorize(['Admin']) |

**Key controllers / services / utils:**

- Controllers: ../../controllers/slackWebhook.ctrl, controllers/extension.ctrl.ts, extensions/azure-ai-foundry/azureAiFoundry.ctrl.ts, extensions/dataset-bulk-upload/datasetBulkUpload.ctrl.ts, extensions/jira-assets/jiraAssets.ctrl.ts, extensions/mlflow/mlflow.ctrl.ts, extensions/model-lifecycle/modelLifecycle.ctrl.ts, extensions/risk-import/riskImport.ctrl.ts
- Services: mlflow.service.ts, azureAiFoundry.service.ts, jiraAssets.service.ts, riskImport.service.ts, modelLifecycle.service.ts
- Utils: extension.utils.ts

**Key models:**

| Model | Table |
|---|---|
| `ExtensionModel` | `—` |
| `ExtensionEnablementModel` | `—` |
| `ExtensionConfigFieldModel` | `—` |
| `MLFlowIntegrationModel` | `mlflow_integrations` |
| `MLFlowModelRecordModel` | `mlflow_model_records` |

**Existing tests:**

- _No dedicated controller/integration tests matched this domain._

---

## 4. Database Models Index

Major models registered in `database/db.ts`, grouped by functional domain. The full model list contains additional framework-specific struct/junction tables.

### 4.1 Auth & Users

| Model | Table |
|---|---|
| `UserModel` | `users` |
| `RoleModel` | `roles` |
| `SSOConfigurationModel` | `sso_configurations` |
| `TokenModel` | `tokens` |
| `ProjectModel` | `projects` |
| `OrganizationModel` | `organizations` |
| `UserPreferencesModel` | `user_preferences` |

### 4.2 Project & Use Case

| Model | Table |
|---|---|
| `ProjectModel` | `projects` |
| `ProjectScopeModel` | `project_scopes` |
| `ProjectsMembersModel` | `project_members` |
| `ProjectFrameworksModel` | `projects_frameworks` |
| `QuestionModel` | `questions` |
| `AssessmentModel` | `assessments` |
| `EntityGraphViewsModel` | `entity_graph_views` |
| `EntityGraphAnnotationsModel` | `entity_graph_annotations` |
| `EntityGraphGapRulesModel` | `entity_graph_gap_rules` |

### 4.3 Assessment & Compliance

| Model | Table |
|---|---|
| `AssessmentModel` | `assessments` |
| `FrameworkModel` | `frameworks` |
| `ProjectFrameworksModel` | `projects_frameworks` |
| `ControlModel` | `controls` |
| `ControlCategoryModel` | `control_categories` |
| `SubcontrolModel` | `subcontrols` |
| `TopicModel` | `topics` |
| `SubtopicModel` | `subtopics` |
| `QuestionModel` | `questions` |
| `AssessmentEUModel` | `assessments` |
| `ControlEUModel` | `controls_eu` |
| `SubcontrolEUModel` | `subcontrols_eu` |
| `AnnexCategoryISOModel` | `annexcategory_iso` |
| `SubClauseISOModel` | `subclauses_iso` |
| `ISO27001SubClauseModel` | `subclauses_iso27001` |
| `ISO27001AnnexControlModel` | `annexcontrols_iso27001` |
| `NISTAIMRFCategoryModel` | `nist_ai_rmf_categories_struct` |
| `NISTAIMRFSubcategoryModel` | `nist_ai_rmf_subcategories` |
| `FriaAssessmentModel` | `fria_assessments` |
| `FriaSnapshotModel` | `fria_snapshots` |

### 4.4 Risk Management

| Model | Table |
|---|---|
| `RiskModel` | `project_risks` |
| `RiskHistoryModel` | `risk_history` |
| `VendorRiskModel` | `vendor_risks` |
| `RiskBenchmark?` | `risk_benchmarks` |

### 4.5 Vendor Management

| Model | Table |
|---|---|
| `VendorModel` | `vendors` |
| `VendorRiskModel` | `vendor_risks` |
| `VendorsProjectsModel` | `vendors_projects` |

### 4.6 Model Inventory / MRM

| Model | Table |
|---|---|
| `ModelInventoryModel` | `model_inventories` |
| `ModelRiskModel` | `model_risks` |
| `ModelInventoryHistoryModel` | `model_inventory_history` |
| `ModelInventoryChangeHistoryModel` | `model_inventory_change_history` |
| `DatasetModel` | `datasets` |
| `DatasetModelInventoryModel` | `dataset_model_inventories` |
| `DatasetProjectModel` | `dataset_projects` |
| `MLFlowModelRecordModel` | `mlflow_model_records` |
| `MrmValidationModel` | `mrm_validations` |
| `MrmFindingModel` | `mrm_findings` |
| `MrmMetricKeyModel` | `mrm_metric_keys` |
| `MrmMetricModel` | `mrm_metrics` |
| `MrmMetricEvaluationModel` | `mrm_metric_evaluations` |
| `MrmThresholdModel` | `mrm_thresholds` |
| `MrmModelRoleModel` | `mrm_model_roles` |
| `MrmRevalidationEventModel` | `mrm_revalidation_events` |
| `MrmIngestionTokenModel` | `mrm_ingestion_tokens` |

### 4.7 Evidence & Files

| Model | Table |
|---|---|
| `FileModel` | `files` |
| `FileManagerModel` | `file_manager` |
| `FileAccessLogModel` | `file_access_logs` |
| `EvidenceHubModel` | `evidence_hub` |
| `VirtualFolderModel` | `virtual_folders` |
| `FileFolderMappingModel` | `file_folder_mappings` |
| `ShareLinkModel` | `share_links` |

### 4.8 Policy

| Model | Table |
|---|---|
| `PolicyManagerModel` | `policy_manager` |
| `PolicyLinkedObjectsModel` | `policy_linked_objects` |

### 4.9 Tasks & Deadlines

| Model | Table |
|---|---|
| `TasksModel` | `tasks` |
| `TaskAssigneesModel` | `task_assignees` |

### 4.10 Training & Trust Centre

| Model | Table |
|---|---|
| `TrainingRegistarModel` | `trainingregistar` |
| `AITrustCenterInfoModel` | `ai_trust_center_info` |
| `AITrustCenterCompanyDescriptionModel` | `ai_trust_center_company_description` |
| `AITrustCenterComplianceBadgesModel` | `ai_trust_center_compliance_badges` |
| `AITrustCenterIntroModel` | `ai_trust_center_intro` |
| `AITrustCenterResourcesModel` | `ai_trust_center_resources` |
| `AITrustCenterSubprocessorsModel` | `ai_trust_center_subprocessors` |
| `AITrustCenterTermsAndContactModel` | `ai_trust_center_terms_and_contact` |
| `AiTrustIndexAppModel` | `ai_trust_index_apps` |
| `AiTrustIndexMetaModel` | `ai_trust_index_meta` |
| `AiTrustIndexSettingsModel` | `ai_trust_index_settings` |
| `AiTrustIndexTrackedAppModel` | `ai_trust_index_tracked_apps` |

### 4.11 AI Features

| Model | Table |
|---|---|
| `AiAppModel` | `ai_apps` |
| `AiActionApprovalModel` | `ai_action_approvals` |
| `AiApprovalRuleModel` | `ai_approval_rules` |
| `AIIncidentManagementModel` | `ai_incident_managements` |
| `FindingModel` | `ai_detection_findings` |
| `ScanModel` | `ai_detection_scans` |
| `SuppressionModel` | `ai_detection_suppressions` |
| `LLMKeyModel` | `llm_keys` |
| `EvaluationLlmApiKeyModel` | `llm_evals_api_keys` |
| `NotesModel` | `notes` |

### 4.12 Reporting

| Model | Table |
|---|---|
| `ReportingModel` | `—` |

### 4.13 Approvals

| Model | Table |
|---|---|
| `ApprovalWorkflowModel` | `approval_workflows` |
| `ApprovalWorkflowStepModel` | `approval_workflow_steps` |
| `ApprovalRequestModel` | `approval_requests` |
| `ApprovalRequestStepModel` | `approval_request_steps` |
| `ApprovalRequestStepApprovalModel` | `approval_request_step_approvals` |
| `ApprovalStepApproversModel` | `approval_step_approvers` |

### 4.14 Governance OS

| Model | Table |
|---|---|
| `GovernanceScenarioModel` | `governance_scenarios` |
| `GovernanceScenarioRuleModel` | `governance_scenario_rules` |
| `GovernanceControlMappingModel` | `governance_control_mappings` |
| `GovernanceOrgPreferencesModel` | `governance_org_preferences` |
| `GovernanceCoverageCacheModel` | `governance_coverage_cache` |
| `GovernanceScenarioActivationModel` | `governance_scenario_activations` |

### 4.15 Intake

| Model | Table |
|---|---|
| `IntakeFormModel` | `intake_forms` |
| `IntakeSubmissionModel` | `intake_submissions` |

### 4.16 Settings / Admin / Platform

| Model | Table |
|---|---|
| `OrganizationModel` | `organizations` |
| `TiersModel` | `tiers` |
| `SubscriptionModel` | `subscriptions` |
| `SlackWebhookModel` | `slack_webhooks` |
| `GitHubTokenModel` | `github_tokens` |
| `AutomationModel` | `automations` |
| `AutomationActionModel` | `automation_actions` |
| `AutomationTriggerModel` | `automation_triggers` |
| `AutomationTriggerActionModel` | `automation_triggers_actions` |
| `AutomationExecutionLogModel` | `automation_execution_logs` |
| `TokenModel` | `tokens` |
| `ShareLinkModel` | `share_links` |
| `SSOConfigurationModel` | `sso_configurations` |
| `UserPreferencesModel` | `user_preferences` |
| `NotesModel` | `notes` |
| `PMMConfigModel` | `post_market_monitoring_configs` |
| `PMMCycleModel` | `post_market_monitoring_cycles` |
| `PMMQuestionModel` | `post_market_monitoring_questions` |
| `PMMReportModel` | `post_market_monitoring_reports` |
| `PMMResponseModel` | `post_market_monitoring_responses` |

### 4.17 Super Admin

| Model | Table |
|---|---|
| `OrganizationModel` | `organizations` |
| `UserModel` | `users` |
| `RoleModel` | `roles` |

### 4.18 Extensions

| Model | Table |
|---|---|
| `ExtensionModel` | `—` |
| `ExtensionEnablementModel` | `—` |
| `ExtensionConfigFieldModel` | `—` |
| `MLFlowIntegrationModel` | `mlflow_integrations` |
| `MLFlowModelRecordModel` | `mlflow_model_records` |

---

## 5. Auth / Authorization Patterns

### 5.1 JWT Session Tokens

- Access tokens are sent as `Authorization: Bearer <token>` headers.
- `auth.middleware.ts` verifies the JWT signature, expiration, payload structure (`id`, `roleName`, `organizationId`), org membership, and role consistency.
- It populates `req.userId`, `req.role`, `req.organizationId`, `req.tenantHash`, and `req.isSuperAdmin`.
- Test bypass is supported when `NODE_ENV=test` and `req.testBypassAuth === true`.

### 5.2 Refresh Tokens & Cookies

- `POST /api/users/refresh-token` exchanges a refresh-token cookie for a new access token (`tokenRefreshLimiter`).
- `POST /api/users/logout` revokes the refresh token server-side and clears the cookie.

### 5.3 API Tokens

- `tokens.route.ts` exposes CRUD for organization API tokens.
- Tokens are signed JWTs carrying `type: "api_token"` and a SHA-256 hash stored in the `tokens` table.
- `authenticateJWT` checks the active hash before allowing access and updates `last_used_at`.
- `tokens.middleware.ts` enforces a 10-token limit and Admin-only creation/deletion.

### 5.4 RBAC Roles

- Standard roles: `Admin`, `Editor`, `Reviewer`, `Auditor`.
- `authorize([roles])` blocks requests whose `req.role` is not in the allowed list.
- Role names are resolved live from the `roles` table (cached, invalidated on role CRUD).

### 5.5 Super Admin

- A `users` row with `role_id IS NULL` and `organization_id IS NULL` is a pure SuperAdmin.
- `superAdminOnly.middleware.ts` requires `req.isSuperAdmin === true`.
- `superAdmin.route.ts` is mounted at `/api/super-admin` and provides org/user/monitoring/SuperAdmin membership management.

### 5.6 Multi-Tenancy & RLS

- Shared-schema multi-tenancy: every tenant row carries `organization_id`.
- `multiTenancy.middleware.ts` gates organization creation based on `MULTI_TENANCY_ENABLED` and licensing.
- RLS Phase 1 policies exist in the database; RLS Phase 2 runtime enforcement is flag-gated via `RLS_ENFORCEMENT_ENABLED`.
- When enabled, `rlsEnforcement` creates a per-request transaction and runs `SET LOCAL app.current_org = :orgId`; `enableRlsQueryScoping` routes sequelize queries through that transaction.
- Tenant-isolation integration tests cover projects, users, vendors, assessments, controls, files, evidence hub, MRM, reports, tasks, audit ledger, etc.

---

## 6. Extensions Catalog

The extension system lives in `Servers/extensions/` and is gated by `requireExtensionEnabled(key)`. The generic `/api/extensions` catalog router must be mounted before per-extension routers so catalog endpoints are not shadowed.

### 6.1 Generic Extension Management

| Base | Route | Controller | Operations |
|---|---|---|---|
| `/api/extensions` | `routes/extension.route.ts` | `controllers/extension.ctrl.ts` | List, get, enable, disable, configure, test-connection |

### 6.2 Per-Extension Routes

| Extension | Base Path | Route File | Controller | Key Operations | Auth / Gate |
|---|---|---|---|---|---|
| Slack | /api/extensions/slack | extensions/slack/slack.route.ts | controllers/slackWebhook.ctrl.ts | OAuth workspaces, send message | JWT + extension:slack |
| MLflow | /api/extensions/mlflow | extensions/mlflow/mlflow.route.ts | extensions/mlflow/mlflow.ctrl.ts | List/sync MLflow models | JWT + extension:mlflow |
| Azure AI Foundry | /api/extensions/azure-ai-foundry | extensions/azure-ai-foundry/azureAiFoundry.route.ts | extensions/azure-ai-foundry/azureAiFoundry.ctrl.ts | List/sync Azure deployments, discover agents | JWT + extension:azure-ai-foundry |
| JIRA Assets | /api/extensions/jira-assets | extensions/jira-assets/jiraAssets.route.ts | extensions/jira-assets/jiraAssets.ctrl.ts | Config, schema discovery, import/sync, use cases | JWT + extension:jira-assets |
| Dataset Bulk Upload | /api/extensions/dataset-bulk-upload | extensions/dataset-bulk-upload/datasetBulkUpload.route.ts | extensions/dataset-bulk-upload/datasetBulkUpload.ctrl.ts | Upload CSV/XLSX to create datasets | JWT + extension:dataset-bulk-upload + Admin/Editor |
| Risk Import | /api/extensions/risk-import | extensions/risk-import/riskImport.route.ts | extensions/risk-import/riskImport.ctrl.ts | Download template, bulk import risks | JWT + extension:risk-import + Admin/Editor |
| Model Lifecycle | /api/extensions/model-lifecycle | extensions/model-lifecycle/modelLifecycle.route.ts | extensions/model-lifecycle/modelLifecycle.ctrl.ts | Lifecycle phases/items, approvals, people, files, progress | JWT + extension:model-lifecycle |

### 6.3 Extension Services

| Service | Purpose |
|---|---|
| `extensions/mlflow/mlflow.service.ts` | MLflow API client + model sync |
| `extensions/azure-ai-foundry/azureAiFoundry.service.ts` | Azure AI Foundry deployment discovery |
| `extensions/jira-assets/jiraAssets.service.ts` | JIRA Assets object-type/schema import |
| `extensions/risk-import/riskImport.service.ts` | Excel template + risk bulk insert |
| `extensions/model-lifecycle/modelLifecycle.service.ts` | Lifecycle config/value/approval logic |

---

## 7. Test Commands

Scripts are defined in `Servers/package.json`. Tests are run from the `Servers/` directory.

| Command | What it runs |
|---|---|
| `npm run test:unit` | Jest excluding `tests/integration/` and `helpers/`; alias for `npm test` |
| `npm run test:coverage` | Unit tests with coverage report |
| `npm run test:integration` | Integration tests with global setup, `--runInBand` |
| `npm run test:smoke` | Smoke test (`deadline-summary`) with global setup |
| `npm run test:watch` | Jest in watch mode |

### Controller unit tests (`controllers/__tests__`)

- `aiApp.ctrl.test.ts`
- `aiConfirmation.route.test.ts`
- `aiTrustCentre.ctrl.test.ts`
- `aiTrustIndex.ctrl.test.ts`
- `approvalRequest.ctrl.test.ts`
- `assessment.ctrl.test.ts`
- `automations.ctrl.test.ts`
- `compliance.ctrl.test.ts`
- `dashboard.ctrl.test.ts`
- `dataset.ctrl.test.ts`
- `deadline.ctrl.test.ts`
- `evidenceAi.ctrl.test.ts`
- `file.bulk.ctrl.test.ts`
- `file.ctrl.test.ts`
- `fileManager.ctrl.test.ts`
- `framework.ctrl.test.ts`
- `invitation.ctrl.test.ts`
- `modelInventory.ctrl.test.ts`
- `mrmMonitoring.breachAlerts.test.ts`
- `observability.ctrl.test.ts`
- `organization.ctrl.test.ts`
- `policy.bulk.ctrl.test.ts`
- `policy.ctrl.test.ts`
- `postMarketMonitoring.ctrl.test.ts`
- `project.ctrl.test.ts`
- `readiness.ctrl.test.ts`
- `reporting.ctrl.test.ts`
- `reportRun.ctrl.test.ts`
- `reportTemplate.ctrl.test.ts`
- `reportTemplateRun.ctrl.test.ts`
- `risks.bulk.ctrl.test.ts`
- `risks.ctrl.test.ts`
- `role.ctrl.test.ts`
- `scheduledReport.ctrl.test.ts`
- `shadowAi.ctrl.test.ts`
- `task.bulk.ctrl.test.ts`
- `task.ctrl.test.ts`
- `user.ctrl.test.ts`
- `vendor.ctrl.test.ts`
- `webhook.ctrl.test.ts`

### Middleware unit tests (`middleware/__tests__`)

- `accessControl.middleware.test.ts`
- `aiContentTracker.middleware.test.ts`
- `auth.middleware.test.ts`
- `context.middleware.test.ts`
- `csrf.middleware.test.ts`
- `i18n.middleware.test.ts`
- `multiTenancy.middleware.test.ts`
- `rateLimit.middleware.test.ts`
- `register.middleware.test.ts`
- `requireExtensionEnabled.middleware.test.ts`
- `resetPassword.middleware.test.ts`
- `rls.middleware.test.ts`
- `selfOnly.middleware.test.ts`
- `superAdminOnly.middleware.test.ts`
- `tokens.middleware.test.ts`
- `validate.middleware.test.ts`
- `validateAITrustCentreVisibility.middleware.test.ts`

### Integration / tenant-isolation tests

- `tests/__tests__/testDatabaseGuard.test.ts`
- `tests/integration/approval-workflows.test.ts`
- `tests/integration/deadline-summary.test.ts`
- `tests/integration/framework-gap-workflow.test.ts`
- `tests/integration/governance-os.cross-tenant.test.ts`
- `tests/integration/login.test.ts`
- `tests/integration/projects.test.ts`
- `tests/integration/reporting-rls-policies.test.ts`
- `tests/integration/report-run-visibility.test.ts`
- `tests/integration/report-scope-authorization.test.ts`
- `tests/integration/report-scope-membership.test.ts`
- `tests/integration/tasks.test.ts`
- `tests/integration/tenant-isolation/assessments.isolation.test.ts`
- `tests/integration/tenant-isolation/audit-ledger.isolation.test.ts`
- `tests/integration/tenant-isolation/controls-eu.isolation.test.ts`
- `tests/integration/tenant-isolation/event-logs.isolation.test.ts`
- `tests/integration/tenant-isolation/evidence-hub.isolation.test.ts`
- `tests/integration/tenant-isolation/file-change-history.isolation.test.ts`
- `tests/integration/tenant-isolation/file-entity-links.isolation.test.ts`
- `tests/integration/tenant-isolation/files.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-alerts.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-findings.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-ingestion-tokens.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-metric-evaluations.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-metric-keys.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-metrics.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-model-roles.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-retention.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-revalidation-events.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-thresholds.isolation.test.ts`
- `tests/integration/tenant-isolation/mrm-validations.isolation.test.ts`
- `tests/integration/tenant-isolation/projects.isolation.test.ts`
- `tests/integration/tenant-isolation/projects-frameworks.isolation.test.ts`
- `tests/integration/tenant-isolation/report-runs.isolation.test.ts`
- `tests/integration/tenant-isolation/report-templates.isolation.test.ts`
- `tests/integration/tenant-isolation/risks.isolation.test.ts`
- `tests/integration/tenant-isolation/scheduled-reports.isolation.test.ts`
- `tests/integration/tenant-isolation/tasks.isolation.test.ts`
- `tests/integration/tenant-isolation/users.isolation.test.ts`
- `tests/integration/tenant-isolation/vendors.isolation.test.ts`
- `tests/integration/user-deletion-fks.test.ts`
- `tests/integration/vendors.test.ts`
- `tests/integration/workflow-approval-gate.test.ts`
- `tests/integration/workflow-audit-log.test.ts`

---

## 8. Notes & Caveats

- `routes/aiEditor.route.ts` exists in the codebase but is **not currently mounted** in `app.ts` (base path `?` in the inventory above).
- Several route modules share a base path (e.g., `/api/frameworks`, `/api/policies`, `/api/mrm`, `/api/files`, `/api/extensions`), so endpoint ordering matters.
- RLS Phase 2 is off by default; the application relies on `organization_id` filtering at the controller/repository layer, with an extensive tenant-isolation test suite to catch cross-tenant regressions.
- The `internal.route.ts` and `/api/internal` surface, plus `/api/telemetry` and `/v1` virtual-key proxy, are intended for internal/platform use and may bypass some user-auth assumptions.
