/**
 * Legacy API registration — model inventory, policies, training, and MRM.
 *
 * Legacy surface (ADR 0001): these unversioned mounts are frozen; bug fixes
 * only. New endpoints go to routes/v1/. Mounts are listed in the exact order
 * they had in app.ts before the decomposition.
 */
import express from "express";
import trainingRoutes from "../trainingRegistar.route";
import aiTrustCentreRoutes from "../aiTrustCentre.route";
import modelInventoryRoutes from "../modelInventory.route";
import modelInventoryHistoryRoutes from "../modelInventoryHistory.route";
import mrmRoutes from "../mrm.route";
import mrmIngestionRoutes from "../mrmIngestion.route";
import policyRoutes from "../policy.route";
import policyFolderRoutes from "../policyFolder.route";
import advisorRouter from "../advisor.route";
import policyLinkedObjects from "../policyLinkedObjects.route";
import aiIncidentRouter from "../aiIncidentManagement.route";

export function registerAiGovernanceRoutes(app: express.Application): void {
  app.use("/api/training", trainingRoutes);
  app.use("/api/aiTrustCentre", aiTrustCentreRoutes);
  app.use("/api/modelInventory", modelInventoryRoutes);
  app.use("/api/modelInventoryHistory", modelInventoryHistoryRoutes);
  app.use("/api/mrm", mrmRoutes);
  // Token-authed machine ingestion surface, mounted on the same base path.
  // Its route (POST /models/:externalModelKey/metrics) does not collide with
  // any JWT mrm route and uses its own token middleware + rate limiter.
  app.use("/api/mrm", mrmIngestionRoutes);
  // Two routers share /api/policies; registration order is load-bearing.
  app.use("/api/policies", policyRoutes);
  app.use("/api/policies", policyFolderRoutes);
  app.use("/api/advisor", advisorRouter);
  app.use("/api/policy-linked", policyLinkedObjects);
  app.use("/api/ai-incident-managements", aiIncidentRouter);
}
