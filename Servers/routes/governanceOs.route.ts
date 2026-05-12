import express from "express";
const router = express.Router();

import {
  getAllMappings,
  getMappingsBetween,
  getMappingsForControl,
  getAllScenarios,
  getScenarioById,
  createScenario,
  updateScenario,
  deleteScenario,
  getRecommendations,
  getCoverage,
  refreshCoverage,
  getUnifiedView,
  getEligibility,
  getPreferences,
  updatePreferences,
} from "../controllers/governanceOs.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";

// Mappings (read-only, all authenticated users)
router.get("/mappings", authenticateJWT, getAllMappings);
router.get("/mappings/between/:sourceId/:targetId", authenticateJWT, getMappingsBetween);
router.get("/mappings/control/:controlType/:controlId", authenticateJWT, getMappingsForControl);

// Scenarios
router.get("/scenarios", authenticateJWT, getAllScenarios);
router.get("/scenarios/:id", authenticateJWT, getScenarioById);
router.post("/scenarios", authenticateJWT, authorize(["Admin", "Editor"]), createScenario);
router.put("/scenarios/:id", authenticateJWT, authorize(["Admin", "Editor"]), updateScenario);
router.delete("/scenarios/:id", authenticateJWT, authorize(["Admin"]), deleteScenario);

// Recommendations
router.post("/recommend", authenticateJWT, getRecommendations);

// Coverage & Unified View
router.get("/coverage/:projectId", authenticateJWT, getCoverage);
router.post(
  "/coverage/:projectId/refresh",
  authenticateJWT,
  authorize(["Admin", "Editor"]),
  refreshCoverage,
);
router.get("/unified-view/:projectId", authenticateJWT, getUnifiedView);

// Eligibility
router.get("/eligibility", authenticateJWT, getEligibility);

// Preferences
router.get("/preferences", authenticateJWT, getPreferences);
router.put("/preferences", authenticateJWT, authorize(["Admin"]), updatePreferences);

export default router;
