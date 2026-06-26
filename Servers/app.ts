import express, { RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import assessmentRoutes from "./routes/assessment.route";
import projectRoutes from "./routes/project.route";
import risksRoutes from "./routes/risks.route";
import questionRoutes from "./routes/question.route";
import userRoutes from "./routes/user.route";
import vendorRoutes from "./routes/vendor.route";
import vendorRiskRoutes from "./routes/vendorRisk.route";
import vendorChangeHistoryRoutes from "./routes/vendorChangeHistory.route";
import roleRoutes from "./routes/role.route";
import fileRoutes from "./routes/file.route";
import mailRoutes from "./routes/vwmailer.route";
import euRouter from "./routes/eu.route";
import reportRoutes from "./routes/reporting.route";
import frameworks from "./routes/frameworks.route";
import organizationRoutes from "./routes/organization.route";
import isoRoutes from "./routes/iso42001.route";
import trainingRoutes from "./routes/trainingRegistar.route";
import aiTrustCentreRoutes from "./routes/aiTrustCentre.route";
import policyRoutes from "./routes/policy.route";
import policyFolderRoutes from "./routes/policyFolder.route";
import loggerRoutes from "./routes/logger.route";
import dashboardRoutes from "./routes/dashboard.route";
import iso27001Routes from "./routes/iso27001.route";
import modelInventoryRoutes from "./routes/modelInventory.route";
import modelInventoryHistoryRoutes from "./routes/modelInventoryHistory.route";
import modelInventoryChangeHistoryRoutes from "./routes/modelInventoryChangeHistory.route";
import datasetBulkUploadRoutes from "./routes/datasetBulkUpload.route";
import datasetRoutes from "./routes/dataset.route";
import riskHistoryRoutes from "./routes/riskHistory.route";
import modelRiskRoutes from "./routes/modelRisk.route";
import tiersRoutes from "./routes/tiers.route";
import subscriptionRoutes from "./routes/subscription.route";
import autoDriverRoutes from "./routes/autoDriver.route";
import taskRoutes from "./routes/task.route";
import deadlineRoutes from "./routes/deadline.route";
import slackWebhookRoutes from "./routes/slackWebhook.route";
import pluginRoutes from "./routes/plugin.route";
import tokenRoutes from "./routes/tokens.route";
import shareLinkRoutes from "./routes/shareLink.route";
import automation from "./routes/automation.route.js";
import fileManagerRoutes from "./routes/fileManager.route";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import aiIncidentRouter from "./routes/aiIncidentManagement.route";
import userPreferenceRouter from "./routes/userPreference.route";
import llmKeyRouter from "./routes/llmKey.route";
import nistAiRmfRoutes from "./routes/nist_ai_rmf.route";
import evidenceHubRouter from "./routes/evidenceHub.route";
import ceMarkingRoutes from "./routes/ceMarking.route";
import advisorRouter from "./routes/advisor.route";
import searchRoutes from "./routes/search.route";
import deepEvalRoutes from "./routes/deepEvalRoutes.route";
import evaluationLlmApiKeyRoutes from "./routes/evaluationLlmApiKey.route";
import notesRoutes from "./routes/notes.route";
import entityGraphRoutes from "./routes/entityGraph.route";
import vendorRiskChangeHistoryRoutes from "./routes/vendorRiskChangeHistory.route";
import policyChangeHistoryRoutes from "./routes/policyChangeHistory.route";
import incidentChangeHistoryRoutes from "./routes/incidentChangeHistory.route";
import useCaseChangeHistoryRoutes from "./routes/useCaseChangeHistory.route";
import projectRiskChangeHistoryRoutes from "./routes/projectRiskChangeHistory.route";
import fileChangeHistoryRoutes from "./routes/fileChangeHistory.route";
import taskChangeHistoryRoutes from "./routes/taskChangeHistory.route";
import trainingChangeHistoryRoutes from "./routes/trainingChangeHistory.route";
import modelRiskChangeHistoryRoutes from "./routes/modelRiskChangeHistory.route";
import datasetChangeHistoryRoutes from "./routes/datasetChangeHistory.route";
import policyLinkedObjects from "./routes/policyLinkedObjects.route";
import approvalWorkflowRoutes from "./routes/approvalWorkflow.route";
import approvalRequestRoutes from "./routes/approvalRequest.route";
import webhookRoutes from "./routes/webhook.route";
import aiDetectionRoutes from "./routes/aiDetection.route";
import aiDetectionRepositoryRoutes from "./routes/aiDetectionRepository.route";
import githubIntegrationRoutes from "./routes/githubIntegration.route";
import notificationRoutes from "./routes/notification.route";
import postMarketMonitoringRoutes from "./routes/postMarketMonitoring.route";
import governanceOsRoutes from "./routes/governanceOs.route";
import complianceRoutes from "./routes/compliance.route";
import virtualFolderRoutes, { filesFolderRouter } from "./routes/virtualFolder.route";
import shadowAiRoutes from "./routes/shadowAi.route";
import shadowAiIngestionRoutes from "./routes/shadowAiIngestion.route";
import agentDiscoveryRoutes from "./routes/agentDiscovery.route";
import invitationRoutes from "./routes/invitation.route";
import intakeFormRoutes from "./routes/intakeForm.route";
import versionRoutes from "./routes/version.route";
import auditLedgerRoutes from "./routes/auditLedger.route";
import evidenceAiRoutes from "./routes/evidenceAi.route";
import readinessRoutes from "./routes/readiness.route";
import aiContentRoutes from "./routes/aiContent.route";
import aiConfirmationRoutes from "./routes/aiConfirmation.route";
import aiApprovalRoutes from "./routes/aiApproval.route";
import aiApprovalRulesRoutes from "./routes/aiApprovalRules.route";
import aiAppRoutes from "./routes/aiApp.route";
import aiAuditRoutes from "./routes/aiAudit.route";
import featureSettingsRoutes from "./routes/featureSettings.route";
import friaRoutes from "./routes/fria.route";
import riskBenchmarkRoutes from "./routes/riskBenchmark.route";
import quantitativeRiskRoutes from "./routes/quantitativeRisk.route";
import aiGatewayRoutes from "./routes/aiGateway.route";
import customFieldRoutes from "./routes/customField.route";
import virtualKeyProxyRoutes from "./routes/virtualKeyProxy.route";
import internalRoutes from "./routes/internal.route";
import superAdminRoutes from "./routes/superAdmin.route";
import { i18nMiddleware } from "./middleware/i18n.middleware";
import { sequelize } from "./database/db";
import redisClient from "./database/redis";
import ssoConfigRoutes from "./routes/ssoConfig.route";
import aiTrustIndexRoutes from "./routes/aiTrustIndex.route";

const swaggerDoc = YAML.load("./swagger.yaml");

const DEFAULT_HOST = "localhost";

export function createApp(preRoutesMiddleware?: RequestHandler[]): express.Application {
  const app = express();
  const host = process.env.HOST || DEFAULT_HOST;

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }

        try {
          const originUrl = new URL(origin);
          const requestHost = originUrl.hostname;

          const allowedHosts = [host, "localhost", "127.0.0.1", "::1"];

          if (allowedHosts.includes(requestHost)) {
            return callback(null, true);
          }

          return callback(new Error("Not allowed by CORS"));
        } catch (error) {
          return callback(new Error("Invalid origin"));
        }
      },
      credentials: true,
      allowedHeaders: ["Authorization", "Content-Type", "X-Requested-With", "X-Organization-Id"],
    }),
  );
  app.use(helmet());
  app.use((req, res, next) => {
    if (req.url.includes("/api/bias_and_fairness/")) {
      return next();
    }
    if (
      req.url.includes("/api/deepeval/") &&
      !req.url.includes("/experiments") &&
      !req.url.includes("/arena/compare")
    ) {
      return next();
    }
    if (req.url.startsWith("/api/webhooks/")) {
      return next();
    }
    express.json({ limit: "10mb" })(req, res, next);
  });
  app.use(cookieParser());

  app.use(i18nMiddleware);

  app.get("/health", async (_req, res) => {
    const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL || "http://localhost:8100";
    const checks: Record<string, { status: "ok" | "error"; error?: string }> = {};

    try {
      await sequelize.query("SELECT 1");
      checks.database = { status: "ok" };
    } catch (err: unknown) {
      checks.database = { status: "error", error: (err as Error).message };
    }

    try {
      const pong = await redisClient.ping();
      checks.redis =
        pong === "PONG"
          ? { status: "ok" }
          : { status: "error", error: `Unexpected PING response: ${pong}` };
    } catch (err: unknown) {
      checks.redis = { status: "error", error: (err as Error).message };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const gwRes = await fetch(`${AI_GATEWAY_URL}/health`, { signal: controller.signal });
        checks.ai_gateway = gwRes.ok
          ? { status: "ok" }
          : { status: "error", error: `HTTP ${gwRes.status}` };
      } finally {
        clearTimeout(timeout);
      }
    } catch (err: unknown) {
      checks.ai_gateway = { status: "error", error: (err as Error).message };
    }

    const allOk = Object.values(checks).every((c) => c.status === "ok");
    res.status(allOk ? 200 : 503).json({ status: allOk ? "ok" : "degraded", checks });
  });

  if (preRoutesMiddleware) {
    preRoutesMiddleware.forEach((mw) => app.use(mw));
  }

  app.use("/api/users", userRoutes);
  app.use("/api/vendorRisks", vendorRiskRoutes);
  app.use("/api/vendors", vendorRoutes);
  app.use("/api/vendor-change-history", vendorChangeHistoryRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/questions", questionRoutes);
  app.use("/api/autoDrivers", autoDriverRoutes);
  app.use("/api/assessments", assessmentRoutes);
  app.use("/api/projectRisks", risksRoutes);
  app.use("/api/roles", roleRoutes);
  app.use("/api/files", fileRoutes);
  app.use("/api/mail", mailRoutes);
  app.use("/api/invitations", invitationRoutes);
  app.use("/api/frameworks", frameworks);
  app.use("/api/eu-ai-act", euRouter); // **
  app.use("/api/organizations", organizationRoutes);
  app.use("/api/iso-42001", isoRoutes); // **
  app.use("/api/iso-27001", iso27001Routes); // **
  app.use("/api/training", trainingRoutes);
  app.use("/api/aiTrustCentre", aiTrustCentreRoutes);
  app.use("/api/logger", loggerRoutes);
  app.use("/api/modelInventory", modelInventoryRoutes);
  app.use("/api/modelInventoryHistory", modelInventoryHistoryRoutes);
  app.use("/api/dataset-bulk-upload", datasetBulkUploadRoutes);
  app.use("/api/model-inventory-change-history", modelInventoryChangeHistoryRoutes);
  app.use("/api/datasets", datasetRoutes);
  app.use("/api/riskHistory", riskHistoryRoutes);
  app.use("/api/modelRisks", modelRiskRoutes);
  app.use("/api/reporting", reportRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/tiers", tiersRoutes);
  app.use("/api/subscriptions", subscriptionRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/deadlines", deadlineRoutes);
  if (process.env.NODE_ENV !== "production") {
    app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc));
  }
  app.use("/api/policies", policyRoutes);
  app.use("/api/policies", policyFolderRoutes);
  app.use("/api/slackWebhooks", slackWebhookRoutes);
  app.use("/api/plugins", pluginRoutes);
  app.use("/api/tokens", tokenRoutes);
  app.use("/api/shares", shareLinkRoutes);
  app.use("/api/file-manager", fileManagerRoutes);
  app.use("/api/automations", automation);
  app.use("/api/user-preferences", userPreferenceRouter);
  app.use("/api/llm-keys", llmKeyRouter);
  app.use("/api/nist-ai-rmf", nistAiRmfRoutes);
  app.use("/api/evidenceHub", evidenceHubRouter);
  app.use("/api/evidence-ai", evidenceAiRoutes);
  app.use("/api/readiness", readinessRoutes);
  app.use("/api/ai-content", aiContentRoutes);
  app.use("/api/ai-confirmation", aiConfirmationRoutes);
  app.use("/api/ai-approvals", aiApprovalRoutes);
  app.use("/api/ai-approval-rules", aiApprovalRulesRoutes);
  app.use("/api/ai-apps", aiAppRoutes);
  app.use("/api/ai-audit", aiAuditRoutes);
  app.use("/api/advisor", advisorRouter);
  app.use("/api/policy-linked", policyLinkedObjects);
  app.use("/api/ai-incident-managements", aiIncidentRouter);
  app.use("/api/ce-marking", ceMarkingRoutes);
  app.use("/api/search", searchRoutes);
  app.use("/api/deepeval", deepEvalRoutes());
  app.use("/api/evaluation-llm-keys", evaluationLlmApiKeyRoutes);
  app.use("/api/notes", notesRoutes);
  app.use("/api/entity-graph", entityGraphRoutes);
  app.use("/api/vendor-risk-change-history", vendorRiskChangeHistoryRoutes);
  app.use("/api/policy-change-history", policyChangeHistoryRoutes);
  app.use("/api/incident-change-history", incidentChangeHistoryRoutes);
  app.use("/api/use-case-change-history", useCaseChangeHistoryRoutes);
  app.use("/api/risk-change-history", projectRiskChangeHistoryRoutes);
  app.use("/api/file-change-history", fileChangeHistoryRoutes);
  app.use("/api/task-change-history", taskChangeHistoryRoutes);
  app.use("/api/training-change-history", trainingChangeHistoryRoutes);
  app.use("/api/model-risk-change-history", modelRiskChangeHistoryRoutes);
  app.use("/api/dataset-change-history", datasetChangeHistoryRoutes);
  app.use("/api/approval-workflows", approvalWorkflowRoutes);
  app.use("/api/approval-requests", approvalRequestRoutes);
  app.use("/api/webhooks", webhookRoutes);
  app.use("/api/ai-detection", aiDetectionRoutes);
  app.use("/api/ai-detection/repositories", aiDetectionRepositoryRoutes);
  app.use("/api/integrations/github", githubIntegrationRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/pmm", postMarketMonitoringRoutes);
  app.use("/api/compliance", complianceRoutes);
  app.use("/api/virtual-folders", virtualFolderRoutes);
  app.use("/api/files", filesFolderRouter);
  app.use("/api/shadow-ai", shadowAiRoutes);
  app.use("/api/v1/shadow-ai", shadowAiIngestionRoutes);
  app.use("/api/agent-primitives", agentDiscoveryRoutes);
  app.use("/api/intake", intakeFormRoutes);
  app.use("/api/version", versionRoutes);
  app.use("/api/audit-ledger", auditLedgerRoutes);
  app.use("/api/feature-settings", featureSettingsRoutes);
  app.use("/api/fria", friaRoutes);
  app.use("/api/governance-os", governanceOsRoutes);
  app.use("/api/risk-benchmarks", riskBenchmarkRoutes);
  app.use("/api/quantitative-risks", quantitativeRiskRoutes);
  app.use("/api/ai-gateway", aiGatewayRoutes());
  app.use("/api/custom-fields", customFieldRoutes);

  app.use("/api/super-admin", superAdminRoutes);
  app.use("/api/internal", internalRoutes);
  app.use("/v1", virtualKeyProxyRoutes());
  app.use("/api/ssoConfig", ssoConfigRoutes);
  app.use("/api/ai-trust-index", aiTrustIndexRoutes);

  return app;
}
