import express from "express";
import authenticateJWT from "../middleware/auth.middleware";

import {
  createAutomation,
  deleteAutomationById,
  getAllAutomationActionsByTriggerId,
  getAllAutomationTriggers,
  getAllAutomations,
  getAutomationById,
  updateAutomation,
  getAutomationHistory,
  getAutomationStats,
} from "../controllers/automations.ctrl";
import {
  validateAutomationIdParam,
  validateCreateAutomation,
  validateHistoryQuery,
  validateTriggerIdParam,
  validateUpdateAutomation,
} from "../middleware/validators/automations.validator";

const router = express.Router();

router.get("/", authenticateJWT, getAllAutomations);
router.get("/triggers", authenticateJWT, getAllAutomationTriggers);
router.get(
  "/actions/by-triggerId/:triggerId",
  authenticateJWT,
  validateTriggerIdParam,
  getAllAutomationActionsByTriggerId,
);
router.get("/:id/history", authenticateJWT, validateHistoryQuery, getAutomationHistory);
router.get("/:id/stats", authenticateJWT, validateAutomationIdParam, getAutomationStats);
router.get("/:id", authenticateJWT, validateAutomationIdParam, getAutomationById);
router.post("/", authenticateJWT, validateCreateAutomation, createAutomation);
router.put("/:id", authenticateJWT, validateUpdateAutomation, updateAutomation);
router.delete("/:id", authenticateJWT, validateAutomationIdParam, deleteAutomationById);

export default router;
