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

export default router;
