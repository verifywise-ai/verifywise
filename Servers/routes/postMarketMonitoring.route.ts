/**
 * Post-Market Monitoring Routes
 *
 * API routes for managing post-market monitoring configuration,
 * questions, cycles, responses, and reports.
 */

import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import { requireProjectAccess } from "../middleware/projectAccess.middleware";
import {
  getConfigByProjectId,
  createConfig,
  updateConfig,
  deleteConfig,
  getQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  getActiveCycle,
  getCycleById,
  getResponses,
  saveResponses,
  submitCycle,
  flagConcern,
  getReports,
  downloadReport,
  reassignStakeholder,
  startNewCycle,
} from "../controllers/postMarketMonitoring.ctrl";

const router = express.Router();

// ============================================================================
// Configuration Routes
// ============================================================================

// GET /pmm/config/:projectId - Get config for a project
router.get("/config/:projectId", authenticateJWT, getConfigByProjectId);

// POST /pmm/config - Create new config
router.post("/config", authenticateJWT, createConfig);

// PUT /pmm/config/:configId - Update config
router.put("/config/:configId", authenticateJWT, updateConfig);

// DELETE /pmm/config/:configId - Delete config
router.delete("/config/:configId", authenticateJWT, deleteConfig);

// ============================================================================
// Question Routes
// ============================================================================

// GET /pmm/config/:configId/questions - Get questions for a config
router.get("/config/:configId/questions", authenticateJWT, getQuestions);

// GET /pmm/org/questions - Get global org questions (config_id = null)
router.get("/org/questions", authenticateJWT, getQuestions);

// POST /pmm/config/:configId/questions - Add question to config
router.post("/config/:configId/questions", authenticateJWT, addQuestion);

// PUT /pmm/questions/:questionId - Update question
router.put("/questions/:questionId", authenticateJWT, updateQuestion);

// DELETE /pmm/questions/:questionId - Delete question
router.delete("/questions/:questionId", authenticateJWT, deleteQuestion);

// POST /pmm/questions/reorder - Reorder questions
router.post("/questions/reorder", authenticateJWT, reorderQuestions);

// ============================================================================
// Cycle and Form Routes
// ============================================================================

// GET /pmm/active-cycle/:projectId - Get active cycle for project
router.get("/active-cycle/:projectId", authenticateJWT, getActiveCycle);

// GET /pmm/cycles/:cycleId - Get cycle details
router.get("/cycles/:cycleId", authenticateJWT, getCycleById);

// GET /pmm/cycles/:cycleId/responses - Get saved responses for a cycle
router.get("/cycles/:cycleId/responses", authenticateJWT, getResponses);

// POST /pmm/cycles/:cycleId/responses - Save responses (partial save)
router.post("/cycles/:cycleId/responses", authenticateJWT, saveResponses);

// POST /pmm/cycles/:cycleId/submit - Submit cycle (final)
router.post("/cycles/:cycleId/submit", authenticateJWT, submitCycle);

// POST /pmm/cycles/:cycleId/flag - Flag concern (immediate notification)
router.post("/cycles/:cycleId/flag", authenticateJWT, flagConcern);

// ============================================================================
// Report Routes
// ============================================================================

// GET /pmm/reports - List reports with filters
router.get("/reports", authenticateJWT, getReports);

// GET /pmm/reports/:reportId/download - Download report PDF
router.get("/reports/:reportId/download", authenticateJWT, downloadReport);

// ============================================================================
// Admin Routes
// ============================================================================

// POST /pmm/cycles/:cycleId/reassign - Reassign stakeholder
router.post("/cycles/:cycleId/reassign", authenticateJWT, reassignStakeholder);

// POST /pmm/projects/:projectId/start-cycle - Manually start new cycle
router.post(
  "/projects/:projectId/start-cycle",
  authenticateJWT,
  requireProjectAccess("projectId"),
  startNewCycle,
);

export default router;
