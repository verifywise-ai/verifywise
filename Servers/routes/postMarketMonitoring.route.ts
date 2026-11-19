/**
 * Post-Market Monitoring Routes
 *
 * API routes for managing post-market monitoring configuration,
 * questions, cycles, responses, and reports.
 */

import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  requireProjectAccess,
  requireUseCaseAccessVia,
  sameUseCase,
} from "../middleware/projectAccess.middleware";
import {
  isStakeholderOfPmmConfig,
  isStakeholderOfPmmCycle,
  isStakeholderOfPmmReport,
  useCaseOfPmmConfig,
  useCaseOfPmmCycle,
  useCaseOfPmmQuestion,
  useCaseOfPmmReport,
} from "../utils/pmmUseCaseAccess.utils";
import {
  pinPmmConfigFromPath,
  requirePmmCycleQuestions,
  requirePmmReorderAccess,
  validatePmmReorder,
} from "../middleware/pmmRowScope.middleware";
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

// Routes keyed by a config, cycle or report run the access rule of the use
// case the config monitors (read rule on GET, write rule otherwise). The
// stakeholder assigned to a cycle may also open, fill in, flag and submit it,
// and read its questions and report, without being on the use case: the
// monitoring email sends them there.
const configUseCase = requireUseCaseAccessVia(useCaseOfPmmConfig, { param: "configId" });
const configUseCaseOrStakeholder = requireUseCaseAccessVia(useCaseOfPmmConfig, {
  param: "configId",
  orAllow: isStakeholderOfPmmConfig,
});
const cycleUseCase = requireUseCaseAccessVia(useCaseOfPmmCycle, { param: "cycleId" });
const cycleUseCaseOrStakeholder = requireUseCaseAccessVia(useCaseOfPmmCycle, {
  param: "cycleId",
  orAllow: isStakeholderOfPmmCycle,
});
// A question of a config belongs to that config's use case; an organization
// question (no config) is passed on as before.
const questionUseCase = requireUseCaseAccessVia(useCaseOfPmmQuestion, {
  param: "questionId",
  missing: "pass",
});
// A new config names its use case in the body.
const bodyUseCase = requireUseCaseAccessVia(sameUseCase, {
  param: "project_id",
  source: "body",
});

// ============================================================================
// Configuration Routes
// ============================================================================

// GET /pmm/config/:projectId - Get config for a project
router.get(
  "/config/:projectId",
  authenticateJWT,
  requireProjectAccess("projectId"),
  getConfigByProjectId,
);

// POST /pmm/config - Create new config
router.post(
  "/config",
  authenticateJWT,
  authorize("postMarketMonitoring.edit"),
  bodyUseCase,
  createConfig,
);

// PUT /pmm/config/:configId - Update config
router.put(
  "/config/:configId",
  authenticateJWT,
  authorize("postMarketMonitoring.edit"),
  configUseCase,
  updateConfig,
);

// DELETE /pmm/config/:configId - Delete config
router.delete(
  "/config/:configId",
  authenticateJWT,
  authorize("postMarketMonitoring.edit"),
  configUseCase,
  deleteConfig,
);

// ============================================================================
// Question Routes
// ============================================================================

// GET /pmm/config/:configId/questions - Get questions for a config
router.get(
  "/config/:configId/questions",
  authenticateJWT,
  configUseCaseOrStakeholder,
  getQuestions,
);

// GET /pmm/org/questions - Get global org questions (config_id = null)
router.get("/org/questions", authenticateJWT, getQuestions);

// POST /pmm/config/:configId/questions - Add question to config
router.post(
  "/config/:configId/questions",
  authenticateJWT,
  authorize("postMarketMonitoring.edit"),
  configUseCase,
  pinPmmConfigFromPath,
  addQuestion,
);

// PUT /pmm/questions/:questionId - Update question
router.put(
  "/questions/:questionId",
  authenticateJWT,
  authorize("postMarketMonitoring.edit"),
  questionUseCase,
  updateQuestion,
);

// DELETE /pmm/questions/:questionId - Delete question
router.delete(
  "/questions/:questionId",
  authenticateJWT,
  authorize("postMarketMonitoring.edit"),
  questionUseCase,
  deleteQuestion,
);

// POST /pmm/questions/reorder - Reorder questions
router.post(
  "/questions/reorder",
  authenticateJWT,
  authorize("postMarketMonitoring.edit"),
  validatePmmReorder,
  requirePmmReorderAccess,
  reorderQuestions,
);

// ============================================================================
// Cycle and Form Routes
// ============================================================================

// GET /pmm/active-cycle/:projectId - Get active cycle for project
router.get(
  "/active-cycle/:projectId",
  authenticateJWT,
  requireProjectAccess("projectId"),
  getActiveCycle,
);

// GET /pmm/cycles/:cycleId - Get cycle details
router.get("/cycles/:cycleId", authenticateJWT, cycleUseCaseOrStakeholder, getCycleById);

// GET /pmm/cycles/:cycleId/responses - Get saved responses for a cycle
router.get("/cycles/:cycleId/responses", authenticateJWT, cycleUseCaseOrStakeholder, getResponses);

// POST /pmm/cycles/:cycleId/responses - Save responses (partial save)
router.post(
  "/cycles/:cycleId/responses",
  authenticateJWT,
  cycleUseCaseOrStakeholder,
  requirePmmCycleQuestions,
  saveResponses,
);

// POST /pmm/cycles/:cycleId/submit - Submit cycle (final)
router.post(
  "/cycles/:cycleId/submit",
  authenticateJWT,
  cycleUseCaseOrStakeholder,
  requirePmmCycleQuestions,
  submitCycle,
);

// POST /pmm/cycles/:cycleId/flag - Flag concern (immediate notification)
router.post(
  "/cycles/:cycleId/flag",
  authenticateJWT,
  cycleUseCaseOrStakeholder,
  requirePmmCycleQuestions,
  flagConcern,
);

// ============================================================================
// Report Routes
// ============================================================================

// GET /pmm/reports - List reports with filters
router.get("/reports", authenticateJWT, getReports);

// GET /pmm/reports/:reportId/download - Download report PDF
router.get(
  "/reports/:reportId/download",
  authenticateJWT,
  requireUseCaseAccessVia(useCaseOfPmmReport, {
    param: "reportId",
    orAllow: isStakeholderOfPmmReport,
  }),
  downloadReport,
);

// ============================================================================
// Admin Routes
// ============================================================================

// POST /pmm/cycles/:cycleId/reassign - Reassign stakeholder
router.post(
  "/cycles/:cycleId/reassign",
  authenticateJWT,
  authorize("postMarketMonitoring.edit"),
  cycleUseCase,
  reassignStakeholder,
);

// POST /pmm/projects/:projectId/start-cycle - Manually start new cycle
router.post(
  "/projects/:projectId/start-cycle",
  authenticateJWT,
  authorize("postMarketMonitoring.edit"),
  requireProjectAccess("projectId"),
  startNewCycle,
);

export default router;
