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
router.post("/", authenticateJWT, authorize(["Admin", "Editor"]), createAiApp);
router.post("/:id/models", authenticateJWT, authorize(["Admin", "Editor"]), linkModelsToAiApp);
router.post("/:id/policies", authenticateJWT, authorize(["Admin", "Editor"]), setPoliciesForAiApp);
router.post(
  "/:id/data-exposure",
  authenticateJWT,
  authorize(["Admin", "Editor"]),
  setDataExposureForAiApp,
);
router.post(
  "/from-shadow-ai/:shadowAiToolId",
  authenticateJWT,
  authorize(["Admin", "Editor"]),
  promoteFromShadowAi,
);

// PATCH requests
router.patch("/:id", authenticateJWT, authorize(["Admin", "Editor"]), updateAiAppById);
router.patch("/:id/status", authenticateJWT, authorize(["Admin", "Editor"]), updateAiAppStatus);

// DELETE requests
router.delete("/:id", authenticateJWT, authorize(["Admin"]), deleteAiAppById);

export default router;
