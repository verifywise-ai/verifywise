import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import {
  assignModelTier,
  createFinding,
  createValidation,
  getFindings,
  getFleetTiering,
  getModelRoles,
  getValidations,
  setModelRoles,
  signoffValidation,
  updateFinding,
  updateValidation,
} from "../controllers/mrm.ctrl";
import {
  createIngestionToken,
  createMetricKey,
  createThreshold,
  deleteThreshold,
  getBreachHistory,
  getIngestionTokens,
  getMetricKeys,
  getMetricTrend,
  getModelMonitoring,
  getThresholds,
  revokeIngestionToken,
  rotateIngestionToken,
  updateThreshold,
} from "../controllers/mrmMonitoring.ctrl";
import {
  generateAttestationReportHandler,
  getAttestationSummaryHandler,
  getRevalidationEvents,
  requestRevalidation,
  runRevalidationSweepForOrg,
} from "../controllers/mrmRevalidation.ctrl";
import { getMrmSettingsHandler, updateMrmSettingsHandler } from "../controllers/mrmSettings.ctrl";

// --- Tiering ---
router.get("/tiering", authenticateJWT, getFleetTiering);
router.put("/models/:modelId/tier", authenticateJWT, assignModelTier);

// --- Validations ---
router.get("/validations", authenticateJWT, getValidations);
router.post("/models/:modelId/validations", authenticateJWT, createValidation);
router.patch("/validations/:id", authenticateJWT, updateValidation);
router.post("/validations/:id/signoff", authenticateJWT, signoffValidation);

// --- Findings ---
// Findings are audit records — there is intentionally NO hard-delete endpoint.
// A finding is raised, worked through its lifecycle, and reaches "closed
// (verified)" via PATCH; it always remains in the register for the audit trail.
router.get("/findings", authenticateJWT, getFindings);
router.post("/validations/:validationId/findings", authenticateJWT, createFinding);
router.patch("/findings/:id", authenticateJWT, updateFinding);

// --- Per-model roles ---
router.get("/models/:modelId/roles", authenticateJWT, getModelRoles);
router.put("/models/:modelId/roles", authenticateJWT, setModelRoles);

// ===========================================================================
// Branch 2 (monitoring) — JWT-authed management + read
// (The token-authed metric-push route lives in mrmIngestion.route.ts.)
// ===========================================================================

// --- Ingestion tokens (admin) ---
// Create returns the plaintext token ONCE; list never returns hashes/plaintext.
router.get("/ingestion-tokens", authenticateJWT, getIngestionTokens);
router.post("/ingestion-tokens", authenticateJWT, createIngestionToken);
router.post("/ingestion-tokens/:id/rotate", authenticateJWT, rotateIngestionToken);
router.post("/ingestion-tokens/:id/revoke", authenticateJWT, revokeIngestionToken);

// --- Thresholds (config — deletable, unlike findings) ---
router.get("/thresholds", authenticateJWT, getThresholds);
router.post("/models/:modelId/thresholds", authenticateJWT, createThreshold);
router.patch("/thresholds/:id", authenticateJWT, updateThreshold);
router.delete("/thresholds/:id", authenticateJWT, deleteThreshold);

// --- Metric-key catalogue ---
router.get("/metric-keys", authenticateJWT, getMetricKeys);
router.post("/metric-keys", authenticateJWT, createMetricKey);

// --- Monitoring read ---
router.get("/models/:modelId/monitoring", authenticateJWT, getModelMonitoring);
router.get("/models/:modelId/monitoring/trend", authenticateJWT, getMetricTrend);
router.get("/models/:modelId/monitoring/breaches", authenticateJWT, getBreachHistory);

// ===========================================================================
// Branch 3 (revalidation triggers + attestation) — JWT-authed
// ===========================================================================

// --- Revalidation triggers ---
// Explicit material-change trigger (the manual "request revalidation" action).
router.post("/models/:modelId/request-revalidation", authenticateJWT, requestRevalidation);
// Per-model revalidation-trigger firing history (append-only audit log).
router.get("/models/:modelId/revalidation-events", authenticateJWT, getRevalidationEvents);
// Run the due-date revalidation sweep on demand for this org (also runs daily via BullMQ).
router.post("/revalidation/sweep", authenticateJWT, runRevalidationSweepForOrg);

// --- Attestation / portfolio roll-up ---
router.get("/attestation/summary", authenticateJWT, getAttestationSummaryHandler);
router.get("/attestation/report", authenticateJWT, generateAttestationReportHandler);

// ===========================================================================
// Org-wide MRM settings (metric retention)
// ===========================================================================

// Missing row resolves to defaults (retention_months = 25); floor is 13 months.
router.get("/settings", authenticateJWT, getMrmSettingsHandler);
router.put("/settings", authenticateJWT, updateMrmSettingsHandler);

export default router;
