import express from "express";
const router = express.Router();

import {
  getOrgPortfolio,
  getProjectPortfolio,
  getPortfolioTrendHandler,
  applyBenchmark,
  updateRiskAssessmentMode,
  getRiskAssessmentMode,
} from "../controllers/quantitativeRisk.ctrl";

import authenticateJWT from "../middleware/auth.middleware";

// Portfolio aggregation
router.get("/portfolio/org", authenticateJWT, getOrgPortfolio);
router.get("/portfolio/project/:projectId", authenticateJWT, getProjectPortfolio);
router.get("/portfolio/trend", authenticateJWT, getPortfolioTrendHandler);

// Apply benchmark to a risk
router.post("/:riskId/apply-benchmark/:benchmarkId", authenticateJWT, applyBenchmark);

// Risk assessment mode (org setting)
router.get("/assessment-mode", authenticateJWT, getRiskAssessmentMode);
router.put("/assessment-mode", authenticateJWT, updateRiskAssessmentMode);

export default router;
