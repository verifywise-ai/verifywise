import express from "express";
const router = express.Router();

import authenticateJWT from "../middleware/auth.middleware";
import {
  searchRiskLibrary,
  getRiskLibraryEntry,
  getRiskLibraryFilters,
  getRiskLibraryStats,
  submitRiskLibraryFeedback,
  removeRiskLibraryFeedback,
  getRiskLibraryFeedback,
  upsertRiskLibraryCustomization,
  generateTaxonomy,
  generateMitigations,
  generateAssessment,
  submitGenFeedback,
} from "../controllers/riskLibrary.ctrl";

// CRUD
router.get("/", authenticateJWT, searchRiskLibrary);
router.get("/filters", authenticateJWT, getRiskLibraryFilters);
router.get("/stats", authenticateJWT, getRiskLibraryStats);
router.get("/:id", authenticateJWT, getRiskLibraryEntry);

// Feedback
router.post("/:id/feedback", authenticateJWT, submitRiskLibraryFeedback);
router.delete("/:id/feedback", authenticateJWT, removeRiskLibraryFeedback);
router.get("/:id/feedback", authenticateJWT, getRiskLibraryFeedback);

// Org customization
router.put("/:id/customize", authenticateJWT, upsertRiskLibraryCustomization);

// AI generation
router.post("/generate/taxonomy", authenticateJWT, generateTaxonomy);
router.post("/generate/mitigations", authenticateJWT, generateMitigations);
router.post("/generate/assessment", authenticateJWT, generateAssessment);
router.post("/generations/:id/feedback", authenticateJWT, submitGenFeedback);

export default router;
