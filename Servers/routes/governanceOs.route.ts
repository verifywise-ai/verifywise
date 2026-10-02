import express from "express";
const router = express.Router();

import {
  getAllMappings,
  getMappingsBetween,
  getMappingsForControl,
  createMapping,
  updateMapping,
  deleteMapping,
  createBulkMappings,
  getAllScenarios,
  getScenarioById,
  createScenario,
  updateScenario,
  deleteScenario,
  activateScenario,
  simulateScenario,
  getActivationHistory,
  deactivateScenario,
  getScenarioProgress,
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

// Mappings
router.get("/mappings", authenticateJWT, getAllMappings);
router.get("/mappings/between/:sourceId/:targetId", authenticateJWT, getMappingsBetween);
router.get("/mappings/control/:controlType/:controlId", authenticateJWT, getMappingsForControl);
router.post("/mappings", authenticateJWT, authorize("governanceOs.edit"), createMapping);
router.put("/mappings/:id", authenticateJWT, authorize("governanceOs.edit"), updateMapping);
router.delete("/mappings/:id", authenticateJWT, authorize("governanceOs.admin"), deleteMapping);
router.post("/mappings/bulk", authenticateJWT, authorize("governanceOs.edit"), createBulkMappings);

// Scenarios
router.get("/scenarios", authenticateJWT, getAllScenarios);
router.get("/scenarios/:id", authenticateJWT, getScenarioById);
router.post("/scenarios", authenticateJWT, authorize("governanceOs.edit"), createScenario);
router.put("/scenarios/:id", authenticateJWT, authorize("governanceOs.edit"), updateScenario);
router.delete("/scenarios/:id", authenticateJWT, authorize("governanceOs.admin"), deleteScenario);
router.post(
  "/scenarios/:id/activate",
  authenticateJWT,
  authorize("governanceOs.edit"),
  activateScenario,
);
router.post("/scenarios/simulate", authenticateJWT, simulateScenario);

// Activations
router.get("/activations", authenticateJWT, getActivationHistory);
router.post(
  "/activations/:id/deactivate",
  authenticateJWT,
  authorize("governanceOs.edit"),
  deactivateScenario,
);
router.get("/activations/:id/progress", authenticateJWT, getScenarioProgress);

// Recommendations
router.post("/recommend", authenticateJWT, getRecommendations);

// Coverage & Unified View
router.get("/coverage/:projectId", authenticateJWT, getCoverage);
router.post(
  "/coverage/:projectId/refresh",
  authenticateJWT,
  authorize("governanceOs.edit"),
  refreshCoverage,
);
router.get("/unified-view/:projectId", authenticateJWT, getUnifiedView);

// Eligibility
router.get("/eligibility", authenticateJWT, getEligibility);

// Preferences
router.get("/preferences", authenticateJWT, getPreferences);
router.put("/preferences", authenticateJWT, authorize("governanceOs.admin"), updatePreferences);

export default router;
