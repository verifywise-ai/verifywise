import express from "express";
const router = express.Router();

import {
  getRiskById,
  getAllRisks,
  createRisk,
  updateRiskById,
  deleteRiskById,
  getRisksByProject,
  getRisksByFramework,
  bulkUpdateProjectRisks,
  suggestRisksWithAI,
} from "../controllers/risks.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import { riskSuggestionsAiLimiter } from "../middleware/rateLimit.middleware";
import {
  validateBulkUpdateProjectRisks,
  validateCreateRisk,
  validateRiskIdParam,
  validateSuggestRisksWithAI,
  validateUpdateRisk,
} from "../middleware/validators/risks.validator";

// GET requests
router.get("/", authenticateJWT, getAllRisks);
router.get("/by-projid/:id", authenticateJWT, validateRiskIdParam, getRisksByProject);
router.get("/by-frameworkid/:id", authenticateJWT, validateRiskIdParam, getRisksByFramework);
router.get("/:id", authenticateJWT, validateRiskIdParam, getRiskById);

// PATCH bulk update (Admin/Editor). Must come before generic /:id routes.
router.patch(
  "/bulk",
  authenticateJWT,
  authorize("risks.edit"),
  validateBulkUpdateProjectRisks,
  bulkUpdateProjectRisks,
);

// POST, PUT, DELETE requests
router.post("/", authenticateJWT, validateCreateRisk, createRisk);
// AI risk suggestions: auth first so the limiter can key on req.userId,
// then the limiter, then validation, then the controller.
router.post(
  "/suggest-ai",
  authenticateJWT,
  riskSuggestionsAiLimiter,
  validateSuggestRisksWithAI,
  suggestRisksWithAI,
);
router.put("/:id", authenticateJWT, validateUpdateRisk, updateRiskById);
router.delete("/:id", authenticateJWT, validateRiskIdParam, deleteRiskById);

export default router;
