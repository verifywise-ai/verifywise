import express from "express";
const router = express.Router();

import {
  createAiApp,
  deleteAiAppById,
  getAllAiApps,
  getAiAppById,
  getPolicySuggestions,
  linkModelsToAiApp,
  promoteFromShadowAi,
  setDataExposureForAiApp,
  setPoliciesForAiApp,
  updateAiAppById,
  updateAiAppStatus,
} from "../controllers/aiApp.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";

// GET requests
router.get("/", authenticateJWT, getAllAiApps);
router.get("/policy-suggestions", authenticateJWT, getPolicySuggestions);
router.get("/:id", authenticateJWT, getAiAppById);

// POST requests
router.post("/", authenticateJWT, authorize("aiApp.edit"), createAiApp);
router.post("/:id/models", authenticateJWT, authorize("aiApp.edit"), linkModelsToAiApp);
router.post("/:id/policies", authenticateJWT, authorize("aiApp.edit"), setPoliciesForAiApp);
router.post(
  "/:id/data-exposure",
  authenticateJWT,
  authorize("aiApp.edit"),
  setDataExposureForAiApp,
);
router.post(
  "/from-shadow-ai/:shadowAiToolId",
  authenticateJWT,
  authorize("aiApp.edit"),
  promoteFromShadowAi,
);

// PATCH requests
router.patch("/:id", authenticateJWT, authorize("aiApp.edit"), updateAiAppById);
router.patch("/:id/status", authenticateJWT, authorize("aiApp.edit"), updateAiAppStatus);

// DELETE requests
router.delete("/:id", authenticateJWT, authorize("aiApp.admin"), deleteAiAppById);

export default router;
