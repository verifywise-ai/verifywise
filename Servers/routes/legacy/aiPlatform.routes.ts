/**
 * Legacy API registration — AI platform, extensions, and integrations.
 *
 * Legacy surface (ADR 0001): these unversioned mounts are frozen; bug fixes
 * only. New endpoints go to routes/v1/. Mounts are listed in the exact order
 * they had in app.ts before the decomposition.
 */
import express from "express";
import extensionRoutes from "../extension.route";
import extensionRunsRoutes from "../extensionRuns.route";
import datasetBulkUploadRoutes from "../../extensions/dataset-bulk-upload/datasetBulkUpload.route";
import riskImportRoutes from "../../extensions/risk-import/riskImport.route";
import slackExtensionRoutes from "../../extensions/slack/slack.route";
import mlflowExtensionRoutes from "../../extensions/mlflow/mlflow.route";
import azureAiFoundryExtensionRoutes from "../../extensions/azure-ai-foundry/azureAiFoundry.route";
import jiraAssetsExtensionRoutes from "../../extensions/jira-assets/jiraAssets.route";
import jiraIncidentsExtensionRoutes from "../../extensions/jira-incidents/jiraIncidents.route";
import modelLifecycleExtensionRoutes from "../../extensions/model-lifecycle/modelLifecycle.route";
import slackWebhookRoutes from "../slackWebhook.route";
import llmKeyRouter from "../llmKey.route";
import aiContentRoutes from "../aiContent.route";
import aiConfirmationRoutes from "../aiConfirmation.route";
import aiApprovalRoutes from "../aiApproval.route";
import aiApprovalRulesRoutes from "../aiApprovalRules.route";
import aiAppRoutes from "../aiApp.route";
import aiAuditRoutes from "../aiAudit.route";
import observabilityRouter from "../observability.route";
import deepEvalRoutes from "../deepEvalRoutes.route";
import evaluationLlmApiKeyRoutes from "../evaluationLlmApiKey.route";
import aiDetectionRoutes from "../aiDetection.route";
import aiDetectionRepositoryRoutes from "../aiDetectionRepository.route";
import githubIntegrationRoutes from "../githubIntegration.route";
import shadowAiRoutes from "../shadowAi.route";
import agentDiscoveryRoutes from "../agentDiscovery.route";
import aiGatewayRoutes from "../aiGateway.route";
import customFieldRoutes from "../customField.route";
import mcpRoutes from "../mcp.route";
import internalRoutes from "../internal.route";

export function registerAiPlatformRoutes(app: express.Application): void {
  // The generic /api/extensions catalog router MUST be mounted BEFORE the
  // per-extension routers below. Express matches app.use() prefixes in
  // registration order, and a per-extension mount (e.g. /api/extensions/slack)
  // would otherwise swallow catalog requests like GET /api/extensions/slack
  // and 403 via requireExtensionEnabled — even when the caller just wants
  // the catalog detail. Generic routes here are /, /:key, /:key/enable,
  // /:key/disable, /:key/configuration; none collide with per-extension
  // sub-paths (which all use multi-segment paths like /oauth/workspaces,
  // /models, /config, /import, /sync, /use-cases, etc.).
  app.use("/api/extensions", extensionRoutes);
  // Sync engine routes (/:key/runs, /:key/runs/status, /:key/schedule). A key
  // without a sync provider falls through to the per-extension routers below.
  app.use("/api/extensions", extensionRunsRoutes);
  app.use("/api/extensions/dataset-bulk-upload", datasetBulkUploadRoutes);
  app.use("/api/extensions/risk-import", riskImportRoutes);
  app.use("/api/extensions/slack", slackExtensionRoutes);
  app.use("/api/extensions/mlflow", mlflowExtensionRoutes);
  app.use("/api/extensions/azure-ai-foundry", azureAiFoundryExtensionRoutes);
  app.use("/api/extensions/jira-assets", jiraAssetsExtensionRoutes);
  app.use("/api/extensions/jira-incidents", jiraIncidentsExtensionRoutes);
  app.use("/api/extensions/model-lifecycle", modelLifecycleExtensionRoutes);
  app.use("/api/slackWebhooks", slackWebhookRoutes);
  app.use("/api/llm-keys", llmKeyRouter);
  app.use("/api/ai-content", aiContentRoutes);
  app.use("/api/ai-confirmation", aiConfirmationRoutes);
  app.use("/api/ai-approvals", aiApprovalRoutes);
  app.use("/api/ai-approval-rules", aiApprovalRulesRoutes);
  app.use("/api/ai-apps", aiAppRoutes);
  app.use("/api/ai-audit", aiAuditRoutes);
  app.use("/api/observability", observabilityRouter);
  app.use("/api/deepeval", deepEvalRoutes());
  app.use("/api/evaluation-llm-keys", evaluationLlmApiKeyRoutes);
  // /api/ai-detection must precede its nested /repositories mount.
  app.use("/api/ai-detection", aiDetectionRoutes);
  app.use("/api/ai-detection/repositories", aiDetectionRepositoryRoutes);
  app.use("/api/integrations/github", githubIntegrationRoutes);
  app.use("/api/shadow-ai", shadowAiRoutes);
  app.use("/api/agent-primitives", agentDiscoveryRoutes);
  app.use("/api/ai-gateway", aiGatewayRoutes());
  app.use("/api/custom-fields", customFieldRoutes);
  app.use("/api/mcp", mcpRoutes);
  app.use("/api/internal", internalRoutes);
}
