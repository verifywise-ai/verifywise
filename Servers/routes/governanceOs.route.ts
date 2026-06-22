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
router.post("/mappings", authenticateJWT, authorize(["Admin", "Editor"]), createMapping);
router.put("/mappings/:id", authenticateJWT, authorize(["Admin", "Editor"]), updateMapping);
router.delete("/mappings/:id", authenticateJWT, authorize(["Admin"]), deleteMapping);
router.post("/mappings/bulk", authenticateJWT, authorize(["Admin", "Editor"]), createBulkMappings);

// Scenarios
router.get("/scenarios", authenticateJWT, getAllScenarios);
router.get("/scenarios/:id", authenticateJWT, getScenarioById);
router.post("/scenarios", authenticateJWT, authorize(["Admin", "Editor"]), createScenario);
router.put("/scenarios/:id", authenticateJWT, authorize(["Admin", "Editor"]), updateScenario);
router.delete("/scenarios/:id", authenticateJWT, authorize(["Admin"]), deleteScenario);
router.post(
  "/scenarios/:id/activate",
  authenticateJWT,
  authorize(["Admin", "Editor"]),
  activateScenario,
);
router.post("/scenarios/simulate", authenticateJWT, simulateScenario);

// Activations
router.get("/activations", authenticateJWT, getActivationHistory);
router.post(
  "/activations/:id/deactivate",
  authenticateJWT,
  authorize(["Admin", "Editor"]),
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
