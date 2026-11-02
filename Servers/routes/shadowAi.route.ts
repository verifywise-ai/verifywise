import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  deleteApiKey,
} from "../controllers/shadowAiApiKey.ctrl";
import {
  validateCreateRule,
  validateCreateSyslogConfig,
  validateShadowAiIdParam,
  validateStartGovernance,
  validateUpdateRule,
  validateUpdateSettings,
  validateUpdateSyslogConfig,
  validateUpdateToolStatus,
} from "../middleware/validators/shadowAi.validator";
import {
  getInsightsSummary,
  getToolsByEvents,
  getToolsByUsers,
  getUsersByDepartment,
  getTrend,
  getUsers,
  getUserDetail,
  getDepartmentActivity,
  getTools,
  getToolById,
  updateToolStatus,
  startGovernance,
  getRules,
  createRule,
  updateRule,
  deleteRule,
  getAlertHistory,
  getSyslogConfigs,
  createSyslogConfig,
  updateSyslogConfig,
  deleteSyslogConfig,
  getSettings,
  updateSettings,
} from "../controllers/shadowAi.ctrl";

// ─── API Keys (Admin only) ─────────────────────────────────────────────
router.post("/api-keys", authenticateJWT, createApiKey);
router.get("/api-keys", authenticateJWT, listApiKeys);
router.delete("/api-keys/:id", authenticateJWT, revokeApiKey);
router.delete("/api-keys/:id/permanent", authenticateJWT, deleteApiKey);

// ─── Insights ───────────────────────────────────────────────────────────
router.get("/insights/summary", authenticateJWT, getInsightsSummary);
router.get("/insights/tools-by-events", authenticateJWT, getToolsByEvents);
router.get("/insights/tools-by-users", authenticateJWT, getToolsByUsers);
router.get("/insights/users-by-department", authenticateJWT, getUsersByDepartment);
router.get("/insights/trend", authenticateJWT, getTrend);

// ─── User Activity ──────────────────────────────────────────────────────
router.get("/users", authenticateJWT, getUsers);
router.get("/users/:email/activity", authenticateJWT, getUserDetail);
router.get("/departments", authenticateJWT, getDepartmentActivity);

// ─── Tools ──────────────────────────────────────────────────────────────
router.get("/tools", authenticateJWT, getTools);
router.get("/tools/:id", authenticateJWT, validateShadowAiIdParam, getToolById);
router.patch("/tools/:id/status", authenticateJWT, validateUpdateToolStatus, updateToolStatus);
router.post(
  "/tools/:id/start-governance",
  authenticateJWT,
  validateStartGovernance,
  startGovernance,
);

// ─── Rules ──────────────────────────────────────────────────────────────
router.get("/rules", authenticateJWT, getRules);
router.post("/rules", authenticateJWT, validateCreateRule, createRule);
router.patch("/rules/:id", authenticateJWT, validateUpdateRule, updateRule);
router.delete("/rules/:id", authenticateJWT, validateShadowAiIdParam, deleteRule);
router.get("/rules/alert-history", authenticateJWT, getAlertHistory);

// ─── Configuration ──────────────────────────────────────────────────────
router.get("/config/syslog", authenticateJWT, getSyslogConfigs);
router.post("/config/syslog", authenticateJWT, validateCreateSyslogConfig, createSyslogConfig);
router.patch("/config/syslog/:id", authenticateJWT, validateUpdateSyslogConfig, updateSyslogConfig);
router.delete("/config/syslog/:id", authenticateJWT, validateShadowAiIdParam, deleteSyslogConfig);

// ─── Settings (Rate Limiting & Data Retention) ─────────────────────────
router.get("/settings", authenticateJWT, getSettings);
router.patch("/settings", authenticateJWT, validateUpdateSettings, updateSettings);

export default router;
