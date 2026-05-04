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

const router = express.Router();

router.get("/", authenticateJWT, getAllAutomations);
router.get("/triggers", authenticateJWT, getAllAutomationTriggers);
router.get("/actions/by-triggerId/:triggerId", authenticateJWT, getAllAutomationActionsByTriggerId);
router.get("/:id/history", authenticateJWT, getAutomationHistory);
router.get("/:id/stats", authenticateJWT, getAutomationStats);
router.get("/:id", authenticateJWT, getAutomationById);
router.post("/", authenticateJWT, createAutomation);
router.put("/:id", authenticateJWT, updateAutomation);
router.delete("/:id", authenticateJWT, deleteAutomationById);

export default router;
