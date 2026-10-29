/**
 * Legacy API registration — compliance frameworks and governance.
 *
 * Legacy surface (ADR 0001): these unversioned mounts are frozen; bug fixes
 * only. New endpoints go to routes/v1/. Mounts are listed in the exact order
 * they had in app.ts before the decomposition.
 */
import express from "express";
import frameworks from "../frameworks.route";
import frameworkImpl from "../frameworkImpl.route";
import euRouter from "../eu.route";
import isoRoutes from "../iso42001.route";
import iso27001Routes from "../iso27001.route";
import nistAiRmfRoutes from "../nist_ai_rmf.route";
import evidenceAiRoutes from "../evidenceAi.route";
import readinessRoutes from "../readiness.route";
import ceMarkingRoutes from "../ceMarking.route";
import postMarketMonitoringRoutes from "../postMarketMonitoring.route";
import complianceRoutes from "../compliance.route";
import governanceOsRoutes from "../governanceOs.route";
import aiTrustIndexRoutes from "../aiTrustIndex.route";

export function registerFrameworksRoutes(app: express.Application): void {
  // Two routers share /api/frameworks; registration order is load-bearing.
  app.use("/api/frameworks", frameworks);
  app.use("/api/frameworks", frameworkImpl);
  app.use("/api/eu-ai-act", euRouter); // **
  app.use("/api/iso-42001", isoRoutes); // **
  app.use("/api/iso-27001", iso27001Routes); // **
  app.use("/api/nist-ai-rmf", nistAiRmfRoutes);
  app.use("/api/evidence-ai", evidenceAiRoutes);
  app.use("/api/readiness", readinessRoutes);
  app.use("/api/ce-marking", ceMarkingRoutes);
  app.use("/api/pmm", postMarketMonitoringRoutes);
  app.use("/api/compliance", complianceRoutes);
  app.use("/api/governance-os", governanceOsRoutes);
  app.use("/api/ai-trust-index", aiTrustIndexRoutes);
}
