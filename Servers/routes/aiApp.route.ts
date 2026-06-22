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

// GET requests
router.get("/", authenticateJWT, getAllAiApps);
router.get("/policy-suggestions", authenticateJWT, getPolicySuggestions);
router.get("/:id", authenticateJWT, getAiAppById);

// POST requests
router.post("/", authenticateJWT, createAiApp);
router.post("/:id/models", authenticateJWT, linkModelsToAiApp);
router.post("/:id/policies", authenticateJWT, setPoliciesForAiApp);
router.post("/:id/data-exposure", authenticateJWT, setDataExposureForAiApp);
router.post("/from-shadow-ai/:shadowAiToolId", authenticateJWT, promoteFromShadowAi);

// PATCH requests
router.patch("/:id", authenticateJWT, updateAiAppById);
router.patch("/:id/status", authenticateJWT, updateAiAppStatus);

// DELETE requests
router.delete("/:id", authenticateJWT, deleteAiAppById);

export default router;
