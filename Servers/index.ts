import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
// import { checkAndCreateTables } from "./database/db";

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
import slackWebhookRoutes from "./routes/slackWebhook.route";
import pluginRoutes from "./routes/plugin.route";
import tokenRoutes from "./routes/tokens.route";
import shareLinkRoutes from "./routes/shareLink.route";
import automation from "./routes/automation.route.js";
import fileManagerRoutes from "./routes/fileManager.route";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { addAllJobs } from "./jobs/producer";
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
import complianceRoutes from "./routes/compliance.route";
import virtualFolderRoutes, { filesFolderRouter } from "./routes/virtualFolder.route";
import shadowAiRoutes from "./routes/shadowAi.route";
import shadowAiIngestionRoutes from "./routes/shadowAiIngestion.route";
import agentDiscoveryRoutes from "./routes/agentDiscovery.route";
import invitationRoutes from "./routes/invitation.route";
import intakeFormRoutes from "./routes/intakeForm.route";
import versionRoutes from "./routes/version.route";
import auditLedgerRoutes from "./routes/auditLedger.route";
import featureSettingsRoutes from "./routes/featureSettings.route";
import riskBenchmarkRoutes from "./routes/riskBenchmark.route";
import quantitativeRiskRoutes from "./routes/quantitativeRisk.route";
import aiGatewayRoutes from "./routes/aiGateway.route";
import virtualKeyProxyRoutes from "./routes/virtualKeyProxy.route";
import internalRoutes from "./routes/internal.route";
import superAdminRoutes from "./routes/superAdmin.route";
// superAdminReadOnly is now enforced inside authenticateJWT middleware
import { setupNotificationSubscriber, closeNotificationSubscriber } from "./services/notificationSubscriber.service";
import { sequelize } from "./database/db";
import redisClient from "./database/redis";

const swaggerDoc = YAML.load("./swagger.yaml");

const app = express();

const DEFAULT_PORT = "3000";
const DEFAULT_HOST = "localhost";

const portString = process.env.PORT || DEFAULT_PORT;
const host = process.env.HOST || DEFAULT_HOST;

const port = parseInt(portString, 10); // Convert to number

try {
  // (async () => {
  //   await checkAndCreateTables();
  // })();
  // Middlewares

  // Development
  // (async () => {
  //   await sequelize.sync();
  // })();

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) {
          return callback(null, true);
        }

        try {
          const originUrl = new URL(origin);
          const requestHost = originUrl.hostname;

          // Allow if origin is from same host (localhost, 127.0.0.1, or actual host)
          const allowedHosts = [host, "localhost", "127.0.0.1", "::1"];

          if (allowedHosts.includes(requestHost)) {
            return callback(null, true);
          }

          // Reject other origins
          return callback(new Error("Not allowed by CORS"));
        } catch (error) {
          return callback(new Error("Invalid origin"));
        }
      },
      credentials: true,
      allowedHeaders: ["Authorization", "Content-Type", "X-Requested-With", "X-Organization-Id"],
    })
  );
  app.use(helmet()); // Use helmet for security headers
  app.use((req, res, next) => {
    if (req.url.includes("/api/bias_and_fairness/")) {
      // Let the proxy handle the raw body for bias/fairness
      return next();
    }
    // For deepeval experiment creation and arena comparisons, we need to parse body to inject API keys
    // For other deepeval routes, let proxy handle raw body
    if (req.url.includes("/api/deepeval/") && !req.url.includes("/experiments") && !req.url.includes("/arena/compare")) {
      return next();
    }
    // Webhook routes use express.raw() for HMAC signature verification
    if (req.url.startsWith("/api/webhooks/")) {
      return next();
    }
    express.json({ limit: '10mb' })(req, res, next);
  });
  app.use(cookieParser());
  // app.use(csrf());

  // Health endpoint — must be registered before JWT middleware so it is publicly reachable
  app.get("/health", async (_req, res) => {
    const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL || "http://localhost:8100";
    const checks: Record<string, { status: "ok" | "error"; error?: string }> = {};

    // Database check
    try {
      await sequelize.query("SELECT 1");
      checks.database = { status: "ok" };
    } catch (err: any) {
      checks.database = { status: "error", error: err.message };
    }

    // Redis check
    try {
      const pong = await redisClient.ping();
      checks.redis = pong === "PONG" ? { status: "ok" } : { status: "error", error: `Unexpected PING response: ${pong}` };
    } catch (err: any) {
      checks.redis = { status: "error", error: err.message };
    }

    // FastAPI gateway check
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const gwRes = await fetch(`${AI_GATEWAY_URL}/health`, { signal: controller.signal });
        checks.ai_gateway = gwRes.ok ? { status: "ok" } : { status: "error", error: `HTTP ${gwRes.status}` };
      } finally {
        clearTimeout(timeout);
      }
    } catch (err: any) {
      checks.ai_gateway = { status: "error", error: err.message };
    }

    const allOk = Object.values(checks).every((c) => c.status === "ok");
    res.status(allOk ? 200 : 503).json({ status: allOk ? "ok" : "degraded", checks });
  });

  // Routes
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
  app.use(
    "/api/model-inventory-change-history",
    modelInventoryChangeHistoryRoutes
  );
  app.use("/api/datasets", datasetRoutes);
  app.use("/api/riskHistory", riskHistoryRoutes);
  app.use("/api/modelRisks", modelRiskRoutes);
  app.use("/api/reporting", reportRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/tiers", tiersRoutes);
  app.use("/api/subscriptions", subscriptionRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc));
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
  app.use("/api/advisor", advisorRouter);
  app.use("/api/policy-linked", policyLinkedObjects);

  // Adding background jobs in the Queue
  (async () => {
    await addAllJobs();
  })();
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
  app.use("/api/files", filesFolderRouter); // Additional file-folder routes
  app.use("/api/shadow-ai", shadowAiRoutes);
  app.use("/api/v1/shadow-ai", shadowAiIngestionRoutes);
  app.use("/api/agent-primitives", agentDiscoveryRoutes);
  app.use("/api/intake", intakeFormRoutes);
  app.use("/api/version", versionRoutes);
  app.use("/api/audit-ledger", auditLedgerRoutes);
  app.use("/api/feature-settings", featureSettingsRoutes);
  app.use("/api/risk-benchmarks", riskBenchmarkRoutes);
  app.use("/api/quantitative-risks", quantitativeRiskRoutes);
  app.use("/api/ai-gateway", aiGatewayRoutes());

  // Super-admin routes (authenticated + super-admin only)
  app.use("/api/super-admin", superAdminRoutes);

  // Internal routes — callbacks from Python services (no JWT, internal key auth)
  app.use("/api/internal", internalRoutes);

  // Virtual key proxy — OpenAI-compatible /v1/* routes (no JWT, no CORS)
  app.use("/v1", virtualKeyProxyRoutes());

  // Setup notification subscriber for real-time notifications
  (async () => {
    try {
      await setupNotificationSubscriber();
    } catch (error) {
      console.error("Failed to setup notification subscriber:", error);
    }
  })();

  // Check and run tenant-to-shared-schema data migration
  (async () => {
    try {
      const { checkAndRunMigration, printValidationReport } = require("./scripts/migrateToSharedSchema");
      console.log("🔄 Checking for pending data migrations...");
      const result = await checkAndRunMigration();

      if (result.status === "completed" || result.status === "already_completed") {
        console.log("✅ Data migration already completed");
      } else if (result.status === "just_completed") {
        console.log("✅ Data migration completed successfully!");
        console.log(`   Organizations migrated: ${result.organizationsMigrated}`);
        console.log(`   Total rows migrated: ${result.rowsMigrated}`);
        if (result.validationReport) {
          printValidationReport(result.validationReport);
        }
      } else if (result.status === "failed") {
        console.error("❌ Data migration failed:", result.error);
        console.log("⚠️  Server will start but old tenant data may not be accessible");
      } else if (result.status === "no_tenants") {
        console.log("ℹ️  No tenant schemas found, skipping migration");
      }
    } catch (error) {
      console.error("Data migration check failed:", error);
      // Server continues to start even if migration check fails
    }
  })();

  const server = app.listen(port, () => {
    console.log(`Server running on port http://${host}:${port}/`);
  });

  async function shutdown(signal: string): Promise<void> {
    console.log(`\n${signal} received — shutting down gracefully`);

    // Stop accepting new connections; give in-flight requests 10 s to complete
    server.close(async () => {
      console.log("HTTP server closed");

      try {
        await closeNotificationSubscriber();
        console.log("Notification subscriber closed");
      } catch (err) {
        console.error("Error closing notification subscriber:", err);
      }

      try {
        await redisClient.quit();
        console.log("Redis connection closed");
      } catch (err) {
        console.error("Error closing Redis connection:", err);
      }

      try {
        await sequelize.close();
        console.log("Database connection closed");
      } catch (err) {
        console.error("Error closing database connection:", err);
      }

      process.exit(0);
    });

    // Force-exit if requests haven't drained within 10 seconds
    setTimeout(() => {
      console.error("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, 10000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
} catch (error) {
  console.error("Error setting up the server:", error);
}
