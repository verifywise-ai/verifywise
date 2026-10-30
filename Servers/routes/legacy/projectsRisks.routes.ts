/**
 * Legacy API registration — projects, assessments, and risks.
 *
 * Legacy surface (ADR 0001): these unversioned mounts are frozen; bug fixes
 * only. New endpoints go to routes/v1/. Mounts are listed in the exact order
 * they had in app.ts before the decomposition.
 */
import express from "express";
import projectRoutes from "../project.route";
import euAiActClassificationRoutes from "../euAiActClassification.route";
import questionRoutes from "../question.route";
import assessmentRoutes from "../assessment.route";
import risksRoutes from "../risks.route";
import riskLinksRoutes from "../riskLinks.route";
import riskHistoryRoutes from "../riskHistory.route";
import modelRiskRoutes from "../modelRisk.route";
import friaRoutes from "../fria.route";
import riskBenchmarkRoutes from "../riskBenchmark.route";
import quantitativeRiskRoutes from "../quantitativeRisk.route";

export function registerProjectsRisksRoutes(app: express.Application): void {
  app.use("/api/projects", projectRoutes);
  app.use("/api/eu-ai-act-classification", euAiActClassificationRoutes);
  app.use("/api/questions", questionRoutes);
  app.use("/api/assessments", assessmentRoutes);
  app.use("/api/projectRisks", risksRoutes);
  app.use("/api/riskLinks", riskLinksRoutes);
  app.use("/api/riskHistory", riskHistoryRoutes);
  app.use("/api/modelRisks", modelRiskRoutes);
  app.use("/api/fria", friaRoutes);
  app.use("/api/risk-benchmarks", riskBenchmarkRoutes);
  app.use("/api/quantitative-risks", quantitativeRiskRoutes);
}
